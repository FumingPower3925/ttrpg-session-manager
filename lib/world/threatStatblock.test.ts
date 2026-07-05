import { describe, expect, it } from 'bun:test';
import { hasStatblock, parseThreatStatblock } from './threatStatblock';

// The snippets below mirror the REAL threat fichas verbatim (heading + fenced
// stat block), e.g.
//   mundo/lugares/jardin_que_exhala/threats/depredador_jardin.md
//   mundo/lugares/jardin_que_exhala/threats/brote_esporas.md
//   mundo/lugares/coro_de_vidrio/threats/guardian_de_cristal.md
// Labels are Spanish "CA"/"PV" (not AC/HP), inside a ``` fence, with the level
// on the name line ("CRIATURA 3" / "PELIGRO / ENJAMBRE 2").

const DEPREDADOR = `# DEPREDADOR DEL JARDÍN
## Amenaza — Fauna alfa territorial (Nodo B, set-piece Acto 3)

Mole de tejido vegetal y músculo que PLANEA con membranas-raíz.

---

\`\`\`
DEPREDADOR DEL JARDÍN                            CRIATURA 3
GRANDE BESTIA (PLANTA)
Perception +11 (olfato/vibración; ciego a color, ve calor)
Str +5, Dex +2, Con +4, Int -3, Wis +3, Cha +0

AC 19; Fort +12, Ref +6, Will +8
(REFLEJOS REBAJADOS a propósito)
HP 58
Debilidad: fuego 5 (clave para Chesco)

Speed 25 pies, planeo 35 pies

ATAQUES
Cuerpo a cuerpo [1 acción] mordisco-capullo +12 (alcance 10 pies), Daño 2d8+4 perforante
Cuerpo a cuerpo [1 acción] zarpa-raíz +12 (agile, alcance 10 pies), Daño 1d10+5 contundente
\`\`\`
`;

const BROTE = `# BROTE DE ESPORAS HOSTILES
## Amenaza — Peligro ambiental + enjambre (Nodo B, Actos 2-3)

Nube viva de esporas que el bioma "suelta" como defensa.

---

\`\`\`
BROTE DE ESPORAS HOSTILES                        PELIGRO / ENJAMBRE 2
GRANDE PLANTA (ENJAMBRE)
Perception +8 (sin vista; siente movimiento/calor)
Str -2, Dex +3, Con +3, Int -5, Wis +2, Cha -4

AC 16; Fort +9, Ref +6, Will +6
HP 30
Debilidad: fuego 6 (clave — Chesco lo borra), daño de área 5
\`\`\`
`;

const GUARDIAN = `# GUARDIÁN DE CRISTAL
## Enemigo del Nodo A — Constructo resonante (set-piece Acto 3)

Una figura humanoide tallada en cristal resonante.

---

\`\`\`
GUARDIÁN DE CRISTAL                              CRIATURA 3
MEDIANO CONSTRUCTO PREDECESSOR
Perception +10 (vista por vibración)

Str +4, Dex +1, Con +4, Int -3, Wis +2, Cha +0

AC 21 (alta — degradar con área/fuego/pulsos);
Fort +11, Ref +6 (REBAJADO), Will +8
HP 50
Debilidades: fuego 5, sónico 5
\`\`\`
`;

// A ficha that uses the canonical CA/PV labels and tolerated punctuation
// ("CA: 19", "PV 58 (") — the exact tolerance the prompt calls out.
const CANONICAL_CA_PV = `**Sabueso de Vidrio**

CA: 21; Fort +11, Ref +6
PV 44 (constructo, sin sangrado)
`;

// A RESKIN ficha (the real Custodio de Ecos): a prose line ABOVE the fence
// describes the BASE creature's "AC 18 / HP 45" stats, then the actual fenced
// stat block carries the reskin's real "AC 19 / HP 48". The parser must prefer
// the fenced stats, not the earliest document-wide occurrence.
const RESKIN_BASE_IN_PROSE = `# CUSTODIO DE ECOS
## Enemigo del Nodo A — Constructo controlador (set-piece Acto 2b)

BASE ALIEN CORE: Hardlight Mascot (Criatura 3, Alien Core p.88; AC 18 / HP 45 / Fort +7 / Ref +10 / Will +11; pixel blast +12, kick 2d6+2 force, Taunt 4d6 mental DC 19). Reskin a constructo de luz-sonido.

---

\`\`\`
CUSTODIO DE ECOS                                 CRIATURA 3
MEDIANO CONSTRUCTO PREDECESSOR
Perception +12

Str +2, Dex +1, Con +4, Int -2, Wis +4, Cha +1

AC 19 (alta — degradar con área/fuego/empujes);
Fort +11, Ref +6 (REBAJADO), Will +8
HP 48
Debilidades: fuego 5, daño de área 5
\`\`\`
`;

