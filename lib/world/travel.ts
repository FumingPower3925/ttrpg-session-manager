/**
 * Pure travel-plan math (M4, plan Part B "Travel"; economy redesign — see
 * CONSUMPTION MODEL below).
 *
 * computeTravelPlan proposes a route + consumption for a trip between two
 * known entities:
 *   - `acceso: portal` on the destination or anywhere up its `en:` chain
 *     means no route is computable (plan Part A) — the plan comes back with
 *     `portal: true` and no legs; the GM logs the arrival manually.
 *   - Endpoints resolve to their sector root (worldNav sectorNodeFor): the
 *     sistema or deep-space lugar that sits at coordinates on the sector map.
 *   - Same root  -> one flat intra-system leg (manifest intrasistemaDias).
 *   - Different roots -> up to three legs: origin -> its root (skipped when
 *     the origin IS the root), root -> root sector leg with
 *     dias = ceil(euclidean(coords) * diasPorUnidad), root -> destination
 *     (skipped when the destination IS the root).
 *
 * CONSUMPTION MODEL (manifest suggestions — the app proposes, the GM
 * confirms; two clean axes: food = calendar time, fuel = jump distance):
 *   - combustible: ceil(leg.dias / combustibleCadaDias) per SECTOR leg
 *     (jump-drive fuel); intra-system legs burn 0 — cheap local moves are
 *     the sandbox's agency loop. combustibleCadaDias <= 0 -> 0.
 *   - viveres: CALENDAR-anchored — 1 ration every viveresCadaDias-th
 *     dia_mundo, so the total for a trip is viveresTicksBetween(d0, d0 +
 *     totalDias): the same route costs 1 more or less depending on the
 *     departure-day phase, and the TravelDialog previews the exact number.
 *     The departure day itself never ticks (strictly (d0, d1]).
 *
 * Everything is pure over the WorldModel + a party snapshot (gauges +
 * diaMundo): no store access, bun-testable without a DOM.
 *
 * The stepper-side helpers below (M4 integration) derive the PER-DAY view of
 * a plan:
 *   - travelDaySchedule: which travel day charges which gauge, summing
 *     exactly to the plan totals (documented on the function).
 *   - sectorLegEndDay: the 1-based day after which the route context (event
 *     region anchoring) switches from the origin to the destination.
 */

import { TravelLeg, TravelPlan, WorldEntityBase, WorldManifest, WorldModel } from '@/types/world';
import { ancestryChain, sectorNodeFor } from './worldNav';

/** Current party gauges + calendar day the plan's totals are computed against. */
export interface TravelSnapshot {
    medidores: Record<string, number>;
    /** Departure dia_mundo — viveres ticks are calendar-anchored on it. */
    diaMundo: number;
}

/** Exact warning strings (TravelDialog banners + e2e assert on these). */
export const WARN_COMBUSTIBLE = 'Combustible insuficiente';
export const WARN_VIVERES = 'Víveres insuficientes';

/** Floored modulo (negative-safe): mod(-1, 4) === 3. */
function mod(n: number, m: number): number {
    return ((n % m) + m) % m;
}

/**
 * Víveres ticks consumed when dia_mundo advances from d0 to d1 (exclusive of
 * d0, inclusive of d1): one tick per multiple of `cada` crossed. dia_mundo is
 * the only accumulator — no remainder state anywhere. `cada <= 0` or a
 * non-advance returns 0.
 */
export function viveresTicksBetween(d0: number, d1: number, cada: number): number {
    if (cada <= 0 || d1 <= d0) return 0;
    return Math.floor(d1 / cada) - Math.floor(d0 / cada);
}

function isPortal(entity: WorldEntityBase | undefined): boolean {
    return (entity as { acceso?: string } | undefined)?.acceso === 'portal';
}

/** Sector coordinates of a root entity (sistema or deep-space lugar). */
function coordsOf(entity: WorldEntityBase | undefined): { x: number; y: number } | null {
    const coords = (entity as { coordenadas?: { x: number; y: number } } | undefined)?.coordenadas;
    return coords ?? null;
}

