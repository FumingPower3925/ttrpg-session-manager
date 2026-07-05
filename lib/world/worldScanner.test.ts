/// <reference types="bun-types" />
import { test, expect, describe, beforeEach } from 'bun:test';
import { makeHandle, FileTree, MockDirectoryHandle } from '@/lib/testUtils/mockFs';
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
  combustible_cada_dias: 4
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
            eventos: {
                'viaje_frontera.md':
                    '---\ncontexto: viaje\nregiones: [frontera]\nsesgos:\n' +
                    '  - {si: combustible<=1, etiquetas: [averia], peso: 2}\n---\n' +
                    '## v01 — Baliza de socorro {peso=3; si=region:frontera; etiquetas=recurso}\n\n' +
                    ':::leer\nUna baliza parpadea en el vacio.\n:::\n\n' +
                    ':::efecto\n- ganancia: 400 | chatarra\n- medidor: combustible -1\n:::\n\n' +
                    '## v02 — Fallo de motor {etiquetas=averia}\n\n:::gm\nTirada de nave CD 17.\n:::\n',
                '_borrador_eventos.md': '---\ncontexto: viaje\n---\n',
            },
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

        // eventos/estado/diario contents never become entities
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
        expect(model.manifest.viaje.combustibleCadaDias).toBe(4);
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

    test('playable place with FLAT multi-act plan/: one Part per acto file, support on the first', async () => {
        const tree = happyTree();
        const mundo = tree.mundo as FileTree;
        const lugares = mundo.lugares as FileTree;
        const porto = lugares.porto_verne as FileTree;
        porto.plan = {
            'acto1_llegada.md': ':::leer\nLlegais.\n:::\n',
            'acto2_el_mapa.md': ':::leer\nEl mapa se ilumina.\n:::\n',
            'acto2b_desvio.md': ':::gm\nInterludio.\n:::\n',
        };

        const model = await scanWorldFolder(makeHandle('campaign', tree));
        const config = (model.entidades.get('porto_verne') as PlaceEntity).playable!;

        // one part per plan file, ordered by filename
        expect(config.parts).toHaveLength(3);
        expect(config.parts.map((p) => p.planFile?.path)).toEqual([
            'mundo/lugares/porto_verne/plan/acto1_llegada.md',
            'mundo/lugares/porto_verne/plan/acto2_el_mapa.md',
            'mundo/lugares/porto_verne/plan/acto2b_desvio.md',
        ]);
        expect(config.parts.map((p) => p.name)).toEqual([
            'Acto1 Llegada',
            'Acto2 el Mapa',
            'Acto2b Desvio',
        ]);
        // support content attaches to the FIRST part only (path-folder convention)
        expect(config.parts[0].supportDocs.map((d) => d.path)).toContain(
            'mundo/lugares/porto_verne/characters/kael.md'
        );
        expect(config.parts[0].bgmPlaylist).toHaveLength(1);
        expect(config.parts[1].supportDocs).toHaveLength(0);
        expect(config.parts[2].bgmPlaylist).toHaveLength(0);
        // no plan file leaked into support docs
        for (const part of config.parts) {
            expect(part.supportDocs.every((d) => !d.path.includes('/plan/'))).toBe(true);
        }
    });

    test('parses eventos/ into model.tablas (M4), outside the entity map', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        expect(model.tablas).toHaveLength(1); // _borrador_eventos.md ignored
        const tabla = model.tablas[0];
        expect(tabla.id).toBe('viaje_frontera');
        expect(tabla.filePath).toBe('mundo/eventos/viaje_frontera.md');
        expect(tabla.contexto).toBe('viaje');
        expect(tabla.regiones).toEqual(['frontera']);
        expect(tabla.sesgos).toEqual([{ si: 'combustible<=1', etiquetas: ['averia'], peso: 2 }]);

        expect(tabla.eventos.map((e) => e.id)).toEqual(['v01', 'v02']);
        const v01 = tabla.eventos[0];
        expect(v01.titulo).toBe('Baliza de socorro');
        expect(v01.peso).toBe(3);
        expect(v01.si).toEqual(['region:frontera']);
        expect(v01.etiquetas).toEqual(['recurso']);
        expect(v01.efectos).toEqual([
            { key: 'ganancia', value: '400 | chatarra' },
            { key: 'medidor', value: 'combustible -1' },
        ]);
        // :::efecto stripped from the cuerpo; the other ::: blocks stay.
        expect(v01.cuerpo).toContain(':::leer');
        expect(v01.cuerpo).not.toContain('efecto');
        expect(tabla.eventos[1].peso).toBe(1);
    });

    test('eventos/ issues surface in model.problemas', async () => {
        const tree = happyTree();
        ((tree.mundo as FileTree).eventos as FileTree)['tabla_rota.md'] =
            '---\ncontexto: viaje\n---\n## x01 — Sabotaje {si=cuando quiera el GM}\n\n## sin encabezado valido\n';
        const model = await scanWorldFolder(makeHandle('campaign', tree));

        expect(model.tablas).toHaveLength(2);
        const rota = model.tablas.find((t) => t.id === 'tabla_rota')!;
        expect(rota.eventos).toHaveLength(1); // bad si keeps the event; bad heading drops it
        const avisos = model.problemas.filter((p) => p.archivo === 'mundo/eventos/tabla_rota.md');
        expect(avisos).toHaveLength(2);
        expect(avisos.every((p) => p.nivel === 'aviso')).toBe(true);
        expect(avisos.some((p) => p.mensaje.includes('Condición no interpretable'))).toBe(true);
        expect(avisos.some((p) => p.mensaje.includes('Encabezado de evento'))).toBe(true);
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

        // 1 manifest + 1 estado/grupo.md + 2 sistemas + 1 faccion + 1 pnj + 2 pistas
        // + 1 trama + 3 lugares + 1 carpeta + 1 tabla de eventos + 1 diario
        const total = 15;
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

        // Filtered by archivo: this tree has no estado/, whose absence adds its own aviso.
        const avisos = model.problemas.filter(
            (p) => p.nivel === 'aviso' && p.archivo === 'mundo/sistemas/fantasma.md'
        );
        expect(avisos).toHaveLength(1);
        expect(avisos[0].mensaje).toContain('huérfana');
    });

    test('no orphan aviso for a desconocido pnj ANCHORED via a resolving ubicacion', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    sistemas: {
                        'base.md': '---\ncoordenadas: {x: 0, y: 0}\nconocimiento: visitado\n---\n',
                    },
                    pnjs: {
                        // forward-seeded NPC: unknown to the party, waiting at a real place
                        'agente_oculto.md':
                            '---\nrol: comodin\nubicacion: base\nconocimiento: desconocido\n---\n',
                        // truly dangling: unknown AND its ubicacion resolves nowhere
                        'sin_ancla.md':
                            '---\nrol: comodin\nubicacion: lugar_inexistente\nconocimiento: desconocido\n---\n',
                    },
                },
            })
        );

        const orphanAvisos = model.problemas.filter((p) => p.mensaje.includes('huérfana'));
        expect(orphanAvisos.map((p) => p.archivo)).toEqual(['mundo/pnjs/sin_ancla.md']);
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
                    'p_falsa.md': '---\nestado: en_curso\nrequisitos: ["combustible<=2"]\n---\n',
                    'p_manual.md':
                        '---\nestado: en_curso\nrequisitos: ["manual: decide el GM"]\n---\n',
                    'p_rota.md': '---\nestado: en_curso\nrequisitos: [si el GM quiere]\n---\n',
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
        // Sin estado/grupo.md las condiciones evalúan contra los defaults
        // (combustible 3): 3 <= 2 es false — ya no degrada a 'manual' (M4).
        expect(accionableOf('p_falsa')).toBe(false);
        expect(accionableOf('p_manual')).toBe('manual'); // requisito manual: -> según GM
        expect(accionableOf('p_rota')).toBe('manual'); // condición no interpretable
        expect(accionableOf('p_rumor')).toBe(false); // estado rumor
        expect(accionableOf('p_resuelta')).toBe(false); // estado terminal
    });

    test('aviso: requisito no interpretable', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', derivationsTree()));

        const avisos = model.problemas.filter(
            (p) => p.nivel === 'aviso' && p.mensaje.includes('Requisito no interpretable')
        );
        expect(avisos).toHaveLength(1);
        expect(avisos[0].archivo).toBe('mundo/pistas/p_rota.md');
        expect(avisos[0].mensaje).toContain('si el GM quiere');
        // manual: entries are for the GM by design — never an aviso
        expect(model.problemas.some((p) => p.archivo === 'mundo/pistas/p_manual.md')).toBe(false);
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
            combustibleCadaDias: 4,
            viveresCadaDias: 4,
        });
        expect(model.manifest.medidores).toEqual(['viveres', 'combustible', 'nave']);
        expect(model.manifest.regiones).toEqual([]);
        expect(model.manifest.calendario.diasPorMes).toBe(30);
    });
});

