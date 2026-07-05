/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { JournalEntry, PartySnapshot } from '@/types/world';
import {
    applyEntryToSnapshot,
    makeEntry,
    parseCantidadPayload,
    parseDescansoPayload,
    parseDiaPayload,
    parseEntryLine,
    parseEventoPayload,
    parseInicioFinPayload,
    parseJournal,
    parseLlegadaPayload,
    parseMedidorPayload,
    parsePistaPayload,
    parseRumboPayload,
    parseSabePayload,
    serializeEntry,
    serializeJournal,
} from './logEntries';

/** Deterministic clock: 18:05. */
const clock = () => new Date(2026, 6, 12, 18, 5, 33);

/** Early-morning clock: 09:07 must zero-pad to "09:07". */
const earlyClock = () => new Date(2026, 6, 12, 9, 7);

// ── serializeEntry / parseEntryLine round-trip ──────────────────────────────

describe('logEntries — round-trip per tipo', () => {
    /** Every tipo, built via makeEntry, with and without comentario. */
    const casesConComentario: Array<[string, JournalEntry, string]> = [
        [
            'rumbo',
            makeEntry.rumbo('kovar_iii', 3, 4131, 'vía la ruta comercial', clock),
            '- [18:05] rumbo: kovar_iii | 3 dias, llegada estimada dia 4131 | vía la ruta comercial',
        ],
        [
            'llegada',
            makeEntry.llegada('porto_verne', 4131, 'atracan de noche', clock),
            '- [18:05] llegada: porto_verne | dia 4131 | atracan de noche',
        ],
        [
            'gasto',
            makeEntry.gasto(250, 'sobornó al estibador', clock),
            '- [18:05] gasto: 250 | sobornó al estibador',
        ],
        [
            'ganancia',
            makeEntry.ganancia(400, 'pago de Kael', clock),
            '- [18:05] ganancia: 400 | pago de Kael',
        ],
        [
            'medidor',
            makeEntry.medidor('combustible', 2, 4, 'repostaje completo', clock),
            '- [18:05] medidor: combustible 2->4 | repostaje completo',
        ],
        [
            'pista',
            makeEntry.pista('deuda_kael', 'rumor', 'activa', 'confirmada en el bar', clock),
            '- [18:05] pista: deuda_kael rumor->activa | confirmada en el bar',
        ],
        [
            'sabe',
            makeEntry.sabe('nodo_sigma', 'desconocido', 'rumoreado', 'mapa robado', clock),
            '- [18:05] sabe: nodo_sigma desconocido->rumoreado | mapa robado',
        ],
        [
            'evento',
            makeEntry.evento('viaje_frontera', 'v01', 'avería épica', clock),
            '- [18:05] evento: viaje_frontera#v01 | avería épica',
        ],
        [
            'descanso',
            makeEntry.descanso(2, 'reparaciones en dique', clock),
            '- [18:05] descanso: 2 dias | reparaciones en dique',
        ],
        [
            'dia',
            makeEntry.dia(4128, 4131, 'elipsis de viaje', clock),
            '- [18:05] dia: 4128->4131 | elipsis de viaje',
        ],
        [
            'nota',
            makeEntry.nota('los jugadores sospechan de Kael — ¡ojo! áéíóú ñ', clock),
            '- [18:05] nota: los jugadores sospechan de Kael — ¡ojo! áéíóú ñ',
        ],
    ];

    const casesSinComentario: Array<[string, JournalEntry, string]> = [
        [
            'inicio',
            makeEntry.inicio(4128, 'porto_verne', clock),
            '- [18:05] inicio: dia 4128 @ porto_verne',
        ],
        ['fin', makeEntry.fin(4131, 'kovar_iii', clock), '- [18:05] fin: dia 4131 @ kovar_iii'],
        [
            'rumbo',
            makeEntry.rumbo('kovar_iii', 3, 4131, undefined, clock),
            '- [18:05] rumbo: kovar_iii | 3 dias, llegada estimada dia 4131',
        ],
        [
            'llegada',
            makeEntry.llegada('porto_verne', 4131, undefined, clock),
            '- [18:05] llegada: porto_verne | dia 4131',
        ],
        ['gasto', makeEntry.gasto(250, undefined, clock), '- [18:05] gasto: 250'],
        ['ganancia', makeEntry.ganancia(400, undefined, clock), '- [18:05] ganancia: 400'],
        [
            'medidor',
            makeEntry.medidor('viveres', 3, 2, undefined, clock),
            '- [18:05] medidor: viveres 3->2',
        ],
        [
            'pista',
            makeEntry.pista('deuda_kael', 'activa', 'resuelta', undefined, clock),
            '- [18:05] pista: deuda_kael activa->resuelta',
        ],
        [
            'sabe',
            makeEntry.sabe('sitio_sigma', 'rumoreado', 'conocido', undefined, clock),
            '- [18:05] sabe: sitio_sigma rumoreado->conocido',
        ],
        [
            'evento',
            makeEntry.evento('estancia_nucleo', 'e03', undefined, clock),
            '- [18:05] evento: estancia_nucleo#e03',
        ],
        ['descanso', makeEntry.descanso(1, undefined, clock), '- [18:05] descanso: 1 dias'],
        ['dia', makeEntry.dia(4131, 4132, undefined, clock), '- [18:05] dia: 4131->4132'],
    ];

    for (const [nombre, entry, expectedLine] of casesConComentario) {
        test(`${nombre} (con comentario): exact line + round-trip`, () => {
            const line = serializeEntry(entry);
            expect(line).toBe(expectedLine);
            expect(parseEntryLine(line)).toEqual(entry);
        });
    }

    for (const [nombre, entry, expectedLine] of casesSinComentario) {
        test(`${nombre} (sin comentario): exact line + round-trip`, () => {
            const line = serializeEntry(entry);
            expect(line).toBe(expectedLine);
            expect(parseEntryLine(line)).toEqual(entry);
        });
    }

    test('hora is zero-padded from the injected clock', () => {
        expect(makeEntry.gasto(1, undefined, earlyClock).hora).toBe('09:07');
    });

    test('makeEntry defaults to the system clock', () => {
        const entry = makeEntry.nota('sin reloj inyectado');
        expect(entry.hora).toMatch(/^\d{2}:\d{2}$/);
    });

    test('inicio/fin with a null location log "desconocida"', () => {
        expect(makeEntry.inicio(1, null, clock).payload).toBe('dia 1 @ desconocida');
        expect(makeEntry.fin(1, null, clock).payload).toBe('dia 1 @ desconocida');
    });

    test('empty/whitespace comentario collapses to no comentario', () => {
        const entry = makeEntry.gasto(10, '   ', clock);
        expect(entry.comentario).toBeUndefined();
        expect(serializeEntry(entry)).toBe('- [18:05] gasto: 10');
    });

    test('DOCUMENTED: pipe inside comentario is not supported — replaced with "/"', () => {
        // The pipe is the reserved payload/comentario separator: makeEntry and
        // serializeEntry replace '|' with '/' so lines stay unambiguous.
        const entry = makeEntry.gasto(50, 'peaje | propina', clock);
        expect(entry.comentario).toBe('peaje / propina');

        const line = serializeEntry(entry);
        expect(line).toBe('- [18:05] gasto: 50 | peaje / propina');
        expect(parseEntryLine(line)).toEqual(entry);

        // A hand-built entry with a raw pipe does NOT round-trip verbatim:
        // the written line carries '/' instead.
        const manual: JournalEntry = {
            hora: '18:05',
            tipo: 'gasto',
            payload: '50',
            comentario: 'a|b',
        };
        expect(parseEntryLine(serializeEntry(manual))).toEqual({
            hora: '18:05',
            tipo: 'gasto',
            payload: '50',
            comentario: 'a/b',
        });
    });

    test('pipe in a llegada comentario stays unambiguous vs the payload pipe', () => {
        const entry = makeEntry.llegada('porto_verne', 4131, 'muelle 7 | nivel 2', clock);
        expect(serializeEntry(entry)).toBe(
            '- [18:05] llegada: porto_verne | dia 4131 | muelle 7 / nivel 2'
        );
        expect(parseEntryLine(serializeEntry(entry))).toEqual(entry);
    });

    test('DOCUMENTED: line breaks in a comentario collapse to a single space', () => {
        // An entry must serialize to exactly ONE journal line; a raw \n or \r
        // would split it into a truncated entry plus stray unparseable text.
        for (const crudo of ['línea1\nlínea2', 'crlf\r\nfin', 'solo\rcr', '\n\nrodeado\n']) {
            for (const entry of [
                makeEntry.nota(crudo, clock),
                makeEntry.gasto(10, crudo, clock),
                makeEntry.llegada('kovar_iii', 5, crudo, clock),
            ]) {
                const line = serializeEntry(entry);
                expect(line.split(/\r?\n|\r/).length).toBe(1);
                expect(parseEntryLine(line)).toEqual(entry);
            }
        }
        expect(makeEntry.nota('línea1\nlínea2', clock).comentario).toBe('línea1 línea2');
    });
});

