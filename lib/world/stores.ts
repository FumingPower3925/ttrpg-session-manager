/**
 * World-mode zustand stores (plan Part B).
 *
 * worldStore — immutable-after-scan world model + scan lifecycle.
 * partyStore — live file-backed party state + session recorder (M3).
 * uiStore — map tier/focus/selection/panel UI state.
 *
 * Headless on purpose: no React imports, so all stores are bun-testable via
 * useXxxStore.getState() without a DOM. The partyStore additionally takes its
 * side effects (estado write, journal writer, clock, mirror storage) as
 * injected deps — the page provides bound closures; tests provide fakes.
 */

import { create } from 'zustand';
import {
    JournalDay,
    JournalEntry,
    JournalEntryType,
    PartySnapshot,
    PartyState,
    SessionRuntime,
    WorldModel,
} from '@/types/world';
import { FileSystemManager } from '@/lib/fileSystem';
import { ENTITY_DIRS, WORLD_DIR } from './constants';
import { applyEntryToSnapshot, makeEntry, serializeJournal } from './logEntries';
import { nextJournalFile } from './journalWriter';
import { defaultPartyState, serializePartyState } from './partyState';
import { scanWorldFolder } from './worldScanner';

// ── worldStore ──────────────────────────────────────────────────────────────

export type WorldStatus = 'idle' | 'scanning' | 'ready' | 'error';

export interface ScanProgress {
    done: number;
    total: number;
}

export interface WorldState {
    status: WorldStatus;
    scanProgress: ScanProgress;
    /** Immutable after scan; null until a scan succeeds. */
    model: WorldModel | null;
    /** Bound to the campaign folder handle at scan time; used for later file reads. */
    fs: FileSystemManager | null;
    /** Spanish user-facing message when status === 'error'. */
    error: string | null;
    actions: {
        /** Scans `mundo/` under the campaign folder handle into the store. */
        scan: (handle: FileSystemDirectoryHandle) => Promise<void>;
        reset: () => void;
    };
}

const WORLD_INITIAL = {
    status: 'idle' as WorldStatus,
    scanProgress: { done: 0, total: 0 },
    model: null,
    fs: null,
    error: null,
};

export const useWorldStore = create<WorldState>()((set, get) => ({
    ...WORLD_INITIAL,
    actions: {
        async scan(handle: FileSystemDirectoryHandle) {
            if (get().status === 'scanning') return;

            const fs = new FileSystemManager();
            fs.setDirectoryHandle(handle);
            set({
                status: 'scanning',
                scanProgress: { done: 0, total: 0 },
                model: null,
                fs,
                error: null,
            });

            try {
                const model = await scanWorldFolder(handle, (done, total) => {
                    set({ scanProgress: { done, total } });
                });
                set({ status: 'ready', model, error: null });
            } catch (error) {
                // scanWorldFolder degrades content problems into model.problemas;
                // this guards against infrastructure failures only.
                const detail = error instanceof Error ? error.message : String(error);
                set({
                    status: 'error',
                    model: null,
                    error: `No se pudo abrir el mundo: ${detail}`,
                });
            }
        },
        reset() {
            set({ ...WORLD_INITIAL });
        },
    },
}));

// ── partyStore ──────────────────────────────────────────────────────────────

export type WriteStatus = SessionRuntime['writeStatus'];

/**
 * Journal writer surface the store depends on — matches the JournalWriter
 * class in lib/world/journalWriter.ts one-to-one (the page passes the
 * instance or bound closures). Full-rewrite semantics: `rewrite` replaces the
 * whole file (append == undo == same path) through the writer's own
 * serialized queue. NOTE: `flush` follows the JournalWriter contract — it
 * resolves (never rejects) even when a write was denied; the outcome is
 * observed through `onStatus`.
 */
export interface PartyStoreJournal {
    /** Claim/create the session's journal file and write its initial full text. */
    open: (filePath: string, text: string) => void;
    /** Queue a full rewrite of the journal with the given text. */
    rewrite: (text: string) => void;
    /** Resolves when the write queue is idle (persisted OR stalled denied). */
    flush: () => Promise<void>;
    /** Retry after a denied write (permission regained). */
    retryNow: () => void;
    /** Optional status feed; the store subscribes on setDeps. */
    onStatus?: (cb: (status: WriteStatus) => void) => void;
}

/** Minimal Storage surface for the crash mirror (injectable for bun tests). */
export type MirrorStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface PartyStoreDeps {
    /**
     * Bound closure that writes `mundo/estado/grupo.md` (the binding side —
     * worldWriter — enforces the diario/+estado/ write surface).
     */
    writeEstado: (text: string) => Promise<void>;
    /**
     * Deletes a file relative to the campaign folder. Used by discardSession
     * to drop a TEST session's journal (page binds it to fsm.deleteFile). The
     * store enforces the mundo/diario/ surface before calling it.
     */
    deleteFile: (path: string) => Promise<void>;
    journal: PartyStoreJournal;
    now: () => Date;
    /** Estado write debounce in ms; default DEFAULT_ESTADO_DEBOUNCE_MS. */
    debounceMs?: number;
    /** Crash-mirror storage; defaults to window.sessionStorage (no-op when absent). */
    mirrorStorage?: MirrorStorage;
}

