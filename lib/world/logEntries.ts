/**
 * Journal line format for `mundo/diario/AAAA-MM-DD_sNN.md` (M3, plan Part A).
 *
 * One entry per line, strict, human-readable AND machine-parseable:
 *
 *     - [HH:MM] tipo: payload | comentario libre opcional
 *
 * Payload grammar per tipo (the strict line format IS the machine format):
 *
 *     inicio / fin   dia N @ <lugar>                              dia 4128 @ porto_verne
 *     rumbo          <lugar> | N dias, llegada estimada dia M     kovar_iii | 3 dias, llegada estimada dia 4131
 *     llegada        <lugar> | dia N                              porto_verne | dia 4131
 *     gasto/ganancia N                                            250
 *     medidor        <nombre> A->B                                combustible 2->4
 *     pista          <id> estadoA->estadoB                        deuda_kael rumor->activa
 *     sabe           <entidad> nivelA->nivelB                     nodo_sigma desconocido->rumoreado
 *     evento         <tabla>#<id>                                 viaje_frontera#v01
 *     descanso       N dias                                       2 dias
 *     dia            A->B                                         4128->4131
 *     nota           (payload vacío; el texto libre va en comentario)
 *
 * The `|` pipe is the RESERVED separator between payload and comentario (and
 * inside the llegada/rumbo payloads), and an entry must serialize to exactly
 * ONE line. Neither pipes nor line breaks are supported inside a comentario:
 * makeEntry and serializeEntry replace every '|' with '/' and collapse every
 * CR/LF run to a single space, so the written line always parses back
 * unambiguously. Entries built through makeEntry therefore always round-trip:
 * parseEntryLine(serializeEntry(e)) deep-equals e.
 *
 * Everything here is pure (no filesystem, no store access) and never throws
 * on bad content — bad lines parse to null, bad payloads leave the snapshot
 * reducer a no-op.
 */

import { JournalDay, JournalEntry, JournalEntryType, PartySnapshot } from '@/types/world';
import { asNumber, asString, parseFrontmatter } from './frontmatter';

// ── Entry-type vocabulary ───────────────────────────────────────────────────

export const JOURNAL_ENTRY_TYPES: readonly JournalEntryType[] = [
    'inicio',
    'fin',
    'rumbo',
    'llegada',
    'gasto',
    'ganancia',
    'medidor',
    'pista',
    'sabe',
    'evento',
    'descanso',
    'dia',
    'nota',
];

export function isJournalEntryType(value: string): value is JournalEntryType {
    return (JOURNAL_ENTRY_TYPES as readonly string[]).includes(value);
}

/**
 * How many pipes the payload grammar of a tipo contains. The (budget+1)-th
 * pipe on a line is the payload/comentario separator.
 */
const PAYLOAD_PIPES: Record<JournalEntryType, number> = {
    inicio: 0,
    fin: 0,
    rumbo: 1,
    llegada: 1,
    gasto: 0,
    ganancia: 0,
    medidor: 0,
    pista: 0,
    sabe: 0,
    evento: 0,
    descanso: 0,
    dia: 0,
    nota: 0,
};

// ── Line serialization / parsing ────────────────────────────────────────────

/**
 * Pipes are reserved: a '|' inside a comentario would shift the
 * payload/comentario split on re-parse, so it is replaced with '/'.
 * Line breaks would split the entry into a truncated line plus stray
 * unparseable text, so CR/LF runs collapse to a single space.
 * Empty/whitespace-only comments collapse to undefined.
 */
function sanitizeComentario(comentario: string | undefined): string | undefined {
    if (comentario === undefined) return undefined;
    const limpio = comentario
        .replace(/[\r\n]+/g, ' ')
        .replace(/\|/g, '/')
        .trim();
    return limpio === '' ? undefined : limpio;
}

/**
 * Serializes one entry to its journal line (no trailing newline).
 * `nota` is comment-only: its payload is ignored and the comentario is
 * written directly after the colon.
 */
export function serializeEntry(entry: JournalEntry): string {
    const comentario = sanitizeComentario(entry.comentario);
    const cuerpo =
        entry.tipo === 'nota'
            ? comentario ?? ''
            : comentario === undefined
              ? entry.payload
              : `${entry.payload} | ${comentario}`;
    return `- [${entry.hora}] ${entry.tipo}: ${cuerpo}`.trimEnd();
}

const ENTRY_LINE = /^\s*-\s*\[\s*(\d{1,2}:\d{2})\s*\]\s*([a-z]+)\s*:\s*(.*)$/;

