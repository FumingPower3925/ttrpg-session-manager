/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { PlaceEntity } from '@/types/world';
import { placeFitRadius } from './PlaceView';

/** Minimal PlaceEntity with an optional local poi coord. */
function poiChild(id: string, poi?: { x: number; y: number }): PlaceEntity {
    return {
        id,
        tipo: 'estructura',
        nombre: id,
        filePath: `mundo/lugares/${id}.md`,
        conocimiento: 'conocido',
        etiquetas: [],
        raw: {},
        body: '',
        en: 'plano_p',
        poi,
        servicios: [],
        facciones: [],
        acceso: 'normal',
    };
}

describe('placeFitRadius', () => {
    // HALF_EXTENT 220, FIT_MARGIN 50. The dashed "sin ubicar" ring sits just
    // outside the diagonal POI reach: UNPLACED_RADIUS = √2·220 + 60.
    const POI_REACH = Math.SQRT2 * 220; // diagonal corner reach
    const FIT_MARGIN = 50;
    const UNPLACED_RADIUS = Math.SQRT2 * 220 + 60;

    test('all children placed -> diagonal POI reach + margin', () => {
        const children = [poiChild('a', { x: 0, y: 0 }), poiChild('b', { x: 100, y: 100 })];
        expect(placeFitRadius(children)).toBeCloseTo(POI_REACH + FIT_MARGIN, 5);
    });

    test('any unplaced child -> the dashed "sin ubicar" ring is the outermost content', () => {
        const children = [poiChild('a', { x: 50, y: 50 }), poiChild('b' /* no poi */)];
        // The unplaced ring clears the diagonal POI reach, so it (plus margin)
        // is the outermost content and strictly larger than the placed-only case.
        expect(placeFitRadius(children)).toBeCloseTo(UNPLACED_RADIUS + FIT_MARGIN, 5);
        expect(placeFitRadius(children)).toBeGreaterThan(POI_REACH + FIT_MARGIN);
    });

    test('corner POIs + an unplaced child -> the larger reach wins (no clipping)', () => {
        const children = [
            poiChild('corner', { x: 100, y: 100 }), // diagonal reach ≈ 311
            poiChild('unplaced' /* no poi */), // ring ≈ 371
        ];
        const r = placeFitRadius(children);
        expect(r).toBeGreaterThanOrEqual(POI_REACH + FIT_MARGIN);
        expect(r).toBeCloseTo(UNPLACED_RADIUS + FIT_MARGIN, 5);
    });

    test('empty children (hub only) still returns the placed-only radius', () => {
        expect(placeFitRadius([])).toBeCloseTo(POI_REACH + FIT_MARGIN, 5);
    });

    test('radius is stable regardless of how many placed children there are', () => {
        const one = [poiChild('a', { x: 10, y: 90 })];
        const many = [
            poiChild('a', { x: 10, y: 90 }),
            poiChild('b', { x: 80, y: 30 }),
            poiChild('c', { x: 55, y: 55 }),
        ];
        expect(placeFitRadius(one)).toBeCloseTo(placeFitRadius(many), 5);
    });
});
