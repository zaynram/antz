// Placement maths for anchored pop-overs (menus attached to a button).
//
// Pure and dependency-free so the clamping rules can be unit-tested without a
// DOM. Callers pass real measurements and get back viewport-safe coordinates.

export interface Rect {
    left: number
    top: number
    width: number
    height: number
}

export interface Size {
    width: number
    height: number
}

export interface Viewport {
    width: number
    height: number
}

/** Space to keep clear of each viewport edge (safe-area insets included). */
export interface Insets {
    top: number
    right: number
    bottom: number
    left: number
}

export const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 }

export interface Placement {
    left: number
    top: number
    /** True when the menu was flipped above the anchor for lack of room below. */
    flipped: boolean
    /** Height the menu may occupy; caller should scroll beyond this. */
    maxHeight: number
}

/**
 * Position a menu against an anchor so it stays fully inside the viewport.
 *
 * Horizontally the menu prefers to align its right edge with the anchor's (the
 * usual look for a right-hand toolbar control) and slides back inside if that
 * would overflow. Vertically it opens below the anchor, flipping above when
 * there is more room there, and reports the height it is allowed to use.
 */
export function anchoredPosition(
    anchor: Rect,
    menu: Size,
    viewport: Viewport,
    gap = 8,
    insets: Insets = NO_INSETS,
): Placement {
    const minLeft = insets.left + gap
    const maxLeft = Math.max(minLeft, viewport.width - insets.right - gap - menu.width)
    const left = Math.min(Math.max(minLeft, anchor.left + anchor.width - menu.width), maxLeft)

    const spaceBelow = viewport.height - insets.bottom - gap - (anchor.top + anchor.height)
    const spaceAbove = anchor.top - insets.top - gap
    // Only flip when below genuinely can't hold it and above has more room.
    const flipped = menu.height > spaceBelow && spaceAbove > spaceBelow

    const maxHeight = Math.max(0, flipped ? spaceAbove : spaceBelow)
    const top = flipped
        ? Math.max(insets.top + gap, anchor.top - gap - Math.min(menu.height, maxHeight))
        : anchor.top + anchor.height + gap

    return { left, top, flipped, maxHeight }
}

/** Read the page's safe-area insets (notches, rounded corners, home bars). */
export function readSafeAreaInsets(): Insets {
    if (typeof window === "undefined" || typeof getComputedStyle === "undefined") return NO_INSETS
    const styles = getComputedStyle(document.documentElement)
    const read = (name: string): number => {
        const value = parseFloat(styles.getPropertyValue(name))
        return Number.isFinite(value) ? value : 0
    }
    return {
        top: read("--safe-top"),
        right: read("--safe-right"),
        bottom: read("--safe-bottom"),
        left: read("--safe-left"),
    }
}