/** Index of the (skip+1)-th '|' in text, or -1. */
function nthPipeIndex(text: string, skip: number): number {
    let index = -1;
    for (let remaining = skip; remaining >= 0; remaining--) {
        index = text.indexOf('|', index + 1);
        if (index === -1) return -1;
    }
    return index;
}

/**
 * Parses one journal line. Strict on shape (list dash, [HH:MM], known tipo)
 * but tolerant of extra whitespace; payload content is NOT validated here
 * (the reducer/parse helpers do that). Returns null for anything else —
 * unknown tipo, prose lines, blank lines.
 */
export function parseEntryLine(line: string): JournalEntry | null {
    const match = ENTRY_LINE.exec(line);
    if (!match) return null;
    const hora = match[1];
    const tipo = match[2];
    if (!isJournalEntryType(tipo)) return null;
    const resto = match[3].trim();

    if (tipo === 'nota') {
        return resto === ''
            ? { hora, tipo, payload: '' }
            : { hora, tipo, payload: '', comentario: resto };
    }

    const separator = nthPipeIndex(resto, PAYLOAD_PIPES[tipo]);
    if (separator === -1) {
        return { hora, tipo, payload: resto };
    }
    const payload = resto.slice(0, separator).trim();
    const comentario = resto.slice(separator + 1).trim();
    return comentario === ''
        ? { hora, tipo, payload }
        : { hora, tipo, payload, comentario };
}

// ── Journal file serialization / parsing ────────────────────────────────────

export type JournalDayHeader = Pick<
    JournalDay,
    'sesion' | 'fechaReal' | 'diaInicio' | 'diaFin' | 'procesado'
>;

/**
 * Full journal file text: YAML frontmatter + one line per entry.
 * `dia_fin` stays `null` until the session closes; `procesado` is flipped to
 * true by the agent after the maintenance loop (never by the app).
 */
export function serializeJournal(day: JournalDayHeader, entradas: JournalEntry[]): string {
    const frontmatter = [
        '---',
        'tipo: diario',
        `sesion: ${day.sesion}`,
        `fecha_real: ${day.fechaReal}`,
        `dia_inicio: ${day.diaInicio ?? 'null'}`,
        `dia_fin: ${day.diaFin ?? 'null'}`,
        `procesado: ${day.procesado}`,
        '---',
    ].join('\n');

    if (entradas.length === 0) return `${frontmatter}\n`;
    return `${frontmatter}\n\n${entradas.map(serializeEntry).join('\n')}\n`;
}

/** Boolean, tolerating the string forms "true"/"false". Undefined otherwise. */
function asBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
    }
    return undefined;
}

const JOURNAL_FILE_NAME = /(\d{4}-\d{2}-\d{2})_s(\d+)\.md$/i;

/**
 * Parses a `diario/*.md` file. Tolerant, never throws: malformed YAML
 * degrades to defaults, unparseable lines are skipped, and missing
 * sesion/fecha_real fall back to the `AAAA-MM-DD_sNN.md` filename.
 */
export function parseJournal(content: string, filePath: string): JournalDay {
    const parsed = parseFrontmatter(content, filePath);
    const data = parsed.data;
    const fromName = JOURNAL_FILE_NAME.exec(filePath);

    const entradas: JournalEntry[] = [];
    for (const line of parsed.body.split(/\r?\n/)) {
        const entry = parseEntryLine(line);
        if (entry) entradas.push(entry);
    }

    return {
        filePath,
        sesion: asNumber(data.sesion) ?? (fromName ? Number(fromName[2]) : 0),
        fechaReal: asString(data.fecha_real) ?? fromName?.[1] ?? '',
        diaInicio: asNumber(data.dia_inicio) ?? null,
        diaFin: asNumber(data.dia_fin) ?? null,
        procesado: asBoolean(data.procesado) ?? false,
        entradas,
    };
}

// ── Payload grammar parsers (each inverts one serialization) ────────────────

/** `N` (gasto/ganancia): integer credits. */
export function parseCantidadPayload(payload: string): number | null {
    const match = /^[+-]?\d+$/.exec(payload.trim());
    return match ? Number(match[0]) : null;
}

/** `<nombre> A->B` (medidor). */
export function parseMedidorPayload(
    payload: string
): { nombre: string; from: number; to: number } | null {
    const match = /^(\S+)\s+([+-]?\d+)\s*->\s*([+-]?\d+)$/.exec(payload.trim());
    if (!match) return null;
    return { nombre: match[1], from: Number(match[2]), to: Number(match[3]) };
}

