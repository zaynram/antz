import type { User } from "firebase/auth"
import { derived, get, readable, writable } from "svelte/store"
import {
    loadPreferencesFromFirestore,
    savePreferencesToFirestore,
    subscribeToPreferences,
} from "../firebase"
import type { UserId, UserPreferences, UserPreferencesMap } from "../types"

// Touch device detection store
// Uses pointer: coarse media query which is more reliable than touch event detection
export const isTouchDevice = readable(false, set => {
    if (typeof window === "undefined") return

    const mediaQuery = window.matchMedia("(pointer: coarse)")

    // Set initial value
    set(mediaQuery.matches)

    // Listen for changes (e.g., laptop with touchscreen switching modes)
    const handleChange = (e: MediaQueryListEvent) => {
        set(e.matches)
    }

    mediaQuery.addEventListener("change", handleChange)

    return () => {
        mediaQuery.removeEventListener("change", handleChange)
    }
})

const DEFAULT_PREFERENCES: UserPreferencesMap = {
    Z: {
        theme: "dark",
        accentColor: "#6366f1",
        name: "Z",
        unitSystem: "metric",
        locationMode: "off",
        searchRadius: 5000,
        lastUpdated: Date.now(),
    },
    T: {
        theme: "light",
        accentColor: "#ec4899",
        name: "T",
        unitSystem: "metric",
        locationMode: "off",
        searchRadius: 5000,
        lastUpdated: Date.now(),
    },
}

function createPersistedStore<T>(key: string, initial: T) {
    // Safely read from localStorage (handles private browsing mode)
    let value = initial
    try {
        const stored = localStorage.getItem(key)
        if (stored) {
            value = JSON.parse(stored) as T
        }
    } catch (e) {
        console.warn(`Failed to load ${key} from localStorage:`, e)
    }

    const store = writable<T>(value)

    store.subscribe(v => {
        try {
            localStorage.setItem(key, JSON.stringify(v))
        } catch (e) {
            console.warn(`Failed to save ${key} to localStorage:`, e)
        }
    })

    return store
}

export const activeUser = createPersistedStore<UserId>("activeUser", "Z")

export const userPreferences = createPersistedStore<UserPreferencesMap>(
    "userPreferences",
    DEFAULT_PREFERENCES
)

// Firestore sync for preferences
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null
let isRemoteUpdate = false
let unsubscribeFirestore: (() => void) | null = null
let unsubscribeLocalPrefs: (() => void) | null = null
let isSyncInitializing = false // Guard against concurrent init calls

// Merge preferences using last-write-wins based on timestamps
function mergePreferencesWithTimestamp(
    defaults: UserPreferences,
    local: UserPreferences | undefined,
    remote: UserPreferences | undefined
): UserPreferences {
    // Start with defaults
    let result = { ...defaults }

    // If only one source exists, use it
    if (!local && remote) return { ...result, ...remote }
    if (local && !remote) return { ...result, ...local }
    if (!local && !remote) return result

    // Both exist - use timestamps to determine which is newer
    const localTime = local?.lastUpdated || 0
    const remoteTime = remote?.lastUpdated || 0

    // Merge with the newer one winning
    if (remoteTime > localTime) {
        return { ...result, ...local, ...remote, lastUpdated: remoteTime }
    } else {
        return { ...result, ...remote, ...local, lastUpdated: localTime }
    }
}

// Shallow comparison for preferences (avoids expensive JSON.stringify)
function prefsEqual(a: UserPreferencesMap, b: UserPreferencesMap): boolean {
    const keysToCompare: (keyof UserPreferences)[] = [
        "theme",
        "accentColor",
        "name",
        "profilePicture",
        "unitSystem",
        "locationMode",
        "currentLocation",
        "referenceLocation",
        "searchRadius",
    ]

    for (const userId of ["Z", "T"] as const) {
        const aPrefs = a[userId]
        const bPrefs = b[userId]
        if (!aPrefs || !bPrefs) {
            if (aPrefs !== bPrefs) return false
            continue
        }
        for (const key of keysToCompare) {
            const aVal = aPrefs[key]
            const bVal = bPrefs[key]
            // Handle location objects specially
            if (key === "currentLocation" || key === "referenceLocation") {
                const aLoc = aVal as { lat: number; lng: number } | undefined
                const bLoc = bVal as { lat: number; lng: number } | undefined
                if (!aLoc && !bLoc) continue
                if (!aLoc || !bLoc) return false
                if (aLoc.lat !== bLoc.lat || aLoc.lng !== bLoc.lng) return false
            } else if (aVal !== bVal) {
                return false
            }
        }
    }
    return true
}

// Save with exponential backoff retry
async function saveWithRetry(prefs: UserPreferencesMap, retries = 3): Promise<void> {
    for (let i = 0; i < retries; i++) {
        try {
            await savePreferencesToFirestore(prefs)
            return
        } catch (err) {
            if (i === retries - 1) {
                // Final attempt failed, log and give up
                console.warn("Failed to sync preferences after retries:", err)
                return
            }
            // Exponential backoff: 1s, 2s, 4s
            await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
        }
    }
}

// Debounced save to Firestore with retry
function debouncedSaveToFirestore(prefs: UserPreferencesMap): void {
    if (isRemoteUpdate) return // Don't save if this was a remote update

    if (syncDebounceTimer) clearTimeout(syncDebounceTimer)
    syncDebounceTimer = setTimeout(() => {
        saveWithRetry(prefs)
    }, 1000) // 1 second debounce
}

