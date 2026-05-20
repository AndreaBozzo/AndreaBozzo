---
title: "Costruire il Mio Mini-Sito Personale come un Progetto Vero"
date: 2026-05-20T12:00:00+01:00
draft: false
tags: ["Sito Personale", "GitHub Pages", "Hugo", "Go", "Rust", "WebAssembly"]
categories: ["Open Source", "Web"]
keywords: ["Sito Personale", "GitHub Pages", "Hugo", "Go", "Rust", "WebAssembly", "Sito Statico"]
description: "Trattare il mio sito personale come un progetto vero: un blog Hugo, una landing page in HTML puro, un harvester Go, un workbench Rust/WASM e una piccola API Go su Vercel - tutto da un solo repo."
summary: "Come ho ricostruito il mio sito personale come un sistema statico versionato e riproducibile, con una separazione chiara fra landing page, blog, generatori e una piccola API Go companion."
author: "Andrea Bozzo"
showToc: true
TocOpen: true
hidemeta: false
comments: false
disableHLJS: false
disableShare: false
hideSummary: false
searchHidden: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
cover:
    image: "images/buildingapersonalwebsite-cover.png"
    alt: "Un sito, fatto a mano - cover del walkthrough"
    caption: "Un sito, fatto a mano: un walkthrough del sito personale"
    relative: false
    hidden: false
---

# Costruire un Mini-Sito Personale come un Progetto Vero

Per molto tempo il mio "sito personale" è stato un tema che tolleravo più che un sistema di cui mi fidavo: una pagina statica, un template mezzo personalizzato e una pila di link che diventava obsoleta non appena i miei interessi si spostavano. Questa volta volevo qualcosa di diverso: un piccolo sito che si comportasse come un progetto vero, con codice versionato, controlli in CI, riproducibilità locale e confini chiari fra le sue parti.

Il risultato vive su `https://andreabozzo.github.io/AndreaBozzo/` e in un singolo repository open source. Sotto il cofano è un sistema statico compatto con una landing page in HTML puro, un blog Hugo, un harvester Go, un workbench Rust/WASM opzionale e una piccola superficie API in Go.

Questo articolo racconta l'architettura e i compromessi che l'hanno modellata.

## Obiettivi e Vincoli

Prima di toccare codice, ho messo per iscritto alcuni vincoli:

- Tutto vive in un singolo repository pubblico, con default e workflow open-source friendly.
- Il sito deve essere riproducibile: le build locali devono coincidere con quello che GitHub Pages pubblica.
- La homepage deve fare di più di un biglietto da visita; deve davvero visualizzare il mio lavoro e la mia scrittura.
- L'hosting statico (GitHub Pages) rimane il default, con piccoli pezzi dinamici aggiunti solo dove ripagano chiaramente.

Da questi vincoli è emersa una forma semplice: due superfici pubbliche assemblate in un singolo artefatto Pages.

## Due Superfici, Un Repository

Il repository pubblica due superfici attraverso un singolo deploy su GitHub Pages:

- Una landing page root, costruita da `index.html` e dall'albero `assets/` (JavaScript, CSS, file dati, immagini).
- Un blog Hugo sotto `blog/`, con il tema PaperMod tracciato come submodule in `blog/themes/PaperMod`.

La pipeline di deploy costruisce il blog, copia gli asset della landing page e pubblica la cartella `_site/` mergiata su GitHub Pages come root del sito. Gli URL canonici sono:

- Landing page: `https://andreabozzo.github.io/AndreaBozzo/`
- Blog: `https://andreabozzo.github.io/AndreaBozzo/blog/`

Questa separazione lascia la landing page libera di evolvere in autonomia mentre il blog resta su un motore static-site standard.

## Tooling Locale

Lo stack di tooling è volutamente noioso:

- Git con supporto submodule, perché il tema Hugo è un submodule.
- Hugo extended per il blog.
- Node.js e npm per la pipeline degli asset e i CLI.
- Python 3 per un file server statico minimale.
- Go per l'harvester del repository e per la piccola superficie API.

Clonare e fare bootstrap è volutamente diretto:

```bash
git clone --recursive https://github.com/AndreaBozzo/AndreaBozzo.git
cd AndreaBozzo
```

Il flag `--recursive` tira giù il submodule del tema Hugo in un colpo solo; se invece cloni senza, `git submodule update --init --recursive` recupera lo stesso stato.

Una volta installati i prerequisiti, puoi lavorare sul blog, sulla landing page o su entrambi senza dover scoprire passi nascosti.

## Lavorare sul Blog Hugo

Il lato blog è un setup Hugo abbastanza standard. Per lo sviluppo locale:

```bash
cd blog
hugo server -D -F
```

Per una build production-like che corrisponda all'ambiente di deploy (anch'essa eseguita da dentro `blog/`):

```bash
hugo --minify -F --config hugo.toml,hugo.github.toml
```

