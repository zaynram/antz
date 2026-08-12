// Pure tab configuration constants — no icon/component imports, so this stays
// cheap to pull into stores (e.g. app.ts) without dragging in lucide-svelte.

// Default primary tabs (in order). Search moved into Media discovery and
// Profiles moved into the identity pill, leaving six first-class destinations.
export const DEFAULT_BOTTOM_TABS = ["home", "media", "notes", "places", "videos", "settings"]

// How many chosen tabs render in the bar before the rest spill into "More".
export const DEFAULT_MAX_TABS_SHOWN = 6

// Hard ceiling (equals the number of tab destinations).
export const MAX_TABS_SHOWN = 6
