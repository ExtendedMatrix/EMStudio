# Tassonomia degli estrattori — proposta (MICRO-PX6, 23 nov 2026)

**Stato: PROPOSTA.** Niente di questo documento cambia il datamodel: le decisioni sono di E.D. (tabella qui sotto). Scritto dopo il primo estrattore «con una regola geometrica» portato in EMStudio, l'**Allineamento** (Spazio 3D e Viewer, `frontend/src/viewer-annot.ts`), e dopo la decisione 4 di E.D. del 23 nov 2026 («gli estrattori non sono solo punti misurati: ce ne sono di planimetrici con regole — la regola aurea è un tipo di estrattore —, di discipline diverse»). Fonti: SPEC-pacchetto 0.2 §4–§6 (`s3Dgraphy/.claude/wip/reports/2026-11-18-SPEC-pacchetto-comunita.md`), `s3dgraphy/JSON_config/em_extractor_types.json` (2.0), `em_qualia_types.json`, il pacchetto `em-profiles/profiles/geofisica` (prefisso `geof:`), `em-profiles/examples/example-toolmarks` (`tm:`), il referto MICRO-VIEWER-UNICO (la proposta `reading_kind`).

## Decisioni per E.D.

| # | Decisione | Proposta | Alternativa | Che cosa cambia se sì |
|---|---|---|---|---|
| D1 | Dove vive una **regola** (regola aurea, √2, modulo) | Di norma in un **combinatore** con un'operazione di un insieme chiuso (`ratio_to_canon`…), sopra estrattori che misurano; **dentro l'estrattore** solo quando la persona batte i punti *secondo* la regola (un atto solo, una fonte) | Sempre nell'estrattore (la tua frase: «la regola aurea è un tipo di estrattore») | s3Dgraphy: 4 operazioni nuove nei combinatori (D6); i pacchetti dichiarano `rule` nel tipo |
| D2 | **`reading_kind`** (che cosa si è letto) nel datamodel | Sì, in `AnnotationRegionNode.data`: lista chiusa del nucleo (`spot_height`, `impost_height`, `bedding_plane`, `length`, `alignment`, `area`, `volume`) + `<prefisso>:<lettura>` per i pacchetti | Lasciarlo convenzione di EMStudio (oggi) | bump del datamodel dei nodi; EM Tools lo legge |
| D3 | **`value_unit`** accanto a `unit` | Sì: `unit` resta l'unità della misura della regione (`length` in m), `value_unit` quella del valore letto (l'azimut in gradi) | Un solo `unit` (oggi un allineamento direbbe «m» accanto a 170°) | idem D2 |
| D4 | Dove va la **tassonomia** | Tre schemi SKOS in `vocabularies` / `stratigraph-templates/vocabularies`: `em-extractor-families` (famiglie), `em-disciplines` (discipline), `em-rules` (regole e canoni); il datamodel ne porta solo i campi | Tutto nel datamodel (`em_extractor_types.json`) | nessun bump per aggiungere una famiglia o una disciplina |
| D5 | L'allineamento nel **nucleo** | Sì: tipo `alignment` (famiglia `geometric_fit`) in `em_extractor_types.json`; il valore va nel qualia esistente **`orientation`** (azimut, tilt) o in un qualia nuovo `alignment` (azimut + lunghezza + scarto) | Un pacchetto `arch:` | EMStudio scrive `data.em_kind = "alignment"` invece di `purpose` |
| D6 | Operazioni dei combinatori | Aggiungere `fit_line`, `angle_between`, `ratio_to_canon`, `to_unit` alle sei della SPEC §6 | Lasciarle a un plugin | s3Dgraphy le esegue; i pacchetti le dichiarano |
| D7 | **Nord** dell'azimut | Il nord della griglia del sistema del grafo (+Y, Z in alto), dichiarato `north: "grid"`; il nord vero (convergenza del CRS) calcolato quando il grafo ha un EPSG | Nord vero sempre | un campo `true_azimuth_deg` quando c'è la georeferenza |
| D8 | Un allineamento **riusato** come asse (Scatola, Muro) | Il punto dello strumento dice da dove viene (`from_reading: <id>`) invece di diventare un estrattore nuovo | Come oggi: i punti diventano estrattori nuovi, la nota dice «dall'allineamento D.01.62» | `proxy_from_points` accetta un punto che cita un estrattore |
| D9 | Le **discipline** | Etichette (SKOS), mai una gerarchia di tipi: lo stesso tipo serve a più discipline | Una famiglia per disciplina | — |

