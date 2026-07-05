/// <reference types="bun-types" />
import { test, expect, describe, afterEach } from 'bun:test';
import { readEntityFromUrl, writeEntityToUrl } from './deepLink';

/**
 * Minimal window stub — bun tests run without a DOM. Captures the URL passed
 * to history.replaceState and the state object forwarded through.
 */
function installWindow(href: string) {
    const captured: { url: string | null; state: unknown } = { url: null, state: undefined };
    const parsed = new URL(href);
    const stub = {
        location: { href, search: parsed.search },
        history: {
            state: { nextInternal: true },
            replaceState(state: unknown, _unused: string, url?: string | null) {
                captured.state = state;
                captured.url = url ?? null;
            },
        },
    };
    Object.defineProperty(globalThis, 'window', {
        value: stub,
        configurable: true,
        writable: true,
    });
    return captured;
}

function removeWindow() {
    delete (globalThis as { window?: unknown }).window;
}

afterEach(removeWindow);

describe('readEntityFromUrl', () => {
    test('reads ?e= from the current URL', () => {
        installWindow('https://app.test/world?e=porto_verne');
        expect(readEntityFromUrl()).toBe('porto_verne');
    });

    test('null when the param is absent or empty', () => {
        installWindow('https://app.test/world');
        expect(readEntityFromUrl()).toBeNull();
        installWindow('https://app.test/world?e=');
        expect(readEntityFromUrl()).toBeNull();
    });

    test('coexists with other query params', () => {
        installWindow('https://app.test/world?foo=bar&e=kovar_iii');
        expect(readEntityFromUrl()).toBe('kovar_iii');
    });

    test('SSR-guarded: returns null without a window', () => {
        removeWindow();
        expect(readEntityFromUrl()).toBeNull();
    });
});

describe('writeEntityToUrl', () => {
    test('sets ?e= via history.replaceState, preserving other params and state', () => {
        const captured = installWindow('https://app.test/world?foo=bar');
        writeEntityToUrl('porto_verne');
        expect(captured.url).toBe('https://app.test/world?foo=bar&e=porto_verne');
        expect(captured.state).toEqual({ nextInternal: true });
    });

    test('null removes the param', () => {
        const captured = installWindow('https://app.test/world?e=porto_verne&foo=bar');
        writeEntityToUrl(null);
        expect(captured.url).toBe('https://app.test/world?foo=bar');
    });

    test('overwrites an existing selection', () => {
        const captured = installWindow('https://app.test/world?e=old_id');
        writeEntityToUrl('new_id');
        expect(captured.url).toBe('https://app.test/world?e=new_id');
    });

    test('SSR-guarded: no-op without a window', () => {
        removeWindow();
        expect(() => writeEntityToUrl('porto_verne')).not.toThrow();
    });
});