// ── Migración del knob de combustible (combustible_por_tramo -> _cada_dias) ─

describe('scanWorldFolder — migración combustible_cada_dias', () => {
    function manifestTree(viajeYaml: string): FileTree {
        return {
            mundo: {
                'mundo.md': `---\nnombre: Mig\ncalendario: {era: dG, ano_epoca: 1, dias_por_mes: 30, meses: [Uno]}\nviaje:\n${viajeYaml}\nmedidores: [viveres, combustible, nave]\nregiones: []\n---\n`,
            },
        };
    }

    const legacyAviso = (model: { problemas: { mensaje: string }[] }) =>
        model.problemas.filter((p) => p.mensaje.includes('combustible_por_tramo'));

    test('legacy key only: default cadence + aviso (never mapped numerically)', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', manifestTree('  dias_por_unidad: 1\n  combustible_por_tramo: 1'))
        );
        expect(model.manifest.viaje.combustibleCadaDias).toBe(4);
        const avisos = legacyAviso(model);
        expect(avisos).toHaveLength(1);
        expect(avisos[0].mensaje).toContain('obsoleto');
        expect(avisos[0].mensaje).toContain('(aplicado: 4)');
    });

    test('both keys: combustible_cada_dias wins, still with the aviso', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                manifestTree('  combustible_por_tramo: 1\n  combustible_cada_dias: 6')
            )
        );
        expect(model.manifest.viaje.combustibleCadaDias).toBe(6);
        expect(legacyAviso(model)).toHaveLength(1);
        expect(legacyAviso(model)[0].mensaje).toContain('(aplicado: 6)');
    });

    test('neither key: silent default 4', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', manifestTree('  dias_por_unidad: 1'))
        );
        expect(model.manifest.viaje.combustibleCadaDias).toBe(4);
        expect(legacyAviso(model)).toHaveLength(0);
    });

    test('new key only: parsed, no aviso', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', manifestTree('  combustible_cada_dias: 2'))
        );
        expect(model.manifest.viaje.combustibleCadaDias).toBe(2);
        expect(legacyAviso(model)).toHaveLength(0);
    });
});

