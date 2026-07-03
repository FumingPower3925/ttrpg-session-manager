/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import {
    applicableTables,
    drawEvent,
    parseEventAttrs,
    parseEventTable,
} from './eventEngine';
import { CondContext, EventTable, WorldEvent } from '@/types/world';

// ── parseEventAttrs ─────────────────────────────────────────────────────────

describe('parseEventAttrs', () => {
    test('splits attrs on ; and key/value on the FIRST = only', () => {
        expect(parseEventAttrs('{peso=3; si=combustible<=1; etiquetas=recurso,averia}')).toEqual({
            peso: '3',
            si: 'combustible<=1', // the <= survives (actFormat parseAttrs would break it)
            etiquetas: 'recurso,averia',
        });
        expect(parseEventAttrs('a=b=c')).toEqual({ a: 'b=c' });
        expect(parseEventAttrs('si=creditos>=800&dia>=5')).toEqual({
            si: 'creditos>=800&dia>=5',
        });
    });

    test('whitespace-tolerant and brace-optional', () => {
        expect(parseEventAttrs('{ peso = 2 ;  si = dia >= 5 }')).toEqual({
            peso: '2',
            si: 'dia >= 5',
        });
        expect(parseEventAttrs('peso=1')).toEqual({ peso: '1' });
    });

    test('a key without = gets the value "true"', () => {
        expect(parseEventAttrs('{unico; peso=1}')).toEqual({ unico: 'true', peso: '1' });
    });

    test('empty input and empty parts', () => {
        expect(parseEventAttrs('')).toEqual({});
        expect(parseEventAttrs('{}')).toEqual({});
        expect(parseEventAttrs('{; ;}')).toEqual({});
    });
});

// ── parseEventTable ─────────────────────────────────────────────────────────

const TABLE_MD = `---
tipo: eventos
nombre: Viajes por la frontera
contexto: viaje
regiones: [frontera, nucleo]
sesgos:
  - {si: combustible<=1, etiquetas: [averia], peso: 2}
  - {si: esto no parsea, etiquetas: [social], peso: 1}
---
Texto introductorio de la tabla.

## v01 — Baliza de socorro {peso=3; si=region:frontera&combustible<=2; etiquetas=recurso, social}

:::leer
Una baliza parpadea en el vacio.
:::

:::efecto
- ganancia: 400 | chatarra recuperada
- medidor: combustible -1
sigue en la linea anterior
:::

Texto tras el efecto.

## v02 — Fallo de motor {etiquetas=averia}

:::gm
Tirada de nave CD 17.
:::

## v03 — Encuentro raro {si=cuando quiera el GM}

Cuerpo del encuentro.

## rotura sin patron

Perdido.
`;

