/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import {
    splitFrontmatter,
    parseFrontmatter,
    normalizeKeys,
    asString,
    asNumber,
    asStringArray,
    asCoords,
} from './frontmatter';

describe('splitFrontmatter', () => {
    test('splits a valid frontmatter fence from the body', () => {
        const result = splitFrontmatter('---\ntipo: sistema\nnombre: Verne\n---\n# Verne\n\nProsa.\n');
        expect(result.yamlText).toBe('tipo: sistema\nnombre: Verne\n');
        expect(result.body).toBe('# Verne\n\nProsa.\n');
    });

    test('no frontmatter: whole content is body, yamlText null', () => {
        const result = splitFrontmatter('# Solo prosa\n\nSin fence.\n');
        expect(result.yamlText).toBeNull();
        expect(result.body).toBe('# Solo prosa\n\nSin fence.\n');
    });

    test('tolerates CRLF line endings', () => {
        const result = splitFrontmatter('---\r\ntipo: lugar\r\n---\r\ncuerpo\r\n');
        expect(result.yamlText).toBe('tipo: lugar\r\n');
        expect(result.body).toBe('cuerpo\r\n');
    });

    test('tolerates a leading BOM', () => {
        const result = splitFrontmatter('\uFEFF' + '---\ntipo: pnj\n---\nbody');
        expect(result.yamlText).toBe('tipo: pnj\n');
        expect(result.body).toBe('body');
    });

    test('strips the BOM even when there is no frontmatter', () => {
        const result = splitFrontmatter('\uFEFF' + 'solo texto');
        expect(result.yamlText).toBeNull();
        expect(result.body).toBe('solo texto');
    });

    test('empty frontmatter block', () => {
        const result = splitFrontmatter('---\n---\ncuerpo\n');
        expect(result.yamlText).toBe('');
        expect(result.body).toBe('cuerpo\n');
    });

    test('unclosed fence is treated as no frontmatter', () => {
        const content = '---\ntipo: sistema\nsin cierre\n';
        const result = splitFrontmatter(content);
        expect(result.yamlText).toBeNull();
        expect(result.body).toBe(content);
    });

    test('fence not at file start is not frontmatter', () => {
        const content = '\n---\ntipo: sistema\n---\n';
        const result = splitFrontmatter(content);
        expect(result.yamlText).toBeNull();
        expect(result.body).toBe(content);
    });

    test('tolerates trailing spaces on the fence lines', () => {
        const result = splitFrontmatter('---  \ntipo: trama\n---\t\ncuerpo');
        expect(result.yamlText).toBe('tipo: trama\n');
        expect(result.body).toBe('cuerpo');
    });

    test('closing fence at EOF without trailing newline', () => {
        const result = splitFrontmatter('---\ntipo: pista\n---');
        expect(result.yamlText).toBe('tipo: pista\n');
        expect(result.body).toBe('');
    });

    test('a later --- hr stays in the body', () => {
        const result = splitFrontmatter('---\na: 1\n---\narriba\n---\nabajo\n');
        expect(result.yamlText).toBe('a: 1\n');
        expect(result.body).toBe('arriba\n---\nabajo\n');
    });
});