export const DEFAULT_ESTADO_DEBOUNCE_MS = 2000;

/**
 * Crash mirror persisted to sessionStorage on every session mutation.
 *
 * DECISION (M3 reconciliation): the mirror carries the session-start
 * `snapshot` IN the mirror itself — recovery replays `entries` over
 * `snapshot`, NOT over the estado file (which may hold a newer
 * debounce-written mid-session state, so replaying over it would
 * double-apply entries). This is THE canonical crash mirror (key
 * `world.session.mirror.v1`); the snapshot-less helpers that briefly lived
 * in lib/world/journalWriter.ts were deleted — the journal writer mirrors
 * nothing.
 */
export interface SessionMirror {
    version: 1;
    journalPath: string;
    sesion: number;
    fechaReal: string;
    diaInicio: number | null;
    /** Epoch ms when the session started. */
    startedAt: number;
    /** Party state at session start — the replay base. */
    snapshot: PartySnapshot;
    entries: JournalEntry[];
}

export const SESSION_MIRROR_KEY = 'world.session.mirror.v1';

function defaultMirrorStorage(): MirrorStorage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null; // storage blocked (e.g. privacy mode) — mirror disabled
    }
}

/** Reads (and validates) the crash mirror; null when absent/corrupt/SSR. */
export function readSessionMirror(storage?: MirrorStorage | null): SessionMirror | null {
    const st = storage ?? defaultMirrorStorage();
    if (!st) return null;
    try {
        const raw = st.getItem(SESSION_MIRROR_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as SessionMirror;
        if (
            parsed === null ||
            typeof parsed !== 'object' ||
            parsed.version !== 1 ||
            typeof parsed.journalPath !== 'string' ||
            typeof parsed.startedAt !== 'number' ||
            typeof parsed.snapshot !== 'object' ||
            parsed.snapshot === null ||
            !Array.isArray(parsed.entries)
        ) {
            return null;
        }
        // A journalPath outside the app's write surface is a corrupt/hostile
        // mirror: recovering it would make JournalWriter.open() throw AFTER
        // the session flipped active. Treat it as no mirror.
        if (!parsed.journalPath.startsWith(`${WORLD_DIR}/${ENTITY_DIRS.diario}/`)) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function clearSessionMirror(storage?: MirrorStorage | null): void {
    const st = storage ?? defaultMirrorStorage();
    if (!st) return;
    try {
        st.removeItem(SESSION_MIRROR_KEY);
    } catch {
        // best effort
    }
}

/** End-of-session recap returned by endSession() for the closing toast. */
export interface SessionSummary {
    durationMs: number;
    counts: Partial<Record<JournalEntryType, number>>;
    /** Sum of ganancia minus gasto payloads over the whole session. */
    netCreditos: number;
}

export interface PartyStoreState {
    // Live party fields (PartySnapshot shape, mutated only through log/undo/replay)
    diaMundo: number;
    ubicacion: string | null;
    rumbo: { destino: string; llegadaDia: number } | null;
    creditos: number;
    medidores: Record<string, number>;
    /**
     * Party PC names (roster). Hydrated from estado/grupo.md; NEVER mutated by
     * the log — but held here so serializePartyState (called from currentPartyState
     * on every write) round-trips it and a session write never drops the roster.
     * Feeds the cockpit InitiativeTracker.
     */
    personajes: string[];
    /** Agent-owned estado body, preserved byte-for-byte on every write. */
    bodyMd: string;
    /** Path of estado/grupo.md relative to the campaign folder (bookkeeping). */
    estadoFilePath: string | null;
    session: SessionRuntime;
    actions: {
        /** Injects side-effect deps (page: bound closures; tests: fakes). */
        setDeps: (deps: PartyStoreDeps) => void;
        /** Loads estadoGrupo (or defaults) into the live fields. No-op mid-session. */
        hydrate: (model: WorldModel) => void;
        /**
         * Opens a session: next journal file from `diario` + `today`
         * (YYYY-MM-DD), inicio entry, snapshot, journal open, mirror,
         * debounced estado write with sesion_activa true. Returns the new
         * JournalDay (null when already active / deps missing).
         */
        startSession: (diario: JournalDay[], today: string) => JournalDay | null;
        /**
         * THE single mutation entry point: applies the entry to the live
         * fields, appends it, rewrites the journal, refreshes the mirror and
         * schedules the debounced estado write. Returns the entry for the
         * toast; null (+console.warn) when no session is active.
         */
        log: (entry: JournalEntry) => JournalEntry | null;
        /**
         * Drops the last entry (never the inicio) and recomputes the live
         * fields by replaying the remaining entries over the session-start
         * snapshot. Returns the removed entry, or null when nothing undoable.
         */
        undoLast: () => JournalEntry | null;
        /**
         * Appends fin, sets dia_fin, flushes the journal, forces the estado
         * write with sesion_activa false, clears the mirror and deactivates.
         * If the journal flush fails the session STAYS active (writeStatus
         * denied, mirror kept) and null is returned — retry after retryWrites.
         */
        endSession: () => Promise<SessionSummary | null>;
        /**
         * DISCARD (test session): deletes the session journal and ROLLS BACK
         * estado to the session-start snapshot, then deactivates — the opposite
         * of endSession's SAVE. Because the journal is written incrementally and
         * estado is debounce-written DURING play, both are already on disk by the
         * time the GM ends, so discard must actively undo them.
         *
         *   - Guard: only while session.active (else {ok:false}).
         *   - Deletes session.journalPath (enforces the mundo/diario/ surface;
         *     a path outside it, or a delete that throws, returns {ok:false}
         *     WITHOUT touching anything so the GM can retry — the session stays
         *     active and estado is left as-is).
         *   - Cancels the pending debounced estado write FIRST (so a queued
         *     mid-session write cannot land after the rollback), then forces an
         *     estado write equal to the snapshot with sesion_activa:false and the
         *     unchanged roster/body preserved.
         *   - Clears the crash mirror, reverts the LIVE party fields to the
         *     snapshot (so the UI reverts immediately) and deactivates.
         *
         * The page then re-scans so in-memory knowledge/pista bumps vanish and
         * the diario reloads without the deleted file.
         */
        discardSession: () => Promise<{ ok: boolean }>;
        /**
         * Rebuilds an active session from a crash mirror: live fields =
         * mirror.entries replayed over mirror.snapshot (see SessionMirror
         * doc); estado body/path re-taken from the fresh model; journal
         * reopened with the full serialized content.
         */
        recoverSession: (mirror: SessionMirror, model: WorldModel) => void;
        /** Forces any pending debounced estado write now; resolves when settled. */
        flushEstado: () => Promise<void>;
        /**
         * Registers pagehide/visibilitychange listeners that flush the
         * debounced estado write; returns the cleanup. SSR-safe no-op.
         */
        bindLifecycleFlush: () => () => void;
        /** Feed for the journal writer's status (page binds this as onStatus). */
        setJournalStatus: (status: WriteStatus) => void;
        /** Retries denied writes: journal retryNow + estado re-write. */
        retryWrites: () => void;
        reset: () => void;
    };
}

const SESSION_INITIAL: SessionRuntime = {
    active: false,
    journalPath: null,
    startedAt: null,
    entries: [],
    snapshot: null,
    writeStatus: 'ok',
};

function partyInitial() {
    const defaults = defaultPartyState();
    return {
        diaMundo: defaults.diaMundo,
        ubicacion: defaults.ubicacion,
        rumbo: defaults.rumbo,
        creditos: defaults.creditos,
        medidores: defaults.medidores,
        personajes: defaults.personajes,
        bodyMd: defaults.bodyMd,
        estadoFilePath: null as string | null,
        session: { ...SESSION_INITIAL, entries: [] as JournalEntry[] },
    };
}

function cloneSnapshot(snapshot: PartySnapshot): PartySnapshot {
    return {
        diaMundo: snapshot.diaMundo,
        ubicacion: snapshot.ubicacion,
        rumbo: snapshot.rumbo === null ? null : { ...snapshot.rumbo },
        creditos: snapshot.creditos,
        medidores: { ...snapshot.medidores },
    };
}

function summarize(entries: JournalEntry[], durationMs: number): SessionSummary {
    const counts: Partial<Record<JournalEntryType, number>> = {};
    let netCreditos = 0;
    for (const entry of entries) {
        counts[entry.tipo] = (counts[entry.tipo] ?? 0) + 1;
        const cantidad = Number(entry.payload.trim());
        if (!Number.isFinite(cantidad)) continue;
        if (entry.tipo === 'ganancia') netCreditos += cantidad;
        if (entry.tipo === 'gasto') netCreditos -= cantidad;
    }
    return { durationMs: Math.max(0, durationMs), counts, netCreditos };
}

export const usePartyStore = create<PartyStoreState>()((set, get) => {
    // Non-reactive session machinery lives in the closure, not in state.
    let deps: PartyStoreDeps | null = null;
    let journalDay: JournalDay | null = null;
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let journalStatus: WriteStatus = 'ok';
    let estadoStatus: WriteStatus = 'ok';
    /** Serializes estado writes; never left rejected. */
    let estadoChain: Promise<void> = Promise.resolve();

    function combineStatus(a: WriteStatus, b: WriteStatus): WriteStatus {
        if (a === 'denied' || b === 'denied') return 'denied'; // denied wins over pending
        if (a === 'pending' || b === 'pending') return 'pending';
        return 'ok';
    }

    function pushStatus() {
        const writeStatus = combineStatus(journalStatus, estadoStatus);
        const { session } = get();
        if (session.writeStatus === writeStatus) return;
        set({ session: { ...session, writeStatus } });
    }

    function liveSnapshot(): PartySnapshot {
        const s = get();
        return cloneSnapshot({
            diaMundo: s.diaMundo,
            ubicacion: s.ubicacion,
            rumbo: s.rumbo,
            creditos: s.creditos,
            medidores: s.medidores,
        });
    }

    function snapshotToFields(snapshot: PartySnapshot) {
        const copy = cloneSnapshot(snapshot);
        return {
            diaMundo: copy.diaMundo,
            ubicacion: copy.ubicacion,
            rumbo: copy.rumbo,
            creditos: copy.creditos,
            medidores: copy.medidores,
        };
    }

    function currentPartyState(): PartyState {
        const s = get();
        return {
            sesionActiva: s.session.active,
            diaMundo: s.diaMundo,
            ubicacion: s.ubicacion,
            rumbo: s.rumbo === null ? null : { ...s.rumbo },
            creditos: s.creditos,
            medidores: { ...s.medidores },
            personajes: [...s.personajes],
            bodyMd: s.bodyMd,
            filePath: s.estadoFilePath,
        };
    }

    // ── Crash mirror ────────────────────────────────────────────────────

    function mirrorStorage(): MirrorStorage | null {
        return deps?.mirrorStorage ?? defaultMirrorStorage();
    }

    function writeMirror() {
        const storage = mirrorStorage();
        if (!storage || journalDay === null) return;
        const { session } = get();
        if (!session.active || session.snapshot === null || session.startedAt === null) return;
        const mirror: SessionMirror = {
            version: 1,
            journalPath: journalDay.filePath,
            sesion: journalDay.sesion,
            fechaReal: journalDay.fechaReal,
            diaInicio: journalDay.diaInicio,
            startedAt: session.startedAt,
            snapshot: session.snapshot,
            entries: session.entries,
        };
        try {
            storage.setItem(SESSION_MIRROR_KEY, JSON.stringify(mirror));
        } catch (error) {
            console.warn('[world] no se pudo escribir el espejo de sesión', error);
        }
    }

    // ── Debounced estado write ──────────────────────────────────────────

    function performEstadoWrite(): Promise<void> {
        const d = deps;
        if (d === null) return Promise.resolve();
        estadoStatus = 'pending';
        pushStatus();
        estadoChain = estadoChain
            .then(() => d.writeEstado(serializePartyState(currentPartyState(), d.now().toISOString())))
            .then(
                () => {
                    estadoStatus = 'ok';
                    pushStatus();
                },
                (error) => {
                    console.warn('[world] fallo al escribir estado/grupo.md', error);
                    estadoStatus = 'denied';
                    pushStatus();
                }
            );
        return estadoChain;
    }

    function scheduleEstadoWrite() {
        const d = deps;
        if (d === null) return;
        if (debounceTimer !== null) clearTimeout(debounceTimer);
        estadoStatus = 'pending';
        pushStatus();
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            void performEstadoWrite();
        }, d.debounceMs ?? DEFAULT_ESTADO_DEBOUNCE_MS);
    }

    function flushEstadoNow(): Promise<void> {
        if (debounceTimer !== null) {
            clearTimeout(debounceTimer);
            debounceTimer = null;
            return performEstadoWrite();
        }
        return estadoChain;
    }

    return {
        ...partyInitial(),
        actions: {
            setDeps(next: PartyStoreDeps) {
                deps = next;
                next.journal.onStatus?.((status) => {
                    journalStatus = status;
                    pushStatus();
                });
            },

            hydrate(model: WorldModel) {
                if (get().session.active) {
                    console.warn('[world] hydrate ignorado: hay una sesión activa');
                    return;
                }
                const estado = model.estadoGrupo ?? defaultPartyState();
                set({
                    diaMundo: estado.diaMundo,
                    ubicacion: estado.ubicacion,
                    rumbo: estado.rumbo === null ? null : { ...estado.rumbo },
                    creditos: estado.creditos,
                    medidores: { ...estado.medidores },
                    personajes: [...estado.personajes],
                    bodyMd: estado.bodyMd,
                    estadoFilePath: estado.filePath,
                });
            },

            startSession(diario: JournalDay[], today: string): JournalDay | null {
                const s = get();
                if (s.session.active) {
                    console.warn('[world] startSession ignorado: ya hay una sesión activa');
                    return null;
                }
                if (deps === null) {
                    console.warn('[world] startSession ignorado: faltan las dependencias (setDeps)');
                    return null;
                }
                const inicio = makeEntry.inicio(s.diaMundo, s.ubicacion, deps.now);
                const snapshot = liveSnapshot();
                const { fileName, sesion } = nextJournalFile(diario, today);
                journalDay = {
                    filePath: `${WORLD_DIR}/${ENTITY_DIRS.diario}/${fileName}`,
                    sesion,
                    fechaReal: today,
                    diaInicio: s.diaMundo,
                    diaFin: null,
                    procesado: false,
                    entradas: [inicio],
                };
                journalStatus = 'ok';
                estadoStatus = 'ok';
                set({
                    session: {
                        active: true,
                        journalPath: journalDay.filePath,
                        startedAt: deps.now().getTime(),
                        entries: [inicio],
                        snapshot,
                        writeStatus: 'ok',
                    },
                });
                writeMirror();
                deps.journal.open(journalDay.filePath, serializeJournal(journalDay, journalDay.entradas));
                scheduleEstadoWrite(); // sesion_activa: true reaches disk within the debounce
                return journalDay;
            },

            log(entry: JournalEntry): JournalEntry | null {
                const s = get();
                if (!s.session.active || deps === null || journalDay === null) {
                    console.warn('[world] log ignorado: no hay sesión activa');
                    return null;
                }
                const next = applyEntryToSnapshot(liveSnapshot(), entry);
                const entries = [...s.session.entries, entry];
                journalDay = { ...journalDay, entradas: entries };
                set({
                    ...snapshotToFields(next),
                    session: { ...s.session, entries },
                });
                writeMirror();
                deps.journal.rewrite(serializeJournal(journalDay, journalDay.entradas));
                scheduleEstadoWrite();
                return entry;
            },

            undoLast(): JournalEntry | null {
                const s = get();
                if (!s.session.active || deps === null || journalDay === null) {
                    console.warn('[world] undo ignorado: no hay sesión activa');
                    return null;
                }
                if (s.session.entries.length <= 1) {
                    console.warn('[world] undo ignorado: la entrada de inicio no se puede deshacer');
                    return null;
                }
                const removed = s.session.entries[s.session.entries.length - 1];
                const entries = s.session.entries.slice(0, -1);
                let snapshot = cloneSnapshot(s.session.snapshot!);
                for (const past of entries) {
                    snapshot = applyEntryToSnapshot(snapshot, past);
                }
                journalDay = { ...journalDay, entradas: entries };
                set({
                    ...snapshotToFields(snapshot),
                    session: { ...s.session, entries },
                });
                writeMirror();
                deps.journal.rewrite(serializeJournal(journalDay, journalDay.entradas));
                scheduleEstadoWrite();
                return removed;
            },

            async endSession(): Promise<SessionSummary | null> {
                const s = get();
                if (!s.session.active || deps === null || journalDay === null) {
                    console.warn('[world] endSession ignorado: no hay sesión activa');
                    return null;
                }
                const d = deps;
                // Reuse the fin from a previous failed close instead of duplicating it.
                // If the GM logged more entries after a failed close, the old fin is
                // stranded mid-journal — drop it: a fin must only ever be the final entry.
                let entries = s.session.entries;
                if (entries[entries.length - 1]?.tipo !== 'fin') {
                    entries = [
                        ...entries.filter((e) => e.tipo !== 'fin'),
                        makeEntry.fin(s.diaMundo, s.ubicacion, d.now),
                    ];
                }
                journalDay = { ...journalDay, diaFin: s.diaMundo, entradas: entries };
                set({ session: { ...s.session, entries } });
                writeMirror();
                d.journal.rewrite(serializeJournal(journalDay, journalDay.entradas));
                try {
                    await d.journal.flush();
                } catch (error) {
                    // Defensive: JournalWriter.flush never rejects, but a
                    // custom binding might.
                    console.warn('[world] no se pudo confirmar el diario al cerrar la sesión', error);
                    journalStatus = 'denied';
                    pushStatus();
                    return null;
                }
                if (journalStatus === 'denied') {
                    // JournalWriter.flush resolves even on denial (status via
                    // onStatus). Journal is the recovery log: without it on
                    // disk we neither deactivate nor drop the mirror. The GM
                    // retries via retryWrites and closes again.
                    console.warn('[world] cierre pospuesto: el diario no se pudo escribir');
                    return null;
                }
                const startedAt = s.session.startedAt ?? d.now().getTime();
                const summary = summarize(entries, d.now().getTime() - startedAt);
                if (debounceTimer !== null) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }
                // Deactivate BEFORE the forced write so sesion_activa: false lands.
                set({
                    session: {
                        active: false,
                        journalPath: null,
                        startedAt: null,
                        entries: [],
                        snapshot: null,
                        writeStatus: combineStatus(journalStatus, estadoStatus),
                    },
                });
                // Even if this write is denied the journal is safe on disk; the
                // stale sesion_activa lock is flagged to the GM by PROTOCOLO.
                await performEstadoWrite();
                clearSessionMirror(mirrorStorage());
                journalDay = null;
                return summary;
            },

            async discardSession(): Promise<{ ok: boolean }> {
                const s = get();
                if (!s.session.active || deps === null || s.session.snapshot === null) {
                    console.warn('[world] discardSession ignorado: no hay sesión activa');
                    return { ok: false };
                }
                const d = deps;
                const snapshot = cloneSnapshot(s.session.snapshot);
                const journalPath = s.session.journalPath;
                // Surface guard: only ever delete inside mundo/diario/. A path
                // outside it is corrupt state — refuse without touching anything.
                const diarioPrefix = `${WORLD_DIR}/${ENTITY_DIRS.diario}/`;
                if (journalPath === null || !journalPath.startsWith(diarioPrefix)) {
                    console.warn('[world] discardSession ignorado: journalPath fuera de mundo/diario/');
                    return { ok: false };
                }
                // Delete the journal. On any failure stay ACTIVE and untouched so
                // the GM can retry (estado is not rolled back either).
                try {
                    await d.deleteFile(journalPath);
                } catch (error) {
                    console.warn('[world] no se pudo borrar el diario de la sesión de prueba', error);
                    return { ok: false };
                }
                // Cancel the pending debounced estado write FIRST so a queued
                // mid-session write cannot land after the rollback below.
                if (debounceTimer !== null) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }
                // Roll estado back to the session-start snapshot (sesion_activa
                // false), preserving the roster + agent body the log never edits.
                const restored: PartyState = {
                    sesionActiva: false,
                    diaMundo: snapshot.diaMundo,
                    ubicacion: snapshot.ubicacion,
                    rumbo: snapshot.rumbo === null ? null : { ...snapshot.rumbo },
                    creditos: snapshot.creditos,
                    medidores: { ...snapshot.medidores },
                    personajes: [...s.personajes],
                    bodyMd: s.bodyMd,
                    filePath: s.estadoFilePath,
                };
                estadoStatus = 'pending';
                pushStatus();
                estadoChain = estadoChain.then(() =>
                    d.writeEstado(serializePartyState(restored, d.now().toISOString()))
                );
                try {
                    await estadoChain;
                    estadoStatus = 'ok';
                } catch (error) {
                    // Journal is already gone; a denied estado write leaves the
                    // pre-session state on disk (nothing was ever overwritten by
                    // the discard). Surface denied but still deactivate — the
                    // test session is over regardless.
                    console.warn('[world] fallo al restaurar estado tras descartar', error);
                    estadoStatus = 'denied';
                }
                estadoChain = estadoChain.catch(() => {});
                clearSessionMirror(mirrorStorage());
                journalDay = null;
                journalStatus = 'ok';
                // Revert the LIVE party fields + deactivate so the UI reverts now.
                set({
                    ...snapshotToFields(snapshot),
                    session: {
                        active: false,
                        journalPath: null,
                        startedAt: null,
                        entries: [],
                        snapshot: null,
                        writeStatus: estadoStatus,
                    },
                });
                return { ok: true };
            },

            recoverSession(mirror: SessionMirror, model: WorldModel) {
                if (get().session.active) {
                    console.warn('[world] recoverSession ignorado: ya hay una sesión activa');
                    return;
                }
                if (deps === null) {
                    console.warn('[world] recoverSession ignorado: faltan las dependencias (setDeps)');
                    return;
                }
                const estado = model.estadoGrupo;
                let snapshot = cloneSnapshot(mirror.snapshot);
                for (const entry of mirror.entries) {
                    snapshot = applyEntryToSnapshot(snapshot, entry);
                }
                journalDay = {
                    filePath: mirror.journalPath,
                    sesion: mirror.sesion,
                    fechaReal: mirror.fechaReal,
                    diaInicio: mirror.diaInicio,
                    diaFin: null,
                    procesado: false,
                    entradas: [...mirror.entries],
                };
                journalStatus = 'ok';
                estadoStatus = 'ok';
                set({
                    ...snapshotToFields(snapshot),
                    // Roster is file-owned (not in the mirror); re-take it from the
                    // fresh scan so a recovered session still writes it back.
                    personajes: estado ? [...estado.personajes] : [],
                    bodyMd: estado?.bodyMd ?? '',
                    estadoFilePath: estado?.filePath ?? null,
                    session: {
                        active: true,
                        journalPath: mirror.journalPath,
                        startedAt: mirror.startedAt,
                        entries: [...mirror.entries],
                        snapshot: cloneSnapshot(mirror.snapshot),
                        writeStatus: 'ok',
                    },
                });
                writeMirror();
                // Reopen + resync: the file content is rewritten to match memory.
                deps.journal.open(journalDay.filePath, serializeJournal(journalDay, journalDay.entradas));
                scheduleEstadoWrite();
            },

            flushEstado(): Promise<void> {
                return flushEstadoNow();
            },

            bindLifecycleFlush(): () => void {
                if (typeof window === 'undefined' || typeof document === 'undefined') {
                    return () => {};
                }
                const onPageHide = () => {
                    void flushEstadoNow();
                };
                const onVisibilityChange = () => {
                    if (document.visibilityState === 'hidden') void flushEstadoNow();
                };
                window.addEventListener('pagehide', onPageHide);
                document.addEventListener('visibilitychange', onVisibilityChange);
                return () => {
                    window.removeEventListener('pagehide', onPageHide);
                    document.removeEventListener('visibilitychange', onVisibilityChange);
                };
            },

            setJournalStatus(status: WriteStatus) {
                journalStatus = status;
                pushStatus();
            },

            retryWrites() {
                deps?.journal.retryNow();
                if (estadoStatus === 'denied') void performEstadoWrite();
            },

            reset() {
                if (debounceTimer !== null) {
                    clearTimeout(debounceTimer);
                    debounceTimer = null;
                }
                // NOTE: the crash mirror is intentionally NOT cleared — reset
                // simulates/handles an in-app teardown, and the mirror must
                // survive until endSession or an explicit clearSessionMirror.
                deps = null;
                journalDay = null;
                journalStatus = 'ok';
                estadoStatus = 'ok';
                estadoChain = Promise.resolve();
                set({ ...partyInitial() });
            },
        },
    };
});