// ── Requisitos evaluados contra estado/grupo.md (M4) ────────────────────────

describe('scanWorldFolder — requisitos con estado del grupo', () => {
    function requisitosTree(pistas: Record<string, string>): FileTree {
        return {
            mundo: {
                'mundo.md': FULL_MANIFEST, // regiones: [nucleo, frontera]
                sistemas: {
                    'sys_f.md':
                        '---\ncoordenadas: {x: 0, y: 0}\nregion: frontera\nconocimiento: visitado\n---\n',
                },
                lugares: {
                    'base_f.md':
                        '---\nen: sys_f\nconocimiento: visitado\netiquetas: [pirata]\n---\n',
                },
                pistas,
                estado: {
                    'grupo.md':
                        '---\ndia_mundo: 4200\nubicacion: base_f\ncreditos: 1000\n' +
                        'medidores: {viveres: 3, combustible: 1, nave: 2}\n---\n',
                },
            },
        };
    }

    test('condiciones ciertas -> true; falsas -> false; manual gana a false', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                requisitosTree({
                    'p_ok.md':
                        '---\nestado: activa\nrequisitos: ["creditos>=800", "region:frontera", "combustible<=1"]\n---\n',
                    'p_conjuncion.md':
                        '---\nestado: activa\nrequisitos: ["etiqueta:pirata&dia>=100"]\n---\n',
                    'p_pobre.md': '---\nestado: activa\nrequisitos: ["creditos>=2000"]\n---\n',
                    'p_mixta.md':
                        '---\nestado: activa\nrequisitos: ["creditos>=2000", "manual: decide el GM"]\n---\n',
                    'p_medidor_raro.md':
                        '---\nestado: activa\nrequisitos: ["oxigeno<=2"]\n---\n',
                })
            )
        );
        const accionableOf = (id: string) => (model.entidades.get(id) as Lead).accionable;

        expect(accionableOf('p_ok')).toBe(true);
        expect(accionableOf('p_conjuncion')).toBe(true); // etiquetas del lugar actual + dia_mundo
        expect(accionableOf('p_pobre')).toBe(false);
        expect(accionableOf('p_mixta')).toBe('manual'); // manual/null dominan sobre false
        expect(accionableOf('p_medidor_raro')).toBe('manual'); // medidor desconocido -> null
        // sintaxis correcta: el medidor desconocido NO es un aviso de requisito
        expect(
            model.problemas.some((p) => p.mensaje.includes('Requisito no interpretable'))
        ).toBe(false);
    });
});

// ── Aviso: nombre de medidor con espacios (TODO del verificador M3) ─────────

describe('scanWorldFolder — medidores del manifiesto', () => {
    test('aviso cuando un nombre de medidor contiene espacios', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md':
                        '---\nnombre: Mini\nmedidores: [viveres, celda de energia, nave]\n---\n',
                },
            })
        );

        expect(model.manifest.medidores).toEqual(['viveres', 'celda de energia', 'nave']);
        const avisos = model.problemas.filter((p) =>
            p.mensaje.includes('Nombre de medidor con espacios')
        );
        expect(avisos).toHaveLength(1);
        expect(avisos[0].nivel).toBe('aviso');
        expect(avisos[0].archivo).toBe('mundo/mundo.md');
        expect(avisos[0].mensaje).toContain('"celda de energia"');
    });

    test('sin aviso para nombres sin espacios', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));
        expect(
            model.problemas.some((p) => p.mensaje.includes('Nombre de medidor'))
        ).toBe(false);
    });
});

