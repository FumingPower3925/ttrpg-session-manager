/// <reference types="bun-types" />
import { test, expect, describe } from 'bun:test';
import { FileSystemManager } from './fileSystem';
import { makeHandle, MockDirectoryHandle } from './testUtils/mockFs';

function managerFor(tree: Parameters<typeof makeHandle>[1]): {
    fsm: FileSystemManager;
    root: MockDirectoryHandle;
} {
    const handle = makeHandle('campaign', tree);
    const fsm = new FileSystemManager();
    fsm.setDirectoryHandle(handle);
    return { fsm, root: handle as unknown as MockDirectoryHandle };
}

describe('writeTextFile', () => {
    test('creates intermediate directories and writes content', async () => {
        const { fsm, root } = managerFor({ mundo: {} });

        await fsm.writeTextFile('mundo/diario/2026-07-12_s08.md', '- [18:02] inicio: dia 4127 @ porto_verne\n');

        expect(root.readFile('mundo/diario/2026-07-12_s08.md')).toBe(
            '- [18:02] inicio: dia 4127 @ porto_verne\n'
        );
    });

    test('overwrites an existing file completely (full-rewrite semantics)', async () => {
        const { fsm, root } = managerFor({
            mundo: { estado: { 'grupo.md': 'old content that is much longer than the new one' } },
        });

        await fsm.writeTextFile('mundo/estado/grupo.md', 'new');

        expect(root.readFile('mundo/estado/grupo.md')).toBe('new');
    });

    test('throws without a directory selected', async () => {
        const fsm = new FileSystemManager();
        await expect(fsm.writeTextFile('a.md', 'x')).rejects.toThrow('No directory selected');
    });
});

describe('exists', () => {
    const tree = {
        mundo: {
            'mundo.md': '---\ntipo: mundo\n---\n',
            diario: {},
        },
    };

    test('finds files and directories', async () => {
        const { fsm } = managerFor(tree);
        expect(await fsm.exists('mundo/mundo.md')).toBe(true);
        expect(await fsm.exists('mundo/diario')).toBe(true);
        expect(await fsm.exists('mundo')).toBe(true);
    });

    test('misses absent paths without throwing', async () => {
        const { fsm } = managerFor(tree);
        expect(await fsm.exists('mundo/estado/grupo.md')).toBe(false);
        expect(await fsm.exists('nope')).toBe(false);
    });

    test('false without a directory selected', async () => {
        const fsm = new FileSystemManager();
        expect(await fsm.exists('mundo')).toBe(false);
    });
});

describe('readTextFile round-trip', () => {
    test('reads back what was written', async () => {
        const { fsm } = managerFor({ mundo: {} });
        const text = '---\nsesion: 8\nprocesado: false\n---\n- [18:02] inicio: dia 4127 @ porto_verne\n';
        await fsm.writeTextFile('mundo/diario/x.md', text);
        expect(await fsm.readTextFile('mundo/diario/x.md')).toBe(text);
    });
});
