/**
 * In-memory `mundo/` campaign fixture for world-mode e2e tests.
 *
 * The tree is materialized into OPFS by e2e/helpers/opfs.ts and opened by the
 * app through the window.__ttrpgWorldTest seam (contract documented there).
 *
 * Deliberate contents (what each entry exercises):
 *   - 3 systems with the three knowledge extremes (visitado/rumoreado/desconocido)
 *     plus 1 deep-space node with own coords  -> 4 sector-tier map nodes.
 *   - porto_verne/ is a PLAYABLE place folder (lugar.md + plan/characters/music).
 *   - torre_korinth is a CHILD of porto_verne (en: porto_verne) with NO poi
 *     coords, so porto_verne stays the non-spatial SiteList tier (tier 3) —
 *     the Plano fallback + regression case.
 *   - mercado_de_brasa (in sistema_kessler) has TWO poi-coord children
 *     (rampa_carga {30,70}, sala_franca {72,40}) so it renders the SPATIAL
 *     Plano tier (data-tier="place"); an EXTRA child (trastienda) carries NO
 *     poi to exercise the "sin ubicar" dashed ring.
 *   - tramas/: `deudas` (secundaria, 1 pista at porto_verne) plus `contrabando`
 *     (principal, lugares_clave porto_verne + mercado_de_brasa, 2 pistas whose
 *     donde resolve to DIFFERENT sector roots — sistema_verne + sistema_kessler)
 *     so the Hilos thread web has >=2 map points to connect.
 *   - PLANTILLAS/pista.md and lugares/_borrador.md must be IGNORED by the scanner.
 *   - lugares/roto.md has invalid YAML -> degraded load + Diagnostico entry.
 *   - estado/ exists but is EMPTY -> the party bar renders the absent-estado hint.
 *
 * MUNDO_CAMPAIGN_CON_ESTADO adds estado/grupo.md (party at porto_verne) for the
 * M2 party-readout tests: PartyStatusBar values + marker roll-up across tiers.
 * It also adds (M6) mundo/imagenes/ profile images (SVG on purpose: text-based
 * bytes survive the OPFS utf-8 write) for kovar_iii and the kael_voss pnj, and
 * an images/ file inside the porto_verne playable folder so the ActRunner
 * grows an image tab (player-safe fullscreen regression test).
 *
 * MUNDO_CAMPAIGN_CON_MUSICA adds mundo/musica/ (world-level music): 2 root
 * mp3s = BGM rotation + eventos_generales/ = 1 named event playlist + a
 * markdown prompt doc the scanner must ignore. The base fixture deliberately
 * has NO musica/ folder — the no-dock test depends on that.
 */

export type FileTree = { [name: string]: string | FileTree };

