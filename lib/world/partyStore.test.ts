/// <reference types="bun-types" />
import { test, expect, describe, beforeEach } from 'bun:test';
import { JournalDay, PartyState, WorldManifest, WorldModel } from '@/types/world';
import { makeEntry } from './logEntries';
import { defaultPartyState, parsePartyState, serializePartyState } from './partyState';
import {
    MirrorStorage,
    PartyStoreDeps,
    readSessionMirror,
    SESSION_MIRROR_KEY,
    usePartyStore,
} from './stores';

// ── Fakes ───────────────────────────────────────────────────────────────────

const NOW = new Date('2026-07-12T14:05:00'); // local time
const CLOCK = () => NOW;
const HORA = '14:05';
const TODAY = '2026-07-12';

function makeFakeStorage(): MirrorStorage & { data: Map<string, string> } {
    const data = new Map<string, string>();
    return {
        data,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
            data.set(key, value);
        },
        removeItem: (key: string) => {
            data.delete(key);
        },
    };
}

interface FakeDeps {
    deps: PartyStoreDeps;
    estadoWrites: string[];
    journalTexts: string[];
    opened: { path: string; text: string }[];
    storage: ReturnType<typeof makeFakeStorage>;
    failEstado: { value: boolean };
    failFlush: { value: boolean };
}

function makeDeps(): FakeDeps {
    const estadoWrites: string[] = [];
    const journalTexts: string[] = [];
    const opened: { path: string; text: string }[] = [];
    const storage = makeFakeStorage();
    const failEstado = { value: false };
    const failFlush = { value: false };
    const deps: PartyStoreDeps = {
        writeEstado: async (text: string) => {
            if (failEstado.value) throw new Error('NotAllowedError');
            estadoWrites.push(text);
        },
        journal: {
            open: (path: string, text: string) => {
                opened.push({ path, text });
                journalTexts.push(text);
            },
            rewrite: (text: string) => {
                journalTexts.push(text);
            },
            flush: async () => {
                if (failFlush.value) throw new Error('NotAllowedError');
            },
            retryNow: () => {},
        },
        now: CLOCK,
        debounceMs: 0, // debounce fires on the next macrotask
        mirrorStorage: storage,
    };
    return { deps, estadoWrites, journalTexts, opened, storage, failEstado, failFlush };
}

const MANIFEST: WorldManifest = {
    nombre: 'Sector Test',
    calendario: { era: 'dG', anoEpoca: 322, diasPorMes: 30, meses: ['Uno'] },
    viaje: { diasPorUnidad: 1, intrasistemaDias: 1, combustibleCadaDias: 4, viveresCadaDias: 4 },
    medidores: ['viveres', 'combustible', 'nave'],
    regiones: [],
};

function makeModel(estadoGrupo: PartyState | null, diario: JournalDay[] = []): WorldModel {
    return {
        manifest: MANIFEST,
        entidades: new Map(),
        sistemas: [],
        lugares: [],
        facciones: [],
        pnjs: [],
        pistas: [],
        tramas: [],
        tablas: [],
        problemas: [],
        childrenOf: new Map(),
        estadoGrupo,
        diario,
        musica: { bgm: [], eventPlaylists: [] },
    };
}

function makeEstado(overrides: Partial<PartyState> = {}): PartyState {
    return {
        ...defaultPartyState('mundo/estado/grupo.md'),
        diaMundo: 12,
        ubicacion: 'porto_verne',
        creditos: 500,
        medidores: { viveres: 3, combustible: 3, nave: 3 },
        bodyMd: '## Inventario\n\n- 3 cargas de mineral\n',
        ...overrides,
    };
}

const actions = () => usePartyStore.getState().actions;

/** Waits until the 0ms-debounced estado write has settled. */
async function settle() {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await usePartyStore.getState().actions.flushEstado();
}

let fake: FakeDeps;

beforeEach(() => {
    actions().reset();
    fake = makeDeps();
    actions().setDeps(fake.deps);
    actions().hydrate(makeModel(makeEstado()));
});

// ── startSession ────────────────────────────────────────────────────────────