describe('parseEventTable', () => {
    const parsed = parseEventTable(TABLE_MD, 'mundo/eventos/viaje_frontera.md', 'viaje_frontera');

    test('frontmatter: contexto, regiones, sesgos (bad sesgo si kept + aviso)', () => {
        expect(parsed.table.id).toBe('viaje_frontera');
        expect(parsed.table.nombre).toBe('Viajes por la frontera');
        expect(parsed.table.contexto).toBe('viaje');
        expect(parsed.table.regiones).toEqual(['frontera', 'nucleo']);
        expect(parsed.table.sesgos).toEqual([
            { si: 'combustible<=1', etiquetas: ['averia'], peso: 2 },
            { si: 'esto no parsea', etiquetas: ['social'], peso: 1 },
        ]);
    });

    test('events from ## id — titulo {attrs} sections', () => {
        expect(parsed.table.eventos.map((e) => e.id)).toEqual(['v01', 'v02', 'v03']);
        const v01 = parsed.table.eventos[0];
        expect(v01.titulo).toBe('Baliza de socorro');
        expect(v01.peso).toBe(3);
        expect(v01.si).toEqual(['region:frontera', 'combustible<=2']); // & split
        expect(v01.etiquetas).toEqual(['recurso', 'social']);

        const v02 = parsed.table.eventos[1];
        expect(v02.peso).toBe(1); // default
        expect(v02.si).toEqual([]);
        expect(v02.etiquetas).toEqual(['averia']);
    });

    test(':::efecto extracted as fields and stripped from the cuerpo', () => {
        const v01 = parsed.table.eventos[0];
        expect(v01.efectos).toEqual([
            { key: 'ganancia', value: '400 | chatarra recuperada' },
            { key: 'medidor', value: 'combustible -1 sigue en la linea anterior' },
        ]);
        expect(v01.cuerpo).toContain(':::leer');
        expect(v01.cuerpo).toContain('Una baliza parpadea');
        expect(v01.cuerpo).toContain('Texto tras el efecto.');
        expect(v01.cuerpo).not.toContain(':::efecto');
        expect(v01.cuerpo).not.toContain('ganancia:');

        const v02 = parsed.table.eventos[1];
        expect(v02.efectos).toEqual([]);
        expect(v02.cuerpo).toContain(':::gm');
    });

    test('bad si: aviso but the event is KEPT', () => {
        const v03 = parsed.table.eventos[2];
        expect(v03.si).toEqual(['cuando quiera el GM']);
        expect(
            parsed.issues.some(
                (issue) =>
                    issue.nivel === 'aviso' &&
                    issue.mensaje.includes('Condición no interpretable en "si"') &&
                    issue.mensaje.includes('v03')
            )
        ).toBe(true);
    });

    test('bad heading: aviso, section dropped', () => {
        expect(parsed.table.eventos.some((e) => e.id === 'rotura')).toBe(false);
        expect(
            parsed.issues.some(
                (issue) =>
                    issue.nivel === 'aviso' &&
                    issue.mensaje.includes('Encabezado de evento no interpretable') &&
                    issue.mensaje.includes('rotura sin patron')
            )
        ).toBe(true);
    });

    test('issue inventory: sesgo + v03 si + heading = 3 avisos', () => {
        expect(parsed.issues).toHaveLength(3);
        expect(parsed.issues.every((issue) => issue.nivel === 'aviso')).toBe(true);
        expect(
            parsed.issues.every((issue) => issue.archivo === 'mundo/eventos/viaje_frontera.md')
        ).toBe(true);
    });

    test('missing contexto: aviso + ambas', () => {
        const result = parseEventTable('---\nregiones: []\n---\n', 'mundo/eventos/t.md', 't');
        expect(result.table.contexto).toBe('ambas');
        expect(result.issues.some((issue) => issue.mensaje.includes('Falta "contexto"'))).toBe(
            true
        );
    });

    test('out-of-vocabulary contexto: aviso + ambas', () => {
        const result = parseEventTable(
            '---\ncontexto: siempre\n---\n',
            'mundo/eventos/t.md',
            't'
        );
        expect(result.table.contexto).toBe('ambas');
        expect(result.issues.some((issue) => issue.mensaje.includes('"siempre"'))).toBe(true);
    });

    test('malformed YAML degrades: error issue, table still loads', () => {
        const result = parseEventTable(
            '---\nnombre: "sin cierre\n---\n## v01 — Algo\n\nCuerpo.\n',
            'mundo/eventos/rota.md',
            'rota'
        );
        expect(
            result.issues.some(
                (issue) => issue.nivel === 'error' && issue.mensaje.includes('YAML inválido')
            )
        ).toBe(true);
        expect(result.table.nombre).toBe('Rota'); // filename fallback
        expect(result.table.eventos.map((e) => e.id)).toEqual(['v01']);
    });

    test('sesgos that is not a list: aviso + ignored', () => {
        const result = parseEventTable(
            '---\ncontexto: viaje\nsesgos: nope\n---\n',
            'mundo/eventos/t.md',
            't'
        );
        expect(result.table.sesgos).toEqual([]);
        expect(result.issues.some((issue) => issue.mensaje.includes('"sesgos"'))).toBe(true);
    });

    test('duplicate event id: first wins + aviso', () => {
        const result = parseEventTable(
            '---\ncontexto: viaje\n---\n## v01 — Primero\n\nA.\n\n## v01 — Segundo\n\nB.\n',
            'mundo/eventos/t.md',
            't'
        );
        expect(result.table.eventos).toHaveLength(1);
        expect(result.table.eventos[0].titulo).toBe('Primero');
        expect(result.issues.some((issue) => issue.mensaje.includes('duplicado'))).toBe(true);
    });

    test('non-numeric peso: aviso + default 1', () => {
        const result = parseEventTable(
            '---\ncontexto: viaje\n---\n## v01 — Algo {peso=mucho}\n',
            'mundo/eventos/t.md',
            't'
        );
        expect(result.table.eventos[0].peso).toBe(1);
        expect(result.issues.some((issue) => issue.mensaje.includes('"peso"'))).toBe(true);
    });
});

