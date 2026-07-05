/**
 * Shared File System Access API scanning helpers.
 * Used by sessionScanner (classic session folders) and worldScanner (mundo/ folders).
 */

import { FileReference, AudioFile } from '@/types';

/**
 * Gets all files from a directory with their relative paths
 */
export async function getFilesFromDirectory(
    handle: FileSystemDirectoryHandle,
    basePath: string,
    extensions: readonly string[]
): Promise<Array<{ name: string; path: string }>> {
    const files: Array<{ name: string; path: string }> = [];

    for await (const [name, entryHandle] of handle.entries()) {
        if (entryHandle.kind !== 'file') continue;

        const ext = name.toLowerCase().split('.').pop();
        if (extensions.includes(ext || '')) {
            files.push({
                name,
                path: `${basePath}/${name}`,
            });
        }
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Safely gets a subdirectory handle, returning null if not found
 */
export async function getSubdirectory(
    handle: FileSystemDirectoryHandle,
    ...path: string[]
): Promise<FileSystemDirectoryHandle | null> {
    try {
        let current = handle;
        for (const segment of path) {
            current = await current.getDirectoryHandle(segment);
        }
        return current;
    } catch {
        return null;
    }
}

/**
 * Creates a FileReference from a file entry
 */
export function createFileReference(
    file: { name: string; path: string },
    type: 'markdown' | 'image' | 'audio'
): FileReference {
    return {
        path: file.path,
        name: file.name,
        type,
    };
}

/**
 * Creates an AudioFile from a file entry
 */
export function createAudioFile(file: { name: string; path: string }): AudioFile {
    return {
        path: file.path,
        name: file.name,
        type: 'audio',
    };
}

/**
 * Reads a file's content from a FileSystemFileHandle
 */
export async function readFileContent(fileHandle: FileSystemFileHandle): Promise<string> {
    try {
        const file = await fileHandle.getFile();
        return await file.text();
    } catch {
        return '';
    }
}

/**
 * Converts a file name to a display name.
 * Short words (2 letters or less) stay lowercase unless they're the first word
 */
export function fileNameToDisplayName(fileName: string): string {
    // Remove extension
    const nameWithoutExt = fileName.replace(/\.(md|markdown)$/i, '');
    // Replace underscores with spaces and capitalize words
    const words = nameWithoutExt.replace(/_/g, ' ').split(' ');
    return words
        .map((word, index) => {
            if (index === 0 || word.length > 2) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            return word.toLowerCase();
        })
        .join(' ');
}