describe('parseFrontmatter', () => {
    test('valid frontmatter: data + body, no issue', () => {
        const result = parseFrontmatter(
            '---\ntipo: sistema\ncoordenadas: {x: 3, y: -2}\netiquetas: [pirata, frontera]\n---\nProsa.\n',
            'mundo/sistemas/verne.md'
        );
        expect(result.issue).toBeUndefined();
        expect(result.data.tipo).toBe('sistema');
        expect(result.data.coordenadas).toEqual({ x: 3, y: -2 });
        expect(result.data.etiquetas).toEqual(['pirata', 'frontera']);
        expect(result.body).toBe('Prosa.\n');
    });

    test('malformed YAML: never throws, empty data + nivel error issue with file path', () => {
        const result = parseFrontmatter(
            '---\nnombre: [sin cerrar\n---\ncuerpo intacto\n',
            'mundo/lugares/roto.md'
        );
        expect(result.data).toEqual({});
        expect(result.body).toBe('cuerpo intacto\n');
        expect(result.issue).toBeDefined();
        expect(result.issue?.nivel).toBe('error');
        expect(result.issue?.archivo).toBe('mundo/lugares/roto.md');
        expect(result.issue?.mensaje).toContain('YAML');
    });

    test('non-map frontmatter (list) is an error issue', () => {
        const result = parseFrontmatter('---\n- a\n- b\n---\ncuerpo\n', 'mundo/pistas/lista.md');
        expect(result.data).toEqual({});
        expect(result.issue?.nivel).toBe('error');
        expect(result.issue?.archivo).toBe('mundo/pistas/lista.md');
    });

    test('non-map frontmatter (scalar) is an error issue', () => {
        const result = parseFrontmatter('---\nsolo texto\n---\n', 'mundo/pnjs/escalar.md');
        expect(result.data).toEqual({});
        expect(result.issue?.nivel).toBe('error');
    });

    test('empty frontmatter: empty data, no issue', () => {
        const result = parseFrontmatter('---\n---\ncuerpo\n', 'mundo/x.md');
        expect(result.data).toEqual({});
        expect(result.issue).toBeUndefined();
        expect(result.body).toBe('cuerpo\n');
    });

    test('no frontmatter: empty data, no issue, body intact', () => {
        const result = parseFrontmatter('# Titulo\n', 'mundo/x.md');
        expect(result.data).toEqual({});
        expect(result.issue).toBeUndefined();
        expect(result.body).toBe('# Titulo\n');
    });

    test('CRLF file parses data correctly', () => {
        const result = parseFrontmatter(
            '---\r\ntipo: lugar\r\norbita: 2\r\n---\r\ncuerpo\r\n',
            'mundo/lugares/kovar_iii.md'
        );
        expect(result.issue).toBeUndefined();
        expect(result.data).toEqual({ tipo: 'lugar', orbita: 2 });
    });

    test('multiline estado blurb (folded scalar) survives', () => {
        const result = parseFrontmatter(
            '---\nestado: >\n  Bloqueo naval\n  tras el incidente.\n---\n',
            'mundo/sistemas/s.md'
        );
        expect(result.issue).toBeUndefined();
        expect(result.data.estado).toBe('Bloqueo naval tras el incidente.\n');
    });
});

describe('normalizeKeys', () => {
    test('maps every english alias to its spanish canonical key', () => {
        const result = normalizeKeys({
            type: 'lugar',
            name: 'Porto Verne',
            in: 'sistema_verne',
            tags: ['puerto'],
            knowledge: 'visitado',
            status: 'bullicio',
            summary: 'Puerto franco',
            services: ['mercado'],
            coords: { x: 1, y: 2 },
            orbit: 3,
            weight: 5,
            if: 'combustible<=2',
            context: 'viaje',
        });
        expect(result).toEqual({
            tipo: 'lugar',
            nombre: 'Porto Verne',
            en: 'sistema_verne',
            etiquetas: ['puerto'],
            conocimiento: 'visitado',
            estado: 'bullicio',
            resumen: 'Puerto franco',
            servicios: ['mercado'],
            coordenadas: { x: 1, y: 2 },
            orbita: 3,
            peso: 5,
            si: 'combustible<=2',
            contexto: 'viaje',
        });
    });

    test('spanish wins when both forms are present, regardless of key order', () => {
        expect(normalizeKeys({ type: 'ingles', tipo: 'espanol' })).toEqual({ tipo: 'espanol' });
        expect(normalizeKeys({ nombre: 'espanol', name: 'ingles' })).toEqual({ nombre: 'espanol' });
    });

    test('unknown keys pass through untouched', () => {
        expect(normalizeKeys({ peligro: 4, faccion: 'consorcio' })).toEqual({
            peligro: 4,
            faccion: 'consorcio',
        });
    });

    test('shallow: nested objects are not normalized', () => {
        const result = normalizeKeys({ coords: { x: 1, y: 2 }, extra: { type: 'anidado' } });
        expect(result.coordenadas).toEqual({ x: 1, y: 2 });
        expect(result.extra).toEqual({ type: 'anidado' });
    });

    test('empty object stays empty', () => {
        expect(normalizeKeys({})).toEqual({});
    });
});

describe('asString', () => {
    test('passes strings through, trimmed', () => {
        expect(asString('hola')).toBe('hola');
        expect(asString('  con espacios  ')).toBe('con espacios');
    });

    test('empty and whitespace-only strings are undefined', () => {
        expect(asString('')).toBeUndefined();
        expect(asString('   ')).toBeUndefined();
    });

    test('numbers and booleans stringify', () => {
        expect(asString(42)).toBe('42');
        expect(asString(3.5)).toBe('3.5');
        expect(asString(true)).toBe('true');
    });

    test('null, undefined, objects and arrays are undefined', () => {
        expect(asString(null)).toBeUndefined();
        expect(asString(undefined)).toBeUndefined();
        expect(asString({})).toBeUndefined();
        expect(asString(['a'])).toBeUndefined();
    });
});

