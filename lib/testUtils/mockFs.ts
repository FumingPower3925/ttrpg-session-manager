/**
 * Shared in-memory mock of the File System Access API handles for unit tests.
 * Extends the pattern from sessionScanner.test.ts with write support
 * (getFileHandle({create}), getDirectoryHandle({create}), createWritable).
 *
 * A "tree" is a nested plain object:
 *   - string value  => a file whose text content is that string
 *   - object value  => a subdirectory
 */

export type FileTree = { [name: string]: string | FileTree };

/** Builds an Error whose `.name` matches the real FS Access DOMException. */
function namedError(name: string, message: string): Error {
    const error = new Error(`${name}: ${message}`);
    error.name = name;
    return error;
}

export class MockFileHandle {
    kind = 'file' as const;
    constructor(public name: string, public content: string) {}

    async getFile() {
        const content = this.content;
        return {
            text: async () => content,
        };
    }

    async createWritable() {
        let buffer = '';
        return {
            write: async (data: string) => {
                buffer += data;
            },
            close: async () => {
                // Mirrors the real API: content swaps in atomically on close.
                this.content = buffer;
            },
        };
    }
}

export class MockDirectoryHandle {
    kind = 'directory' as const;
    private children = new Map<string, MockFileHandle | MockDirectoryHandle>();

    constructor(public name: string, tree: FileTree = {}) {
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

    async getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MockDirectoryHandle> {
        const child = this.children.get(name);
        if (child && child.kind === 'directory') return child;
        if (child) throw namedError('TypeMismatchError', `"${name}" is a file in "${this.name}"`);
        if (options?.create) {
            const dir = new MockDirectoryHandle(name);
            this.children.set(name, dir);
            return dir;
        }
        throw namedError('NotFoundError', `directory "${name}" not found in "${this.name}"`);
    }

    async getFileHandle(name: string, options?: { create?: boolean }): Promise<MockFileHandle> {
        const child = this.children.get(name);
        if (child && child.kind === 'file') return child;
        if (child) throw namedError('TypeMismatchError', `"${name}" is a directory in "${this.name}"`);
        if (options?.create) {
            const file = new MockFileHandle(name, '');
            this.children.set(name, file);
            return file;
        }
        throw namedError('NotFoundError', `file "${name}" not found in "${this.name}"`);
    }

    async removeEntry(name: string, _options?: { recursive?: boolean }): Promise<void> {
        // Mirrors FileSystemDirectoryHandle.removeEntry: a missing entry throws
        // a NotFoundError (the app's deleteFile catches it as a no-op).
        if (!this.children.has(name)) {
            throw namedError('NotFoundError', `entry "${name}" not found in "${this.name}"`);
        }
        this.children.delete(name);
    }

    /** Test helper: read a file's content by slash-separated path. */
    readFile(path: string): string | null {
        const parts = path.split('/').filter(Boolean);
        let current: MockFileHandle | MockDirectoryHandle | undefined = this as MockDirectoryHandle;
        for (const part of parts) {
            if (!current || current.kind !== 'directory') return null;
            current = (current as MockDirectoryHandle).children.get(part);
        }
        return current && current.kind === 'file' ? current.content : null;
    }
}

export function makeHandle(name: string, tree: FileTree = {}): FileSystemDirectoryHandle {
    // The mock implements the subset of FileSystemDirectoryHandle the app touches.
    return new MockDirectoryHandle(name, tree) as unknown as FileSystemDirectoryHandle;
}