// ── parseEntryLine tolerance ────────────────────────────────────────────────

describe('parseEntryLine — strict but whitespace-tolerant', () => {
    test('extra whitespace everywhere still parses', () => {
        expect(parseEntryLine('   -   [ 9:05 ]   gasto  :   50   |   con espacios   ')).toEqual({
            hora: '9:05',
            tipo: 'gasto',
            payload: '50',
            comentario: 'con espacios',
        });
    });

    test('unknown tipo returns null', () => {
        expect(parseEntryLine('- [10:00] teleport: porto_verne')).toBeNull();
    });

    test('non-entry lines return null', () => {
        expect(parseEntryLine('')).toBeNull();
        expect(parseEntryLine('## resumen de la parte 2')).toBeNull();
        expect(parseEntryLine('- sin hora ni tipo')).toBeNull();
        expect(parseEntryLine('- [xx:yy] gasto: 5')).toBeNull();
        expect(parseEntryLine('[10:00] gasto: 5')).toBeNull(); // missing list dash
    });

    test('trailing empty comentario segment is dropped', () => {
        expect(parseEntryLine('- [10:00] gasto: 50 |')).toEqual({
            hora: '10:00',
            tipo: 'gasto',
            payload: '50',
        });
    });

    test('nota puts everything after the colon into comentario', () => {
        expect(parseEntryLine('- [22:15] nota: cualquier texto libre')).toEqual({
            hora: '22:15',
            tipo: 'nota',
            payload: '',
            comentario: 'cualquier texto libre',
        });
        expect(parseEntryLine('- [22:15] nota:')).toEqual({
            hora: '22:15',
            tipo: 'nota',
            payload: '',
        });
    });
});

