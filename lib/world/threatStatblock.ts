/**
 * Parses a threat "ficha" (a threats/*.md support doc) into the handful of
 * fields the InitiativeTracker needs to prefill a combatant: the creature's
 * name, its armour class (SF2e "CA"), its hit points ("PV") and, when trivially
 * present, its level ("CRIATURA 3" / "PELIGRO 2"). It mirrors the style of
 * extractPCStats in lib/sessionScanner.ts (a small ordered list of tolerant,
 * case-insensitive regexes over the RAW markdown) so the world runner can offer
 * a one-tap "Añadir al combate" instead of the GM hand-typing name + HP + AC.
 *
 * The real files (mundo/lugares/<id>/threats/<x>.md) put the stat line inside a
 * markdown code fence, Spanish-labelled: e.g. "AC 19; Fort +12..." — wait, the
 * canonical label used by these fichas is "CA" (Clase de Armadura) and "PV"
 * (Puntos de Vida). Some Alien-Core-derived fichas leak the English "AC"/"HP"
 * labels; we accept BOTH so a mixed doc still parses. Everything is optional and
 * the parser never throws — a doc with no statblock simply yields {} and
 * hasStatblock() returns false, which is how the runner decides not to show the
 * button.
 */

export interface ThreatStatblock {
  nombre?: string;
  ca?: number;
  pv?: number;
  nivel?: number;
  /** A couple of key melee/ranged attack lines, verbatim, when easily found. */
  ataques?: string[];
}

/**
 * Armour class. Canonical Spanish label is "CA"; we also accept the English
 * "AC" that some reskinned Alien Core fichas keep. Tolerates "CA 19",
 * "CA: 19", "CA 19;" and "CA 19 (".
 */
const CA_PATTERNS: readonly RegExp[] = [
  /\bCA\s*[:=]?\s*(\d+)/i,
  /\bAC\s*[:=]?\s*(\d+)/i,
  /\bClase\s+de\s+Armadura\s*[:=]?\s*(\d+)/i,
];

/**
 * Hit points. Canonical "PV"; English "HP" accepted as a fallback. Tolerates
 * "PV 58", "PV: 58", "PV 58 (" and a "PV 58/58" current/max form (max wins).
 */
const PV_PATTERNS: readonly RegExp[] = [
  /\bPV\s*[:=]?\s*\d+\s*\/\s*(\d+)/i,
  /\bPV\s*[:=]?\s*(\d+)/i,
  /\bHP\s*[:=]?\s*\d+\s*\/\s*(\d+)/i,
  /\bHP\s*[:=]?\s*(\d+)/i,
  /\bPuntos\s+de\s+Vida\s*[:=]?\s*(\d+)/i,
];

/**
 * Level. The fichas write it on the name line of the stat block, e.g.
 * "DEPREDADOR DEL JARDÍN                CRIATURA 3" or "... PELIGRO / ENJAMBRE 2".
 * We also accept the Spanish "Nivel 3" prose form.
 */
const NIVEL_PATTERNS: readonly RegExp[] = [
  /\bCRIATURA\s+(\d+)/i,
  /\bPELIGRO(?:\s*\/\s*ENJAMBRE)?\s+(\d+)/i,
  /\bNivel\s+(\d+)/i,
];

/**
 * Attack lines like "mordisco +12 ... 2d8+4" or "golpe de cristal +12, Daño
 * 2d8+4". We key off a "+N" to-hit followed later on the line by an "NdM" dice
 * expression, and keep the trimmed line. Best-effort only; used for a hover
 * hint, never load-bearing.
 */
const ATTACK_LINE = /^.*?\+\d+.*?\b\d+d\d+(?:\s*\+\s*\d+)?.*$/;

function firstMatch(md: string, patterns: readonly RegExp[]): number | undefined {
  for (const pattern of patterns) {
    const match = md.match(pattern);
    if (match && match[1]) {
      const value = parseInt(match[1], 10);
      if (!Number.isNaN(value) && value > 0) return value;
    }
  }
  return undefined;
}

