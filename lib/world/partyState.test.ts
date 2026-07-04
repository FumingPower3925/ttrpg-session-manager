/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { WorldManifest } from '@/types/world';
import { defaultPartyState, formatFecha, parsePartyState, serializePartyState } from './partyState';

const FILE_PATH = 'mundo/estado/grupo.md';

// ── parsePartyState ─────────────────────────────────────────────────────────

describe('parsePartyState — full frontmatter', () => {
    const FULL = `---
tipo: estado_grupo
sesion_activa: true
dia_mundo: 107
ubicacion: porto_verne
rumbo:
  destino: sistema_kovar
  llegada_dia: 110
creditos: 850
medidores:
  viveres: 2
  combustible: 1
  nave: 4
  moral: 5
personajes: [Xiao, Chesco, Soy]
---
## Inventario

- 3 cargas de mineral
`;

    test('parses every app-owned field', () => {
        const { state, issues } = parsePartyState(FULL, FILE_PATH);

        expect(issues).toHaveLength(0);
        expect(state.sesionActiva).toBe(true);
        expect(state.diaMundo).toBe(107);
        expect(state.ubicacion).toBe('porto_verne');
        expect(state.rumbo).toEqual({ destino: 'sistema_kovar', llegadaDia: 110 });
        expect(state.creditos).toBe(850);
        expect(state.medidores).toEqual({ viveres: 2, combustible: 1, nave: 4, moral: 5 });
        expect(state.personajes).toEqual(['Xiao', 'Chesco', 'Soy']);
        expect(state.filePath).toBe(FILE_PATH);
        expect(state.bodyMd).toBe('## Inventario\n\n- 3 cargas de mineral\n');
    });
});

describe('parsePartyState — tolerant defaults', () => {
    test('empty frontmatter: silent defaults', () => {
        const { state, issues } = parsePartyState('---\ntipo: estado_grupo\n---\ncuerpo\n', FILE_PATH);

        expect(issues).toHaveLength(0);
        expect(state.sesionActiva).toBe(false);
        expect(state.diaMundo).toBe(1);
        expect(state.ubicacion).toBeNull();
        expect(state.rumbo).toBeNull();
        expect(state.creditos).toBe(0);
        expect(state.medidores).toEqual({ viveres: 3, combustible: 3, nave: 3 });
        expect(state.personajes).toEqual([]);
    });

    test('defaultPartyState: filePath null when the file is absent', () => {
        const state = defaultPartyState();

        expect(state.filePath).toBeNull();
        expect(state.sesionActiva).toBe(false);
        expect(state.diaMundo).toBe(1);
        expect(state.creditos).toBe(0);
        expect(state.medidores).toEqual({ viveres: 3, combustible: 3, nave: 3 });
        expect(state.personajes).toEqual([]);
        expect(state.bodyMd).toBe('');
    });

    test('defaultPartyState returns a fresh medidores object each call', () => {
        const a = defaultPartyState();
        a.medidores.viveres = 0;
        expect(defaultPartyState().medidores.viveres).toBe(3);
    });

    test('no frontmatter at all: defaults + whole file as body', () => {
        const content = 'solo prosa del agente\n';
        const { state, issues } = parsePartyState(content, FILE_PATH);

        expect(issues).toHaveLength(0);
        expect(state.diaMundo).toBe(1);
        expect(state.bodyMd).toBe(content);
    });

    test('partial medidores overlay the defaults', () => {
        const { state, issues } = parsePartyState(
            '---\nmedidores:\n  combustible: 0\n---\n',
            FILE_PATH
        );

        expect(issues).toHaveLength(0);
        expect(state.medidores).toEqual({ viveres: 3, combustible: 0, nave: 3 });
    });

    test('malformed fields: aviso each, defaults kept', () => {
        const { state, issues } = parsePartyState(
            [
                '---',
                'sesion_activa: quizas',
                'dia_mundo: [3]',
                'creditos: mucho',
                'rumbo: sistema_kovar',
                'medidores:',
                '  viveres: pocos',
                '---',
                '',
            ].join('\n'),
            FILE_PATH
        );

        expect(issues).toHaveLength(5);
        expect(issues.every((issue) => issue.nivel === 'aviso')).toBe(true);
        expect(issues.every((issue) => issue.archivo === FILE_PATH)).toBe(true);
        expect(state.sesionActiva).toBe(false);
        expect(state.diaMundo).toBe(1);
        expect(state.creditos).toBe(0);
        expect(state.rumbo).toBeNull();
        expect(state.medidores).toEqual({ viveres: 3, combustible: 3, nave: 3 });
    });

    test('rumbo without llegada_dia: aviso, stays null', () => {
        const { state, issues } = parsePartyState(
            '---\nrumbo:\n  destino: sistema_kovar\n---\n',
            FILE_PATH
        );

        expect(state.rumbo).toBeNull();
        expect(issues).toHaveLength(1);
        expect(issues[0].mensaje).toContain('rumbo');
    });

    test('rumbo: null (arrival cleared) is not an aviso', () => {
        const { state, issues } = parsePartyState('---\nrumbo: null\n---\n', FILE_PATH);

        expect(state.rumbo).toBeNull();
        expect(issues).toHaveLength(0);
    });

    test('unexpected tipo earns an aviso', () => {
        const { issues } = parsePartyState('---\ntipo: lugar\n---\n', FILE_PATH);

        expect(issues).toHaveLength(1);
        expect(issues[0].nivel).toBe('aviso');
        expect(issues[0].mensaje).toContain('estado_grupo');
    });

    test('malformed YAML: error issue, defaults, body preserved', () => {
        const { state, issues } = parsePartyState(
            '---\nsesion_activa: [sin cerrar\n---\ncuerpo intacto\n',
            FILE_PATH
        );

        expect(issues).toHaveLength(1);
        expect(issues[0].nivel).toBe('error');
        expect(issues[0].mensaje).toContain('YAML inválido');
        expect(state.sesionActiva).toBe(false);
        expect(state.creditos).toBe(0);
        expect(state.bodyMd).toBe('cuerpo intacto\n');
    });
});

