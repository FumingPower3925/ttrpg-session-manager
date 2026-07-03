/**
 * Party-state parsing for `mundo/estado/grupo.md` (plan Part A).
 *
 * The file is split-owned: frontmatter belongs to the app (session lock, day,
 * location, heading, credits, gauges), the body belongs to the agent (inventory
 * prose). Parsing here NEVER throws and never loses body bytes — `bodyMd`
 * preserves everything below the closing fence byte-for-byte so the M3 writer
 * can rewrite the header only.
 *
 * Pure functions: no filesystem, no store access.
 */

import { stringify as stringifyYaml } from 'yaml';
import { PartyState, ValidationIssue, WorldManifest } from '@/types/world';
import { DEFAULT_MEDIDORES } from './constants';
import { asNumber, asString, normalizeKeys, parseFrontmatter } from './frontmatter';

export interface ParsePartyStateResult {
    state: PartyState;
    issues: ValidationIssue[];
}

/**
 * Tolerant defaults, also used by the scanner when `estado/grupo.md` is absent
 * (then with `filePath: null`).
 */
export function defaultPartyState(filePath: string | null = null): PartyState {
    return {
        sesionActiva: false,
        diaMundo: 1,
        ubicacion: null,
        rumbo: null,
        creditos: 0,
        medidores: { ...DEFAULT_MEDIDORES },
        bodyMd: '',
        filePath,
    };
}

/** Boolean, tolerating the string forms "true"/"false". Undefined otherwise. */
function asBoolean(value: unknown): boolean | undefined {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        if (trimmed === 'true') return true;
        if (trimmed === 'false') return false;
    }
    return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses `estado/grupo.md` content into a PartyState.
 *
 * Tolerant by design: every missing/uncoercible field falls back to the
 * defaults (sesionActiva false, diaMundo 1, creditos 0, gauges at 3) — a
 * malformed field earns an aviso, a missing one is silent. Malformed YAML
 * degrades to full defaults (plus the frontmatter error) with the body kept.
 */
export function parsePartyState(content: string, filePath: string): ParsePartyStateResult {
    const issues: ValidationIssue[] = [];
    const state = defaultPartyState(filePath);

    const parsed = parseFrontmatter(content, filePath);
    if (parsed.issue) issues.push(parsed.issue);
    state.bodyMd = parsed.body;

    const data = normalizeKeys(parsed.data);

    const aviso = (mensaje: string) => {
        issues.push({ nivel: 'aviso', archivo: filePath, mensaje });
    };

    const tipo = asString(data.tipo);
    if (tipo !== undefined && tipo !== 'estado_grupo') {
        aviso(`"tipo" inesperado en el estado del grupo: "${tipo}" (se esperaba "estado_grupo")`);
    }

    if (data.sesion_activa !== undefined) {
        const sesionActiva = asBoolean(data.sesion_activa);
        if (sesionActiva === undefined) {
            aviso('"sesion_activa" no es un booleano — se usa false');
        } else {
            state.sesionActiva = sesionActiva;
        }
    }

    if (data.dia_mundo !== undefined) {
        const diaMundo = asNumber(data.dia_mundo);
        if (diaMundo === undefined) {
            aviso('"dia_mundo" no es un número — se usa 1');
        } else {
            state.diaMundo = diaMundo;
        }
    }

    if (data.ubicacion !== undefined && data.ubicacion !== null) {
        const ubicacion = asString(data.ubicacion);
        if (ubicacion === undefined) {
            aviso('"ubicacion" no es un id de lugar — se ignora');
        } else {
            state.ubicacion = ubicacion;
        }
    }

    if (data.rumbo !== undefined && data.rumbo !== null) {
        if (!isRecord(data.rumbo)) {
            aviso('"rumbo" debe ser un mapa {destino, llegada_dia} — se ignora');
        } else {
            const destino = asString(data.rumbo.destino);
            const llegadaDia = asNumber(data.rumbo.llegada_dia);
            if (destino === undefined || llegadaDia === undefined) {
                aviso('"rumbo" sin "destino" o "llegada_dia" válidos — se ignora');
            } else {
                state.rumbo = { destino, llegadaDia };
            }
        }
    }

    if (data.creditos !== undefined) {
        const creditos = asNumber(data.creditos);
        if (creditos === undefined) {
            aviso('"creditos" no es un número — se usa 0');
        } else {
            state.creditos = creditos;
        }
    }

    if (data.medidores !== undefined) {
        if (!isRecord(data.medidores)) {
            aviso('"medidores" debe ser un mapa nombre: valor — se usan los valores por defecto');
        } else {
            // Parsed gauges overlay the defaults, so the standard three always
            // have a value even when the file lists only a subset.
            for (const [nombre, raw] of Object.entries(data.medidores)) {
                const valor = asNumber(raw);
                if (valor === undefined) {
                    aviso(`Medidor "${nombre}" sin valor numérico — se ignora`);
                } else {
                    state.medidores[nombre] = valor;
                }
            }
        }
    }

    return { state, issues };
}

