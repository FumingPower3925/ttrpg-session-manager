/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { EventTable, JournalEntry, WorldEvent } from '@/types/world';
import { deriveOngoing } from './ongoingEvents';

function evt(id: string, titulo: string): WorldEvent {
    return { id, titulo, peso: 1, si: [], etiquetas: [], unico: false, cuerpo: '', efectos: [] };
}

function table(id: string, eventos: WorldEvent[]): EventTable {
    return {
        id,
        tipo: 'eventos',
        nombre: id,
        filePath: `mundo/eventos/${id}.md`,
        conocimiento: 'conocido',
        etiquetas: [],
        raw: {},
        body: '',
        contexto: 'estancia',
        regiones: [],
        sesgos: [],
        eventos,
    };
}

/** Minimal evento journal entry (payload `<tabla>#<id>`, comentario = outcome). */
function evento(tabla: string, id: string, comentario: string | undefined, hora = '14:05'): JournalEntry {
    return { hora, tipo: 'evento', payload: `${tabla}#${id}`, comentario };
}

const TABLAS: EventTable[] = [
    table('estancia_porto', [evt('e01', 'Encargo de descarga'), evt('e02', 'Reyerta en el muelle')]),
    table('viaje_nucleo', [evt('v01', 'Control de aduanas')]),
];

describe('deriveOngoing', () => {
    test('en curso => ongoing, resolved states => dropped', () => {
        const entries: JournalEntry[] = [
            evento('estancia_porto', 'e01', 'en curso'),
            evento('estancia_porto', 'e02', 'resuelto'),
            evento('viaje_nucleo', 'v01', 'ignorado'),
        ];
        const ongoing = deriveOngoing(entries, TABLAS);
        expect(ongoing).toHaveLength(1);
        expect(ongoing[0]).toEqual({
            tabla: 'estancia_porto',
            id: 'e01',
            titulo: 'Encargo de descarga',
            tablaNombre: 'estancia_porto',
            hora: '14:05',
        });
    });

    test('latest state per id wins: en curso then resuelto => dropped', () => {
        const entries: JournalEntry[] = [
            evento('estancia_porto', 'e01', 'en curso', '14:00'),
            evento('estancia_porto', 'e01', 'resuelto', '14:30'),
        ];
        expect(deriveOngoing(entries, TABLAS)).toHaveLength(0);
    });

    test('re-parking after a resolution puts it back as ongoing with the latest hora', () => {
        const entries: JournalEntry[] = [
            evento('estancia_porto', 'e01', 'en curso', '14:00'),
            evento('estancia_porto', 'e01', 'resuelto', '14:30'),
            evento('estancia_porto', 'e01', 'en curso', '15:00'),
        ];
        const ongoing = deriveOngoing(entries, TABLAS);
        expect(ongoing).toHaveLength(1);
        expect(ongoing[0].hora).toBe('15:00');
    });

    test('complicación and empty/other comentarios never count as ongoing', () => {
        const entries: JournalEntry[] = [
            evento('estancia_porto', 'e01', 'complicación: fuga'),
            evento('estancia_porto', 'e02', undefined),
            evento('viaje_nucleo', 'v01', 'algo raro'),
        ];
        expect(deriveOngoing(entries, TABLAS)).toHaveLength(0);
    });

    test('ids missing from the model are skipped even when latest is en curso', () => {
        const entries: JournalEntry[] = [
            evento('estancia_porto', 'e01', 'en curso'), // valid
            evento('tabla_borrada', 'x99', 'en curso'), // table gone
            evento('estancia_porto', 'e_removed', 'en curso'), // event gone
        ];
        const ongoing = deriveOngoing(entries, TABLAS);
        expect(ongoing.map((o) => o.id)).toEqual(['e01']);
    });

    test('multiple ongoing events keep first-parked order', () => {
        const entries: JournalEntry[] = [
            evento('viaje_nucleo', 'v01', 'en curso', '10:00'),
            evento('estancia_porto', 'e01', 'en curso', '11:00'),
        ];
        const ongoing = deriveOngoing(entries, TABLAS);
        expect(ongoing.map((o) => o.id)).toEqual(['v01', 'e01']);
    });

    test('non-evento entries and unparseable payloads are ignored', () => {
        const entries: JournalEntry[] = [
            { hora: '09:00', tipo: 'nota', payload: '', comentario: 'una nota' },
            { hora: '09:01', tipo: 'evento', payload: 'sin_almohadilla', comentario: 'en curso' },
            evento('estancia_porto', 'e01', 'en curso'),
        ];
        const ongoing = deriveOngoing(entries, TABLAS);
        expect(ongoing.map((o) => o.id)).toEqual(['e01']);
    });

    test('empty inputs yield an empty list', () => {
        expect(deriveOngoing([], TABLAS)).toEqual([]);
        expect(deriveOngoing([evento('estancia_porto', 'e01', 'en curso')], [])).toEqual([]);
    });
});
