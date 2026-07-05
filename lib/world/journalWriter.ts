/**
 * Serialized journal write queue (M3, plan Part B).
 *
 * The session's full journal text lives in memory and is FULL-REWRITTEN on
 * every change through a single-consumer async queue (append == undo == same
 * path; the FS Access API has no true append and journals stay <100 KB).
 * Bursts coalesce: while a write is in flight only the LATEST queued text is
 * written next — intermediate versions are skipped.
 *
 * Failure model: a failed write keeps the pending text, flips the status to
 * 'denied' and stalls the queue until retryNow() is called from a user
 * gesture (Chrome may require one to re-grant write permission). flush()
 * rejects while the queue is stalled; open() and retryNow() never reject —
 * they report through the status callback and are safe to fire-and-forget.
 *
 * Write-surface rule (plan Part A): during a session the app writes ONLY
 * under `mundo/diario/` and `mundo/estado/` — enforced here in code.
 *
 * Crash safety lives in the party store (lib/world/stores.ts): its
 * SessionMirror carries the session-start snapshot needed for replay, so the
 * writer itself mirrors nothing.
 */

import { JournalDay } from '@/types/world';

export type WriteStatus = 'ok' | 'pending' | 'denied';

export interface JournalWriterDeps {
    /** e.g. FileSystemManager.writeTextFile bound to the campaign folder. */
    writeFile: (path: string, content: string) => Promise<void>;
}

/** The only paths the app may write while a session is active. */
export const DEFAULT_WRITE_PREFIXES: readonly string[] = ['mundo/diario/', 'mundo/estado/'];

// ── nextJournalFile ─────────────────────────────────────────────────────────

/**
 * Names the next journal file for a session on `fechaReal` (YYYY-MM-DD):
 * sesion = max existing sesion + 1 (fallback count + 1 when no journal
 * carries a usable number); file name `AAAA-MM-DD_sNN.md`, NN zero-padded
 * to 2. A second session on the same real day simply gets the next NN.
 */
export function nextJournalFile(
    existing: JournalDay[],
    fechaReal: string
): { fileName: string; sesion: number } {
    let max = 0;
    for (const day of existing) {
        if (Number.isFinite(day.sesion) && day.sesion > max) max = day.sesion;
    }
    const sesion = max > 0 ? max + 1 : existing.length + 1;
    const nn = String(sesion).padStart(2, '0');
    return { fileName: `${fechaReal}_s${nn}.md`, sesion };
}

// ── JournalWriter ───────────────────────────────────────────────────────────

export class JournalWriter {
    private readonly deps: JournalWriterDeps;
    private readonly allowedPrefixes: readonly string[];

    private path: string | null = null;
    /** Latest full text the file should hold (the coalescing "queue of one"). */
    private desiredText = '';
    /** True when desiredText has not been persisted yet. */
    private dirty = false;
    /** True while a writeFile call is in flight. */
    private busy = false;
    private status: WriteStatus = 'ok';
    private statusCb: ((status: WriteStatus) => void) | null = null;
    private lastError: unknown = null;
    private flushWaiters: Array<{ resolve: () => void; reject: (error: unknown) => void }> = [];

    constructor(deps: JournalWriterDeps, allowedPrefixes: readonly string[] = DEFAULT_WRITE_PREFIXES) {
        this.deps = deps;
        this.allowedPrefixes = allowedPrefixes;
    }

    /** Current in-memory journal text (what the file holds or will hold). */
    get text(): string {
        return this.desiredText;
    }

    get writeStatus(): WriteStatus {
        return this.status;
    }

    /**
     * Registers the status listener (ok | pending | denied) and immediately
     * fires it with the current status; afterwards it fires on every change.
     */
    onStatus(cb: (status: WriteStatus) => void): void {
        this.statusCb = cb;
        cb(this.status);
    }

    /**
     * Binds the writer to a journal file and writes the initial text
     * immediately. Throws synchronously when the path is outside the allowed
     * write surface. The returned promise NEVER rejects (open is safe to
     * fire-and-forget): a denied first write is reported via onStatus /
     * writeStatus, with the text held for retryNow().
     */
    open(filePath: string, initialText: string): Promise<void> {
        this.assertAllowed(filePath);
        this.path = filePath;
        this.desiredText = initialText;
        this.dirty = true;
        this.pump();
        return this.flush().catch(() => undefined);
    }

    /**
     * Enqueues a full-rewrite. Coalesces: with a write in flight, repeated
     * calls just replace the queued text — only the latest is written next.
     * While denied, the text is retained but nothing is attempted until
     * retryNow(). Throws before open() or on a path violation.
     */
    rewrite(fullText: string): void {
        if (this.path === null) {
            throw new Error('JournalWriter.rewrite() llamado antes de open()');
        }
        this.desiredText = fullText;
        this.dirty = true;
        this.pump();
    }

    /**
     * Re-attempts the last text after a denial (call from a user gesture).
     * Fire-and-forget: the outcome is reported via onStatus/writeStatus (and
     * observable through flush()).
     */
    retryNow(): void {
        this.pump(true);
    }

    /**
     * Resolves once everything is persisted (queue drained, status 'ok').
     * REJECTS with the underlying write error when the queue stalls denied
     * with unpersisted text — callers decide (e.g. endSession keeps the
     * session open and offers retryNow()).
     */
    flush(): Promise<void> {
        if (!this.busy) {
            if (!this.dirty) return Promise.resolve();
            if (this.status === 'denied') {
                return Promise.reject(this.lastError ?? new Error('Escritura denegada'));
            }
        }
        return new Promise((resolve, reject) => {
            this.flushWaiters.push({ resolve, reject });
        });
    }

    private assertAllowed(path: string): void {
        const fueraDeSuperficie =
            !this.allowedPrefixes.some((prefix) => path.startsWith(prefix)) ||
            path.split('/').includes('..');
        if (fueraDeSuperficie) {
            throw new Error(
                `Escritura fuera de la superficie permitida (${this.allowedPrefixes.join(', ')}): ${path}`
            );
        }
    }

    private setStatus(status: WriteStatus): void {
        if (status === this.status) return;
        this.status = status;
        this.statusCb?.(status);
    }

    private releaseWaiters(error?: unknown): void {
        const waiters = this.flushWaiters;
        this.flushWaiters = [];
        for (const waiter of waiters) {
            if (error === undefined) waiter.resolve();
            else waiter.reject(error);
        }
    }

    /** Starts the consumer if there is work; denied stalls unless forced. */
    private pump(force = false): void {
        if (this.busy || !this.dirty) return;
        if (this.status === 'denied' && !force) return;
        void this.run();
    }

    private async run(): Promise<void> {
        this.busy = true;
        this.setStatus('pending');
        while (this.dirty) {
            this.dirty = false;
            const text = this.desiredText;
            try {
                await this.deps.writeFile(this.path!, text);
            } catch (error) {
                // Keep the text (latest wins, incl. rewrites during the failed
                // attempt) and stall until retryNow() — a NotAllowedError needs
                // a user gesture to re-request permission.
                this.dirty = true;
                this.busy = false;
                this.lastError = error ?? new Error('Escritura denegada');
                this.setStatus('denied');
                this.releaseWaiters(this.lastError);
                return;
            }
        }
        this.busy = false;
        this.setStatus('ok');
        this.releaseWaiters();
    }
}
