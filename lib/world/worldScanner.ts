/**
 * World scanner: materializes a campaign folder's `mundo/` tree into a WorldModel.
 *
 * NEVER throws on bad content — every problem degrades into a ValidationIssue in
 * `problemas` (nivel 'error' | 'aviso') so the world always loads, however broken.
 * Reads are batched (Promise.all in chunks of 25) with an optional progress callback.
 */

import { FileReference, SessionConfig } from '@/types';
import {
    FactionEntity,
    FactionPresence,
    Lead,
    NpcEntity,
    PlaceEntity,
    SystemEntity,
    Trama,
    ValidationIssue,
    WorldEntityBase,
    WorldManifest,
    WorldModel,
} from '@/types/world';
import { scanSessionFolder } from '@/lib/sessionScanner';
import { fileNameToDisplayName, getSubdirectory, readFileContent } from '@/lib/fsScanUtils';
import {
    asCoords,
    asNumber,
    asString,
    asStringArray,
    normalizeKeys,
    parseFrontmatter,
} from './frontmatter';
import {
    ACCESOS,
    ACTITUDES,
    CONOCIMIENTOS,
    DEFAULT_ACCESO,
    DEFAULT_CONOCIMIENTO,
    ENTITY_DIRS,
    ESTADOS_PISTA,
    ESTADOS_TRAMA,
    MANIFEST_DEFAULTS,
    MANIFEST_FILE,
    NIVELES_PRESENCIA,
    PLACE_FOLDER_FILE,
    ROLES_PNJ,
    ROLES_TRAMA,
    SERVICIOS,
    TIPOS_LUGAR,
    WORLD_DIR,
    isIgnoredDir,
    isIgnoredFile,
} from './constants';

export type ScanProgressCallback = (done: number, total: number) => void;

/** Files read per Promise.all batch. */
const READ_BATCH_SIZE = 25;

const MANIFEST_PATH = `${WORLD_DIR}/${MANIFEST_FILE}`;

// ── Public API ──────────────────────────────────────────────────────────────

/** Cheap probe: does the campaign folder contain `mundo/mundo.md`? */
export async function hasWorld(handle: FileSystemDirectoryHandle): Promise<boolean> {
    const mundoDir = await getSubdirectory(handle, WORLD_DIR);
    if (!mundoDir) return false;
    try {
        await mundoDir.getFileHandle(MANIFEST_FILE);
        return true;
    } catch {
        return false;
    }
}

/**
 * Scans `mundo/` under the campaign folder handle into a WorldModel.
 * Degrades every problem into `problemas`; only infrastructure failures
 * outside the scanned content could ever throw.
 */
export async function scanWorldFolder(
    handle: FileSystemDirectoryHandle,
    onProgress?: ScanProgressCallback
): Promise<WorldModel> {
    const problemas: ValidationIssue[] = [];

    const mundoDir = await getSubdirectory(handle, WORLD_DIR);
    if (!mundoDir) {
        problemas.push({
            nivel: 'error',
            archivo: WORLD_DIR,
            mensaje: `No se encontró la carpeta "${WORLD_DIR}/" en la carpeta de campaña`,
        });
        onProgress?.(1, 1);
        return assembleModel(defaultManifest(), [], problemas);
    }

    // Enumerate first (cheap directory listings), then read contents in batches.
    const tasks = await collectTasks(mundoDir);
    const totalReads = 1 + tasks.length; // +1 = the manifest itself
    let done = 0;

    // Manifest read
    let manifestContent: string | null = null;
    try {
        const manifestHandle = await mundoDir.getFileHandle(MANIFEST_FILE);
        manifestContent = await readFileContent(manifestHandle);
    } catch {
        manifestContent = null;
    }
    done = 1;
    onProgress?.(done, totalReads);

    // Entity reads, batched
    const records: RawEntityFile[] = [];
    for (let i = 0; i < tasks.length; i += READ_BATCH_SIZE) {
        const chunk = tasks.slice(i, i + READ_BATCH_SIZE);
        const results = await Promise.all(chunk.map((task) => task()));
        for (const result of results) {
            problemas.push(...result.issues);
            if (result.record) records.push(result.record);
        }
        done += chunk.length;
        onProgress?.(done, totalReads);
    }

    const manifest = parseManifest(manifestContent, problemas);
    return assembleModel(manifest, records, problemas);
}