describe('startSession', () => {
    test('opens the next journal file with frontmatter + inicio line and takes the snapshot', () => {
        const day = actions().startSession([], TODAY);

        expect(day).not.toBeNull();
        expect(day!.filePath).toBe('mundo/diario/2026-07-12_s01.md');
        expect(day!.sesion).toBe(1);
        expect(day!.diaInicio).toBe(12);

        expect(fake.opened).toHaveLength(1);
        expect(fake.opened[0].path).toBe('mundo/diario/2026-07-12_s01.md');
        expect(fake.opened[0].text).toBe(
            [
                '---',
                'tipo: diario',
                'sesion: 1',
                'fecha_real: 2026-07-12',
                'dia_inicio: 12',
                'dia_fin: null',
                'procesado: false',
                '---',
                '',
                `- [${HORA}] inicio: dia 12 @ porto_verne`,
                '',
            ].join('\n')
        );

        const { session } = usePartyStore.getState();
        expect(session.active).toBe(true);
        expect(session.journalPath).toBe('mundo/diario/2026-07-12_s01.md');
        expect(session.startedAt).toBe(NOW.getTime());
        expect(session.entries).toHaveLength(1);
        expect(session.snapshot).toEqual({
            diaMundo: 12,
            ubicacion: 'porto_verne',
            rumbo: null,
            creditos: 500,
            medidores: { viveres: 3, combustible: 3, nave: 3 },
        });
    });

    test('numbers the session after the highest existing diario sesion', () => {
        const prior: JournalDay = {
            filePath: 'mundo/diario/2026-06-01_s07.md',
            sesion: 7,
            fechaReal: '2026-06-01',
            diaInicio: 5,
            diaFin: 8,
            procesado: true,
            entradas: [],
        };
        const day = actions().startSession([prior], TODAY);
        expect(day!.sesion).toBe(8);
        expect(day!.filePath).toBe('mundo/diario/2026-07-12_s08.md');
    });

    test('schedules the estado write with sesion_activa true', async () => {
        actions().startSession([], TODAY);
        await settle();
        expect(fake.estadoWrites.length).toBeGreaterThanOrEqual(1);
        const text = fake.estadoWrites[fake.estadoWrites.length - 1];
        expect(text).toContain('sesion_activa: true');
        expect(text).toContain('dia_mundo: 12');
    });

    test('no-ops when a session is already active', () => {
        actions().startSession([], TODAY);
        expect(actions().startSession([], TODAY)).toBeNull();
        expect(fake.opened).toHaveLength(1);
    });
});

// ── log ─────────────────────────────────────────────────────────────────────

describe('log', () => {
    test('warns and returns null when no session is active', () => {
        const result = actions().log(makeEntry.gasto(100, undefined, CLOCK));
        expect(result).toBeNull();
        expect(fake.journalTexts).toHaveLength(0);
    });

    test('gasto mutates creditos, rewrites the journal with 2 lines, schedules estado', async () => {
        actions().startSession([], TODAY);
        const entry = actions().log(makeEntry.gasto(200, 'soborno', CLOCK));

        expect(entry).not.toBeNull();
        expect(usePartyStore.getState().creditos).toBe(300);

        const lastJournal = fake.journalTexts[fake.journalTexts.length - 1];
        const lines = lastJournal.trimEnd().split('\n').filter((l) => l.startsWith('- ['));
        expect(lines).toHaveLength(2);
        expect(lines[1]).toBe(`- [${HORA}] gasto: 200 | soborno`);

        await settle();
        const estado = fake.estadoWrites[fake.estadoWrites.length - 1];
        expect(estado).toContain('creditos: 300');
        expect(estado).toContain('sesion_activa: true');
    });

    test('medidor, rumbo and llegada entries update the live fields', () => {
        actions().startSession([], TODAY);
        actions().log(makeEntry.medidor('combustible', 3, 2, undefined, CLOCK));
        expect(usePartyStore.getState().medidores.combustible).toBe(2);

        actions().log(makeEntry.rumbo('sistema_kovar', 3, 15, undefined, CLOCK));
        expect(usePartyStore.getState().rumbo).toEqual({ destino: 'sistema_kovar', llegadaDia: 15 });

        actions().log(makeEntry.llegada('sistema_kovar', 15, undefined, CLOCK));
        const s = usePartyStore.getState();
        expect(s.ubicacion).toBe('sistema_kovar');
        expect(s.rumbo).toBeNull();
        expect(s.diaMundo).toBe(15);
    });
});

// ── undoLast ────────────────────────────────────────────────────────────────

