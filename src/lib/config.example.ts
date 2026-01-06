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

export interface GitHubConfig {
    owner: string
    repo: string
    token?: string
}

// Replace these values with your Firebase project config
// Get from: Firebase Console > Project Settings > General > Your apps > Web app
export const firebaseConfig: FirebaseConfig = {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID",
}
// TMDB API configuration
// Get from: https://www.themoviedb.org/settings/api
export const tmdbConfig: TMDBConfig = {
    apiKey: "YOUR_TMDB_API_KEY",
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
    owner: "YOUR_GITHUB_USERNAME",
    repo: "YOUR_REPO_NAME",
    token: "YOUR_GITHUB_TOKEN", // Optional: Your GitHub personal access token
}
