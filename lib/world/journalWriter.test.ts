/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { JournalDay } from '@/types/world';
import { JournalWriter, WriteStatus, nextJournalFile } from './journalWriter';

function day(sesion: number, fechaReal: string, overrides: Partial<JournalDay> = {}): JournalDay {
    return {
        filePath: `mundo/diario/${fechaReal}_s${String(sesion).padStart(2, '0')}.md`,
        sesion,
        fechaReal,
        diaInicio: 1,
        diaFin: null,
        procesado: true,
        entradas: [],
        ...overrides,
    };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

// ── nextJournalFile ─────────────────────────────────────────────────────────

describe('nextJournalFile', () => {
    test('empty world starts at s01', () => {
        expect(nextJournalFile([], '2026-07-12')).toEqual({
            fileName: '2026-07-12_s01.md',
            sesion: 1,
        });
    });

    test('sesion = max + 1, tolerating gaps', () => {
        const existing = [day(2, '2026-06-01'), day(7, '2026-07-01')];
        expect(nextJournalFile(existing, '2026-07-12')).toEqual({
            fileName: '2026-07-12_s08.md',
            sesion: 8,
        });
    });

    test('second session on the same real day gets the next NN', () => {
        const existing = [day(8, '2026-07-12')];
        expect(nextJournalFile(existing, '2026-07-12')).toEqual({
            fileName: '2026-07-12_s09.md',
            sesion: 9,
        });
    });

    test('fallback count + 1 when no journal carries a usable sesion', () => {
        const existing = [day(0, '2026-06-01'), day(Number.NaN, '2026-06-08')];
        expect(nextJournalFile(existing, '2026-07-12')).toEqual({
            fileName: '2026-07-12_s03.md',
            sesion: 3,
        });
    });

    test('NN pads to 2 but grows past 99', () => {
        expect(nextJournalFile([day(99, '2026-07-01')], '2026-07-12').fileName).toBe(
            '2026-07-12_s100.md'
        );
    });
});

// ── JournalWriter queue ─────────────────────────────────────────────────────

interface ManualFs {
    writes: Array<{ path: string; content: string }>;
    writeFile: (path: string, content: string) => Promise<void>;
    /** Resolve (or reject) the oldest unresolved write. */
    settle: (error?: Error) => void;
    pending: () => number;
}

/** writeFile whose promises resolve only when the test says so. */
function manualFs(): ManualFs {
    const writes: Array<{ path: string; content: string }> = [];
    const settlers: Array<{ resolve: () => void; reject: (e: Error) => void }> = [];
    return {
        writes,
        writeFile(path: string, content: string) {
            writes.push({ path, content });
            return new Promise<void>((resolve, reject) => {
                settlers.push({ resolve, reject });
            });
        },
        settle(error?: Error) {
            const settler = settlers.shift();
            if (!settler) throw new Error('no pending write to settle');
            if (error) settler.reject(error);
            else settler.resolve();
        },
        pending: () => settlers.length,
    };
}

describe('JournalWriter — serialized coalescing queue', () => {
    test('open writes immediately', async () => {
        const writes: Array<{ path: string; content: string }> = [];
        const writer = new JournalWriter({
            writeFile: async (path, content) => {
                writes.push({ path, content });
            },
        });
        await writer.open('mundo/diario/2026-07-12_s08.md', 'v0');
        expect(writes).toEqual([{ path: 'mundo/diario/2026-07-12_s08.md', content: 'v0' }]);
        expect(writer.writeStatus).toBe('ok');
    });

    test('burst of rewrites coalesces: only the latest queued text is written next', async () => {
        const fs = manualFs();
        const writer = new JournalWriter({ writeFile: fs.writeFile });

        const opened = writer.open('mundo/diario/2026-07-12_s08.md', 'v0');
        expect(fs.writes.map((w) => w.content)).toEqual(['v0']); // in flight

        writer.rewrite('v1');
        writer.rewrite('v2');
        writer.rewrite('v3');
        expect(writer.writeStatus).toBe('pending');

        fs.settle(); // v0 lands
        await tick();
        // v1/v2 were skipped; v3 is the single follow-up write
        expect(fs.writes.map((w) => w.content)).toEqual(['v0', 'v3']);

        fs.settle(); // v3 lands
        await opened;
        await writer.flush();
        expect(fs.writes.map((w) => w.content)).toEqual(['v0', 'v3']);
        expect(writer.writeStatus).toBe('ok');
        expect(writer.text).toBe('v3');
    });

    test('flush resolves once the queue drains', async () => {
        const fs = manualFs();
        const writer = new JournalWriter({ writeFile: fs.writeFile });
        void writer.open('mundo/diario/x.md', 'v0');
        writer.rewrite('v1');

        let flushed = false;
        const flushPromise = writer.flush().then(() => {
            flushed = true;
        });

        fs.settle();
        await tick();
        expect(flushed).toBe(false); // v1 still in flight
        fs.settle();
        await flushPromise;
        expect(flushed).toBe(true);
        expect(fs.writes.map((w) => w.content)).toEqual(['v0', 'v1']);
    });

    test('flush on an idle writer resolves immediately', async () => {
        const writer = new JournalWriter({ writeFile: async () => {} });
        await writer.flush();
    });

    test('denied on failure, holds the text, retryNow() recovers', async () => {
        let fail = true;
        const written: string[] = [];
        const writer = new JournalWriter({
            writeFile: async (_path, content) => {
                if (fail) {
                    const error = new Error('NotAllowedError');
                    error.name = 'NotAllowedError';
                    throw error;
                }
                written.push(content);
            },
        });
        const statuses: WriteStatus[] = [];
        writer.onStatus((status) => statuses.push(status));

        // open never rejects — the denial surfaces via status instead
        await writer.open('mundo/diario/x.md', 'v0');
        expect(writer.writeStatus).toBe('denied');
        expect(statuses).toEqual(['ok', 'pending', 'denied']);

        // rewrites while denied keep updating the held text without attempts;
        // flush REJECTS while the queue is stalled denied
        writer.rewrite('v1');
        writer.rewrite('v2');
        await expect(writer.flush()).rejects.toThrow('NotAllowedError');
        expect(written).toEqual([]);
        expect(writer.writeStatus).toBe('denied');

        // the user gesture re-attempts the LAST text
        fail = false;
        writer.retryNow();
        await writer.flush();
        expect(written).toEqual(['v2']);
        expect(writer.writeStatus).toBe('ok');
        expect(statuses).toEqual(['ok', 'pending', 'denied', 'pending', 'ok']);
    });

    test('failure mid-queue keeps rewrites that arrived during the failed write', async () => {
        const fs = manualFs();
        const writer = new JournalWriter({ writeFile: fs.writeFile });
        void writer.open('mundo/diario/x.md', 'v0');
        writer.rewrite('v1'); // queued while v0 in flight

        fs.settle(new Error('NotAllowedError')); // v0 write fails
        await tick();
        expect(writer.writeStatus).toBe('denied');

        writer.retryNow();
        await tick();
        fs.settle(); // v1 retry lands
        await writer.flush();
        expect(fs.writes.map((w) => w.content)).toEqual(['v0', 'v1']);
        expect(writer.writeStatus).toBe('ok');
    });

    test('onStatus fires immediately with the current status', () => {
        const writer = new JournalWriter({ writeFile: async () => {} });
        const statuses: WriteStatus[] = [];
        writer.onStatus((status) => statuses.push(status));
        expect(statuses).toEqual(['ok']);
    });
});

describe('JournalWriter — write-surface enforcement', () => {
    const writer = () => new JournalWriter({ writeFile: async () => {} });

    test('open under mundo/diario/ and mundo/estado/ is allowed', async () => {
        await writer().open('mundo/diario/2026-07-12_s08.md', '');
        await writer().open('mundo/estado/grupo.md', '');
    });

    test('open outside the surface throws synchronously', () => {
        expect(() => writer().open('mundo/lugares/porto_verne/lugar.md', 'x')).toThrow(
            'superficie'
        );
        expect(() => writer().open('sesion7/plan/acto1.md', 'x')).toThrow('superficie');
        expect(() => writer().open('diario/x.md', 'x')).toThrow('superficie');
    });

    test('path traversal is rejected even under an allowed prefix', () => {
        expect(() => writer().open('mundo/diario/../../secreto.md', 'x')).toThrow('superficie');
    });

    test('rewrite before open throws', () => {
        expect(() => writer().rewrite('x')).toThrow('antes de open');
    });

    test('custom allowedPrefixes are honored', async () => {
        const custom = new JournalWriter({ writeFile: async () => {} }, ['tmp/']);
        await custom.open('tmp/x.md', '');
        expect(() => custom.open('mundo/diario/x.md', '')).toThrow('superficie');
    });
});

// Crash-mirror coverage lives in lib/world/partyStore.test.ts — the canonical
// SessionMirror (with the session-start snapshot) is owned by the party store.
