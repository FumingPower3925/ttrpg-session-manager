/**
 * Event engine (M4, plan Part A "Event tables" + Part B "EventDrawer"):
 * parses `eventos/*.md` tables and performs the weighted draw.
 *
 * File shape:
 *   - frontmatter: `contexto: viaje|estancia|ambas`, `regiones: [...]`,
 *     `sesgos: [{si, etiquetas, peso}]`
 *   - one event per `##` section: `## v01 — Baliza de socorro {peso=3;
 *     si=combustible<=1; etiquetas=recurso,averia}` — the body until the next
 *     `##` is the event's `cuerpo` (its `:::leer/:::gm/:::accion` blocks
 *     render later through the EXISTING parseAct), except `:::efecto` blocks,
 *     which are stripped from the cuerpo and parsed into EventEffect fields
 *     (ActField semantics: `- key: valor` bullets, continuation lines append).
 *
 * Attr parsing caveat (plan): actFormat's parseAttrs splits on EVERY `=` and
 * would break `si=combustible<=1`, so parseEventAttrs splits attrs on `;` and
 * key/value on the FIRST `=` only. Do not reuse parseAttrs here.
 *
 * All parsing is tolerant and never throws: problems degrade into avisos and
 * the table still loads (scanner contract). Draws are pure with an injectable
 * rng so tests are deterministic.
 */

import {
    CondContext,
    EventEffect,
    EventTable,
    ValidationIssue,
    WorldEvent,
} from '@/types/world';
import { fileNameToDisplayName } from '@/lib/fsScanUtils';
import { evalCondition, evalConditions, isParseableCondition } from './conditions';
import { CONOCIMIENTOS, DEFAULT_CONOCIMIENTO } from './constants';
import { asNumber, asString, asStringArray, normalizeKeys, parseFrontmatter } from './frontmatter';

/** `contexto:` vocabulary of an event table. */
export const CONTEXTOS_EVENTO: readonly EventTable['contexto'][] = [
    'viaje',
    'estancia',
    'ambas',
];

type EventBias = EventTable['sesgos'][number];

// ── Attr parsing ────────────────────────────────────────────────────────────

/**
 * `{peso=3; si=combustible<=1; etiquetas=recurso}` -> record. Optional
 * surrounding braces are stripped; attrs split on `;`; key/value split on the
 * FIRST `=` only (values legally contain `=`, e.g. `si=creditos>=800`).
 * A key without `=` gets the value 'true'. Whitespace-tolerant.
 */
export function parseEventAttrs(raw: string): Record<string, string> {
    const attrs: Record<string, string> = {};
    const inner = raw.trim().replace(/^\{/, '').replace(/\}$/, '');
    for (const part of inner.split(';')) {
        const trimmed = part.trim();
        if (trimmed === '') continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) {
            attrs[trimmed] = 'true';
            continue;
        }
        const key = trimmed.slice(0, eq).trim();
        if (key === '') continue;
        attrs[key] = trimmed.slice(eq + 1).trim();
    }
    return attrs;
}

// ── Table parsing ───────────────────────────────────────────────────────────

export interface ParsedEventTable {
    table: EventTable;
    issues: ValidationIssue[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseSesgos(value: unknown, aviso: (mensaje: string) => void): EventBias[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        aviso('"sesgos" debe ser una lista de {si, etiquetas, peso} — se ignora');
        return [];
    }

    const sesgos: EventBias[] = [];
    for (const item of value) {
        if (!isRecord(item)) {
            aviso('Entrada de "sesgos" que no es un mapa {si, etiquetas, peso} — se omite');
            continue;
        }
        const data = normalizeKeys(item);
        const si = asString(data.si);
        const peso = asNumber(data.peso);
        if (si === undefined || peso === undefined) {
            aviso('Entrada de "sesgos" sin "si" o "peso" válidos — se omite');
            continue;
        }
        if (!isParseableCondition(si)) {
            aviso(`Condición no interpretable en "sesgos": "${si}" — el sesgo no se aplicará`);
        }
        sesgos.push({ si, etiquetas: asStringArray(data.etiquetas), peso });
    }
    return sesgos;
}

/** `## ` heading (exactly two hashes). */
const HEADING_LINE = /^##(?!#)\s+(.*)$/;
/** Trailing `{...}` attrs on a heading. */
const HEADING_ATTRS = /\{[^}]*\}\s*$/;
/** `id — Título` (id has no whitespace/em-dash; separator -, – or —). */
const HEADING_ID_TITLE = /^([^\s—–]+)\s*[—–-]\s+(.+)$/;

