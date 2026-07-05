/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { isActFormat, parseAct, parseReto, visibleBlocks, sectionBlocks, ActSection } from './actFormat';

const SAMPLE = `# ACTO TEST
## Sesión 7 — Relanzamiento
## Duración Estimada: 70–90 minutos

:::gm{ambito=acto}
TONO. Nunca comparar con la Dra. Venth.
:::

## 5. PUNTO DE RAMIFICACIÓN
:::leer
Los tres nodos laten.
:::

### 🔵 NODO A — El Coro de Vidrio
:::leer
Gancho sensorial A.
:::
:::accion
**Beat A**
- check: Perception DC 15
:::

### 🟢 NODO B — El Jardín que Respira
:::accion
**Beat de Dax**
- check: Medicine DC 15
:::

### 🔴 NODO C — El Reloj de la Disputa
:::accion
**Beat C**
- check: Society DC 15
:::

## 2. LAS CUENTAS PENDIENTES
:::gm
Nota de la sección 2.
:::

### 2A — Kael Voss
:::accion
**Negociar con Kael**
- check: Diplomacy DC 16
:::

### 2.b — Bram Oskar
:::accion
**Leer a Bram**
- check: Sense Motive DC 15
:::
`;

const m = parseAct(SAMPLE);
const byLabel = (l: string) => m.sections.find((s) => s.label === l) as ActSection;

describe('isActFormat', () => {
  test('detects the format', () => {
    expect(isActFormat(SAMPLE)).toBe(true);
    expect(isActFormat('# Old\nDESCRIPCIÓN (Leer): x')).toBe(false);
  });
});

describe('numbering decides structure', () => {
  test('only numbered headings become sections/subsections', () => {
    expect(m.sections.map((s) => s.label)).toEqual(['5', '2', '2A', '2.b']);
    // the three NODO headings are NOT sections
    expect(m.sections.some((s) => s.title.includes('NODO'))).toBe(false);
  });

  test('bare number = section; number+sub-id = subsection', () => {
    expect(byLabel('5').isSection).toBe(true);
    expect(byLabel('2').isSection).toBe(true);
    expect(byLabel('2A').isSection).toBe(false);
    expect(byLabel('2.b').isSection).toBe(false);
    expect(byLabel('2A').parentId).toBe(byLabel('2').id);
    expect(byLabel('2.b').parentId).toBe(byLabel('2').id);
  });

  test('non-numbered NODO headings become content headings inside section 5', () => {
    const s5 = byLabel('5');
    const headings = s5.content.filter((c) => c.kind === 'heading').map((c: any) => c.text);
    expect(headings.some((h) => h.includes('NODO A'))).toBe(true);
    expect(headings.some((h) => h.includes('NODO B'))).toBe(true);
    expect(headings.some((h) => h.includes('NODO C'))).toBe(true);
  });
});

describe('scope: all three node actions visible across section 5', () => {
  test('section 5 owns every node action', () => {
    const s5 = byLabel('5');
    const actions = sectionBlocks(s5).filter((b) => b.type === 'accion');
    expect(actions.map((a) => a.name)).toEqual(['Beat A', 'Beat de Dax', 'Beat C']);
    // and visibleBlocks while in section 5 shows all three (they don't hide as you scroll)
    expect(visibleBlocks(m, s5.id).filter((b) => b.type === 'accion')).toHaveLength(3);
  });

  test('a real subsection only shows its own + parent + act actions', () => {
    const s2a = byLabel('2A');
    const actions = visibleBlocks(m, s2a.id).filter((b) => b.type === 'accion');
    expect(actions.map((a) => a.name)).toEqual(['Negociar con Kael']); // not Bram (sibling)
  });
});

describe('reto: skill-challenge target parsing', () => {
  test('accepts the canonical "<N> exitos / <M> fallos" form', () => {
    expect(parseReto('4 exitos / 3 fallos')).toEqual({ exitosMeta: 4, fallosMeta: 3 });
  });
  test('accepts accents and casing', () => {
    expect(parseReto('4 Éxitos / 3 Fallos')).toEqual({ exitosMeta: 4, fallosMeta: 3 });
  });
  test('accepts the bare "<N>/<M>" form', () => {
    expect(parseReto('3/2')).toEqual({ exitosMeta: 3, fallosMeta: 2 });
  });
  test('accepts the "<N> exitos antes de <M> fallos" prose form', () => {
    expect(parseReto('3 exitos antes de 2 fallos')).toEqual({ exitosMeta: 3, fallosMeta: 2 });
  });
  test('ignores malformed retos (returns undefined, never throws)', () => {
    expect(parseReto('muchos exitos')).toBeUndefined();
    expect(parseReto('4 exitos')).toBeUndefined(); // only one number
    expect(parseReto('0 / 3')).toBeUndefined(); // non-positive
    expect(parseReto('4 / 0')).toBeUndefined();
    expect(parseReto('')).toBeUndefined();
    expect(parseReto(undefined)).toBeUndefined();
  });

  test('absent reto leaves the ActionBlock meta undefined (behavior unchanged)', () => {
    const beatA = sectionBlocks(byLabel('5')).find((b) => b.name === 'Beat A')!;
    expect(beatA.exitosMeta).toBeUndefined();
    expect(beatA.fallosMeta).toBeUndefined();
  });

  test('a :::accion carrying reto: exposes exitosMeta/fallosMeta on the block', () => {
    const model = parseAct(`# T
## 1. Reto
:::accion
**Desafio**
- check: Athletics DC 15
- reto: 4 exitos / 3 fallos
:::
`);
    const block = sectionBlocks(model.sections[0]).find((b) => b.type === 'accion')!;
    expect(block.exitosMeta).toBe(4);
    expect(block.fallosMeta).toBe(3);
  });

  test('a malformed rez: on a :::accion leaves the block meta absent (no throw)', () => {
    const model = parseAct(`# T
## 1. Reto
:::accion
**Desafio**
- reto: sin numeros
:::
`);
    const block = sectionBlocks(model.sections[0]).find((b) => b.type === 'accion')!;
    expect(block.exitosMeta).toBeUndefined();
    expect(block.fallosMeta).toBeUndefined();
  });
});

describe('header + act-scope + accion fields', () => {
  test('subtitle + act reminder + fields', () => {
    expect(m.subtitle).toContain('Sesión 7');
    expect(m.subtitle).toContain('Duración');
    expect(m.actBlocks.filter((b) => b.type === 'gm')).toHaveLength(1);
    const beatA = sectionBlocks(byLabel('5')).find((b) => b.name === 'Beat A')!;
    expect(beatA.fields!.find((f) => f.key === 'check')!.value).toContain('Perception DC 15');
  });
});
