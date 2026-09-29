# emstudio — la web app, servita da un nodo.
#
# EMStudio è ANCHE un'applicazione web, e per un nodo è quella che conta: il
# desktop Tauri lo si installa, questo lo si raggiunge. Oggi in produzione ci
# arriva come file statici costruiti a mano e copiati su un host
# (`heriverse-ansible/role/tasks/main.yml`: il ruolo NON costruisce niente —
# controlla che `reader.html` sia già lì e monta la cartella dentro Caddy, e si
# RIFIUTA di partire se non c'è). Questa immagine è quella cartella, costruita
# da una macchina invece che da una persona.
#
#   docker buildx build -t emstudio --load .
#   docker run --rm -p 8080:8080 emstudio
#
# `buildx` e non `docker build`, e vale la pena dirlo perché il messaggio che si
# prende sbagliando non aiuta. Il costruttore LEGACY non definisce
# `$BUILDPLATFORM`, quindi la prima riga di questo file gli esce così:
#
#   failed to parse platform : "" is an invalid OS component of ""
#
# Misurato su un Mac con Colima e un `docker` di homebrew senza il plugin
# (`brew install docker-buildx`). Su Docker Desktop e sui runner GitHub buildx
# c'è già, e `docker build` LO usa.
#
# ── DUE PAGINE, DUE BUILD, E DEVONO ESSERE DUE ───────────────────────────────
#
# `frontend/vite.config.ts` lo spiega: `viteSingleFile` inlina ogni import in un
# bundle solo, e rollup rifiuta più di un entry. Quindi l'editor e il lettore
# sono la stessa configurazione eseguita due volte, ed è esattamente quello che
# `npm run build:all` fa (`frontend/package.json:12`):
#
#   npm run build         → dist/index.html    l'editor, un file solo
#   npm run build:reader  → dist/reader.html   il lettore, con i suoi assets/
#
# ── IL PREFISSO: MISURATO, NON SERVE ─────────────────────────────────────────
#
# La domanda giusta da farsi davanti a una SPA sotto un prefisso è se il build
# debba sapere di stare sotto `/em/studio/` — con una `base` sbagliata si ottiene
# una pagina bianca e nessun errore, che è il montaggio che riesce a vuoto.
# Misurato in `frontend/vite.config.ts:88`: in un BUILD la base è `./`,
# RELATIVA, e la ragione è scritta lì (il lettore dev'essere servibile da
# qualunque prefisso, l'editor dev'essere apribile da `file://`). E dall'altro
# capo, Caddy usa `handle_path`, che il prefisso lo TOGLIE
# (`heriverse-ansible/role/templates/Caddyfile.j2:44,53`): alla radice di questa
# immagine arriva `/index.html`, non `/em/studio/index.html`.
#
# Quindi niente `--base`, niente build-arg del prefisso, e niente da sbagliare.
# `frontend/scripts/check-narrative.mjs` asserisce la base relativa contro la shell
# costruita, e questa immagine la esegue: la promessa è verificata qui dentro.
#
# ── PERCHÉ CADDY ─────────────────────────────────────────────────────────────
#
# Non un server statico scelto a caso: è quello che lo stack già usa, misurato —
# `caddy:2-alpine` nel dev-stack (`docker-compose.dev.yml:363`) e `caddy` in
# produzione (`heriverse-ansible/role/templates/docker-compose.yml.j2:22`), con
# le rotte di EMStudio scritte in un Caddyfile. Un nginx qui vorrebbe dire due
# server statici da conoscere per servire le stesse due pagine.

# ── STADIO 1 · le due build ──────────────────────────────────────────────────
#
# `--platform=$BUILDPLATFORM` per la stessa ragione dello stadio del Caddyfile,
# più una: quello che esce di qui sono FILE STATICI, identici su ogni
# architettura — non c'è niente da compilare per amd64 o per arm64. Costruirli
# due volte, e una delle due dentro QEMU, sarebbe pagare l'emulatore per
# ottenere lo stesso `dist/`.
FROM --platform=$BUILDPLATFORM node:20-slim AS build

WORKDIR /build/frontend

