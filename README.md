# Couples App

[![Deploy to Firebase Hosting](https://github.com/zaynram/antz/actions/workflows/firebase-deploy.yml/badge.svg)](https://github.com/zaynram/antz/actions/workflows/firebase-deploy.yml)

Relationship documentation app for Z & T. Serverless SPA with Firebase backend.

## Stack

- **Runtime:** Bun
- **Frontend:** Svelte 4 + Vite + TypeScript
- **Styling:** Tailwind CSS
- **Backend:** Firebase (Auth, Firestore, Hosting)
- **External APIs:** TMDB (movies/TV metadata)

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Configure Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your existing project (or create one)
3. Enable **Authentication** → Sign-in method → Google
4. Enable **Firestore Database** (start in test mode, we'll lock it down)
5. Go to Project Settings → General → Your apps → Add web app
6. Copy the config values to `src/lib/config.ts`

### 3. Configure TMDB (optional, for media search)

1. Create account at [TMDB](https://www.themoviedb.org/)
2. Go to Settings → API → Create API key
3. Add key to `src/lib/config.ts`

### 4. Install Firebase CLI & deploy rules

```bash
bun add -g firebase-tools
firebase login
firebase use YOUR_PROJECT_ID
firebase deploy --only firestore:rules
```

### 5. Run locally

```bash
bun dev
```

### 6. Deploy

#### Automated Deployment (Recommended)

The project is configured with GitHub Actions for automatic deployment:

- **Production Deployment**: Automatically deploys to Firebase Hosting when changes are pushed to the `main` branch
- **Preview Deployment**: Automatically creates preview deployments for pull requests

**Setup Required:**
1. Go to your Firebase project → Project Settings → Service Accounts
2. Click "Generate New Private Key" to download a service account JSON file
3. In your GitHub repository, go to Settings → Secrets and Variables → Actions
4. Create a new secret named `FIREBASE_SERVICE_ACCOUNT_ANTZ_ANTZ`
5. Paste the entire content of the service account JSON file as the secret value

Once configured, deployments will happen automatically on every push to `main`.

#### Manual Deployment

For local manual deployment (requires Firebase CLI authentication):

```bash
npm run deploy
# or with bun
bun run deploy
```

## Project Structure

```
src/
├── lib/
│   ├── components/
│   │   └── UserToggle.svelte    # Z/T identity switch
│   ├── pages/
│   │   ├── Home.svelte
│   │   ├── Login.svelte
│   │   ├── Media.svelte         # TV/Movies/Games tracking
│   │   ├── Notes.svelte         # Freeform notes
│   │   ├── Places.svelte        # POIs/Restaurants
│   │   └── Profiles.svelte      # Partner profiles (individual preferences)
│   ├── stores/
│   │   └── app.ts               # Svelte stores (auth, user prefs)
│   ├── config.ts                # Firebase + TMDB config
│   ├── firebase.ts              # Firebase SDK wrapper
│   └── types.ts                 # TypeScript interfaces
├── App.svelte                   # Root component + routing
├── app.css                      # Tailwind imports + CSS vars
└── main.ts                      # Entry point
```

## Data Model

### `/notes/{id}`
- `type`: "note"
- `title`: string
- `content`: string
- `tags`: string[]
- `createdBy`: "Z" | "T"
- `createdAt`: Timestamp

### `/media/{id}`
- `type`: "tv" | "movie" | "game"
- `title`: string
- `tmdbId`: number (for movies/TV)
- `posterPath`: string | null
- `status`: "queued" | "watching" | "completed" | "dropped"
- `rating`: number | null
- `notes`: string
- `progress`: { season, episode } (TV only)
- `createdBy`: "Z" | "T"

### `/places/{id}`
- `name`: string
- `category`: "restaurant" | "cafe" | "bar" | "attraction" | "park" | "other"
- `notes`: string
- `visited`: boolean
- `visitDates`: Timestamp[]
- `rating`: number | null
- `createdBy`: "Z" | "T"

### `/profiles/{id}`
- `category`: "food" | "drinks" | "music" | "movies" | "books" | "activities" | "scents" | "colors" | "people" | "places" | "gifts" | "other"
- `title`: string
- `description`: string
- `notes?: string` (optional)
- `rating?`: number (1-5 scale)
- `isFavorite`: boolean
- `createdBy`: "Z" | "T"

## User Preferences

Each identity (Z/T) has independent preferences stored in localStorage:
- `theme`: "light" | "dark"
- `accentColor`: hex string
- `name`: display name

Toggle between identities via the header switch. Preferences apply immediately.
