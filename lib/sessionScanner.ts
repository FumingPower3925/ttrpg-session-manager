import { SessionConfig, Part, PathDef, FileReference, AudioFile, PlayerCharacterStats } from '@/types';
import {
    getFileType,
    SUPPORTED_IMAGE_EXTENSIONS,
    SUPPORTED_AUDIO_EXTENSIONS,
    SUPPORTED_MARKDOWN_EXTENSIONS
} from './fileSystem';
import {
    getFilesFromDirectory,
    getSubdirectory,
    createFileReference,
    createAudioFile,
    readFileContent,
    fileNameToDisplayName,
} from './fsScanUtils';

/**
 * Expected folder names for auto-detection
 */
const SESSION_FOLDERS = ['characters', 'images', 'maps', 'music', 'plan', 'threats'] as const;

/**
 * Pattern to match act folders (act1, act2, etc.)
 */
const ACT_PATTERN = /^act(\d+)$/i;

/**
 * Reserved subfolder names that are never treated as branching path folders.
 * (PCs/pcs under characters hold player-character sheets, not a story branch.)
 */
const RESERVED_PATH_SUBFOLDERS = new Set(['pcs']);

/**
 * Color palette cycled across detected paths so each branch is visually distinct.
 */
const PATH_COLOR_PALETTE = ['#ef4444', '#3b82f6', '#22c55e', '#a855f7', '#f59e0b', '#ec4899'];

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

        for await (const [subName, subHandle] of folderHandle.entries()) {
            if (subHandle.kind === 'directory' && ACT_PATTERN.test(subName)) {
                actSet.add(subName.toLowerCase());
            }
        }
    }

    return Array.from(actSet).sort((a, b) => {
        const numA = parseInt(a.match(ACT_PATTERN)?.[1] || '0');
        const numB = parseInt(b.match(ACT_PATTERN)?.[1] || '0');
        return numA - numB;
    });
}

/**
 * Detects all branching "path" (node) folders across the session structure.
 *
 * Within each category folder (characters, images, maps, music, plan, threats), any
 * subfolder that is NOT a trunk `act<N>` folder and NOT a reserved folder (PCs/pcs)
 * is considered a branching path. The same path folder name appears across categories.
 *
 * Folder names are returned case-preserved (FileSystemDirectoryHandle is case-sensitive)
 * and de-duplicated by their exact name, sorted alphabetically.
 */
export async function detectPathFolders(handle: FileSystemDirectoryHandle): Promise<string[]> {
    const pathSet = new Set<string>();

    for await (const [name, entryHandle] of handle.entries()) {
        if (entryHandle.kind !== 'directory') continue;

        const categoryLower = name.toLowerCase();
        if (!SESSION_FOLDERS.includes(categoryLower as any)) continue;

        const folderHandle = entryHandle as FileSystemDirectoryHandle;
        const isCharacters = categoryLower === 'characters';

        for await (const [subName, subHandle] of folderHandle.entries()) {
            if (subHandle.kind !== 'directory') continue;
            if (ACT_PATTERN.test(subName)) continue; // trunk act folder
            if (isCharacters && RESERVED_PATH_SUBFOLDERS.has(subName.toLowerCase())) continue; // PCs
            pathSet.add(subName);
        }
    }

    return Array.from(pathSet).sort((a, b) => a.localeCompare(b));
}

/**
 * Produces a human-readable display name for a path folder.
 *
 * Strips a leading branch-marker prefix (nodo/node/path/ruta/camino...) if present, then
 * converts the remainder to a display name. Falls back to the full folder name if stripping
 * the prefix would leave nothing.
 *
 * Examples:
 *   "nodoA_coro_de_vidrio" -> "Coro De Vidrio"
 *   "nodoB"                 -> "Nodob"
 */
function prettifyPathName(folderName: string): string {
    const stripped = folderName.replace(/^(nodo|node|path|ruta|camino)[a-z0-9]*[_-]/i, '');
    if (stripped && stripped !== folderName) {
        const pretty = fileNameToDisplayName(stripped);
        if (pretty) return pretty;
    }
    return fileNameToDisplayName(folderName);
}

/**
 * Detects player character names from the characters/PCs folder
 * The filename (without extension) is used as the PC name
 */
