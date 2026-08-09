# Antz Redesign Specification (Draft v0.1)

## Status

Draft starter spec based on `docs/ui/redesign-plan.md`.

---

## 1. Problem Statement

The current app is functional but feels generic, navigation is high-friction on mobile, and core identity/personal context is underrepresented in the UI.

---

## 2. Goals

1. Ship a warmer, more personal visual language.
2. Reduce mobile navigation friction.
3. Keep identity switching discoverable but non-intrusive.
4. Establish consistent component and motion patterns across pages.
5. Preserve existing data model and core app capabilities.

## 3. Non-Goals (for this redesign phase)

1. Re-architect Firebase data structures.
2. Replace manual routing with a third-party router.
3. Add major new backend dependencies.

---

## 4. Confirmed Product Decisions

1. **Landing page:** Default route becomes a Home/Dashboard.
2. **Navigation options:** Sidebar and bottom-tab navigation are both supported as a user-toggleable setting.
3. **Bottom tabs:** Must be fully removable via settings.
4. **Detail surface model:** Bottom sheets are mobile-only.
5. **Defaults:** Use warmer default accent colors for Z/T.
6. **Typography preference:** Font direction is configurable in Settings.
7. **Identity switch behavior:** Discoverable but discreet, with an on-demand pill (optionally via small floating trigger).

---

## 5. Information Architecture

### Primary Routes

- `/` → Home (new landing)
- `/library/movies`
- `/library/tv`
- `/library/games`
- `/notes`
- `/places`
- `/videos`
- `/profiles`
- `/settings`

### Navigation Modes

1. **Bottom tabs mode (mobile-first):**
   - Tabs: Search, Library, Notes, Places, More
   - More entry exposes Videos, Profiles, Settings
2. **Sidebar mode:**
   - Existing sidebar-based nav remains available
3. **Settings toggle:**
   - Users can switch nav mode
   - Users can disable bottom tabs entirely

---

## 6. Experience Requirements

### 6.1 Visual System

- Base palette shifts from slate to warm stone/zinc surfaces.
- Card style prioritizes layered surfaces and softer shadows over border-heavy cards.
- Accent remains user-driven but defaults become warmer.

### 6.2 Typography

- Two style presets available in Settings:
  - Warm rounded direction
  - Refined/system-lean direction
- Maintain clear display/title/body/caption hierarchy.

### 6.3 Home/Dashboard

Must include:
1. Time-aware greeting.
2. Recent activity summary (notes/media/places).
3. Quick-add shortcuts for core content types.
4. Current in-progress section (watching/reading/playing).

### 6.4 Identity Switching

- Entry point appears in header context area.
- Interaction should be low-noise and not persist as an intrusive control.
- Z/T switch control opens on demand and animates state change clearly.

### 6.5 Modal/Sheet Strategy

- **Mobile:** detail views use bottom sheets.
- **Non-mobile:** retain modal/dialog pattern unless a page-specific exception is defined.

---

## 7. Accessibility & Usability Requirements

1. WCAG AA contrast thresholds remain required.
2. 44px minimum touch targets for interactive controls.
3. Keyboard and screen-reader support must remain intact for nav, sheets, toggles, and forms.
4. Reduced-motion users must receive motion-safe behavior.

---

## 8. Performance Requirements

1. Avoid regressions in perceived navigation speed.
2. Preserve existing debouncing/race-condition safeguards for async UI flows.
3. Keep animations short and interaction-focused (generally under 300ms).

---

## 9. Rollout Plan (Spec-Level)

1. **Foundation:** palette, typography presets, card/button primitives.
2. **Navigation:** nav mode setting, bottom tabs option, header identity entrypoint.
3. **Home:** dashboard route and widgets.
4. **Page passes:** Library, Notes, Places, Videos, Profiles visual and interaction updates.
5. **Polish:** motion consistency, final accessibility and responsiveness checks.

---

## 10. Acceptance Criteria (Initial Draft)

1. Home dashboard is the default landing page.
2. Users can switch between sidebar and bottom-tab navigation in Settings.
3. Bottom tabs can be fully removed by user preference.
4. Mobile detail flows use bottom sheets with safe-area bottom padding.
5. Identity switch remains easy to find but visually discreet.
6. Typography preset is user-configurable.
7. No regressions in core flows: add/edit/delete media, notes, places, videos, profiles.

---

## 11. Risks / Follow-ups

1. Need final UI decision on exact identity switch trigger pattern (header chip vs floating trigger fallback).
2. Need final token definitions for warm palette in `src/app.css`.
3. Need explicit behavior spec for tablet breakpoints when both nav systems are available.

---

## 12. Next Spec Iteration

The next draft should add:
1. Page-by-page wire-level requirements.
2. Interaction edge cases and empty/error state behavior.
3. Test matrix tied to each acceptance criterion.
