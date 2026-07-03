/**
 * Pure travel-plan math (M4, plan Part B "Travel").
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
 * Consumption (manifest suggestions — the app proposes, the GM confirms):
 *   - combustible: combustiblePorTramo on the SECTOR leg only; intra-system
 *     legs burn 0.
 *   - viveres: floor(totalDias / viveresCadaDias) for the WHOLE trip,
 *     carried by the LAST leg (a per-leg floor would undercount, e.g.
 *     1+4+1 days at "every 4" is 1 ration, not 0+1+0 recomputed per leg
 *     boundaries — the trip is one continuous stretch of days).
 *
 * Everything is pure over the WorldModel + a party gauge snapshot: no store
 * access, bun-testable without a DOM.
 *
 * The stepper-side helpers below (M4 integration) derive the PER-DAY view of
 * a plan:
 *   - travelDaySchedule: which travel day charges which gauge, summing
 *     exactly to the plan totals (documented on the function).
 *   - sectorLegEndDay: the 1-based day after which the route context (event
 *     region anchoring) switches from the origin to the destination.
 */

import { TravelLeg, TravelPlan, WorldEntityBase, WorldModel } from '@/types/world';
import { ancestryChain, sectorNodeFor } from './worldNav';

/** Current party gauges the plan's totals are checked against. */
export interface TravelSnapshot {
    medidores: Record<string, number>;
}

/** Exact warning strings (TravelDialog banners + e2e assert on these). */
export const WARN_COMBUSTIBLE = 'Combustible insuficiente';
export const WARN_VIVERES = 'Víveres insuficientes';

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
        legs.push(leg(fromRoot, toRoot, sectorDias, viaje.combustiblePorTramo));
        if (toId !== toRoot) {
            legs.push(leg(toRoot, toId, viaje.intrasistemaDias, 0));
        }
    }

    const totalDias = legs.reduce((sum, current) => sum + current.dias, 0);
    const totalCombustible = legs.reduce((sum, current) => sum + current.combustible, 0);
    const totalViveres =
        viaje.viveresCadaDias > 0 ? Math.floor(totalDias / viaje.viveresCadaDias) : 0;
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
 * Per-day consumption schedule for a plan, length plan.totalDias.
 *
 * DOCUMENTED CONSUMPTION MODEL (the stepper journals from this):
 *   - combustible: each leg's units are spread across THAT leg's days at
 *     evenly spaced boundaries — unit i of C lands on leg-day ceil(i·D/C).
 *     With the default combustible_por_tramo = 1 the single unit lands on the
 *     sector leg's LAST day (the burn is acknowledged on completing the jump).
 *     A degenerate 0-day leg charges its units on the nearest existing day.
 *   - víveres: 1 ration on every viveresCadaDias-th day of the WHOLE trip
 *     (days are one continuous stretch, matching computeTravelPlan's
 *     floor(totalDias / viveresCadaDias) total); viveresCadaDias <= 0 = none.
 *
 * Per-day amounts therefore sum EXACTLY to plan.totalCombustible /
 * plan.totalViveres — stepping every day equals resolving the rest in one
 * batch. (The per-leg `viveres` bookkeeping on plan.legs is ignored here on
 * purpose: the cadence is trip-global, only the totals must agree.)
 */
export function travelDaySchedule(
    plan: TravelPlan,
    viveresCadaDias: number
): TravelDayConsumption[] {
    const days: TravelDayConsumption[] = Array.from({ length: Math.max(0, plan.totalDias) }, () => ({
        combustible: 0,
        viveres: 0,
    }));
    if (days.length === 0) return days;

    let offset = 0; // 0-based index of the current leg's first day
    for (const current of plan.legs) {
        if (current.combustible > 0) {
            if (current.dias <= 0) {
                days[Math.min(offset, days.length - 1)].combustible += current.combustible;
            } else {
                for (let unit = 1; unit <= current.combustible; unit++) {
                    const dayInLeg = Math.ceil((unit * current.dias) / current.combustible);
                    days[Math.min(offset + dayInLeg - 1, days.length - 1)].combustible += 1;
                }
            }
        }
        offset += Math.max(0, current.dias);
    }

    if (viveresCadaDias > 0) {
        for (let dia = viveresCadaDias; dia <= days.length; dia += viveresCadaDias) {
            days[dia - 1].viveres += 1;
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
