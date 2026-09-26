"use client";

import { createKeyValueRepositories, createMemoryRepositories, type KeyValueStore } from "./kv";
import type { Repositories } from "./repositories";

/**
 * Default V1 storage: the author's own browser. Nothing is written to a
 * server. Falls back to memory when storage is unavailable (private mode,
 * disabled storage), so the app still works for the session.
 */

let repos: Repositories | null = null;

function browserStore(): KeyValueStore | null {
  try {
    const s = window.localStorage;
    const probe = "whodunnit:probe";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

export function getBrowserRepositories(): Repositories {
  if (repos) return repos;
  const store = typeof window !== "undefined" ? browserStore() : null;
  repos = store ? createKeyValueRepositories(store, "browser") : createMemoryRepositories();
  return repos;
}
