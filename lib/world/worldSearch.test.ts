/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { WorldEntityBase, WorldModel } from '@/types/world';
import { buildWorldSearchIndex } from './worldSearch';

// ── In-memory model builders (plain literals — no scanner involved) ─────────

function makeEntity(
    overrides: Pick<WorldEntityBase, 'id' | 'tipo' | 'nombre'> & Partial<WorldEntityBase>
): WorldEntityBase {
    return {
        filePath: `mundo/lugares/${overrides.id}.md`,
        conocimiento: 'conocido',
        etiquetas: [],
        raw: {},
        body: '',
        ...overrides,
    };
}

function makeModel(entities: WorldEntityBase[]): WorldModel {
    return {
        manifest: {
            nombre: 'Sector Prueba',
            calendario: { era: 'dG', anoEpoca: 3, diasPorMes: 30, meses: ['uno', 'dos'] },
            viaje: {
                diasPorUnidad: 1,
                intrasistemaDias: 1,
                combustibleCadaDias: 4,
                viveresCadaDias: 4,
            },
            medidores: ['viveres', 'combustible', 'nave'],
            regiones: [],
        },
        entidades: new Map(entities.map((entity) => [entity.id, entity])),
        sistemas: [],
        lugares: [],
        facciones: [],
        pnjs: [],
        pistas: [],
        tramas: [],
        tablas: [],
        problemas: [],
        childrenOf: new Map(),
        estadoGrupo: null,
        diario: [],
    };
}

const FIXTURE = makeModel([
    makeEntity({
        id: 'porto_verne',
        tipo: 'estacion',
        nombre: 'Porto Verne',
        resumen: 'Puerto franco en el borde del sector.',
        body: '# Porto Verne\n\nUn **astillero clandestino** opera en los muelles bajos.',
    }),
    makeEntity({
        id: 'kovar_iii',
        tipo: 'planeta',
        nombre: 'Kovar III',
        estado: 'Bloqueo orbital tras el incidente minero.',
        body: 'Mundo desertico. Nada menciona puertos aqui.',
    }),
    makeEntity({
        id: 'estacion_sigma',
        tipo: 'nodo',
        nombre: 'Estación Sigma',
        body: 'Nodo de la red con acceso por portal.',
    }),
    makeEntity({
        id: 'zara_velk',
        tipo: 'pnj',
        nombre: 'Zara Velk',
        resumen: 'Contrabandista con deudas.',
        body: 'Frecuenta el astillero de Porto Verne.',
    }),
]);

// ── Tests ────────────────────────────────────────────────────────────────────

describe('buildWorldSearchIndex', () => {
    test('indexes every entity in the model', () => {
        expect(buildWorldSearchIndex(FIXTURE).size).toBe(4);
    });

    test('search by nombre hits', () => {
        const results = buildWorldSearchIndex(FIXTURE).search('verne');
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].id).toBe('porto_verne');
    });

    test('search by body content hits', () => {
        const results = buildWorldSearchIndex(FIXTURE).search('clandestino');
        expect(results.map((r) => r.id)).toContain('porto_verne');
    });

    test('search by resumen and estado content hits', () => {
        const index = buildWorldSearchIndex(FIXTURE);
        expect(index.search('deudas').map((r) => r.id)).toContain('zara_velk');
        expect(index.search('bloqueo').map((r) => r.id)).toContain('kovar_iii');
    });

    test('nombre match outranks body-only match', () => {
        // "verne" is in porto_verne's nombre (boost 10) and only in
        // zara_velk's body — the station must come first.
        const results = buildWorldSearchIndex(FIXTURE).search('verne');
        const ids = results.map((r) => r.id);
        expect(ids.indexOf('porto_verne')).toBeLessThan(ids.indexOf('zara_velk'));
    });

    // Accent behavior: lunr's DEFAULT pipeline is accent-sensitive (tokens
    // keep diacritics, so "estacion" would NOT match "Estación"). worldSearch
    // folds diacritics on both index and query sides to get the reasonable,
    // accent-INSENSITIVE behavior Spanish content needs. Documented here.
    describe('accent insensitivity (diacritic folding over lunr default)', () => {
        test('unaccented query matches accented nombre', () => {
            const results = buildWorldSearchIndex(FIXTURE).search('estacion');
            expect(results.map((r) => r.id)).toContain('estacion_sigma');
        });

        test('accented query matches too, and original accents survive in results', () => {
            const results = buildWorldSearchIndex(FIXTURE).search('estación');
            const sigma = results.find((r) => r.id === 'estacion_sigma');
            expect(sigma).toBeDefined();
            expect(sigma!.nombre).toBe('Estación Sigma');
        });

        test('accented query matches unaccented content', () => {
            const results = buildWorldSearchIndex(FIXTURE).search('desértico');
            expect(results.map((r) => r.id)).toContain('kovar_iii');
        });
    });

    test('result shape is the WorldSearchResult adapter {id, nombre, tipo, snippet}', () => {
        const [result] = buildWorldSearchIndex(FIXTURE).search('clandestino');
        expect(Object.keys(result).sort()).toEqual(['id', 'nombre', 'snippet', 'tipo']);
        expect(result.id).toBe('porto_verne');
        expect(result.nombre).toBe('Porto Verne');
        expect(result.tipo).toBe('estacion');
        // Snippet centers on the match with markdown stripped.
        expect(result.snippet).toContain('astillero clandestino');
        expect(result.snippet).not.toContain('**');
    });

    test('nombre-only match falls back to a body-start snippet', () => {
        const results = buildWorldSearchIndex(FIXTURE).search('kovar');
        const kovar = results.find((r) => r.id === 'kovar_iii');
        expect(kovar).toBeDefined();
        expect(kovar!.snippet).toContain('Bloqueo orbital');
    });

    test('prefix matching: partial term hits while typing', () => {
        const results = buildWorldSearchIndex(FIXTURE).search('vern');
        expect(results.map((r) => r.id)).toContain('porto_verne');
    });

    test('respects maxResults', () => {
        const results = buildWorldSearchIndex(FIXTURE).search('porto', 1);
        expect(results.length).toBe(1);
    });

    test('empty and garbage queries return [] without throwing', () => {
        const index = buildWorldSearchIndex(FIXTURE);
        expect(index.search('')).toEqual([]);
        expect(index.search('   ')).toEqual([]);
        expect(index.search('~^: *')).toEqual([]);
        expect(index.search('xyzzy_no_existe')).toEqual([]);
    });

    test('empty model builds an index that returns []', () => {
        const index = buildWorldSearchIndex(makeModel([]));
        expect(index.size).toBe(0);
        expect(index.search('verne')).toEqual([]);
    });
});
