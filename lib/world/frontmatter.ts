/**
 * Browser-safe YAML frontmatter parsing for world-mode markdown files.
 * Uses the `yaml` package (eemeli — no Buffer/Node deps); never throws:
 * malformed YAML degrades into a ValidationIssue so the world always loads.
 */

import { parse as parseYaml } from 'yaml';
import { ValidationIssue } from '@/types/world';

export interface SplitFrontmatterResult {
    /** Raw YAML between the fences, or null when the file has no frontmatter. */
    yamlText: string | null;
    /** Markdown content below the closing fence (whole file when no frontmatter). */
    body: string;
}

export interface ParsedFrontmatter {
    data: Record<string, unknown>;
    body: string;
    issue?: ValidationIssue;
}

const OPEN_FENCE = /^---[ \t]*\r?\n/;
const CLOSE_FENCE = /^---[ \t]*(?:\r?\n|$)/m;

/**
 * Splits a leading `---` frontmatter fence off a markdown file.
 * Tolerant of CRLF line endings and a UTF-8 BOM. The fence must open at the
 * very start of the file; an unclosed fence is treated as no frontmatter.
 */
export function splitFrontmatter(content: string): SplitFrontmatterResult {
    const src = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

    const open = OPEN_FENCE.exec(src);
    if (!open) {
        return { yamlText: null, body: src };
    }

    const afterOpen = src.slice(open[0].length);
    const close = CLOSE_FENCE.exec(afterOpen);
    if (!close) {
        return { yamlText: null, body: src };
    }

    return {
        yamlText: afterOpen.slice(0, close.index),
        body: afterOpen.slice(close.index + close[0].length),
    };
}

/**
 * Parses a markdown file into frontmatter data + body. NEVER throws:
 * YAML errors (or non-map frontmatter) yield empty data plus an
 * `issue` with nivel 'error' pointing at `filePath`.
 */
export function parseFrontmatter(content: string, filePath: string): ParsedFrontmatter {
    const { yamlText, body } = splitFrontmatter(content);
    if (yamlText === null) {
        return { data: {}, body };
    }

    let parsed: unknown;
    try {
        parsed = parseYaml(yamlText);
    } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        return {
            data: {},
            body,
            issue: {
                nivel: 'error',
                archivo: filePath,
                mensaje: `YAML inválido en el frontmatter: ${detail}`,
            },
        };
    }

    if (parsed === null || parsed === undefined) {
        return { data: {}, body };
    }
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {
            data: {},
            body,
            issue: {
                nivel: 'error',
                archivo: filePath,
                mensaje: 'El frontmatter no es un mapa YAML de clave: valor',
            },
        };
    }

    return { data: parsed as Record<string, unknown>, body };
}

/** English → Spanish frontmatter key aliases. Spanish is canonical and wins on conflict. */
const KEY_ALIASES: Record<string, string> = {
    type: 'tipo',
    name: 'nombre',
    in: 'en',
    tags: 'etiquetas',
    knowledge: 'conocimiento',
    status: 'estado',
    summary: 'resumen',
    services: 'servicios',
    coords: 'coordenadas',
    orbit: 'orbita',
    weight: 'peso',
    if: 'si',
    context: 'contexto',
};

/**
 * Maps English alias keys to their Spanish canonical form — shallow (top level
 * only). When both forms are present the Spanish value wins and the English
 * one is dropped.
 */
export function normalizeKeys(data: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        const canonical = KEY_ALIASES[key] ?? key;
        if (canonical !== key && canonical in data) {
            continue; // Spanish key also present — it wins
        }
        result[canonical] = value;
    }
    return result;
}

// ── Safe coercers (used by the scanner; never throw) ───────────────────────

/** Trimmed string, or undefined for empty/non-scalar values. Numbers/booleans stringify. */
export function asString(value: unknown): string | undefined {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? undefined : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }
    return undefined;
}

/** Finite number, coercing numeric strings; undefined otherwise. */
export function asNumber(value: unknown): number | undefined {
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }
    if (typeof value === 'string' && value.trim() !== '') {
        const num = Number(value);
        return Number.isFinite(num) ? num : undefined;
    }
    return undefined;
}

/**
 * String array; non-string items are coerced via asString and dropped when
 * uncoercible. A lone scalar becomes a one-element array (tolerates
 * `etiquetas: pirata` written without brackets); anything else yields [].
 */
export function asStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value
            .map(asString)
            .filter((item): item is string => item !== undefined);
    }
    const single = asString(value);
    return single === undefined ? [] : [single];
}

/** `{x, y}` with finite numeric members (numeric strings coerced); undefined otherwise. */
export function asCoords(value: unknown): { x: number; y: number } | undefined {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    const x = asNumber(record.x);
    const y = asNumber(record.y);
    if (x === undefined || y === undefined) {
        return undefined;
    }
    return { x, y };
}
