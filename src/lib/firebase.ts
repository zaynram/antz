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
    getFirestore,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    type DocumentData,
} from "firebase/firestore"
import { firebaseConfig } from "./config"
import type { UserId } from "./types"

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)

const googleProvider = new GoogleAuthProvider()

export async function signInWithGoogle(): Promise<void> {
    await signInWithPopup(auth, googleProvider)
}

export async function logOut(): Promise<void> {
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
