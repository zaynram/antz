import { writable, derived, get } from 'svelte/store';
import type { User } from 'firebase/auth';
import type { UserId, UserPreferences, UserPreferencesMap } from '../types';
import { loadPreferencesFromFirestore, savePreferencesToFirestore, subscribeToPreferences } from '../firebase';

const DEFAULT_PREFERENCES: UserPreferencesMap = {
  Z: {
    theme: 'dark',
    accentColor: '#6366f1',
    name: 'Z',
    locationMode: 'off',
    searchRadius: 5000
  },
  T: {
    theme: 'light',
    accentColor: '#ec4899',
    name: 'T',
    locationMode: 'off',
    searchRadius: 5000
  }
};

function createPersistedStore<T>(key: string, initial: T) {
  const stored = localStorage.getItem(key);
  const value = stored ? (JSON.parse(stored) as T) : initial;
  const store = writable<T>(value);

  store.subscribe((v) => {
    localStorage.setItem(key, JSON.stringify(v));
  });

  return store;
}

export const activeUser = createPersistedStore<UserId>('activeUser', 'Z');

export const userPreferences = createPersistedStore<UserPreferencesMap>(
  'userPreferences',
  DEFAULT_PREFERENCES
);

// Firestore sync for preferences
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let isRemoteUpdate = false;
let unsubscribeFirestore: (() => void) | null = null;

// Debounced save to Firestore
function debouncedSaveToFirestore(prefs: UserPreferencesMap): void {
  if (isRemoteUpdate) return; // Don't save if this was a remote update

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    savePreferencesToFirestore(prefs).catch(err => {
      console.warn('Failed to sync preferences to Firestore:', err);
    });
  }, 1000); // 1 second debounce
}

// Initialize Firestore sync (call after auth)
export async function initPreferencesSync(): Promise<void> {
  // Load initial preferences from Firestore
  try {
    const remotePrefs = await loadPreferencesFromFirestore();
    if (remotePrefs) {
      // Merge with local - remote wins for each user's prefs
      const localPrefs = get(userPreferences);
      const merged: UserPreferencesMap = {
        Z: { ...DEFAULT_PREFERENCES.Z, ...localPrefs.Z, ...remotePrefs.Z },
        T: { ...DEFAULT_PREFERENCES.T, ...localPrefs.T, ...remotePrefs.T }
      };
      isRemoteUpdate = true;
      userPreferences.set(merged);
      isRemoteUpdate = false;
    } else {
      // No remote prefs yet, push local to Firestore
      const localPrefs = get(userPreferences);
      await savePreferencesToFirestore(localPrefs);
    }
  } catch (err) {
    console.warn('Failed to load preferences from Firestore:', err);
  }

  // Subscribe to remote changes
  unsubscribeFirestore = subscribeToPreferences((remotePrefs) => {
    const localPrefs = get(userPreferences);
    // Only update if different (avoid loops)
    if (JSON.stringify(remotePrefs) !== JSON.stringify(localPrefs)) {
      isRemoteUpdate = true;
      userPreferences.set({
        Z: { ...DEFAULT_PREFERENCES.Z, ...remotePrefs.Z },
        T: { ...DEFAULT_PREFERENCES.T, ...remotePrefs.T }
      });
      isRemoteUpdate = false;
    }
  });

  // Subscribe to local changes and sync to Firestore
  userPreferences.subscribe(debouncedSaveToFirestore);
}

// Cleanup sync subscription
export function cleanupPreferencesSync(): void {
  if (unsubscribeFirestore) {
    unsubscribeFirestore();
    unsubscribeFirestore = null;
  }
  if (syncDebounceTimer) {
    clearTimeout(syncDebounceTimer);
    syncDebounceTimer = null;
  }
}

export const currentPreferences = derived<
  [typeof activeUser, typeof userPreferences],
  UserPreferences
>([activeUser, userPreferences], ([$activeUser, $userPreferences]) => $userPreferences[$activeUser]);

// Get display name for any user ID
export function getDisplayName(userId: UserId): string {
  const prefs = get(userPreferences);
  return prefs[userId]?.name || userId;
}

// Reactive derived store for display names
export const displayNames = derived(
  userPreferences,
  ($prefs) => ({
    Z: $prefs.Z?.name || 'Z',
    T: $prefs.T?.name || 'T'
  })
);

// Get the other user's ID
export function getOtherUserId(userId: UserId): UserId {
  return userId === 'Z' ? 'T' : 'Z';
}

export const authUser = writable<User | null>(null);
export const authLoading = writable<boolean>(true);

// Search history store (stores last 5 searches)
const MAX_SEARCH_HISTORY = 5;
export const mediaSearchHistory = createPersistedStore<string[]>('mediaSearchHistory', []);

// Media grid size preference
export type GridSize = 'small' | 'medium' | 'large';
export const mediaGridSize = createPersistedStore<GridSize>('mediaGridSize', 'medium');

export function addToSearchHistory(query: string): void {
  mediaSearchHistory.update(history => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return history;
    
    // Remove if already exists, then add to front
    const filtered = history.filter(h => h.toLowerCase() !== trimmedQuery.toLowerCase());
    const updated = [trimmedQuery, ...filtered].slice(0, MAX_SEARCH_HISTORY);
    return updated;
  });
}

export function removeFromSearchHistory(query: string): void {
  mediaSearchHistory.update(history => 
    history.filter(h => h !== query)
  );
}

export function clearSearchHistory(): void {
  mediaSearchHistory.set([]);
}
