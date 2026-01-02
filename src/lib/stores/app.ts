import { writable, derived, get } from 'svelte/store';
import type { User } from 'firebase/auth';
import type { UserId, UserPreferences, UserPreferencesMap } from '../types';

const DEFAULT_PREFERENCES: UserPreferencesMap = {
  Z: {
    theme: 'dark',
    accentColor: '#6366f1',
    name: 'Z',
    locationMode: 'off',
    searchRadius: 5000
  },
  T: {
    theme: 'light',
    accentColor: '#ec4899',
    name: 'T',
    locationMode: 'off',
    searchRadius: 5000
  }
};

function createPersistedStore<T>(key: string, initial: T) {
  const stored = localStorage.getItem(key);
  const value = stored ? (JSON.parse(stored) as T) : initial;
  const store = writable<T>(value);

  store.subscribe((v) => {
    localStorage.setItem(key, JSON.stringify(v));
  });

  return store;
}

export const activeUser = createPersistedStore<UserId>('activeUser', 'Z');

export const userPreferences = createPersistedStore<UserPreferencesMap>(
  'userPreferences',
  DEFAULT_PREFERENCES
);

export const currentPreferences = derived<
  [typeof activeUser, typeof userPreferences],
  UserPreferences
>([activeUser, userPreferences], ([$activeUser, $userPreferences]) => $userPreferences[$activeUser]);

// Get display name for any user ID
export function getDisplayName(userId: UserId): string {
  const prefs = get(userPreferences);
  return prefs[userId]?.name || userId;
}

// Reactive derived store for display names
export const displayNames = derived(
  userPreferences,
  ($prefs) => ({
    Z: $prefs.Z?.name || 'Z',
    T: $prefs.T?.name || 'T'
  })
);

// Get the other user's ID
export function getOtherUserId(userId: UserId): UserId {
  return userId === 'Z' ? 'T' : 'Z';
}

export const authUser = writable<User | null>(null);
export const authLoading = writable<boolean>(true);

// Search history store (stores last 5 searches)
const MAX_SEARCH_HISTORY = 5;
export const mediaSearchHistory = createPersistedStore<string[]>('mediaSearchHistory', []);

export function addToSearchHistory(query: string): void {
  mediaSearchHistory.update(history => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return history;
    
    // Remove if already exists, then add to front
    const filtered = history.filter(h => h.toLowerCase() !== trimmedQuery.toLowerCase());
    const updated = [trimmedQuery, ...filtered].slice(0, MAX_SEARCH_HISTORY);
    return updated;
  });
}

export function removeFromSearchHistory(query: string): void {
  mediaSearchHistory.update(history => 
    history.filter(h => h !== query)
  );
}

export function clearSearchHistory(): void {
  mediaSearchHistory.set([]);
}