// ── Enumeration + batched reads ─────────────────────────────────────────────

type EntityKind = 'sistema' | 'lugar' | 'faccion' | 'pnj' | 'pista' | 'trama';

interface RawEntityFile {
    kind: EntityKind;
    /** filename minus .md, or the folder name for playable place folders. */
    id: string;
    /** Path relative to the campaign folder. */
    filePath: string;
    content: string;
    /** Set for playable place folders with session content. */
    playable?: SessionConfig;
}

interface TaskResult {
    record: RawEntityFile | null;
    issues: ValidationIssue[];
}

type ScanTask = () => Promise<TaskResult>;

/** Flat entity dirs scanned as `*.md` files. eventos/estado/diario are skipped in M1. */
const FLAT_KIND_DIRS: ReadonlyArray<{ kind: EntityKind; dir: string }> = [
    { kind: 'sistema', dir: ENTITY_DIRS.sistemas },
    { kind: 'faccion', dir: ENTITY_DIRS.facciones },
    { kind: 'pnj', dir: ENTITY_DIRS.pnjs },
    { kind: 'pista', dir: ENTITY_DIRS.pistas },
    { kind: 'trama', dir: ENTITY_DIRS.tramas },
];

function stripMd(name: string): string {
    return name.replace(/\.md$/i, '');
}

function isMarkdownFile(name: string): boolean {
    return name.toLowerCase().endsWith('.md');
}

async function listEntries(
    dir: FileSystemDirectoryHandle
): Promise<{ files: Array<{ name: string; handle: FileSystemFileHandle }>; dirs: Array<{ name: string; handle: FileSystemDirectoryHandle }> }> {
    const files: Array<{ name: string; handle: FileSystemFileHandle }> = [];
    const dirs: Array<{ name: string; handle: FileSystemDirectoryHandle }> = [];

    for await (const [name, entryHandle] of dir.entries()) {
        if (entryHandle.kind === 'file') {
            if (isMarkdownFile(name) && !isIgnoredFile(name)) {
                files.push({ name, handle: entryHandle as FileSystemFileHandle });
            }
        } else {
            if (!isIgnoredDir(name) && !name.startsWith('_')) {
                dirs.push({ name, handle: entryHandle as FileSystemDirectoryHandle });
            }
        }
    }

    files.sort((a, b) => a.name.localeCompare(b.name));
    dirs.sort((a, b) => a.name.localeCompare(b.name));
    return { files, dirs };
}

async function collectTasks(mundoDir: FileSystemDirectoryHandle): Promise<ScanTask[]> {
    const tasks: ScanTask[] = [];

    // Flat dirs: sistemas/, facciones/, pnjs/, pistas/, tramas/
    for (const { kind, dir } of FLAT_KIND_DIRS) {
        const dirHandle = await getSubdirectory(mundoDir, dir);
        if (!dirHandle) continue;
        const { files } = await listEntries(dirHandle);
        for (const file of files) {
            const filePath = `${WORLD_DIR}/${dir}/${file.name}`;
            tasks.push(async () => ({
                record: {
                    kind,
                    id: stripMd(file.name),
                    filePath,
                    content: await readFileContent(file.handle),
                },
                issues: [],
            }));
        }
    }

    // lugares/: flat *.md files PLUS playable subfolders (lugar.md + session categories)
    const lugaresDir = await getSubdirectory(mundoDir, ENTITY_DIRS.lugares);
    if (lugaresDir) {
        const { files, dirs } = await listEntries(lugaresDir);
        for (const file of files) {
            const filePath = `${WORLD_DIR}/${ENTITY_DIRS.lugares}/${file.name}`;
            tasks.push(async () => ({
                record: {
                    kind: 'lugar',
                    id: stripMd(file.name),
                    filePath,
                    content: await readFileContent(file.handle),
                },
                issues: [],
            }));
        }
        for (const dir of dirs) {
            tasks.push(() => scanPlaceFolder(dir.name, dir.handle));
        }
    }

    return tasks;
}