// ── applicableTables ────────────────────────────────────────────────────────

function tabla(id: string, overrides: Partial<EventTable> = {}): EventTable {
    return {
        id,
        tipo: 'eventos',
        nombre: id,
        filePath: `mundo/eventos/${id}.md`,
        conocimiento: 'desconocido',
        etiquetas: [],
        raw: {},
        body: '',
        contexto: 'ambas',
        regiones: [],
        sesgos: [],
        eventos: [],
        ...overrides,
    };
}

function evento(id: string, overrides: Partial<WorldEvent> = {}): WorldEvent {
    return { id, titulo: id, peso: 1, si: [], etiquetas: [], cuerpo: '', efectos: [], ...overrides };
}

describe('applicableTables', () => {
    const viaje = tabla('t_viaje', { contexto: 'viaje' });
    const estancia = tabla('t_estancia', { contexto: 'estancia' });
    const ambas = tabla('t_ambas', { contexto: 'ambas' });
    const frontera = tabla('t_frontera', { contexto: 'viaje', regiones: ['frontera'] });
    const all = [viaje, estancia, ambas, frontera];

    test('contexto gate: exact match or ambas', () => {
        expect(applicableTables(all, 'viaje', 'frontera').map((t) => t.id)).toEqual([
            't_viaje',
            't_ambas',
            't_frontera',
        ]);
        expect(applicableTables(all, 'estancia', 'frontera').map((t) => t.id)).toEqual([
            't_estancia',
            't_ambas',
        ]);
    });

    test('regiones gate: empty = universal, else must include the current region', () => {
        expect(applicableTables([frontera], 'viaje', 'nucleo')).toEqual([]);
        expect(applicableTables([frontera], 'viaje', 'frontera')).toEqual([frontera]);
    });

    test('null region only matches universal tables', () => {
        expect(applicableTables(all, 'viaje', null).map((t) => t.id)).toEqual([
            't_viaje',
            't_ambas',
        ]);
    });
});

// ── drawEvent ───────────────────────────────────────────────────────────────

function ctx(overrides: Partial<CondContext> = {}): CondContext {
    return {
        creditos: 500,
        medidores: { viveres: 3, combustible: 3, nave: 3 },
        diaMundo: 100,
        regionActual: 'frontera',
        etiquetasActuales: [],
        faccionesActuales: [],
        pistaEstado: () => null,
        lugarConocimiento: () => null,
        ...overrides,
    };
}

