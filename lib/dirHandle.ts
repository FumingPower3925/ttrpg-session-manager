/**
 * Campaign directory-handle persistence.
 *
 * FileSystemDirectoryHandle cannot go through sessionStorage (not JSON-serializable),
 * but it IS structured-cloneable, so it survives in IndexedDB. This lets /world
 * (and eventually /play) reconnect to the campaign folder with one click instead
 * of re-picking it after every navigation or reload.
 */

import { get, set, del } from 'idb-keyval';

const KEY = 'campaignDirHandle';

/** In-session singleton — avoids IndexedDB round-trips within one page lifetime. */
let current: FileSystemDirectoryHandle | null = null;

/** Remember a freshly picked campaign folder handle (memory + IndexedDB). */
export async function rememberDirHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  current = handle;
  try {
    await set(KEY, handle);
  } catch {
    // IndexedDB unavailable (private mode etc.) — the in-memory singleton still works.
  }
}

/** The handle for this page lifetime, if any (no permission check). */
export function getCurrentDirHandle(): FileSystemDirectoryHandle | null {
  return current;
}

export type StoredHandleStatus =
  | { status: 'none' }
  | { status: 'granted'; handle: FileSystemDirectoryHandle }
  | { status: 'prompt'; handle: FileSystemDirectoryHandle };

/**
 * Loads the stored handle and checks (without prompting) whether read permission
 * is still granted. 'prompt' means a user gesture + requestPermission is needed
 * (the "Reconectar carpeta" button).
 */
export async function loadStoredDirHandle(): Promise<StoredHandleStatus> {
  if (current) return { status: 'granted', handle: current };

  let handle: FileSystemDirectoryHandle | undefined;
  try {
    handle = await get<FileSystemDirectoryHandle>(KEY);
  } catch {
    return { status: 'none' };
  }
  if (!handle) return { status: 'none' };

  try {
    const perm = await handle.queryPermission({ mode: 'read' });
    if (perm === 'granted') {
      current = handle;
      return { status: 'granted', handle };
    }
    return { status: 'prompt', handle };
  } catch {
    return { status: 'none' };
  }
}

/**
 * Re-requests read permission on a stored handle. Must be called from a user gesture.
 * Returns the handle if granted, null otherwise.
 */
export async function reconnectDirHandle(
  handle: FileSystemDirectoryHandle
): Promise<FileSystemDirectoryHandle | null> {
  try {
    const perm = await handle.requestPermission({ mode: 'read' });
    if (perm === 'granted') {
      current = handle;
      return handle;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Forget the stored handle (memory + IndexedDB). */
export async function forgetDirHandle(): Promise<void> {
  current = null;
  try {
    await del(KEY);
  } catch {
    // ignore
  }
}