const EFECTO_OPEN = /^:::efecto\b.*$/;
const BLOCK_CLOSE = /^:::\s*$/;

/**
 * Splits `:::efecto` blocks out of a section: their lines become EventEffect
 * fields, everything else stays as cuerpo (so parseAct — which does not know
 * `efecto` — never sees the block as stray prose). An unclosed block runs to
 * the end of the section, mirroring parseAct's tolerance.
 */
function extractEfectos(lines: string[]): { cuerpoLines: string[]; efectos: EventEffect[] } {
    const cuerpoLines: string[] = [];
    const efectoLines: string[] = [];
    let inEfecto = false;

    for (const line of lines) {
        if (inEfecto) {
            if (BLOCK_CLOSE.test(line)) {
                inEfecto = false;
            } else {
                efectoLines.push(line);
            }
            continue;
        }
        if (EFECTO_OPEN.test(line)) {
            inEfecto = true;
            continue;
        }
        cuerpoLines.push(line);
    }

    return { cuerpoLines, efectos: parseEfectoFields(efectoLines) };
}

/**
 * ActField semantics (mirrors actFormat's parseAccion, minus the bold name):
 * `- key: valor` bullets (dash optional), keys lowercased; non-field lines
 * append to the previous field's value, or open a leading 'nota' field.
 */
function parseEfectoFields(lines: string[]): EventEffect[] {
    const efectos: EventEffect[] = [];
    for (const rawLine of lines) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;
        const stripped = trimmed.replace(/^[-*]\s*/, '');
        const field = stripped.match(/^([A-Za-zÁÉÍÓÚÑáéíóúñ][\wÁÉÍÓÚÑáéíóúñ-]*)\s*:\s*(.+)$/);
        if (field) {
            efectos.push({ key: field[1].toLowerCase(), value: field[2].trim() });
        } else if (efectos.length > 0) {
            efectos[efectos.length - 1].value += ' ' + stripped;
        } else {
            efectos.push({ key: 'nota', value: stripped });
        }
    }
    return efectos;
}

function parseEventos(body: string, aviso: (mensaje: string) => void): WorldEvent[] {
    const eventos: WorldEvent[] = [];
    const seen = new Set<string>();

    let current: { id: string; titulo: string; attrs: Record<string, string> } | null = null;
    let sectionLines: string[] = [];

    const flush = () => {
        if (!current) return;
        const { id, titulo, attrs } = current;

        let peso = 1;
        if (attrs.peso !== undefined) {
            const parsed = asNumber(attrs.peso);
            if (parsed === undefined) {
                aviso(`"peso" no numérico en el evento "${id}": "${attrs.peso}" — se usa 1`);
            } else {
                peso = parsed;
            }
        }

        const si =
            attrs.si === undefined
                ? []
                : attrs.si
                      .split('&')
                      .map((part) => part.trim())
                      .filter((part) => part !== '');
        for (const cond of si) {
            if (!isParseableCondition(cond)) {
                aviso(
                    `Condición no interpretable en "si" del evento "${id}": "${cond}" — ` +
                        'el evento queda fuera de las tiradas automáticas'
                );
            }
        }

        const etiquetas =
            attrs.etiquetas === undefined
                ? []
                : attrs.etiquetas
                      .split(',')
                      .map((part) => part.trim())
                      .filter((part) => part !== '');

        const { cuerpoLines, efectos } = extractEfectos(sectionLines);

        if (seen.has(id)) {
            aviso(`id de evento duplicado: "${id}" — se conserva el primero`);
        } else {
            seen.add(id);
            eventos.push({ id, titulo, peso, si, etiquetas, cuerpo: cuerpoLines.join('\n').trim(), efectos });
        }
    };

    for (const line of body.split(/\r?\n/)) {
        const heading = HEADING_LINE.exec(line);
        if (!heading) {
            if (current) sectionLines.push(line);
            continue;
        }

        flush();
        current = null;
        sectionLines = [];

        const headText = heading[1].trim();
        const attrsMatch = HEADING_ATTRS.exec(headText);
        const idTitle = HEADING_ID_TITLE.exec(
            attrsMatch ? headText.slice(0, attrsMatch.index).trim() : headText
        );
        if (!idTitle) {
            aviso(
                `Encabezado de evento no interpretable: "## ${headText}" — ` +
                    'se esperaba "## id — Título {atributos}"'
            );
            continue; // its section content belongs to no event
        }
        current = {
            id: idTitle[1],
            titulo: idTitle[2].trim(),
            attrs: parseEventAttrs(attrsMatch ? attrsMatch[0] : ''),
        };
    }
    flush();

    return eventos;
}

