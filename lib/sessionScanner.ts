import { SessionConfig, Part, FileReference, AudioFile } from '@/types';
import {
    getFileType,
    SUPPORTED_IMAGE_EXTENSIONS,
    SUPPORTED_AUDIO_EXTENSIONS,
    SUPPORTED_MARKDOWN_EXTENSIONS
} from './fileSystem';

/**
 * Expected folder names for auto-detection
 */
const SESSION_FOLDERS = ['characters', 'images', 'maps', 'music', 'plan', 'threats'] as const;

/**
 * Pattern to match act folders (act1, act2, etc.)
 */
const ACT_PATTERN = /^act(\d+)$/i;

/**
 * Checks if a folder structure matches the expected session format
 */
export async function isValidSessionStructure(handle: FileSystemDirectoryHandle): Promise<boolean> {
    try {
        let foundFolders = 0;

        for await (const [name, entryHandle] of handle.entries()) {
            if (entryHandle.kind === 'directory' && SESSION_FOLDERS.includes(name.toLowerCase() as any)) {
                foundFolders++;
            }
        }

        // Require at least 2 of the expected folders
        return foundFolders >= 2;
    } catch {
        return false;
    }
}

/**
 * Detects all act folders across the session structure
 */
export async function detectActs(handle: FileSystemDirectoryHandle): Promise<string[]> {
    const actSet = new Set<string>();

    for await (const [name, entryHandle] of handle.entries()) {
        if (entryHandle.kind !== 'directory') continue;
        if (!SESSION_FOLDERS.includes(name.toLowerCase() as any)) continue;

        const folderHandle = entryHandle as FileSystemDirectoryHandle;

        // Look for act subfolders
        for await (const [subName, subHandle] of folderHandle.entries()) {
            if (subHandle.kind === 'directory' && ACT_PATTERN.test(subName)) {
                actSet.add(subName.toLowerCase());
            }
        }
    }

    // Sort acts by number
    return Array.from(actSet).sort((a, b) => {
        const numA = parseInt(a.match(ACT_PATTERN)?.[1] || '0');
        const numB = parseInt(b.match(ACT_PATTERN)?.[1] || '0');
        return numA - numB;
    });
}

/**
 * Gets all files from a directory with their relative paths
 */
async function getFilesFromDirectory(
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

    // Sort alphabetically
    return files.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Safely gets a subdirectory handle, returning null if not found
 */
async function getSubdirectory(
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
function createFileReference(
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
function createAudioFile(file: { name: string; path: string }): AudioFile {
    return {
        path: file.path,
        name: file.name,
        type: 'audio',
    };
}

/**
 * Detects player character names from the characters/PCs folder
 * The filename (without extension) is used as the PC name
 */
async function detectPlayerCharacters(handle: FileSystemDirectoryHandle): Promise<string[]> {
    const pcsFolder = await getSubdirectory(handle, 'characters', 'PCs');
    if (!pcsFolder) {
        // Also try lowercase
        const pcsLower = await getSubdirectory(handle, 'characters', 'pcs');
        if (!pcsLower) return [];
        return await extractPCNames(pcsLower);
    }
    return await extractPCNames(pcsFolder);
}

/**
 * Extracts PC names from markdown files in a folder
 */
async function extractPCNames(folder: FileSystemDirectoryHandle): Promise<string[]> {
    const pcNames: string[] = [];

    for await (const [name, entryHandle] of folder.entries()) {
        if (entryHandle.kind !== 'file') continue;

        const ext = name.toLowerCase().split('.').pop();
        if (!SUPPORTED_MARKDOWN_EXTENSIONS.includes(ext || '')) continue;

        // Extract name without extension
        const pcName = name.replace(/\.(md|markdown)$/i, '');
        if (pcName) {
            pcNames.push(pcName);
        }
    }

    // Sort alphabetically
    return pcNames.sort((a, b) => a.localeCompare(b));
}

/**
 * Scans a session folder and generates a SessionConfig based on its structure
 */
export async function scanSessionFolder(handle: FileSystemDirectoryHandle): Promise<SessionConfig> {
    const folderName = handle.name;
    const acts = await detectActs(handle);
    const playerCharacters = await detectPlayerCharacters(handle);

    if (acts.length === 0) {
        // No acts found, create a single part with whatever we find
        const part = await scanForSinglePart(handle, 'Part 1');
        return {
            folderName,
            parts: part ? [part] : [],
            playerCharacters,
        };
    }

    // Create a part for each act
    const parts: Part[] = [];

    for (const actName of acts) {
        const actNumber = actName.match(ACT_PATTERN)?.[1] || '1';
        const part = await scanActFolder(handle, actName, `Act ${actNumber}`);
        parts.push(part);
    }

    return {
        folderName,
        parts,
        playerCharacters,
    };
}

/**
 * Scans a specific act folder and creates a Part
 */
async function scanActFolder(
    handle: FileSystemDirectoryHandle,
    actName: string,
    partName: string
): Promise<Part> {
    const part: Part = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: partName,
        planFile: null,
        images: [],
        supportDocs: [],
        bgmPlaylist: [],
        eventPlaylists: [],
    };

    // Scan plan folder
    const planFolder = await getSubdirectory(handle, 'plan', actName);
    if (planFolder) {
        const planFiles = await getFilesFromDirectory(
            planFolder,
            `plan/${actName}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );

        if (planFiles.length > 0) {
            // First file alphabetically is the main plan
            part.planFile = createFileReference(planFiles[0], 'markdown');

            // Rest go to support docs
            for (let i = 1; i < planFiles.length; i++) {
                part.supportDocs.push(createFileReference(planFiles[i], 'markdown'));
            }
        }
    }

    // Scan images folder
    const imagesFolder = await getSubdirectory(handle, 'images', actName);
    if (imagesFolder) {
        const imageFiles = await getFilesFromDirectory(
            imagesFolder,
            `images/${actName}`,
            SUPPORTED_IMAGE_EXTENSIONS
        );
        part.images = imageFiles.map(f => createFileReference(f, 'image'));
    }

    // Scan characters folder
    const charactersFolder = await getSubdirectory(handle, 'characters', actName);
    if (charactersFolder) {
        const characterFiles = await getFilesFromDirectory(
            charactersFolder,
            `characters/${actName}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );
        part.supportDocs.push(...characterFiles.map(f => createFileReference(f, 'markdown')));
    }

    // Scan threats folder
    const threatsFolder = await getSubdirectory(handle, 'threats', actName);
    if (threatsFolder) {
        const threatFiles = await getFilesFromDirectory(
            threatsFolder,
            `threats/${actName}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );
        part.supportDocs.push(...threatFiles.map(f => createFileReference(f, 'markdown')));
    }

    // Scan maps folder
    const mapsFolder = await getSubdirectory(handle, 'maps', actName);
    if (mapsFolder) {
        const mapFiles = await getFilesFromDirectory(
            mapsFolder,
            `maps/${actName}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );
        part.supportDocs.push(...mapFiles.map(f => createFileReference(f, 'markdown')));
    }

    // Scan music folder - files become BGM, subfolders become event playlists
    const musicFolder = await getSubdirectory(handle, 'music', actName);
    if (musicFolder) {
        // Get files directly in the music folder (these are BGM)
        const bgmFiles = await getFilesFromDirectory(
            musicFolder,
            `music/${actName}`,
            SUPPORTED_AUDIO_EXTENSIONS
        );
        part.bgmPlaylist = bgmFiles.map(f => createAudioFile(f));

        // Scan for subfolders (these are event playlists)
        for await (const [subName, subHandle] of musicFolder.entries()) {
            if (subHandle.kind !== 'directory') continue;

            const playlistFolder = subHandle as FileSystemDirectoryHandle;
            const playlistTracks = await getFilesFromDirectory(
                playlistFolder,
                `music/${actName}/${subName}`,
                SUPPORTED_AUDIO_EXTENSIONS
            );

            if (playlistTracks.length > 0) {
                part.eventPlaylists.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    name: subName,
                    tracks: playlistTracks.map(f => createAudioFile(f)),
                });
            }
        }
    }

    return part;
}

