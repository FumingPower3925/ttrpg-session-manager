/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import {
    FactionEntity,
    PlaceEntity,
    SystemEntity,
    WorldEntityBase,
    WorldManifest,
    WorldModel,
} from '@/types/world';
import {
    ancestryChain,
    childNodeWithin,
    placeHasPlano,
    sectorNodeFor,
    tierTargetFor,
} from './worldNav';

// ── Hand-built minimal model ────────────────────────────────────────────────
// sistema_a
//   └── planet_b (orbita 1)
//         └── site_c
//               └── room_d          (site inside a site)
// node_e (deep space, own coords)
//   └── pocket_f
// huerfano_g (en: fantasma — dangling parent)
// bucle_h <-> bucle_i               (en: cycle)
// faccion_x                         (non-spatial)

function base(id: string, tipo: string): WorldEntityBase {
    return {
        id,
        tipo,
        nombre: id,
        filePath: `mundo/${tipo}/${id}.md`,
        conocimiento: 'conocido',
        etiquetas: [],
        raw: {},
        body: '',
    };
}

function sistema(id: string): SystemEntity {
    return { ...base(id, 'sistema'), tipo: 'sistema', coordenadas: { x: 0, y: 0 } };
}

function lugar(
    id: string,
    opts: {
        en?: string;
        coordenadas?: { x: number; y: number };
        orbita?: number;
        poi?: { x: number; y: number };
    } = {}
): PlaceEntity {
    return {
        ...base(id, 'estacion'),
        en: opts.en,
        coordenadas: opts.coordenadas,
        orbita: opts.orbita,
        poi: opts.poi,
        servicios: [],
        facciones: [],
        acceso: 'normal',
    };
}

function faccion(id: string): FactionEntity {
    return { ...base(id, 'faccion'), actitud: 'neutral', objetivos: [] };
}

const MANIFEST: WorldManifest = {
    nombre: 'Sector Test',
    calendario: { era: 'dG', anoEpoca: 322, diasPorMes: 30, meses: ['Uno'] },
    viaje: { diasPorUnidad: 1, intrasistemaDias: 1, combustibleCadaDias: 4, viveresCadaDias: 4 },
    medidores: ['viveres', 'combustible', 'nave'],
    regiones: [],
};

function makeModel(): WorldModel {
    const sistemas = [sistema('sistema_a')];
    const lugares = [
        lugar('planet_b', { en: 'sistema_a', orbita: 1 }),
        lugar('site_c', { en: 'planet_b' }),
        lugar('room_d', { en: 'site_c' }),
        lugar('node_e', { coordenadas: { x: 5, y: 5 } }),
        lugar('pocket_f', { en: 'node_e' }),
        lugar('huerfano_g', { en: 'fantasma' }),
        lugar('bucle_h', { en: 'bucle_i' }),
        lugar('bucle_i', { en: 'bucle_h' }),
        // plano_p is a direct child of sistema_a with poi-coord children ->
        // it qualifies for a spatial Plano. poi_q1 carries poi; poi_q2 does not.
        lugar('plano_p', { en: 'sistema_a', orbita: 2 }),
        lugar('poi_q1', { en: 'plano_p', poi: { x: 30, y: 70 } }),
        lugar('poi_q2', { en: 'plano_p' }),
    ];
    const facciones = [faccion('faccion_x')];
    const entidades = new Map<string, WorldEntityBase>(
        [...sistemas, ...lugares, ...facciones].map((entity) => [entity.id, entity])
    );
    // childrenOf: inverse of `en:` (placeHasPlano reads it).
    const childrenOf = new Map<string, string[]>();
    for (const l of lugares) {
        if (l.en === undefined) continue;
        const arr = childrenOf.get(l.en) ?? [];
        arr.push(l.id);
        childrenOf.set(l.en, arr);
    }
    return {
        manifest: MANIFEST,
        entidades,
        sistemas,
        lugares,
        facciones,
        pnjs: [],
        pistas: [],
        tramas: [],
        tablas: [],
        problemas: [],
        childrenOf,
        estadoGrupo: null,
        diario: [],
        musica: { bgm: [], eventPlaylists: [] },
        tiendas: new Map(),
        resumen: null,
    };
}

const model = makeModel();

// ── ancestryChain ───────────────────────────────────────────────────────────

describe('ancestryChain', () => {
    test('walks en: up to the root', () => {
        expect(ancestryChain(model, 'room_d')).toEqual(['room_d', 'site_c', 'planet_b', 'sistema_a']);
    });

    test('single element for roots', () => {
        expect(ancestryChain(model, 'sistema_a')).toEqual(['sistema_a']);
        expect(ancestryChain(model, 'node_e')).toEqual(['node_e']);
    });

    test('keeps the dangling parent id as the last element', () => {
        expect(ancestryChain(model, 'huerfano_g')).toEqual(['huerfano_g', 'fantasma']);
    });

    test('cycle-guarded', () => {
        expect(ancestryChain(model, 'bucle_h')).toEqual(['bucle_h', 'bucle_i']);
    });
});

// ── sectorNodeFor ───────────────────────────────────────────────────────────

