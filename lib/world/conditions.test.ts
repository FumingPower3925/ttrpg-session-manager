/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import {
    buildCondContext,
    evalCondition,
    evalConditions,
    isParseableCondition,
} from './conditions';
import {
    CondContext,
    FactionPresence,
    Lead,
    PlaceEntity,
    SystemEntity,
    WorldEntityBase,
    WorldManifest,
    WorldModel,
} from '@/types/world';

// ── Fixtures ────────────────────────────────────────────────────────────────

function ctx(overrides: Partial<CondContext> = {}): CondContext {
    return {
        creditos: 500,
        medidores: { viveres: 3, combustible: 1, nave: 2 },
        diaMundo: 4160,
        regionActual: 'frontera',
        etiquetasActuales: ['pirata', 'ruina'],
        faccionesActuales: ['consorcio_tetrad'],
        pistaEstado: (id) => (id === 'deuda_kael' ? 'activa' : null),
        lugarConocimiento: (id) => (id === 'porto_verne' ? 'conocido' : null),
        ...overrides,
    };
}

// ── Numeric comparisons ─────────────────────────────────────────────────────

describe('evalCondition — numeric', () => {
    test('creditos with every operator', () => {
        expect(evalCondition('creditos>=500', ctx())).toBe(true);
        expect(evalCondition('creditos>=800', ctx())).toBe(false);
        expect(evalCondition('creditos<=500', ctx())).toBe(true);
        expect(evalCondition('creditos<500', ctx())).toBe(false);
        expect(evalCondition('creditos>499', ctx())).toBe(true);
        expect(evalCondition('creditos=500', ctx())).toBe(true);
        expect(evalCondition('creditos=501', ctx())).toBe(false);
        expect(evalCondition('creditos==500', ctx())).toBe(true); // tolerated synonym
    });

    test('dia reads diaMundo', () => {
        expect(evalCondition('dia>=4160', ctx())).toBe(true);
        expect(evalCondition('dia>4160', ctx())).toBe(false);
    });

    test('any medidor name evaluates against the medidores map', () => {
        expect(evalCondition('combustible<=1', ctx())).toBe(true);
        expect(evalCondition('combustible<=0', ctx())).toBe(false);
        expect(evalCondition('nave>=2', ctx())).toBe(true);
        expect(
            evalCondition('oxigeno<=2', ctx({ medidores: { oxigeno: 1 } }))
        ).toBe(true);
    });

    test('unknown medidor name is null (unevaluable), not false', () => {
        expect(evalCondition('oxigeno<=2', ctx())).toBeNull();
    });

    test('whitespace-tolerant', () => {
        expect(evalCondition('  creditos >= 100  ', ctx())).toBe(true);
        expect(evalCondition('combustible <= 1', ctx())).toBe(true);
    });
});

// ── Colon forms ─────────────────────────────────────────────────────────────

describe('evalCondition — region/etiqueta/faccion', () => {
    test('region matches the effective region', () => {
        expect(evalCondition('region:frontera', ctx())).toBe(true);
        expect(evalCondition('region:nucleo', ctx())).toBe(false);
        expect(evalCondition('region: frontera', ctx())).toBe(true); // space after colon
    });

    test('null region is false (evaluable: the party is nowhere named)', () => {
        expect(evalCondition('region:frontera', ctx({ regionActual: null }))).toBe(false);
    });

    test('etiqueta against the current place + ancestors', () => {
        expect(evalCondition('etiqueta:pirata', ctx())).toBe(true);
        expect(evalCondition('etiqueta:minera', ctx())).toBe(false);
    });

    test('faccion against present factions', () => {
        expect(evalCondition('faccion:consorcio_tetrad', ctx())).toBe(true);
        expect(evalCondition('faccion:culto_helios', ctx())).toBe(false);
    });
});

describe('evalCondition — pista', () => {
    test('estado equality', () => {
        expect(evalCondition('pista:deuda_kael:activa', ctx())).toBe(true);
        expect(evalCondition('pista:deuda_kael:resuelta', ctx())).toBe(false);
    });

    test('missing pista is null', () => {
        expect(evalCondition('pista:no_existe:activa', ctx())).toBeNull();
    });

    test('out-of-vocabulary estado is null (unparseable)', () => {
        expect(evalCondition('pista:deuda_kael:resuleta', ctx())).toBeNull();
    });
});

describe('evalCondition — lugar (conocimiento-min ordering)', () => {
    test('at-least semantics over desconocido<rumoreado<conocido<visitado', () => {
        // porto_verne is 'conocido' in the fixture ctx
        expect(evalCondition('lugar:porto_verne:desconocido', ctx())).toBe(true);
        expect(evalCondition('lugar:porto_verne:rumoreado', ctx())).toBe(true);
        expect(evalCondition('lugar:porto_verne:conocido', ctx())).toBe(true);
        expect(evalCondition('lugar:porto_verne:visitado', ctx())).toBe(false);
    });

    test('missing lugar is null', () => {
        expect(evalCondition('lugar:no_existe:conocido', ctx())).toBeNull();
    });

    test('out-of-vocabulary minimum is null (unparseable)', () => {
        expect(evalCondition('lugar:porto_verne:famoso', ctx())).toBeNull();
    });
});

