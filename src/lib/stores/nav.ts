import { derived, writable } from "svelte/store"
import { currentPreferences } from "./app"
import type { NavMode, UserPreferences } from "../types"

export const currentRoute = writable<string>(
    typeof window !== "undefined" ? window.location.pathname : "/"
)

function defaultNavMode(): NavMode {
    if (typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches) {
        return "bottom-tabs"
    }
    return "sidebar"
}

// Derive navMode from the active user's preferences, falling back to device-appropriate default
export const navMode = derived<typeof currentPreferences, NavMode>(
    currentPreferences,
    ($prefs: UserPreferences | null) => $prefs?.navMode ?? defaultNavMode()
)

export function navigate(route: string): void {
    if (typeof window !== "undefined") {
        window.history.pushState({}, "", route)
    }
    currentRoute.set(route)
}

export function goBack(): void {
    if (typeof window !== "undefined") {
        window.history.back()
    }
}