## 1 · Il problema

Oggi un estrattore dice **da dove** legge (`extracted_from` un documento, il luogo come `AnnotationRegionNode`) ma non **come**: il «come» è sparso in convenzioni.

| dove | che cosa dice | chi lo scrive |
|---|---|---|
| `ExtractorNode.data.em_kind = "<prefisso>:<tipo>"` | il tipo di un pacchetto | i pacchetti (SPEC §4) |
| `ExtractorNode.data.purpose` | lo strumento: `proxy_box_creator`, `3D drawing on surface`, `wall_from_plan`, `from_elevation`, `alignment` | EM Tools, EMStudio (PX1–PX6) |
| `ExtractorNode.data.point_type` | il ruolo del punto: `Alignment Start`, `face`, `depth`, `surface`, `proxy` | EM Tools, EMStudio |
| `AnnotationRegionNode.data.reading_kind` | che cosa si è letto: `spot_height`, `bedding_plane`, `length`, `alignment` | EMStudio (non nel datamodel) |
| `em_extractor_types.json` | sei famiglie per **fonte** (`physical_measurement` → `3d_model_analysis`, `technical_drawing_analysis`; `material_analysis`; `temporal_analysis`…) | nucleo, mai scritto nel grafo |

Le famiglie del nucleo classificano per **fonte** («analisi di un modello 3D», «analisi di un disegno tecnico»): nessuna dice che cosa si batte, che cosa si legge, quale regola si applica. L'allineamento, la regola aurea e un'anomalia lineare GPR sono tutti «analisi di un documento» e lì non si distinguono.

## 2 · Quattro criteri, non una gerarchia

Un estrattore si descrive con **quattro assi indipendenti**. La tassonomia è la combinazione, non un albero: un albero per disciplina duplicherebbe l'allineamento in architettura, in geofisica e in rilievo.