describe('sectorNodeFor', () => {
    test('rolls a deep site up to its sistema', () => {
        expect(sectorNodeFor(model, 'room_d')).toBe('sistema_a');
    });

    test('rolls a pocket up to its deep-space root', () => {
        expect(sectorNodeFor(model, 'pocket_f')).toBe('node_e');
    });

    test('a sector-tier entity maps to itself', () => {
        expect(sectorNodeFor(model, 'sistema_a')).toBe('sistema_a');
        expect(sectorNodeFor(model, 'node_e')).toBe('node_e');
    });

    test('null when the chain dead-ends on a missing entity', () => {
        expect(sectorNodeFor(model, 'huerfano_g')).toBeNull();
        expect(sectorNodeFor(model, 'no_existe')).toBeNull();
    });
});

// ── childNodeWithin ─────────────────────────────────────────────────────────

describe('childNodeWithin', () => {
    test('container itself when ids match', () => {
        expect(childNodeWithin(model, 'sistema_a', 'sistema_a')).toBe('sistema_a');
    });

    test('direct child stays itself', () => {
        expect(childNodeWithin(model, 'planet_b', 'sistema_a')).toBe('planet_b');
    });

    test('deeper descendants roll up to the direct child', () => {
        expect(childNodeWithin(model, 'site_c', 'sistema_a')).toBe('planet_b');
        expect(childNodeWithin(model, 'room_d', 'sistema_a')).toBe('planet_b');
        expect(childNodeWithin(model, 'room_d', 'planet_b')).toBe('site_c');
    });

    test('null when the entity is outside the container', () => {
        expect(childNodeWithin(model, 'pocket_f', 'sistema_a')).toBeNull();
        expect(childNodeWithin(model, 'sistema_a', 'planet_b')).toBeNull();
    });
});

// ── tierTargetFor ───────────────────────────────────────────────────────────

describe('tierTargetFor', () => {
    test('sistema -> sector tier, selected only', () => {
        expect(tierTargetFor(model, 'sistema_a')).toEqual({
            tier: 'sector',
            focusSystemId: null,
            focusPlaceId: null,
            siteListId: null,
        });
    });

    test('direct child of a sistema -> system tier, no site list', () => {
        expect(tierTargetFor(model, 'planet_b')).toEqual({
            tier: 'system',
            focusSystemId: 'sistema_a',
            focusPlaceId: null,
            siteListId: null,
        });
    });

    test('site -> system tier + its direct parent site list', () => {
        expect(tierTargetFor(model, 'site_c')).toEqual({
            tier: 'system',
            focusSystemId: 'sistema_a',
            focusPlaceId: null,
            siteListId: 'planet_b',
        });
        expect(tierTargetFor(model, 'room_d')).toEqual({
            tier: 'system',
            focusSystemId: 'sistema_a',
            focusPlaceId: null,
            siteListId: 'site_c',
        });
    });

    test('deep-space place -> sector tier', () => {
        expect(tierTargetFor(model, 'node_e')).toEqual({
            tier: 'sector',
            focusSystemId: null,
            focusPlaceId: null,
            siteListId: null,
        });
    });

    test('entity inside a deep-space place -> sector tier + parent site list', () => {
        expect(tierTargetFor(model, 'pocket_f')).toEqual({
            tier: 'sector',
            focusSystemId: null,
            focusPlaceId: null,
            siteListId: 'node_e',
        });
    });

    test('a plano-eligible place itself -> system tier (drill-in opens the Plano)', () => {
        // plano_p sits directly in sistema_a; its OWN placement is the system
        // view — only its POI children land on the place tier.
        expect(tierTargetFor(model, 'plano_p')).toEqual({
            tier: 'system',
            focusSystemId: 'sistema_a',
            focusPlaceId: null,
            siteListId: null,
        });
    });

    test('a POI (parent has a Plano) -> place tier focused on the parent place', () => {
        expect(tierTargetFor(model, 'poi_q1')).toEqual({
            tier: 'place',
            focusSystemId: 'sistema_a',
            focusPlaceId: 'plano_p',
            siteListId: null,
        });
        // An unplaced child of a plano-eligible place STILL routes to the place
        // tier (it renders on the dashed "sin ubicar" ring, not a SiteList).
        expect(tierTargetFor(model, 'poi_q2')).toEqual({
            tier: 'place',
            focusSystemId: 'sistema_a',
            focusPlaceId: 'plano_p',
            siteListId: null,
        });
    });

    test('null for non-spatial entities, dangling chains and unknown ids', () => {
        expect(tierTargetFor(model, 'faccion_x')).toBeNull();
        expect(tierTargetFor(model, 'huerfano_g')).toBeNull();
        expect(tierTargetFor(model, 'no_existe')).toBeNull();
    });
});

// ── placeHasPlano ────────────────────────────────────────────────────────────

describe('placeHasPlano', () => {
    test('true when a direct child carries poi coords', () => {
        expect(placeHasPlano(model, 'plano_p')).toBe(true);
    });

    test('false when children exist but none carry poi (SiteList fallback)', () => {
        // planet_b -> site_c (no poi) -> keeps the non-spatial SiteList.
        expect(placeHasPlano(model, 'planet_b')).toBe(false);
    });

    test('false for a childless place and unknown ids', () => {
        expect(placeHasPlano(model, 'room_d')).toBe(false);
        expect(placeHasPlano(model, 'no_existe')).toBe(false);
    });
});