// ── uiStore ─────────────────────────────────────────────────────────────────

export type MapTier = 'sector' | 'system' | 'place';
export type PanelTab = 'entidad' | 'pistas' | 'hilos' | 'diario' | 'eventos';

/** Map viewport transform — structurally identical to StarMap's MapViewport. */
export interface UiViewport {
    x: number;
    y: number;
    k: number;
}

/**
 * The persisted subset of UiState (everything except actions). M5 polish:
 * mirrored to sessionStorage on every change so a reload lands where the GM
 * was. Stale ids after a re-scan degrade exactly like stale store ids do
 * (invalid focus -> sector tier, missing selection -> empty panel), so no
 * model-side validation is needed here.
 */
export interface UiSlice {
    tier: MapTier;
    focusSystemId: string | null;
    /** Place focused at the 'place' tier (spatial Plano); null at other tiers. */
    focusPlaceId: string | null;
    siteListId: string | null;
    selectedEntityId: string | null;
    panelTab: PanelTab;
    /**
     * Trama whose narrative web ("Hilos" feature) is painted on the sector
     * map; null = none. Persisted; a stale id after a re-scan simply paints
     * nothing (the derivation returns empty nodes) — it never crashes.
     */
    focusTramaId: string | null;
    mapCollapsed: boolean;
    showUnknown: boolean;
    /**
     * Last gesture-committed map viewport per tier key ('sector',
     * 'system:<sistemaId>' or 'place:<placeId>'). Only gesture ENDS land here
     * (StarMap emits
     * onViewportChange once per finished gesture); mid-gesture transforms
     * stay in StarMap's refs and are ephemeral by design.
     */
    viewports: Record<string, UiViewport>;
}