function leg(fromId: string, toId: string, dias: number, combustible: number): TravelLeg {
    return { fromId, toId, dias, combustible, viveres: 0 };
}

/** Sector-leg fuel: 1 unit per `cada` days of the leg, rounded up. */
function sectorLegCombustible(dias: number, cada: number): number {
    if (cada <= 0 || dias <= 0) return 0;
    return Math.ceil(dias / cada);
}

/**
 * Route + consumption proposal from `fromId` to `toId`, or null when no plan
 * makes sense: unknown ids, toId === fromId, or a route whose sector root has
 * no coordinates (dangling `en:` chain / rootless lugar — nothing to measure).
 */
export function computeTravelPlan(
    fromId: string,
    toId: string,
    model: WorldModel,
    party: TravelSnapshot
): TravelPlan | null {
    if (fromId === toId) return null;
    if (!model.entidades.has(fromId) || !model.entidades.has(toId)) return null;

    // Portal access anywhere on the destination's chain: reachable, but not
    // by a computable route.
    const destChain = ancestryChain(model, toId);
    if (destChain.some((id) => isPortal(model.entidades.get(id)))) {
        return {
            legs: [],
            totalDias: 0,
            totalCombustible: 0,
            totalViveres: 0,
            warnings: [],
            portal: true,
        };
    }

    const fromRoot = sectorNodeFor(model, fromId);
    const toRoot = sectorNodeFor(model, toId);
    if (fromRoot === null || toRoot === null) return null;

    const { viaje } = model.manifest;
    const legs: TravelLeg[] = [];

    if (fromRoot === toRoot) {
        // Intra-system hop: flat cost regardless of depth, no fuel burn.
        legs.push(leg(fromId, toId, viaje.intrasistemaDias, 0));
    } else {
        const fromCoords = coordsOf(model.entidades.get(fromRoot));
        const toCoords = coordsOf(model.entidades.get(toRoot));
        if (fromCoords === null || toCoords === null) return null;

        if (fromId !== fromRoot) {
            legs.push(leg(fromId, fromRoot, viaje.intrasistemaDias, 0));
        }
        const distance = Math.hypot(toCoords.x - fromCoords.x, toCoords.y - fromCoords.y);
        const sectorDias = Math.ceil(distance * viaje.diasPorUnidad);
        legs.push(
            leg(fromRoot, toRoot, sectorDias, sectorLegCombustible(sectorDias, viaje.combustibleCadaDias))
        );
        if (toId !== toRoot) {
            legs.push(leg(toRoot, toId, viaje.intrasistemaDias, 0));
        }
    }

    const totalDias = legs.reduce((sum, current) => sum + current.dias, 0);
    const totalCombustible = legs.reduce((sum, current) => sum + current.combustible, 0);
    // Calendar-anchored: phase-dependent on the departure day (module doc).
    const totalViveres = viveresTicksBetween(
        party.diaMundo,
        party.diaMundo + totalDias,
        viaje.viveresCadaDias
    );
    legs[legs.length - 1].viveres = totalViveres;

    const warnings: string[] = [];
    if (totalCombustible > (party.medidores['combustible'] ?? 0)) {
        warnings.push(WARN_COMBUSTIBLE);
    }
    if (totalViveres > (party.medidores['viveres'] ?? 0)) {
        warnings.push(WARN_VIVERES);
    }

    return { legs, totalDias, totalCombustible, totalViveres, warnings, portal: false };
}

// ── Per-day stepper helpers (M4 integration) ────────────────────────────────

/** What one travel day consumes; index d-1 of the schedule = travel day d (1-based). */
export interface TravelDayConsumption {
    combustible: number;
    viveres: number;
}