describe('drawEvent', () => {
    test('empty pool is null (no tables / every si fails)', () => {
        expect(drawEvent([], ctx(), () => 0)).toBeNull();
        const table = tabla('t', {
            eventos: [evento('a', { si: ['creditos>=99999'] })],
        });
        expect(drawEvent([table], ctx(), () => 0)).toBeNull();
    });

    test('si filters the pool; null-si events are excluded silently', () => {
        const table = tabla('t', {
            eventos: [
                evento('gated_out', { si: ['creditos>=99999'] }),
                evento('unevaluable', { si: ['esto no parsea'] }),
                evento('ok', { si: ['creditos>=100', 'region:frontera'] }),
            ],
        });
        // Whatever the roll, only 'ok' can come out.
        for (const roll of [0, 0.5, 0.99]) {
            const drawn = drawEvent([table], ctx(), () => roll);
            expect(drawn).not.toBeNull();
            expect(drawn!.event.id).toBe('ok');
            expect(drawn!.table.id).toBe('t');
        }
    });

    test('weighted draw: deterministic picks across the cumulative ranges', () => {
        const table = tabla('t', {
            eventos: [evento('a', { peso: 1 }), evento('b', { peso: 3 })],
        });
        // total 4: a owns [0,1), b owns [1,4)
        expect(drawEvent([table], ctx(), () => 0)!.event.id).toBe('a');
        expect(drawEvent([table], ctx(), () => 0.24)!.event.id).toBe('a');
        expect(drawEvent([table], ctx(), () => 0.26)!.event.id).toBe('b');
        expect(drawEvent([table], ctx(), () => 0.99)!.event.id).toBe('b');
    });

    test('pool spans several tables', () => {
        const t1 = tabla('t1', { eventos: [evento('a')] });
        const t2 = tabla('t2', { eventos: [evento('b')] });
        expect(drawEvent([t1, t2], ctx(), () => 0.1)!.table.id).toBe('t1');
        expect(drawEvent([t1, t2], ctx(), () => 0.9)!.table.id).toBe('t2');
    });

    test('sesgo shifts the distribution when its si holds and etiquetas overlap', () => {
        const table = tabla('t', {
            sesgos: [{ si: 'combustible<=1', etiquetas: ['averia'], peso: 4 }],
            eventos: [
                evento('averia_evt', { peso: 1, etiquetas: ['averia'] }),
                evento('otro_evt', { peso: 1, etiquetas: ['social'] }),
            ],
        });
        // Same roll, different fuel: sesgo inactive -> weights 1/1 -> 'otro_evt';
        // fuel low -> weights 5/1 -> the SAME roll now lands on 'averia_evt'.
        const fullTank = ctx();
        const lowTank = ctx({ medidores: { viveres: 3, combustible: 1, nave: 3 } });
        expect(drawEvent([table], fullTank, () => 0.5)!.event.id).toBe('otro_evt');
        expect(drawEvent([table], lowTank, () => 0.5)!.event.id).toBe('averia_evt');
        // and the tail of the range still reaches 'otro_evt' (weight 1 of 6)
        expect(drawEvent([table], lowTank, () => 0.9)!.event.id).toBe('otro_evt');
    });

    test('sesgo without a shared etiqueta never applies', () => {
        const table = tabla('t', {
            sesgos: [{ si: 'combustible<=1', etiquetas: ['pirata'], peso: 10 }],
            eventos: [
                evento('a', { peso: 1, etiquetas: ['averia'] }),
                evento('b', { peso: 1, etiquetas: [] }),
            ],
        });
        const lowTank = ctx({ medidores: { viveres: 3, combustible: 1, nave: 3 } });
        // weights stay 1/1: 0.6 * 2 = 1.2 -> lands on b
        expect(drawEvent([table], lowTank, () => 0.6)!.event.id).toBe('b');
    });

    test('sesgo with unevaluable si never applies (already avisado at scan)', () => {
        const table = tabla('t', {
            sesgos: [{ si: 'esto no parsea', etiquetas: ['averia'], peso: 10 }],
            eventos: [
                evento('a', { peso: 1, etiquetas: ['averia'] }),
                evento('b', { peso: 1 }),
            ],
        });
        expect(drawEvent([table], ctx(), () => 0.6)!.event.id).toBe('b');
    });

    test('effective weight floors at 1 (negative sesgos cannot erase an event)', () => {
        const table = tabla('t', {
            sesgos: [{ si: 'combustible<=1', etiquetas: ['averia'], peso: -10 }],
            eventos: [
                evento('a', { peso: 1, etiquetas: ['averia'] }),
                evento('b', { peso: 1 }),
            ],
        });
        const lowTank = ctx({ medidores: { viveres: 3, combustible: 1, nave: 3 } });
        // floored weights 1/1 (total 2): 0.4 * 2 = 0.8 -> still draws 'a'
        expect(drawEvent([table], lowTank, () => 0.4)!.event.id).toBe('a');
    });

    test('defensive: an rng returning 1 falls back to the last pool entry', () => {
        const table = tabla('t', { eventos: [evento('a'), evento('b')] });
        expect(drawEvent([table], ctx(), () => 1)!.event.id).toBe('b');
    });
});
