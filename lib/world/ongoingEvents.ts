/**
 * Ongoing-events derivation ("En curso" — feature 1).
 *
 * A drawn event is journaled as an `evento` entry (`<tabla>#<id>` payload) with
 * a comentario carrying its outcome: `resuelto` / `ignorado` / `complicación`
 * (with or without a nota) — or the new `en curso`, which PARKS the event as
 * ongoing rather than closing the thread.
 *
 * The ongoing list is a PURE projection of the session journal: for each event
 * id, only its LATEST comentario matters. The event is ONGOING iff that latest
 * comentario is exactly "en curso"; any other value (resuelto, ignorado,
 * complicación, anything else — including an empty comentario) means the thread
 * is resolved and the event drops off the list. So a fight parked "en curso"
 * and later resolved leaves the ongoing list, and re-parking it puts it back.
 *
 * Ids no longer present in the model (renamed/removed tables or events) are
 * skipped — the ongoing list only ever surfaces reopenable events. Because the
 * derivation reads only the restored session entries, it reconstructs correctly
 * after crash recovery.
 */

import { JournalEntry, EventTable } from '@/types/world';
import { parseEventoPayload } from './logEntries';

/** The exact comentario an "En curso" outcome writes (feature 1 contract). */
export const EN_CURSO_COMENTARIO = 'en curso';

/** One ongoing (parked) event, resolved against the live model. */
export interface OngoingEvent {
    /** Event-table id (`<tabla>` half of the evento payload). */
    tabla: string;
    /** Event id (`<id>` half of the evento payload). */
    id: string;
    /** Display title of the WorldEvent, looked up in the model. */
    titulo: string;
    /** Display name of the table the event belongs to. */
    tablaNombre: string;
    /** Wall-clock HH:MM of the LATEST evento entry that parked it. */
    hora: string;
}

/**
 * Derives the ongoing (parked) events from a session's journal entries.
 *
 * Walks the entries in order keeping, per event id, the latest evento entry;
 * an id whose latest comentario is exactly "en curso" and that still resolves
 * to a WorldEvent in `tablas` becomes an OngoingEvent (carrying that entry's
 * hora). Ids resolved elsewhere / missing from the model are dropped. Result
 * order = first-parked-first (stable insertion order of the latest-per-id map).
 */
export function deriveOngoing(entries: JournalEntry[], tablas: EventTable[]): OngoingEvent[] {
    // Latest evento entry per `<tabla>#<id>` key (later entries overwrite).
    const latest = new Map<string, { tabla: string; id: string; comentario: string; hora: string }>();
    for (const entry of entries) {
        if (entry.tipo !== 'evento') continue;
        const parsed = parseEventoPayload(entry.payload);
        if (!parsed) continue;
        const key = `${parsed.tablaId}#${parsed.eventoId}`;
        latest.set(key, {
            tabla: parsed.tablaId,
            id: parsed.eventoId,
            comentario: (entry.comentario ?? '').trim(),
            hora: entry.hora,
        });
    }

    const ongoing: OngoingEvent[] = [];
    for (const record of latest.values()) {
        if (record.comentario !== EN_CURSO_COMENTARIO) continue;
        const table = tablas.find((t) => t.id === record.tabla);
        const event = table?.eventos.find((e) => e.id === record.id);
        if (!table || !event) continue; // id no longer in the model — not reopenable
        ongoing.push({
            tabla: record.tabla,
            id: record.id,
            titulo: event.titulo,
            tablaNombre: table.nombre,
            hora: record.hora,
        });
    }
    return ongoing;
}