// A threat doc with NO statblock: prose only. hasStatblock -> false.
const NO_STATBLOCK = `# Dron de aduanas

Escanea el casco al acoplar. Nivel 1. Un peligro narrativo, sin ficha de combate.
`;

describe('parseThreatStatblock', () => {
  it('parses the real Depredador ficha (CA 19 / PV 58 / CRIATURA 3)', () => {
    const s = parseThreatStatblock(DEPREDADOR);
    expect(s.ca).toBe(19);
    expect(s.pv).toBe(58);
    expect(s.nivel).toBe(3);
    // Name comes from the first heading, softened from ALL CAPS.
    expect(s.nombre).toBe('Depredador Del Jardín');
    // A couple of attack lines are captured verbatim.
    expect(s.ataques?.[0]).toContain('mordisco-capullo +12');
    expect(s.ataques?.[0]).toContain('2d8+4');
  });

  it('parses the real Brote ficha (CA 16 / PV 30 / PELIGRO 2)', () => {
    const s = parseThreatStatblock(BROTE);
    expect(s.ca).toBe(16);
    expect(s.pv).toBe(30);
    expect(s.nivel).toBe(2);
    expect(s.nombre).toBe('Brote De Esporas Hostiles');
  });

  it('parses the real Guardián ficha (CA 21 / PV 50 / CRIATURA 3)', () => {
    const s = parseThreatStatblock(GUARDIAN);
    expect(s.ca).toBe(21);
    expect(s.pv).toBe(50);
    expect(s.nivel).toBe(3);
    expect(s.nombre).toBe('Guardián De Cristal');
  });

  it('tolerates canonical CA:/PV punctuation and a bold **Nombre**', () => {
    const s = parseThreatStatblock(CANONICAL_CA_PV);
    expect(s.ca).toBe(21);
    expect(s.pv).toBe(44); // "PV 44 (" — trailing paren tolerated
    expect(s.nombre).toBe('Sabueso de Vidrio'); // mixed case left as-is
  });

  it('takes the max from a "PV cur/max" form', () => {
    const s = parseThreatStatblock('# X\nCA 15\nPV 12/40\n');
    expect(s.pv).toBe(40);
  });

  it('returns {} for empty / non-string input and never throws', () => {
    expect(parseThreatStatblock('')).toEqual({});
    // @ts-expect-error deliberately exercising the runtime guard
    expect(parseThreatStatblock(undefined)).toEqual({});
    // @ts-expect-error deliberately exercising the runtime guard
    expect(parseThreatStatblock(null)).toEqual({});
  });

  it('prefers the FENCED stats over a base-creature prose line (reskin ficha)', () => {
    // The Custodio de Ecos: prose says "AC 18 / HP 45" (base creature) ABOVE
    // the fence; the real fenced stats are AC 19 / HP 48.
    const s = parseThreatStatblock(RESKIN_BASE_IN_PROSE);
    expect(s.ca).toBe(19);
    expect(s.pv).toBe(48);
    expect(s.nivel).toBe(3);
    expect(s.nombre).toBe('Custodio De Ecos');
  });

  it('leaves ca/pv undefined on a prose-only doc', () => {
    const s = parseThreatStatblock(NO_STATBLOCK);
    expect(s.ca).toBeUndefined();
    expect(s.pv).toBeUndefined();
  });
});

describe('hasStatblock', () => {
  it('is true for the real Depredador/Brote/Guardián fichas', () => {
    expect(hasStatblock(DEPREDADOR)).toBe(true);
    expect(hasStatblock(BROTE)).toBe(true);
    expect(hasStatblock(GUARDIAN)).toBe(true);
    expect(hasStatblock(CANONICAL_CA_PV)).toBe(true);
  });

  it('is false for a prose-only threat doc (no CA/PV)', () => {
    expect(hasStatblock(NO_STATBLOCK)).toBe(false);
  });

  it('is false when only one of CA/PV is present', () => {
    expect(hasStatblock('# X\nCA 19\n')).toBe(false);
    expect(hasStatblock('# X\nPV 58\n')).toBe(false);
  });
});
