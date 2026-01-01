import { expect, afterEach } from 'vitest';
import { cleanup } from '@testing-library/svelte';

// Extend Vitest's expect with @testing-library/jest-dom matchers
// @ts-ignore
import * as matchers from '@testing-library/jest-dom/matchers';
expect.extend(matchers);

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

global.localStorage = localStorageMock as Storage;
