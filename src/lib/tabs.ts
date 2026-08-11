// Canonical registry of navigable destinations that can appear in the bottom
// tab bar. The bar is user-configurable: `bottomTabs` in preferences is an
// ordered list of these keys; the first `maxTabsShown` render in the bar and
// any remainder (plus unchosen destinations) spill into the "More" sheet.

import type { ComponentType } from "svelte"
import { Home, Library, StickyNote, MapPin, Video, Settings } from "lucide-svelte"
import { DEFAULT_BOTTOM_TABS, DEFAULT_MAX_TABS_SHOWN, MAX_TABS_SHOWN } from "./tabsConfig"

export { DEFAULT_BOTTOM_TABS, DEFAULT_MAX_TABS_SHOWN, MAX_TABS_SHOWN }

export interface TabDef {
    key: string
    label: string
    path: string
    icon: ComponentType
    matchPrefix?: string // active when the route starts with this (e.g. /library)
}

// Search folded into Media discovery; Profiles moved into the identity pill.
export const TAB_DEFS: TabDef[] = [
    { key: "home", label: "Home", path: "/", icon: Home },
    { key: "media", label: "Media", path: "/library/movies", icon: Library, matchPrefix: "/library" },
    { key: "notes", label: "Notes", path: "/notes", icon: StickyNote },
    { key: "places", label: "Places", path: "/places", icon: MapPin },
    { key: "videos", label: "Videos", path: "/videos", icon: Video },
    { key: "settings", label: "Settings", path: "/settings", icon: Settings },
]

export function tabDef(key: string): TabDef | undefined {
    return TAB_DEFS.find(t => t.key === key)
}

/** Resolve a stored key list into valid, de-duplicated tab defs (full chosen set). */
export function resolveTabs(keys: string[] | undefined): TabDef[] {
    const source = keys && keys.length > 0 ? keys : DEFAULT_BOTTOM_TABS
    const seen = new Set<string>()
    const out: TabDef[] = []
    for (const key of source) {
        if (seen.has(key)) continue
        const def = tabDef(key)
        if (def) {
            out.push(def)
            seen.add(key)
        }
    }
    return out
}

export function clampMaxTabsShown(n: number | undefined): number {
    const v = Math.round(n ?? DEFAULT_MAX_TABS_SHOWN)
    return Math.min(MAX_TABS_SHOWN, Math.max(2, v))
}