/**
 * Returns the concatenated contents of every ``` code fence in the doc, or
 * undefined when there is no fence. The canonical stat block lives inside the
 * fence, so we scope CA/PV/nivel matching to it first — otherwise a reskin
 * ficha that mentions its BASE creature's "AC 18 / HP 45" in prose ABOVE the
 * fence poisons the result (the Custodio de Ecos parses as CA 18 / PV 45
 * instead of its real CA 19 / PV 48). Fichas without a fence (e.g. the
 * canonical CA:/PV: one-liner) fall back to whole-document matching.
 */
function fencedBody(md: string): string | undefined {
  const parts: string[] = [];
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(md)) !== null) {
    if (match[1]) parts.push(match[1]);
  }
  return parts.length > 0 ? parts.join('\n') : undefined;
}

/**
 * Scoped numeric match: prefer a hit inside the code fence (the canonical stat
 * block), and only fall back to the whole document when the fence yields
 * nothing. This keeps a pre-fence prose line describing a reskin's base
 * creature from overriding the real fenced stats.
 */
function scopedMatch(
  md: string,
  fenced: string | undefined,
  patterns: readonly RegExp[],
): number | undefined {
  if (fenced !== undefined) {
    const inFence = firstMatch(fenced, patterns);
    if (inFence !== undefined) return inFence;
  }
  return firstMatch(md, patterns);
}

/**
 * Pulls the creature name from the first markdown heading (`# NOMBRE`) or the
 * first bold line (`**Nombre**`). Falls back to undefined. Title-cases an
 * ALL-CAPS heading so "DEPREDADOR DEL JARDÍN" reads as "Depredador Del Jardín"
 * in the tracker rather than shouting.
 */
function extractNombre(md: string): string | undefined {
  const lines = md.split(/\r?\n/);
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading && heading[1].trim()) return normaliseName(heading[1].trim());
    const bold = line.match(/^\s*\*\*(.+?)\*\*\s*$/);
    if (bold && bold[1].trim()) return normaliseName(bold[1].trim());
  }
  return undefined;
}

/** Softens an all-caps name to Title Case; leaves mixed-case names untouched. */
function normaliseName(name: string): string {
  const letters = name.replace(/[^A-Za-zÀ-ÿ]/g, '');
  const isAllCaps = letters.length > 0 && letters === letters.toUpperCase();
  if (!isAllCaps) return name;
  return name
    .toLocaleLowerCase('es')
    .replace(/(^|\s|-)([\p{L}])/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('es'));
}

function extractAtaques(md: string): string[] {
  const out: string[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    if (ATTACK_LINE.test(line)) out.push(line);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * Parses a threat ficha's raw markdown into a tolerant ThreatStatblock. Never
 * throws; every field is optional. `nivel` and `ataques` are only set when
 * trivially present.
 */
export function parseThreatStatblock(markdown: string): ThreatStatblock {
  if (typeof markdown !== 'string' || markdown.length === 0) return {};

  const fenced = fencedBody(markdown);
  const ca = scopedMatch(markdown, fenced, CA_PATTERNS);
  const pv = scopedMatch(markdown, fenced, PV_PATTERNS);
  const nivel = scopedMatch(markdown, fenced, NIVEL_PATTERNS);
  const nombre = extractNombre(markdown);
  const ataques = extractAtaques(markdown);

  const result: ThreatStatblock = {};
  if (nombre !== undefined) result.nombre = nombre;
  if (ca !== undefined) result.ca = ca;
  if (pv !== undefined) result.pv = pv;
  if (nivel !== undefined) result.nivel = nivel;
  if (ataques.length > 0) result.ataques = ataques;
  return result;
}

/**
 * Whether a threat doc carries a usable combat statblock. Both CA and PV must
 * parse — those are the two fields the tracker prefills (defense + maxHP). The
 * runner shows the "Añadir al combate" button only when this is true.
 */
export function hasStatblock(markdown: string): boolean {
  const parsed = parseThreatStatblock(markdown);
  return parsed.ca != null && parsed.pv != null;
}