// ── estado/grupo.md → model.estadoGrupo ─────────────────────────────────────

describe('scanWorldFolder — estado del grupo', () => {
    test('happy tree: estadoGrupo parsed with defaults for missing fields', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        expect(model.estadoGrupo).not.toBeNull();
        expect(model.estadoGrupo!.creditos).toBe(100);
        expect(model.estadoGrupo!.filePath).toBe('mundo/estado/grupo.md');
        expect(model.estadoGrupo!.sesionActiva).toBe(false);
        expect(model.estadoGrupo!.diaMundo).toBe(1);
        expect(model.estadoGrupo!.ubicacion).toBeNull();
        expect(model.estadoGrupo!.medidores).toEqual({ viveres: 3, combustible: 3, nave: 3 });
    });

    test('missing estado/grupo.md: null model field + aviso', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', { mundo: { 'mundo.md': FULL_MANIFEST } })
        );

        expect(model.estadoGrupo).toBeNull();
        const avisos = model.problemas.filter(
            (p) => p.nivel === 'aviso' && p.archivo === 'mundo/estado/grupo.md'
        );
        expect(avisos).toHaveLength(1);
        expect(avisos[0].mensaje).toContain('No se encontró');
    });

    test('dangling ubicacion and rumbo.destino: aviso each, refs kept', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    estado: {
                        'grupo.md':
                            '---\nubicacion: no_existe\nrumbo: {destino: tampoco, llegada_dia: 9}\n---\n',
                    },
                },
            })
        );

        const avisos = model.problemas.filter(
            (p) => p.nivel === 'aviso' && p.archivo === 'mundo/estado/grupo.md'
        );
        expect(avisos).toHaveLength(2);
        expect(avisos[0].mensaje).toContain('"ubicacion"');
        expect(avisos[0].mensaje).toContain('"no_existe"');
        expect(avisos[1].mensaje).toContain('"rumbo.destino"');
        expect(avisos[1].mensaje).toContain('"tampoco"');
        // Degraded load: the refs stay readable for the UI even when dangling.
        expect(model.estadoGrupo!.ubicacion).toBe('no_existe');
        expect(model.estadoGrupo!.rumbo).toEqual({ destino: 'tampoco', llegadaDia: 9 });
    });

    test('resolving ubicacion/rumbo refs produces no avisos', async () => {
        const tree = happyTree();
        (tree.mundo as FileTree).estado = {
            'grupo.md':
                '---\nubicacion: porto_verne\nrumbo: {destino: sistema_kovar, llegada_dia: 12}\n---\n',
        };
        const model = await scanWorldFolder(makeHandle('campaign', tree));

        expect(
            model.problemas.some((p) => p.archivo === 'mundo/estado/grupo.md')
        ).toBe(false);
        expect(model.estadoGrupo!.ubicacion).toBe('porto_verne');
        expect(model.estadoGrupo!.rumbo).toEqual({ destino: 'sistema_kovar', llegadaDia: 12 });
    });

    test('read failure on an existing grupo.md is an error with the cause, not absence', async () => {
        const handle = makeHandle('campaign', {
            mundo: {
                'mundo.md': FULL_MANIFEST,
                estado: { 'grupo.md': '---\ncreditos: 5\n---\n' },
            },
        });
        const root = handle as unknown as MockDirectoryHandle;
        const mundo = await root.getDirectoryHandle('mundo');
        const estado = await mundo.getDirectoryHandle('estado');
        const grupo = await estado.getFileHandle('grupo.md');
        grupo.getFile = async () => {
            throw new Error('NotReadableError: fallo de disco');
        };

        const model = await scanWorldFolder(handle);

        expect(model.estadoGrupo).toBeNull();
        const issues = model.problemas.filter((p) => p.archivo === 'mundo/estado/grupo.md');
        expect(issues).toHaveLength(1);
        expect(issues[0].nivel).toBe('error');
        expect(issues[0].mensaje).toContain('No se pudo leer');
        expect(issues[0].mensaje).toContain('NotReadableError: fallo de disco');
    });
});

// ── diario/ → model.diario + journal overlay (M3) ───────────────────────────

