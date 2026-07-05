/**
 * Story-threads ("Hilos") map geometry (feature — Hilos de historia).
 *
 * A trama (story arc) touches a set of lugares (its `lugaresClave` plus the
 * `donde` of its child pistas). tramaThreadNodes resolves each of those places
 * to its SECTOR-tier root node (via sectorNodeFor, walking the `en:` chain),
 * dedupes the roots, and returns their map-pixel positions so ThreadLayer can
 * paint the narrative web on the sector map.
 *
 * Pure over a WorldModel — no store/DOM access, bun-testable. Never throws: a
 * stale/unknown/empty trama simply yields an empty node list.
 */

import type { PlaceEntity, Trama, WorldModel } from '@/types/world';
import { WORLD_SCALE } from './constants';
import { sectorNodeFor } from './worldNav';

/** Rol accent colors shared by the Hilos tab and the map ThreadLayer. */
export const TRAMA_ROL_COLOR: Record<Trama['rol'], string> = {
    principal: '#f59e0b', // amber-500
    secundaria: '#0ea5e9', // sky-500
    ambiental: '#8b5cf6', // violet-500
};

/** One thread endpoint: a sector-tier root node id + its map-pixel position. */
export interface ThreadNode {
    id: string;
    x: number;
    y: number;
}

export interface TramaThreadNodes {
    /** Deduped sector-root nodes with coordinates, in map pixels. */
    nodes: ThreadNode[];
    /** The trama's raw place ids (lugaresClave ++ pistas.donde), pre-resolution. */
    places: string[];
}

/**
 * Sector-map nodes a trama's narrative web connects.
 *
 * Collects the trama's place ids (lugaresClave ++ each child pista's `donde`,
 * dropping absent ones), maps each to its sector-tier root via sectorNodeFor,
 * dedupes the roots, and emits {id, x, y} in map pixels (coord × WORLD_SCALE)
 * for every root that carries `coordenadas`. Roots without coords (or dangling
 * chains) are skipped. Returns empty `nodes` for an unknown/empty trama.
 */
export function tramaThreadNodes(model: WorldModel, tramaId: string): TramaThreadNodes {
    const trama = model.tramas.find((t) => t.id === tramaId);
    if (!trama) return { nodes: [], places: [] };

    const places: string[] = [
        ...trama.lugaresClave,
        ...trama.pistas.map((p) => p.donde).filter((d): d is string => Boolean(d)),
    ];

    const nodes: ThreadNode[] = [];
    const seenRoots = new Set<string>();
    for (const placeId of places) {
        const rootId = sectorNodeFor(model, placeId);
        if (rootId === null || seenRoots.has(rootId)) continue;
        seenRoots.add(rootId);
        const root = model.entidades.get(rootId) as Partial<PlaceEntity> | undefined;
        const coords = root?.coordenadas;
        if (!coords) continue; // system-less / coord-less root — nothing to place
        nodes.push({ id: rootId, x: coords.x * WORLD_SCALE, y: coords.y * WORLD_SCALE });
    }

    return { nodes, places };
}