/** `<id> A->B` with string states — shared by pista (estados) and sabe (niveles). */
export function parseTransicionPayload(
    payload: string
): { id: string; from: string; to: string } | null {
    const match = /^(\S+)\s+(\S+?)\s*->\s*(\S+)$/.exec(payload.trim());
    if (!match) return null;
    return { id: match[1], from: match[2], to: match[3] };
}

/** `<id> estadoA->estadoB` (pista). */
export const parsePistaPayload = parseTransicionPayload;

/** `<entidad> nivelA->nivelB` (sabe). */
export const parseSabePayload = parseTransicionPayload;

/** `<lugar> | dia N` (llegada). */
export function parseLlegadaPayload(
    payload: string
): { lugarId: string; dia: number } | null {
    const match = /^(\S+)\s*\|\s*dia\s+([+-]?\d+)$/.exec(payload.trim());
    if (!match) return null;
    return { lugarId: match[1], dia: Number(match[2]) };
}

/** `<lugar> | N dias, llegada estimada dia M` (rumbo). */
export function parseRumboPayload(
    payload: string
): { destino: string; dias: number; llegadaDia: number } | null {
    const match = /^(\S+)\s*\|\s*([+-]?\d+)\s+dias?\s*,\s*llegada\s+estimada\s+dia\s+([+-]?\d+)$/.exec(
        payload.trim()
    );
    if (!match) return null;
    return { destino: match[1], dias: Number(match[2]), llegadaDia: Number(match[3]) };
}

/** `N dias` (descanso). */
export function parseDescansoPayload(payload: string): { dias: number } | null {
    const match = /^([+-]?\d+)\s+dias?$/.exec(payload.trim());
    return match ? { dias: Number(match[1]) } : null;
}

/** `A->B` (dia). */
export function parseDiaPayload(payload: string): { from: number; to: number } | null {
    const match = /^([+-]?\d+)\s*->\s*([+-]?\d+)$/.exec(payload.trim());
    if (!match) return null;
    return { from: Number(match[1]), to: Number(match[2]) };
}

/** `dia N @ <lugar>` (inicio/fin). */
export function parseInicioFinPayload(
    payload: string
): { dia: number; lugarId: string } | null {
    const match = /^dia\s+([+-]?\d+)\s+@\s+(\S+)$/.exec(payload.trim());
    if (!match) return null;
    return { dia: Number(match[1]), lugarId: match[2] };
}

