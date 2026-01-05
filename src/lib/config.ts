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
    clientSecret: string
    apiKey: string
    redirectUri: string
    scopes: string[]
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

// YouTube Data API configuration
// Get from: https://console.cloud.google.com/apis/credentials
// Enable: YouTube Data API v3
// Create OAuth 2.0 Client ID for Web application
export const youtubeAPIConfig: YouTubeAPIConfig = {
    clientId: "", // Add your OAuth 2.0 Client ID here
    clientSecret: "", // Add your OAuth 2.0 Client Secret here (keep secure!)
    apiKey: "", // Add your API key here (for public data access)
    redirectUri: typeof window !== "undefined" ? `${window.location.origin}/oauth/youtube/callback` : "",
    scopes: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
}
