/**
 * Condition grammar (plan Part A) — ONE evaluator shared by pista
 * `requisitos`, event `si` and table `sesgos`:
 *
 *     combustible<=1            numeric: creditos / dia / any medidor name,
 *     creditos>=800             with the operators  <  <=  =  >=  >
 *     dia>=4160
 *     region:frontera           party's effective region
 *     etiqueta:pirata           etiquetas of the current place + its ancestors
 *     faccion:consorcio_tetrad  faction present at the current place + ancestors
 *     pista:<id>:<estado>       lead workflow state equals <estado>
 *     lugar:<id>:<min>          knowledge AT LEAST <min>
 *                               (desconocido < rumoreado < conocido < visitado)
 *
 * Conjunction with `&` (no OR by design — duplicate the owner instead).
 * Whitespace-tolerant everywhere. NEVER throws.
 *
 * Tri-state result: true / false / NULL. Null means "the app cannot evaluate
 * this" — bad syntax, unknown medidor name, missing pista/lugar id — and the
 * callers degrade to GM judgment (pista accionable 'manual', event excluded
 * from automatic draws; both flagged as avisos at scan time). Null DOMINATES
 * false in every conjunction (evalCondition's `&` and evalConditions alike):
 * a condition set with an unevaluable member is unevaluable as a whole, never
 * definitively false — the GM decides, and can override.
 */

import {
    CondContext,
    FactionPresence,
    Lead,
    WorldEntityBase,
    WorldModel,
} from '@/types/world';
import { CONOCIMIENTOS, ESTADOS_PISTA } from './constants';
import { ancestryChain } from './worldNav';

// ── Atom parsing ────────────────────────────────────────────────────────────

type NumericOp = '<' | '<=' | '=' | '>=' | '>';

type CondAtom =
    | { kind: 'num'; nombre: string; op: NumericOp; valor: number }
    | { kind: 'region'; tag: string }
    | { kind: 'etiqueta'; tag: string }
    | { kind: 'faccion'; id: string }
    | { kind: 'pista'; id: string; estado: Lead['estadoPista'] }
    | { kind: 'lugar'; id: string; minimo: (typeof CONOCIMIENTOS)[number] };

/** `nombre <op> N` — name is any run without whitespace/operator/colon chars. */
const NUMERIC_ATOM = /^([^\s<>=:&|]+)\s*(<=|>=|==|=|<|>)\s*([+-]?\d+(?:\.\d+)?)$/;

const CONOCIMIENTO_RANK = new Map<string, number>(
    CONOCIMIENTOS.map((nivel, index) => [nivel, index])
);

/** A colon-form token (id/tag/estado): non-empty, no internal whitespace. */
function isToken(value: string): boolean {
    return value !== '' && !/\s/.test(value);
}

/** One atom of the grammar, or null when it matches no known form. */
function parseAtom(raw: string): CondAtom | null {
    const atom = raw.trim();
    if (atom === '') return null;

    const num = NUMERIC_ATOM.exec(atom);
    if (num) {
        const op = num[2] === '==' ? '=' : (num[2] as NumericOp);
        return { kind: 'num', nombre: num[1], op, valor: Number(num[3]) };
    }

    const parts = atom.split(':').map((part) => part.trim());
    switch (parts[0]) {
        case 'region':
            if (parts.length === 2 && isToken(parts[1])) {
                return { kind: 'region', tag: parts[1] };
            }
            return null;
        case 'etiqueta':
            if (parts.length === 2 && isToken(parts[1])) {
                return { kind: 'etiqueta', tag: parts[1] };
            }
            return null;
        case 'faccion':
            if (parts.length === 2 && isToken(parts[1])) {
                return { kind: 'faccion', id: parts[1] };
            }
            return null;
        case 'pista':
            if (
                parts.length === 3 &&
                isToken(parts[1]) &&
                (ESTADOS_PISTA as readonly string[]).includes(parts[2])
            ) {
                return { kind: 'pista', id: parts[1], estado: parts[2] as Lead['estadoPista'] };
            }
            return null;
        case 'lugar':
            if (
                parts.length === 3 &&
                isToken(parts[1]) &&
                (CONOCIMIENTOS as readonly string[]).includes(parts[2])
            ) {
                return {
                    kind: 'lugar',
                    id: parts[1],
                    minimo: parts[2] as (typeof CONOCIMIENTOS)[number],
                };
            }
            return null;
        default:
            return null;
    }
}

/**
 * Syntax-only check (no context): does every `&`-joined atom match a known
 * grammar form? Used at scan time to aviso bad conditions in pista
 * `requisitos`, event `si` and table `sesgos`. Note it CANNOT catch
 * context-dependent nulls (an unknown medidor name parses fine but evaluates
 * to null against a medidores map that lacks it).
 */
export function isParseableCondition(cond: string): boolean {
    if (cond.trim() === '') return false;
    return cond.split('&').every((atom) => parseAtom(atom) !== null);
}