// ── Unparseable shapes ──────────────────────────────────────────────────────

describe('evalCondition — unknown shapes', () => {
    test.each([
        '',
        '   ',
        'basura',
        'manual: pide permiso a Kael',
        'creditos>=',
        'creditos~500',
        'region:',
        'region:dos palabras',
        'pista:deuda_kael',
        'lugar:porto_verne',
        'quien:sabe:que',
    ])('null for %j', (cond) => {
        expect(evalCondition(cond, ctx())).toBeNull();
    });
});

// ── Conjunctions ────────────────────────────────────────────────────────────

describe('evalCondition — & conjunction', () => {
    test('all true', () => {
        expect(evalCondition('creditos>=100&region:frontera&combustible<=1', ctx())).toBe(true);
        expect(evalCondition(' etiqueta:pirata & dia>=100 ', ctx())).toBe(true);
    });

    test('any false makes it false', () => {
        expect(evalCondition('creditos>=100&region:nucleo', ctx())).toBe(false);
    });

    test('any unparseable atom makes it null', () => {
        expect(evalCondition('creditos>=100&basura', ctx())).toBeNull();
    });

    test('null dominates false (an unevaluable set is never definitively false)', () => {
        expect(evalCondition('creditos>=99999&oxigeno<=1', ctx())).toBeNull();
        expect(evalCondition('oxigeno<=1&creditos>=99999', ctx())).toBeNull();
    });
});

describe('evalConditions', () => {
    test('empty list is vacuously true', () => {
        expect(evalConditions([], ctx())).toBe(true);
    });

    test('AND over the list', () => {
        expect(evalConditions(['creditos>=100', 'region:frontera'], ctx())).toBe(true);
        expect(evalConditions(['creditos>=100', 'region:nucleo'], ctx())).toBe(false);
    });

    test('null if ANY is null, even alongside a false', () => {
        expect(evalConditions(['creditos>=99999', 'basura'], ctx())).toBeNull();
        expect(evalConditions(['basura', 'creditos>=100'], ctx())).toBeNull();
    });
});

// ── Syntax-only check ───────────────────────────────────────────────────────

describe('isParseableCondition', () => {
    test('true for every grammar form', () => {
        expect(isParseableCondition('combustible<=1')).toBe(true);
        expect(isParseableCondition('creditos >= 800')).toBe(true);
        expect(isParseableCondition('dia>=4160')).toBe(true);
        expect(isParseableCondition('region:frontera')).toBe(true);
        expect(isParseableCondition('etiqueta:pirata')).toBe(true);
        expect(isParseableCondition('faccion:consorcio_tetrad')).toBe(true);
        expect(isParseableCondition('pista:deuda_kael:resuelta')).toBe(true);
        expect(isParseableCondition('lugar:nodo_sigma:rumoreado')).toBe(true);
        expect(isParseableCondition('creditos>=800&region:frontera')).toBe(true);
    });

    test('syntax-only: an unknown medidor NAME still parses', () => {
        expect(isParseableCondition('oxigeno<=2')).toBe(true);
    });

    test('false for garbage, manual: and empties', () => {
        expect(isParseableCondition('')).toBe(false);
        expect(isParseableCondition('manual: decide el GM')).toBe(false);
        expect(isParseableCondition('basura')).toBe(false);
        expect(isParseableCondition('creditos>=100&')).toBe(false);
        expect(isParseableCondition('pista:x:no_es_estado')).toBe(false);
    });
});

// ── buildCondContext ────────────────────────────────────────────────────────

const MANIFEST: WorldManifest = {
    nombre: 'Sector Test',
    calendario: { era: 'dG', anoEpoca: 322, diasPorMes: 30, meses: ['Uno'] },
    viaje: { diasPorUnidad: 1, intrasistemaDias: 1, combustibleCadaDias: 4, viveresCadaDias: 4 },
    medidores: ['viveres', 'combustible', 'nave'],
    regiones: ['nucleo', 'frontera'],
};

function sistema(id: string, region?: string, etiquetas: string[] = []): SystemEntity {
    return {
        id,
        tipo: 'sistema',
        nombre: id,
        filePath: `mundo/sistemas/${id}.md`,
        conocimiento: 'visitado',
        etiquetas,
        raw: {},
        body: '',
        coordenadas: { x: 0, y: 0 },
        region,
    };
}

