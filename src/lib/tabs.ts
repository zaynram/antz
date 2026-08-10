// Canonical registry of navigable destinations that can appear in the bottom
// tab bar. The bar is user-configurable: `bottomTabs` in preferences is an
// ordered list of these keys shown as primary tabs; everything else falls into
// the "More" sheet.

import type { ComponentType } from "svelte"
import { Home, Library, StickyNote, MapPin, Search, Video, Heart, Settings } from "lucide-svelte"
import { DEFAULT_BOTTOM_TABS, MAX_BOTTOM_TABS } from "./tabsConfig"

export { DEFAULT_BOTTOM_TABS, MAX_BOTTOM_TABS }

export interface TabDef {
    key: string
    label: string
    path: string
    icon: ComponentType
    matchPrefix?: string // active when the route starts with this (e.g. /library)
}

export const TAB_DEFS: TabDef[] = [
    { key: "home", label: "Home", path: "/", icon: Home },
    { key: "media", label: "Media", path: "/library/movies", icon: Library, matchPrefix: "/library" },
    { key: "notes", label: "Notes", path: "/notes", icon: StickyNote },
    { key: "places", label: "Places", path: "/places", icon: MapPin },
    { key: "search", label: "Search", path: "/search", icon: Search },
    { key: "videos", label: "Videos", path: "/videos", icon: Video },
    { key: "profiles", label: "Profiles", path: "/profiles", icon: Heart },
    { key: "settings", label: "Settings", path: "/settings", icon: Settings },
]

export function tabDef(key: string): TabDef | undefined {
    return TAB_DEFS.find(t => t.key === key)
}

/** Resolve a stored key list into valid, de-duplicated tab defs. */
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
    return out.slice(0, MAX_BOTTOM_TABS)
}
