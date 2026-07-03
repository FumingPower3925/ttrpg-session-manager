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
 *   - PLANTILLAS/pista.md and lugares/_borrador.md must be IGNORED by the scanner.
 *   - lugares/roto.md has invalid YAML -> degraded load + Diagnostico entry.
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
  combustible_por_tramo: 1
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
        },
        eventos: {},
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