describe('parsePartyState — body preserved byte-for-byte', () => {
    test('weird spacing, tabs, emoji and no trailing newline', () => {
        const body =
            '\n##  Inventario 🎒\n\n- línea con   espacios  \t\n\n\n   sangría rara\nfin sin salto final';
        const { state } = parsePartyState(`---\ncreditos: 10\n---\n${body}`, FILE_PATH);

        expect(state.bodyMd).toBe(body);
    });

    test('CRLF line endings survive untouched', () => {
        const { state } = parsePartyState(
            '---\r\ncreditos: 5\r\n---\r\nlínea uno\r\n\r\ncohete 🚀\r\n',
            FILE_PATH
        );

        expect(state.bodyMd).toBe('línea uno\r\n\r\ncohete 🚀\r\n');
    });

    test('empty body stays empty', () => {
        const { state } = parsePartyState('---\ncreditos: 1\n---\n', FILE_PATH);

        expect(state.bodyMd).toBe('');
    });
});

// ── personajes (roster) round-trip + serialize preservation ─────────────────

describe('personajes roster', () => {
    const NOW_ISO = '2026-07-04T12:00:00.000Z';

    test('parses a bracketed list and a lone scalar; omitted stays []', () => {
        expect(parsePartyState('---\npersonajes: [Xiao, Chesco]\n---\n', FILE_PATH).state.personajes)
            .toEqual(['Xiao', 'Chesco']);
        // A lone scalar tolerates `personajes: Xiao` (asStringArray).
        expect(parsePartyState('---\npersonajes: Xiao\n---\n', FILE_PATH).state.personajes)
            .toEqual(['Xiao']);
        // Omitted / null / empty list -> [] (never an aviso).
        expect(parsePartyState('---\ntipo: estado_grupo\n---\n', FILE_PATH).state.personajes)
            .toEqual([]);
        expect(parsePartyState('---\npersonajes: null\n---\n', FILE_PATH).state.personajes)
            .toEqual([]);
        expect(parsePartyState('---\npersonajes: []\n---\n', FILE_PATH).state.personajes)
            .toEqual([]);
    });

    test('serialize -> parse round-trips the roster', () => {
        const state = defaultPartyState(FILE_PATH);
        state.personajes = ['Xiao', 'Chesco', 'Soy'];
        const text = serializePartyState(state, NOW_ISO);
        expect(text).toContain('personajes:');
        expect(parsePartyState(text, FILE_PATH).state.personajes).toEqual(['Xiao', 'Chesco', 'Soy']);
    });

    test('an empty roster serializes as personajes: [] and round-trips', () => {
        const text = serializePartyState(defaultPartyState(FILE_PATH), NOW_ISO);
        expect(text).toContain('personajes: []');
        expect(parsePartyState(text, FILE_PATH).state.personajes).toEqual([]);
    });

    test('roster survives a serialize even when every OTHER field is rewritten', () => {
        // Preservation-through-write: a state carrying only the roster (defaults
        // elsewhere) must NOT lose it after serialize (the app-owned rewrite).
        const state = defaultPartyState(FILE_PATH);
        state.personajes = ['Xiao', 'Chesco'];
        state.creditos = 999;
        const reparsed = parsePartyState(serializePartyState(state, NOW_ISO), FILE_PATH).state;
        expect(reparsed.personajes).toEqual(['Xiao', 'Chesco']);
        expect(reparsed.creditos).toBe(999);
    });
});

