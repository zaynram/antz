// Pure tab configuration constants — no icon/component imports, so this stays
// cheap to pull into stores (e.g. app.ts) without dragging in lucide-svelte.

// Default primary tabs (in order). Media is on the bar by default.
export const DEFAULT_BOTTOM_TABS = ["home", "media", "notes", "places"]

// A sensible ceiling so the bar (plus the "More" button) stays tappable.
export const MAX_BOTTOM_TABS = 5
