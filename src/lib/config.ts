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
