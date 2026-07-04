import { AudioFile, EventPlaylist, FileReference, SessionConfig } from '@/types';

/**
 * World-mode domain types (M1).
 * Entities live as markdown files with YAML frontmatter under `mundo/`;
 * the scanner (lib/world/worldScanner.ts) materializes them into these shapes.
 * Field names are Spanish (matching the file conventions); code identifiers stay English.
 */

/** Party knowledge level of an entity. Ordered: desconocido < rumoreado < conocido < visitado. */
export type Conocimiento = 'desconocido' | 'rumoreado' | 'conocido' | 'visitado';

export interface WorldEntityBase {
  /** id = filename without extension (snake_case ASCII, globally unique). */
  id: string;
  /** Entity type (`tipo:` frontmatter); open string — TIPOS_LUGAR is only a recommended list. */
  tipo: string;
  nombre: string;
  /** Path relative to the campaign folder, e.g. `mundo/lugares/porto_verne/lugar.md`. */
  filePath: string;
  conocimiento: Conocimiento;
  etiquetas: string[];
  resumen?: string;
  /** Agent-updated situation blurb (`estado: >`). */
  estado?: string;
  /** Normalized frontmatter as parsed — escape hatch for fields not modeled here. */
  raw: Record<string, unknown>;
  /** Markdown body below the frontmatter fence. */
  body: string;
  /**
   * Profile image by convention: `mundo/imagenes/<id>.<ext>` (any supported
   * image extension) is the entity's portrait/banner. Attached by the scanner
   * for ANY entity kind (lugares, sistemas, pnjs, facciones, ...).
   */
  imagen?: FileReference;
}

export interface SystemEntity extends WorldEntityBase {
  tipo: 'sistema';
  coordenadas: { x: number; y: number };
  region?: string;
}

export interface FactionPresence {
  faccion: string;
  nivel: 'dominante' | 'fuerte' | 'presente' | 'encubierta';
}

export interface PlaceEntity extends WorldEntityBase {
  /** Parent entity id (`en:`); deep-space places have `coordenadas` instead. */
  en?: string;
  coordenadas?: { x: number; y: number };
  /** Orbital ordering within the parent system. */
  orbita?: number;
  region?: string;
  servicios: string[];
  facciones: FactionPresence[];
  acceso: 'normal' | 'portal' | 'restringido';
  /** 0-5. */
  peligro?: number;
  /** Present when the place is a playable folder (lugar.md + plan/ characters/ ...). */
  playable?: SessionConfig;
}

export interface FactionEntity extends WorldEntityBase {
  actitud: 'hostil' | 'rival' | 'neutral' | 'aliada';
  /** 0-5. */
  poder?: number;
  objetivos: string[];
}

export interface NpcEntity extends WorldEntityBase {
  faccion?: string;
  rol: 'villano' | 'aliado' | 'comodin' | 'contacto' | 'neutral';
  /** Lugar id or 'desconocida'. */
  ubicacion?: string;
}

export interface Lead extends WorldEntityBase {
  /** `estado:` in pista frontmatter (renamed: base `estado` keeps the prose blurb). */
  estadoPista: 'rumor' | 'activa' | 'en_curso' | 'resuelta' | 'fallida';
  /** Parent trama id. */
  trama?: string;
  /** Lugar id where the lead is actionable; absent = anywhere. */
  donde?: string;
  origen?: string;
  /** Expiry as absolute dia_mundo. */
  plazo?: number;
  /** Condition grammar strings; `manual: <texto>` renders "según GM". */
  requisitos: string[];
  recompensa?: string;
  /** DERIVED (never stored): estado activa/en_curso + donde known + requisitos met; 'manual' = GM decides. */
  accionable: boolean | 'manual';
}

export interface Trama extends WorldEntityBase {
  rol: 'principal' | 'secundaria' | 'ambiental';
  /** `estado:` in trama frontmatter (renamed: base `estado` keeps the prose blurb). */
  estadoTrama: 'latente' | 'activa' | 'cerrada';
  reloj?: { actual: number; max: number };
  lugaresClave: string[];
  facciones: string[];
  /** Child pistas pointing at this trama (grouped by the scanner). */
  pistas: Lead[];
}