Il file secondario `hugo.github.toml` inietta la base URL specifica di GitHub Pages, tenendo i percorsi di deploy nella configurazione invece che hard-coded nel workflow CI. Lo stesso contenuto e lo stesso tema funzionano in locale e su Pages.

## Lavorare sulla Landing Page Root

La landing page è volutamente framework-free: HTML, CSS e JavaScript puri, supportati da una piccola build pipeline.

Prima, installa le dipendenze Node:

```bash
npm install
```

Poi costruisci e visualizza il sito attraverso la cartella `_site/` assemblata:

```bash
npm run build:site
python3 -m http.server --directory _site 8000
```

Servire `_site/` invece della root del repository è importante, perché `_site/` è esattamente quello che GitHub Pages deploya. Se funziona lì, funzionerà in produzione.

Alcune regole tengono la landing page manutenibile:

- La landing page è HTML, CSS e JavaScript puri; non c'è nessun bundle framework frontend nascosto.
- Gli asset minificati vengono generati (`npm run build:assets`) dalle sorgenti, non modificati direttamente.
- Le pagine case-study sotto `work/` sono generate dai dati, non scritte a mano in HTML.

Quest'ultima regola spinge il modeling dei contenuti in un posto dedicato invece di scaglionarlo su più pagine.

## Generare le Pagine Case-Study con Go

I case study sono definiti una sola volta in `assets/data/case-studies.json`. Un piccolo CLI Go che vive sotto `cmd/harvester` trasforma quel JSON in pagine HTML reali sotto `work/`.

L'harvester ha un ruolo più ampio dei soli case study. È il generatore canonico per i contenuti derivati dal repository e si occupa, tra le altre cose, di:

- Fare ingestion dei dati sorgente per blog post, package, runtime CI, dataset e repo metadata (`ingest --all`).
- Aggiornare il README con i dati delle contribuzioni esterne.
- Produrre artefatti JSON da quelle sorgenti, così che il sito possa renderizzare contribuzioni, writing, package, runtime CI, dataset e repo metadata.
- Generare le pagine case-study sotto `work/` a partire dalla definizione JSON.
- Assemblare un artefatto statico completo per GitHub Pages.
- Validare i link hreflang reciproci sull'intero sito assemblato.

Sul lato Go, è esposto come sottocomandi:

```bash
go run ./cmd/harvester ingest --all
go run ./cmd/harvester generate-case-study-pages
go run ./cmd/harvester generate-static-artifacts
go run ./cmd/harvester validate-localization
```

Sul lato Node ci sono wrapper sottili, così i workflow restano discoverable da `package.json`:

```bash
npm run harvester:readme
npm run harvester:artifacts
npm run generate:case-studies
npm run validate:data
```

`npm run validate:data` applica il gate dei contract schema-versioned sugli artefatti JSON (lo stesso step che `make lint-contracts` esegue in locale e la CI esegue prima del deploy). La regola è semplice: modifica `assets/data/case-studies.json`, rigenera, e non editare `work/*` a mano.

## Il Workbench: JavaScript First, WASM come Acceleratore

La homepage include un piccolo workbench che visualizza i miei progetti e la mia scrittura come un'interfaccia simile a un grafo. Avrei potuto trattarlo come un progetto Rust/WASM-first con uno shell JavaScript sottile; ho invece ribaltato la relazione.

La divisione è:

- JavaScript possiede il fetch degli artefatti JSON, il comportamento del service-worker, lo stato UI (nodo selezionato, topic attivo, testo della query), il rendering DOM e il disegno sul canvas.
- Rust possiede la derivazione deterministica dal payload JSON: normalizzazione degli item, rilevamento dei topic, parsing della query, ranking, conteggi, archi e coordinate del grafo, più i tick di layout opzionali.

Il browser valida la superficie WASM chiamando una funzione esportata `workbench_engine_contract()`. Se la versione del contratto è mancante o incompatibile, il sito resta sul fallback JavaScript implementato in `assets/workbench/view-model.js`.

Quando cambio il lato Rust, il flusso è esplicito:

```bash
cargo test --manifest-path rust/site_engine/Cargo.toml
npm run build:wasm
```

Il principio guida è che WASM è un'ottimizzazione, non un secondo frontend. Fetch, decisioni DOM, styling e policy di interazione restano in JavaScript; Rust non sa nulla del DOM.

## Una Piccola API Companion in Go

L'hosting statico copre la maggior parte di ciò di cui ho bisogno, ma alcune funzionalità beneficiano di un layer API sottile. Il repository include quindi una piccola superficie Go `api/`, che deploy su Vercel mantenendo GitHub Pages come host statico primario.

Attualmente ci sono due endpoint:

- `/api/github/stats` — un riassunto JSON per un utente GitHub.
- `/api/github/badge` — un badge SVG per una singola metrica GitHub.

Entrambi accettano un parametro di query `username` che ha default `AndreaBozzo`. L'endpoint badge accetta anche un parametro `metric` (`stars`, `repos`, `followers`, `top-repo`). Un `GITHUB_API_TOKEN` opzionale (con `GITHUB_TOKEN` come fallback) aumenta il rate-limit headroom verso la GitHub API.

