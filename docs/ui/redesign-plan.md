# Antz Redesign Plan

## Overview

This document outlines the design direction for a visual and structural redesign of the Antz app. The goal is to move from a generic utility-app aesthetic to something that feels genuinely personal, warm, and intimate — fitting for a couples' relationship documentation app.

---

## Design Diagnosis: What's Wrong Now

The current design is functional but generic. It looks like a SaaS dashboard rather than something made for two people. Specific issues:

1. **Navigation is buried** — The sidebar hamburger approach makes navigating between sections feel like work. Most of the time users are on mobile and tapping a hamburger to reach Notes or Places creates unnecessary friction.

2. **No personality** — The indigo/slate color palette with rounded cards is competent but cold. Nothing about the visual language signals "this is for us."

3. **Typography is flat** — Everything is the same weight and size. Headers don't feel like headers; content doesn't breathe.

4. **Cards everywhere** — Every page uses the same border + rounded-xl card pattern. The Notes corkboard was a smart departure but it's isolated.

5. **The identity switch is hidden** — Switching between Z and T is a tap in the sidebar. This is a core interaction that deserves a prominent, delightful home.

6. **Search as the home page is odd** — The app's soul is in the Library, Notes, and Places. Landing on a search page feels utilitarian.

---

## Design Direction

### Theme: "Scrapbook / Memory Box"

Lean into the personal nature of the app. Think of a physical memory box or a well-loved scrapbook — tactile textures, warm tones, personality in typography and iconography. Not skeuomorphic to a fault, but grounded in warmth.

**Mood:** Intimate, warm, slightly playful. Like a well-kept journal shared between two people.

### Visual Principles

1. **Warmth over polish** — Use warm neutrals (stone, sand, amber) instead of cold slate/gray.
2. **Hierarchy through contrast** — Bold display text for page titles, lighter body text, intentional use of color for accents.
3. **Surfaces that feel layered** — Cards feel like they sit on top of the background. The background has subtle texture or grain.
4. **Delight in the details** — Small moments of animation, color, or iconography that make the app feel alive.
5. **Identity-first** — The active user (Z or T) should color the experience; accent colors and identity persist visually.

---

## Navigation Redesign

### Current: Hamburger sidebar (mobile-unfriendly)

The current top bar has a hamburger (left) and search (right). The sidebar slides in from the left with all navigation.

### Proposed: Bottom tab bar + context header

**Bottom tab bar** (persistent, always visible):
```
[ Search ] [ Library ] [ Notes ] [ Places ] [ More ]
```

- 5 primary tabs visible at bottom (iOS/Android-style)
- "Library" expands to a sub-page with Movies / TV / Games tabs (no need for sidebar accordion)
- "More" reveals Videos, Profiles, Settings in a sheet or secondary nav
- Active tab highlighted with accent color + subtle fill

**Context header** (top, minimal):
```
[ App name / current page title ]     [ Z ↔ T toggle ]
```

- Left: Page title (changes as you navigate)
- Right: User identity toggle — a pill with Z and T, tapping switches active user with a smooth animation

This moves identity switching from the buried sidebar to always-visible, which matches how frequently it's used.

---

## Color System Redesign

### Current palette
- Background: `slate-50` / `slate-900`
- Surface: `#f8fafc` / `#1e293b`
- Border: `slate-200` / `slate-700`
- Accent: User-defined (default indigo `#6366f1`)

### Proposed warm palette

**Light mode:**
- Background: `stone-50` (`#fafaf9`) — barely-there warm white
- Surface: `white` (`#ffffff`) — cards pop off the background
- Surface-2: `stone-100` (`#f5f5f4`) — secondary surfaces
- Border: `stone-200` (`#e7e5e0`) — softer, warmer borders
- Text primary: `stone-900` (`#1c1917`)
- Text secondary: `stone-500` (`#78716c`)
- Text muted: `stone-400` (`#a8a29e`)

**Dark mode:**
- Background: `#18181b` (zinc-900, near-black with warmth)
- Surface: `#27272a` (zinc-800)
- Surface-2: `#3f3f46` (zinc-700)
- Border: `#52525b` (zinc-600)
- Text primary: `#fafafa` (zinc-50)
- Text secondary: `#a1a1aa` (zinc-400)
- Text muted: `#71717a` (zinc-500)

**Accent color system (unchanged):**
The per-user accent color system stays. Default accent changes from cold indigo to a warmer rose/pink for Z and a warm violet for T as the "out-of-box" experience.

---

## Typography Redesign

### Current: System sans-serif, flat hierarchy

### Proposed: Display + body contrast

**Display font:** A rounded, friendly sans-serif for page titles and major headers. Options:
- `Nunito` (rounded, warm) — Google Fonts, good PWA support
- `Plus Jakarta Sans` (clean but friendly)
- `DM Sans` (humanist, slightly quirky)

**Body font:** Slightly different weight of the same typeface, or a clean companion.

**Scale:**
```
Display (page headers): 28-32px, bold/extrabold
Title (section headers): 20-22px, semibold
Subtitle: 16px, medium
Body: 15px, regular
Caption: 13px, regular, muted color
```

---

## Page-by-Page Redesign

### Home / Landing

**Change:** Replace Search as the default landing page with a **Home/Dashboard** that shows:
- A warm greeting ("Good morning, Z 🌤") using time of day
- Recent activity cards (last note added, recently watched, recently visited place)
- Quick-add shortcuts (+ Note, + Place, + Media)
- "Now watching / reading / playing" section