describe('scanWorldFolder — diario', () => {
    const DIARIO_BASE = {
        'mundo.md': FULL_MANIFEST,
        sistemas: {
            'sys.md': '---\ncoordenadas: {x: 0, y: 0}\nconocimiento: visitado\n---\n',
        },
        lugares: {
            'planeta_x.md': '---\nen: sys\nconocimiento: desconocido\n---\n',
            'base_y.md': '---\nen: planeta_x\nconocimiento: desconocido\n---\n',
        },
    };

    function journalFile(fields: {
        sesion: number;
        fecha: string;
        procesado: boolean;
        lines?: string[];
    }): string {
        const body = (fields.lines ?? []).join('\n');
        return `---\ntipo: diario\nsesion: ${fields.sesion}\nfecha_real: ${fields.fecha}\ndia_inicio: 1\ndia_fin: null\nprocesado: ${fields.procesado}\n---\n\n${body}\n`;
    }

    test('parses diario files into model.diario sorted by fecha/sesion', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    ...DIARIO_BASE,
                    diario: {
                        // Names deliberately out of chronological order.
                        'a_2026-07-10_s02.md': journalFile({
                            sesion: 2,
                            fecha: '2026-07-10',
                            procesado: true,
                            lines: ['- [20:00] gasto: 100 | taxi orbital'],
                        }),
                        'z_2026-07-01_s01.md': journalFile({
                            sesion: 1,
                            fecha: '2026-07-01',
                            procesado: true,
                        }),
                    },
                },
            })
        );

        expect(model.diario.map((d) => d.sesion)).toEqual([1, 2]);
        expect(model.diario[1].fechaReal).toBe('2026-07-10');
        expect(model.diario[1].procesado).toBe(true);
        expect(model.diario[1].entradas).toEqual([
            { hora: '20:00', tipo: 'gasto', payload: '100', comentario: 'taxi orbital' },
        ]);
        // journals never become entities
        expect(model.entidades.size).toBe(3);
    });

    test('unprocessed sabe bumps knowledge, never lowers it', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    ...DIARIO_BASE,
                    diario: {
                        '2026-07-01_s01.md': journalFile({
                            sesion: 1,
                            fecha: '2026-07-01',
                            procesado: false,
                            lines: [
                                '- [20:00] sabe: planeta_x desconocido->rumoreado',
                                '- [20:05] sabe: sys visitado->conocido',
                                '- [20:10] sabe: no_existe desconocido->conocido',
                                '- [20:15] sabe: base_y basura',
                            ],
                        }),
                    },
                },
            })
        );

        expect(model.entidades.get('planeta_x')!.conocimiento).toBe('rumoreado');
        // never lowered: sys stays visitado despite the logged ->conocido
        expect(model.entidades.get('sys')!.conocimiento).toBe('visitado');
        // unknown ids and bad payloads are skipped silently
        expect(model.entidades.get('base_y')!.conocimiento).toBe('desconocido');
    });

    test('procesado: true journals do NOT overlay', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    ...DIARIO_BASE,
                    diario: {
                        '2026-07-01_s01.md': journalFile({
                            sesion: 1,
                            fecha: '2026-07-01',
                            procesado: true,
                            lines: ['- [20:00] sabe: planeta_x desconocido->rumoreado'],
                        }),
                    },
                },
            })
        );

        expect(model.entidades.get('planeta_x')!.conocimiento).toBe('desconocido');
    });

    test('unprocessed llegada: destination visitado, ancestors at least conocido', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    ...DIARIO_BASE,
                    diario: {
                        '2026-07-01_s01.md': journalFile({
                            sesion: 1,
                            fecha: '2026-07-01',
                            procesado: false,
                            lines: ['- [21:00] llegada: base_y | dia 5'],
                        }),
                    },
                },
            })
        );

        expect(model.entidades.get('base_y')!.conocimiento).toBe('visitado');
        expect(model.entidades.get('planeta_x')!.conocimiento).toBe('conocido');
        // already above conocido — never lowered
        expect(model.entidades.get('sys')!.conocimiento).toBe('visitado');
    });

    test('overlay runs before accionable derivation and orphan avisos', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    ...DIARIO_BASE,
                    pistas: {
                        'p_x.md': '---\nestado: activa\ndonde: planeta_x\n---\n',
                    },
                    diario: {
                        '2026-07-01_s01.md': journalFile({
                            sesion: 1,
                            fecha: '2026-07-01',
                            procesado: false,
                            lines: ['- [21:00] llegada: base_y | dia 5'],
                        }),
                    },
                },
            })
        );

        // planeta_x became conocido via the journal, so the lead is actionable
        expect((model.entidades.get('p_x') as Lead).accionable).toBe(true);
        expect(
            model.problemas.some((p) => p.mensaje.includes('lugar desconocido'))
        ).toBe(false);
        // and base_y (now visitado) is no longer an orphan candidate
        expect(
            model.problemas.some((p) => p.archivo === 'mundo/lugares/base_y.md')
        ).toBe(false);
    });

    test('stale aviso: unprocessed diario older than the newest one', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    ...DIARIO_BASE,
                    diario: {
                        '2026-07-01_s01.md': journalFile({
                            sesion: 1,
                            fecha: '2026-07-01',
                            procesado: false,
                        }),
                        '2026-07-10_s02.md': journalFile({
                            sesion: 2,
                            fecha: '2026-07-10',
                            procesado: false,
                        }),
                    },
                },
            })
        );

        const stale = model.problemas.filter((p) =>
            p.mensaje.includes('Diario sin procesar')
        );
        // only the OLD unprocessed journal warns; the newest one is the
        // normal "last session awaiting maintenance" state
        expect(stale).toHaveLength(1);
        expect(stale[0].nivel).toBe('aviso');
        expect(stale[0].archivo).toBe('mundo/diario/2026-07-01_s01.md');
    });

    test('tolerant parsing: missing frontmatter falls back to the filename', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    ...DIARIO_BASE,
                    diario: {
                        '2026-07-12_s08.md': '- [18:02] inicio: dia 4128 @ base_y\ngarbage line\n',
                    },
                },
            })
        );

        expect(model.diario).toHaveLength(1);
        const day = model.diario[0];
        expect(day.sesion).toBe(8);
        expect(day.fechaReal).toBe('2026-07-12');
        expect(day.procesado).toBe(false);
        expect(day.diaInicio).toBeNull();
        expect(day.entradas).toHaveLength(1);
        expect(day.entradas[0].tipo).toBe('inicio');
    });
});

