/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import type { PlaceEntity, Shop, SystemEntity, WorldEntityBase, WorldModel } from '@/types/world';
import { affordancesFor, parseShop } from './shops';

const PATH = 'mundo/lugares/porto_verne/tiendas/taller.md';

describe('parseShop', () => {
    test('parses frontmatter + prose + table', () => {
        const content = `---
tipo: tienda
nombre: Taller de Bracca
pnj: bracca
etiquetas: [taller]
---
Bracca repara casi cualquier cosa.

| articulo | precio | stock | nota |
|---|---|---|---|
| Célula de combustible | 120 | 4 | recargable |
| Kit de reparación | 60 | - |  |
`;
        const { shop, issues } = parseShop(content, PATH, 'taller');
        expect(issues).toEqual([]);
        expect(shop.id).toBe('taller');
        expect(shop.nombre).toBe('Taller de Bracca');
        expect(shop.pnj).toBe('bracca');
        expect(shop.etiquetas).toEqual(['taller']);
        expect(shop.body).toBe('Bracca repara casi cualquier cosa.');
        expect(shop.items).toEqual([
            { articulo: 'Célula de combustible', precio: 120, stock: 4, nota: 'recargable' },
            { articulo: 'Kit de reparación', precio: 60, stock: null },
        ]);
    });

    test('empty stock cell is null (unlimited)', () => {
        const content = `---
tipo: tienda
nombre: X
---
| articulo | precio | stock | nota |
|---|---|---|---|
| Agua | 2 |  |  |
`;
        const { shop } = parseShop(content, PATH, 'x');
        expect(shop.items[0].stock).toBeNull();
    });

    test('columns located by header position, not order', () => {
        const content = `---
tipo: tienda
nombre: X
---
| nota | stock | articulo | precio |
|---|---|---|---|
| barato | 3 | Pan | 5 |
`;
        const { shop } = parseShop(content, PATH, 'x');
        expect(shop.items[0]).toEqual({ articulo: 'Pan', precio: 5, stock: 3, nota: 'barato' });
    });

    test('non-integer precio row is skipped with an aviso', () => {
        const content = `---
tipo: tienda
nombre: X
---
| articulo | precio | stock | nota |
|---|---|---|---|
| Bueno | 10 | 1 |  |
| Malo | 3.5 | 1 |  |
`;
        const { shop, issues } = parseShop(content, PATH, 'x');
        expect(shop.items.map((i) => i.articulo)).toEqual(['Bueno']);
        expect(issues.length).toBe(1);
        expect(issues[0].nivel).toBe('aviso');
    });

    test('no table → empty items, whole body kept, no throw', () => {
        const content = `---
tipo: tienda
nombre: Sin catálogo
---
Aún no hay precios listados.
`;
        const { shop, issues } = parseShop(content, PATH, 'sin_catalogo');
        expect(shop.items).toEqual([]);
        expect(shop.body).toBe('Aún no hay precios listados.');
        expect(issues).toEqual([]);
    });

    test('missing nombre falls back to the id; missing pnj stays undefined', () => {
        const content = `---
tipo: tienda
---
| articulo | precio | stock | nota |
|---|---|---|---|
| Cosa | 1 | 1 |  |
`;
        const { shop } = parseShop(content, PATH, 'mi_tienda');
        expect(shop.nombre).toBe('mi_tienda');
        expect(shop.pnj).toBeUndefined();
    });

    test('garbage content never throws', () => {
        expect(() => parseShop('not markdown at all {[}', PATH, 'x')).not.toThrow();
        expect(() => parseShop('', PATH, 'x')).not.toThrow();
    });
});

// ── affordancesFor: shop/info map-node badge derivation ─────────────────────

/** Minimal PlaceEntity with just the fields affordancesFor reads. */
function place(id: string, servicios: string[]): PlaceEntity {
    return {
        id,
        tipo: 'estacion',
        nombre: id,
        filePath: `mundo/lugares/${id}/lugar.md`,
        conocimiento: 'conocido',
        etiquetas: [],
        raw: {},
        body: '',
        servicios,
        facciones: [],
        acceso: 'normal',
    };
}

/** Minimal SystemEntity (no `servicios` field — the guard must handle it). */
function system(id: string): SystemEntity {
    return {
        id,
        tipo: 'sistema',
        nombre: id,
        filePath: `mundo/sistemas/${id}.md`,
        conocimiento: 'conocido',
        etiquetas: [],
        raw: {},
        body: '',
        coordenadas: { x: 0, y: 0 },
    };
}

/** A WorldModel carrying only the two maps affordancesFor reads. */
function modelWith(
    entities: WorldEntityBase[],
    tiendas: Record<string, Shop[]> = {}
): WorldModel {
    const entidades = new Map<string, WorldEntityBase>();
    for (const e of entities) entidades.set(e.id, e);
    return {
        entidades,
        tiendas: new Map(Object.entries(tiendas)),
    } as unknown as WorldModel;
}

function shop(id: string): Shop {
    return { id, nombre: id, etiquetas: [], items: [], body: '', filePath: `x/${id}.md` };
}

describe('affordancesFor', () => {
    test('shop from a non-empty tiendas entry', () => {
        const model = modelWith([place('brasa', [])], { brasa: [shop('s1')] });
        expect(affordancesFor(model, 'brasa')).toEqual({ shop: true, info: false });
    });

    test('an empty tiendas array is NOT a shop', () => {
        const model = modelWith([place('brasa', [])], { brasa: [] });
        expect(affordancesFor(model, 'brasa')).toEqual({ shop: false, info: false });
    });

    test('shop from servicios mercado', () => {
        const model = modelWith([place('mkt', ['mercado'])]);
        expect(affordancesFor(model, 'mkt')).toEqual({ shop: true, info: false });
    });

    test('shop from servicios contrabando', () => {
        const model = modelWith([place('smug', ['contrabando'])]);
        expect(affordancesFor(model, 'smug')).toEqual({ shop: true, info: false });
    });

    test('info from servicios informacion', () => {
        const model = modelWith([place('torre', ['informacion'])]);
        expect(affordancesFor(model, 'torre')).toEqual({ shop: false, info: true });
    });

    test('info from servicios ocio', () => {
        const model = modelWith([place('bar', ['ocio'])]);
        expect(affordancesFor(model, 'bar')).toEqual({ shop: false, info: true });
    });

    test('both shop and info when servicios carry each', () => {
        const model = modelWith([place('hub', ['mercado', 'informacion'])]);
        expect(affordancesFor(model, 'hub')).toEqual({ shop: true, info: true });
    });

    test('a bare sistema (no servicios field) yields no affordances', () => {
        const model = modelWith([system('sis')]);
        expect(affordancesFor(model, 'sis')).toEqual({ shop: false, info: false });
    });

    test('a place with irrelevant servicios yields nothing', () => {
        const model = modelWith([place('field', ['refugio', 'taller'])]);
        expect(affordancesFor(model, 'field')).toEqual({ shop: false, info: false });
    });

    test('an unknown id yields no affordances (no crash)', () => {
        const model = modelWith([]);
        expect(affordancesFor(model, 'nope')).toEqual({ shop: false, info: false });
    });
});
