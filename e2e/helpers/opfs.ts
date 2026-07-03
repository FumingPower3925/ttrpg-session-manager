/**
 * OPFS testing seam — the CONTRACT between world-mode e2e tests and the app.
 *
 * Playwright cannot drive `window.showDirectoryPicker()`, but the Origin
 * Private File System (`navigator.storage.getDirectory()`) returns a real,
 * writable FileSystemDirectoryHandle in Chromium without any permission
 * prompt. Tests materialize a fixture FileTree into OPFS and then ask the app
 * to open it through the exact handle-consuming code path a user would hit.
 *
 * App side of the contract (the integrator implements EXACTLY this on the
 * /world page — tests in e2e/world.spec.ts depend on every point):
 *
 *   1. On mount, the /world page registers a test hook on window:
 *
 *          window.__ttrpgWorldTest = {
 *              openFromOPFS: async (): Promise<void> => { ... },
 *          };
 *
 *      `openFromOPFS()` obtains `await navigator.storage.getDirectory()` and
 *      feeds that handle through the SAME code path as folder selection
 *      (probe for mundo/mundo.md -> world scan -> populate stores). It only
 *      needs to kick the scan off; tests wait on the DOM status below.
 *
 *   2. The /world page exposes a `data-world-status` attribute on a rendered
 *      element, reaching the value "ready" once the world model is loaded and
 *      the map has rendered. Degraded loads (validation issues present) still
 *      end in "ready" — the world always loads.
 *
 *   3. Sector-map nodes carry `data-entity-id="<id>"` and
 *      `data-knowledge="<conocimiento>"`; the entity side panel root carries
 *      `data-entity-panel`; the diagnostics affordance is a button whose
 *      accessible name contains "Diagnóstico"; the ghost toggle is a button
 *      whose accessible name contains "desconocidos". See e2e/world.spec.ts
 *      for the full selector contract.
 */

import type { Page } from '@playwright/test';
import type { FileTree } from '../fixtures/mundoCampaign';

/** Shape the /world page must register on `window.__ttrpgWorldTest`. */
export interface TtrpgWorldTestHook {
    openFromOPFS: () => Promise<void>;
}

type WorldTestWindow = Window & { __ttrpgWorldTest?: TtrpgWorldTestHook };

/**
 * Writes `tree` into the page origin's OPFS root, clearing whatever a
 * previous test left behind. Must run after `page.goto()` (needs an origin).
 */
export async function materializeIntoOPFS(page: Page, tree: FileTree): Promise<void> {
    await page.evaluate(async (fixture: FileTree) => {
        const root = await navigator.storage.getDirectory();

        // Clear existing entries first (collect names, then remove — do not
        // remove while iterating the live directory).
        const existing: string[] = [];
        for await (const name of root.keys()) {
            existing.push(name);
        }
        for (const name of existing) {
            await root.removeEntry(name, { recursive: true });
        }

        const writeTree = async (dir: FileSystemDirectoryHandle, node: FileTree): Promise<void> => {
            for (const [name, value] of Object.entries(node)) {
                if (typeof value === 'string') {
                    const fileHandle = await dir.getFileHandle(name, { create: true });
                    const writable = await fileHandle.createWritable();
                    await writable.write(value);
                    await writable.close();
                } else {
                    const subdir = await dir.getDirectoryHandle(name, { create: true });
                    await writeTree(subdir, value);
                }
            }
        };

        await writeTree(root, fixture);
    }, tree);
}

/**
 * Reads a file back from OPFS by campaign-relative path — the M3 journal /
 * estado assertions verify what the app actually wrote to "disk".
 *
 * Chromium's createWritable() swaps the file atomically on close(), which can
 * make the entry vanish for an instant while the app is mid-rewrite — the
 * read retries briefly on NotFoundError instead of failing the poll.
 */
export async function readOPFSFile(page: Page, path: string): Promise<string> {
    return await page.evaluate(async (relativePath: string) => {
        const parts = relativePath.split('/').filter(Boolean);
        const readOnce = async (): Promise<string> => {
            let dir = await navigator.storage.getDirectory();
            for (let i = 0; i < parts.length - 1; i++) {
                dir = await dir.getDirectoryHandle(parts[i]);
            }
            const fileHandle = await dir.getFileHandle(parts[parts.length - 1]);
            const file = await fileHandle.getFile();
            return await file.text();
        };
        let lastError: unknown = null;
        for (let attempt = 0; attempt < 10; attempt++) {
            try {
                return await readOnce();
            } catch (error) {
                lastError = error;
                await new Promise((resolve) => setTimeout(resolve, 50));
            }
        }
        throw lastError;
    }, path);
}

/** Lists the entry names of an OPFS directory (sorted). */
export async function listOPFSDir(page: Page, path: string): Promise<string[]> {
    return await page.evaluate(async (relativePath: string) => {
        const parts = relativePath.split('/').filter(Boolean);
        let dir = await navigator.storage.getDirectory();
        for (const part of parts) {
            dir = await dir.getDirectoryHandle(part);
        }
        const names: string[] = [];
        for await (const name of dir.keys()) {
            names.push(name);
        }
        return names.sort();
    }, path);
}

/**
 * Opens the world from OPFS via the app's test hook and waits until the
 * world model is loaded and rendered (`[data-world-status="ready"]`).
 */
export async function openWorldViaOPFS(page: Page): Promise<void> {
    // The hook is registered by the /world page on mount.
    await page.waitForFunction(() => Boolean((window as WorldTestWindow).__ttrpgWorldTest));
    await page.evaluate(async () => {
        const hook = (window as WorldTestWindow).__ttrpgWorldTest;
        if (!hook) throw new Error('window.__ttrpgWorldTest no registrado en /world');
        await hook.openFromOPFS();
    });
    await page.waitForSelector('[data-world-status="ready"]', { state: 'attached' });
}