// ── musica/ → model.musica (world-level music) ──────────────────────────────

describe('scanWorldFolder — musica', () => {
    /** Minimal world plus a musica/ tree (the manifest keeps avisos small). */
    function musicaTree(musica: FileTree): FileTree {
        return { mundo: { 'mundo.md': FULL_MANIFEST, musica } };
    }

    test('root audio files become the BGM rotation, name-sorted', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', {
                mundo: {
                    'mundo.md': FULL_MANIFEST,
                    // Insertion order is deliberately unsorted.
                    musica: {
                        'viaje_nucleo.mp3': 'mp3-bytes',
                        'ambiente_mundo.ogg': 'ogg-bytes',
                        'viaje_corredor.mp3': 'mp3-bytes',
                    },
                },
            })
        );

        expect(model.musica.bgm.map((t) => t.path)).toEqual([
            'mundo/musica/ambiente_mundo.ogg',
            'mundo/musica/viaje_corredor.mp3',
            'mundo/musica/viaje_nucleo.mp3',
        ]);
        expect(model.musica.bgm.every((t) => t.type === 'audio')).toBe(true);
        expect(model.musica.eventPlaylists).toEqual([]);
    });

    test('subfolders become named event playlists; empty ones are skipped', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                musicaTree({
                    'viaje_nucleo.mp3': 'mp3-bytes',
                    tension: { 'tension_creciente.mp3': 'mp3-bytes' },
                    eventos_generales: {
                        'evento_averia.mp3': 'mp3-bytes',
                        'evento_alto.mp3': 'mp3-bytes',
                    },
                    vacia: {},
                })
            )
        );

        expect(model.musica.eventPlaylists.map((p) => p.id)).toEqual([
            'eventos_generales',
            'tension',
        ]);
        const [eventos, tension] = model.musica.eventPlaylists;
        expect(eventos.name).toBe('Eventos Generales');
        expect(eventos.tracks.map((t) => t.path)).toEqual([
            'mundo/musica/eventos_generales/evento_alto.mp3',
            'mundo/musica/eventos_generales/evento_averia.mp3',
        ]);
        expect(tension.name).toBe('Tension');
        expect(tension.tracks.map((t) => t.path)).toEqual([
            'mundo/musica/tension/tension_creciente.mp3',
        ]);
    });

    test('markdown prompt docs and ignore rules (_ files, _/CAPS dirs) are skipped', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                musicaTree({
                    '_instrucciones.md': '# qué generar y soltar aquí',
                    'notas.md': '# apuntes del GM',
                    '_maqueta.mp3': 'mp3-bytes',
                    'viaje_frontera.mp3': 'mp3-bytes',
                    _borradores: { 'wip.mp3': 'mp3-bytes' },
                    ARCHIVO: { 'vieja.mp3': 'mp3-bytes' },
                    eventos: { 'evento_pecio.mp3': 'mp3-bytes', 'leeme.md': 'doc' },
                })
            )
        );

        expect(model.musica.bgm.map((t) => t.path)).toEqual([
            'mundo/musica/viaje_frontera.mp3',
        ]);
        expect(model.musica.eventPlaylists.map((p) => p.id)).toEqual(['eventos']);
        expect(model.musica.eventPlaylists[0].tracks.map((t) => t.name)).toEqual([
            'evento_pecio.mp3',
        ]);
        // The ignored content produced no diagnostics either.
        expect(model.problemas.some((p) => p.archivo.includes('musica'))).toBe(false);
    });

    test('absent musica/ folder yields empty arrays and NO aviso (optional by design)', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', { mundo: { 'mundo.md': FULL_MANIFEST } })
        );

        expect(model.musica.bgm).toEqual([]);
        expect(model.musica.eventPlaylists).toEqual([]);
        expect(model.problemas.some((p) => p.archivo.includes('musica'))).toBe(false);
        expect(model.problemas.some((p) => p.mensaje.includes('musica'))).toBe(false);
    });
});

// ── Entity profile images (imagenes/) ───────────────────────────────────────

