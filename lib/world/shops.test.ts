/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { parseShop } from './shops';

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