Search moves to a dedicated tab.

### Library (Movies / TV / Games)

**Change:** Move from list-heavy layout to a more visual grid layout.
- Default view: poster grid (current grid exists but improve it)
- Status shown as a colored dot or ribbon on the poster
- Tap poster → detail sheet slides up from bottom (currently a centered modal)
- Better filter/sort UI: a persistent filter bar at top of list instead of a toggle panel

### Notes

The corkboard from the recent PR is a great direction. Expand on it:
- Refine the sticky note colors to use the warm palette
- Add a masonry/waterfall layout option for the archive view
- Add rich text support (bold, italic) in the note editor

### Places

**Change:** Add a map view option (even a simple one using a static map embed).
- List view (current) works fine, refine with warmer card styles
- Map view: pins on a map showing visited/unvisited places
- The "visited" status indicator should be more visual — a stamp-like overlay on the card

### Videos

**Change:** Rethink the layout to feel more like a personal YouTube playlist.
- Thumbnail-first layout (larger)
- Status badge (watched / queued) more prominent
- Better empty state

### Profiles

Keep the category-based structure, improve card design with more color and personality per category.

### Settings

**Change:** Group settings into logical sections with clear visual hierarchy. Currently feels like a flat list. Use section headers and inset cards.

---

## Component Redesign

### Cards

**Current:** `border border-slate-200 dark:border-slate-700 rounded-xl`

**Proposed:** Drop the border, use shadow + warm background instead:
```css
.card {
  background: white; /* or zinc-800 in dark */
  border-radius: 16px;
  box-shadow: 0 1px 4px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04);
}
```

The shadow approach makes cards feel physically elevated over the background. Combined with a slightly warm background, this reads as "layered" rather than "bordered boxes."

### Buttons

Primary buttons: rounder (`rounded-full` for pill shape) for the warmer aesthetic.

Secondary/ghost buttons: keep `rounded-xl`.

### Bottom sheet / modals

Replace centered dialog modals with bottom sheets for detail views on mobile. More native-feeling on iOS/Android.

Pattern:
```svelte
<div class="fixed inset-x-0 bottom-0 z-50 bg-surface rounded-t-3xl shadow-2xl
            max-h-[90vh] overflow-y-auto pb-[env(safe-area-inset-bottom)]">
  <!-- drag handle -->
  <div class="w-10 h-1 bg-stone-200 dark:bg-zinc-700 rounded-full mx-auto mt-3 mb-4"></div>
  <!-- content -->
</div>
```

### User identity toggle

**Current:** Button inside sidebar that says "Tap to switch user"

**Proposed:** Pill in the header:
```
  [ Z | T ]   ← pill with the active user highlighted
```

Tapping the pill toggles with a spring animation. The pill bg is the active user's accent color.

---

## Animation & Motion

### Principles
- Use motion to signal state change, not to decorate
- Keep animations under 300ms for interactions
- Use spring physics for "physical" elements (sheets, toggles)

### Key animations to add
1. **Tab switch** — The bottom bar active indicator slides smoothly between tabs
2. **User toggle** — The identity pill slides the highlight from Z to T
3. **Bottom sheet** — Slides up from bottom with spring easing
4. **Note creation** — Note "falls" onto the corkboard
5. **Page transitions** — Subtle fade (opacity only, no slide) between main pages

---

## Accessibility

All redesign changes must maintain:
- WCAG AA contrast ratios (4.5:1 for normal text, 3:1 for large text)
- Minimum 44px touch targets
- Keyboard navigability
- Screen reader labels on all interactive elements

The warm stone palette should be checked against contrast requirements. Stone-500 on stone-50 background may not meet AA — use stone-600 or stone-700 for body text where needed.

---

## Implementation Phases

### Phase 1 — Foundation (do first)
- [ ] Update CSS variables in `app.css` to warm palette (stone/zinc)
- [ ] Add font import (Nunito or Plus Jakarta Sans)
- [ ] Update base typography scale
- [ ] Update card shadow style (drop border-only approach)
- [ ] Update button border-radius to pill for primary

### Phase 2 — Navigation
- [ ] Build bottom tab bar component
- [ ] Build context header with user toggle pill
- [ ] Remove hamburger sidebar (archive or repurpose for "More" sheet)
- [ ] Update routing to work with tab bar navigation

### Phase 3 — Page Redesigns
- [ ] Add Home/Dashboard landing page
- [ ] Redesign Library with improved grid + bottom sheet detail
- [ ] Refine Notes corkboard with warm palette
- [ ] Redesign Places with stamp-style visited indicator
- [ ] Refine Videos page layout
- [ ] Refine Profiles page

### Phase 4 — Polish
- [ ] Tab bar slide animation
- [ ] User toggle spring animation
- [ ] Bottom sheet component with drag-to-close
- [ ] Review all pages for consistent typography hierarchy
- [ ] Accessibility audit with new palette

---

## Open Questions (for human review)

1. **Font:** Which font direction — Nunito (very rounded/cute) vs Plus Jakarta Sans (more refined) vs keeping system font?
2. **Home page:** Should the landing page be a dashboard/home or stay as search? The search-first approach might be intentional.
3. **Sidebar:** Fully remove in favor of bottom tabs + header? Or keep sidebar for desktop/tablet and add bottom tabs for mobile only?
4. **Bottom sheets vs modals:** Are bottom sheets the right call for all detail views, or only on mobile?
5. **Default accent colors:** Change the default Z/T accent colors to something warmer (rose, violet) or keep user-defined as-is?
