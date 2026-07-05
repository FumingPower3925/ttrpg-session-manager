/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import {
    Lead,
    PlaceEntity,
    SystemEntity,
    Trama,
    WorldEntityBase,
    WorldManifest,
    WorldModel,
} from '@/types/world';
import { WORLD_SCALE } from './constants';
import { tramaThreadNodes } from './threads';

// ── Hand-built minimal model ────────────────────────────────────────────────
// sistema_a {x:0,y:0}
//   └── porto (en: sistema_a)
// sistema_b {x:6,y:3}
//   └── brasa (en: sistema_b)
// node_deep {x:14,y:-14} (deep space, own coords)
// sistema_nc {x:2,y:2}  (NO coordenadas — coord-less root, skipped)

function base(id: string, tipo: string): WorldEntityBase {
    return {
        id,
        tipo,
        nombre: id,
        filePath: `mundo/${tipo}/${id}.md`,
        conocimiento: 'conocido',
        etiquetas: [],
        raw: {},
        body: '',
    };
}

function sistema(id: string, coords: { x: number; y: number } | undefined): SystemEntity {
    // coords deliberately optional to exercise the coord-less skip path.
    return {
        ...base(id, 'sistema'),
        tipo: 'sistema',
        coordenadas: coords as { x: number; y: number },
    };
}

function lugar(id: string, opts: { en?: string; coordenadas?: { x: number; y: number } } = {}): PlaceEntity {
    return {
        ...base(id, 'estacion'),
        en: opts.en,
        coordenadas: opts.coordenadas,
        servicios: [],
        facciones: [],
        acceso: 'normal',
    };
}

function pista(id: string, opts: { trama?: string; donde?: string } = {}): Lead {
    return {
        ...base(id, 'pista'),
        estadoPista: 'activa',
        trama: opts.trama,
        donde: opts.donde,
        requisitos: [],
        accionable: false,
    };
}

const MANIFEST: WorldManifest = {
    nombre: 'Sector Test',
    calendario: { era: 'dG', anoEpoca: 322, diasPorMes: 30, meses: ['Uno'] },
    viaje: { diasPorUnidad: 1, intrasistemaDias: 1, combustibleCadaDias: 4, viveresCadaDias: 4 },
    medidores: [],
    regiones: [],
};

function makeModel(tramas: Trama[]): WorldModel {
    const sistemas = [
        sistema('sistema_a', { x: 0, y: 0 }),
        sistema('sistema_b', { x: 6, y: 3 }),
        sistema('sistema_nc', undefined), // coord-less root
    ];
    const lugares = [
        lugar('porto', { en: 'sistema_a' }),
        lugar('brasa', { en: 'sistema_b' }),
        lugar('sin_sistema', { en: 'sistema_nc' }),
        lugar('node_deep', { coordenadas: { x: 14, y: -14 } }),
    ];
    const pistas = tramas.flatMap((t) => t.pistas);
    const entidades = new Map<string, WorldEntityBase>(
        [...sistemas, ...lugares].map((e) => [e.id, e])
    );
    const childrenOf = new Map<string, string[]>();
    for (const l of lugares) {
        if (l.en === undefined) continue;
        const arr = childrenOf.get(l.en) ?? [];
        arr.push(l.id);
        childrenOf.set(l.en, arr);
    }
    return {
        manifest: MANIFEST,
        entidades,
        sistemas,
        lugares,
        facciones: [],
        pnjs: [],
        pistas,
        tramas,
        tablas: [],
        problemas: [],
        childrenOf,
        estadoGrupo: null,
        diario: [],
        musica: { bgm: [], eventPlaylists: [] },
        tiendas: new Map(),
        resumen: null,
        guias: [],
    };
}

function trama(id: string, opts: { lugaresClave?: string[]; pistas?: Lead[] } = {}): Trama {
    return {
        ...base(id, 'trama'),
        rol: 'principal',
        estadoTrama: 'activa',
        lugaresClave: opts.lugaresClave ?? [],
        facciones: [],
        pistas: opts.pistas ?? [],
    };
}

describe('tramaThreadNodes', () => {
    test('resolves lugaresClave + pistas.donde to deduped sector nodes (coords × WORLD_SCALE)', () => {
        const t = trama('web', {
            // porto -> sistema_a {0,0}; node_deep {14,-14} (deep-space root)
            lugaresClave: ['porto', 'node_deep'],
            // brasa -> sistema_b {6,3}
            pistas: [pista('p1', { trama: 'web', donde: 'brasa' })],
        });
        const model = makeModel([t]);
        const { nodes, places } = tramaThreadNodes(model, 'web');

        expect(places).toEqual(['porto', 'node_deep', 'brasa']);
        // Three distinct sector roots, in the collection order.
        expect(nodes.map((n) => n.id)).toEqual(['sistema_a', 'node_deep', 'sistema_b']);
        expect(nodes).toContainEqual({ id: 'sistema_a', x: 0, y: 0 });
        expect(nodes).toContainEqual({ id: 'node_deep', x: 14 * WORLD_SCALE, y: -14 * WORLD_SCALE });
        expect(nodes).toContainEqual({ id: 'sistema_b', x: 6 * WORLD_SCALE, y: 3 * WORLD_SCALE });
    });

    test('dedupes roots when several places share one sector', () => {
        const t = trama('web', {
            // porto AND its pista both roll up to sistema_a -> one node.
            lugaresClave: ['porto'],
            pistas: [pista('p1', { trama: 'web', donde: 'porto' })],
        });
        const model = makeModel([t]);
        const { nodes } = tramaThreadNodes(model, 'web');
        expect(nodes.map((n) => n.id)).toEqual(['sistema_a']);
    });

    test('drops pistas with donde absent and coord-less roots', () => {
        const t = trama('web', {
            // sin_sistema -> sistema_nc (no coordenadas) -> skipped.
            lugaresClave: ['sin_sistema', 'porto'],
            pistas: [
                pista('p1', { trama: 'web' }), // donde absent -> dropped
                pista('p2', { trama: 'web', donde: 'brasa' }),
            ],
        });
        const model = makeModel([t]);
        const { nodes, places } = tramaThreadNodes(model, 'web');
        // donde-absent pista never contributes a place.
        expect(places).toEqual(['sin_sistema', 'porto', 'brasa']);
        // sistema_nc has no coords -> only porto + brasa's sistemas render.
        expect(nodes.map((n) => n.id).sort()).toEqual(['sistema_a', 'sistema_b']);
    });

    test('unknown trama returns empty nodes and places, never throws', () => {
        const model = makeModel([trama('web')]);
        expect(tramaThreadNodes(model, 'no_existe')).toEqual({ nodes: [], places: [] });
    });

    test('empty trama (no places) returns empty nodes', () => {
        const model = makeModel([trama('web')]);
        expect(tramaThreadNodes(model, 'web')).toEqual({ nodes: [], places: [] });
    });
});
