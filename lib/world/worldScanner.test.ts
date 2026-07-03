/// <reference types="bun-types" />
import { test, expect, describe, beforeEach } from 'bun:test';
import { makeHandle, FileTree } from '@/lib/testUtils/mockFs';
import { hasWorld, scanWorldFolder } from './worldScanner';
import { useWorldStore, useUiStore } from './stores';
import { Lead, PlaceEntity, Trama } from '@/types/world';

// ── Fixtures ────────────────────────────────────────────────────────────────

const FULL_MANIFEST = `---
nombre: Sector Verne
calendario:
  era: dG
  ano_epoca: 1200
  dias_por_mes: 30
  meses: [Alfa, Beta, Gamma]
viaje:
  dias_por_unidad: 2
  intrasistema_dias: 1
  combustible_por_tramo: 1
  viveres_cada_dias: 4
medidores: [viveres, combustible, nave]
regiones: [nucleo, frontera]
---
# Sector Verne
`;

/**
 * Happy path: manifest + 2 sistemas + planet + station-with-en + deep-space nodo
 * + playable lugar folder + faccion + pnj + 2 pistas + trama. Also exercises
 * the ignore rules (_file, ALL-CAPS dir) and M1-skipped dirs.
 */
function happyTree(): FileTree {
    return {
        mundo: {
            'mundo.md': FULL_MANIFEST,
            'PROTOCOLO.md': '# instrucciones del agente',
            PLANTILLAS: { 'lugar.md': '---\ntipo: plantilla\n---\n' },
            sistemas: {
                'sistema_verne.md':
                    '---\ntipo: sistema\nnombre: Sistema Verne\ncoordenadas: {x: 10, y: 20}\nregion: nucleo\nconocimiento: visitado\n---\nSistema natal.\n',
                'sistema_kovar.md':
                    '---\ncoordenadas:\n  x: 40\n  y: 12\nregion: frontera\nconocimiento: conocido\n---\n',
                '_borrador.md': '---\ncoordenadas: {x: 0, y: 0}\n---\n',
            },
            lugares: {
                'kovar_iii.md':
                    '---\ntipo: planeta\nen: sistema_kovar\norbita: 3\nconocimiento: conocido\nservicios: [mercado, casino]\n---\nPlaneta minero.\n',
                'estacion_thal.md':
                    '---\ntipo: estacion\nen: kovar_iii\nconocimiento: rumoreado\nfacciones:\n  - {faccion: consorcio_tetrad, nivel: dominante}\n---\n',
                'nodo_sigma.md':
                    '---\ntipo: nodo\ncoordenadas: {x: 55, y: 60}\nconocimiento: rumoreado\nacceso: portal\n---\n',
                '_apuntes.md': '---\ntipo: nodo\n---\n',
                BOCETOS: { 'idea.md': 'boceto suelto' },
                porto_verne: {
                    'lugar.md':
                        '---\ntipo: estacion\nnombre: Porto Verne\nen: sistema_verne\norbita: 2\nconocimiento: visitado\nservicios: [repostaje, mercado]\n---\nLa base de la campana.\n',
                    plan: {
                        'acto1.md':
                            ':::leer\nLlegais al muelle de atraque.\n:::\n\n:::gm\nNotas del acto.\n:::\n',
                    },
                    characters: { 'kael.md': '# Kael\n\nHP 30, AC 17\n' },
                    music: { 'tema.mp3': 'mp3-bytes' },
                },
            },
            facciones: {
                'consorcio_tetrad.md':
                    '---\nactitud: rival\npoder: 4\nobjetivos: [dominar las rutas]\nconocimiento: conocido\n---\n',
            },
            pnjs: {
                'kael_zara.md':
                    '---\nrol: contacto\nfaccion: consorcio_tetrad\nubicacion: porto_verne\nconocimiento: conocido\n---\n',
            },
            pistas: {
                'deuda_kael.md':
                    '---\nestado: activa\ntrama: la_red_despierta\ndonde: porto_verne\n---\nKael debe algo.\n',
                'rumor_sigma.md': '---\nestado: rumor\n---\n',
            },
            tramas: {
                'la_red_despierta.md':
                    '---\nrol: principal\nestado: activa\nreloj: {actual: 1, max: 6}\nlugares_clave: [porto_verne, nodo_sigma]\nfacciones: [consorcio_tetrad]\n---\n',
            },
            eventos: { 'viaje_frontera.md': '---\ncontexto: viaje\n---\n## v01\n' },
            estado: { 'grupo.md': '---\ncreditos: 100\n---\n' },
            diario: { '2026-07-12_s08.md': '---\nsesion: 8\n---\n' },
        },
    };
}

