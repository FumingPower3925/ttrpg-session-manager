/**
 * World-mode zustand stores (plan Part B).
 *
 * worldStore — immutable-after-scan world model + scan lifecycle.
 * uiStore — map tier/focus/selection/panel UI state.
 *
 * Headless on purpose: no React imports, so both stores are bun-testable via
 * useXxxStore.getState() without a DOM.
 */

import { create } from 'zustand';
import { WorldModel } from '@/types/world';
import { FileSystemManager } from '@/lib/fileSystem';
import { scanWorldFolder } from './worldScanner';

// ── worldStore ──────────────────────────────────────────────────────────────

export type WorldStatus = 'idle' | 'scanning' | 'ready' | 'error';

export interface ScanProgress {
    done: number;
    total: number;
}

export interface WorldState {
    status: WorldStatus;
    scanProgress: ScanProgress;
    /** Immutable after scan; null until a scan succeeds. */
    model: WorldModel | null;
    /** Bound to the campaign folder handle at scan time; used for later file reads. */
    fs: FileSystemManager | null;
    /** Spanish user-facing message when status === 'error'. */
    error: string | null;
    actions: {
        /** Scans `mundo/` under the campaign folder handle into the store. */
        scan: (handle: FileSystemDirectoryHandle) => Promise<void>;
        reset: () => void;
    };
}

const WORLD_INITIAL = {
    status: 'idle' as WorldStatus,
    scanProgress: { done: 0, total: 0 },
    model: null,
    fs: null,
    error: null,
};

export const useWorldStore = create<WorldState>()((set, get) => ({
    ...WORLD_INITIAL,
    actions: {
        async scan(handle: FileSystemDirectoryHandle) {
            if (get().status === 'scanning') return;

            const fs = new FileSystemManager();
            fs.setDirectoryHandle(handle);
            set({
                status: 'scanning',
                scanProgress: { done: 0, total: 0 },
                model: null,
                fs,
                error: null,
            });

            try {
                const model = await scanWorldFolder(handle, (done, total) => {
                    set({ scanProgress: { done, total } });
                });
                set({ status: 'ready', model, error: null });
            } catch (error) {
                // scanWorldFolder degrades content problems into model.problemas;
                // this guards against infrastructure failures only.
                const detail = error instanceof Error ? error.message : String(error);
                set({
                    status: 'error',
                    model: null,
                    error: `No se pudo abrir el mundo: ${detail}`,
                });
            }
        },
        reset() {
            set({ ...WORLD_INITIAL });
        },
    },
}));

// ── uiStore ─────────────────────────────────────────────────────────────────

export type MapTier = 'sector' | 'system';
export type PanelTab = 'entidad' | 'pistas' | 'diario';

export interface UiState {
    /** Starmap semantic-zoom tier. */
    tier: MapTier;
    /** Sistema focused at the 'system' tier. */
    focusSystemId: string | null;
    selectedEntityId: string | null;
    panelTab: PanelTab;
    mapCollapsed: boolean;
    /** Show desconocido entities as ghosts (toggle off for screen-share). */
    showUnknown: boolean;
    actions: {
        setTier: (tier: MapTier) => void;
        /** Drill into a sistema: sets the focus AND switches to the 'system' tier. */
        focusSystem: (systemId: string) => void;
        /** Back out to the sector tier (keeps the last focus for re-entry). */
        backToSector: () => void;
        selectEntity: (entityId: string | null) => void;
        setPanelTab: (tab: PanelTab) => void;
        setMapCollapsed: (collapsed: boolean) => void;
        setShowUnknown: (show: boolean) => void;
        reset: () => void;
    };
}

const UI_INITIAL = {
    tier: 'sector' as MapTier,
    focusSystemId: null,
    selectedEntityId: null,
    panelTab: 'entidad' as PanelTab,
    mapCollapsed: false,
    showUnknown: true,
};

export const useUiStore = create<UiState>()((set) => ({
    ...UI_INITIAL,
    actions: {
        setTier(tier: MapTier) {
            set({ tier });
        },
        focusSystem(systemId: string) {
            set({ tier: 'system', focusSystemId: systemId });
        },
        backToSector() {
            set({ tier: 'sector' });
        },
        selectEntity(entityId: string | null) {
            set({ selectedEntityId: entityId });
        },
        setPanelTab(tab: PanelTab) {
            set({ panelTab: tab });
        },
        setMapCollapsed(collapsed: boolean) {
            set({ mapCollapsed: collapsed });
        },
        setShowUnknown(show: boolean) {
            set({ showUnknown: show });
        },
        reset() {
            set({ ...UI_INITIAL });
        },
    },
}));