/**
 * 1-based leg days on which a leg burns fuel.
 *
 * When the leg's units equal ceil(dias / cada) — every computeTravelPlan leg —
 * the burn lands on leg-days cada, 2·cada, … floor(D/cada)·cada plus one
 * remainder tick on the leg's LAST day when D % cada != 0 (a 7-day jump at
 * cada 4 burns on days 4 and 7; an 8-day jump on 4 and 8 — no phantom
 * remainder). Hand-built plans whose units do not match the cadence keep the
 * legacy even spread (unit i of C on leg-day ceil(i·D/C)) so per-day amounts
 * still sum exactly to the leg total.
 */
function fuelTickDaysForLeg(dias: number, combustible: number, cada: number): number[] {
    if (combustible <= 0 || dias <= 0) return [];
    if (cada > 0 && combustible === Math.ceil(dias / cada)) {
        const days: number[] = [];
        for (let day = cada; day <= dias; day += cada) days.push(day);
        if (dias % cada !== 0) days.push(dias);
        return days;
    }
    return Array.from({ length: combustible }, (_, unit) =>
        Math.ceil(((unit + 1) * dias) / combustible)
    );
}

/**
 * Per-day consumption schedule for a plan, length plan.totalDias.
 *
 * DOCUMENTED CONSUMPTION MODEL (the stepper journals from this):
 *   - combustible: each leg's units spread inside THAT leg per
 *     fuelTickDaysForLeg (cadence boundaries + remainder on the last day).
 *     A degenerate 0-day leg charges its units on the nearest existing day.
 *   - víveres: CALENDAR-anchored — travel day d (1-based) ticks iff
 *     (diaMundo0 + d) is a multiple of viveresCadaDias (floored modulo, so
 *     negative days behave). Ticks may land on intra-system leg days: the
 *     cadence tracks dia_mundo, not the leg structure.
 *
 * Per-day amounts therefore sum EXACTLY to plan.totalCombustible /
 * plan.totalViveres for plans computed with the same diaMundo0 — stepping
 * every day equals resolving the rest in one batch. (The per-leg `viveres`
 * bookkeeping on plan.legs is ignored here on purpose: the cadence is
 * calendar-global, only the totals must agree.)
 */
export function travelDaySchedule(
    plan: TravelPlan,
    viaje: Pick<WorldManifest['viaje'], 'combustibleCadaDias' | 'viveresCadaDias'>,
    diaMundo0: number
): TravelDayConsumption[] {
    const days: TravelDayConsumption[] = Array.from({ length: Math.max(0, plan.totalDias) }, () => ({
        combustible: 0,
        viveres: 0,
    }));
    if (days.length === 0) return days;

    let offset = 0; // 0-based index of the current leg's first day
    for (const current of plan.legs) {
        if (current.combustible > 0 && current.dias <= 0) {
            days[Math.min(offset, days.length - 1)].combustible += current.combustible;
        } else {
            for (const dayInLeg of fuelTickDaysForLeg(
                current.dias,
                current.combustible,
                viaje.combustibleCadaDias
            )) {
                days[Math.min(offset + dayInLeg - 1, days.length - 1)].combustible += 1;
            }
        }
        offset += Math.max(0, current.dias);
    }

    if (viaje.viveresCadaDias > 0) {
        for (let dia = 1; dia <= days.length; dia++) {
            if (mod(diaMundo0 + dia, viaje.viveresCadaDias) === 0) days[dia - 1].viveres += 1;
        }
    }
    return days;
}

/**
 * Last 1-based travel day of the plan's sector leg (the leg whose endpoints
 * resolve to DIFFERENT sector roots): while `dia <= sectorLegEndDay` the trip
 * is still on the origin side, afterwards on the destination side — the
 * event-draw context anchors on origin/destination accordingly. Plans with no
 * sector leg (single-root trips) return plan.totalDias: origin and
 * destination share the root, so the anchor choice is moot.
 */
export function sectorLegEndDay(plan: TravelPlan, model: WorldModel): number {
    let cumulative = 0;
    for (const current of plan.legs) {
        cumulative += current.dias;
        if (sectorNodeFor(model, current.fromId) !== sectorNodeFor(model, current.toId)) {
            return cumulative;
        }
    }
    return plan.totalDias;
}
