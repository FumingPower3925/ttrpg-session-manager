import { SessionConfig } from '@/types';

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
    /** Consumption suggestions — app proposes, GM confirms. */
    combustiblePorTramo: number;
    viveresCadaDias: number;
  };
  medidores: string[];
  regiones: string[];
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
  problemas: ValidationIssue[];
  /** Parent id -> child entity ids (inverse of `en:`). */
  childrenOf: Map<string, string[]>;
}