// ── hasWorld ────────────────────────────────────────────────────────────────

describe('hasWorld', () => {
    test('true when mundo/mundo.md exists', async () => {
        expect(await hasWorld(makeHandle('campaign', happyTree()))).toBe(true);
    });

    test('false without a mundo/ folder', async () => {
        expect(await hasWorld(makeHandle('campaign', { sesion7: {} }))).toBe(false);
    });

    test('false when mundo/ exists but has no manifest', async () => {
        expect(await hasWorld(makeHandle('campaign', { mundo: { sistemas: {} } }))).toBe(false);
    });
});

// ── Happy path ──────────────────────────────────────────────────────────────

describe('scanWorldFolder — happy path', () => {
    test('loads every entity kind and skips ignored/M1 content', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        expect(model.sistemas.map((s) => s.id).sort()).toEqual(['sistema_kovar', 'sistema_verne']);
        expect(model.lugares.map((l) => l.id).sort()).toEqual([
            'estacion_thal',
            'kovar_iii',
            'nodo_sigma',
            'porto_verne',
        ]);
        expect(model.facciones.map((f) => f.id)).toEqual(['consorcio_tetrad']);
        expect(model.pnjs.map((p) => p.id)).toEqual(['kael_zara']);
        expect(model.pistas.map((p) => p.id).sort()).toEqual(['deuda_kael', 'rumor_sigma']);
        expect(model.tramas.map((t) => t.id)).toEqual(['la_red_despierta']);
        expect(model.entidades.size).toBe(11);

        // eventos/estado/diario contents never become entities in M1
        expect(model.entidades.has('viaje_frontera')).toBe(false);
        expect(model.entidades.has('grupo')).toBe(false);

        // ignore rules: _files and ALL-CAPS dirs
        expect(model.entidades.has('_borrador')).toBe(false);
        expect(model.entidades.has('_apuntes')).toBe(false);
        expect(model.problemas.some((p) => p.archivo.includes('BOCETOS'))).toBe(false);
    });

    test('parses the manifest', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        expect(model.manifest.nombre).toBe('Sector Verne');
        expect(model.manifest.calendario.era).toBe('dG');
        expect(model.manifest.calendario.anoEpoca).toBe(1200);
        expect(model.manifest.calendario.meses).toEqual(['Alfa', 'Beta', 'Gamma']);
        expect(model.manifest.viaje.diasPorUnidad).toBe(2);
        expect(model.manifest.viaje.viveresCadaDias).toBe(4);
        expect(model.manifest.medidores).toEqual(['viveres', 'combustible', 'nave']);
        expect(model.manifest.regiones).toEqual(['nucleo', 'frontera']);
    });

    test('parses entity fields (coords, presence, estadoPista/estadoTrama split)', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        const verne = model.sistemas.find((s) => s.id === 'sistema_verne')!;
        expect(verne.coordenadas).toEqual({ x: 10, y: 20 });
        expect(verne.nombre).toBe('Sistema Verne');
        expect(verne.conocimiento).toBe('visitado');

        const kovar = model.entidades.get('sistema_kovar')!;
        expect(kovar.nombre).toBe('Sistema Kovar'); // fallback from filename

        const thal = model.entidades.get('estacion_thal') as PlaceEntity;
        expect(thal.facciones).toEqual([{ faccion: 'consorcio_tetrad', nivel: 'dominante' }]);

        const sigma = model.entidades.get('nodo_sigma') as PlaceEntity;
        expect(sigma.acceso).toBe('portal');
        expect(sigma.coordenadas).toEqual({ x: 55, y: 60 });
        expect(sigma.en).toBeUndefined();

        const pista = model.entidades.get('deuda_kael') as Lead;
        expect(pista.estadoPista).toBe('activa');
        expect(pista.estado).toBeUndefined(); // estado key is the workflow state, not prose
        expect(pista.body).toContain('Kael debe algo.');

        const trama = model.entidades.get('la_red_despierta') as Trama;
        expect(trama.estadoTrama).toBe('activa');
        expect(trama.reloj).toEqual({ actual: 1, max: 6 });
        expect(trama.lugaresClave).toEqual(['porto_verne', 'nodo_sigma']);
    });

    test('only aviso: out-of-vocabulary servicio', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        expect(model.problemas).toHaveLength(1);
        expect(model.problemas[0].nivel).toBe('aviso');
        expect(model.problemas[0].archivo).toBe('mundo/lugares/kovar_iii.md');
        expect(model.problemas[0].mensaje).toContain('"casino"');
    });

    test('playable place: SessionConfig with paths prefixed mundo/lugares/<id>/', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        const porto = model.entidades.get('porto_verne') as PlaceEntity;
        expect(porto.filePath).toBe('mundo/lugares/porto_verne/lugar.md');
        expect(porto.playable).toBeDefined();

        const config = porto.playable!;
        expect(config.folderName).toBe('porto_verne');
        expect(config.parts).toHaveLength(1);
        expect(config.parts[0].planFile?.path).toBe('mundo/lugares/porto_verne/plan/acto1.md');
        expect(config.parts[0].supportDocs.map((d) => d.path)).toContain(
            'mundo/lugares/porto_verne/characters/kael.md'
        );
        expect(config.parts[0].bgmPlaylist.map((t) => t.path)).toEqual([
            'mundo/lugares/porto_verne/music/tema.mp3',
        ]);

        // plain places carry no playable config
        const planet = model.entidades.get('kovar_iii') as PlaceEntity;
        expect(planet.playable).toBeUndefined();
    });

    test('childrenOf: sistemas + deep-space roots, en-chains as children', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        expect(model.childrenOf.get('sistema_verne')).toEqual(['porto_verne']);
        expect(model.childrenOf.get('sistema_kovar')).toEqual(['kovar_iii']);
        expect(model.childrenOf.get('kovar_iii')).toEqual(['estacion_thal']);
        expect(model.childrenOf.get('nodo_sigma')).toEqual([]); // deep-space root
        expect(model.childrenOf.has('porto_verne')).toBe(false); // leaf, not a root
    });

    test('region inheritance walks the en-chain to the nearest ancestor', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        const planet = model.entidades.get('kovar_iii') as PlaceEntity;
        const station = model.entidades.get('estacion_thal') as PlaceEntity;
        const porto = model.entidades.get('porto_verne') as PlaceEntity;
        const sigma = model.entidades.get('nodo_sigma') as PlaceEntity;

        expect(planet.region).toBe('frontera'); // from sistema_kovar
        expect(station.region).toBe('frontera'); // two hops up
        expect(porto.region).toBe('nucleo'); // from sistema_verne
        expect(sigma.region).toBeUndefined(); // root without region
    });

    test('accionable + trama grouping', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        const deuda = model.entidades.get('deuda_kael') as Lead;
        const rumor = model.entidades.get('rumor_sigma') as Lead;
        expect(deuda.accionable).toBe(true); // activa @ lugar visitado, sin requisitos
        expect(rumor.accionable).toBe(false); // estado rumor

        const trama = model.entidades.get('la_red_despierta') as Trama;
        expect(trama.pistas.map((p) => p.id)).toEqual(['deuda_kael']);
    });

    test('reports batched progress up to (total, total)', async () => {
        const calls: Array<[number, number]> = [];
        await scanWorldFolder(makeHandle('campaign', happyTree()), (done, total) => {
            calls.push([done, total]);
        });

        // 1 manifest + 2 sistemas + 1 faccion + 1 pnj + 2 pistas + 1 trama + 3 lugares + 1 carpeta
        const total = 12;
        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0]).toEqual([1, total]);
        expect(calls[calls.length - 1]).toEqual([total, total]);
        for (let i = 1; i < calls.length; i++) {
            expect(calls[i][0]).toBeGreaterThanOrEqual(calls[i - 1][0]);
            expect(calls[i][1]).toBe(total);
        }
    });
});

