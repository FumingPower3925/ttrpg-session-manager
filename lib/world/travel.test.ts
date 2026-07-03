/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import {
    PlaceEntity,
    SystemEntity,
    TravelPlan,
    WorldEntityBase,
    WorldManifest,
    WorldModel,
} from '@/types/world';
import {
    computeTravelPlan,
    sectorLegEndDay,
    travelDaySchedule,
    TravelSnapshot,
    WARN_COMBUSTIBLE,
    WARN_VIVERES,
} from './travel';

// ── Hand-built minimal model ────────────────────────────────────────────────
// sistema_a (0,0)
//   └── planet_a1
//         └── site_a2                       (deep chain)
// sistema_b (2,3)  — distance √13 ≈ 3.606 -> ceil 4
//   ├── planet_b1
//   ├── portal_gate  (acceso: portal)
//   │     └── portal_inner                  (inherits portal via the chain)
//   └── ...
// node_e (5,5)  — deep-space root, distance √50 ≈ 7.071 -> ceil 8
//   └── pocket_f
// huerfano (en: fantasma)                   (dangling root)
// perdido  (no en:, no coords)              (rootless lugar)

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

function sistema(id: string, coordenadas: { x: number; y: number }): SystemEntity {
    return { ...base(id, 'sistema'), tipo: 'sistema', coordenadas };
}

function lugar(
    id: string,
    opts: {
        en?: string;
        coordenadas?: { x: number; y: number };
        acceso?: PlaceEntity['acceso'];
    } = {}
): PlaceEntity {
    return {
        ...base(id, 'estacion'),
        en: opts.en,
        coordenadas: opts.coordenadas,
        servicios: [],
        facciones: [],
        acceso: opts.acceso ?? 'normal',
    };
}

const VIAJE_DEFAULTS: WorldManifest['viaje'] = {
    diasPorUnidad: 1,
    intrasistemaDias: 1,
    combustiblePorTramo: 1,
    viveresCadaDias: 4,
};

function makeModel(viaje: Partial<WorldManifest['viaje']> = {}): WorldModel {
    const sistemas = [sistema('sistema_a', { x: 0, y: 0 }), sistema('sistema_b', { x: 2, y: 3 })];
    const lugares = [
        lugar('planet_a1', { en: 'sistema_a' }),
        lugar('site_a2', { en: 'planet_a1' }),
        lugar('planet_b1', { en: 'sistema_b' }),
        lugar('portal_gate', { en: 'sistema_b', acceso: 'portal' }),
        lugar('portal_inner', { en: 'portal_gate' }),
        lugar('node_e', { coordenadas: { x: 5, y: 5 } }),
        lugar('pocket_f', { en: 'node_e' }),
        lugar('huerfano', { en: 'fantasma' }),
        lugar('perdido'),
    ];
    const entidades = new Map<string, WorldEntityBase>(
        [...sistemas, ...lugares].map((entity) => [entity.id, entity])
    );
    return {
        manifest: {
            nombre: 'Sector Test',
            calendario: { era: 'dG', anoEpoca: 322, diasPorMes: 30, meses: ['Uno'] },
            viaje: { ...VIAJE_DEFAULTS, ...viaje },
            medidores: ['viveres', 'combustible', 'nave'],
            regiones: [],
        },
        entidades,
        sistemas,
        lugares,
        facciones: [],
        pnjs: [],
        pistas: [],
        tramas: [],
        tablas: [],
        problemas: [],
        childrenOf: new Map(),
        estadoGrupo: null,
        diario: [],
    };
}

const model = makeModel();

/** Comfortable snapshot: no warnings unless a test says otherwise. */
const FULL: TravelSnapshot = { medidores: { viveres: 5, combustible: 5, nave: 5 } };

// ── Degenerate inputs ───────────────────────────────────────────────────────

