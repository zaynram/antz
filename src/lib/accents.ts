// Curated accent palette, harmonized with the warm stone / zinc neutral
// palette introduced in the v0.2 redesign. Each swatch sits at roughly the
// 600 tonal level so white text stays legible on it (btn-primary, avatars,
// pills all render white-on-accent).
export const ACCENT_PRESETS = [
    "#e11d48", // rose
    "#db2777", // pink
    "#c026d3", // fuchsia
    "#7c3aed", // violet
    "#4f46e5", // indigo
    "#0d9488", // teal
    "#059669", // emerald
    "#d97706", // amber
] as const

// Per-identity defaults: a complementary rose / violet pairing for Z & T.
export const DEFAULT_ACCENT_Z = "#e11d48" // rose
export const DEFAULT_ACCENT_T = "#7c3aed" // violet

// Fallback accent used wherever a preference hasn't loaded yet. Keep this in
// sync with `--color-accent` in app.css.
export const DEFAULT_ACCENT = DEFAULT_ACCENT_Z