La homepage statica scopre la companion API attraverso un meta tag `ab-api-base` in `index.html`. In produzione punta all'hostname Vercel che serve la cartella `api/`, mentre GitHub Pages resta l'origin statico. Lasciandolo vuoto si torna a richieste same-origin, comodo per le preview Vercel dove l'API è co-hostata con il sito.

Il modello di lungo termine è semplice:

- GitHub Pages serve il sito statico e il blog.
- Vercel serve solo la cartella `api/`.

Le preoccupazioni statiche e quelle dinamiche restano fisicamente separate ma logicamente collegate.

## Makefile e Comandi Comuni

Per tenere i workflow discoverable, la root del repository include un Makefile che raggruppa i task principali:

```bash
make lint        # JS, SVG, Go vet, Rust clippy, JSON, contracts, whitespace
make test        # test Go e Rust
make fmt         # formattazione Go e Rust
make fmt-check   # solo i check di formattazione
make check       # fmt-check + lint + test
make build-site  # artefatto Pages locale completo
```

In pratica, `make check` è quello che lancio prima di aprire una PR, e `make build-site` è quello che uso quando voglio un `_site/` locale che corrisponda al deploy Pages.

Sotto il cofano questi target delegano semplicemente a npm, Go, Cargo e Hugo, ma forniscono una superficie stabile man mano che il progetto cresce.

## Un Sito Bilingue, Validato in CI

Il sito esce in inglese e italiano: ogni case study e ogni blog post hanno sia una sorgente `.en` che una `.it`, e la landing page ha un `it/index.html` parallelo più un albero `it/work/` di case study localizzati. Uno switch di lingua nell'header collega le due superfici.

Per tenere oneste le due metà, l'harvester espone un sottocomando `validate-localization` (invocabile anche come `npm run validate:localization`) che cammina l'`_site/` assemblato e controlla che ogni pagina dichiari link hreflang reciproci verso la sua controparte. Gira come parte di `npm run build:site`, quindi una traduzione mancante o un link alternate rotto fa fallire la build prima che arrivi su GitHub Pages.

Sopra a questo, il workflow di deploy lancia smoke test Playwright contro l'artefatto buildato in locale. Non sono una coverage end-to-end esaustiva, ma colgono le regressioni più ovvie - landing page bianca, workbench rotto, route localizzate mancanti - prima che un deploy esca.

## Deploy via GitHub Pages

La pubblicazione è gestita da un workflow GitHub Actions che rispecchia la build locale:

1. Checkout del repository e dei suoi submodule.
2. Validazione dei contract dati schema-versioned.
3. Esecuzione degli smoke test visivi Playwright.
4. Build del blog con Hugo e assemblaggio di `_site/` via `npm run build:site`.
5. Deploy di `_site/` su GitHub Pages.

Poiché il workflow segue gli stessi passi di `npm run build:site` seguito dal servire `_site/`, debuggare un deploy rotto di solito significa solo riprodurlo in locale.

## Linee Guida di Editing per il Me Futuro

Una delle parti più utili di questo progetto è la guida di editing che ho scritto per me stesso:

- Tieni separate le responsabilità della landing page root e del blog, sia nel codice che nella configurazione.
- Preferisci editare i file sorgente (`assets/main.js`, `assets/styles.css`, `assets/data/case-studies.json`) invece di toccare gli artefatti generati in `_site/` o `work/`.
- Documenta ogni cambiamento ai path di deploy o ai workflow sia in `README.md` che in `CONTRIBUTING.md`.

L'obiettivo è semplice: voglio poter sparire per qualche mese, tornare, e sapere ancora come aggiungere in sicurezza un case study, modificare una visualizzazione o ritoccare un deploy senza dover fare reverse-engineering delle mie stesse decisioni.

## Riflessioni di Chiusura

Il payoff del trattare questo come un progetto vero è per lo più invisibile da fuori, ma lo sento ogni volta che tocco il repo: posso aggiungere un case study senza pensarci, scambiare una visualizzazione senza rompere il blog, e fidarmi del fatto che una CI verde significhi un deploy funzionante. I pattern qui - contract JSON, HTML code-generated, WASM come acceleratore opzionale, contenuti bilingui validati in CI e una piccola API Go companion - sono abbastanza piccoli da essere noiosi e abbastanza generali da continuare a tornarmi utili in altri progetti.

Se vuoi vedere gli stessi istinti applicati a sistemi più grandi, l'[articolo su Ceres](/AndreaBozzo/blog/posts/ceres-blog/) racconta semantic search sopra a sorgenti open-data tipate, [Lakekeeper](/AndreaBozzo/blog/posts/lakekeeper-blog/) mostra la divisione Rust-first / glue sottile a scala lakehouse, e [Harvesting vs Scraping](/AndreaBozzo/blog/posts/harvesting-vs-scraping-blog/) rivisita il pattern harvester in un dominio molto diverso. Problemi diversi; la stessa manciata di mosse.