describe('computeTravelPlan degenerate inputs', () => {
    test('null when either id is unknown', () => {
        expect(computeTravelPlan('no_existe', 'planet_b1', model, FULL)).toBeNull();
        expect(computeTravelPlan('planet_a1', 'no_existe', model, FULL)).toBeNull();
    });

    test('null when toId === fromId', () => {
        expect(computeTravelPlan('planet_a1', 'planet_a1', model, FULL)).toBeNull();
    });

    test('null when a root dangles (en: chain dead-ends)', () => {
        expect(computeTravelPlan('planet_a1', 'huerfano', model, FULL)).toBeNull();
        expect(computeTravelPlan('huerfano', 'planet_a1', model, FULL)).toBeNull();
    });

    test('null when a cross-sector root has no coordinates', () => {
        expect(computeTravelPlan('planet_a1', 'perdido', model, FULL)).toBeNull();
        expect(computeTravelPlan('perdido', 'planet_a1', model, FULL)).toBeNull();
    });
});

// ── Intra-system ────────────────────────────────────────────────────────────

describe('computeTravelPlan intra-system', () => {
    test('same root = one flat leg regardless of depth, no fuel, no viveres', () => {
        expect(computeTravelPlan('planet_a1', 'site_a2', model, FULL)).toEqual({
            legs: [{ fromId: 'planet_a1', toId: 'site_a2', dias: 1, combustible: 0, viveres: 0 }],
            totalDias: 1,
            totalCombustible: 0,
            totalViveres: 0,
            warnings: [],
            portal: false,
        });
    });

    test('sistema to its own child is also a flat leg', () => {
        const plan = computeTravelPlan('sistema_a', 'planet_a1', model, FULL);
        expect(plan?.legs).toEqual([
            { fromId: 'sistema_a', toId: 'planet_a1', dias: 1, combustible: 0, viveres: 0 },
        ]);
    });
});

// ── Cross-sector legs ───────────────────────────────────────────────────────

describe('computeTravelPlan cross-sector', () => {
    test('three legs with ceil on the sector distance (√13 -> 4)', () => {
        expect(computeTravelPlan('site_a2', 'planet_b1', model, FULL)).toEqual({
            legs: [
                { fromId: 'site_a2', toId: 'sistema_a', dias: 1, combustible: 0, viveres: 0 },
                { fromId: 'sistema_a', toId: 'sistema_b', dias: 4, combustible: 1, viveres: 0 },
                // viveres = floor(6 / 4) = 1, carried by the last leg
                { fromId: 'sistema_b', toId: 'planet_b1', dias: 1, combustible: 0, viveres: 1 },
            ],
            totalDias: 6,
            totalCombustible: 1,
            totalViveres: 1,
            warnings: [],
            portal: false,
        });
    });

    test('origin IS its root: the up-leg is skipped', () => {
        const plan = computeTravelPlan('sistema_a', 'planet_b1', model, FULL);
        expect(plan?.legs).toEqual([
            { fromId: 'sistema_a', toId: 'sistema_b', dias: 4, combustible: 1, viveres: 0 },
            { fromId: 'sistema_b', toId: 'planet_b1', dias: 1, combustible: 0, viveres: 1 },
        ]);
        expect(plan?.totalDias).toBe(5);
    });

    test('destination IS its root: the down-leg is skipped, viveres land on the sector leg', () => {
        const plan = computeTravelPlan('site_a2', 'sistema_b', model, FULL);
        expect(plan?.legs).toEqual([
            { fromId: 'site_a2', toId: 'sistema_a', dias: 1, combustible: 0, viveres: 0 },
            { fromId: 'sistema_a', toId: 'sistema_b', dias: 4, combustible: 1, viveres: 1 },
        ]);
    });

    test('root to root: single sector leg carrying fuel and viveres', () => {
        expect(computeTravelPlan('sistema_a', 'sistema_b', model, FULL)).toEqual({
            legs: [{ fromId: 'sistema_a', toId: 'sistema_b', dias: 4, combustible: 1, viveres: 1 }],
            totalDias: 4,
            totalCombustible: 1,
            totalViveres: 1,
            warnings: [],
            portal: false,
        });
    });

    test('deep-space lugar acts as a sector root (√50 -> 8)', () => {
        const plan = computeTravelPlan('planet_a1', 'pocket_f', model, FULL);
        expect(plan?.legs).toEqual([
            { fromId: 'planet_a1', toId: 'sistema_a', dias: 1, combustible: 0, viveres: 0 },
            { fromId: 'sistema_a', toId: 'node_e', dias: 8, combustible: 1, viveres: 0 },
            // floor(10 / 4) = 2
            { fromId: 'node_e', toId: 'pocket_f', dias: 1, combustible: 0, viveres: 2 },
        ]);
        expect(plan?.totalDias).toBe(10);
        expect(plan?.totalViveres).toBe(2);
    });

    test('diasPorUnidad scales the sector leg before the ceil (√13 × 2 -> 8)', () => {
        const doubled = makeModel({ diasPorUnidad: 2 });
        const plan = computeTravelPlan('sistema_a', 'sistema_b', doubled, FULL);
        expect(plan?.legs[0].dias).toBe(8);
        expect(plan?.totalDias).toBe(8);
        // floor(8 / 4) = 2
        expect(plan?.totalViveres).toBe(2);
    });
});