// ── serializeJournal / parseJournal ─────────────────────────────────────────

describe('serializeJournal + parseJournal', () => {
    const header = {
        sesion: 8,
        fechaReal: '2026-07-12',
        diaInicio: 4128,
        diaFin: null,
        procesado: false,
    };

    test('serializes frontmatter + one line per entry', () => {
        const entradas = [
            makeEntry.inicio(4128, 'porto_verne', clock),
            makeEntry.gasto(250, 'taxi', clock),
        ];
        expect(serializeJournal(header, entradas)).toBe(
            [
                '---',
                'tipo: diario',
                'sesion: 8',
                'fecha_real: 2026-07-12',
                'dia_inicio: 4128',
                'dia_fin: null',
                'procesado: false',
                '---',
                '',
                '- [18:05] inicio: dia 4128 @ porto_verne',
                '- [18:05] gasto: 250 | taxi',
                '',
            ].join('\n')
        );
    });

    test('empty journal is frontmatter only', () => {
        const text = serializeJournal(header, []);
        expect(text.endsWith('---\n')).toBe(true);
        expect(parseJournal(text, 'mundo/diario/2026-07-12_s08.md').entradas).toEqual([]);
    });

    test('full file round-trip through parseJournal', () => {
        const entradas = [
            makeEntry.inicio(4128, 'porto_verne', clock),
            makeEntry.rumbo('kovar_iii', 3, 4131, undefined, clock),
            makeEntry.medidor('combustible', 4, 3, undefined, clock),
            makeEntry.llegada('kovar_iii', 4131, 'sin incidentes', clock),
            makeEntry.nota('ánimo alto en la mesa', clock),
            makeEntry.fin(4131, 'kovar_iii', clock),
        ];
        const text = serializeJournal({ ...header, diaFin: 4131, procesado: true }, entradas);
        const day = parseJournal(text, 'mundo/diario/2026-07-12_s08.md');

        expect(day).toEqual({
            filePath: 'mundo/diario/2026-07-12_s08.md',
            sesion: 8,
            fechaReal: '2026-07-12',
            diaInicio: 4128,
            diaFin: 4131,
            procesado: true,
            entradas,
        });
    });

    test('garbage lines are skipped, good ones kept', () => {
        const text = [
            '---',
            'tipo: diario',
            'sesion: 3',
            'fecha_real: 2026-07-12',
            'dia_inicio: 10',
            'dia_fin: null',
            'procesado: false',
            '---',
            '',
            '- [18:02] inicio: dia 10 @ porto_verne',
            'esto no es una entrada',
            '- [18:30] hackeo: la_red',
            '- [19:00] gasto: 75 | copas',
            '   ',
            '## un titulo perdido',
        ].join('\n');

        const day = parseJournal(text, 'mundo/diario/2026-07-12_s03.md');
        expect(day.entradas.map((e) => e.tipo)).toEqual(['inicio', 'gasto']);
        expect(day.sesion).toBe(3);
        expect(day.diaInicio).toBe(10);
        expect(day.diaFin).toBeNull();
    });

    test('missing frontmatter: filename fallback + safe defaults, never throws', () => {
        const day = parseJournal('- [18:02] gasto: 5\n', 'mundo/diario/2027-01-03_s12.md');
        expect(day.sesion).toBe(12);
        expect(day.fechaReal).toBe('2027-01-03');
        expect(day.diaInicio).toBeNull();
        expect(day.diaFin).toBeNull();
        expect(day.procesado).toBe(false);
        expect(day.entradas).toHaveLength(1);
    });

    test('malformed YAML degrades to defaults with the body still parsed', () => {
        const text = '---\nsesion: "rota\n---\n- [10:00] gasto: 5\n';
        const day = parseJournal(text, 'mundo/diario/2026-07-12_s09.md');
        expect(day.sesion).toBe(9); // filename fallback
        expect(day.entradas).toHaveLength(1);
    });

    test('unnamed file without frontmatter gets neutral defaults', () => {
        const day = parseJournal('', 'mundo/diario/apuntes.md');
        expect(day.sesion).toBe(0);
        expect(day.fechaReal).toBe('');
        expect(day.entradas).toEqual([]);
    });
});

