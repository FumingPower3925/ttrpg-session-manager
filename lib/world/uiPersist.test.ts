/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { UI_PERSIST_KEY, persistUi, readPersistedUi } from './stores';
import type { UiSlice, UiStorage } from './stores';

/** In-memory Storage stand-in (bun tests run without a DOM). */
function fakeStorage(initial: Record<string, string> = {}): UiStorage & { data: Record<string, string> } {
    const data = { ...initial };
    return {
        data,
        getItem: (key: string) => (key in data ? data[key] : null),
        setItem: (key: string, value: string) => {
            data[key] = value;
        },
    };
}

const SLICE: UiSlice = {
    tier: 'system',
    focusSystemId: 'sistema_verne',
    focusPlaceId: null,
    siteListId: 'porto_verne',
    selectedEntityId: 'torre_korinth',
    panelTab: 'pistas',
    mapCollapsed: true,
    showUnknown: false,
    viewports: {
        sector: { x: 12.5, y: -30, k: 0.8 },
        'system:sistema_verne': { x: 400, y: 300, k: 1.5 },
    },
};

describe('uiStore persistence (persistUi/readPersistedUi)', () => {
    test('round-trips the full slice through storage', () => {
        const storage = fakeStorage();
        persistUi(SLICE, storage);
        expect(readPersistedUi(storage)).toEqual(SLICE);
    });

    test('null storage (SSR) is a no-op on both sides', () => {
        expect(() => persistUi(SLICE, null)).not.toThrow();
        expect(readPersistedUi(null)).toEqual({});
    });

    test('absent or corrupt JSON restores nothing', () => {
        expect(readPersistedUi(fakeStorage())).toEqual({});
        expect(readPersistedUi(fakeStorage({ [UI_PERSIST_KEY]: '{nope' }))).toEqual({});
        expect(readPersistedUi(fakeStorage({ [UI_PERSIST_KEY]: '"str"' }))).toEqual({});
    });

    test('invalid fields drop individually while valid ones restore', () => {
        const storage = fakeStorage({
            [UI_PERSIST_KEY]: JSON.stringify({
                tier: 'galaxy', // out of vocabulary -> dropped
                focusSystemId: 42, // wrong type -> dropped
                siteListId: null,
                selectedEntityId: 'porto_verne',
                panelTab: 'diario',
                mapCollapsed: 'yes', // wrong type -> dropped
                showUnknown: false,
                viewports: {
                    sector: { x: 1, y: 2, k: 1 },
                    bad_nan: { x: Number.NaN, y: 0, k: 1 },
                    bad_zero_k: { x: 0, y: 0, k: 0 },
                    bad_shape: 'nope',
                },
            }),
        });
        expect(readPersistedUi(storage)).toEqual({
            siteListId: null,
            selectedEntityId: 'porto_verne',
            panelTab: 'diario',
            showUnknown: false,
            viewports: { sector: { x: 1, y: 2, k: 1 } },
        });
    });

    test('eventos is a valid persisted panelTab (feature 1 migration)', () => {
        const storage = fakeStorage();
        persistUi({ ...SLICE, panelTab: 'eventos' }, storage);
        expect(readPersistedUi(storage).panelTab).toBe('eventos');
    });

    test('round-trips a valid place tier with its focusPlaceId', () => {
        const storage = fakeStorage();
        const placeSlice: UiSlice = {
            ...SLICE,
            tier: 'place',
            focusSystemId: 'sistema_verne',
            focusPlaceId: 'porto_verne',
            siteListId: null,
        };
        persistUi(placeSlice, storage);
        const out = readPersistedUi(storage);
        expect(out.tier).toBe('place');
        expect(out.focusPlaceId).toBe('porto_verne');
        expect(out.focusSystemId).toBe('sistema_verne');
    });

    test('a place tier with no focusPlaceId degrades to system (backdrop sistema valid)', () => {
        const storage = fakeStorage({
            [UI_PERSIST_KEY]: JSON.stringify({
                tier: 'place',
                focusSystemId: 'sistema_verne',
                focusPlaceId: null,
            }),
        });
        const out = readPersistedUi(storage);
        expect(out.tier).toBe('system');
        expect(out.focusPlaceId).toBeNull();
        expect(out.focusSystemId).toBe('sistema_verne');
    });

    test('a place tier with neither focus degrades all the way to sector', () => {
        const storage = fakeStorage({
            [UI_PERSIST_KEY]: JSON.stringify({
                tier: 'place',
                focusSystemId: null,
                focusPlaceId: null,
            }),
        });
        expect(readPersistedUi(storage).tier).toBe('sector');
    });

    test('a place tier whose focusPlaceId is the wrong type degrades (id dropped first)', () => {
        const storage = fakeStorage({
            [UI_PERSIST_KEY]: JSON.stringify({
                tier: 'place',
                focusSystemId: 'sistema_verne',
                focusPlaceId: 42, // wrong type -> dropped -> then degrade
            }),
        });
        const out = readPersistedUi(storage);
        expect(out.tier).toBe('system');
        expect('focusPlaceId' in out).toBe(false);
    });

    test('a throwing storage never propagates', () => {
        const throwing: UiStorage = {
            getItem: () => {
                throw new Error('blocked');
            },
            setItem: () => {
                throw new Error('quota');
            },
        };
        expect(() => persistUi(SLICE, throwing)).not.toThrow();
        expect(readPersistedUi(throwing)).toEqual({});
    });
});
