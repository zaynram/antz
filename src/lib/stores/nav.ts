import { derived, writable } from "svelte/store"
import { currentPreferences } from "./app"
import type { NavMode } from "../types"

export const currentRoute = writable<string>(
    typeof window !== "undefined" ? window.location.pathname : "/"
)

// Derive navMode from the active user's preferences, falling back to "bottom-tabs"
export const navMode = derived<typeof currentPreferences, NavMode>(
    currentPreferences,
    $prefs => $prefs?.navMode ?? "bottom-tabs"
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