/** `<tabla>#<id>` (evento). */
export function parseEventoPayload(
    payload: string
): { tablaId: string; eventoId: string } | null {
    const match = /^([^#\s]+)#(\S+)$/.exec(payload.trim());
    if (!match) return null;
    return { tablaId: match[1], eventoId: match[2] };
}

// ── Entry factory ───────────────────────────────────────────────────────────

/** Injectable clock (a function returning Date); defaults to the system clock. */
export type Clock = () => Date;

function horaNow(clock: Clock | undefined): string {
    const now = clock ? clock() : new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

function entry(
    tipo: JournalEntryType,
    payload: string,
    comentario: string | undefined,
    clock: Clock | undefined
): JournalEntry {
    const limpio = sanitizeComentario(comentario);
    return limpio === undefined
        ? { hora: horaNow(clock), tipo, payload }
        : { hora: horaNow(clock), tipo, payload, comentario: limpio };
}

/** When the party's location is unknown, inicio/fin log `desconocida`. */
const LUGAR_DESCONOCIDO = 'desconocida';

/**
 * One builder per tipo, each producing a JournalEntry with the exact payload
 * grammar documented above. The optional trailing `clock` is injectable for
 * tests; comments have their '|' pipes replaced with '/' (see module doc).
 */
export const makeEntry = {
    inicio(dia: number, lugarId: string | null, clock?: Clock): JournalEntry {
        return entry('inicio', `dia ${dia} @ ${lugarId ?? LUGAR_DESCONOCIDO}`, undefined, clock);
    },
    fin(dia: number, lugarId: string | null, clock?: Clock): JournalEntry {
        return entry('fin', `dia ${dia} @ ${lugarId ?? LUGAR_DESCONOCIDO}`, undefined, clock);
    },
    rumbo(
        destinoId: string,
        dias: number,
        llegadaDia: number,
        comentario?: string,
        clock?: Clock
    ): JournalEntry {
        return entry(
            'rumbo',
            `${destinoId} | ${dias} dias, llegada estimada dia ${llegadaDia}`,
            comentario,
            clock
        );
    },
    llegada(lugarId: string, dia: number, comentario?: string, clock?: Clock): JournalEntry {
        return entry('llegada', `${lugarId} | dia ${dia}`, comentario, clock);
    },
    gasto(cantidad: number, comentario?: string, clock?: Clock): JournalEntry {
        return entry('gasto', `${cantidad}`, comentario, clock);
    },
    ganancia(cantidad: number, comentario?: string, clock?: Clock): JournalEntry {
        return entry('ganancia', `${cantidad}`, comentario, clock);
    },
    medidor(
        nombre: string,
        from: number,
        to: number,
        comentario?: string,
        clock?: Clock
    ): JournalEntry {
        return entry('medidor', `${nombre} ${from}->${to}`, comentario, clock);
    },
    pista(id: string, from: string, to: string, comentario?: string, clock?: Clock): JournalEntry {
        return entry('pista', `${id} ${from}->${to}`, comentario, clock);
    },
    sabe(id: string, from: string, to: string, comentario?: string, clock?: Clock): JournalEntry {
        return entry('sabe', `${id} ${from}->${to}`, comentario, clock);
    },
    evento(tablaId: string, eventoId: string, comentario?: string, clock?: Clock): JournalEntry {
        return entry('evento', `${tablaId}#${eventoId}`, comentario, clock);
    },
    descanso(dias: number, comentario?: string, clock?: Clock): JournalEntry {
        return entry('descanso', `${dias} dias`, comentario, clock);
    },
    dia(from: number, to: number, comentario?: string, clock?: Clock): JournalEntry {
        return entry('dia', `${from}->${to}`, comentario, clock);
    },
    nota(comentario: string, clock?: Clock): JournalEntry {
        return entry('nota', '', comentario, clock);
    },
};

// ── Snapshot reducer ────────────────────────────────────────────────────────

/**
 * Applies one entry to a party snapshot — pure: returns a NEW snapshot when
 * the entry changes it, the SAME object otherwise. Used both for live apply
 * (partyStore.log) and replay-undo (re-apply remaining entries over the
 * session-start snapshot). Unparseable payloads are a no-op, never an error.
 *
 *   gasto/ganancia  creditos -/+ N
 *   medidor         medidores[nombre] = to
 *   llegada         ubicacion + diaMundo, rumbo cleared
 *   rumbo           rumbo = {destino, llegadaDia}
 *   descanso        diaMundo + N
 *   dia             diaMundo = to
 *   inicio/fin/nota/pista/sabe/evento — snapshot unchanged
 */
export function applyEntryToSnapshot(snap: PartySnapshot, entry: JournalEntry): PartySnapshot {
    switch (entry.tipo) {
        case 'gasto': {
            const cantidad = parseCantidadPayload(entry.payload);
            if (cantidad === null) return snap;
            return { ...snap, creditos: snap.creditos - cantidad };
        }
        case 'ganancia': {
            const cantidad = parseCantidadPayload(entry.payload);
            if (cantidad === null) return snap;
            return { ...snap, creditos: snap.creditos + cantidad };
        }
        case 'medidor': {
            const medidor = parseMedidorPayload(entry.payload);
            if (medidor === null) return snap;
            return {
                ...snap,
                medidores: { ...snap.medidores, [medidor.nombre]: medidor.to },
            };
        }
        case 'llegada': {
            const llegada = parseLlegadaPayload(entry.payload);
            if (llegada === null) return snap;
            return { ...snap, ubicacion: llegada.lugarId, diaMundo: llegada.dia, rumbo: null };
        }
        case 'rumbo': {
            const rumbo = parseRumboPayload(entry.payload);
            if (rumbo === null) return snap;
            return { ...snap, rumbo: { destino: rumbo.destino, llegadaDia: rumbo.llegadaDia } };
        }
        case 'descanso': {
            const descanso = parseDescansoPayload(entry.payload);
            if (descanso === null) return snap;
            return { ...snap, diaMundo: snap.diaMundo + descanso.dias };
        }
        case 'dia': {
            const dia = parseDiaPayload(entry.payload);
            if (dia === null) return snap;
            return { ...snap, diaMundo: dia.to };
        }
        // Knowledge/lead/event/bookkeeping entries never touch the snapshot.
        case 'inicio':
        case 'fin':
        case 'nota':
        case 'pista':
        case 'sabe':
        case 'evento':
            return snap;
    }
}