export const MUNDO_CAMPAIGN: FileTree = {
    mundo: {
        'mundo.md': `---
nombre: Sector Eloran
calendario:
  era: dG
  ano_epoca: 322
  dias_por_mes: 30
  meses: [Albor, Cenit, Ocaso, Umbra]
viaje:
  dias_por_unidad: 1
  intrasistema_dias: 1
  combustible_cada_dias: 4
  viveres_cada_dias: 4
medidores: [viveres, combustible, nave]
regiones: [nucleo, frontera]
---
# Sector Eloran

Franja comercial entre el nucleo colonizado y la frontera sin cartografiar.
Las rutas mineras acaban de abrirse de nuevo y todo el mundo quiere su parte.
`,
        sistemas: {
            'sistema_verne.md': `---
tipo: sistema
nombre: Sistema Verne
coordenadas: {x: 0, y: 0}
region: nucleo
conocimiento: visitado
etiquetas: [comercio, transitado]
resumen: Corazon comercial del sector, hogar de Porto Verne.
estado: >
  Trafico intenso tras la reapertura de las rutas mineras; los precios
  del combustible suben cada semana.
---
Sistema binario con un gigante gaseoso y tres planetas interiores.
`,
            'sistema_kessler.md': `---
tipo: sistema
nombre: Sistema Kessler
coordenadas: {x: 6, y: 3}
region: frontera
conocimiento: rumoreado
etiquetas: [mineria, peligroso]
resumen: Campo de asteroides denso; se rumorea que hay una estacion franca.
---
Nadie del grupo ha estado, pero los mineros de Verne hablan de el sin parar.
`,
            'sistema_umbral.md': `---
tipo: sistema
nombre: Sistema Umbral
coordenadas: {x: -5, y: 4}
region: frontera
conocimiento: desconocido
etiquetas: [inexplorado]
resumen: Solo una firma gravitatoria en los mapas antiguos.
---
Sin datos. Ninguna carta estelar moderna lo incluye.
`,
        },
        lugares: {
            'kovar_iii.md': `---
tipo: planeta
nombre: Kovar III
en: sistema_verne
orbita: 3
conocimiento: conocido
etiquetas: [agricola]
resumen: Mundo agricola que alimenta a medio sistema.
servicios: [mercado, refugio]
---
Campos hidroponicos hasta el horizonte y una unica ciudad-elevador.
`,
            'mercado_de_brasa.md': `---
tipo: estacion
nombre: Mercado de Brasa
en: sistema_kessler
conocimiento: rumoreado
etiquetas: [franco, mineria]
resumen: Estacion franca entre los asteroides de Kessler, segun los mineros.
servicios: [repostaje, mercado]
---
Dicen que alli se compra de todo y no se pregunta nada.
`,
            'rampa_carga.md': `---
tipo: estructura
nombre: Rampa de Carga
en: mercado_de_brasa
conocimiento: visitado
poi: {x: 30, y: 70}
etiquetas: [muelles]
servicios: [informacion]
resumen: Rampa principal de descarga de la estacion franca.
---
Un pasillo de grúas y contenedores donde nadie hace preguntas.
`,
            'sala_franca.md': `---
tipo: estructura
nombre: Sala Franca
en: mercado_de_brasa
conocimiento: conocido
poi: {x: 72, y: 40}
etiquetas: [mercado]
servicios: [mercado, contrabando]
resumen: Salón de trueque de la estacion; se compra de todo.
---
Mesas plegables y una barra larga; el corazon comercial de Brasa.
`,
            'trastienda.md': `---
tipo: estructura
nombre: Trastienda
en: mercado_de_brasa
conocimiento: rumoreado
etiquetas: [oculto]
resumen: Se rumorea una trastienda sin ubicacion fija en los planos.
---
Nadie coincide en donde esta; por eso queda en el anillo "sin ubicar".
`,
            'nodo_central.md': `---
tipo: nodo
nombre: Nodo Central
coordenadas: {x: 14, y: -14}
acceso: portal
conocimiento: rumoreado
etiquetas: [predecesor, anomalia]
resumen: Estructura predecesora en el espacio profundo; solo accesible por portal.
---
Ninguna ruta convencional llega hasta el. Los que hablan de el mencionan
una puerta que se abre desde dentro.
`,
            'torre_korinth.md': `---
tipo: estructura
nombre: Torre Korinth
en: porto_verne
conocimiento: conocido
etiquetas: [corporativo]
resumen: Aguja corporativa que domina el anillo de muelles de Porto Verne.
servicios: [informacion, trabajo]
---
Sede local de Vortex Logistics; medio puerto le debe algo a alguien de la torre.
`,
            '_borrador.md': `---
tipo: estacion
nombre: Borrador sin terminar
---
Notas sueltas del GM. El escaner debe ignorar este archivo por el guion bajo.
`,
            'roto.md': `---
nombre: [sin cerrar
tipo: estacion
---
Cuerpo intacto pese al YAML invalido. Debe aparecer en el Diagnostico,
no tumbar la carga del mundo.
`,
            porto_verne: {
                'lugar.md': `---
tipo: estacion
nombre: Porto Verne
en: sistema_verne
orbita: 4
conocimiento: visitado
etiquetas: [puerto, comercio]
resumen: Puerto franco principal del sistema Verne.
servicios: [repostaje, mercado, taller, informacion, ocio]
facciones:
  - {faccion: vortex_logistics, nivel: dominante}
  - {faccion: consorcio_tetrad, nivel: encubierta}
peligro: 1
---
Anillo de muelles alrededor de un nucleo de habitats apilados. Todo lo que
entra o sale del sistema pasa por sus gruas.
`,
                plan: {
                    'acto1_regreso.md': `# ACTO 1 — REGRESO A PORTO VERNE

## Vuelta al puerto con la bodega medio vacia

:::gm
Acto de apertura del arco. La nave vuelve a Porto Verne y Kael Voss espera
en el muelle 7 con un encargo turbio. Tono: bullicio portuario, deudas.
:::

## 1. Reentrada

:::leer
Las luces del muelle se encienden en fila mientras la nave se acopla.
Olor a metal caliente, vapor y especias. Un dron de aduanas escanea el
casco con una linea azul y, al fondo, una voz metalica anuncia salidas.
:::

:::gm
Si los PJ preguntan por Kael, esta en el muelle 7 discutiendo con un
capataz de Vortex. El capataz se marcha si los PJ se acercan.
:::

:::accion
**Localizar a Kael Voss**
- habilidad: Percepcion o Sociedad
- cd: 15
- exito: encuentran a Kael antes de que el capataz lo eche del muelle
- fallo: pierden una hora; Kael los encuentra a ellos, molesto
:::

## 2. El favor de Kael

:::leer
Kael Voss baja la voz y desliza un chip de datos hacia vosotros.
"Un paquete pequeno", dice. "Nada peligroso. Solo llevadlo al punto de
intercambio y el consorcio no tiene por que saberlo".
:::

:::gm
El paquete conecta con la pista deuda_kael_zara. Si los PJ negocian bien
(Diplomacia CD 17), Kael sube la paga a 500 creditos.
:::

:::accion
**Aceptar el encargo**
- efecto: activa la pista deuda_kael_zara
- recompensa: 400 creditos al entregar
:::

:::efecto
- pista: rumor_lejano activa | el eco del nodo se enciende
- ganancia: 150 | pago inicial de Kael
:::
`,
                },
                characters: {
                    'kael_voss.md': `# Kael Voss

Intermediario de carga en los muelles de Porto Verne. Cuarenta anos,
chaqueta de tres temporadas atras, sonrisa de vendedor cansado.

- **Quiere:** saldar su deuda con Zara Hollis antes de fin de mes.
- **Teme:** que Vortex Logistics lo vete de los muelles.
- **Voz:** habla deprisa, se toca la oreja cuando miente.
`,
                },
                music: {},
            },
            // A NODE-style playable place: its plan/ has NO act1 folder — content
            // starts at act2 (acto2). Proves the ActRunner auto-selects the first
            // act that actually exists and never renders a phantom acto1 slot.
            jardin_que_exhala: {
                'lugar.md': `---
tipo: estructura
nombre: Jardin que Exhala
en: sistema_verne
conocimiento: rumoreado
etiquetas: [anomalia, predecesor]
resumen: Camara viva que respira; el arco no la abre hasta el segundo acto.
---
Nadie describe igual lo que hay dentro. La entrada solo se abre a mitad del arco.
`,
                plan: {
                    act2: {
                        'acto2_umbral.md': `# ACTO 2 — EL UMBRAL SE ABRE

## La camara respira por primera vez

:::leer
El aire sale tibio de las paredes y todo el jardin parece inhalar a la vez.
Las luces palpitan al ritmo de algo que no veis.
:::

:::gm
Este es el punto de entrada real del arco. No hay acto anterior que jugar.
:::

:::accion
**Leer el pulso de la camara**
- habilidad: Naturaleza
- cd: 16
- exito: entienden el ciclo de respiracion y cuando cruzar
:::
`,
                    },
                    act3: {
                        'acto3_corazon.md': `# ACTO 3 — EL CORAZON

## Descenso al nucleo latente

:::leer
Al fondo late una masa suspendida, atada por filamentos de luz.
:::
`,
                    },
                },
                music: {},
            },
        },
        facciones: {
            'vortex_logistics.md': `---
tipo: faccion
nombre: Vortex Logistics
actitud: neutral
poder: 4
objetivos:
  - controlar todo el transito de carga del sistema Verne
  - absorber a los transportistas independientes
etiquetas: [corporacion, logistica]
resumen: La corporacion que mueve (y cobra) casi toda la carga del nucleo.
estado: >
  Ha subido las tasas de muelle un 12% y los independientes protestan.
---
Uniformes grises, contratos largos y letra pequena.
`,
            'consorcio_tetrad.md': `---
tipo: faccion
nombre: Consorcio Tetrad
actitud: rival
poder: 3
objetivos:
  - infiltrar los muelles de Porto Verne
  - hacerse con el mapa de rutas de Vortex
etiquetas: [cartel, contrabando]
resumen: Cartel de contrabando que opera en la sombra de los puertos francos.
estado: >
  Su celula en Porto Verne busca mensajeros que no hagan preguntas.
---
Nadie ha visto a su directiva; solo a sus cobradores.
`,
        },
        pnjs: {
            'kael_voss.md': `---
tipo: pnj
nombre: Kael Voss
faccion: vortex_logistics
rol: contacto
ubicacion: porto_verne
etiquetas: [muelles, deudas]
resumen: Intermediario de carga con demasiadas deudas y buenos contactos.
estado: >
  Debe 2000 creditos a Zara Hollis y busca un encargo que lo salve
  antes de fin de mes.
---
Dossier: lleva quince anos en los muelles y conoce cada grua por su nombre.
`,
        },
        pistas: {
            'deuda_kael_zara.md': `---
tipo: pista
nombre: La deuda de Kael con Zara
estado: activa
trama: deudas
donde: porto_verne
origen: kael_voss
plazo: 40
recompensa: 400 creditos y un contacto estable en los muelles
---
Kael necesita que alguien entregue un paquete sin que el consorcio se
entere. Si sale bien, Zara Hollis le perdona parte de la deuda.
`,
            'rumor_lejano.md': `---
tipo: pista
nombre: Un eco en el nodo
estado: rumor
donde: nodo_central
origen: mercado_de_brasa
---
Se habla de una senal que se enciende cada 47 dias en el Nodo Central.
Nadie ha vuelto para contarlo dos veces.
`,
            'ruta_franca.md': `---
tipo: pista
nombre: La ruta franca de Vortex
estado: activa
trama: contrabando
donde: porto_verne
origen: kael_voss
---
Vortex mueve carga sin declarar entre Porto Verne y la estacion franca.
`,
            'contacto_brasa.md': `---
tipo: pista
nombre: El contacto en Brasa
estado: rumor
trama: contrabando
donde: mercado_de_brasa
origen: kael_voss
---
Alguien en la Sala Franca compra los manifiestos robados sin preguntar.
`,
        },
        tramas: {
            'deudas.md': `---
tipo: trama
nombre: Deudas
rol: secundaria
estado: activa
reloj: {actual: 1, max: 4}
lugares_clave: [porto_verne]
facciones: [vortex_logistics]
---
## Cuando el reloj avance

1. Zara vende la deuda de Kael al Consorcio Tetrad.
2. Kael desaparece de los muelles.
3. El Consorcio usa el expediente de Kael contra los PJ.
4. Cierre: la deuda se salda o Kael cae.
`,
            'contrabando.md': `---
tipo: trama
nombre: Contrabando
rol: principal
estado: activa
reloj: {actual: 2, max: 6}
lugares_clave: [porto_verne, mercado_de_brasa]
facciones: [consorcio_tetrad]
---
## Cuando el reloj avance

1. El Consorcio abre una ruta franca permanente por Brasa.
2. Vortex descubre la fuga y cierra los muelles.
3. Los PJ quedan en medio del fuego cruzado.
`,
        },
        eventos: {
            'viajes_nucleo.md': `---
tipo: eventos
nombre: Viajes por el nucleo
contexto: viaje
regiones: [nucleo]
---
## v01 — Control de aduanas {peso=3}

:::leer
Una patrulla de aduanas os hace detener los motores y acoplarse para una
inspeccion de carga. El oficial menciona, de pasada, avistamientos en el
espacio profundo.
:::

:::efecto
- gasto: 50 | tasa de inspeccion
- sabe: nodo_central conocido
:::

## v02 — Consumo critico {peso=1; si=combustible<=1}

:::gm
El indicador de combustible entra en zona critica; sin repostar pronto la
nave quedara a la deriva.
:::
`,
            'estancia_porto.md': `---
tipo: eventos
nombre: Estancia en el nucleo
contexto: estancia
regiones: [nucleo]
---
## e01 — Encargo de descarga {peso=2}

:::leer
Un capataz del muelle os ofrece unos turnos de descarga bien pagados:
paga inmediata y sin papeleo.
:::

:::efecto
- ganancia: 200 | turnos de descarga
- medidor: oxigeno -1 | fuga en el sello de carga (medidor NO manifestado)
:::
`,
        },
        estado: {},
        diario: {},
        PLANTILLAS: {
            'pista.md': `---
tipo: pista
nombre: <nombre de la pista>
estado: rumor
trama: <trama_id o quitar>
donde: <lugar_id o quitar>
origen: <entidad_id o texto>
plazo: <dia_mundo limite, opcional>
recompensa: <texto, opcional>
---
Plantilla: el escaner debe ignorar este archivo (carpeta en MAYUSCULAS).
`,
        },
    },
};

