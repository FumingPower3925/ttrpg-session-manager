/// <reference types="bun-types" />
import { test, expect } from 'bun:test';
import { scanSessionFolder } from './sessionScanner';

/**
 * Minimal in-memory mock of the File System Access API handles, sufficient for the scanner.
 *
 * A "tree" is a nested plain object:
 *   - string value  => a file whose text content is that string
 *   - object value  => a subdirectory
 */
type FileTree = { [name: string]: string | FileTree };

class MockFileHandle {
    kind = 'file' as const;
    constructor(public name: string, private content: string) {}

    async getFile() {
        const content = this.content;
        return {
            text: async () => content,
        };
    }
}

class MockDirectoryHandle {
    kind = 'directory' as const;
    private children = new Map<string, MockFileHandle | MockDirectoryHandle>();

    constructor(public name: string, tree: FileTree) {
        for (const [childName, value] of Object.entries(tree)) {
            if (typeof value === 'string') {
                this.children.set(childName, new MockFileHandle(childName, value));
            } else {
                this.children.set(childName, new MockDirectoryHandle(childName, value));
            }
        }
    }

    async *entries(): AsyncGenerator<[string, MockFileHandle | MockDirectoryHandle]> {
        for (const [name, handle] of this.children) {
            yield [name, handle];
        }
    }

    async getDirectoryHandle(name: string): Promise<MockDirectoryHandle> {
        const child = this.children.get(name);
        if (!child || child.kind !== 'directory') {
            throw new Error(`NotFoundError: directory "${name}" not found in "${this.name}"`);
        }
        return child;
    }

    async getFileHandle(name: string): Promise<MockFileHandle> {
        const child = this.children.get(name);
        if (!child || child.kind !== 'file') {
            throw new Error(`NotFoundError: file "${name}" not found in "${this.name}"`);
        }
        return child;
    }
}

function makeHandle(name: string, tree: FileTree): FileSystemDirectoryHandle {
    // The mock implements the subset of FileSystemDirectoryHandle the scanner touches.
    return new MockDirectoryHandle(name, tree) as unknown as FileSystemDirectoryHandle;
}

test('detects trunk act + branching path folders', async () => {
    const handle = makeHandle('sessionBranch', {
        plan: {
            act1: { 'senal_de_partida.md': '# Act 1' },
            nodeA: { 'a.md': '# A2', 'b.md': '# A3' },
            nodeB: { 'c.md': '# B2' },
        },
        characters: {
            PCs: { 'Hero.md': 'HP 30\nAC 18' },
            act1: { 'villain.md': '# Villain' },
            nodeA: { 'npc.md': '# NodeA NPC' },
        },
    });

    const config = await scanSessionFolder(handle);

    // 1 trunk part + 2 (nodeA) + 1 (nodeB) = 4 parts total.
    expect(config.parts).toHaveLength(4);

    // Trunk part: no pathId.
    const trunkParts = config.parts.filter((p) => p.pathId == null);
    expect(trunkParts).toHaveLength(1);
    const trunk = trunkParts[0];
    expect(trunk.pathId == null).toBe(true);

    // nodeA -> 2 parts, all tagged with pathId "nodeA".
    const nodeAParts = config.parts.filter((p) => p.pathId === 'nodeA');
    expect(nodeAParts).toHaveLength(2);
    // Ordered by plan filename: a.md then b.md.
    expect(nodeAParts[0].planFile?.name).toBe('a.md');
    expect(nodeAParts[1].planFile?.name).toBe('b.md');

    // nodeB -> 1 part.
    const nodeBParts = config.parts.filter((p) => p.pathId === 'nodeB');
    expect(nodeBParts).toHaveLength(1);
    expect(nodeBParts[0].planFile?.name).toBe('c.md');

    // The nodeA npc is a supportDoc on nodeA's FIRST part only.
    expect(nodeAParts[0].supportDocs.map((d) => d.name)).toContain('npc.md');
    expect(nodeAParts[1].supportDocs).toHaveLength(0);

    // config.paths: one PathDef per detected path folder, branching after the trunk part.
    expect(config.paths).toBeDefined();
    expect(config.paths).toHaveLength(2);
    const pathIds = config.paths!.map((p) => p.id).sort();
    expect(pathIds).toEqual(['nodeA', 'nodeB']);
    for (const pathDef of config.paths!) {
        expect(pathDef.branchAfterPartId).toBe(trunk.id);
        expect(pathDef.color).toBeTruthy();
    }

    // activePathId starts null.
    expect(config.activePathId).toBeNull();

    // Trunk part ordering: trunk parts come before any path part.
    const firstPathIndex = config.parts.findIndex((p) => p.pathId != null);
    const lastTrunkIndex = config.parts.map((p) => p.pathId == null).lastIndexOf(true);
    expect(lastTrunkIndex).toBeLessThan(firstPathIndex);
});

test('backward compat: act-only structure produces no paths and no pathId', async () => {
    const handle = makeHandle('sessionLegacy', {
        plan: {
            act1: { 'opening.md': '# Act 1' },
            act2: { 'finale.md': '# Act 2' },
        },
    });

    const config = await scanSessionFolder(handle);

    expect(config.parts).toHaveLength(2);
    for (const part of config.parts) {
        expect(part.pathId == null).toBe(true);
    }
    // paths absent or empty; activePathId absent.
    expect(config.paths == null || config.paths.length === 0).toBe(true);
    expect(config.activePathId == null).toBe(true);
});

test('maps/ splits image battlemaps from markdown maps', async () => {
    const handle = makeHandle('sessionMaps', {
        plan: {
            act1: { 'opening.md': '# Act 1' },
        },
        maps: {
            act1: {
                'ascii_layout.md': '```\n#####\n#...#\n#####\n```',
                'muelle_battlemap.png': 'fake-png-bytes',
                'plaza.jpg': 'fake-jpg-bytes',
            },
        },
    });

    const config = await scanSessionFolder(handle);
    expect(config.parts).toHaveLength(1);
    const [part] = config.parts;

    // Image files -> battlemaps (createFileReference type 'image').
    const battlemapNames = part.battlemaps.map((b) => b.name).sort();
    expect(battlemapNames).toEqual(['muelle_battlemap.png', 'plaza.jpg']);
    for (const bm of part.battlemaps) {
        expect(bm.type).toBe('image');
        expect(bm.path).toBe(`maps/act1/${bm.name}`);
    }

    // Markdown maps still land in supportDocs, NOT battlemaps.
    const docNames = part.supportDocs.map((d) => d.name);
    expect(docNames).toContain('ascii_layout.md');
    expect(part.supportDocs.every((d) => d.type === 'markdown')).toBe(true);
    expect(part.supportDocs.some((d) => d.name.endsWith('.png'))).toBe(false);
});
