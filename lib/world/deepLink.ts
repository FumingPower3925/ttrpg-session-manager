/**
 * Entity deep-link plumbing for /world (plan Part B: "selection deep-linked
 * `?e=<id>` via history.replaceState").
 *
 * Static-export-safe on purpose: no next/router (dynamic segments don't
 * exist in a static export) — plain History API only. Both functions are
 * SSR-guarded and no-op/return null without a window, so they can be called
 * from anywhere including module-level effects.
 */

/** Query param carrying the selected entity id. */
export const ENTITY_PARAM = 'e';

/** Reads the selected entity id from `?e=` in the current URL (null if absent/empty/SSR). */
export function readEntityFromUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const value = new URLSearchParams(window.location.search).get(ENTITY_PARAM);
    return value !== null && value !== '' ? value : null;
}

/**
 * Writes (id) or removes (null) `?e=` in the current URL without adding a
 * history entry. Other query params and the hash are preserved, and the
 * current history.state is passed through untouched (Next's App Router
 * keeps internal state there — clobbering it breaks back/forward).
 */
export function writeEntityToUrl(id: string | null): void {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (id === null) {
        url.searchParams.delete(ENTITY_PARAM);
    } else {
        url.searchParams.set(ENTITY_PARAM, id);
    }
    window.history.replaceState(window.history.state, '', url.toString());
}
