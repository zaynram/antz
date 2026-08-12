// Pure geometry helpers for the floating identity pill and its fly-out panel.
// Kept dependency-free so they can be unit-tested without a DOM.

export interface Point { x: number; y: number }
export interface Size { width: number; height: number }
export interface Viewport { width: number; height: number }

/**
 * Clamp a top-left position so a box of `size` stays fully within `vp`, keeping
 * at least `margin` px from every edge. When the box is larger than the space,
 * it pins to the top/left margin rather than going negative.
 */
export function clampPosition(pos: Point, size: Size, vp: Viewport, margin: number): Point {
  const maxX = Math.max(margin, vp.width - size.width - margin)
  const maxY = Math.max(margin, vp.height - size.height - margin)
  return {
    x: Math.min(Math.max(margin, pos.x), maxX),
    y: Math.min(Math.max(margin, pos.y), maxY),
  }
}

/**
 * Decide which way the fly-out panel should open so it stays on screen: it
 * opens toward the larger free space, i.e. leftward/upward when the pill sits
 * past the viewport midpoint on that axis.
 */
export function flyoutPlacement(pillCenter: Point, vp: Viewport): { openLeft: boolean; openUp: boolean } {
  return {
    openLeft: pillCenter.x > vp.width / 2,
    openUp: pillCenter.y > vp.height / 2,
  }
}

/** Center point of a box given its top-left position and size. */
export function centerOf(pos: Point, size: Size): Point {
  return { x: pos.x + size.width / 2, y: pos.y + size.height / 2 }
}
