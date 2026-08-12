// Place category configuration: labels, icons, pin colors, default visited
// semantics, and a mapping from OpenStreetMap/Nominatim class/type metadata.

import type { ComponentType } from "svelte"
import {
    UtensilsCrossed, Coffee, Wine, Sparkles, Trees, BedDouble, ShoppingBag,
    Landmark, Waves, Mountain, Ticket, MapPin,
} from "lucide-svelte"
import type { Place, PlaceCategory } from "./types"

export interface CategoryDef {
    key: PlaceCategory
    label: string
    icon: ComponentType
    // Emoji used for map pins (Leaflet divIcons render outside Svelte, so an
    // emoji is more reliable there than a component icon).
    emoji: string
    color: string
    // Default visited semantics: true = revisit-likely (show visit count),
    // false = one-and-done (show a "visited" completion state).
    revisitDefault: boolean
}

export const CATEGORY_DEFS: CategoryDef[] = [
    { key: "restaurant", label: "Restaurant", icon: UtensilsCrossed, emoji: "🍽️", color: "#ef4444", revisitDefault: true },
    { key: "cafe", label: "Cafe", icon: Coffee, emoji: "☕", color: "#b45309", revisitDefault: true },
    { key: "bar", label: "Bar", icon: Wine, emoji: "🍷", color: "#7c3aed", revisitDefault: true },
    { key: "park", label: "Park", icon: Trees, emoji: "🌳", color: "#16a34a", revisitDefault: true },
    { key: "shop", label: "Shop", icon: ShoppingBag, emoji: "🛍️", color: "#db2777", revisitDefault: true },
    { key: "entertainment", label: "Entertainment", icon: Ticket, emoji: "🎟️", color: "#e11d48", revisitDefault: true },
    { key: "beach", label: "Beach", icon: Waves, emoji: "🏖️", color: "#0891b2", revisitDefault: true },
    { key: "attraction", label: "Attraction", icon: Sparkles, emoji: "✨", color: "#f59e0b", revisitDefault: false },
    { key: "museum", label: "Museum", icon: Landmark, emoji: "🏛️", color: "#0d9488", revisitDefault: false },
    { key: "hotel", label: "Hotel / Resort", icon: BedDouble, emoji: "🏨", color: "#2563eb", revisitDefault: false },
    { key: "viewpoint", label: "Viewpoint", icon: Mountain, emoji: "⛰️", color: "#65a30d", revisitDefault: false },
    { key: "other", label: "Other", icon: MapPin, emoji: "📍", color: "#64748b", revisitDefault: true },
]

// Stable category ordering for filter chips and selects.
export const CATEGORY_KEYS: PlaceCategory[] = CATEGORY_DEFS.map(d => d.key)

const BY_KEY: Record<string, CategoryDef> = Object.fromEntries(CATEGORY_DEFS.map(d => [d.key, d]))

export function categoryDef(key: PlaceCategory | string | undefined): CategoryDef {
    return BY_KEY[key ?? "other"] ?? BY_KEY.other
}

/** Should this place be treated as revisit-likely (vs one-and-done)? */
export function isRevisitable(place: Pick<Place, "category" | "revisitable">): boolean {
    return place.revisitable ?? categoryDef(place.category).revisitDefault
}

/** Best-effort mapping from Nominatim class/type to one of our categories. */
export function categoryFromOSM(osmClass?: string, osmType?: string): PlaceCategory {
    const c = (osmClass ?? "").toLowerCase()
    const t = (osmType ?? "").toLowerCase()
    if (t === "restaurant" || t === "fast_food" || t === "food_court") return "restaurant"
    if (t === "cafe" || t === "coffee_shop" || t === "ice_cream") return "cafe"
    if (t === "bar" || t === "pub" || t === "nightclub" || t === "biergarten") return "bar"
    if (t === "hotel" || t === "motel" || t === "guest_house" || t === "hostel" || t === "resort") return "hotel"
    if (t === "museum" || t === "gallery" || t === "artwork") return "museum"
    if (t === "viewpoint" || t === "peak" || t === "cliff") return "viewpoint"
    if (t === "beach" || t === "beach_resort") return "beach"
    if (t === "cinema" || t === "theatre" || t === "arts_centre" || t === "amusement_arcade") return "entertainment"
    if (t === "theme_park" || t === "zoo" || t === "attraction" || t === "aquarium") return "attraction"
    if (c === "shop") return "shop"
    if (c === "leisure" && (t === "park" || t === "garden" || t === "nature_reserve")) return "park"
    if (c === "tourism") return "attraction"
    if (c === "natural") return "viewpoint"
    if (c === "amenity" && (t === "marketplace")) return "shop"
    return "other"
}

// A curated Nominatim free-text query per category, for the discovery "reroll".
export const CATEGORY_QUERY: Record<PlaceCategory, string> = {
    restaurant: "restaurant",
    cafe: "cafe",
    bar: "bar",
    park: "park",
    shop: "shop",
    entertainment: "cinema",
    beach: "beach",
    attraction: "tourist attraction",
    museum: "museum",
    hotel: "hotel",
    viewpoint: "viewpoint",
    other: "point of interest",
}