/**
 * Fallback: scan top-level folders without act structure
 */
async function scanForSinglePart(
    handle: FileSystemDirectoryHandle,
    partName: string
): Promise<Part | null> {
    const part: Part = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name: partName,
        planFile: null,
        images: [],
        supportDocs: [],
        bgmPlaylist: [],
        eventPlaylists: [],
    };

    let hasContent = false;

    // Check for files directly in expected folders
    for (const folderName of SESSION_FOLDERS) {
        const folder = await getSubdirectory(handle, folderName);
        if (!folder) continue;

        if (folderName === 'plan') {
            const files = await getFilesFromDirectory(folder, folderName, SUPPORTED_MARKDOWN_EXTENSIONS);
            if (files.length > 0) {
                part.planFile = createFileReference(files[0], 'markdown');
                for (let i = 1; i < files.length; i++) {
                    part.supportDocs.push(createFileReference(files[i], 'markdown'));
                }
                hasContent = true;
            }
        } else if (folderName === 'images') {
            const files = await getFilesFromDirectory(folder, folderName, SUPPORTED_IMAGE_EXTENSIONS);
            part.images = files.map(f => createFileReference(f, 'image'));
            if (files.length > 0) hasContent = true;
        } else if (folderName === 'music') {
            const files = await getFilesFromDirectory(folder, folderName, SUPPORTED_AUDIO_EXTENSIONS);
            part.bgmPlaylist = files.map(f => createAudioFile(f));
            if (files.length > 0) hasContent = true;
        } else {
            const files = await getFilesFromDirectory(folder, folderName, SUPPORTED_MARKDOWN_EXTENSIONS);
            part.supportDocs.push(...files.map(f => createFileReference(f, 'markdown')));
            if (files.length > 0) hasContent = true;
        }
    }

    return hasContent ? part : null;
}

/**
 * Gets the expected folder structure as a formatted string for display
 */
export function getExpectedStructure(): string {
    return `session-folder/
├── characters/
│   ├── PCs/                 (optional)
│   │   └── CharacterName.md
│   └── act[N]/
│       └── *.md
├── images/
│   └── act[N]/
│       └── (images)
├── maps/
│   └── act[N]/
│       └── *.md
├── music/
│   └── act[N]/
│       ├── *.mp3            (BGM tracks)
│       └── PlaylistName/    (event playlists)
│           └── *.mp3
├── plan/
│   └── act[N]/
│       └── *.md
└── threats/
    └── act[N]/
        └── *.md`;
}

/**
 * Gets supported file formats for display
 */
export function getSupportedFormats(): { images: string[]; audio: string[]; documents: string[] } {
    return {
        images: [...SUPPORTED_IMAGE_EXTENSIONS],
        audio: [...SUPPORTED_AUDIO_EXTENSIONS],
        documents: [...SUPPORTED_MARKDOWN_EXTENSIONS],
    };
}
