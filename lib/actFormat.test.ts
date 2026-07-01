/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { isActFormat, parseAct, visibleBlocks } from './actFormat';

const SAMPLE = `# ACTO 1: SEÑAL DE PARTIDA
## Sesión 7 — Relanzamiento
## Duración Estimada: 70–90 minutos

:::recurso{tipo=musica}
Cabina_Nave (default)
:::

:::gm{ambito=acto}
TONO. Nunca comparar a los PJs con la Dra. Venth.
:::

---

## 1. Reentrada y triaje
:::leer
El portal se cierra a vuestra espalda.
:::
:::gm
Presenta las tres presiones juntas; no impongas orden.
:::
:::accion
**Reparación de la nave**
- check: Crafting DC 18 · o Computers DC 16
- exito: la nave queda "a punto".
- fallo: parten "remendados" (−2 Piloting).
- mod: red de seguridad DC 12.
:::

### Sub-beat de Dax
:::gm
Una sola línea plana, sin pathos.
:::
`;

describe('isActFormat', () => {
  test('detects the new format and rejects plain markdown', () => {
    expect(isActFormat(SAMPLE)).toBe(true);
    expect(isActFormat('# Old act\n\nDESCRIPCIÓN (Leer): "..."')).toBe(false);
    expect(isActFormat('')).toBe(false);
    expect(isActFormat(null)).toBe(false);
  });
});

describe('parseAct', () => {
  const m = parseAct(SAMPLE);

  test('title + non-numbered ## header lines become subtitle, not sections', () => {
    expect(m.title).toBe('ACTO 1: SEÑAL DE PARTIDA');
    expect(m.subtitle).toContain('Sesión 7');
    expect(m.subtitle).toContain('Duración');
    expect(m.sections.map((s) => s.title)).toEqual(['1. Reentrada y triaje', 'Sub-beat de Dax']);
  });

  test('act-scoped blocks (before first section or {ambito=acto})', () => {
    expect(m.actBlocks).toHaveLength(2);
    expect(m.actBlocks.map((b) => b.type).sort()).toEqual(['gm', 'recurso']);
    expect(m.actBlocks.every((b) => b.actScope)).toBe(true);
    const rec = m.actBlocks.find((b) => b.type === 'recurso');
    expect(rec?.attrs.tipo).toBe('musica');
  });

  test('section blocks and subsection parenting', () => {
    const sec1 = m.sections[0];
    expect(sec1.level).toBe(2);
    expect(sec1.blocks.map((b) => b.type)).toEqual(['leer', 'gm', 'accion']);
    const sub = m.sections[1];
    expect(sub.level).toBe(3);
    expect(sub.parentId).toBe(sec1.id);
  });

  test('accion name + fields parsed', () => {
    const accion = m.sections[0].blocks.find((b) => b.type === 'accion')!;
    expect(accion.name).toBe('Reparación de la nave');
    const keys = accion.fields!.map((f) => f.key);
    expect(keys).toEqual(['check', 'exito', 'fallo', 'mod']);
    expect(accion.fields!.find((f) => f.key === 'check')!.value).toContain('Crafting DC 18');
  });
});

describe('visibleBlocks (scope persistence)', () => {
  const m = parseAct(SAMPLE);
  const sec1 = m.sections[0];
  const sub = m.sections[1];

  test('a subsection shows act + parent-section + its own blocks', () => {
    const vis = visibleBlocks(m, sub.id);
    // 2 act + 3 parent-section + 1 subsection = 6
    expect(vis).toHaveLength(6);
  });

  test('a section shows act + its own blocks', () => {
    expect(visibleBlocks(m, sec1.id)).toHaveLength(5); // 2 act + 3 section
  });

  test('no active section still shows act-scoped blocks', () => {
    expect(visibleBlocks(m, null)).toHaveLength(2);
  });
});