export interface UiState extends UiSlice {
    actions: {
        setTier: (tier: MapTier) => void;
        /** Drill into a sistema: sets the focus AND switches to the 'system' tier. */
        focusSystem: (systemId: string) => void;
        /**
         * Drill into a place's spatial Plano: switches to the 'place' tier,
         * pins both the place and its parent sistema (for the system-tier
         * backdrop and breadcrumb), and closes any open SiteList.
         */
        focusPlace: (placeId: string, systemId: string) => void;
        /** Back out to the sector tier (keeps the last focus for re-entry). */
        backToSector: () => void;
        /** Back out from the Plano to the system tier (keeps focusSystemId). */
        backToSystem: () => void;
        /** Open the interior list of a lugar (tier stays where it is). */
        openSiteList: (placeId: string) => void;
        closeSiteList: () => void;
        selectEntity: (entityId: string | null) => void;
        setPanelTab: (tab: PanelTab) => void;
        /**
         * Paint (or clear) a trama's thread web on the sector map. TOGGLE:
         * calling with the already-focused id clears it. Focusing also drops
         * to the sector tier so the web is visible (mirrors backToSector:
         * tier 'sector', clears focusPlaceId/focusSystemId/siteListId).
         */
        focusTrama: (tramaId: string | null) => void;
        setMapCollapsed: (collapsed: boolean) => void;
        setShowUnknown: (show: boolean) => void;
        /** Remembers a gesture-committed viewport under its tier key. */
        rememberViewport: (key: string, viewport: UiViewport) => void;
        reset: () => void;
    };
}