1. **Gesto — che cosa si batte.** La primitiva (SPEC §5.2, insieme chiuso): `point`, `line`, `polyline`, `surface`, `volume`; per i documenti non 3D: `region2d` (una zona di un'immagine), `passage` (un brano di testo). Un **insieme di punti canonici** (`lms:`, SPEC §5.4) è un gesto guidato: punti con un nome, in ordine.
2. **Lettura — che cosa si legge.** `reading_kind`: posizione/quota, lunghezza, **orientamento** (azimut, pendenza, immersione), area, volume, **forma** (raggio, curvatura), **rapporto**, conteggio, **classe** (una voce di vocabolario), testo.
3. **Regola — come dai punti si arriva al valore.** Nessuna (misura diretta); **adattamento geometrico** (retta, piano, cerchio ai minimi quadrati, con il suo scarto); **canone proporzionale** (regola aurea φ, rettangolo √2, triangolo 3-4-5, rapporti vitruviani: un rapporto misurato confrontato con un canone entro una tolleranza); **metrologia** (un'unità antica: piede romano 0,296 m, cubito; il modulo che spiega meglio un insieme di misure); **classificazione** (il confronto con una voce di vocabolario: «anomalia lineare positiva», «gradina»); **relazione** (fra due letture: parallelismo, continuità, distanza fra assi).
4. **Disciplina — chi la usa.** Rilievo e geomatica, architettura, geometria antica e metrologia, geofisica, epigrafia, archeometria, conservazione… Un'etichetta (SKOS), più d'una per tipo.

## 3 · Sei famiglie (proposta per lo schema `em-extractor-families`)

| famiglia | gesto | lettura | regola | esempi già fatti | esempi possibili | dove (oggi) |
|---|---|---|---|---|---|---|
| **F1 Misure dirette** | punto, linea, polilinea, superficie, volume | quota, lunghezza, area, volume | nessuna | Viewer: quota, imposta, linea, polilinea; punti di Muro/Prospetto/Scatola (PX1–PX2); Annota superficie (PX3) | distanza fra due punti (`stat:misura_tra_punti`) | nucleo + pacchetti |
| **F2 Adattamenti geometrici** | due o più punti | orientamento, forma + lo **scarto** | un modello geometrico adattato (minimi quadrati) | **Allineamento** (retta in pianta, PX6); piano di posa da tre punti (Viewer) | arco / abside / colonna (cerchio: centro, raggio), asse di simmetria, profilo di una modanatura | nucleo |
| **F3 Canoni proporzionali** | punti canonici guidati (un rettangolo, un triangolo) su una pianta o un prospetto | un rapporto + lo scarto dal canone + un giudizio entro la tolleranza | un canone (φ, √2, 3-4-5, Vitruvio) | — | **regola aurea** su una pianta; rettangolo √2 di un'aula; triangolo egizio di una facciata | pacchetto (es. `arch:`) |
| **F4 Metrologia** | misure (F1/F2) | la misura in un'unità antica, il modulo | una tabella di unità (con fonti) | — | «23,45 m = 79,2 piedi romani»; il modulo di un colonnato | pacchetto (`metr:`) |
| **F5 Classificazioni su un documento** | punto, polilinea, regione, brano | una voce di vocabolario (+ misure accessorie) | il confronto con un vocabolario | segni di strumento (`tm:mark_reading`), anomalie GPR/ERT (`geof:anomalia_*`) | lettura epigrafica (formula, lettere), stato di conservazione su un'immagine | pacchetti |
| **F6 Relazioni** | due o più letture già fatte | un angolo, una distanza, una continuità | geometria fra letture | — | parallelismo di due muri; un'anomalia che continua un muro | combinatori (D1, D6) |

F1–F2 producono **misure** (difendibili da sole); F3–F6 producono **interpretazioni sostenute da misure**: per questo, di norma, la regola va in un combinatore sopra gli estrattori (D1) — la misura resta difendibile anche quando il canone è respinto.

## 4 · Come si rappresentano in s3Dgraphy con ciò che c'è

Niente tipi di nodo nuovi (SPEC §4: «un file di un pacchetto si apre, si disegna e si salva identico in uno strumento che il pacchetto non ce l'ha»).

- **Il tipo** — `ExtractorNode.data.em_kind`: `"<prefisso>:<tipo>"` per un pacchetto; per il nucleo l'id senza prefisso (`alignment`) se D5 passa. Il tipo nel manifesto (SPEC §5.3) porta già `geometry.primitive`, `produces`, `unit`, `vertices`, `snap`, `frame`; **mancano** `family` (una voce di `em-extractor-families`), `disciplines` (voci di `em-disciplines`) e `rule` (una voce di `em-rules` + i parametri: canone, tolleranza).
- **Il luogo** — `AnnotationRegionNode` (`geometry_kind`, `coords` nel frame del modello, `is_on_resource` il modello o il documento) come ogni lettura; **più** `reading_kind` (D2), `value`, `value_unit` (D3) e il blocco della lettura (per l'allineamento `alignment`: azimut, asse, lunghezza, pendenza, estremi, scarto).
- **Il gesto guidato** — un insieme di punti canonici `lms:` (SPEC §5.4) per F3: i quattro vertici di un rettangolo, nominati, con la posizione attesa (Procrustes) come aiuto, mai come valore.
- **La regola applicata** — un `CombinerNode` con `data.em_kind` e un'operazione dell'insieme chiuso (SPEC §6: `distance`, `angle`, `ratio`, `mean`, `area_of_polygon`, `elevation_difference`) — **mancano** (D6): `fit_line`, `angle_between`, `ratio_to_canon` (rapporto, canone, tolleranza → scarto e giudizio), `to_unit`.
- **Il valore** — un `PropertyNode` sull'unità (`has_property`) con `has_data_provenance` verso l'estrattore o il combinatore: per l'allineamento il qualia `orientation` (azimuth, tilt, roll: c'è) o un qualia `alignment` (manca, D5); per F3 un qualia `proportion` (manca); per F5 il qualia del pacchetto (`geof:anomaly_type`…).

**Che cosa manca, in breve:** `reading_kind` e `value_unit` nel datamodel (D2, D3); i campi `family`, `disciplines`, `rule` nel tipo di estrattore dei pacchetti; quattro operazioni dei combinatori (D6); i qualia `alignment` e `proportion`; i tre schemi SKOS (D4); un `em_kind` per gli strumenti del nucleo (oggi `purpose`).

## 5 · Dove va la tassonomia (D4)

- **s3Dgraphy (datamodel)** — solo ciò che uno strumento deve **eseguire o validare**: i campi (`reading_kind`, `value_unit`, `rule`), la lista chiusa delle letture del nucleo, le operazioni dei combinatori, il tipo `alignment`. Ogni aggiunta lì è un bump.
- **Vocabolario SKOS** (`vocabularies` → copia in `stratigraph-templates/vocabularies`) — ciò che si **nomina**: `em-extractor-families` (F1–F6, `skos:broader` fra famiglie se serve), `em-disciplines`, `em-rules` (φ = 1,6180…, √2, 3-4-5, piede romano 0,296 m… con fonti e `skos:exactMatch` verso Getty AAT dove la voce c'è — da cercare, non inventare). Etichette EN/IT e le altre lingue dei dizionari. Si aggiorna senza toccare il nucleo.
- **Pacchetti della comunità** (`em-profiles`) — i **tipi** di una disciplina (`geof:anomalia_linea`, `tm:mark_reading`, `arch:rettangolo_aureo`), i loro insiemi di punti canonici, i loro qualia; ogni tipo punta a una famiglia e a una o più discipline dello schema comune.

## 6 · Tre esempi completi

### 6.1 Allineamento (F2, rilievo/architettura) — fatto in PX6, il grafo vero

TempluMare v11, il muro est del podio, rilievo 2015, cinque clic sulla testa della fondazione:

```
D.01 (document) ─has_representation_model→ SM_OB_EST_L_LOD1 (representation_model)
D.01.62 (extractor)
   description  «filo superiore della fondazione del muro est del podio»   (l'annotazione)
   data         purpose: alignment · result: «azimut 170,3° · 23,451 m · pendenza 0,6° · scarto massimo 6,6 cm (5 punti)»
   ─extracted_from→ D.01
   ─extracted_from→ «D.01.62 · polyline» (annotation_region)
         geometry_kind polyline · coords 5 (frame glTF della scena) · length 23,452 · unit m · crs local
         reading_kind alignment · value 170.325 · value_unit deg
         alignment { azimuth_deg 170.325, axis_deg 170.325, length_m 23.451, slope_deg 0.634, rise_m 0.259,
                     start, end (retta adattata), points 5, max_dev_m 0.066, max_dev_at 4, rms_m 0.046,
                     sides [...], fit least_squares_plan }
         ─is_on_resource→ SM_OB_EST_L_LOD1
SU003 (US «Foundation of the walls») ─has_property→ alignment (property) ─has_data_provenance→ D.01.62
D.01.62 ─is_in_paradata_nodegroup→ PD_SU003
```

Con D2/D3/D5: `D.01.62.data.em_kind = "alignment"` (famiglia `geometric_fit`, discipline `survey`, `architecture`, regola `least_squares_line`), la proprietà `orientation` (azimuth 170,3, tilt 0,6) invece di un nome libero.

### 6.2 Regola aurea su una pianta (F3, architettura/geometria antica) — proposta

Una pianta del tempio (D.07, immagine raddrizzata; o il modello visto dall'alto), la cella (USV137 «Walls of the temple»). Pacchetto ipotetico `architettura` (prefisso `arch:`):

```json
"extractor_types": [{ "id": "arch:vertice_rettangolo", "specializes": "extractor",
  "family": "direct_measure", "disciplines": ["architecture", "ancient_geometry"],
  "geometry": { "primitive": "point", "produces": "position", "unit": "m", "snap": "surface", "frame": "model" } }],
"landmark_sets": [{ "id": "arch:rettangolo", "path": "landmarks/rettangolo.json", "extractor_type": "arch:vertice_rettangolo" }],
"combiner_types": [{ "id": "arch:regola_aurea", "family": "proportional_canon", "rule": "golden_ratio",
  "operation": "ratio_to_canon",
  "inputs": [{ "measure": "distance", "of": ["arch:rettangolo/A", "arch:rettangolo/B"] },
             { "measure": "distance", "of": ["arch:rettangolo/B", "arch:rettangolo/C"] }],
  "canon": 1.6180340, "tolerance": 0.02, "produces": "arch:proporzione" }]
```

Il grafo dopo la posa guidata dei quattro vertici A B C D sulla pianta:

```
D.07.11 … D.07.14 (extractor, em_kind arch:vertice_rettangolo, data.landmark {set arch:rettangolo, point A|B|C|D})
   ─extracted_from→ D.07 · ─extracted_from→ «D.07.1x · point» (region, is_on_resource D.07)
C.210 (combiner, em_kind arch:regola_aurea)
   data  operation ratio_to_canon · canon 1.6180 · tolerance 0.02
         measured 12.84 / 7.98 = 1.6090 · deviation −0.56 % · verdict «compatibile»
   ─combines→ D.07.11 … D.07.14
USV137 ─has_property→ arch:proporzione (property, value «1,609 ≈ φ (−0,6 %)») ─has_data_provenance→ C.210
```

La misura (12,84 e 7,98 m) resta difendibile anche se il canone è respinto (un'altra persona aggiunge un combinatore «rettangolo √2» sugli stessi quattro estrattori: due ipotesi, una misura). Variante D1-alternativa: un solo estrattore `arch:rettangolo_aureo` con la regione `polyline` chiusa dei quattro vertici e `data.rule {id golden_ratio, canon, tolerance, measured, deviation, verdict}`.

### 6.3 Un'anomalia GPR che continua un muro (F5 + F6, geofisica) — proposta sul pacchetto `geofisica` che c'è

Una fetta GPR a 0,6–0,8 m (D.12, `geof:fetta`, georeferenziata), sotto il prato a sud del podio:

```
D.12.03 (extractor, em_kind geof:anomalia_linea — tipo che il pacchetto geofisica ha già)
   ─extracted_from→ D.12
   ─extracted_from→ «D.12.03 · polyline» (region, frame graph, is_on_resource D.12)
         reading_kind alignment · value 171.5 · value_unit deg · alignment { … max_dev_m 0.12 … }   (la stessa lettura F2 del nucleo)
   data  geof:anomaly_type «lineare ad alta riflettività» (voce di vocab/anomalie, codice + etichetta + lingua)
         geof:depth_top 0.6 · geof:depth_bottom 0.8 · geof:method «GPR 400 MHz»
C.211 (combiner, em_kind em:continuita, operation angle_between + distance)
   data  Δazimut 1.2° · distanza fra le rette 0.15 m · verdict «in continuità»
   ─combines→ D.12.03, D.01.62
USV1xx (unità virtuale: la prosecuzione sepolta del muro est) ─has_property→ alignment ─has_data_provenance→ C.211
```

Discipline: `geophysics` per D.12.03, `architecture` + `survey` per D.01.62, la relazione `F6`. Lo stesso gesto (una polilinea) e la stessa lettura (`alignment`) servono a due discipline: il tipo del pacchetto aggiunge il **significato** (la voce dell'anomalia), il nucleo la **geometria** — il principio della SPEC §5.1.

## 7 · Che cosa EMStudio fa già (PX6) e che cosa seguirebbe

- Fatto: l'Allineamento scrive `purpose: alignment`, `reading_kind: alignment`, `value` + `value_unit`, il blocco `alignment`, il luogo sul modello; Viewer e Spazio usano **una** lettura (`viewer-annot.ts readingOf`). «Interpretazione» propone `alignment` e `orientation`.
- Se D2/D3/D5 passano: `data.em_kind = "alignment"` al posto di `purpose`, il bump di s3Dgraphy, EM Tools che legge la stessa lettura.
- Se D1/D6 passano: un pacchetto `architettura` di prova con la regola aurea (6.2) e i combinatori `ratio_to_canon`, `angle_between`.