// ── Payload parse helpers ───────────────────────────────────────────────────

describe('payload grammar parsers', () => {
    test('parseCantidadPayload', () => {
        expect(parseCantidadPayload('250')).toBe(250);
        expect(parseCantidadPayload(' -40 ')).toBe(-40);
        expect(parseCantidadPayload('abc')).toBeNull();
        expect(parseCantidadPayload('40 creditos')).toBeNull();
    });

    test('parseMedidorPayload', () => {
        expect(parseMedidorPayload('combustible 2->4')).toEqual({
            nombre: 'combustible',
            from: 2,
            to: 4,
        });
        expect(parseMedidorPayload('nave 3 -> 1')).toEqual({ nombre: 'nave', from: 3, to: 1 });
        expect(parseMedidorPayload('combustible dos->tres')).toBeNull();
        expect(parseMedidorPayload('2->4')).toBeNull();
    });

    test('parsePistaPayload / parseSabePayload', () => {
        expect(parsePistaPayload('deuda_kael rumor->activa')).toEqual({
            id: 'deuda_kael',
            from: 'rumor',
            to: 'activa',
        });
        expect(parseSabePayload('nodo_sigma desconocido -> rumoreado')).toEqual({
            id: 'nodo_sigma',
            from: 'desconocido',
            to: 'rumoreado',
        });
        expect(parsePistaPayload('sin_flecha')).toBeNull();
        expect(parsePistaPayload('->activa')).toBeNull();
    });

    test('parseLlegadaPayload', () => {
        expect(parseLlegadaPayload('porto_verne | dia 4131')).toEqual({
            lugarId: 'porto_verne',
            dia: 4131,
        });
        expect(parseLlegadaPayload('porto_verne|dia 4131')).toEqual({
            lugarId: 'porto_verne',
            dia: 4131,
        });
        expect(parseLlegadaPayload('porto_verne')).toBeNull();
        expect(parseLlegadaPayload('porto_verne | 4131')).toBeNull();
    });

    test('parseRumboPayload', () => {
        expect(parseRumboPayload('kovar_iii | 3 dias, llegada estimada dia 4131')).toEqual({
            destino: 'kovar_iii',
            dias: 3,
            llegadaDia: 4131,
        });
        expect(parseRumboPayload('kovar_iii | 1 dia, llegada estimada dia 9')).toEqual({
            destino: 'kovar_iii',
            dias: 1,
            llegadaDia: 9,
        });
        expect(parseRumboPayload('kovar_iii | tres dias')).toBeNull();
    });

    test('parseDescansoPayload / parseDiaPayload / parseInicioFinPayload / parseEventoPayload', () => {
        expect(parseDescansoPayload('2 dias')).toEqual({ dias: 2 });
        expect(parseDescansoPayload('1 dia')).toEqual({ dias: 1 });
        expect(parseDescansoPayload('dos dias')).toBeNull();

        expect(parseDiaPayload('4128->4131')).toEqual({ from: 4128, to: 4131 });
        expect(parseDiaPayload('4128')).toBeNull();

        expect(parseInicioFinPayload('dia 4128 @ porto_verne')).toEqual({
            dia: 4128,
            lugarId: 'porto_verne',
        });
        expect(parseInicioFinPayload('4128 @ porto_verne')).toBeNull();

        expect(parseEventoPayload('viaje_frontera#v01')).toEqual({
            tablaId: 'viaje_frontera',
            eventoId: 'v01',
        });
        expect(parseEventoPayload('viaje_frontera v01')).toBeNull();
    });
});