/**
 * One `:::efecto` line of an event (M4). Same shape semantics as ActField:
 * `key` is the field name (gasto/ganancia/medidor/sabe/pista/nota), `value`
 * the raw value part. The cockpit converts these to journal entries.
 */
export interface EventEffect {
  key: string;
  value: string;
}

/** One `##` section of an event table (M4). */
export interface WorldEvent {
  id: string;
  titulo: string;
  peso: number;
  /** Per-event gate conditions (condition grammar; all must hold). */
  si: string[];
  etiquetas: string[];
  /**
   * Once-only flag (`unico` bare token in the header attrs). A unico event
   * that already appears in the journal is HARD-excluded from future draws;
   * non-unico events only decay by seen-count. Default false.
   */
  unico: boolean;
  /** Markdown body (`:::leer/:::gm/:::accion` render through parseAct). */
  cuerpo: string;
  efectos: EventEffect[];
}

/** An `eventos/*.md` table (M4). */
export interface EventTable extends WorldEntityBase {
  contexto: 'viaje' | 'estancia' | 'ambas';
  regiones: string[];
  /** Conditional weight modifiers: when `si` holds, matching etiquetas gain `peso`. */
  sesgos: { si: string; etiquetas: string[]; peso: number }[];
  eventos: WorldEvent[];
}

/** One route segment of a travel plan (M4). */
export interface TravelLeg {
  fromId: string;
  toId: string;
  dias: number;
  combustible: number;
  viveres: number;
}

/** Full route proposal shown in the TravelDialog (M4). */
export interface TravelPlan {
  legs: TravelLeg[];
  totalDias: number;
  totalCombustible: number;
  totalViveres: number;
  warnings: string[];
  /** Destination is `acceso: portal` — no route calc applies. */
  portal: boolean;
}

/**
 * Evaluation context for the condition grammar (M4): pista `requisitos`,
 * event `si` and table `sesgos` all evaluate against this via evalCondition.
 */
export interface CondContext {
  creditos: number;
  medidores: Record<string, number>;
  diaMundo: number;
  regionActual: string | null;
  etiquetasActuales: string[];
  faccionesActuales: string[];
  /** Lead id -> its estadoPista; null when the pista does not exist. */
  pistaEstado: (id: string) => string | null;
  /** Lugar id -> its conocimiento; null when the lugar does not exist. */
  lugarConocimiento: (id: string) => string | null;
}

export interface WorldManifest {
  nombre: string;
  calendario: {
    era: string;
    anoEpoca: number;
    diasPorMes: number;
    meses: string[];
  };
  viaje: {
    /** 1 map unit = N days. */
    diasPorUnidad: number;
    intrasistemaDias: number;
    /**
     * Consumption suggestions — app proposes, GM confirms.
     * combustible: 1 unit per `combustible_cada_dias` SECTOR-leg days
     * (ceil per leg); viveres: 1 ration per `viveres_cada_dias` calendar
     * days, anchored on `dia_mundo` (travel, descanso — any day advance).
     */
    combustibleCadaDias: number;
    viveresCadaDias: number;
  };
  medidores: string[];
  regiones: string[];
}

/**
 * Party state from `estado/grupo.md` (plan Part A): frontmatter is app-owned
 * (written by the app during active sessions from M3 on), body is agent-owned
 * prose and must be preserved byte-for-byte on every rewrite.
 */