async function detectPlayerCharacters(handle: FileSystemDirectoryHandle): Promise<string[]> {
    const pcsFolder = await getSubdirectory(handle, 'characters', 'PCs');
    if (!pcsFolder) {
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

        const pcName = name.replace(/\.(md|markdown)$/i, '');
        if (pcName) {
            pcNames.push(pcName);
        }
    }

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
 * Extracts player character stats (HP, AC/DEF) from character sheet markdown files
 */
async function extractPCStats(folder: FileSystemDirectoryHandle): Promise<PlayerCharacterStats[]> {
    const stats: PlayerCharacterStats[] = [];

    for await (const [name, entryHandle] of folder.entries()) {
        if (entryHandle.kind !== 'file') continue;

        const ext = name.toLowerCase().split('.').pop();
        if (!SUPPORTED_MARKDOWN_EXTENSIONS.includes(ext || '')) continue;

        const pcName = name.replace(/\.(md|markdown)$/i, '');
        if (!pcName) continue;

        const fileHandle = entryHandle as FileSystemFileHandle;
        const content = await readFileContent(fileHandle);

        const maxHP = extractStat(content, HP_PATTERNS);
        const defense = extractStat(content, DEF_PATTERNS);

        stats.push({
            name: pcName,
            maxHP,
            defense,
        });
    }

    return stats.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Detects player character stats from the characters/PCs folder
 */
async function detectPlayerCharacterStats(handle: FileSystemDirectoryHandle): Promise<PlayerCharacterStats[]> {
    const pcsFolder = await getSubdirectory(handle, 'characters', 'PCs');
    if (!pcsFolder) {
        const pcsLower = await getSubdirectory(handle, 'characters', 'pcs');
        if (!pcsLower) return [];
        return await extractPCStats(pcsLower);
    }
    return await extractPCStats(pcsFolder);
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
    const pathFolders = await detectPathFolders(handle);
    const playerCharacters = await detectPlayerCharacters(handle);
    const pcStats = await detectPlayerCharacterStats(handle);

    // No acts AND no branching paths: fall back to a single flat part (legacy behavior).
    if (acts.length === 0 && pathFolders.length === 0) {
        const part = await scanForSinglePart(handle, 'Part 1');
        return {
            folderName,
            parts: part ? [part] : [],
            playerCharacters,
            pcStats,
        };
    }

    // Trunk parts: one per act folder, in act-number order.
    const parts: Part[] = [];

    for (const actName of acts) {
        const actNumber = actName.match(ACT_PATTERN)?.[1] || '1';
        // Get the display name from the plan file, fallback to "Act N"
        const displayName = await getActDisplayName(handle, actName) || `Act ${actNumber}`;
        const part = await scanActFolder(handle, actName, displayName);
        parts.push(part);
    }

    // No branching paths: byte-identical legacy output (no paths/activePathId, no pathId).
    if (pathFolders.length === 0) {
        return {
            folderName,
            parts,
            playerCharacters,
            pcStats,
        };
    }

    // Branch point is the last trunk part (empty string when there are no trunk parts at all).
    const branchAfterPartId = parts.length > 0 ? parts[parts.length - 1].id : '';

    const paths: PathDef[] = [];

    for (let i = 0; i < pathFolders.length; i++) {
        const pathFolder = pathFolders[i];
        const pathParts = await scanPathFolder(handle, pathFolder);
        parts.push(...pathParts);

        paths.push({
            id: pathFolder,
            name: prettifyPathName(pathFolder),
            branchAfterPartId,
            color: PATH_COLOR_PALETTE[i % PATH_COLOR_PALETTE.length],
        });
    }

    return {
        folderName,
        parts,
        playerCharacters,
        pcStats,
        paths,
        activePathId: null,
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
            part.planFile = createFileReference(planFiles[0], 'markdown');

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

    const musicFolder = await getSubdirectory(handle, 'music', actName);
    if (musicFolder) {
        const bgmFiles = await getFilesFromDirectory(
            musicFolder,
            `music/${actName}`,
            SUPPORTED_AUDIO_EXTENSIONS
        );
        part.bgmPlaylist = bgmFiles.map(f => createAudioFile(f));

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
                    name: fileNameToDisplayName(subName),
                    tracks: playlistTracks.map(f => createAudioFile(f)),
                });
            }
        }
    }

    return part;
}

/**
 * Collects the non-plan support content (characters, threats, maps markdown -> supportDocs;
 * images; music BGM + event playlists) for a given path subfolder. Used to attach a path's
 * shared media to its FIRST Part only, avoiding duplicate search indexing.
 */