const UI_INITIAL: UiSlice = {
    tier: 'sector',
    focusSystemId: null,
    focusPlaceId: null,
    siteListId: null,
    selectedEntityId: null,
    panelTab: 'entidad',
    focusTramaId: null,
    mapCollapsed: false,
    showUnknown: true,
    viewports: {},
};

/** sessionStorage key of the persisted UI slice. */
export const UI_PERSIST_KEY = 'world.ui.v1';

/** Minimal Storage surface the persistence needs (injectable for bun tests). */
export type UiStorage = Pick<Storage, 'getItem' | 'setItem'>;

function sessionStorageOrNull(): UiStorage | null {
    if (typeof window === 'undefined') return null;
    try {
        return window.sessionStorage;
    } catch {
        return null; // storage blocked (e.g. privacy mode) — persistence disabled
    }
}

function isUiViewport(value: unknown): value is UiViewport {
    if (value === null || typeof value !== 'object') return false;
    const v = value as Record<string, unknown>;
    return (
        typeof v.x === 'number' &&
        Number.isFinite(v.x) &&
        typeof v.y === 'number' &&
        Number.isFinite(v.y) &&
        typeof v.k === 'number' &&
        Number.isFinite(v.k) &&
        v.k > 0
    );
}

/**
 * Reads the persisted UI slice, validating FIELD BY FIELD: a corrupt or
 * out-of-vocabulary field falls back to its default while the valid ones
 * still restore (same degrade-don't-fail stance as the world scanner).
 * Returns {} when absent/corrupt/SSR.
 */