/**
 * A playable place folder `lugares/<id>/`: `lugar.md` is the entity; the rest of
 * the folder is scanned with the EXISTING scanSessionFolder() (classic session
 * layout) and every FileReference path is re-based onto the campaign folder.
 */
async function scanPlaceFolder(
    id: string,
    dirHandle: FileSystemDirectoryHandle
): Promise<TaskResult> {
    const folderPath = `${WORLD_DIR}/${ENTITY_DIRS.lugares}/${id}`;
    const issues: ValidationIssue[] = [];

    let placeFileHandle: FileSystemFileHandle;
    try {
        placeFileHandle = await dirHandle.getFileHandle(PLACE_FOLDER_FILE);
    } catch {
        issues.push({
            nivel: 'error',
            archivo: folderPath,
            mensaje: `Carpeta de lugar sin ${PLACE_FOLDER_FILE}`,
        });
        return { record: null, issues };
    }

    const content = await readFileContent(placeFileHandle);

    let playable: SessionConfig | undefined;
    try {
        const config = await scanSessionFolder(dirHandle);
        // A folder with lugar.md but no session content is just a plain place.
        if (config.parts.length > 0) {
            playable = prefixSessionConfigPaths(config, `${folderPath}/`);
        }
    } catch {
        issues.push({
            nivel: 'aviso',
            archivo: folderPath,
            mensaje: 'No se pudo escanear el contenido jugable de la carpeta',
        });
    }

    return {
        record: {
            kind: 'lugar',
            id,
            filePath: `${folderPath}/${PLACE_FOLDER_FILE}`,
            content,
            playable,
        },
        issues,
    };
}

function prefixFileReference<T extends FileReference>(ref: T, prefix: string): T {
    return { ...ref, path: `${prefix}${ref.path}` };
}

/** Re-bases every FileReference in a SessionConfig onto the campaign folder root. */
function prefixSessionConfigPaths(config: SessionConfig, prefix: string): SessionConfig {
    return {
        ...config,
        parts: config.parts.map((part) => ({
            ...part,
            planFile: part.planFile ? prefixFileReference(part.planFile, prefix) : null,
            images: part.images.map((ref) => prefixFileReference(ref, prefix)),
            supportDocs: part.supportDocs.map((ref) => prefixFileReference(ref, prefix)),
            bgmPlaylist: part.bgmPlaylist.map((ref) => prefixFileReference(ref, prefix)),
            eventPlaylists: part.eventPlaylists.map((playlist) => ({
                ...playlist,
                tracks: playlist.tracks.map((ref) => prefixFileReference(ref, prefix)),
            })),
        })),
    };
}

// ── Manifest ────────────────────────────────────────────────────────────────

