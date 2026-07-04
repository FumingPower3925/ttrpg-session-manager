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
    viveresTicksBetween,
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
    combustibleCadaDias: 4,
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
        musica: { bgm: [], eventPlaylists: [] },
    };
}

const model = makeModel();

/**
 * Comfortable snapshot: no warnings unless a test says otherwise. diaMundo 0
 * = "phase 0": víveres tick on absolute days 4, 8, 12…
 */
const FULL: TravelSnapshot = {
    medidores: { viveres: 5, combustible: 5, nave: 5 },
    diaMundo: 0,
};

function at(diaMundo: number, medidores = FULL.medidores): TravelSnapshot {
    return { medidores, diaMundo };
}

// ── viveresTicksBetween ─────────────────────────────────────────────────────

describe('viveresTicksBetween', () => {
    test('strictly (d0, d1]: the departure day itself never ticks', () => {
        // From 240 (already a multiple of 4), a 4-day advance ticks ONCE (244).
        expect(viveresTicksBetween(240, 244, 4)).toBe(1);
        expect(viveresTicksBetween(240, 241, 4)).toBe(0);
        expect(viveresTicksBetween(243, 244, 4)).toBe(1);
        expect(viveresTicksBetween(240, 248, 4)).toBe(2);
    });

    test('cada <= 0 or non-advance -> 0 (no division by zero, no loop)', () => {
        expect(viveresTicksBetween(10, 20, 0)).toBe(0);
        expect(viveresTicksBetween(10, 20, -3)).toBe(0);
        expect(viveresTicksBetween(20, 20, 4)).toBe(0);
        expect(viveresTicksBetween(20, 10, 4)).toBe(0);
    });

    test('cada = 1 ticks daily', () => {
        expect(viveresTicksBetween(5, 10, 1)).toBe(5);
    });

    test('negative days use floored division (calendar before the epoch)', () => {
        // (-5, -1] contains -4 -> 1 tick.
        expect(viveresTicksBetween(-5, -1, 4)).toBe(1);
        // (-2, 2] contains 0 -> 1 tick.
        expect(viveresTicksBetween(-2, 2, 4)).toBe(1);
    });

    test('property: equals the sum of per-day schedule ticks (random d0/D/cada)', () => {
        // Deterministic pseudo-random sample, incl. negative departures.
        const samples: [number, number, number][] = [
            [0, 10, 4],
            [3, 21, 4],
            [-7, 13, 4],
            [240, 8, 3],
            [999, 1, 5],
            [-1, 9, 1],
            [17, 40, 7],
        ];
        for (const [d0, dias, cada] of samples) {
            const plan: TravelPlan = {
                legs: [{ fromId: 'a', toId: 'b', dias, combustible: 0, viveres: 0 }],
                totalDias: dias,
                totalCombustible: 0,
                totalViveres: 0,
                warnings: [],
                portal: false,
            };
            const days = travelDaySchedule(plan, { combustibleCadaDias: 4, viveresCadaDias: cada }, d0);
            const sum = days.reduce((acc, day) => acc + day.viveres, 0);
            expect(sum).toBe(viveresTicksBetween(d0, d0 + dias, cada));
        }
    });
});

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
    test('same root = one flat leg regardless of depth, no fuel; viveres by phase', () => {
        expect(computeTravelPlan('planet_a1', 'site_a2', model, FULL)).toEqual({
            legs: [{ fromId: 'planet_a1', toId: 'site_a2', dias: 1, combustible: 0, viveres: 0 }],
            totalDias: 1,
            totalCombustible: 0,
            totalViveres: 0, // (0, 1] crosses no multiple of 4
            warnings: [],
            portal: false,
        });
    });

    test('the same hop on the eve of a ration day costs 1 víveres (calendar phase)', () => {
        const plan = computeTravelPlan('planet_a1', 'site_a2', model, at(3));
        expect(plan?.totalViveres).toBe(1); // (3, 4] crosses day 4
        expect(plan?.legs[0].viveres).toBe(1);
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
    test('three legs with ceil on the sector distance (√13 -> 4); fuel = ceil(4/4)', () => {
        expect(computeTravelPlan('site_a2', 'planet_b1', model, FULL)).toEqual({
            legs: [
                { fromId: 'site_a2', toId: 'sistema_a', dias: 1, combustible: 0, viveres: 0 },
                { fromId: 'sistema_a', toId: 'sistema_b', dias: 4, combustible: 1, viveres: 0 },
                // viveres = ticks in (0, 6] = 1, carried by the last leg
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

    test('deep-space lugar acts as a sector root (√50 -> 8); fuel = ceil(8/4) = 2', () => {
        const plan = computeTravelPlan('planet_a1', 'pocket_f', model, FULL);
        expect(plan?.legs).toEqual([
            { fromId: 'planet_a1', toId: 'sistema_a', dias: 1, combustible: 0, viveres: 0 },
            { fromId: 'sistema_a', toId: 'node_e', dias: 8, combustible: 2, viveres: 0 },
            // ticks in (0, 10] = days 4 and 8 -> 2
            { fromId: 'node_e', toId: 'pocket_f', dias: 1, combustible: 0, viveres: 2 },
        ]);
        expect(plan?.totalDias).toBe(10);
        expect(plan?.totalCombustible).toBe(2);
        expect(plan?.totalViveres).toBe(2);
    });

    test('diasPorUnidad scales the sector leg before the ceil (√13 × 2 -> 8)', () => {
        const doubled = makeModel({ diasPorUnidad: 2 });
        const plan = computeTravelPlan('sistema_a', 'sistema_b', doubled, FULL);
        expect(plan?.legs[0].dias).toBe(8);
        expect(plan?.totalDias).toBe(8);
        expect(plan?.totalCombustible).toBe(2); // ceil(8/4)
        expect(plan?.totalViveres).toBe(2); // ticks in (0, 8]
    });

    test('combustibleCadaDias <= 0 burns no fuel at all', () => {
        const free = makeModel({ combustibleCadaDias: 0 });
        const plan = computeTravelPlan('sistema_a', 'sistema_b', free, FULL);
        expect(plan?.totalCombustible).toBe(0);
        expect(plan?.legs[0].combustible).toBe(0);
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

    test('direct portal destination: no legs, portal true, zero consumption', () => {
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
    test('short trips at phase 0 consume no viveres', () => {
        // 1 travel day from day 0, rations on multiples of 4 -> 0 consumed.
        const plan = computeTravelPlan('planet_a1', 'site_a2', model, FULL);
        expect(plan?.totalViveres).toBe(0);
    });

    test('combustible burns only on the sector leg', () => {
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, FULL);
        expect(plan?.legs.map((leg) => leg.combustible)).toEqual([0, 1, 0]);
        expect(plan?.totalCombustible).toBe(1);
    });

    test('warnings when the snapshot cannot cover the totals', () => {
        const broke = at(0, { viveres: 0, combustible: 0, nave: 5 });
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, broke);
        expect(plan?.warnings).toEqual([WARN_COMBUSTIBLE, WARN_VIVERES]);
    });

    test('only the short gauge warns; exact-enough passes clean', () => {
        const lowViveres = at(0, { viveres: 0, combustible: 1, nave: 5 });
        expect(computeTravelPlan('site_a2', 'planet_b1', model, lowViveres)?.warnings).toEqual([
            WARN_VIVERES,
        ]);

        const exact = at(0, { viveres: 1, combustible: 1, nave: 5 });
        expect(computeTravelPlan('site_a2', 'planet_b1', model, exact)?.warnings).toEqual([]);
    });

    test('the departure phase can flip the viveres warning on the same route', () => {
        // 10-day trip: phase 0 -> 2 rations; phase 2 -> ticks at 4, 8, 12 = 3.
        const two = at(0, { viveres: 2, combustible: 5, nave: 5 });
        expect(computeTravelPlan('planet_a1', 'pocket_f', model, two)?.warnings).toEqual([]);
        const twoLater = at(2, { viveres: 2, combustible: 5, nave: 5 });
        expect(computeTravelPlan('planet_a1', 'pocket_f', model, twoLater)?.warnings).toEqual([
            WARN_VIVERES,
        ]);
    });

    test('missing gauges in the snapshot count as 0', () => {
        const empty = at(0, {});
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, empty);
        expect(plan?.warnings).toEqual([WARN_COMBUSTIBLE, WARN_VIVERES]);
    });

    test('exact warning strings (UI + e2e contract)', () => {
        expect(WARN_COMBUSTIBLE).toBe('Combustible insuficiente');
        expect(WARN_VIVERES).toBe('Víveres insuficientes');
    });
});

// ── travelDaySchedule ───────────────────────────────────────────────────────

const VIAJE_SCHED = { combustibleCadaDias: 4, viveresCadaDias: 4 };

function scheduleTotals(days: { combustible: number; viveres: number }[]) {
    return days.reduce(
        (acc, day) => ({
            combustible: acc.combustible + day.combustible,
            viveres: acc.viveres + day.viveres,
        }),
        { combustible: 0, viveres: 0 }
    );
}

/** Hand-built single-leg plan for schedule shape tests. */
function sectorPlan(dias: number, combustible: number): TravelPlan {
    return {
        legs: [{ fromId: 'a', toId: 'b', dias, combustible, viveres: 0 }],
        totalDias: dias,
        totalCombustible: combustible,
        totalViveres: 0,
        warnings: [],
        portal: false,
    };
}

describe('travelDaySchedule', () => {
    test('cross-sector default: fuel at the sector-leg cadence boundary, ration on day 4', () => {
        // legs 1 + 4 + 1 (site_a2 -> planet_b1); sector leg = trip days 2..5,
        // fuel tick on leg-day 4 = trip day 5.
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, FULL)!;
        const days = travelDaySchedule(plan, model.manifest.viaje, 0);
        expect(days).toEqual([
            { combustible: 0, viveres: 0 },
            { combustible: 0, viveres: 0 },
            { combustible: 0, viveres: 0 },
            { combustible: 0, viveres: 1 }, // dia_mundo 4: calendar cadence
            { combustible: 1, viveres: 0 }, // sector leg-day 4
            { combustible: 0, viveres: 0 },
        ]);
    });

    test('per-day amounts always sum to the plan totals (same diaMundo0)', () => {
        const plan = computeTravelPlan('planet_a1', 'pocket_f', model, FULL)!; // 10 days
        const days = travelDaySchedule(plan, model.manifest.viaje, 0);
        expect(days).toHaveLength(plan.totalDias);
        expect(scheduleTotals(days)).toEqual({
            combustible: plan.totalCombustible,
            viveres: plan.totalViveres,
        });
        // Rations on absolute days 4 and 8 of the calendar.
        expect(days.map((day) => day.viveres)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0]);
        // Fuel inside the 8-day sector leg (trip days 2..9): leg-days 4, 8.
        expect(days.map((day) => day.combustible)).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 1, 0]);
    });

    test('fuel remainder lands on the leg last day: D=7 -> days 4 and 7', () => {
        const days = travelDaySchedule(sectorPlan(7, 2), VIAJE_SCHED, 0);
        expect(days.map((day) => day.combustible)).toEqual([0, 0, 0, 1, 0, 0, 1]);
    });

    test('no phantom remainder on exact multiples: D=8 -> days 4 and 8', () => {
        const days = travelDaySchedule(sectorPlan(8, 2), VIAJE_SCHED, 0);
        expect(days.map((day) => day.combustible)).toEqual([0, 0, 0, 1, 0, 0, 0, 1]);
    });

    test('short legs charge on arrival: D=3 -> day 3; D=4 -> day 4', () => {
        expect(travelDaySchedule(sectorPlan(3, 1), VIAJE_SCHED, 0).map((d) => d.combustible)).toEqual([
            0, 0, 1,
        ]);
        expect(travelDaySchedule(sectorPlan(4, 1), VIAJE_SCHED, 0).map((d) => d.combustible)).toEqual([
            0, 0, 0, 1,
        ]);
    });

    test('viveres ticks follow the CALENDAR phase, not the trip start', () => {
        // 4-day trip from dia_mundo 2: multiples of 4 in (2, 6] = {4} -> trip day 2.
        const days = travelDaySchedule(sectorPlan(4, 1), VIAJE_SCHED, 2);
        expect(days.map((day) => day.viveres)).toEqual([0, 1, 0, 0]);
    });

    test('viveres ticks may land on intra legs of a multi-leg trip', () => {
        // 1 + 7 + 1 from phase 0: rations on trip days 4 and 8 (both inside
        // the sector leg here), fuel on sector leg-days 4 and 7 = trip 5 and 8.
        const plan: TravelPlan = {
            legs: [
                { fromId: 'a', toId: 'r1', dias: 1, combustible: 0, viveres: 0 },
                { fromId: 'r1', toId: 'r2', dias: 7, combustible: 2, viveres: 0 },
                { fromId: 'r2', toId: 'b', dias: 1, combustible: 0, viveres: 0 },
            ],
            totalDias: 9,
            totalCombustible: 2,
            totalViveres: 0,
            warnings: [],
            portal: false,
        };
        const days = travelDaySchedule(plan, VIAJE_SCHED, 0);
        expect(days.map((day) => day.viveres)).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        expect(days.map((day) => day.combustible)).toEqual([0, 0, 0, 0, 1, 0, 0, 1, 0]);
    });

    test('cada = 1 ticks viveres daily (clamp path exercises every day)', () => {
        const days = travelDaySchedule(
            sectorPlan(5, 2),
            { combustibleCadaDias: 4, viveresCadaDias: 1 },
            5
        );
        expect(days.map((day) => day.viveres)).toEqual([1, 1, 1, 1, 1]);
    });

    test('hand-built legs off the cadence keep the even spread (totals invariant)', () => {
        // combustible 2 != ceil(4/4): legacy spread — unit i on ceil(i·D/C).
        const days = travelDaySchedule(sectorPlan(4, 2), VIAJE_SCHED, 0);
        expect(days.map((day) => day.combustible)).toEqual([0, 1, 0, 1]);
    });

    test('viveresCadaDias <= 0 charges no rations', () => {
        const plan = computeTravelPlan('site_a2', 'planet_b1', model, FULL)!;
        const days = travelDaySchedule(plan, { combustibleCadaDias: 4, viveresCadaDias: 0 }, 0);
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
        expect(travelDaySchedule(plan, VIAJE_SCHED, 0).map((day) => day.combustible)).toEqual([1]);
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
        expect(travelDaySchedule(plan, VIAJE_SCHED, 0)).toEqual([]);
    });

    test('stepping day-by-day equals resolving in one batch (phase-dependent)', () => {
        for (const d0 of [0, 1, 2, 3, 240, 4127]) {
            const plan = computeTravelPlan('planet_a1', 'pocket_f', model, at(d0))!;
            const days = travelDaySchedule(plan, model.manifest.viaje, d0);
            expect(scheduleTotals(days)).toEqual({
                combustible: plan.totalCombustible,
                viveres: plan.totalViveres,
            });
        }
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