describe('undoLast', () => {
    test('replays the remaining entries over the snapshot', () => {
        actions().startSession([], TODAY);
        actions().log(makeEntry.gasto(200, undefined, CLOCK));
        actions().log(makeEntry.medidor('combustible', 3, 2, undefined, CLOCK));

        const removed = actions().undoLast();
        expect(removed!.tipo).toBe('medidor');

        const s = usePartyStore.getState();
        expect(s.medidores.combustible).toBe(3); // medidor gone
        expect(s.creditos).toBe(300); // gasto still applied
        expect(s.session.entries).toHaveLength(2); // inicio + gasto

        const lastJournal = fake.journalTexts[fake.journalTexts.length - 1];
        expect(lastJournal).not.toContain('medidor:');
        expect(lastJournal).toContain('gasto: 200');
    });

    test('never removes the inicio entry', () => {
        actions().startSession([], TODAY);
        expect(actions().undoLast()).toBeNull();
        expect(usePartyStore.getState().session.entries).toHaveLength(1);
    });
});

// ── endSession ──────────────────────────────────────────────────────────────

describe('endSession', () => {
    test('appends fin, sets dia_fin, forces estado with sesion_activa false, clears mirror', async () => {
        actions().startSession([], TODAY);
        actions().log(makeEntry.gasto(200, undefined, CLOCK));
        actions().log(makeEntry.ganancia(50, undefined, CLOCK));

        const summary = await actions().endSession();

        expect(summary).not.toBeNull();
        expect(summary!.counts).toEqual({ inicio: 1, gasto: 1, ganancia: 1, fin: 1 });
        expect(summary!.netCreditos).toBe(-150);
        expect(summary!.durationMs).toBe(0); // frozen clock

        const lastJournal = fake.journalTexts[fake.journalTexts.length - 1];
        expect(lastJournal).toContain('dia_fin: 12');
        expect(lastJournal).toContain(`- [${HORA}] fin: dia 12 @ porto_verne`);

        const estado = fake.estadoWrites[fake.estadoWrites.length - 1];
        expect(estado).toContain('sesion_activa: false');
        expect(estado).toContain('creditos: 350');

        expect(usePartyStore.getState().session.active).toBe(false);
        expect(fake.storage.getItem(SESSION_MIRROR_KEY)).toBeNull();
    });

    test('keeps the session active (and the mirror) when the journal flush fails', async () => {
        actions().startSession([], TODAY);
        fake.failFlush.value = true;

        const summary = await actions().endSession();

        expect(summary).toBeNull();
        const { session } = usePartyStore.getState();
        expect(session.active).toBe(true);
        expect(session.writeStatus).toBe('denied');
        expect(fake.storage.getItem(SESSION_MIRROR_KEY)).not.toBeNull();
    });

    test('keeps the session active when flush resolves but the writer reports denied', async () => {
        actions().startSession([], TODAY);
        // JournalWriter.flush never rejects: denial arrives via onStatus.
        actions().setJournalStatus('denied');

        const summary = await actions().endSession();

        expect(summary).toBeNull();
        expect(usePartyStore.getState().session.active).toBe(true);
        expect(fake.storage.getItem(SESSION_MIRROR_KEY)).not.toBeNull();

        // After the writer recovers, closing works and does not duplicate fin.
        actions().setJournalStatus('ok');
        const second = await actions().endSession();
        expect(second).not.toBeNull();
        expect(second!.counts.fin).toBe(1);
        expect(usePartyStore.getState().session.active).toBe(false);
    });

    test('a fin stranded by a failed close + later logging is dropped, not duplicated', async () => {
        actions().startSession([], TODAY);
        actions().log(makeEntry.gasto(100, undefined, CLOCK));

        // First close fails: fin is appended but the session stays active.
        actions().setJournalStatus('denied');
        expect(await actions().endSession()).toBeNull();

        // GM keeps playing: the old fin is now stranded mid-journal.
        actions().log(makeEntry.gasto(50, undefined, CLOCK));

        // Second close succeeds: exactly ONE fin, and it is the FINAL entry.
        actions().setJournalStatus('ok');
        const summary = await actions().endSession();
        expect(summary).not.toBeNull();
        expect(summary!.counts.fin).toBe(1);
        const lastText = fake.journalTexts[fake.journalTexts.length - 1];
        const finLines = lastText.split('\n').filter((l: string) => /^- \[\d\d:\d\d\] fin:/.test(l));
        expect(finLines).toHaveLength(1);
        const lines = lastText.trimEnd().split('\n');
        expect(lines[lines.length - 1]).toMatch(/^- \[\d\d:\d\d\] fin:/);
    });
});

// ── serializePartyState round-trip ──────────────────────────────────────────