describe('scanWorldFolder — imagenes', () => {
    /** happyTree plus a mundo/imagenes/ folder. */
    function treeWithImages(imagenes: FileTree): FileTree {
        const tree = happyTree();
        (tree.mundo as FileTree).imagenes = imagenes;
        return tree;
    }

    test('attaches imagen by id across entity kinds and extension variety', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                treeWithImages({
                    'porto_verne.png': 'png-bytes',
                    'sistema_verne.webp': 'webp-bytes',
                    'kael_zara.jpeg': 'jpeg-bytes',
                    'consorcio_tetrad.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
                })
            )
        );

        expect(model.entidades.get('porto_verne')?.imagen).toEqual({
            path: 'mundo/imagenes/porto_verne.png',
            name: 'porto_verne.png',
            type: 'image',
        });
        expect(model.entidades.get('sistema_verne')?.imagen?.path).toBe(
            'mundo/imagenes/sistema_verne.webp'
        );
        expect(model.entidades.get('kael_zara')?.imagen?.path).toBe(
            'mundo/imagenes/kael_zara.jpeg'
        );
        expect(model.entidades.get('consorcio_tetrad')?.imagen?.path).toBe(
            'mundo/imagenes/consorcio_tetrad.svg'
        );
        // Entities without a matching file stay imagen-less.
        expect(model.entidades.get('kovar_iii')?.imagen).toBeUndefined();
        // Matching images add zero diagnostics (happyTree's own aviso aside).
        expect(model.problemas.some((p) => p.mensaje.includes('Imagen sin entidad'))).toBe(false);
    });

    test('an image whose basename matches no entity id earns an aviso (probable typo)', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                treeWithImages({
                    'porto_vern.png': 'png-bytes', // typo: missing final e
                })
            )
        );

        const aviso = model.problemas.find((p) => p.mensaje.includes('Imagen sin entidad'));
        expect(aviso).toBeDefined();
        expect(aviso!.nivel).toBe('aviso');
        expect(aviso!.archivo).toBe('mundo/imagenes/porto_vern.png');
        expect(aviso!.mensaje).toContain('"porto_vern.png"');
        expect(model.entidades.get('porto_verne')?.imagen).toBeUndefined();
    });

    test('absent imagenes/ folder yields no imagen and NO aviso (optional by design)', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));

        for (const entity of model.entidades.values()) {
            expect(entity.imagen).toBeUndefined();
        }
        expect(model.problemas.some((p) => p.archivo.includes('imagenes'))).toBe(false);
        expect(model.problemas.some((p) => p.mensaje.includes('Imagen'))).toBe(false);
    });

    test('ignore rules and non-image files apply: no attach, no aviso', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                treeWithImages({
                    '_porto_verne.png': 'png-bytes', // _-prefixed -> ignored
                    'notas.md': '# no es una imagen', // wrong extension -> ignored
                    'porto_verne.txt': 'tampoco', // wrong extension -> ignored
                })
            )
        );

        expect(model.entidades.get('porto_verne')?.imagen).toBeUndefined();
        expect(model.problemas.some((p) => p.archivo.includes('imagenes'))).toBe(false);
    });

    test('duplicate basenames: the first in name-sorted order wins', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                treeWithImages({
                    'porto_verne.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
                    'porto_verne.png': 'png-bytes',
                })
            )
        );

        // getFilesFromDirectory sorts by name: .png < .svg.
        expect(model.entidades.get('porto_verne')?.imagen?.name).toBe('porto_verne.png');
    });
});

// ── Shops (lugares/<place>/tiendas/) → model.tiendas ────────────────────────