// ── applyEntryToSnapshot ────────────────────────────────────────────────────

describe('applyEntryToSnapshot', () => {
    function baseSnap(): PartySnapshot {
        return {
            diaMundo: 4128,
            ubicacion: 'porto_verne',
            rumbo: null,
            creditos: 1200,
            medidores: { viveres: 3, combustible: 2, nave: 4 },
        };
    }

    test('gasto subtracts credits (pure: input untouched)', () => {
        const snap = baseSnap();
        const next = applyEntryToSnapshot(snap, makeEntry.gasto(250, undefined, clock));
        expect(next.creditos).toBe(950);
        expect(snap.creditos).toBe(1200);
        expect(next).not.toBe(snap);
    });

    test('ganancia adds credits', () => {
        expect(
            applyEntryToSnapshot(baseSnap(), makeEntry.ganancia(400, undefined, clock)).creditos
        ).toBe(1600);
    });

    test('medidor sets the named gauge to the "to" value', () => {
        const snap = baseSnap();
        const next = applyEntryToSnapshot(
            snap,
            makeEntry.medidor('combustible', 2, 4, undefined, clock)
        );
        expect(next.medidores).toEqual({ viveres: 3, combustible: 4, nave: 4 });
        expect(snap.medidores.combustible).toBe(2); // no mutation
    });

    test('medidor can introduce a gauge the snapshot did not have', () => {
        const next = applyEntryToSnapshot(
            baseSnap(),
            makeEntry.medidor('moral', 0, 5, undefined, clock)
        );
        expect(next.medidores.moral).toBe(5);
    });

    test('llegada sets ubicacion + diaMundo and clears rumbo', () => {
        const enRuta: PartySnapshot = {
            ...baseSnap(),
            rumbo: { destino: 'kovar_iii', llegadaDia: 4131 },
        };
        const next = applyEntryToSnapshot(
            enRuta,
            makeEntry.llegada('kovar_iii', 4131, undefined, clock)
        );
        expect(next.ubicacion).toBe('kovar_iii');
        expect(next.diaMundo).toBe(4131);
        expect(next.rumbo).toBeNull();
    });

    test('rumbo sets the heading', () => {
        const next = applyEntryToSnapshot(
            baseSnap(),
            makeEntry.rumbo('kovar_iii', 3, 4131, undefined, clock)
        );
        expect(next.rumbo).toEqual({ destino: 'kovar_iii', llegadaDia: 4131 });
    });

    test('descanso advances diaMundo by N', () => {
        expect(
            applyEntryToSnapshot(baseSnap(), makeEntry.descanso(2, undefined, clock)).diaMundo
        ).toBe(4130);
    });

    test('dia sets diaMundo to the "to" value', () => {
        expect(
            applyEntryToSnapshot(baseSnap(), makeEntry.dia(4128, 4131, undefined, clock)).diaMundo
        ).toBe(4131);
    });

    test('inicio/fin/nota/pista/sabe/evento leave the snapshot unchanged (same object)', () => {
        const snap = baseSnap();
        const neutral = [
            makeEntry.inicio(4128, 'porto_verne', clock),
            makeEntry.fin(4128, 'porto_verne', clock),
            makeEntry.nota('sin efecto', clock),
            makeEntry.pista('deuda_kael', 'rumor', 'activa', undefined, clock),
            makeEntry.sabe('nodo_sigma', 'desconocido', 'rumoreado', undefined, clock),
            makeEntry.evento('viaje_frontera', 'v01', undefined, clock),
        ];
        for (const entry of neutral) {
            expect(applyEntryToSnapshot(snap, entry)).toBe(snap);
        }
    });

    test('unparseable payload is a no-op, never a throw', () => {
        const snap = baseSnap();
        const roto: JournalEntry = { hora: '10:00', tipo: 'gasto', payload: 'muchos' };
        expect(applyEntryToSnapshot(snap, roto)).toBe(snap);

        const medidorRoto: JournalEntry = { hora: '10:00', tipo: 'medidor', payload: 'combustible' };
        expect(applyEntryToSnapshot(snap, medidorRoto)).toBe(snap);
    });

    test('replay: folding entries over a snapshot reproduces the session', () => {
        const entries = [
            makeEntry.inicio(4128, 'porto_verne', clock),
            makeEntry.gasto(200, undefined, clock),
            makeEntry.rumbo('kovar_iii', 3, 4131, undefined, clock),
            makeEntry.medidor('combustible', 2, 1, undefined, clock),
            makeEntry.llegada('kovar_iii', 4131, undefined, clock),
            makeEntry.ganancia(500, undefined, clock),
        ];
        const final = entries.reduce(applyEntryToSnapshot, baseSnap());
        expect(final).toEqual({
            diaMundo: 4131,
            ubicacion: 'kovar_iii',
            rumbo: null,
            creditos: 1500,
            medidores: { viveres: 3, combustible: 1, nave: 4 },
        });

        // undo-last = replay all but the last entry over the start snapshot
        const undone = entries.slice(0, -1).reduce(applyEntryToSnapshot, baseSnap());
        expect(undone.creditos).toBe(1000);
    });
});