async function collectPathSupportContent(
    handle: FileSystemDirectoryHandle,
    pathFolder: string,
    part: Part
): Promise<void> {
    // Images
    const imagesFolder = await getSubdirectory(handle, 'images', pathFolder);
    if (imagesFolder) {
        const imageFiles = await getFilesFromDirectory(
            imagesFolder,
            `images/${pathFolder}`,
            SUPPORTED_IMAGE_EXTENSIONS
        );
        part.images = imageFiles.map(f => createFileReference(f, 'image'));
    }

    // Characters
    const charactersFolder = await getSubdirectory(handle, 'characters', pathFolder);
    if (charactersFolder) {
        const characterFiles = await getFilesFromDirectory(
            charactersFolder,
            `characters/${pathFolder}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );
        part.supportDocs.push(...characterFiles.map(f => createFileReference(f, 'markdown')));
    }

    // Threats
    const threatsFolder = await getSubdirectory(handle, 'threats', pathFolder);
    if (threatsFolder) {
        const threatFiles = await getFilesFromDirectory(
            threatsFolder,
            `threats/${pathFolder}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );
        part.supportDocs.push(...threatFiles.map(f => createFileReference(f, 'markdown')));
    }

    // Maps
    const mapsFolder = await getSubdirectory(handle, 'maps', pathFolder);
    if (mapsFolder) {
        const mapFiles = await getFilesFromDirectory(
            mapsFolder,
            `maps/${pathFolder}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );
        part.supportDocs.push(...mapFiles.map(f => createFileReference(f, 'markdown')));
    }

    // Music (BGM tracks + event playlist subfolders), same logic as scanActFolder
    const musicFolder = await getSubdirectory(handle, 'music', pathFolder);
    if (musicFolder) {
        const bgmFiles = await getFilesFromDirectory(
            musicFolder,
            `music/${pathFolder}`,
            SUPPORTED_AUDIO_EXTENSIONS
        );
        part.bgmPlaylist = bgmFiles.map(f => createAudioFile(f));

        for await (const [subName, subHandle] of musicFolder.entries()) {
            if (subHandle.kind !== 'directory') continue;

            const playlistFolder = subHandle as FileSystemDirectoryHandle;
            const playlistTracks = await getFilesFromDirectory(
                playlistFolder,
                `music/${pathFolder}/${subName}`,
                SUPPORTED_AUDIO_EXTENSIONS
            );

            if (playlistTracks.length > 0) {
                part.eventPlaylists.push({
                    id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                    name: fileNameToDisplayName(subName),
                    tracks: playlistTracks.map(f => createAudioFile(f)),
                });
            }
        }
    }
}

/**
 * Creates an empty Part shell tagged with the given path id.
 */
function createPathPart(name: string, pathId: string): Part {
    return {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        name,
        planFile: null,
        images: [],
        supportDocs: [],
        bgmPlaylist: [],
        eventPlaylists: [],
        pathId,
    };
}

/**
 * Scans a branching path (node) folder and produces its ordered Parts.
 *
 * Each markdown file in plan/<pathFolder>/ becomes ONE Part (ordered by filename). All of the
 * path's support docs/media (characters, threats, maps, images, music) attach to the FIRST Part
 * only, so they are not indexed multiple times. Every Part is tagged with `pathId = pathFolder`.
 *
 * Edge case: if plan/<pathFolder>/ has no markdown but other categories provide content, a single
 * Part (planFile null) is created to hold that support content.
 */
async function scanPathFolder(
    handle: FileSystemDirectoryHandle,
    pathFolder: string
): Promise<Part[]> {
    const parts: Part[] = [];

    const planFolder = await getSubdirectory(handle, 'plan', pathFolder);
    let planFiles: Array<{ name: string; path: string }> = [];
    if (planFolder) {
        planFiles = await getFilesFromDirectory(
            planFolder,
            `plan/${pathFolder}`,
            SUPPORTED_MARKDOWN_EXTENSIONS
        );
    }

    if (planFiles.length > 0) {
        for (const planFile of planFiles) {
            const part = createPathPart(fileNameToDisplayName(planFile.name), pathFolder);
            part.planFile = createFileReference(planFile, 'markdown');
            parts.push(part);
        }
        // Support docs/media attach to the first Part only.
        await collectPathSupportContent(handle, pathFolder, parts[0]);
    } else {
        // No plan markdown: still surface any support content on a single Part.
        const part = createPathPart(prettifyPathName(pathFolder), pathFolder);
        await collectPathSupportContent(handle, pathFolder, part);
        parts.push(part);
    }

    return parts;
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
│   ├── act[N]/             (TRUNK act — shared spine)
│   │   └── *.md
│   └── nodeName/           (PATH/"node" — a branch; same name across categories)
│       └── *.md
├── images/
│   ├── act[N]/
│   │   └── (images)
│   └── nodeName/
│       └── (images)
├── maps/
│   ├── act[N]/
│   │   └── *.md
│   └── nodeName/
│       └── *.md
├── music/
│   ├── act[N]/
│   │   ├── *.mp3            (BGM tracks)
│   │   └── PlaylistName/    (event playlists)
│   │       └── *.mp3
│   └── nodeName/
│       └── *.mp3
├── plan/
│   ├── act[N]/
│   │   └── act_name.md      (filename → act name, _ → space)
│   └── nodeName/            (each plan file = one ACT of this path, ordered by filename)
│       ├── acto2.md
│       └── acto3.md
└── threats/
    ├── act[N]/
    │   └── *.md
    └── nodeName/
        └── *.md

Branching: act[N] folders form the TRUNK (the shared spine). Any other named
subfolder (a "node", e.g. nodoA_coro_de_vidrio) is a branching PATH. Its plan
files are that path's acts; its support docs/media attach to the path's first
act. Paths branch after the last trunk act, and the GM picks one at play time.`;
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