// ── Portal access ───────────────────────────────────────────────────────────

describe('computeTravelPlan portal destinations', () => {
    const PORTAL_PLAN = {
        legs: [],
        totalDias: 0,
        totalCombustible: 0,
        totalViveres: 0,
        warnings: [],
        portal: true,
    };

    test('direct portal destination: no legs, portal true', () => {
        expect(computeTravelPlan('planet_a1', 'portal_gate', model, FULL)).toEqual(PORTAL_PLAN);
    });

    test('portal inherited through the en: chain', () => {
        expect(computeTravelPlan('planet_a1', 'portal_inner', model, FULL)).toEqual(PORTAL_PLAN);
    });

    test('portal wins even from inside the same system', () => {
        expect(computeTravelPlan('planet_b1', 'portal_inner', model, FULL)).toEqual(PORTAL_PLAN);
    });
});

// ── Consumption + warnings ──────────────────────────────────────────────────

describe('computeTravelPlan consumption and warnings', () => {
    test('short trips round viveres down to zero', () => {
        // 1 travel day, rations every 4 days -> 0 consumed.
        const plan = computeTravelPlan('planet_a1', 'site_a2', model, FULL);
        expect(plan?.totalViveres).toBe(0);
    });

    test('combustible burns only on the sector leg', () => {
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, FULL);
        expect(plan?.legs.map((leg) => leg.combustible)).toEqual([0, 1, 0]);
        expect(plan?.totalCombustible).toBe(1);
    });

    test('warnings when the snapshot cannot cover the totals', () => {
        const broke: TravelSnapshot = { medidores: { viveres: 0, combustible: 0, nave: 5 } };
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, broke);
        expect(plan?.warnings).toEqual([WARN_COMBUSTIBLE, WARN_VIVERES]);
    });

    test('only the short gauge warns; exact-enough passes clean', () => {
        const lowViveres: TravelSnapshot = { medidores: { viveres: 0, combustible: 1, nave: 5 } };
        expect(computeTravelPlan('site_a2', 'planet_b1', model, lowViveres)?.warnings).toEqual([
            WARN_VIVERES,
        ]);

        const exact: TravelSnapshot = { medidores: { viveres: 1, combustible: 1, nave: 5 } };
        expect(computeTravelPlan('site_a2', 'planet_b1', model, exact)?.warnings).toEqual([]);
    });

    test('missing gauges in the snapshot count as 0', () => {
        const empty: TravelSnapshot = { medidores: {} };
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, empty);
        expect(plan?.warnings).toEqual([WARN_COMBUSTIBLE, WARN_VIVERES]);
    });

    test('exact warning strings (UI + e2e contract)', () => {
        expect(WARN_COMBUSTIBLE).toBe('Combustible insuficiente');
        expect(WARN_VIVERES).toBe('Víveres insuficientes');
    });
});

// ── travelDaySchedule ───────────────────────────────────────────────────────

