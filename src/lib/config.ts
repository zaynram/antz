export interface FirebaseConfig {
    apiKey: string
    authDomain: string
    projectId: string
    storageBucket: string
    messagingSenderId: string
    appId: string
}

export interface TMDBConfig {
    apiKey: string
    baseUrl: string
    imageBaseUrl: string
}

export interface GoogleMapsConfig {
    apiKey: string
    placesApiUrl: string
}

export interface YouTubeAPIConfig {
    clientId: string
    scopes: string[]
}

export interface GitHubConfig {
    owner: string
    repo: string
    token?: string
}

// Replace these values with your Firebase project config
// Get from: Firebase Console > Project Settings > General > Your apps > Web app
export const firebaseConfig: FirebaseConfig = {
    apiKey: "AIzaSyDf-j6ePi3q9R48aRoFCpk50KGFiFCkBcY",
    authDomain: "antz-antz.firebaseapp.com",
    projectId: "antz-antz",
    storageBucket: "antz-antz.firebasestorage.app",
    messagingSenderId: "54919245814",
    appId: "1:54919245814:web:16d1414c58ef241644e1d7",
}
// TMDB API configuration
// Get from: https://www.themoviedb.org/settings/api
export const tmdbConfig: TMDBConfig = {
    apiKey: "f3f1217db98c8298c6baa058a2e79de0",
    baseUrl: "https://api.themoviedb.org/3",
    imageBaseUrl: "https://image.tmdb.org/t/p",
}

// Google Maps/Places API configuration
// Get from: https://console.cloud.google.com/apis/credentials
// Enable: Places API, Maps JavaScript API, Geocoding API
// Note: $200/month free credit covers typical usage
export const googleMapsConfig: GoogleMapsConfig = {
    apiKey: "", // Add your Google Maps API key here
    placesApiUrl: "https://maps.googleapis.com/maps/api/place",
}

// YouTube OAuth configuration
// Uses Google Identity Services for in-app OAuth flow
// Client ID is safe to embed in client-side code (public client)
// Get from: https://console.cloud.google.com/apis/credentials
// Enable: YouTube Data API v3
// Create OAuth 2.0 Client ID for Web application (JavaScript origins + redirect URIs)
export const youtubeAPIConfig: YouTubeAPIConfig = {
    clientId: "54919245814-lmhbib027sjf701os1gg39bknfht4fgt.apps.googleusercontent.com", // Add your OAuth 2.0 Client ID here (public client, safe to expose)
    scopes: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
}
// GitHub API configuration
// Get from: https://github.com/settings/tokens
// 
// IMPORTANT: config.ts is a public-facing file. All tokens here are created
// specifically for this application and expose no sensitive information.
// Any changes to config.ts will be flagged by GitHub and require manual bypass.
//
// Token requirements:
// - Use fine-grained personal access token (recommended) OR classic token
// - For fine-grained: Grant "Read and write" access to "Issues" for this repository only
// - For classic: Use minimal scope "public_repo" (for public repos) or "repo" (for private)
// - Fine-grained tokens provide better security by limiting access to just this repo
export const githubConfig: GitHubConfig = {
    owner: "zaynram",
    repo: "antz",
    token: "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",
}