function defaultManifest(): WorldManifest {
    return {
        nombre: 'Mundo',
        calendario: { era: '', anoEpoca: 0, diasPorMes: 30, meses: [] },
        viaje: { ...MANIFEST_DEFAULTS.viaje },
        medidores: [...MANIFEST_DEFAULTS.medidores],
        regiones: [],
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseManifest(content: string | null, problemas: ValidationIssue[]): WorldManifest {
    const fallback = defaultManifest();

    if (content === null) {
        problemas.push({
            nivel: 'aviso',
            archivo: MANIFEST_PATH,
            mensaje: `No se encontró ${MANIFEST_FILE} — se usan los valores por defecto`,
        });
        return fallback;
    }

    const parsed = parseFrontmatter(content, MANIFEST_PATH);
    if (parsed.issue) problemas.push(parsed.issue);
    const data = normalizeKeys(parsed.data);

    const missing = (campo: string) => {
        problemas.push({
            nivel: 'aviso',
            archivo: MANIFEST_PATH,
            mensaje: `Falta "${campo}" en el manifiesto — se usa el valor por defecto`,
        });
    };

    const nombre = asString(data.nombre);
    if (nombre === undefined) missing('nombre');

    const cal = isRecord(data.calendario) ? data.calendario : undefined;
    if (cal === undefined) missing('calendario');

    const viaje = isRecord(data.viaje) ? data.viaje : undefined;
    if (viaje === undefined) missing('viaje');

    if (data.medidores === undefined) missing('medidores');
    if (data.regiones === undefined) missing('regiones');

    return {
        nombre: nombre ?? fallback.nombre,
        calendario: {
            era: asString(cal?.era) ?? fallback.calendario.era,
            anoEpoca:
                asNumber(cal?.ano_epoca ?? cal?.['año_epoca']) ?? fallback.calendario.anoEpoca,
            diasPorMes: asNumber(cal?.dias_por_mes) ?? fallback.calendario.diasPorMes,
            meses: cal?.meses === undefined ? fallback.calendario.meses : asStringArray(cal.meses),
        },
        viaje: {
            diasPorUnidad: asNumber(viaje?.dias_por_unidad) ?? fallback.viaje.diasPorUnidad,
            intrasistemaDias:
                asNumber(viaje?.intrasistema_dias) ?? fallback.viaje.intrasistemaDias,
            combustiblePorTramo:
                asNumber(viaje?.combustible_por_tramo) ?? fallback.viaje.combustiblePorTramo,
            viveresCadaDias:
                asNumber(viaje?.viveres_cada_dias) ?? fallback.viaje.viveresCadaDias,
        },
        medidores:
            data.medidores === undefined ? fallback.medidores : asStringArray(data.medidores),
        regiones: data.regiones === undefined ? fallback.regiones : asStringArray(data.regiones),
    };
}

// ── Entity building ─────────────────────────────────────────────────────────

/**
 * Validates a value against a closed vocabulary. A missing value silently gets
 * the fallback; an out-of-vocabulary value gets the fallback plus an aviso.
 */
function vocabOrDefault<T extends string>(
    value: unknown,
    vocab: readonly T[],
    fallbackValue: T,
    campo: string,
    archivo: string,
    problemas: ValidationIssue[]
): T {
    const str = asString(value);
    if (str === undefined) return fallbackValue;
    if ((vocab as readonly string[]).includes(str)) return str as T;
    problemas.push({
        nivel: 'aviso',
        archivo,
        mensaje: `Valor fuera de vocabulario en "${campo}": "${str}" — se usa "${fallbackValue}"`,
    });
    return fallbackValue;
}

function buildBase(
    record: RawEntityFile,
    data: Record<string, unknown>,
    body: string,
    defaultTipo: string,
    problemas: ValidationIssue[],
    options: { estadoIsProse: boolean }
): WorldEntityBase {
    return {
        id: record.id,
        tipo: asString(data.tipo) ?? defaultTipo,
        nombre: asString(data.nombre) ?? fileNameToDisplayName(record.id),
        filePath: record.filePath,
        conocimiento: vocabOrDefault(
            data.conocimiento,
            CONOCIMIENTOS,
            DEFAULT_CONOCIMIENTO,
            'conocimiento',
            record.filePath,
            problemas
        ),
        etiquetas: asStringArray(data.etiquetas),
        resumen: asString(data.resumen),
        // For pistas/tramas the `estado:` key holds the workflow state, not prose.
        estado: options.estadoIsProse ? asString(data.estado) : undefined,
        raw: data,
        body,
    };
}

function buildSistema(
    record: RawEntityFile,
    data: Record<string, unknown>,
    body: string,
    problemas: ValidationIssue[]
): SystemEntity {
    const coordenadas = asCoords(data.coordenadas);
    if (coordenadas === undefined) {
        problemas.push({
            nivel: 'error',
            archivo: record.filePath,
            mensaje: 'Sistema sin coordenadas',
        });
    }
    return {
        ...buildBase(record, data, body, 'sistema', problemas, { estadoIsProse: true }),
        tipo: 'sistema',
        coordenadas: coordenadas ?? { x: 0, y: 0 },
        region: asString(data.region),
    };
}

function parseFactionPresences(
    value: unknown,
    archivo: string,
    problemas: ValidationIssue[]
): FactionPresence[] {
    if (value === undefined) return [];
    if (!Array.isArray(value)) {
        problemas.push({
            nivel: 'aviso',
            archivo,
            mensaje: '"facciones" debe ser una lista de {faccion, nivel} — se ignora',
        });
        return [];
    }

    const presences: FactionPresence[] = [];
    for (const item of value) {
        if (!isRecord(item)) continue;
        const faccion = asString(item.faccion);
        if (faccion === undefined) {
            problemas.push({
                nivel: 'aviso',
                archivo,
                mensaje: 'Entrada de "facciones" sin campo "faccion" — se omite',
            });
            continue;
        }
        presences.push({
            faccion,
            nivel: vocabOrDefault(
                item.nivel,
                NIVELES_PRESENCIA,
                'presente',
                'facciones.nivel',
                archivo,
                problemas
            ),
        });
    }
    return presences;
}

function buildLugar(
    record: RawEntityFile,
    data: Record<string, unknown>,
    body: string,
    problemas: ValidationIssue[]
): PlaceEntity {
    const base = buildBase(record, data, body, 'lugar', problemas, { estadoIsProse: true });

    // TIPOS_LUGAR is an open (recommended) list: keep the value, warn once.
    const tipoRaw = asString(data.tipo);
    if (tipoRaw !== undefined && !TIPOS_LUGAR.includes(tipoRaw)) {
        problemas.push({
            nivel: 'aviso',
            archivo: record.filePath,
            mensaje: `Valor fuera de vocabulario en "tipo": "${tipoRaw}"`,
        });
    }

    const servicios = asStringArray(data.servicios);
    for (const servicio of servicios) {
        if (!SERVICIOS.includes(servicio)) {
            problemas.push({
                nivel: 'aviso',
                archivo: record.filePath,
                mensaje: `Valor fuera de vocabulario en "servicios": "${servicio}"`,
            });
        }
    }

    const en = asString(data.en);
    const coordenadas = asCoords(data.coordenadas);
    if (en === undefined && coordenadas === undefined) {
        problemas.push({
            nivel: 'error',
            archivo: record.filePath,
            mensaje: 'Lugar sin "en" ni coordenadas',
        });
    }

    return {
        ...base,
        en,
        coordenadas,
        orbita: asNumber(data.orbita),
        region: asString(data.region),
        servicios,
        facciones: parseFactionPresences(data.facciones, record.filePath, problemas),
        acceso: vocabOrDefault(
            data.acceso,
            ACCESOS,
            DEFAULT_ACCESO,
            'acceso',
            record.filePath,
            problemas
        ),
        peligro: asNumber(data.peligro),
        playable: record.playable,
    };
}

function buildFaccion(
    record: RawEntityFile,
    data: Record<string, unknown>,
    body: string,
    problemas: ValidationIssue[]
): FactionEntity {
    return {
        ...buildBase(record, data, body, 'faccion', problemas, { estadoIsProse: true }),
        actitud: vocabOrDefault(
            data.actitud,
            ACTITUDES,
            'neutral',
            'actitud',
            record.filePath,
            problemas
        ),
        poder: asNumber(data.poder),
        objetivos: asStringArray(data.objetivos),
    };
}

function buildPnj(
    record: RawEntityFile,
    data: Record<string, unknown>,
    body: string,
    problemas: ValidationIssue[]
): NpcEntity {
    return {
        ...buildBase(record, data, body, 'pnj', problemas, { estadoIsProse: true }),
        faccion: asString(data.faccion),
        rol: vocabOrDefault(data.rol, ROLES_PNJ, 'neutral', 'rol', record.filePath, problemas),
        ubicacion: asString(data.ubicacion),
    };
}

function buildPista(
    record: RawEntityFile,
    data: Record<string, unknown>,
    body: string,
    problemas: ValidationIssue[]
): Lead {
    return {
        ...buildBase(record, data, body, 'pista', problemas, { estadoIsProse: false }),
        estadoPista: vocabOrDefault(
            data.estado,
            ESTADOS_PISTA,
            'rumor',
            'estado',
            record.filePath,
            problemas
        ),
        trama: asString(data.trama),
        donde: asString(data.donde),
        origen: asString(data.origen),
        plazo: asNumber(data.plazo),
        requisitos: asStringArray(data.requisitos),
        recompensa: asString(data.recompensa),
        accionable: false, // derived below in deriveLeadActionability
    };
}

function asReloj(value: unknown): { actual: number; max: number } | undefined {
    if (!isRecord(value)) return undefined;
    const actual = asNumber(value.actual);
    const max = asNumber(value.max);
    if (actual === undefined || max === undefined) return undefined;
    return { actual, max };
}

function buildTrama(
    record: RawEntityFile,
    data: Record<string, unknown>,
    body: string,
    problemas: ValidationIssue[]
): Trama {
    return {
        ...buildBase(record, data, body, 'trama', problemas, { estadoIsProse: false }),
        rol: vocabOrDefault(
            data.rol,
            ROLES_TRAMA,
            'secundaria',
            'rol',
            record.filePath,
            problemas
        ),
        estadoTrama: vocabOrDefault(
            data.estado,
            ESTADOS_TRAMA,
            'latente',
            'estado',
            record.filePath,
            problemas
        ),
        reloj: asReloj(data.reloj),
        lugaresClave: asStringArray(data.lugares_clave),
        facciones: asStringArray(data.facciones),
        pistas: [], // grouped below in groupTramaPistas
    };
}

// ── Assembly: parse records, cross-validate, derive ─────────────────────────

function assembleModel(
    manifest: WorldManifest,
    records: RawEntityFile[],
    problemas: ValidationIssue[]
): WorldModel {
    const entidades = new Map<string, WorldEntityBase>();
    const sistemas: SystemEntity[] = [];
    const lugares: PlaceEntity[] = [];
    const facciones: FactionEntity[] = [];
    const pnjs: NpcEntity[] = [];
    const pistas: Lead[] = [];
    const tramas: Trama[] = [];

    for (const record of records) {
        const parsed = parseFrontmatter(record.content, record.filePath);
        if (parsed.issue) problemas.push(parsed.issue);
        const data = normalizeKeys(parsed.data);

        // ids are globally unique across all of mundo/: first occurrence wins.
        const existing = entidades.get(record.id);
        if (existing) {
            problemas.push({
                nivel: 'error',
                archivo: record.filePath,
                mensaje: `id duplicado: "${record.id}" ya está definido en ${existing.filePath}`,
            });
            continue;
        }

        switch (record.kind) {
            case 'sistema': {
                const entity = buildSistema(record, data, parsed.body, problemas);
                sistemas.push(entity);
                entidades.set(entity.id, entity);
                break;
            }
            case 'lugar': {
                const entity = buildLugar(record, data, parsed.body, problemas);
                lugares.push(entity);
                entidades.set(entity.id, entity);
                break;
            }
            case 'faccion': {
                const entity = buildFaccion(record, data, parsed.body, problemas);
                facciones.push(entity);
                entidades.set(entity.id, entity);
                break;
            }
            case 'pnj': {
                const entity = buildPnj(record, data, parsed.body, problemas);
                pnjs.push(entity);
                entidades.set(entity.id, entity);
                break;
            }
            case 'pista': {
                const entity = buildPista(record, data, parsed.body, problemas);
                pistas.push(entity);
                entidades.set(entity.id, entity);
                break;
            }
            case 'trama': {
                const entity = buildTrama(record, data, parsed.body, problemas);
                tramas.push(entity);
                entidades.set(entity.id, entity);
                break;
            }
        }
    }

    checkDanglingRefs(entidades, lugares, pnjs, pistas, problemas);
    warnOrphans(entidades, sistemas, lugares, facciones, pnjs, pistas, tramas, problemas);

    const childrenOf = deriveChildrenOf(entidades, sistemas, lugares);
    deriveRegionInheritance(entidades, lugares);
    deriveLeadActionability(entidades, pistas, problemas);
    groupTramaPistas(tramas, pistas);

    return {
        manifest,
        entidades,
        sistemas,
        lugares,
        facciones,
        pnjs,
        pistas,
        tramas,
        problemas,
        childrenOf,
    };
}

function checkDanglingRefs(
    entidades: Map<string, WorldEntityBase>,
    lugares: PlaceEntity[],
    pnjs: NpcEntity[],
    pistas: Lead[],
    problemas: ValidationIssue[]
): void {
    const dangling = (archivo: string, campo: string, target: string) => {
        problemas.push({
            nivel: 'error',
            archivo,
            mensaje: `Referencia colgante en "${campo}": "${target}" no existe`,
        });
    };

    for (const lugar of lugares) {
        if (lugar.en !== undefined && !entidades.has(lugar.en)) {
            dangling(lugar.filePath, 'en', lugar.en);
        }
        for (const presence of lugar.facciones) {
            if (!entidades.has(presence.faccion)) {
                dangling(lugar.filePath, 'facciones', presence.faccion);
            }
        }
    }
    for (const pnj of pnjs) {
        if (pnj.faccion !== undefined && !entidades.has(pnj.faccion)) {
            dangling(pnj.filePath, 'faccion', pnj.faccion);
        }
    }
    for (const pista of pistas) {
        if (pista.trama !== undefined && !entidades.has(pista.trama)) {
            dangling(pista.filePath, 'trama', pista.trama);
        }
        if (pista.donde !== undefined && !entidades.has(pista.donde)) {
            dangling(pista.filePath, 'donde', pista.donde);
        }
    }
}

/**
 * Orphan aviso: nothing references the entity AND its conocimiento is
 * desconocido (unreachable content). Scoped to sistemas/lugares/facciones/pnjs —
 * pistas and tramas are reference SOURCES (nothing points at a pista by design).
 */
function warnOrphans(
    entidades: Map<string, WorldEntityBase>,
    sistemas: SystemEntity[],
    lugares: PlaceEntity[],
    facciones: FactionEntity[],
    pnjs: NpcEntity[],
    pistas: Lead[],
    tramas: Trama[],
    problemas: ValidationIssue[]
): void {
    const referenced = new Set<string>();
    for (const lugar of lugares) {
        if (lugar.en !== undefined) referenced.add(lugar.en);
        for (const presence of lugar.facciones) referenced.add(presence.faccion);
    }
    for (const pnj of pnjs) {
        if (pnj.faccion !== undefined) referenced.add(pnj.faccion);
        if (pnj.ubicacion !== undefined) referenced.add(pnj.ubicacion);
    }
    for (const pista of pistas) {
        if (pista.trama !== undefined) referenced.add(pista.trama);
        if (pista.donde !== undefined) referenced.add(pista.donde);
        if (pista.origen !== undefined) referenced.add(pista.origen);
    }
    for (const trama of tramas) {
        for (const id of trama.lugaresClave) referenced.add(id);
        for (const id of trama.facciones) referenced.add(id);
    }

    for (const entity of [...sistemas, ...lugares, ...facciones, ...pnjs]) {
        if (entity.conocimiento === 'desconocido' && !referenced.has(entity.id)) {
            problemas.push({
                nivel: 'aviso',
                archivo: entity.filePath,
                mensaje: 'Entidad huérfana: nada la referencia y su conocimiento es "desconocido"',
            });
        }
    }
}

/**
 * childrenOf: parent id -> child ids (inverse of `en:`). Sistemas are always
 * roots (entry present even when childless); deep-space lugares (coordenadas,
 * no `en:`) are roots too. Children sort by orbita, then id.
 */
function deriveChildrenOf(
    entidades: Map<string, WorldEntityBase>,
    sistemas: SystemEntity[],
    lugares: PlaceEntity[]
): Map<string, string[]> {
    const childrenOf = new Map<string, string[]>();

    for (const sistema of sistemas) {
        childrenOf.set(sistema.id, []);
    }
    for (const lugar of lugares) {
        if (lugar.en === undefined && lugar.coordenadas !== undefined) {
            childrenOf.set(lugar.id, childrenOf.get(lugar.id) ?? []);
        }
    }
    for (const lugar of lugares) {
        if (lugar.en === undefined || !entidades.has(lugar.en)) continue;
        const siblings = childrenOf.get(lugar.en);
        if (siblings) {
            siblings.push(lugar.id);
        } else {
            childrenOf.set(lugar.en, [lugar.id]);
        }
    }

    const orbitaOf = (id: string): number => {
        const entity = entidades.get(id) as PlaceEntity | undefined;
        return entity?.orbita ?? Number.POSITIVE_INFINITY;
    };
    for (const children of childrenOf.values()) {
        children.sort((a, b) => {
            const delta = orbitaOf(a) - orbitaOf(b);
            if (delta !== 0 && !Number.isNaN(delta)) return delta;
            return a.localeCompare(b);
        });
    }

    return childrenOf;
}

/** A lugar without region inherits from the nearest ancestor (via `en:`) that has one. */
function deriveRegionInheritance(
    entidades: Map<string, WorldEntityBase>,
    lugares: PlaceEntity[]
): void {
    for (const lugar of lugares) {
        if (lugar.region !== undefined) continue;

        const visited = new Set<string>([lugar.id]);
        let parentId = lugar.en;
        while (parentId !== undefined && !visited.has(parentId)) {
            visited.add(parentId);
            const parent = entidades.get(parentId) as SystemEntity | PlaceEntity | undefined;
            if (!parent) break;
            if (parent.region !== undefined) {
                lugar.region = parent.region;
                break;
            }
            parentId = (parent as PlaceEntity).en;
        }
    }
}

/**
 * Lead.accionable (derived, never stored): estadoPista activa/en_curso AND donde
 * is absent-or-conocido/visitado. Any requisitos entry degrades the result to
 * 'manual' ("según GM") — evalCondition() arrives in M4; until then the app
 * cannot check condition strings against PartyState.
 */
function deriveLeadActionability(
    entidades: Map<string, WorldEntityBase>,
    pistas: Lead[],
    problemas: ValidationIssue[]
): void {
    for (const pista of pistas) {
        const estadoOk = pista.estadoPista === 'activa' || pista.estadoPista === 'en_curso';

        let dondeOk = true;
        if (pista.donde !== undefined) {
            const target = entidades.get(pista.donde);
            dondeOk =
                target !== undefined &&
                (target.conocimiento === 'conocido' || target.conocimiento === 'visitado');
            if (
                pista.estadoPista === 'activa' &&
                target !== undefined &&
                target.conocimiento === 'desconocido'
            ) {
                problemas.push({
                    nivel: 'aviso',
                    archivo: pista.filePath,
                    mensaje: `Pista activa en un lugar desconocido: "${pista.donde}"`,
                });
            }
        }

        if (!estadoOk || !dondeOk) {
            pista.accionable = false;
        } else if (pista.requisitos.length > 0) {
            pista.accionable = 'manual';
        } else {
            pista.accionable = true;
        }
    }
}

/** Pistas point at their trama (child -> parent); the scanner groups them. */
function groupTramaPistas(tramas: Trama[], pistas: Lead[]): void {
    const tramaById = new Map(tramas.map((trama) => [trama.id, trama]));
    for (const pista of pistas) {
        if (pista.trama === undefined) continue;
        tramaById.get(pista.trama)?.pistas.push(pista);
    }
}