describe('serializePartyState', () => {
    const NOW_ISO = '2026-07-12T14:05:00.000Z';

    test('estado body is preserved byte-for-byte through weird content', () => {
        const weirdBody =
            '\n## Inventario\n\n---\nfalsa valla\n---\n\t tabs y  espacios  \n- créditos: "raros" | tubería\nsin salto final';
        const state = makeEstado({ bodyMd: weirdBody, rumbo: { destino: 'x', llegadaDia: 9 } });

        const text = serializePartyState(state, NOW_ISO);
        expect(text.endsWith(weirdBody)).toBe(true);

        const { state: reparsed } = parsePartyState(text, 'mundo/estado/grupo.md');
        expect(reparsed.bodyMd).toBe(weirdBody);
        expect(reparsed.diaMundo).toBe(state.diaMundo);
        expect(reparsed.ubicacion).toBe(state.ubicacion);
        expect(reparsed.rumbo).toEqual(state.rumbo);
        expect(reparsed.creditos).toBe(state.creditos);
        expect(reparsed.medidores).toEqual(state.medidores);
        expect(reparsed.sesionActiva).toBe(state.sesionActiva);
    });

    test('empty body emits just frontmatter ending in a newline', () => {
        const text = serializePartyState(makeEstado({ bodyMd: '' }), NOW_ISO);
        expect(text.endsWith('---\n')).toBe(true);
        const { state: reparsed } = parsePartyState(text, 'mundo/estado/grupo.md');
        expect(reparsed.bodyMd).toBe('');
    });

    test('documented key order and null forms', () => {
        const text = serializePartyState(
            makeEstado({ ubicacion: null, rumbo: null, bodyMd: '' }),
            NOW_ISO
        );
        expect(text).toBe(
            [
                '---',
                'tipo: estado_grupo',
                `actualizado: ${NOW_ISO}`,
                'sesion_activa: false',
                'dia_mundo: 12',
                'ubicacion: null',
                'rumbo: null',
                'creditos: 500',
                'medidores:',
                '  viveres: 3',
                '  combustible: 3',
                '  nave: 3',
                '---',
                '',
            ].join('\n')
        );
    });
});

// ── Crash mirror + recoverSession ───────────────────────────────────────────

describe('recoverSession', () => {
    test('round-trips a crashed session from the mirror', () => {
        actions().startSession([], TODAY);
        actions().log(makeEntry.gasto(200, undefined, CLOCK));
        actions().log(makeEntry.medidor('nave', 3, 4, undefined, CLOCK));

        const mirror = readSessionMirror(fake.storage);
        expect(mirror).not.toBeNull();
        expect(mirror!.snapshot.creditos).toBe(500); // session-START snapshot
        expect(mirror!.entries).toHaveLength(3);

        // Simulate the crash: fresh store, fresh deps, fresh scan.
        actions().reset();
        const fresh = makeDeps();
        actions().setDeps(fresh.deps);
        actions().recoverSession(mirror!, makeModel(makeEstado()));

        const s = usePartyStore.getState();
        expect(s.session.active).toBe(true);
        expect(s.session.journalPath).toBe('mundo/diario/2026-07-12_s01.md');
        expect(s.session.entries).toHaveLength(3);
        expect(s.creditos).toBe(300); // replayed over the mirror snapshot
        expect(s.medidores.nave).toBe(4);
        expect(s.bodyMd).toBe(makeEstado().bodyMd); // estado body re-taken from the model

        // Journal reopened with the full serialized content.
        expect(fresh.opened).toHaveLength(1);
        expect(fresh.opened[0].path).toBe('mundo/diario/2026-07-12_s01.md');
        expect(fresh.opened[0].text).toContain('gasto: 200');
        expect(fresh.opened[0].text).toContain('nave 3->4');

        // The session keeps working after recovery.
        const entry = actions().log(makeEntry.ganancia(100, undefined, CLOCK));
        expect(entry).not.toBeNull();
        expect(usePartyStore.getState().creditos).toBe(400);
    });

    test('readSessionMirror rejects corrupt payloads', () => {
        fake.storage.setItem(SESSION_MIRROR_KEY, '{"version":2}');
        expect(readSessionMirror(fake.storage)).toBeNull();
        fake.storage.setItem(SESSION_MIRROR_KEY, 'no-json');
        expect(readSessionMirror(fake.storage)).toBeNull();
    });

    test('readSessionMirror rejects a journalPath outside mundo/diario/', () => {
        // A hostile/corrupt path would make recoverSession's journal.open()
        // throw AFTER the session flipped active — treat it as no mirror.
        const good = {
            version: 1,
            journalPath: 'mundo/diario/2026-07-12_s01.md',
            sesion: 1,
            fechaReal: TODAY,
            diaInicio: 1,
            startedAt: 1,
            snapshot: { diaMundo: 1, ubicacion: null, rumbo: null, creditos: 0, medidores: {} },
            entries: [],
        };
        fake.storage.setItem(SESSION_MIRROR_KEY, JSON.stringify(good));
        expect(readSessionMirror(fake.storage)).not.toBeNull();
        for (const journalPath of ['mundo/mundo.md', 'mundo/estado/grupo.md', 'diario/x.md']) {
            fake.storage.setItem(SESSION_MIRROR_KEY, JSON.stringify({ ...good, journalPath }));
            expect(readSessionMirror(fake.storage)).toBeNull();
        }
    });
});