export function readPersistedUi(storage: UiStorage | null = sessionStorageOrNull()): Partial<UiSlice> {
    if (!storage) return {};
    let parsed: unknown;
    try {
        const raw = storage.getItem(UI_PERSIST_KEY);
        if (!raw) return {};
        parsed = JSON.parse(raw);
    } catch {
        return {};
    }
    if (parsed === null || typeof parsed !== 'object') return {};
    const p = parsed as Record<string, unknown>;
    const out: Partial<UiSlice> = {};
    if (p.tier === 'sector' || p.tier === 'system' || p.tier === 'place') out.tier = p.tier;
    for (const key of [
        'focusSystemId',
        'focusPlaceId',
        'siteListId',
        'selectedEntityId',
        'focusTramaId',
    ] as const) {
        const value = p[key];
        if (typeof value === 'string' || value === null) out[key] = value;
    }
    // A 'place' tier with no focus can't render a Plano — degrade to system
    // (if a sistema is focused) or sector, so a reload never lands blank.
    if (out.tier === 'place' && !out.focusPlaceId) {
        out.tier = out.focusSystemId ? 'system' : 'sector';
    }
    if (
        p.panelTab === 'entidad' ||
        p.panelTab === 'pistas' ||
        p.panelTab === 'hilos' ||
        p.panelTab === 'diario' ||
        p.panelTab === 'eventos'
    ) {
        out.panelTab = p.panelTab;
    }
    if (typeof p.mapCollapsed === 'boolean') out.mapCollapsed = p.mapCollapsed;
    if (typeof p.showUnknown === 'boolean') out.showUnknown = p.showUnknown;
    if (p.viewports !== null && typeof p.viewports === 'object') {
        const viewports: Record<string, UiViewport> = {};
        for (const [key, value] of Object.entries(p.viewports as Record<string, unknown>)) {
            if (isUiViewport(value)) viewports[key] = { x: value.x, y: value.y, k: value.k };
        }
        out.viewports = viewports;
    }
    return out;
}