export interface PartyState {
  /** Session lock (`sesion_activa`): true while a live session holds the file. */
  sesionActiva: boolean;
  /** Canonical in-world time as integer day count; day 1 = epoch start. */
  diaMundo: number;
  /** Lugar/sistema id where the party is; null when unknown/not set. */
  ubicacion: string | null;
  /** In-transit heading (`rumbo`); null when the party is not travelling. */
  rumbo: { destino: string; llegadaDia: number } | null;
  creditos: number;
  /** Gauge name -> value 0-5 (`medidores`), e.g. viveres/combustible/nave. */
  medidores: Record<string, number>;
  /**
   * Party PC names (`personajes`) — the roster fed to the cockpit initiative
   * tracker. Agent/GM-owned data the app never mutates via the log, but the
   * app-owned frontmatter rewrite MUST round-trip it so a session write never
   * drops the roster. Default [] when absent.
   */
  personajes: string[];
  /** Agent-owned markdown body below the frontmatter, byte-for-byte. */
  bodyMd: string;
  /** Path relative to the campaign folder; null when estado/grupo.md is absent. */
  filePath: string | null;
}

/**
 * Journal entry types (M3, plan Part A). One per quick-log action; `nota` is
 * freeform (payload empty, text in `comentario`). Line grammar per type lives
 * in the plan table and lib/world/logEntries.ts.
 */
export type JournalEntryType =
  | 'inicio'
  | 'fin'
  | 'rumbo'
  | 'llegada'
  | 'gasto'
  | 'ganancia'
  | 'medidor'
  | 'pista'
  | 'sabe'
  | 'evento'
  | 'descanso'
  | 'dia'
  | 'nota';

/** One journal line: `- [HH:MM] tipo: payload | comentario` (comentario optional). */
export interface JournalEntry {
  /** Wall-clock time of the entry, HH:MM. */
  hora: string;
  tipo: JournalEntryType;
  /** Strict machine-parseable payload per the plan's per-type grammar. */
  payload: string;
  /** Freeform GM comment after the `|` separator. */
  comentario?: string;
}

/** A parsed `diario/AAAA-MM-DD_sNN.md` file. */
export interface JournalDay {
  /** Path relative to the campaign folder. */
  filePath: string;
  sesion: number;
  /** Real-world session date, YYYY-MM-DD. */
  fechaReal: string;
  diaInicio: number | null;
  /** Null until the session closes. */
  diaFin: number | null;
  /** Agent flips to true after the maintenance loop. */
  procesado: boolean;
  entradas: JournalEntry[];
}

/** Point-in-time copy of the mutable party fields, taken at session start (undo replays over it). */
export type PartySnapshot = {
  diaMundo: number;
  ubicacion: string | null;
  rumbo: { destino: string; llegadaDia: number } | null;
  creditos: number;
  medidores: Record<string, number>;
};

/** Live session bookkeeping held by the party store (never persisted as-is). */
export interface SessionRuntime {
  active: boolean;
  /** Path of the journal being written, relative to the campaign folder. */
  journalPath: string | null;
  /** Epoch ms when the session started. */
  startedAt: number | null;
  entries: JournalEntry[];
  /** Party state at session start; base for replay-undo. */
  snapshot: PartySnapshot | null;
  writeStatus: 'ok' | 'pending' | 'denied';
}

export interface ValidationIssue {
  nivel: 'error' | 'aviso';
  /** Path relative to the campaign folder. */
  archivo: string;
  mensaje: string;
}

export interface WorldModel {
  manifest: WorldManifest;
  entidades: Map<string, WorldEntityBase>;
  sistemas: SystemEntity[];
  lugares: PlaceEntity[];
  facciones: FactionEntity[];
  pnjs: NpcEntity[];
  pistas: Lead[];
  tramas: Trama[];
  /** Event tables from `eventos/` (M4). */
  tablas: EventTable[];
  problemas: ValidationIssue[];
  /** Parent id -> child entity ids (inverse of `en:`). */
  childrenOf: Map<string, string[]>;
  /** Party state from `estado/grupo.md`; null when the file is absent. */
  estadoGrupo: PartyState | null;
  /** Parsed journals from `diario/` (M3); unprocessed ones re-overlay state at scan. */
  diario: JournalDay[];
  /**
   * World-level music from `mundo/musica/` (optional folder): root audio
   * files = the generic ambient/travel BGM rotation, each subfolder = a named
   * event playlist. Empty arrays when the folder is absent — by design, never
   * an aviso.
   */
  musica: { bgm: AudioFile[]; eventPlaylists: EventPlaylist[] };
}