// Immediate save (no debounce) for critical updates like profile pictures
export async function immediateSavePreferences(): Promise<void> {
    if (isRemoteUpdate) return

    const prefs = get(userPreferences)
    // Add timestamp to prevent stale writes
    const activeUserId = get(activeUser)
    prefs[activeUserId].lastUpdated = Date.now()

    await saveWithRetry(prefs)
}

// Initialize Firestore sync (call after auth)
export async function initPreferencesSync(): Promise<void> {
    // Prevent concurrent initialization
    if (isSyncInitializing) return
    isSyncInitializing = true

    // Clean up any existing subscriptions first to prevent duplicates on re-auth
    if (unsubscribeFirestore) {
        unsubscribeFirestore()
        unsubscribeFirestore = null
    }

    // Load initial preferences from Firestore
    try {
        const remotePrefs = await loadPreferencesFromFirestore()
        if (remotePrefs) {
            // Merge with local using last-write-wins based on timestamps
            const localPrefs = get(userPreferences)
            const merged: UserPreferencesMap = {
                Z: mergePreferencesWithTimestamp(
                    DEFAULT_PREFERENCES.Z,
                    localPrefs.Z,
                    remotePrefs.Z
                ),
                T: mergePreferencesWithTimestamp(
                    DEFAULT_PREFERENCES.T,
                    localPrefs.T,
                    remotePrefs.T
                ),
            }
            isRemoteUpdate = true
            userPreferences.set(merged)
            isRemoteUpdate = false
        } else {
            // No remote prefs yet, push local to Firestore
            const localPrefs = get(userPreferences)
            await savePreferencesToFirestore(localPrefs)
        }
    } catch (err) {
        console.warn("Failed to load preferences from Firestore:", err)
    }

    // Subscribe to remote changes
    unsubscribeFirestore = subscribeToPreferences(remotePrefs => {
        const localPrefs = get(userPreferences)
        // Only update if different (avoid loops) - use shallow comparison instead of JSON.stringify
        if (!prefsEqual(remotePrefs, localPrefs)) {
            isRemoteUpdate = true
            userPreferences.set({
                Z: mergePreferencesWithTimestamp(
                    DEFAULT_PREFERENCES.Z,
                    localPrefs.Z,
                    remotePrefs.Z
                ),
                T: mergePreferencesWithTimestamp(
                    DEFAULT_PREFERENCES.T,
                    localPrefs.T,
                    remotePrefs.T
                ),
            })
            isRemoteUpdate = false
        }
    })

    // Subscribe to local changes and sync to Firestore
    // Clean up any existing subscription first to prevent duplicates on re-auth
    if (unsubscribeLocalPrefs) {
        unsubscribeLocalPrefs()
    }
    unsubscribeLocalPrefs = userPreferences.subscribe(debouncedSaveToFirestore)

    isSyncInitializing = false
}

// Cleanup sync subscription
export function cleanupPreferencesSync(): void {
    if (unsubscribeFirestore) {
        unsubscribeFirestore()
        unsubscribeFirestore = null
    }
    if (unsubscribeLocalPrefs) {
        unsubscribeLocalPrefs()
        unsubscribeLocalPrefs = null
    }
    if (syncDebounceTimer) {
        clearTimeout(syncDebounceTimer)
        syncDebounceTimer = null
    }
}

export const currentPreferences = derived<
    [typeof activeUser, typeof userPreferences],
    UserPreferences
>([activeUser, userPreferences], ([$activeUser, $userPreferences]) => $userPreferences[$activeUser])

// Get display name for any user ID
export function getDisplayName(userId: UserId): string {
    const prefs = get(userPreferences)
    return prefs[userId]?.name || userId
}

// Reactive derived store for display names
export const displayNames = derived(userPreferences, $prefs => ({
    Z: $prefs.Z?.name || "Z",
    T: $prefs.T?.name || "T",
}))

// Reactive derived store for display abbreviations (first letter of name)
export const displayAbbreviations = derived(userPreferences, $prefs => ({
    Z: ($prefs.Z?.name || "Z").charAt(0).toUpperCase(),
    T: ($prefs.T?.name || "T").charAt(0).toUpperCase(),
}))

// Get the other user's ID
export function getOtherUserId(userId: UserId): UserId {
    return userId === "Z" ? "T" : "Z"
}

export const authUser = writable<User | null>(null)
export const authLoading = writable<boolean>(true)

// Search history store (stores last 5 searches)
const MAX_SEARCH_HISTORY = 5
export const mediaSearchHistory = createPersistedStore<string[]>("mediaSearchHistory", [])

// Media grid size preference
export type GridSize = "small" | "medium" | "large"
export const mediaGridSize = createPersistedStore<GridSize>("mediaGridSize", "medium")

export function addToSearchHistory(query: string): void {
    mediaSearchHistory.update(history => {
        const trimmedQuery = query.trim()
        if (!trimmedQuery) return history

        // Remove if already exists, then add to front
        const filtered = history.filter(h => h.toLowerCase() !== trimmedQuery.toLowerCase())
        const updated = [trimmedQuery, ...filtered].slice(0, MAX_SEARCH_HISTORY)
        return updated
    })
}

export function removeFromSearchHistory(query: string): void {
    mediaSearchHistory.update(history => history.filter(h => h !== query))
}

export function clearSearchHistory(): void {
    mediaSearchHistory.set([])
}