function lugar(
    id: string,
    opts: {
        en?: string;
        region?: string;
        etiquetas?: string[];
        facciones?: FactionPresence[];
        conocimiento?: PlaceEntity['conocimiento'];
    } = {}
): PlaceEntity {
    return {
        id,
        tipo: 'lugar',
        nombre: id,
        filePath: `mundo/lugares/${id}.md`,
        conocimiento: opts.conocimiento ?? 'conocido',
        etiquetas: opts.etiquetas ?? [],
        raw: {},
        body: '',
        en: opts.en,
        region: opts.region,
        servicios: [],
        facciones: opts.facciones ?? [],
        acceso: 'normal',
    };
}

function pista(id: string, estadoPista: Lead['estadoPista']): Lead {
    return {
        id,
        tipo: 'pista',
        nombre: id,
        filePath: `mundo/pistas/${id}.md`,
        conocimiento: 'desconocido',
        etiquetas: [],
        raw: {},
        body: '',
        estadoPista,
        requisitos: [],
        accionable: false,
    };
}

function makeModel(entities: WorldEntityBase[]): WorldModel {
    return {
        manifest: MANIFEST,
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
        musica: { bgm: [], eventPlaylists: [] },
        tiendas: new Map(),
        resumen: null,
    };
}

const PARTY = { creditos: 800, medidores: { combustible: 2 }, diaMundo: 10 };

const MODEL = makeModel([
    sistema('sys', 'nucleo', ['central']),
    lugar('planeta', {
        en: 'sys',
        etiquetas: ['pirata'],
        facciones: [{ faccion: 'consorcio', nivel: 'presente' }],
        conocimiento: 'visitado',
    }),
    lugar('sitio', {
        en: 'planeta',
        etiquetas: ['ruina', 'pirata'],
        facciones: [{ faccion: 'culto', nivel: 'encubierta' }],
    }),
    lugar('estacion_borde', { en: 'sys', region: 'frontera' }),
    pista('deuda', 'en_curso'),
]);

describe('buildCondContext', () => {
    test('party numbers pass through', () => {
        const built = buildCondContext(MODEL, PARTY, null);
        expect(built.creditos).toBe(800);
        expect(built.medidores).toEqual({ combustible: 2 });
        expect(built.diaMundo).toBe(10);
    });

    test('regionActual walks the en: chain to the nearest region', () => {
        expect(buildCondContext(MODEL, PARTY, 'sitio').regionActual).toBe('nucleo');
        expect(buildCondContext(MODEL, PARTY, 'sys').regionActual).toBe('nucleo');
        // own region wins over the ancestor's
        expect(buildCondContext(MODEL, PARTY, 'estacion_borde').regionActual).toBe('frontera');
    });

    test('etiquetasActuales: current place + ancestors, deduplicated', () => {
        expect(buildCondContext(MODEL, PARTY, 'sitio').etiquetasActuales).toEqual([
            'ruina',
            'pirata',
            'central',
        ]);
    });

    test('faccionesActuales: presence at the place or its ancestors', () => {
        expect(buildCondContext(MODEL, PARTY, 'sitio').faccionesActuales).toEqual([
            'culto',
            'consorcio',
        ]);
        expect(buildCondContext(MODEL, PARTY, 'planeta').faccionesActuales).toEqual([
            'consorcio',
        ]);
    });

    test('null or unknown current place yields empty place context', () => {
        for (const id of [null, 'no_existe']) {
            const built = buildCondContext(MODEL, PARTY, id);
            expect(built.regionActual).toBeNull();
            expect(built.etiquetasActuales).toEqual([]);
            expect(built.faccionesActuales).toEqual([]);
        }
    });

    test('pistaEstado closure: Leads only, null otherwise', () => {
        const built = buildCondContext(MODEL, PARTY, null);
        expect(built.pistaEstado('deuda')).toBe('en_curso');
        expect(built.pistaEstado('planeta')).toBeNull(); // exists, not a pista
        expect(built.pistaEstado('no_existe')).toBeNull();
    });

    test('lugarConocimiento closure over the entity map', () => {
        const built = buildCondContext(MODEL, PARTY, null);
        expect(built.lugarConocimiento('planeta')).toBe('visitado');
        expect(built.lugarConocimiento('sys')).toBe('visitado');
        expect(built.lugarConocimiento('no_existe')).toBeNull();
    });

    test('integrates with evalCondition end to end', () => {
        const built = buildCondContext(MODEL, PARTY, 'sitio');
        expect(evalCondition('region:nucleo&etiqueta:pirata&faccion:culto', built)).toBe(true);
        expect(evalCondition('creditos>=800&combustible<=2', built)).toBe(true);
        expect(evalCondition('pista:deuda:en_curso&lugar:planeta:conocido', built)).toBe(true);
        expect(evalCondition('region:frontera', built)).toBe(false);
    });
});
