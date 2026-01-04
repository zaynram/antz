# Documentation

Technical documentation for the Antz PWA codebase.

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System overview, directory structure, core patterns |
| [Components](./components.md) | UI component library and usage examples |
| [Data Models](./data-models.md) | Firestore schema and TypeScript types |
| [State Management](./state-management.md) | Svelte stores, runes, and reactivity patterns |
| [API Integrations](./api-integrations.md) | External APIs (TMDB, Wikipedia, Google Places) |
| [Testing](./testing.md) | Test setup, patterns, and best practices |
| [Patterns](./patterns.md) | Identified code patterns and conventions |
| [Design System](./ui/design-system.md) | Visual design, spacing, colors, components |

## Getting Started

1. **New to the codebase?** Start with [Architecture](./architecture.md)
2. **Building UI?** See [Components](./components.md) and [Design System](./ui/design-system.md)
3. **Working with data?** See [Data Models](./data-models.md) and [State Management](./state-management.md)
4. **Writing tests?** See [Testing](./testing.md)

## Key Concepts

### Dual-User System
The app supports exactly two users (Z and T) with:
- Independent preferences (theme, color, location settings)
- Shared data (media, notes, places)
- Per-user ratings on shared items

### Real-Time Sync
All data uses Firestore real-time subscriptions for:
- Multi-device sync
- Collaborative updates
- Offline support

### PWA First
Designed as a Progressive Web App with:
- Offline caching
- iOS Safari PWA quirks handled
- Touch-first interactions

## Tech Stack Summary

```
Svelte 5 + TypeScript + Vite
     ↓
Tailwind CSS 4
     ↓
Firebase (Auth, Firestore, Storage, Hosting)
     ↓
Vitest + Testing Library
```