// ── Validation errors (world still loads) ───────────────────────────────────

describe('scanWorldFolder — validation', () => {
    test('duplicate id across dirs: first wins, second reported', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    sistemas: {
                        'dup.md': '---\ncoordenadas: {x: 1, y: 1}\nconocimiento: conocido\n---\n',
                    },
                    lugares: {
                        'dup.md': '---\ncoordenadas: {x: 2, y: 2}\nconocimiento: conocido\n---\n',
                    },
                },
            })
        );

        const errors = model.problemas.filter((p) => p.nivel === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0].archivo).toBe('mundo/lugares/dup.md');
        expect(errors[0].mensaje).toContain('id duplicado');
        expect(model.entidades.get('dup')!.tipo).toBe('sistema');
        expect(model.lugares).toHaveLength(0);
    });

    test('dangling en ref is an error', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    lugares: {
                        'perdido.md': '---\nen: no_existe\nconocimiento: conocido\n---\n',
                    },
                },
            })
        );

        const errors = model.problemas.filter((p) => p.nivel === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0].mensaje).toContain('"en"');
        expect(errors[0].mensaje).toContain('"no_existe"');
        expect(model.lugares).toHaveLength(1); // still loaded, degraded
    });

    test('sistema without coordenadas: error, entity kept at 0,0', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    sistemas: { 'sin_coords.md': '---\nconocimiento: conocido\n---\n' },
                },
            })
        );

        const errors = model.problemas.filter((p) => p.nivel === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0].mensaje).toBe('Sistema sin coordenadas');
        expect(model.sistemas[0].coordenadas).toEqual({ x: 0, y: 0 });
    });

    test('lugar with neither en nor coordenadas is an error', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    lugares: { 'flotante.md': '---\nconocimiento: conocido\n---\n' },
                },
            })
        );

        const errors = model.problemas.filter((p) => p.nivel === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0].mensaje).toContain('sin "en" ni coordenadas');
    });

    test('lugares/ subfolder without lugar.md: error, no entity', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    lugares: {
                        vacia: { plan: { 'acto1.md': ':::leer\nHola.\n:::\n' } },
                    },
                },
            })
        );

        const errors = model.problemas.filter((p) => p.nivel === 'error');
        expect(errors).toHaveLength(1);
        expect(errors[0].archivo).toBe('mundo/lugares/vacia');
        expect(errors[0].mensaje).toContain('lugar.md');
        expect(model.lugares).toHaveLength(0);
    });

    test('malformed YAML: error reported, world still loads the rest', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    sistemas: {
                        'bueno.md':
                            '---\ncoordenadas: {x: 5, y: 5}\nconocimiento: conocido\n---\n',
                        'roto.md': '---\nnombre: "sin cierre\n---\ncuerpo\n',
                    },
                },
            })
        );

        expect(
            model.problemas.some(
                (p) =>
                    p.nivel === 'error' &&
                    p.archivo === 'mundo/sistemas/roto.md' &&
                    p.mensaje.includes('YAML inválido')
            )
        ).toBe(true);
        // the broken file still yields a degraded entity; the good one is intact
        expect(model.sistemas).toHaveLength(2);
        expect(model.entidades.get('bueno')!.conocimiento).toBe('conocido');
    });

    test('orphan aviso: unreferenced entity with conocimiento desconocido', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    sistemas: {
                        'fantasma.md': '---\ncoordenadas: {x: 9, y: 9}\n---\n',
                    },
                },
            })
        );

        const avisos = model.problemas.filter((p) => p.nivel === 'aviso');
        expect(avisos).toHaveLength(1);
        expect(avisos[0].archivo).toBe('mundo/sistemas/fantasma.md');
        expect(avisos[0].mensaje).toContain('huérfana');
    });

    test('missing mundo/ folder degrades into an error model', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', {}));

        expect(model.problemas.some((p) => p.nivel === 'error')).toBe(true);
        expect(model.entidades.size).toBe(0);
        expect(model.manifest.viaje.diasPorUnidad).toBe(1);
    });
});

