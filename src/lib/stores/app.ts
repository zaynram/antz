import { writable, derived } from 'svelte/store';
import type { User } from 'firebase/auth';
import type { UserId, UserPreferences, UserPreferencesMap } from '../types';

const DEFAULT_PREFERENCES: UserPreferencesMap = {
  Z: {
    theme: 'dark',
    accentColor: '#6366f1',
    name: 'Z'
  },
  T: {
    theme: 'light',
    accentColor: '#ec4899',
    name: 'T'
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