/**
 * estado/grupo.md for the party-readout variant (plan Part A frontmatter:
 * app-owned header, agent-owned body). dia_mundo 4127 renders as
 * "17 de Cenit, 356 dG" under the fixture calendar (4 meses x 30 dias).
 */
const GRUPO_MD = `---
tipo: estado_grupo
sesion_activa: false
dia_mundo: 4127
ubicacion: porto_verne
rumbo: null
creditos: 1240
medidores:
  viveres: 3
  combustible: 2
  nave: 2
personajes: [Xiao, Chesco]
---
## Inventario

- Paquete sellado de Kael (entregar en el punto de intercambio).
- 2 cargas de repuestos para la nave.
`;

/**
 * M4 variant of deuda_kael_zara: `requisitos` evaluated against the LIVE
 * party numbers — with the estado fixture (creditos 1240 >= 800) it derives
 * accionable; a session gasto below 800 must drop the star (e2e asserts the
 * re-derivation). Only the CON_ESTADO variant carries it: without grupo.md
 * the defaults (creditos 0) would turn the base-fixture pista false and
 * change what the M1-M3 tests see.
 */
const DEUDA_KAEL_ZARA_CON_REQUISITOS = `---
tipo: pista
nombre: La deuda de Kael con Zara
estado: activa
trama: deudas
donde: porto_verne
origen: kael_voss
plazo: 40
requisitos: ["creditos>=800"]
recompensa: 400 creditos y un contacto estable en los muelles
---
Kael necesita que alguien entregue un paquete sin que el consorcio se
entere. Si sale bien, Zara Hollis le perdona parte de la deuda.
`;

