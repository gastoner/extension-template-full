import '@testing-library/jest-dom/vitest';

// jsdom does not implement Element.animate (Web Animations API)
if (typeof Element.prototype.animate !== 'function') {
  Element.prototype.animate = function (): Animation {
    return { onfinish: undefined, cancel: () => {}, finished: Promise.resolve() } as unknown as Animation;
  };
}

// jsdom may not expose localStorage in all Node versions
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string): string | undefined => store.get(key) ?? undefined,
      setItem: (key: string, value: string): void => {
        store.set(key, value);
      },
      removeItem: (key: string): void => {
        store.delete(key);
      },
      clear: (): void => {
        store.clear();
      },
      get length(): number {
        return store.size;
      },
      key: (index: number): string | undefined => [...store.keys()][index] ?? undefined,
    },
  });
}
