import { initializeApp } from "firebase/app"
import {
    getAuth,
    GoogleAuthProvider,
    onAuthStateChanged,
    signInWithPopup,
    signOut,
    type User,
} from "firebase/auth"
import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getFirestore,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    type DocumentData,
} from "firebase/firestore"
import { getStorage } from "firebase/storage"
import { firebaseConfig } from "./config"
import type { UserId, UserPreferencesMap } from "./types"

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

const googleProvider = new GoogleAuthProvider()
// Add Google Drive API scopes for file storage
googleProvider.addScope("https://www.googleapis.com/auth/drive.file")

export async function signInWithGoogle(): Promise<void> {
    const result = await signInWithPopup(auth, googleProvider)

    // Store the Google access token for Drive API access
    const credential = GoogleAuthProvider.credentialFromResult(result)
    if (credential?.accessToken) {
        sessionStorage.setItem("google_access_token", credential.accessToken)
    }
}

export async function logOut(): Promise<void> {
    sessionStorage.removeItem("google_access_token")
    await signOut(auth)
}

export function onAuthChange(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, callback)
}

export function subscribeToCollection<T extends DocumentData>(
    collectionName: string,
    callback: (items: T[]) => void,
    orderByField: string = "createdAt"
): () => void {
    const q = query(collection(db, collectionName), orderBy(orderByField, "desc"))
    return onSnapshot(q, snapshot => {
        const items = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        })) as unknown as T[]
        callback(items)
    })
}

export async function addDocument<T extends DocumentData>(
    collectionName: string,
    data: Omit<T, "id" | "createdAt" | "updatedAt" | "createdBy">,
    activeUser: UserId
): Promise<string> {
    const docRef = doc(collection(db, collectionName))
    await setDoc(docRef, {
        ...data,
        createdBy: activeUser,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
    })
    return docRef.id
}

export async function updateDocument<T extends DocumentData>(
    collectionName: string,
    docId: string,
    data: Partial<T>,
    activeUser: UserId
): Promise<void> {
    const docRef = doc(db, collectionName, docId)
    await updateDoc(docRef, {
        ...data,
        updatedBy: activeUser,
        updatedAt: serverTimestamp(),
    })
}

export async function deleteDocument(collectionName: string, docId: string): Promise<void> {
    await deleteDoc(doc(db, collectionName, docId))
}

// Storage functions for profile pictures (using Google Drive)
export { deleteProfilePicture, uploadProfilePicture } from "./drive"

// Preferences sync functions
const PREFERENCES_DOC = "preferences/shared"

export async function savePreferencesToFirestore(prefs: UserPreferencesMap): Promise<void> {
    const docRef = doc(db, PREFERENCES_DOC)
    await setDoc(docRef, {
        ...prefs,
        updatedAt: serverTimestamp(),
    })
}

export async function loadPreferencesFromFirestore(): Promise<UserPreferencesMap | null> {
    const docRef = doc(db, PREFERENCES_DOC)
    const snapshot = await getDoc(docRef)
    if (snapshot.exists()) {
        const data = snapshot.data()
        // Remove metadata fields before returning
        const { updatedAt: _, ...prefs } = data
        return prefs as UserPreferencesMap
    }
    return null
}

export function subscribeToPreferences(callback: (prefs: UserPreferencesMap) => void): () => void {
    const docRef = doc(db, PREFERENCES_DOC)
    return onSnapshot(docRef, snapshot => {
        if (snapshot.exists()) {
            const data = snapshot.data()
            const { updatedAt: _, ...prefs } = data
            callback(prefs as UserPreferencesMap)
        }
    })
}
