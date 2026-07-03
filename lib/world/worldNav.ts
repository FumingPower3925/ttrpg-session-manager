/**
 * Pure navigation helpers for the world map tiers (M2).
 *
 * The map has two spatial tiers (sector, system) plus a non-spatial third one
 * (SiteList). These helpers answer, for any entity id, "where does it live on
 * the map?" — used by search selection, ?e= deep links, the party-bar
 * breadcrumb and the party-marker roll-up. All pure over a WorldModel: no
 * store access, bun-testable without a DOM.
 */

import { PlaceEntity, WorldEntityBase, WorldModel } from '@/types/world';

export type WorldTier = 'sector' | 'system';

/** Where an entity lives on the map: which tier to show and what to open. */
export interface TierTarget {
    tier: WorldTier;
    /** Sistema to focus when tier === 'system'; null at the sector tier. */
    focusSystemId: string | null;
    /** Direct parent whose SiteList (tier 3) contains the entity, if any. */
    siteListId: string | null;
}

function isPlace(entity: WorldEntityBase | undefined): entity is PlaceEntity {
    // Every scanned lugar carries `servicios` (buildLugar defaults it to []).
    return entity !== undefined && 'servicios' in entity;
}

/** [id, parent, grandparent, ...] following `en:` up to the root (cycle-guarded). */
export function ancestryChain(model: WorldModel, startId: string): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let id: string | undefined = startId;
    while (id !== undefined && !seen.has(id)) {
        seen.add(id);
        chain.push(id);
        const entity = model.entidades.get(id) as Partial<PlaceEntity> | undefined;
        id = entity?.en;
    }
    return chain;
}

/**
 * Sector-tier node representing an entity: the root of its `en:` chain
 * (a sistema or a deep-space lugar). Null when the chain dead-ends on a
 * missing entity (dangling ref) — there is nothing to mark on the map.
 */
export function sectorNodeFor(model: WorldModel, entityId: string): string | null {
    const chain = ancestryChain(model, entityId);
    const rootId = chain[chain.length - 1];
    return rootId !== undefined && model.entidades.has(rootId) ? rootId : null;
}

/**
 * Node representing `entityId` inside `containerId`'s view: the container
 * itself when they match, otherwise the container's DIRECT child on the
 * entity's ancestry chain (e.g. the party at a site rolls up to the site's
 * station at the system tier). Null when the entity is not inside the
 * container.
 */
export function childNodeWithin(
    model: WorldModel,
    entityId: string,
    containerId: string
): string | null {
    if (entityId === containerId) return containerId;
    const chain = ancestryChain(model, entityId);
    const index = chain.indexOf(containerId);
    return index > 0 ? chain[index - 1] : null;
}

/**
 * Map placement for an entity (search/deep-link navigation):
 *   - sistema            -> sector tier, selected (drill-in is a separate act)
 *   - deep-space lugar   -> sector tier
 *   - lugar in a sistema -> system tier focused on the root sistema
 *   - deeper site        -> additionally opens its direct parent's SiteList
 * Null for non-spatial entities (facciones, pnjs, pistas, tramas) and for
 * places whose `en:` chain dangles — selection still works, the map stays put.
 */
export function tierTargetFor(model: WorldModel, entityId: string): TierTarget | null {
    const entity = model.entidades.get(entityId);
    if (!entity) return null;

    if (entity.tipo === 'sistema') {
        return { tier: 'sector', focusSystemId: null, siteListId: null };
    }
    if (!isPlace(entity)) return null;

    const chain = ancestryChain(model, entityId);
    const rootId = chain[chain.length - 1];
    const root = model.entidades.get(rootId);
    if (!root) return null; // dangling `en:` — no reliable map placement

    const parentListId = chain.length > 1 ? chain[1] : null;

    if (root.tipo === 'sistema') {
        return {
            tier: 'system',
            focusSystemId: rootId,
            // Direct children sit on the system view itself; deeper sites open
            // their direct parent's list so the row highlights.
            siteListId: parentListId === rootId ? null : parentListId,
        };
    }

    // Deep-space root (own coords, no `en:`) — sector tier; interior entities
    // open their direct parent's SiteList on top of it.
    return {
        tier: 'sector',
        focusSystemId: null,
        siteListId: entityId === rootId ? null : parentListId,
    };
}
