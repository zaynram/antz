import { derived, writable } from "svelte/store"
import { currentPreferences } from "./app"
import type { NavMode, UserPreferences } from "../types"

function currentLocation(): string {
    if (typeof window === "undefined") return "/"
    return window.location.pathname + window.location.search
}

// Full location string, including any query params (e.g. "/notes?add=1").
export const currentRoute = writable<string>(currentLocation())

// Pathname only, with the query string stripped. Route matching should always
// use this so that intent params like "?add=1" don't cause a 404.
export const currentPath = derived(currentRoute, ($route: string) => $route.split("?")[0])

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

// Read a query param, then strip it from the URL (via replaceState so no extra
// history entry is created). Pages use this in onMount to act on navigation
// intents such as "?add=1" / "?discover=1" and then clean up the address bar.
export function consumeQueryParam(key: string): string | null {
    if (typeof window === "undefined") return null
    const url = new URL(window.location.href)
    const value = url.searchParams.get(key)
    if (value !== null) {
        url.searchParams.delete(key)
        const cleaned = url.pathname + (url.search ? url.search : "")
        window.history.replaceState({}, "", cleaned)
        currentRoute.set(cleaned)
    }
    return value
}