// ── formatFecha ─────────────────────────────────────────────────────────────

function makeManifest(calendario?: Partial<WorldManifest['calendario']>): WorldManifest {
    return {
        nombre: 'Sector Verne',
        calendario: {
            era: 'dG',
            anoEpoca: 322,
            diasPorMes: 30,
            meses: ['Abadius', 'Calistril', 'Pharast', 'Gozran', 'Desnus', 'Sarenith'],
            ...calendario,
        },
        viaje: {
            diasPorUnidad: 1,
            intrasistemaDias: 1,
            combustibleCadaDias: 4,
            viveresCadaDias: 4,
        },
        medidores: ['viveres', 'combustible', 'nave'],
        regiones: [],
    };
}

describe('formatFecha', () => {
    // 6 meses × 30 días = 180 días por año en el manifest de prueba.

    test('día 1 = day 1 of month 1 of ano_epoca', () => {
        expect(formatFecha(1, makeManifest())).toBe('1 de Abadius, 322 dG');
    });

    test('renders the plan example shape: 17 de Gozran, 322 dG', () => {
        // día 107 = 3 meses completos (90) + 16 días → día 17 de Gozran
        expect(formatFecha(107, makeManifest())).toBe('17 de Gozran, 322 dG');
    });

    test('month boundary: last day vs first day of the next month', () => {
        expect(formatFecha(30, makeManifest())).toBe('30 de Abadius, 322 dG');
        expect(formatFecha(31, makeManifest())).toBe('1 de Calistril, 322 dG');
    });

    test('year rollover: last day of the year vs day 1 of the next', () => {
        expect(formatFecha(180, makeManifest())).toBe('30 de Sarenith, 322 dG');
        expect(formatFecha(181, makeManifest())).toBe('1 de Abadius, 323 dG');
        expect(formatFecha(361, makeManifest())).toBe('1 de Abadius, 324 dG');
    });

    test('non-integer days floor; days below 1 clamp to day 1', () => {
        expect(formatFecha(31.9, makeManifest())).toBe('1 de Calistril, 322 dG');
        expect(formatFecha(0, makeManifest())).toBe('1 de Abadius, 322 dG');
        expect(formatFecha(-14, makeManifest())).toBe('1 de Abadius, 322 dG');
    });

    test('empty era omits the suffix', () => {
        expect(formatFecha(107, makeManifest({ era: '' }))).toBe('17 de Gozran, 322');
    });

    test('degrades to "Día N" without usable calendar data', () => {
        expect(formatFecha(42, makeManifest({ meses: [] }))).toBe('Día 42');
        expect(formatFecha(7, makeManifest({ diasPorMes: 0 }))).toBe('Día 7');
        expect(formatFecha(Number.NaN, makeManifest())).toBe('1 de Abadius, 322 dG');
    });
});
