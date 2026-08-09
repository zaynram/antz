// Small, dependency-free color utilities used to derive per-identity sticky
// note palettes and readable ink colors from a user's accent color.

export interface HSL {
    h: number // 0..360
    s: number // 0..100
    l: number // 0..100
}

export interface RGB {
    r: number // 0..255
    g: number
    b: number
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** Normalize a hex string to "#rrggbb" (lowercase). Returns null if invalid. */
export function normalizeHex(hex: string): string | null {
    if (typeof hex !== "string") return null
    let h = hex.trim().replace(/^#/, "")
    if (h.length === 3) {
        h = h
            .split("")
            .map(c => c + c)
            .join("")
    }
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null
    return "#" + h.toLowerCase()
}

export function hexToRgb(hex: string): RGB {
    const normalized = normalizeHex(hex) ?? "#000000"
    const int = parseInt(normalized.slice(1), 16)
    return {
        r: (int >> 16) & 0xff,
        g: (int >> 8) & 0xff,
        b: int & 0xff,
    }
}

export function rgbToHex({ r, g, b }: RGB): string {
    const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function hexToHsl(hex: string): HSL {
    const { r, g, b } = hexToRgb(hex)
    const rr = r / 255
    const gg = g / 255
    const bb = b / 255
    const max = Math.max(rr, gg, bb)
    const min = Math.min(rr, gg, bb)
    const delta = max - min
    let h = 0
    if (delta !== 0) {
        if (max === rr) h = ((gg - bb) / delta) % 6
        else if (max === gg) h = (bb - rr) / delta + 2
        else h = (rr - gg) / delta + 4
        h *= 60
        if (h < 0) h += 360
    }
    const l = (max + min) / 2
    const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
    return { h, s: s * 100, l: l * 100 }
}

export function hslToHex({ h, s, l }: HSL): string {
    const hue = ((h % 360) + 360) % 360
    const sat = clamp(s, 0, 100) / 100
    const lum = clamp(l, 0, 100) / 100
    const c = (1 - Math.abs(2 * lum - 1)) * sat
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
    const m = lum - c / 2
    let r = 0
    let g = 0
    let b = 0
    if (hue < 60) [r, g, b] = [c, x, 0]
    else if (hue < 120) [r, g, b] = [x, c, 0]
    else if (hue < 180) [r, g, b] = [0, c, x]
    else if (hue < 240) [r, g, b] = [0, x, c]
    else if (hue < 300) [r, g, b] = [x, 0, c]
    else [r, g, b] = [c, 0, x]
    return rgbToHex({ r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 })
}

/** WCAG relative luminance (0..1). */
export function relativeLuminance(hex: string): number {
    const { r, g, b } = hexToRgb(hex)
    const channel = (v: number) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
    }
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** Pick a legible ink color (near-black or near-white) for a given background. */
export function readableInk(bgHex: string, darkInk = "#1c1917", lightInk = "#fafaf9"): string {
    return relativeLuminance(bgHex) > 0.45 ? darkInk : lightInk
}

export function shiftHue(hex: string, degrees: number): string {
    const hsl = hexToHsl(hex)
    return hslToHex({ ...hsl, h: hsl.h + degrees })
}

export function withHsl(hex: string, patch: Partial<HSL>): string {
    return hslToHex({ ...hexToHsl(hex), ...patch })
}

/** Smallest absolute distance between two hues, in degrees (0..180). */
export function hueDistance(a: number, b: number): number {
    const d = Math.abs(((a - b) % 360 + 360) % 360)
    return d > 180 ? 360 - d : d
}
