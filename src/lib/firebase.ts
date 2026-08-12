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
    deleteField,
    doc,
    getDoc,
    getFirestore,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    type QueryConstraint,
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

/**
 * Live-subscribe to a collection. Pass `maxItems` for views that only render a
 * bounded slice (the home dashboard, for example) so the client isn't paying to
 * receive and re-parse the entire collection on every snapshot.
 */
export function subscribeToCollection<T extends DocumentData>(
    collectionName: string,
    callback: (items: T[]) => void,
    orderByField: string = "createdAt",
    maxItems?: number
): () => void {
    const constraints: QueryConstraint[] = [orderBy(orderByField, "desc")]
    if (maxItems !== undefined) constraints.push(limit(maxItems))
    const q = query(collection(db, collectionName), ...constraints)
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

/**
 * Prepare one identity's preferences for a merged write.
 *
 * Firestore rejects `undefined` field values outright, and because we write
 * with `merge: true` a key that simply disappears locally would keep its old
 * remote value — so clearing a profile picture or signature would silently come
 * back on the next sync. Both problems are handled by turning cleared optional
 * fields into explicit `deleteField()` sentinels.
 */
function preferencesForWrite(prefs: object): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(prefs)) {
        out[key] = value === undefined ? deleteField() : value
    }
    return out
}

/**
 * Persist preferences to Firestore. When `userId` is given, only that user's
 * entry is written (merge), so a device signed in as one identity can never
 * overwrite the other identity's settings. Without `userId`, the full map is
 * written (used only for first-time seeding).
 */
export async function savePreferencesToFirestore(
    prefs: UserPreferencesMap,
    userId?: UserId
): Promise<void> {
    const docRef = doc(db, PREFERENCES_DOC)
    if (userId) {
        await setDoc(
            docRef,
            { [userId]: preferencesForWrite(prefs[userId] ?? {}), updatedAt: serverTimestamp() },
            { merge: true }
        )
    } else {
        const all = Object.fromEntries(
            Object.entries(prefs).map(([id, p]) => [id, preferencesForWrite(p ?? {})])
        )
        await setDoc(docRef, { ...all, updatedAt: serverTimestamp() }, { merge: true })
    }
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