// ── writeStatus propagation ─────────────────────────────────────────────────

describe('writeStatus', () => {
    test('estado write failure surfaces denied; retryWrites recovers', async () => {
        actions().startSession([], TODAY);
        fake.failEstado.value = true;
        actions().log(makeEntry.gasto(10, undefined, CLOCK));
        await settle();
        expect(usePartyStore.getState().session.writeStatus).toBe('denied');

        fake.failEstado.value = false;
        actions().retryWrites();
        await settle();
        expect(usePartyStore.getState().session.writeStatus).toBe('ok');
    });

    test('journal denied wins over estado ok', async () => {
        actions().startSession([], TODAY);
        await settle();
        actions().setJournalStatus('denied');
        expect(usePartyStore.getState().session.writeStatus).toBe('denied');
        actions().setJournalStatus('ok');
        expect(usePartyStore.getState().session.writeStatus).toBe('ok');
    });
});

// ── hydrate ─────────────────────────────────────────────────────────────────

describe('hydrate', () => {
    test('loads defaults when estadoGrupo is absent', () => {
        actions().reset();
        actions().setDeps(makeDeps().deps);
        actions().hydrate(makeModel(null));
        const s = usePartyStore.getState();
        expect(s.diaMundo).toBe(1);
        expect(s.creditos).toBe(0);
        expect(s.medidores).toEqual({ viveres: 3, combustible: 3, nave: 3 });
        expect(s.estadoFilePath).toBeNull();
    });

    test('is ignored while a session is active', () => {
        actions().startSession([], TODAY);
        actions().log(makeEntry.gasto(100, undefined, CLOCK));
        actions().hydrate(makeModel(makeEstado({ creditos: 9999 })));
        expect(usePartyStore.getState().creditos).toBe(400);
    });
});

// ── Journal entry type coverage through the store ───────────────────────────

describe('entry application', () => {
    test('descanso and dia advance the world day; nota/pista/sabe/evento are inert', () => {
        actions().startSession([], TODAY);
        actions().log(makeEntry.descanso(2, undefined, CLOCK));
        expect(usePartyStore.getState().diaMundo).toBe(14);
        actions().log(makeEntry.dia(14, 20, undefined, CLOCK));
        expect(usePartyStore.getState().diaMundo).toBe(20);

        const before = usePartyStore.getState();
        actions().log(makeEntry.nota('los jugadores sospechan de Kael', CLOCK));
        actions().log(makeEntry.pista('deuda_kael_zara', 'rumor', 'activa', undefined, CLOCK));
        actions().log(makeEntry.sabe('sitio_sigma', 'desconocido', 'rumoreado', undefined, CLOCK));
        actions().log(makeEntry.evento('viaje_frontera', 'v03', undefined, CLOCK));
        const after = usePartyStore.getState();
        expect(after.diaMundo).toBe(before.diaMundo);
        expect(after.creditos).toBe(before.creditos);
        expect(after.session.entries).toHaveLength(7);

        const journal = fake.journalTexts[fake.journalTexts.length - 1];
        expect(journal).toContain(`- [${HORA}] nota: los jugadores sospechan de Kael`);
        expect(journal).toContain(`- [${HORA}] pista: deuda_kael_zara rumor->activa`);
        expect(journal).toContain(`- [${HORA}] sabe: sitio_sigma desconocido->rumoreado`);
        expect(journal).toContain(`- [${HORA}] evento: viaje_frontera#v03`);
    });
});
