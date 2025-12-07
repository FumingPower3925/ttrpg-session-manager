import { EventPlaylist } from '@/types';

/**
 * Performs fuzzy matching of a query against a text string.
 * Characters must appear in order but not necessarily consecutively.
 * Case-insensitive.
 */
export function fuzzyMatch(text: string, query: string): boolean {
    if (!query) return true;
    if (!text) return false;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    let textIndex = 0;
    let queryIndex = 0;

    while (textIndex < lowerText.length && queryIndex < lowerQuery.length) {
        if (lowerText[textIndex] === lowerQuery[queryIndex]) {
            queryIndex++;
        }
        textIndex++;
    }

    return queryIndex === lowerQuery.length;
}

/**
 * Calculates a fuzzy match score (higher is better).
 * Returns 0 if no match, higher values for better matches.
 */
export function fuzzyScore(text: string, query: string): number {
    if (!query) return 1;
    if (!text) return 0;

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();

    if (lowerText === lowerQuery) return 100;

    if (lowerText.includes(lowerQuery)) return 80;

    if (lowerText.startsWith(lowerQuery)) return 90;
    let textIndex = 0;
    let queryIndex = 0;
    let consecutiveMatches = 0;
    let maxConsecutive = 0;
    let totalMatches = 0;

    while (textIndex < lowerText.length && queryIndex < lowerQuery.length) {
        if (lowerText[textIndex] === lowerQuery[queryIndex]) {
            queryIndex++;
            totalMatches++;
            consecutiveMatches++;
            maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
        } else {
            consecutiveMatches = 0;
        }
        textIndex++;
    }

    if (queryIndex < lowerQuery.length) return 0;

    const coverage = totalMatches / lowerText.length;
    const consecutiveBonus = maxConsecutive / lowerQuery.length;

    return 20 + (coverage * 30) + (consecutiveBonus * 30);
}

/**
 * Filters playlists based on a fuzzy search query.
 * Returns playlists sorted by match score (best matches first).
 */
export function filterPlaylists(
    playlists: EventPlaylist[],
    query: string
): EventPlaylist[] {
    if (!query.trim()) return playlists;

    const scored = playlists
        .map((playlist) => ({
            playlist,
            score: fuzzyScore(playlist.name, query),
        }))
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score);

    return scored.map(({ playlist }) => playlist);
}