/** Writes the UI slice to storage (best effort — quota/privacy errors swallowed). */
export function persistUi(state: UiSlice, storage: UiStorage | null = sessionStorageOrNull()): void {
    if (!storage) return;
    const slice: UiSlice = {
        tier: state.tier,
        focusSystemId: state.focusSystemId,
        focusPlaceId: state.focusPlaceId,
        siteListId: state.siteListId,
        selectedEntityId: state.selectedEntityId,
        panelTab: state.panelTab,
        focusTramaId: state.focusTramaId,
        mapCollapsed: state.mapCollapsed,
        showUnknown: state.showUnknown,
        viewports: state.viewports,
    };
    try {
        storage.setItem(UI_PERSIST_KEY, JSON.stringify(slice));
    } catch {
        // best effort
    }
}

export const useUiStore = create<UiState>()((set) => ({
    ...UI_INITIAL,
    // Restore the persisted slice at creation (SSR/bun: no window -> defaults).
    ...readPersistedUi(),
    actions: {
        setTier(tier: MapTier) {
            set({ tier });
        },
        focusSystem(systemId: string) {
            set({ tier: 'system', focusSystemId: systemId, focusPlaceId: null, siteListId: null });
        },
        focusPlace(placeId: string, systemId: string) {
            set({
                tier: 'place',
                focusPlaceId: placeId,
                focusSystemId: systemId,
                siteListId: null,
            });
        },
        backToSector() {
            set({ tier: 'sector', focusPlaceId: null, siteListId: null });
        },
        backToSystem() {
            set({ tier: 'system', focusPlaceId: null, siteListId: null });
        },
        openSiteList(placeId: string) {
            set({ siteListId: placeId });
        },
        closeSiteList() {
            set({ siteListId: null });
        },
        selectEntity(entityId: string | null) {
            set({ selectedEntityId: entityId });
        },
        setPanelTab(tab: PanelTab) {
            set({ panelTab: tab });
        },
        focusTrama(tramaId: string | null) {
            set((state) => {
                // Toggle: re-focusing the same trama clears the web.
                const next = tramaId !== null && state.focusTramaId === tramaId ? null : tramaId;
                // Focusing drops to the sector tier so the web is visible
                // (reuse backToSector's effect); clearing leaves the tier as-is.
                if (next === null) return { focusTramaId: null };
                return {
                    focusTramaId: next,
                    tier: 'sector',
                    focusPlaceId: null,
                    focusSystemId: null,
                    siteListId: null,
                };
            });
        },
        setMapCollapsed(collapsed: boolean) {
            set({ mapCollapsed: collapsed });
        },
        setShowUnknown(show: boolean) {
            set({ showUnknown: show });
        },
        rememberViewport(key: string, viewport: UiViewport) {
            set((state) => ({
                viewports: { ...state.viewports, [key]: { ...viewport } },
            }));
        },
        reset() {
            set({ ...UI_INITIAL });
        },
    },
}));

// Mirror every UI change into sessionStorage (a tiny slice — cheaper and less
// invasive than the zustand persist middleware, and bun-testable through the
// exported readPersistedUi/persistUi pair). No window (SSR/bun) -> no-op.
if (typeof window !== 'undefined') {
    useUiStore.subscribe((state) => persistUi(state));
}