// ── Derivations: accionable + manifest defaults ─────────────────────────────

describe('scanWorldFolder — accionable + manifest defaults', () => {
    function derivationsTree(): FileTree {
        return {
            mundo: {
                'mundo.md': '---\nnombre: Mini\n---\n',
                sistemas: {
                    'sys.md': '---\ncoordenadas: {x: 0, y: 0}\nconocimiento: visitado\n---\n',
                },
                lugares: {
                    'sitio_conocido.md': '---\nen: sys\nconocimiento: conocido\n---\n',
                    'sitio_oculto.md': '---\nen: sys\nconocimiento: desconocido\n---\n',
                },
                pistas: {
                    'p_activa.md': '---\nestado: activa\ndonde: sitio_conocido\n---\n',
                    'p_oculta.md': '---\nestado: activa\ndonde: sitio_oculto\n---\n',
                    'p_manual.md': '---\nestado: en_curso\nrequisitos: [combustible<=2]\n---\n',
                    'p_rumor.md': '---\nestado: rumor\n---\n',
                    'p_resuelta.md': '---\nestado: resuelta\ndonde: sitio_conocido\n---\n',
                },
            },
        };
    }

    test('accionable derivation per estado/donde/requisitos', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', derivationsTree()));
        const accionableOf = (id: string) => (model.entidades.get(id) as Lead).accionable;

        expect(accionableOf('p_activa')).toBe(true); // activa @ conocido
        expect(accionableOf('p_oculta')).toBe(false); // donde desconocido
        expect(accionableOf('p_manual')).toBe('manual'); // requisitos -> según GM (evalCondition llega en M4)
        expect(accionableOf('p_rumor')).toBe(false); // estado rumor
        expect(accionableOf('p_resuelta')).toBe(false); // estado terminal
    });

    test('aviso: pista activa at a desconocido place', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', derivationsTree()));

        expect(
            model.problemas.some(
                (p) =>
                    p.nivel === 'aviso' &&
                    p.archivo === 'mundo/pistas/p_oculta.md' &&
                    p.mensaje.includes('sitio_oculto')
            )
        ).toBe(true);
    });

    test('missing manifest fields: one aviso each + defaults applied', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', derivationsTree()));

        const manifestAvisos = model.problemas.filter(
            (p) => p.archivo === 'mundo/mundo.md' && p.nivel === 'aviso'
        );
        expect(manifestAvisos.map((p) => p.mensaje).sort()).toEqual([
            'Falta "calendario" en el manifiesto — se usa el valor por defecto',
            'Falta "medidores" en el manifiesto — se usa el valor por defecto',
            'Falta "regiones" en el manifiesto — se usa el valor por defecto',
            'Falta "viaje" en el manifiesto — se usa el valor por defecto',
        ]);
        expect(model.manifest.nombre).toBe('Mini');
        expect(model.manifest.viaje).toEqual({
            diasPorUnidad: 1,
            intrasistemaDias: 1,
            combustiblePorTramo: 1,
            viveresCadaDias: 4,
        });
        expect(model.manifest.medidores).toEqual(['viveres', 'combustible', 'nave']);
        expect(model.manifest.regiones).toEqual([]);
        expect(model.manifest.calendario.diasPorMes).toBe(30);
    });
});