function scheduleTotals(days: { combustible: number; viveres: number }[]) {
    return days.reduce(
        (acc, day) => ({
            combustible: acc.combustible + day.combustible,
            viveres: acc.viveres + day.viveres,
        }),
        { combustible: 0, viveres: 0 }
    );
}

describe('travelDaySchedule', () => {
    test('cross-sector default: fuel on the sector leg last day, ration on day 4', () => {
        // legs 1 + 4 + 1 (site_a2 -> planet_b1), combustible 1 on the sector leg.
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, FULL)!;
        const days = travelDaySchedule(plan, model.manifest.viaje.viveresCadaDias);
        expect(days).toEqual([
            { combustible: 0, viveres: 0 },
            { combustible: 0, viveres: 0 },
            { combustible: 0, viveres: 0 },
            { combustible: 0, viveres: 1 }, // day 4: viveresCadaDias cadence
            { combustible: 1, viveres: 0 }, // day 5: last day of the 4-day sector leg
            { combustible: 0, viveres: 0 },
        ]);
    });

    test('per-day amounts always sum to the plan totals', () => {
        const plan = computeTravelPlan('planet_a1', 'pocket_f', model, FULL)!; // 10 days
        const days = travelDaySchedule(plan, model.manifest.viaje.viveresCadaDias);
        expect(days).toHaveLength(plan.totalDias);
        expect(scheduleTotals(days)).toEqual({
            combustible: plan.totalCombustible,
            viveres: plan.totalViveres,
        });
        // Rations at days 4 and 8 of the continuous trip.
        expect(days.map((day) => day.viveres)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
    });

    test('multi-unit fuel spreads at even boundaries within its leg', () => {
        const plan: TravelPlan = {
            legs: [{ fromId: 'a', toId: 'b', dias: 4, combustible: 2, viveres: 0 }],
            totalDias: 4,
            totalCombustible: 2,
            totalViveres: 0,
            warnings: [],
            portal: false,
        };
        // unit 1 -> ceil(1·4/2) = day 2, unit 2 -> ceil(2·4/2) = day 4.
        expect(travelDaySchedule(plan, 0).map((day) => day.combustible)).toEqual([0, 1, 0, 1]);
    });

    test('viveresCadaDias <= 0 charges no rations', () => {
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, FULL)!;
        const days = travelDaySchedule(plan, 0);
        expect(scheduleTotals(days).viveres).toBe(0);
    });

    test('a 0-day leg with fuel charges on the nearest existing day', () => {
        const plan: TravelPlan = {
            legs: [
                { fromId: 'a', toId: 'b', dias: 1, combustible: 0, viveres: 0 },
                { fromId: 'b', toId: 'c', dias: 0, combustible: 1, viveres: 0 },
            ],
            totalDias: 1,
            totalCombustible: 1,
            totalViveres: 0,
            warnings: [],
            portal: false,
        };
        expect(travelDaySchedule(plan, 4).map((day) => day.combustible)).toEqual([1]);
    });

    test('a 0-day plan yields an empty schedule', () => {
        const plan: TravelPlan = {
            legs: [],
            totalDias: 0,
            totalCombustible: 0,
            totalViveres: 0,
            warnings: [],
            portal: true,
        };
        expect(travelDaySchedule(plan, 4)).toEqual([]);
    });
});

// ── sectorLegEndDay ─────────────────────────────────────────────────────────

describe('sectorLegEndDay', () => {
    test('cumulative days through the sector leg (pre-leg + sector)', () => {
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, FULL)!; // 1 + 4 + 1
        expect(sectorLegEndDay(plan, model)).toBe(5);
    });

    test('root-to-root: the whole trip is the sector leg', () => {
        const plan = computeTravelPlan('sistema_a', 'sistema_b', model, FULL)!; // 4
        expect(sectorLegEndDay(plan, model)).toBe(4);
    });

    test('intra-system trips have no sector leg -> totalDias', () => {
        const plan = computeTravelPlan('planet_a1', 'site_a2', model, FULL)!; // 1
        expect(sectorLegEndDay(plan, model)).toBe(plan.totalDias);
    });
});