describe('scanWorldFolder — tiendas', () => {
    const SHOP_TALLER = `---
tipo: tienda
nombre: Taller de Bracca
pnj: kael_zara
etiquetas: [taller, repuestos]
---
Bracca repara casi cualquier cosa, si le pagas por adelantado.

| articulo | precio | stock | nota |
|---|---|---|---|
| Célula de combustible | 120 | 4 | recargable |
| Kit de reparación | 60 | - | ilimitado |
| Blindaje ligero | 800 | 1 | única unidad |
`;

    /** happyTree with a tiendas/ subfolder inside the porto_verne place folder. */
    function treeWithShops(tiendas: FileTree): FileTree {
        const tree = happyTree();
        ((tree.mundo as FileTree).lugares as FileTree).porto_verne = {
            ...(((tree.mundo as FileTree).lugares as FileTree).porto_verne as FileTree),
            tiendas,
        };
        return tree;
    }

    test('parses a shop with items; prices are numbers, "-" stock is null', async () => {
        const model = await scanWorldFolder(
            makeHandle('campaign', treeWithShops({ 'taller.md': SHOP_TALLER }))
        );

        const shops = model.tiendas.get('porto_verne');
        expect(shops).toBeDefined();
        expect(shops!.length).toBe(1);
        const shop = shops![0];
        expect(shop.id).toBe('taller');
        expect(shop.nombre).toBe('Taller de Bracca');
        expect(shop.pnj).toBe('kael_zara');
        expect(shop.etiquetas).toEqual(['taller', 'repuestos']);
        expect(shop.body).toContain('Bracca repara');
        expect(shop.filePath).toBe('mundo/lugares/porto_verne/tiendas/taller.md');

        expect(shop.items).toEqual([
            { articulo: 'Célula de combustible', precio: 120, stock: 4, nota: 'recargable' },
            { articulo: 'Kit de reparación', precio: 60, stock: null, nota: 'ilimitado' },
            { articulo: 'Blindaje ligero', precio: 800, stock: 1, nota: 'única unidad' },
        ]);
        // precio/stock are real numbers, not strings.
        expect(typeof shop.items[0].precio).toBe('number');
        expect(shop.items[1].stock).toBeNull();
    });

    test('a malformed row earns an aviso and is skipped, not a crash', async () => {
        const badShop = `---
tipo: tienda
nombre: Mercadillo
---
| articulo | precio | stock | nota |
|---|---|---|---|
| Manzana | 5 | 10 | fresca |
| Pera | no-es-numero | 3 | precio roto |
| | 40 | 2 | sin nombre |
| Naranja | 8 | - | ok |
`;
        const model = await scanWorldFolder(
            makeHandle('campaign', treeWithShops({ 'mercadillo.md': badShop }))
        );

        const shop = model.tiendas.get('porto_verne')![0];
        // Only the two well-formed rows survive.
        expect(shop.items.map((i) => i.articulo)).toEqual(['Manzana', 'Naranja']);
        const avisos = model.problemas.filter(
            (p) => p.archivo.includes('mercadillo.md') && p.mensaje.includes('mal formada')
        );
        expect(avisos.length).toBe(2);
        expect(avisos.every((p) => p.nivel === 'aviso')).toBe(true);
    });

    test('multiple shops under one place; a dangling pnj is an aviso', async () => {
        const shopA = `---
tipo: tienda
nombre: Tienda A
pnj: kael_zara
---
| articulo | precio | stock | nota |
|---|---|---|---|
| Cosa | 10 | 1 |  |
`;
        const shopB = `---
tipo: tienda
nombre: Tienda B
pnj: pnj_inexistente
---
| articulo | precio | stock | nota |
|---|---|---|---|
| Otra | 20 | - |  |
`;
        const model = await scanWorldFolder(
            makeHandle('campaign', treeWithShops({ 'a.md': shopA, 'b.md': shopB }))
        );

        const shops = model.tiendas.get('porto_verne')!;
        // listEntries sorts by name: a.md < b.md.
        expect(shops.map((s) => s.id)).toEqual(['a', 'b']);
        const aviso = model.problemas.find(
            (p) => p.archivo.includes('b.md') && p.mensaje.includes('pnj')
        );
        expect(aviso).toBeDefined();
        expect(aviso!.nivel).toBe('aviso');
        // The valid pnj (kael_zara) raises no dangling aviso.
        expect(
            model.problemas.some((p) => p.archivo.includes('a.md') && p.mensaje.includes('pnj'))
        ).toBe(false);
    });

    test('a place without tiendas/ has no shops and no aviso', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));
        expect(model.tiendas.size).toBe(0);
        expect(model.problemas.some((p) => p.archivo.includes('tiendas'))).toBe(false);
    });

    test('tiendas/ ignore rules: _-prefixed shop files are skipped', async () => {
        const model = await scanWorldFolder(
            makeHandle(
                'campaign',
                treeWithShops({ '_borrador.md': SHOP_TALLER, 'real.md': SHOP_TALLER })
            )
        );
        const shops = model.tiendas.get('porto_verne')!;
        expect(shops.map((s) => s.id)).toEqual(['real']);
    });
});

// ── Session recap (mundo/resumen.md) → model.resumen ────────────────────────

describe('scanWorldFolder — resumen', () => {
    test('reads mundo/resumen.md verbatim into model.resumen', async () => {
        const tree = happyTree();
        (tree.mundo as FileTree)['resumen.md'] =
            '# Anteriormente\n\nEl grupo llegó a Porto Verne con la bodega vacía.';
        const model = await scanWorldFolder(makeHandle('campaign', tree));
        expect(model.resumen).toBe(
            '# Anteriormente\n\nEl grupo llegó a Porto Verne con la bodega vacía.'
        );
        // It is never treated as an entity.
        expect(model.entidades.has('resumen')).toBe(false);
    });

    test('absent resumen.md yields null and NO aviso (optional by design)', async () => {
        const model = await scanWorldFolder(makeHandle('campaign', happyTree()));
        expect(model.resumen).toBeNull();
        expect(model.problemas.some((p) => p.archivo.includes('resumen'))).toBe(false);
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
