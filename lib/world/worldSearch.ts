/**
 * World-mode entity search (plan M2).
 *
 * Mirrors the lunr setup pattern of lib/search.ts (SearchManager) but as a
 * standalone builder: SearchManager is Part-coupled (FileReference paths,
 * partId/partName, path filters) while the world index refs entity ids, so
 * composition beats subclassing here. The result shape is the small adapter
 * type WorldSearchResult the world SearchDialog consumes.
 *
 * Accent handling: lunr's default pipeline is accent-SENSITIVE (tokens keep
 * their diacritics), which is unusable for Spanish content — the GM types
 * "estacion" for "Estación" half the time. We therefore fold diacritics
 * (NFD-decompose + strip combining marks) on BOTH the indexed text and the
 * query, so matching is accent-insensitive while results keep the original
 * accented strings for display.
 */

import lunr from 'lunr';
import { WorldModel } from '@/types/world';

export interface WorldSearchResult {
    /** Entity id (= filename), usable directly as selectedEntityId. */
    id: string;
    nombre: string;
    tipo: string;
    /** Markdown-stripped context around the first match (may be ''). */
    snippet: string;
}

export interface WorldSearchIndex {
    /** Number of indexed entities. */
    size: number;
    /**
     * Searches indexed entities. Each whitespace-separated term matches
     * exactly OR as a prefix (trailing wildcard), so results appear while
     * typing; exact matches rank higher. Returns [] for empty/garbage
     * queries — never throws.
     */
    search: (query: string, maxResults?: number) => WorldSearchResult[];
}

/** Strips diacritics: "Estación" -> "Estacion", "ñ" -> "n". */
function foldDiacritics(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Strips light markdown so snippets read as prose (same rules as SearchManager). */
function cleanMarkdown(content: string): string {
    return content
        .replace(/#{1,6}\s/g, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/\*(.+?)\*/g, '$1')
        .replace(/\[(.+?)\]\(.+?\)/g, '$1')
        .replace(/`(.+?)`/g, '$1');
}

/**
 * Extracts a snippet centered on the first folded-term match.
 * `content` must be NFC-normalized so folded indices line up with the
 * original string (precomposed accents fold 1:1 in length).
 */
function extractSnippet(content: string, foldedTerms: string[], contextLength: number = 150): string {
    const clean = cleanMarkdown(content);
    const foldedClean = foldDiacritics(clean).toLowerCase();

    let matchIndex = -1;
    for (const term of foldedTerms) {
        matchIndex = foldedClean.indexOf(term);
        if (matchIndex !== -1) break;
    }

    if (matchIndex === -1) {
        // Match was in nombre/tipo only — show the start of the body as context.
        return clean.length > contextLength
            ? clean.substring(0, contextLength).trim() + '...'
            : clean.trim();
    }

    const start = Math.max(0, matchIndex - contextLength / 2);
    const end = Math.min(clean.length, matchIndex + contextLength / 2);

    let snippet = clean.substring(start, end);
    if (start > 0) snippet = '...' + snippet;
    if (end < clean.length) snippet = snippet + '...';
    return snippet.trim();
}

/**
 * Builds an in-memory search index over every entity of a WorldModel.
 * Fields: nombre (boost 10), tipo (boost 5), content (resumen + estado + body).
 * Pure/synchronous — rebuild after each world rescan (models are
 * immutable-after-scan, so the index never goes stale within a scan).
 */
export function buildWorldSearchIndex(model: WorldModel): WorldSearchIndex {
    const docs = new Map<string, { nombre: string; tipo: string; content: string }>();

    for (const entity of model.entidades.values()) {
        const content = [entity.resumen, entity.estado, entity.body]
            .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
            .join('\n\n')
            .normalize('NFC');
        docs.set(entity.id, {
            nombre: entity.nombre,
            tipo: entity.tipo,
            content,
        });
    }

    const index = lunr(function () {
        this.ref('id');
        this.field('nombre', { boost: 10 });
        this.field('tipo', { boost: 5 });
        this.field('content');

        for (const [id, doc] of docs) {
            this.add({
                id,
                nombre: foldDiacritics(doc.nombre),
                tipo: foldDiacritics(doc.tipo),
                content: foldDiacritics(doc.content),
            });
        }
    });

    return {
        size: docs.size,

        search(query: string, maxResults: number = 10): WorldSearchResult[] {
            const terms = foldDiacritics(query.toLowerCase())
                .split(/\s+/)
                // Strip lunr query syntax (: ^ ~ + - *) and any other symbol;
                // ids are snake_case ASCII and Spanish text folds to a-z0-9.
                .map((term) => term.replace(/[^a-z0-9_]/g, ''))
                .filter((term) => term.length > 0);
            if (terms.length === 0) return [];

            // Exact clause + trailing-wildcard clause per term: prefixes hit
            // while typing, exact matches score both clauses and rank higher.
            const lunrQuery = terms.map((term) => `${term} ${term}*`).join(' ');

            let hits: lunr.Index.Result[];
            try {
                hits = index.search(lunrQuery);
            } catch (error) {
                console.error('World search error:', error);
                return [];
            }

            const results: WorldSearchResult[] = [];
            for (const hit of hits) {
                const doc = docs.get(hit.ref);
                if (!doc) continue;
                results.push({
                    id: hit.ref,
                    nombre: doc.nombre,
                    tipo: doc.tipo,
                    snippet: extractSnippet(doc.content, terms),
                });
                if (results.length >= maxResults) break;
            }
            return results;
        },
    };
}