/** Tiny valid SVG (text bytes — OPFS writes utf-8, binary formats would corrupt). */
function fixtureSvg(fill: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="${fill}"/></svg>`;
}

/**
 * A shop under porto_verne (feature — shop system): frontmatter `tipo: tienda`
 * + a GM-prose blurb + the exact `| articulo | precio | stock | nota |` table.
 * Two items: one with stock 1 (buy-twice must block on the second), one
 * unlimited ("-"). pnj resolves to kael_voss (located at porto_verne).
 */
const TIENDA_MUELLES = `---
tipo: tienda
nombre: Suministros del Muelle 7
pnj: kael_voss
etiquetas: [repuestos]
---
Un tenderete entre las grúas; Kael conoce al dueño.

| articulo | precio | stock | nota |
|---|---|---|---|
| Célula de combustible | 120 | 1 | última unidad |
| Raciones de campo | 40 | - | siempre en stock |
`;

/**
 * GM play-aid sheets for the in-app Guías menu (feature — Guías dialog). These
 * live at the mundo/ root under the GUIA_FILES allowlist. RUN_OF_SHOW carries a
 * leading `# heading` (first-heading title wins over the fallback); MAPA_DE_HILOS
 * has no heading, so its label falls back to the mapping titulo.
 */
const RUN_OF_SHOW_MD = `# Guion de la sesión

1. Reentrada en Porto Verne.
2. El favor de Kael Voss en el muelle 7.
3. La ruta franca de Vortex.
`;

const MAPA_DE_HILOS_MD = `Contrabando -> Brasa -> Consorcio Tetrad.

Deudas -> Kael Voss -> Zara Hollis.
`;

/** Session recap for the in-app Resumen dialog (feature — in-app resumen). */
const RESUMEN_MD = `# Anteriormente

El grupo llegó a Porto Verne con la bodega medio vacía y una deuda pendiente
con Kael Voss.
`;

/**
 * Same campaign, plus estado/grupo.md — the party is docked at porto_verne —
 * plus entity profile images and an ActRunner image (M6, see header doc), plus
 * a porto_verne shop (tiendas/) and a session recap (resumen.md) for the shop
 * and in-app-resumen features.
 */
export const MUNDO_CAMPAIGN_CON_ESTADO: FileTree = (() => {
    // FileTree is JSON-safe (plain strings/objects), so a JSON round-trip clones it.
    const clone = JSON.parse(JSON.stringify(MUNDO_CAMPAIGN)) as FileTree;
    const mundo = clone.mundo as FileTree;
    (mundo.estado as FileTree)['grupo.md'] = GRUPO_MD;
    (mundo.pistas as FileTree)['deuda_kael_zara.md'] = DEUDA_KAEL_ZARA_CON_REQUISITOS;
    // M6: profile images by convention (basename = entity id) — a lugar and
    // the pnj located at porto_verne (pnjs/kael_voss.md, ubicacion already set).
    mundo.imagenes = {
        'kovar_iii.svg': fixtureSvg('#3aa675'),
        'kael_voss.svg': fixtureSvg('#7a5cc7'),
    };
    // M6: an image inside the playable place folder -> ActRunner image tab.
    ((mundo.lugares as FileTree).porto_verne as FileTree).images = {
        'muelle_7.svg': fixtureSvg('#c7823a'),
    };
    // Battlemaps: maps/ carries a markdown ASCII map (-> supportDocs) AND an
    // image battlemap (-> part.battlemaps -> BattlemapViewer). The .png holds
    // SVG bytes (OPFS is utf-8; the viewer only needs a blob URL, the scanner
    // keys off the extension).
    ((mundo.lugares as FileTree).porto_verne as FileTree).maps = {
        'muelle_7_battlemap.png': fixtureSvg('#4a6b8a'),
        'plano_ascii.md': '```\n#####\n#...#\n#####\n```\n',
    };
    // Many support docs -> the "Fichas" dropdown groups them by folder. The
    // base fixture already ships characters/kael_voss.md; add more characters
    // and a threats/ folder so the flat-tabs overflow the tab strip and the
    // grouped dropdown (Personajes / Amenazas / Mapas ASCII) has each section.
    ((mundo.lugares as FileTree).porto_verne as FileTree).characters = {
        'kael_voss.md': '# Kael Voss\n\nIntermediario de carga en los muelles.\n',
        'zara_hollis.md': '# Zara Hollis\n\nPrestamista a la que Kael debe dinero.\n',
        'capataz_vortex.md': '# Capataz de Vortex\n\nSupervisa el muelle 7 con mano dura.\n',
    };
    // dron_aduanas carries a real CA/PV statblock (fenced, Spanish labels) so
    // the ActRunner's "Añadir al combate" control appears; cobrador_tetrad is
    // prose-only (no statblock) to prove the button is threat-AND-statblock
    // gated. The Depredador-style format is mirrored from the real fichas.
    ((mundo.lugares as FileTree).porto_verne as FileTree).threats = {
        'dron_aduanas.md': `# Dron de aduanas

Escanea el casco al acoplar. Nivel 1.

\`\`\`
DRON DE ADUANAS                                  CRIATURA 1
PEQUEÑO CONSTRUCTO
Perception +7

CA 16; Fort +5, Ref +8, Will +4
PV 22
Debilidad: electricidad 3

ATAQUES
Cuerpo a cuerpo [1 acción] pinza +8, Daño 1d6+2 contundente
\`\`\`
`,
        'cobrador_tetrad.md': '# Cobrador del Tetrad\n\nBusca al mensajero del paquete.\n',
    };
    // Shop system: a tiendas/ subfolder inside the porto_verne place folder.
    ((mundo.lugares as FileTree).porto_verne as FileTree).tiendas = {
        'muelles.md': TIENDA_MUELLES,
    };
    // In-app resumen: mundo/resumen.md (the base fixture has none on purpose).
    mundo['resumen.md'] = RESUMEN_MD;
    // GM guías: curated play-aid sheets at mundo/ root (GUIA_FILES allowlist).
    // _RUN_OF_SHOW.md carries a leading heading (first-heading title wins);
    // _MAPA_DE_HILOS.md has none, so its dropdown label falls back to the
    // mapping titulo "Mapa de Hilos".
    mundo['_RUN_OF_SHOW.md'] = RUN_OF_SHOW_MD;
    mundo['_MAPA_DE_HILOS.md'] = MAPA_DE_HILOS_MD;
    return clone;
})();

/**
 * Same campaign, plus mundo/musica/ — world-level music for the cockpit dock.
 * The "mp3" bytes are fake: the app only LISTS the files until one is played,
 * and the audio-dock tests never press play (Playwright cannot verify sound).
 */
export const MUNDO_CAMPAIGN_CON_MUSICA: FileTree = (() => {
    const clone = JSON.parse(JSON.stringify(MUNDO_CAMPAIGN)) as FileTree;
    (clone.mundo as FileTree).musica = {
        'viaje_nucleo.mp3': 'fake-mp3-bytes-nucleo',
        'viaje_frontera.mp3': 'fake-mp3-bytes-frontera',
        '_instrucciones.md': '# Prompts — el scanner debe ignorar este markdown',
        eventos_generales: {
            'evento_averia.mp3': 'fake-mp3-bytes-averia',
        },
    };
    return clone;
})();