// ── Serialization (M3 write path) ───────────────────────────────────────────

/**
 * Dumps a scalar through the yaml package so quoting is always safe; strings
 * whose dump would span lines (embedded newlines → block scalars) fall back
 * to JSON quoting, which is valid YAML and keeps the frontmatter line-based.
 */
function yamlScalar(value: string | number | boolean): string {
    const dumped = stringifyYaml(value).trimEnd();
    return typeof value === 'string' && dumped.includes('\n')
        ? JSON.stringify(value)
        : dumped;
}

/**
 * Serializes a PartyState back to `estado/grupo.md` text. The app rewrites
 * ONLY the frontmatter; `bodyMd` is appended EXACTLY as parsed (byte-for-byte
 * — when bodyMd is empty the output is just the frontmatter block ending in a
 * newline). Round-trip guarantee: parsePartyState(serializePartyState(s, iso))
 * reproduces every frontmatter field and bodyMd of `s` (medidores overlay the
 * three defaults, so an *empty* medidores map parses back as the defaults).
 *
 * Frontmatter key order (stable, human-friendly — documented contract):
 *   tipo, actualizado, sesion_activa, dia_mundo, ubicacion,
 *   rumbo (nested destino / llegada_dia, or null), creditos, medidores.
 *
 * `actualizado` is write-time metadata (ISO timestamp) — parsePartyState
 * ignores it by design.
 */
export function serializePartyState(state: PartyState, nowIso: string): string {
    const lines: string[] = [
        '---',
        'tipo: estado_grupo',
        `actualizado: ${yamlScalar(nowIso)}`,
        `sesion_activa: ${state.sesionActiva}`,
        `dia_mundo: ${yamlScalar(state.diaMundo)}`,
        `ubicacion: ${state.ubicacion === null ? 'null' : yamlScalar(state.ubicacion)}`,
    ];

    if (state.rumbo === null) {
        lines.push('rumbo: null');
    } else {
        lines.push('rumbo:');
        lines.push(`  destino: ${yamlScalar(state.rumbo.destino)}`);
        lines.push(`  llegada_dia: ${yamlScalar(state.rumbo.llegadaDia)}`);
    }

    lines.push(`creditos: ${yamlScalar(state.creditos)}`);

    const medidores = Object.entries(state.medidores);
    if (medidores.length === 0) {
        lines.push('medidores: {}');
    } else {
        lines.push('medidores:');
        for (const [nombre, valor] of medidores) {
            lines.push(`  ${yamlScalar(nombre)}: ${yamlScalar(valor)}`);
        }
    }

    lines.push('---');
    return lines.join('\n') + '\n' + state.bodyMd;
}

// ── In-world date rendering ─────────────────────────────────────────────────

/**
 * Renders the in-world date for an integer `dia_mundo`, e.g. "17 de Gozran,
 * 322 dG". Calendar math per the manifest: day 1 = day 1 of month 1 of
 * `ano_epoca`; every month has exactly `diasPorMes` days; a year has
 * `meses.length` months. Days beyond a year roll the year over.
 *
 * Degrades safely: without usable calendar data (no months, or a
 * non-positive `diasPorMes`) it renders "Día N". Non-integer input is
 * floored; days below 1 clamp to day 1.
 */
export function formatFecha(diaMundo: number, manifest: WorldManifest): string {
    const { era, anoEpoca, diasPorMes, meses } = manifest.calendario;
    const dia = Number.isFinite(diaMundo) ? Math.max(1, Math.floor(diaMundo)) : 1;

    if (meses.length === 0 || diasPorMes <= 0) {
        return `Día ${dia}`;
    }

    const desdeEpoca = dia - 1; // full days elapsed since epoch start
    const diasPorAno = diasPorMes * meses.length;
    const ano = anoEpoca + Math.floor(desdeEpoca / diasPorAno);
    const diaDelAno = desdeEpoca % diasPorAno;
    const mes = meses[Math.floor(diaDelAno / diasPorMes)];
    const diaDelMes = (diaDelAno % diasPorMes) + 1;

    const sufijoEra = era === '' ? '' : ` ${era}`;
    return `${diaDelMes} de ${mes}, ${ano}${sufijoEra}`;
}
