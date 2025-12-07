import { SessionConfig, Part, FileReference, AudioFile, PlayerCharacterStats } from '@/types';
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
 * Regex patterns for extracting HP from various TTRPG character sheet formats
 * Supports: Pathfinder, Starfinder, D&D, and generic formats
 */
const HP_PATTERNS = [
    // Pathfinder 2e / Starfinder 2e style: "HP 45" or "HP: 45"
    /\bHP\s*[:=]?\s*(\d+)/i,
    // Hit Points explicit: "Hit Points: 45" or "Hit Points 45"
    /\bHit\s+Points\s*[:=]?\s*(\d+)/i,
    // Max HP style: "Max HP: 45" or "Maximum HP: 45"
    /\bMax(?:imum)?\s+HP\s*[:=]?\s*(\d+)/i,
    // Current/Max format: "HP: 45/45" or "HP 45/45" - takes max value
    /\bHP\s*[:=]?\s*\d+\s*\/\s*(\d+)/i,
    // Stamina Points for Starfinder: "SP 30" (also track HP)
    /\bSP\s*[:=]?\s*(\d+)/i,
    // Table row format: "| HP | 45 |"
    /\|\s*HP\s*\|\s*(\d+)\s*\|/i,
    // Markdown bold format: "**HP:** 45" or "**HP** 45"
    /\*\*HP\*\*\s*[:=]?\s*(\d+)/i,
    // Health: "Health: 45"
    /\bHealth\s*[:=]?\s*(\d+)/i,
];

/**
 * Regex patterns for extracting AC/DEF from various TTRPG character sheet formats
 * Supports: AC (Armor Class), DEF (Defense), and various formats
 */
const DEF_PATTERNS = [
    // AC style: "AC 18" or "AC: 18"
    /\bAC\s*[:=]?\s*(\d+)/i,
    // Armor Class explicit: "Armor Class: 18" or "Armor Class 18"
    /\bArmor\s+Class\s*[:=]?\s*(\d+)/i,
    // Defense style: "DEF 18" or "DEF: 18" or "Defense: 18"
    /\bDef(?:ense)?\s*[:=]?\s*(\d+)/i,
    // EAC/KAC for Starfinder 1e: "EAC 15; KAC 17" - takes first (EAC)
    /\bEAC\s*[:=]?\s*(\d+)/i,
    // KAC as fallback for Starfinder 1e
    /\bKAC\s*[:=]?\s*(\d+)/i,
    // Table row format: "| AC | 18 |"
    /\|\s*AC\s*\|\s*(\d+)\s*\|/i,
    // Markdown bold format: "**AC:** 18" or "**AC** 18"
    /\*\*AC\*\*\s*[:=]?\s*(\d+)/i,
    // Defence (British spelling)
    /\bDefence\s*[:=]?\s*(\d+)/i,
];

/**
 * Extracts a numeric stat from content using multiple regex patterns
 */
function extractStat(content: string, patterns: RegExp[]): number | null {
    for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1]) {
            const value = parseInt(match[1], 10);
            if (!isNaN(value) && value > 0) {
                return value;
            }
        }
    }
    return null;
}

/**
 * Reads a file's content from a FileSystemFileHandle
 */
async function readFileContent(fileHandle: FileSystemFileHandle): Promise<string> {
    try {
        const file = await fileHandle.getFile();
        return await file.text();
    } catch {
        return '';
    }
}

/**
 * Extracts player character stats (HP, AC/DEF) from character sheet markdown files
 */
async function extractPCStats(folder: FileSystemDirectoryHandle): Promise<PlayerCharacterStats[]> {
    const stats: PlayerCharacterStats[] = [];

    for await (const [name, entryHandle] of folder.entries()) {
        if (entryHandle.kind !== 'file') continue;

        const ext = name.toLowerCase().split('.').pop();
        if (!SUPPORTED_MARKDOWN_EXTENSIONS.includes(ext || '')) continue;

        // Extract name without extension
        const pcName = name.replace(/\.(md|markdown)$/i, '');
        if (!pcName) continue;

        // Read file content
        const fileHandle = entryHandle as FileSystemFileHandle;
        const content = await readFileContent(fileHandle);

        // Extract stats using regex patterns
        const maxHP = extractStat(content, HP_PATTERNS);
        const defense = extractStat(content, DEF_PATTERNS);

        stats.push({
            name: pcName,
            maxHP,
            defense,
        });
    }

    // Sort alphabetically
    return stats.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Detects player character stats from the characters/PCs folder
 */
async function detectPlayerCharacterStats(handle: FileSystemDirectoryHandle): Promise<PlayerCharacterStats[]> {
    const pcsFolder = await getSubdirectory(handle, 'characters', 'PCs');
    if (!pcsFolder) {
        // Also try lowercase
        const pcsLower = await getSubdirectory(handle, 'characters', 'pcs');
        if (!pcsLower) return [];
        return await extractPCStats(pcsLower);
    }
    return await extractPCStats(pcsFolder);
}

/**
 * Converts a filename to a readable display name
 * Removes extension, replaces underscores with spaces, and capitalizes each word
 * Short words (2 letters or less) stay lowercase unless they're the first word
 */
function fileNameToDisplayName(fileName: string): string {
    // Remove extension
    const nameWithoutExt = fileName.replace(/\.(md|markdown)$/i, '');
    // Replace underscores with spaces and capitalize words
    const words = nameWithoutExt.replace(/_/g, ' ').split(' ');
    return words
        .map((word, index) => {
            // Always capitalize first word, or words longer than 2 characters
            if (index === 0 || word.length > 2) {
                return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
            }
            // Keep short words lowercase
            return word.toLowerCase();
        })
        .join(' ');
}

/**
 * Gets the act display name from the plan file in the act folder
 * Returns null if no plan file is found
 */
async function getActDisplayName(
    handle: FileSystemDirectoryHandle,
    actName: string
): Promise<string | null> {
    const planFolder = await getSubdirectory(handle, 'plan', actName);
    if (!planFolder) return null;

    const planFiles = await getFilesFromDirectory(
        planFolder,
        `plan/${actName}`,
        SUPPORTED_MARKDOWN_EXTENSIONS
    );

    if (planFiles.length === 0) return null;

    // Use the first file's name (alphabetically) as the act display name
    return fileNameToDisplayName(planFiles[0].name);
}

/**
 * Scans a session folder and generates a SessionConfig based on its structure
 */
export async function scanSessionFolder(handle: FileSystemDirectoryHandle): Promise<SessionConfig> {
    const folderName = handle.name;
    const acts = await detectActs(handle);
    const playerCharacters = await detectPlayerCharacters(handle);
    const pcStats = await detectPlayerCharacterStats(handle);

    if (acts.length === 0) {
        // No acts found, create a single part with whatever we find
        const part = await scanForSinglePart(handle, 'Part 1');
        return {
            folderName,
            parts: part ? [part] : [],
            playerCharacters,
            pcStats,
        };
    }

    // Create a part for each act
    const parts: Part[] = [];

    for (const actName of acts) {
        const actNumber = actName.match(ACT_PATTERN)?.[1] || '1';
        // Get the display name from the plan file, fallback to "Act N"
        const displayName = await getActDisplayName(handle, actName) || `Act ${actNumber}`;
        const part = await scanActFolder(handle, actName, displayName);
        parts.push(part);
    }

    return {
        folderName,
        parts,
        playerCharacters,
        pcStats,
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
│       └── act_name.md      (filename → act name, _ → space)
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
