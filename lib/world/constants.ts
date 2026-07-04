/**
 * World-mode domain constants: folder layout, scanner ignore rules,
 * closed vocabularies and defaults. Spanish domain values, English identifiers.
 */

import {
    Conocimiento,
    FactionEntity,
    FactionPresence,
    Lead,
    NpcEntity,
    PlaceEntity,
    Trama,
    WorldManifest,
} from '@/types/world';

// ── Folder layout ───────────────────────────────────────────────────────────

/** Root folder inside the campaign folder; its presence activates world mode. */
export const WORLD_DIR = 'mundo';

/** World manifest, at `mundo/mundo.md`. */
export const MANIFEST_FILE = 'mundo.md';

/** Agent maintenance-loop instructions — never scanned as an entity. */
export const PROTOCOL_FILE = 'PROTOCOLO.md';

/** Templates dir (ignored by the scanner via the ALL-CAPS rule). */
export const TEMPLATES_DIR = 'PLANTILLAS';

/** Entity/state directory names under `mundo/`. */
export const ENTITY_DIRS = {
    sistemas: 'sistemas',
    lugares: 'lugares',
    facciones: 'facciones',
    pnjs: 'pnjs',
    pistas: 'pistas',
    tramas: 'tramas',
    eventos: 'eventos',
    estado: 'estado',
    diario: 'diario',
} as const;

/** File inside a playable place folder `lugares/<id>/` that holds the entity. */
export const PLACE_FOLDER_FILE = 'lugar.md';

/**
 * Optional world-level music folder under `mundo/`: audio files at its root
 * are the world BGM rotation, each subfolder a named event playlist. Not an
 * entity dir — its contents are listed (never read) by the scanner.
 */
export const MUSIC_DIR = 'musica';

/** Party-state file inside `mundo/estado/`. */
export const PARTY_STATE_FILE = 'grupo.md';

// ── Scanner ignore rules ────────────────────────────────────────────────────

/** Dirs written in ALL-CAPS (e.g. PLANTILLAS) are ignored by the scanner. */
export function isIgnoredDir(name: string): boolean {
    return name === name.toUpperCase() && name !== name.toLowerCase();
}

/** Files starting with `_` and PROTOCOLO.md are ignored by the scanner. */
export function isIgnoredFile(name: string): boolean {
    return name.startsWith('_') || name === PROTOCOL_FILE;
}

// ── Closed vocabularies ─────────────────────────────────────────────────────

export const CONOCIMIENTOS: readonly Conocimiento[] = [
    'desconocido',
    'rumoreado',
    'conocido',
    'visitado',
];

export const SERVICIOS: readonly string[] = [
    'repostaje',
    'mercado',
    'medico',
    'taller',
    'astillero',
    'trabajo',
    'informacion',
    'ocio',
    'refugio',
    'contrabando',
];

/** Recommended `tipo:` values for lugares — open list (out-of-vocab is only a warning). */
export const TIPOS_LUGAR: readonly string[] = [
    'planeta',
    'luna',
    'cinturon',
    'estacion',
    'ciudad',
    'estructura',
    'ruina',
    'nodo',
    'bolsillo',
    'punto',
];

export const NIVELES_PRESENCIA: readonly FactionPresence['nivel'][] = [
    'dominante',
    'fuerte',
    'presente',
    'encubierta',
];

export const ACTITUDES: readonly FactionEntity['actitud'][] = [
    'hostil',
    'rival',
    'neutral',
    'aliada',
];

export const ROLES_PNJ: readonly NpcEntity['rol'][] = [
    'villano',
    'aliado',
    'comodin',
    'contacto',
    'neutral',
];

export const ESTADOS_PISTA: readonly Lead['estadoPista'][] = [
    'rumor',
    'activa',
    'en_curso',
    'resuelta',
    'fallida',
];

export const ROLES_TRAMA: readonly Trama['rol'][] = [
    'principal',
    'secundaria',
    'ambiental',
];

export const ESTADOS_TRAMA: readonly Trama['estadoTrama'][] = [
    'latente',
    'activa',
    'cerrada',
];

export const ACCESOS: readonly PlaceEntity['acceso'][] = [
    'normal',
    'portal',
    'restringido',
];

// ── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_CONOCIMIENTO: Conocimiento = 'desconocido';

export const DEFAULT_ACCESO: PlaceEntity['acceso'] = 'normal';

/** Gauge defaults when estado/grupo.md omits `medidores` (or single entries). */
export const DEFAULT_MEDIDORES: Readonly<Record<string, number>> = {
    viveres: 3,
    combustible: 3,
    nave: 3,
};

/** Fallbacks when mundo.md omits travel constants or gauges. */
export const MANIFEST_DEFAULTS: {
    viaje: WorldManifest['viaje'];
    medidores: readonly string[];
} = {
    viaje: {
        diasPorUnidad: 1,
        intrasistemaDias: 1,
        combustibleCadaDias: 4,
        viveresCadaDias: 4,
    },
    medidores: ['viveres', 'combustible', 'nave'],
};