/**
 * Parses one `eventos/*.md` file into an EventTable. Never throws; every
 * problem is an aviso (the frontmatter parser may add its own error) and the
 * table always loads, however degraded. `id` = filename minus .md, like every
 * other entity; `body` keeps the raw markdown below the frontmatter.
 */
export function parseEventTable(
    content: string,
    filePath: string,
    id: string
): ParsedEventTable {
    const issues: ValidationIssue[] = [];
    const aviso = (mensaje: string) => {
        issues.push({ nivel: 'aviso', archivo: filePath, mensaje });
    };

    const parsed = parseFrontmatter(content, filePath);
    if (parsed.issue) issues.push(parsed.issue);
    const data = normalizeKeys(parsed.data);

    let contexto: EventTable['contexto'] = 'ambas';
    const contextoRaw = asString(data.contexto);
    if (contextoRaw === undefined) {
        aviso('Falta "contexto" en la tabla de eventos — se usa "ambas"');
    } else if ((CONTEXTOS_EVENTO as readonly string[]).includes(contextoRaw)) {
        contexto = contextoRaw as EventTable['contexto'];
    } else {
        aviso(`Valor fuera de vocabulario en "contexto": "${contextoRaw}" — se usa "ambas"`);
    }

    let conocimiento = DEFAULT_CONOCIMIENTO;
    const conocimientoRaw = asString(data.conocimiento);
    if (conocimientoRaw !== undefined) {
        if ((CONOCIMIENTOS as readonly string[]).includes(conocimientoRaw)) {
            conocimiento = conocimientoRaw as EventTable['conocimiento'];
        } else {
            aviso(
                `Valor fuera de vocabulario en "conocimiento": "${conocimientoRaw}" — ` +
                    `se usa "${DEFAULT_CONOCIMIENTO}"`
            );
        }
    }

    const table: EventTable = {
        id,
        tipo: asString(data.tipo) ?? 'eventos',
        nombre: asString(data.nombre) ?? fileNameToDisplayName(id),
        filePath,
        conocimiento,
        etiquetas: asStringArray(data.etiquetas),
        resumen: asString(data.resumen),
        estado: asString(data.estado),
        raw: data,
        body: parsed.body,
        contexto,
        regiones: asStringArray(data.regiones),
        sesgos: parseSesgos(data.sesgos, aviso),
        eventos: parseEventos(parsed.body, aviso),
    };

    return { table, issues };
}

// ── Gating + weighted draw ──────────────────────────────────────────────────

/**
 * Tables usable right now: `contexto` matches (or is 'ambas') AND the table
 * is universal (empty `regiones`) or lists the party's current region. A null
 * region only matches universal tables.
 */
export function applicableTables(
    tablas: EventTable[],
    contexto: 'viaje' | 'estancia',
    regionActual: string | null
): EventTable[] {
    return tablas.filter(
        (table) =>
            (table.contexto === contexto || table.contexto === 'ambas') &&
            (table.regiones.length === 0 ||
                (regionActual !== null && table.regiones.includes(regionActual)))
    );
}

/**
 * Weighted draw over every event of every table whose `si` all hold.
 * Null-condition events are EXCLUDED silently (they were already avisado at
 * scan time). Effective weight = peso + sum of the table's matching sesgos —
 * a sesgo matches when its own `si` holds (null = never) AND it shares at
 * least one etiqueta with the event — floored at 1. `rng` returns [0, 1)
 * (injectable for deterministic tests). Empty pool = null.
 */
export function drawEvent(
    tables: EventTable[],
    ctx: CondContext,
    rng: () => number
): { table: EventTable; event: WorldEvent } | null {
    const pool: Array<{ table: EventTable; event: WorldEvent; weight: number }> = [];

    for (const table of tables) {
        const activeBiases = table.sesgos.filter((sesgo) => evalCondition(sesgo.si, ctx) === true);
        for (const event of table.eventos) {
            if (evalConditions(event.si, ctx) !== true) continue;
            let weight = event.peso;
            for (const sesgo of activeBiases) {
                if (sesgo.etiquetas.some((tag) => event.etiquetas.includes(tag))) {
                    weight += sesgo.peso;
                }
            }
            pool.push({ table, event, weight: Math.max(1, weight) });
        }
    }

    if (pool.length === 0) return null;

    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    let roll = rng() * total;
    for (const entry of pool) {
        roll -= entry.weight;
        if (roll < 0) return { table: entry.table, event: entry.event };
    }
    // rng defensively returned >= 1: fall back to the last entry.
    const last = pool[pool.length - 1];
    return { table: last.table, event: last.event };
}