// ── Stores (headless zustand) ───────────────────────────────────────────────

describe('worldStore', () => {
    beforeEach(() => {
        useWorldStore.getState().actions.reset();
    });

    test('scan: idle -> scanning -> ready with model + fs + progress', async () => {
        const store = useWorldStore;
        expect(store.getState().status).toBe('idle');

        const promise = store.getState().actions.scan(makeHandle('campaign', happyTree()));
        expect(store.getState().status).toBe('scanning');
        await promise;

        const state = store.getState();
        expect(state.status).toBe('ready');
        expect(state.error).toBeNull();
        expect(state.model).not.toBeNull();
        expect(state.model!.entidades.size).toBe(11);
        expect(state.fs).not.toBeNull();
        expect(state.scanProgress.total).toBeGreaterThan(0);
        expect(state.scanProgress.done).toBe(state.scanProgress.total);
    });

    test('reset returns to the initial state', async () => {
        await useWorldStore.getState().actions.scan(makeHandle('campaign', happyTree()));
        useWorldStore.getState().actions.reset();

        const state = useWorldStore.getState();
        expect(state.status).toBe('idle');
        expect(state.model).toBeNull();
        expect(state.fs).toBeNull();
        expect(state.scanProgress).toEqual({ done: 0, total: 0 });
    });
});

describe('uiStore', () => {
    beforeEach(() => {
        useUiStore.getState().actions.reset();
    });

    test('defaults', () => {
        const state = useUiStore.getState();
        expect(state.tier).toBe('sector');
        expect(state.focusSystemId).toBeNull();
        expect(state.selectedEntityId).toBeNull();
        expect(state.panelTab).toBe('entidad');
        expect(state.mapCollapsed).toBe(false);
        expect(state.showUnknown).toBe(true);
    });

    test('focusSystem drills in; backToSector keeps the focus', () => {
        const { actions } = useUiStore.getState();
        actions.focusSystem('sistema_verne');
        expect(useUiStore.getState().tier).toBe('system');
        expect(useUiStore.getState().focusSystemId).toBe('sistema_verne');

        actions.backToSector();
        expect(useUiStore.getState().tier).toBe('sector');
        expect(useUiStore.getState().focusSystemId).toBe('sistema_verne');
    });

    test('selection, panel tab and toggles', () => {
        const { actions } = useUiStore.getState();
        actions.selectEntity('porto_verne');
        actions.setPanelTab('pistas');
        actions.setMapCollapsed(true);
        actions.setShowUnknown(false);

        const state = useUiStore.getState();
        expect(state.selectedEntityId).toBe('porto_verne');
        expect(state.panelTab).toBe('pistas');
        expect(state.mapCollapsed).toBe(true);
        expect(state.showUnknown).toBe(false);

        actions.reset();
        expect(useUiStore.getState().selectedEntityId).toBeNull();
        expect(useUiStore.getState().showUnknown).toBe(true);
    });
});