// ── Evaluation ──────────────────────────────────────────────────────────────

function compare(actual: number, op: NumericOp, valor: number): boolean {
    switch (op) {
        case '<':
            return actual < valor;
        case '<=':
            return actual <= valor;
        case '=':
            return actual === valor;
        case '>=':
            return actual >= valor;
        case '>':
            return actual > valor;
    }
}

function evalAtom(atom: CondAtom, ctx: CondContext): boolean | null {
    switch (atom.kind) {
        case 'num': {
            const actual =
                atom.nombre === 'creditos'
                    ? ctx.creditos
                    : atom.nombre === 'dia'
                      ? ctx.diaMundo
                      : ctx.medidores[atom.nombre];
            if (actual === undefined) return null; // unknown medidor name
            return compare(actual, atom.op, atom.valor);
        }
        case 'region':
            return ctx.regionActual === atom.tag;
        case 'etiqueta':
            return ctx.etiquetasActuales.includes(atom.tag);
        case 'faccion':
            return ctx.faccionesActuales.includes(atom.id);
        case 'pista': {
            const estado = ctx.pistaEstado(atom.id);
            if (estado === null) return null; // pista does not exist
            return estado === atom.estado;
        }
        case 'lugar': {
            const conocimiento = ctx.lugarConocimiento(atom.id);
            if (conocimiento === null) return null; // lugar does not exist
            const rank = CONOCIMIENTO_RANK.get(conocimiento);
            if (rank === undefined) return null;
            return rank >= (CONOCIMIENTO_RANK.get(atom.minimo) ?? 0);
        }
    }
}

/**
 * Evaluates one condition string (`&`-conjunctive) against a context.
 * Returns null when ANY atom is unparseable or unevaluable — even if another
 * atom is already false (see module doc: null dominates, the GM decides).
 */
export function evalCondition(cond: string, ctx: CondContext): boolean | null {
    const atoms: CondAtom[] = [];
    for (const raw of cond.split('&')) {
        const atom = parseAtom(raw);
        if (atom === null) return null;
        atoms.push(atom);
    }
    if (atoms.length === 0) return null;

    let result = true;
    for (const atom of atoms) {
        const value = evalAtom(atom, ctx);
        if (value === null) return null;
        if (!value) result = false; // keep scanning: a later null still wins
    }
    return result;
}

/**
 * AND over a condition list: null if ANY member is null (even when another is
 * false), else the conjunction. An empty list is vacuously true — gates
 * without conditions always pass.
 */
export function evalConditions(conds: string[], ctx: CondContext): boolean | null {
    let result = true;
    for (const cond of conds) {
        const value = evalCondition(cond, ctx);
        if (value === null) return null;
        if (!value) result = false;
    }
    return result;
}

// ── Context construction ────────────────────────────────────────────────────

type PlaceLike = WorldEntityBase & { region?: string; facciones?: FactionPresence[] };

/**
 * Builds the evaluation context from a world model + the party's live
 * numbers. The place-derived fields all follow the `en:` ancestry of
 * `lugarActualId` (cycle-guarded, same walk as the scanner's region
 * inheritance):
 *   - regionActual       nearest own/ancestor `region`
 *   - etiquetasActuales  union of the place's + its ancestors' etiquetas
 *   - faccionesActuales  faction ids present at the place or its ancestors
 * A null/unknown current place yields empty place context (region null, no
 * etiquetas/facciones) — numeric atoms still evaluate.
 * pistaEstado/lugarConocimiento close over the model's entity map; both
 * return null for ids that do not resolve.
 */
export function buildCondContext(
    model: WorldModel,
    party: { creditos: number; medidores: Record<string, number>; diaMundo: number },
    lugarActualId: string | null
): CondContext {
    let regionActual: string | null = null;
    const etiquetasActuales: string[] = [];
    const faccionesActuales: string[] = [];

    const chain = lugarActualId === null ? [] : ancestryChain(model, lugarActualId);
    for (const id of chain) {
        const entity = model.entidades.get(id) as PlaceLike | undefined;
        if (!entity) continue;
        if (regionActual === null && entity.region !== undefined) {
            regionActual = entity.region;
        }
        for (const tag of entity.etiquetas) {
            if (!etiquetasActuales.includes(tag)) etiquetasActuales.push(tag);
        }
        for (const presence of entity.facciones ?? []) {
            if (!faccionesActuales.includes(presence.faccion)) {
                faccionesActuales.push(presence.faccion);
            }
        }
    }

    return {
        creditos: party.creditos,
        medidores: party.medidores,
        diaMundo: party.diaMundo,
        regionActual,
        etiquetasActuales,
        faccionesActuales,
        pistaEstado: (id: string) => {
            const entity = model.entidades.get(id);
            return entity !== undefined && 'estadoPista' in entity
                ? (entity as Lead).estadoPista
                : null;
        },
        lugarConocimiento: (id: string) => model.entidades.get(id)?.conocimiento ?? null,
    };
}
