import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Firebase modules before importing the module under test
vi.mock('firebase/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'mock-app' })),
}));

vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(() => ({ currentUser: null })),
  GoogleAuthProvider: vi.fn(),
  onAuthStateChanged: vi.fn((_auth, _callback) => {
    // Mock unsubscribe function
    return vi.fn();
  }),
  signInWithPopup: vi.fn(() => Promise.resolve({ user: { uid: 'test-uid' } })),
  signOut: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(() => ({ app: { name: 'mock-app' } })),
  collection: vi.fn((db, name) => ({ name, db })),
  doc: vi.fn((collectionOrDb, ...args) => {
    if (args.length === 1) {
      return { id: args[0], path: `${collectionOrDb.name}/${args[0]}` };
    }
    return { id: 'generated-id', path: `${collectionOrDb.name}/generated-id` };
  }),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn((_query, _callback) => {
    // Mock unsubscribe function
    return vi.fn();
  }),
  orderBy: vi.fn((field, direction) => ({ field, direction })),
  query: vi.fn((collection, ...constraints) => ({ collection, constraints })),
  serverTimestamp: vi.fn(() => ({ _seconds: 1234567890 })),
  setDoc: vi.fn(() => Promise.resolve()),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

// Mock config
vi.mock('./config', () => ({
  firebaseConfig: {
    apiKey: 'test-api-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'test-project',
    storageBucket: 'test.appspot.com',
    messagingSenderId: '123456',
    appId: 'test-app-id',
  },
}));

// Import after mocks are set up
import {
  signInWithGoogle,
  logOut,
  onAuthChange,
  subscribeToCollection,
  addDocument,
  updateDocument,
  deleteDocument,
} from './firebase';
import * as firebaseAuth from 'firebase/auth';
import * as firestore from 'firebase/firestore';

describe('Firebase utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('signInWithGoogle', () => {
    it('should call signInWithPopup with GoogleAuthProvider', async () => {
      await signInWithGoogle();
      
      expect(firebaseAuth.signInWithPopup).toHaveBeenCalledTimes(1);
      expect(firebaseAuth.signInWithPopup).toHaveBeenCalledWith(
        expect.anything(), // auth
        expect.anything()  // googleProvider
      );
    });

    it('should return a promise', async () => {
      const result = signInWithGoogle();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('logOut', () => {
    it('should call signOut', async () => {
      await logOut();
      
      expect(firebaseAuth.signOut).toHaveBeenCalledTimes(1);
      expect(firebaseAuth.signOut).toHaveBeenCalledWith(expect.anything());
    });

    it('should return a promise', async () => {
      const result = logOut();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });
  });

  describe('onAuthChange', () => {
    it('should call onAuthStateChanged with callback', () => {
      const mockCallback = vi.fn();
      const unsubscribe = onAuthChange(mockCallback);
      
      expect(firebaseAuth.onAuthStateChanged).toHaveBeenCalledTimes(1);
      expect(firebaseAuth.onAuthStateChanged).toHaveBeenCalledWith(
        expect.anything(),
        mockCallback
      );
      expect(typeof unsubscribe).toBe('function');
    });

    it('should return an unsubscribe function', () => {
      const mockCallback = vi.fn();
      const unsubscribe = onAuthChange(mockCallback);
      
      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('subscribeToCollection', () => {
    it('should create query with collection and orderBy', () => {
      const mockCallback = vi.fn();
      subscribeToCollection('notes', mockCallback, 'createdAt');
      
      expect(firestore.collection).toHaveBeenCalledWith(expect.anything(), 'notes');
      expect(firestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
      expect(firestore.query).toHaveBeenCalled();
    });

    it('should use default orderBy field if not provided', () => {
      const mockCallback = vi.fn();
      subscribeToCollection('media', mockCallback);
      
      expect(firestore.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    });

    it('should return an unsubscribe function', () => {
      const mockCallback = vi.fn();
      const unsubscribe = subscribeToCollection('notes', mockCallback);
      
      expect(typeof unsubscribe).toBe('function');
      expect(firestore.onSnapshot).toHaveBeenCalled();
    });
  });

  describe('addDocument', () => {
    it('should create document with metadata', async () => {
      const data = { title: 'Test Note', content: 'Test content' };
      await addDocument('notes', data, 'Z');
      
      expect(firestore.collection).toHaveBeenCalledWith(expect.anything(), 'notes');
      expect(firestore.setDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Test Note',
          content: 'Test content',
          createdBy: 'Z',
          createdAt: expect.anything(),
          updatedAt: expect.anything(),
        })
      );
    });

    it('should add createdBy, createdAt, and updatedAt fields', async () => {
      const data = { name: 'Test Place' };
      await addDocument('places', data, 'T');
      
      const setDocCall = vi.mocked(firestore.setDoc).mock.calls[0];
      const documentData = setDocCall[1];
      
      expect(documentData).toHaveProperty('createdBy', 'T');
      expect(documentData).toHaveProperty('createdAt');
      expect(documentData).toHaveProperty('updatedAt');
    });

    it('should return document id', async () => {
      const data = { title: 'Test' };
      const docId = await addDocument('notes', data, 'Z');
      
      expect(typeof docId).toBe('string');
    });
  });

  describe('updateDocument', () => {
    it('should update document with metadata', async () => {
      const updates = { title: 'Updated Title' };
      await updateDocument('notes', 'doc-123', updates, 'Z');
      
      expect(firestore.doc).toHaveBeenCalledWith(
        expect.anything(),
        'notes',
        'doc-123'
      );
      expect(firestore.updateDoc).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: 'Updated Title',
          updatedBy: 'Z',
          updatedAt: expect.anything(),
        })
      );
    });

    it('should add updatedBy and updatedAt fields', async () => {
      const updates = { status: 'completed' };
      await updateDocument('media', 'media-456', updates, 'T');
      
      const updateDocCall = vi.mocked(firestore.updateDoc).mock.calls[0];
      const updateData = updateDocCall[1];
      
      expect(updateData).toHaveProperty('updatedBy', 'T');
      expect(updateData).toHaveProperty('updatedAt');
    });

    it('should handle partial updates', async () => {
      const updates = { rating: 5 };
      await updateDocument('places', 'place-789', updates, 'Z');
      
      const updateDocCall = vi.mocked(firestore.updateDoc).mock.calls[0];
      const updateData = updateDocCall[1];
      
      expect(updateData).toHaveProperty('rating', 5);
      expect(updateData).toHaveProperty('updatedBy');
      expect(updateData).toHaveProperty('updatedAt');
    });
  });

  describe('deleteDocument', () => {
    it('should call deleteDoc with correct parameters', async () => {
      await deleteDocument('notes', 'note-123');
      
      expect(firestore.doc).toHaveBeenCalledWith(
        expect.anything(),
        'notes',
        'note-123'
      );
      expect(firestore.deleteDoc).toHaveBeenCalledWith(expect.anything());
    });

    it('should return a promise', async () => {
      const result = deleteDocument('media', 'media-456');
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('should handle different collection names', async () => {
      await deleteDocument('places', 'place-789');
      
      expect(firestore.doc).toHaveBeenCalledWith(
        expect.anything(),
        'places',
        'place-789'
      );
    });
  });
});
