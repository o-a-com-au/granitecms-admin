// A minimal Storage implementation backed by a plain Map - real
// localStorage is confirmed genuinely inert in this test environment
// (Node's own experimental global shadows jsdom's without a CLI flag
// neither this app nor its tests pass), so any test exercising the
// "something was remembered" branch of a localStorage-backed helper
// needs vi.stubGlobal('localStorage', createFakeStorage()) first - the
// "nothing remembered yet" branch is already exercised for free by
// every test that doesn't stub anything.
export function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}