# `npm ci` e non `npm install`: costruisce dal lock, che è ciò che rende
# l'immagine riproducibile invece che soltanto recente.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# `scripts/` sta fuori da frontend/ ed è quello che `set-version` e i controlli
# usano; `../scripts` perché il package.json li chiama così.
COPY scripts /build/scripts
COPY frontend ./

# ENTRAMBE, in un comando solo perché sono un artefatto solo.
# RIFINITURE · `build:web` e non `build:all`: l'editor servito lascia fuori
# three.js (engine3d.js accanto, chiesto alla prima apertura di un modello 3D).
# Misurato servendo come serve Caddy qui (senza `encode`): three nel file unico
# costava +800 kB a TUTTI al primo caricamento, +0,33 s a 20 Mbit/s e +1,3 s a
# 5 Mbit/s. La desktop resta `npm run build`, il file unico: lì legge dal disco.
RUN npm run build:web

# La promessa della base relativa, verificata contro la shell appena costruita
# invece che contro il commento che la descrive.
RUN node scripts/check-narrative.mjs

# ── STADIO 2 · il Caddyfile, controllato SULLA MACCHINA CHE COSTRUISCE ───────
#
# `--platform=$BUILDPLATFORM`, e non è pignoleria: `caddy validate` è un binario
# Go, e in un build multi-arch lo stadio dell'architettura ALTRA gira sotto
# QEMU. Misurato qui, costruendo linux/amd64 su un Mac arm64:
#
#   fatal error: bulkBarrierPreWrite: unaligned arguments
#   crypto/x509/pkix.(*Name).FillFromRDNSequence …
#
# cioè il runtime di Go che muore dentro l'emulatore, con un Caddyfile
# perfettamente valido. Su un runner GitHub (amd64) sarebbe successo allo stadio
# arm64: la stessa trappola, specchiata. E sarebbe stata letta come «il
# Dockerfile è rotto» invece che «il controllo gira nel posto sbagliato».
#
# Il Caddyfile non dipende dall'architettura. Quindi lo si controlla UNA volta,
# sulla macchina che costruisce, nativamente — e l'immagine finale riceve il
# file già validato.
FROM --platform=$BUILDPLATFORM caddy:2-alpine AS caddyfile
COPY docker/Caddyfile /etc/caddy/Caddyfile
RUN caddy validate --config /etc/caddy/Caddyfile

# ── STADIO 3 · servire, e nient'altro ────────────────────────────────────────
#
# Nessun `npm` qui: l'immagine finale è il dist più un server statico. Node
# resta nello stadio di build, dove serviva.
FROM caddy:2-alpine

# Vedi il §1 delle immagini Python, e vale identico qui: OpenShift assegna al
# pod un UID a caso col GID 0 supplementare, quindi le cose scrivibili
# appartengono al GRUPPO 0 con i permessi di gruppo uguali a quelli utente, e
# `USER` è un NUMERO.
#
# Caddy scrive in due posti anche quando serve solo file — la sua cartella dati
# e quella di configurazione — e senza di esse non parte. Sono qui e non sono
# volumi: questa immagine non ha stato che valga la pena conservare, e un
# `emptyDir` va benissimo.
ARG APP_UID=10001

ENV XDG_DATA_HOME=/data \
    XDG_CONFIG_HOME=/config \
    HOME=/data

COPY --from=build /build/frontend/dist /srv/emstudio
COPY LICENSE /licenses/LICENSE
COPY --from=caddyfile /etc/caddy/Caddyfile /etc/caddy/Caddyfile

RUN addgroup -g 10001 -S emstudio 2>/dev/null || true; \
    adduser -u ${APP_UID} -G root -S -H -s /sbin/nologin emstudio; \
    mkdir -p /data /config; \
    chown -R ${APP_UID}:0 /data /config /srv/emstudio; \
    chmod -R g=u /data /config /srv/emstudio

USER ${APP_UID}

# 8080 e non 80: una porta sotto 1024 vuole una capability che un UID casuale
# non ha. È la stessa ragione per cui i tre servizi Python stanno sulla 8000.
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