describe('asNumber', () => {
    test('passes finite numbers through (including 0 and negatives)', () => {
        expect(asNumber(3)).toBe(3);
        expect(asNumber(0)).toBe(0);
        expect(asNumber(-2.5)).toBe(-2.5);
    });

    test('coerces numeric strings', () => {
        expect(asNumber('42')).toBe(42);
        expect(asNumber(' 7 ')).toBe(7);
        expect(asNumber('-3.14')).toBe(-3.14);
    });

    test('rejects non-numeric strings and empty strings', () => {
        expect(asNumber('abc')).toBeUndefined();
        expect(asNumber('')).toBeUndefined();
        expect(asNumber('  ')).toBeUndefined();
    });

    test('rejects NaN and Infinity', () => {
        expect(asNumber(NaN)).toBeUndefined();
        expect(asNumber(Infinity)).toBeUndefined();
        expect(asNumber('Infinity')).toBeUndefined();
    });

    test('rejects null, booleans, objects and arrays', () => {
        expect(asNumber(null)).toBeUndefined();
        expect(asNumber(true)).toBeUndefined();
        expect(asNumber({})).toBeUndefined();
        expect(asNumber([1])).toBeUndefined();
    });
});

describe('asStringArray', () => {
    test('passes string arrays through', () => {
        expect(asStringArray(['a', 'b'])).toEqual(['a', 'b']);
    });

    test('coerces scalar items and drops uncoercible ones', () => {
        expect(asStringArray([1, 'x', null, {}, '', 'y'])).toEqual(['1', 'x', 'y']);
    });

    test('wraps a lone scalar (etiquetas: pirata written without brackets)', () => {
        expect(asStringArray('pirata')).toEqual(['pirata']);
        expect(asStringArray(5)).toEqual(['5']);
    });

    test('null, undefined, objects and empty strings yield []', () => {
        expect(asStringArray(null)).toEqual([]);
        expect(asStringArray(undefined)).toEqual([]);
        expect(asStringArray({})).toEqual([]);
        expect(asStringArray('')).toEqual([]);
    });

    test('empty array stays empty', () => {
        expect(asStringArray([])).toEqual([]);
    });
});

describe('asCoords', () => {
    test('accepts {x, y} with numbers (including 0)', () => {
        expect(asCoords({ x: 3, y: -2 })).toEqual({ x: 3, y: -2 });
        expect(asCoords({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
    });

    test('coerces numeric-string members', () => {
        expect(asCoords({ x: '3', y: '4.5' })).toEqual({ x: 3, y: 4.5 });
    });

    test('ignores extra keys', () => {
        expect(asCoords({ x: 1, y: 2, z: 9 })).toEqual({ x: 1, y: 2 });
    });

    test('rejects missing or non-numeric members', () => {
        expect(asCoords({ x: 1 })).toBeUndefined();
        expect(asCoords({ y: 2 })).toBeUndefined();
        expect(asCoords({ x: 1, y: 'norte' })).toBeUndefined();
        expect(asCoords({ x: NaN, y: 2 })).toBeUndefined();
    });

    test('rejects non-object values', () => {
        expect(asCoords(null)).toBeUndefined();
        expect(asCoords(undefined)).toBeUndefined();
        expect(asCoords([1, 2])).toBeUndefined();
        expect(asCoords('1,2')).toBeUndefined();
        expect(asCoords(7)).toBeUndefined();
    });
});

describe('integration: parse + normalize on an english-authored file', () => {
    test('an entity written with english keys normalizes to the spanish schema', () => {
        const parsed = parseFrontmatter(
            '---\ntype: estacion\nname: Puerto Kovar\nin: sistema_kovar\ntags: [comercio]\nknowledge: rumoreado\norbit: 2\nservices:\n  - mercado\n  - repostaje\n---\nProsa del lugar.\n',
            'mundo/lugares/puerto_kovar.md'
        );
        expect(parsed.issue).toBeUndefined();

        const data = normalizeKeys(parsed.data);
        expect(data.tipo).toBe('estacion');
        expect(data.nombre).toBe('Puerto Kovar');
        expect(data.en).toBe('sistema_kovar');
        expect(asStringArray(data.etiquetas)).toEqual(['comercio']);
        expect(data.conocimiento).toBe('rumoreado');
        expect(asNumber(data.orbita)).toBe(2);
        expect(asStringArray(data.servicios)).toEqual(['mercado', 'repostaje']);
        expect(parsed.body).toBe('Prosa del lugar.\n');
    });
});
