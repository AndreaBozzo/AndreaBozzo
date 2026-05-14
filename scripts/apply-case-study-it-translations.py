#!/usr/bin/env python3
"""One-shot injector for case-studies.json Italian translations.

Run once: it loads assets/data/case-studies.json, attaches a translations.it
block to every item, and writes the file back. Safe to re-run: each item's
translations.it is replaced wholesale from the table below.

Translation policy:
- Technical proper nouns (Arrow, DataFusion, Iceberg, NATS JetStream, dbt,
  Superset, MinIO, no_std, JetBrains/Apache project names, language names like
  Rust/Python/Go) stay in English.
- Prose is translated idiomatically; we trade literal word-for-word fidelity
  for readable Italian. Sentences are restructured where Italian grammar makes
  the English construction awkward.
"""
import json
import sys
from collections import OrderedDict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "assets" / "data" / "case-studies.json"

TRANSLATIONS = {
    "dataprof": {
        "title": "dataprof",
        "displayTitle": "dataprof",
        "subtitle": "Profilazione dati Arrow-nativa con memoria limitata e metriche di qualità adatte a pipeline reali.",
        "summary": "Una libreria Rust, una CLI e un pacchetto Python che profilano dati tabulari attorno a batch Arrow invece dei soli pattern di ispezione da notebook, producendo output machine-readable utilizzabili in CI e in workflow dati.",
        "metaDescription": "dataprof: profilazione Arrow-nativa per dati tabulari, con CLI Rust, pacchetto Python e output utilizzabili in CI.",
        "status": "Progetto OSS attivo",
        "coverEyebrow": "Profilazione Arrow-nativa",
        "coverText": "Un profiler che si comporta più come un piccolo motore analitico: Arrow in memoria, I/O Parquet-friendly e output che sopravvivono fuori dai notebook.",
        "coverAlt": "Diagramma architetturale ad alto livello di dataprof",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "La profilazione dovrebbe essere qualcosa che un team può eseguire dentro la CI, in controlli pianificati o in workflow batch, non un rituale da notebook che crolla su tabelle larghe o file più grandi. dataprof esiste per rendere la prima domanda su un dataset economica e ripetibile: che forma ha, dove sono le colonne sospette e cosa si può verificare di nuovo la prossima volta che il file o la tabella cambia?"
            },
            {
                "heading": "Centro tecnico",
                "body": "dataprof tratta gli array Arrow e i RecordBatch come astrazione di base, così metriche per colonna, riconoscimento di tipi e pattern, interoperabilità Parquet e IPC e il futuro layer SQL via DataFusion si allineano tutti sullo stesso modello in memoria. Questa scelta tiene il core Rust vicino allo storage analitico moderno lasciando però interfacce pulite per una CLI, un pacchetto Python e report machine-readable consumabili da altri strumenti."
            },
            {
                "heading": "Prove correnti",
                "body": "La superficie pubblica mostra già la forma reale del progetto: un crate Rust, una CLI e un pacchetto PyPI, metriche selettive per run più economici, esecuzione a memoria limitata e una storia di design centrata su Arrow che ha portato a due PR di documentazione upstream su arrow-rs per Parquet invece di un workaround privato. La parte importante non è solo che profila dati, ma che il progetto viene spinto verso gli stessi luoghi operativi in cui i controlli di qualità dei dati devono effettivamente vivere."
            },
        ],
    },
    "apache-rust-upstream": {
        "title": "Apache Rust Upstream",
        "subtitle": "Contribuzioni upstream su Arrow, DataFusion, Iceberg Rust e Fluss Rust guidate dal lavoro reale sui sistemi downstream.",
        "summary": "Un case study orientato alla contribuzione che usa i progetti Apache Rust come luogo in cui risolvere vincoli ricorrenti di sistema: comportamento dei reader Parquet in arrow-rs, superfici del motore di query in DataFusion, semantica delle tabelle in iceberg-rust e integrazione del client streaming in fluss-rust.",
        "metaDescription": "Contribuzioni upstream su Apache Arrow, DataFusion, Iceberg Rust e Fluss Rust legate ai vincoli reali dei sistemi downstream.",
        "status": "Traccia di contribuzione upstream",
        "coverEyebrow": "Upstream per necessità",
        "coverText": "Quando i tool locali raggiungono i limiti del substrato, la correzione giusta è spesso scendere di un livello e migliorare il progetto Apache sottostante invece di portarsi dietro il problema in privato.",
        "coverAlt": "Mappa delle contribuzioni su arrow-rs, DataFusion, iceberg-rust e fluss-rust",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "Il valore del lavoro di contribuzione upstream non è collezionare loghi di progetti. È usare il substrato effettivo dei propri sistemi come luogo in cui rimuovere attriti ricorrenti, invece di portarsi dietro fork, documentazione custom o patch private per sempre. Per il lavoro dati in Rust quel substrato è sempre più condiviso tra progetti: memoria Arrow, esecuzione DataFusion, metadata delle tabelle Iceberg e client streaming diventano parte della stessa catena pratica di dipendenze."
            },
            {
                "heading": "Centro tecnico",
                "body": "Questa traccia di contribuzioni copre gli strati bassi dello stack dati Rust: comportamento ed esempi dei reader Parquet in arrow-rs, superfici di esecuzione query Arrow-native in DataFusion, metadata delle tabelle e interoperabilità in iceberg-rust e lavoro su client streaming e integrazione in fluss-rust. Il lavoro è volutamente vicino alle interfacce e agli esempi perché sono i punti in cui i tool downstream diventano facili da costruire o ereditano silenziosamente edge case confusi."
            },
            {
                "heading": "Prove correnti",
                "body": "Il repository pubblico mostra già un'impronta concreta invece di una vaga affiliazione: 2 PR tracciate per apache/arrow-rs, 1 per apache/datafusion, 3 per apache/iceberg-rust e 2 per apache/fluss-rust. Il lavoro su Arrow e Iceberg è anche raccontato in articoli lunghi, e questo conta perché la scia delle contribuzioni viene ricollegata a tool downstream come dataprof e agli esperimenti streaming lakehouse, invece di rimanere come pull request isolate."
            },
        ],
    },
    "ares-ceres": {
        "title": "Ares + Ceres",
        "subtitle": "Harvesting open-data ed estrazione LLM come sistemi di raccolta complementari.",
        "summary": "Ceres mantiene sincronizzati nel tempo i metadati dei portali, mentre Ares trasforma pagine arbitrarie in dati strutturati guidati da schema, con code, retry e change detection.",
        "metaDescription": "Ares + Ceres: due sistemi complementari per raccolta open-data ed estrazione LLM su schema, con code, retry e change detection.",
        "status": "Coppia di repo attivi",
        "coverAlt": "Confronto architetturale tra Ares e Ceres",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "Harvesting e scraping sono contratti operativi diversi, e trattarli come se fossero la stessa cosa di solito peggiora entrambi i sistemi. Ceres riguarda la sincronizzazione rispettosa e ripetibile da portali open-data noti, mentre Ares riguarda l'estrazione di struttura da pagine web meno prevedibili, dove comportamento di fetch, drift di schema e retry devono essere parti esplicite del sistema."
            },
            {
                "heading": "Centro tecnico",
                "body": "Ceres si concentra sulla sincronizzazione incrementale dei portali e sulla durabilità del catalogo, mentre Ares si focalizza su pipeline di fetch, normalizzazione markdown, estrazione JSON Schema, retry ed esecuzione guidata da code. Separare i due tool mantiene onesta l'architettura: un lato ottimizza per freschezza ed esportabilità del catalogo, l'altro per run di estrazione controllati che sopravvivono a fallimenti parziali e a strutture di pagina che cambiano."
            },
            {
                "heading": "Prove correnti",
                "body": "La distinzione è già concreta nei README: Ceres offre sincronizzazione incrementale dei portali, modalità metadata-only, export e ricerca semantica opzionale, mentre Ares offre estrazione guidata da schema, change detection, queue worker, sessioni di crawl ed endpoint API protetti per orchestrare lo scraping. Insieme descrivono uno stack di raccolta in cui l'ingestion non è solo prendere byte, ma preservare la promessa operativa dietro ogni sorgente."
            },
        ],
    },
    "mosaico": {
        "title": "Mosaico",
        "subtitle": "Lavoro di contribuzione su una piattaforma dati open per robotica e AI fisica.",
        "summary": "Un case study orientato alla contribuzione su confini di workflow, ergonomia per sviluppatori e superfici di integrazione di piattaforma dati in Mosaico.",
        "metaDescription": "Mosaico: contribuzioni su una piattaforma dati open per robotica e physical AI, focalizzate su workflow boundary ed ergonomia SDK.",
        "status": "Contribuzione upstream",
        "coverAlt": "Diagramma architetturale di Mosaico",
        "sections": [
            {
                "heading": "Perché conta",
                "body": "I sistemi di robotica e physical-AI hanno bisogno di primitive di piattaforma dati che restino comprensibili quando gli esperimenti diventano operazioni reali. La pressione interessante è che questi sistemi sono insieme ambienti di ricerca e candidati per la produzione: i team hanno bisogno di iterazione veloce, ma anche di dataset riproducibili, job affidabili e interfacce che non collassino quando più ingegneri iniziano a dipenderne."
            },
            {
                "heading": "Centro tecnico",
                "body": "Il lavoro interessante sta ai confini dell'integrazione: come l'orchestrazione resta flessibile abbastanza per la sperimentazione restando debug-friendly per l'ingegnere successivo. In Mosaico questo significa prestare attenzione ai contratti SDK e backend, al comportamento della CI, all'ergonomia delle query e ai punti in cui il codice di piattaforma deve supportare workflow di robotica reali e disordinati senza nascondere troppo dietro la magia."
            },
            {
                "heading": "Prove correnti",
                "body": "Questo è già più di un riassunto di piattaforma: la cronologia visibile delle contribuzioni cade esattamente sui confini di workflow che contano nei sistemi di robotica, dove affidabilità della CI, ergonomia delle query e compatibilità SDK-server determinano se il tooling dati resta usabile dall'ingegnere successivo. Il case study è utile perché tratta il lavoro di contribuzione come modo per capire una piattaforma dall'interno, invece che come panoramica distaccata."
            },
        ],
    },
    "zero-grappler": {
        "title": "Zero Grappler",
        "subtitle": "Pipeline async minimali sensor-to-inference no_std per Rust embedded.",
        "summary": "Un crate prototipo per cablare fonti async, trasformazioni DSP e stadi di inferenza attraverso canali Embassy con zero allocazioni.",
        "metaDescription": "Zero Grappler: pipeline async no_std per sensori e inferenza in Rust embedded, basate su canali Embassy e zero allocazioni.",
        "status": "Crate prototipo",
        "coverAlt": "Architettura della pipeline Zero Grappler",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "Gli esempi di ML embedded spesso intrecciano accesso hardware, estrazione di feature e logica di inferenza, rendendo il riuso più difficile di quanto dovrebbe essere. Zero Grappler esiste per separare presto queste responsabilità, così una pipeline da sensore può essere ragionata come stadi di source, transform e inference invece che come una singola demo accoppiata che funziona solo su una board."
            },
            {
                "heading": "Centro tecnico",
                "body": "Il crate divide la pipeline in tre trait, tiene le dimensioni dei buffer fissate a compile-time, instrada gli stadi attraverso canali Embassy ed evita completamente l'allocazione su heap. Quella struttura è intenzionalmente noiosa nel miglior senso embedded: i tipi portano i vincoli sui buffer, i task async portano il modello di scheduling e il percorso di runtime resta compatibile con target no_std."
            },
            {
                "heading": "Prove correnti",
                "body": "Anche prima della prima demo completa su board, il design è già ancorato dalla separazione dei trait senza allocazione, dai wrapper monomorfi per i task Embassy, dall'esempio mock lato host e da una distinta materiali documentata che mantiene realistico il primo loop hardware pubblico invece di renderlo ipotetico. La prossima prova significativa non è un'astrazione più grande, ma un piccolo loop end-to-end da sensore che mostri la separazione dei trait sopravvivere al contatto con limiti reali di tempo e memoria."
            },
        ],
    },
    "nephtys": {
        "title": "Nephtys",
        "subtitle": "Un connettore real-time per stream di eventi live e integrazioni edge.",
        "summary": "Un servizio Go che ingerisce stream WebSocket, webhook, SSE e gRPC, normalizza gli eventi e li pubblica su NATS JetStream con persistenza durabile e metriche operative.",
        "metaDescription": "Nephtys: servizio Go per ingestion real-time da WebSocket, webhook, SSE e gRPC verso NATS JetStream con metriche e persistenza.",
        "status": "Progetto OSS attivo",
        "coverEyebrow": "Connettori real-time",
        "coverText": "Ingestion WebSocket, webhook, SSE e gRPC normalizzata in un'unica pipeline di eventi durabile.",
        "coverAlt": "Logo del progetto Nephtys",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "Interfacce live come webhook, WebSocket, SSE e gRPC hanno tutte stranezze operative diverse, ma i sistemi downstream hanno comunque bisogno di un contratto di evento stabile. Nephtys esiste per la parte del lavoro streaming che è facile sottovalutare: i connettori devono essere configurabili, osservabili, riavviabili e abbastanza noiosi perché il resto della piattaforma possa fidarsi degli eventi che emettono."
            },
            {
                "heading": "Centro tecnico",
                "body": "Nephtys gestisce il ciclo di vita dei connettori, normalizza gli eventi in ingresso, li persiste su NATS JetStream ed espone una REST API in modo che la gestione degli stream sia operabile invece che hardcoded. Il design poggia su subject durabili, un ordine esplicito del middleware ed endpoint di gestione, così ogni connettore può essere trattato come unità operativa invece che come goroutine in background nascosta dentro un'applicazione."
            },
            {
                "heading": "Prove correnti",
                "body": "La storia operativa è già presente nel materiale pubblico: matrici dei connettori supportati, ordine del middleware, REST API di gestione, supporto a Prometheus e Grafana e un paper UIC 2026 che inquadra l'ingestion di sensori urbani come primo percorso concreto di valutazione. Questo rende il progetto più di una lista di connettori; è un piccolo control plane per trasformare interfacce live esterne in eventi che possono essere replayati, ispezionati e instradati downstream."
            },
        ],
    },
    "dce": {
        "title": "DCE",
        "subtitle": "Enforcement proattivo dei data contract costruito dal core di profilazione di dataprof.",
        "summary": "Un motore Rust-native per definire, validare ed enforce data contract sui formati di tabella moderni, spostando i controlli di qualità dalla profilazione a posteriori all'esecuzione di contratti.",
        "metaDescription": "DCE: motore Rust-native per definire e applicare data contract su formati di tabella moderni, costruito dal core di dataprof.",
        "status": "Motore pre-release",
        "coverEyebrow": "Enforcement dei contratti",
        "coverText": "Passare dalla profilazione reattiva a contratti espliciti che possono fallire in fretta dentro i workflow dati.",
        "coverAlt": "Logo del progetto DCE",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "La profilazione è utile a posteriori, ma le piattaforme dati hanno bisogno anche di un modo esplicito per definire cosa deve essere vero prima che le pipeline vadano avanti. DCE estende la linea di lavoro di dataprof verso l'enforcement: invece di solo descrivere un dataset, il sistema deve poter far fallire un run quando i contratti su schema, qualità o semantica della tabella vengono violati."
            },
            {
                "heading": "Centro tecnico",
                "body": "DCE cresce da dataprof spostandosi dall'osservazione all'enforcement: definizioni di contratti, comandi di validazione e controlli consapevoli del formato di tabella diventano il centro del workflow. La sfida tecnica è tenere i contratti abbastanza espressivi per piattaforme dati reali rendendoli al tempo stesso pratici da eseguire da CLI, job CI o futuri layer di orchestrazione, senza creare un altro prodotto di governance pesante."
            },
            {
                "heading": "Prove correnti",
                "body": "Lo spostamento da profiler a contract engine è già visibile nel repo pubblico tramite validazione Iceberg-aware, limitazioni note esplicite per formati non-Iceberg, 194 test tra i package e una roadmap che rende esplicite le prossime tappe su esecuzione SQL e validazione multi-formato. Il segnale utile è che le limitazioni sono documentate accanto all'implementazione, e questo tiene il progetto onesto su cosa può essere enforced oggi e cosa ha ancora bisogno di lavoro ingegneristico."
            },
        ],
    },
    "lakehouse-starter-kit": {
        "title": "Open Lakehouse Starter",
        "subtitle": "Uno stack lakehouse per piccoli team con dlt, dbt, Superset e MinIO.",
        "summary": "Un ambiente starter open per piccoli team che combina ingestion, trasformazione, storage e dashboard in un setup lakehouse leggero ma espandibile.",
        "metaDescription": "Open Lakehouse Starter: stack lakehouse leggero ed espandibile per piccoli team, basato su dlt, dbt, Superset e MinIO.",
        "status": "Piattaforma starter",
        "coverEyebrow": "Lakehouse per piccoli team",
        "coverText": "Uno stack starter pratico per ingestion, trasformazioni, dashboard e storage S3-compatibile, senza overhead enterprise.",
        "coverAlt": "Screenshot di Open Lakehouse Starter",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "I piccoli team hanno spesso bisogno di un lakehouse usabile prima di aver bisogno della complessità di piattaforma, quindi la vera sfida è scegliere uno stack che parta leggero senza chiudere il team in un angolo. Questo starter esiste per il momento prima che un team abbia un gruppo di piattaforma completo: serve comunque ingestion, trasformazioni, dashboard e object storage, ma in una forma che si possa capire e sostituire pezzo per pezzo."
            },
            {
                "heading": "Centro tecnico",
                "body": "Il progetto combina ingestion con dlt, trasformazioni con dbt, dashboard con Superset e object storage su MinIO in un setup volutamente semplice all'inizio ed espandibile dopo. Ogni componente ha un lavoro chiaro: dlt sposta i dati in ingresso, dbt rende esplicite le trasformazioni, Superset dà feedback analitico immediato e MinIO tiene il percorso di storage vicino ai pattern di produzione S3-compatibili."
            },
            {
                "heading": "Prove correnti",
                "body": "Il repo contiene già il primo vero set di artefatti: uno screenshot pubblicato, uno stack compose eseguibile, un esempio di pipeline dlt verso un'API, modelli dbt staged e credenziali locali per MinIO e Superset, che rendono concreto invece che aspirazionale il percorso di bootstrap per un piccolo team. La prossima pressione importante è documentazione ed esempi che mostrino come uno starter piccolo può crescere verso un catalogo, controlli di qualità e costi più forti senza perdere il setup locale semplice."
            },
        ],
    },
    "lakekeeper": {
        "title": "Lakekeeper",
        "subtitle": "Un catalogo Iceberg REST in Rust con credenziali vended, OpenFGA e un'impronta operativa piccola.",
        "summary": "Un case study sul layer di catalogo Rust-native che rende governabile lo storage lakehouse open: metadata delle tabelle, autorizzazione, credenziali temporanee e interoperabilità multi-engine senza un control plane pesante in JVM.",
        "metaDescription": "Lakekeeper: catalogo Iceberg REST in Rust con OpenFGA, credenziali vended e interoperabilità multi-engine per lakehouse governati.",
        "status": "Contribuzione open source",
        "coverEyebrow": "Control plane lakehouse governato",
        "coverText": "Un layer di catalogo Rust-native che trasforma l'object storage in un sistema Iceberg governato, con credenziali temporanee, auth fine-grained e accesso multi-engine.",
        "coverAlt": "Panoramica architetturale di Lakekeeper",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "Object storage e formati di tabella aperti non bastano da soli. Un lakehouse pratico ha comunque bisogno di un catalogo che possa gestire i metadata, applicare i controlli di accesso e restare abbastanza aperto da funzionare attraverso engine e modelli di deploy diversi. Lakekeeper conta perché mette il control plane attorno alle tabelle Iceberg in un servizio Rust-native ragionabile come infrastruttura, invece che come estensione opaca di un motore di calcolo."
            },
            {
                "heading": "Centro tecnico",
                "body": "Lakekeeper implementa il catalogo Iceberg REST in Rust, abbinando metadata su Postgres con autenticazione OIDC, autorizzazione OpenFGA, credenziali cloud vended, CloudEvents e un modello di deploy molto più leggero degli stack di catalogo orientati alla JVM. L'architettura è interessante perché il catalogo non è solo un servizio di lookup: diventa il posto in cui identità, accesso temporaneo allo storage, gestione dei namespace e interoperabilità cross-engine si incontrano."
            },
            {
                "heading": "Prove correnti",
                "body": "L'impronta pubblica è già concreta: un long-form architetturale, interoperabilità documentata con RisingWave, integrazioni con engine esterni e piattaforme managed, una cadenza di release mensile e 2 PR mergiate tracciate nel README del repository, invece di una vaga rivendicazione di familiarità. Il case study è particolarmente utile come controparte a livello di catalogo del lavoro sullo stack dati Rust: mostra dove metadata di tabella, governance e accesso degli engine smettono di essere astratti e diventano interfacce operative."
            },
        ],
    },
    "peek-a-boo": {
        "title": "Peek-a-Boo",
        "subtitle": "Un agente AI minimalista per ricerca chirurgica e estrazione su file.",
        "summary": "Un agente Python che usa operazioni grep e ls focalizzate per rispondere a domande sulla codebase con un costo in token più basso rispetto a scansioni di repository ampie.",
        "metaDescription": "Peek-a-Boo: agente AI Python che usa operazioni grep e ls mirate per ricerche su codebase con costo in token più basso.",
        "status": "Prototipo focalizzato",
        "coverEyebrow": "Agenti token-efficient",
        "coverText": "Usa operazioni chirurgiche su file invece di dump ampi di contesto quando il compito è trovare velocemente una risposta.",
        "coverAlt": "Esempio di run di una mission Peek-a-Boo",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "Molti task di ricerca su codice non hanno bisogno di un embedding dell'intero repo o di un prompt gigante, hanno bisogno di un agente economico che possa fare domande più ristrette in sequenza. Peek-a-Boo esiste per quella classe di lavoro stretta ma comune: trovare i file rilevanti, ispezionare giusto il contesto necessario e produrre una risposta senza trasformare l'intero repository in input per il modello."
            },
            {
                "heading": "Centro tecnico",
                "body": "Peek-a-Boo mantiene la superficie degli strumenti intenzionalmente piccola, appoggiandosi a operazioni in stile grep e a traversal focalizzati, così il modello spende token sulla sintesi invece che sul contesto grezzo del repository. Il vincolo è il prodotto: limitando le azioni disponibili e delimitando la ricerca, l'agente deve comportarsi più come un revisore di codice attento che come un sintetizzatore generico."
            },
            {
                "heading": "Prove correnti",
                "body": "Il progetto si comporta già come un prototipo a forma di benchmark: quattro mission built-in, una codebase target generata, limiti di sicurezza che impediscono esplosioni di token e una superficie di strumenti volutamente stretta che rende l'argomento del risparmio di token ispezionabile nel codice e non solo nella prosa. Questo lo rende un esperimento utile sull'ergonomia degli agenti, perché il criterio di successo non è l'astuzia del modello in astratto, ma se il loop dello strumento trovi le giuste evidenze con meno spreco di contesto."
            },
        ],
    },
    "lance-bridge": {
        "title": "Lance Bridge",
        "subtitle": "Indicizzazione semantica da stream di eventi live verso LanceDB senza tirare su un database vettoriale separato.",
        "summary": "Un bridge Python che consuma batch di eventi JetStream, li normalizza in uno schema LanceModel, calcola gli embedding e li scrive in LanceDB, così uno stream live diventa una superficie locale di ricerca semantica.",
        "metaDescription": "Lance Bridge: bridge Python che porta stream JetStream in LanceDB con embedding e ricerca semantica locale, senza vector DB separato.",
        "status": "Prototipo focalizzato",
        "coverEyebrow": "Hot vector layer",
        "coverText": "Prendi un feed JetStream live, calcola gli embedding e tienilo interrogabile dentro uno store LanceDB locale che parla ancora Arrow nativamente.",
        "coverAlt": "Cover di Lance Format e LanceDB",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "C'è un divario ricorrente tra stream di eventi live e ricerca semantica a basso footprint. Molti team vogliono embedding su eventi freschi, ma non l'overhead operativo di un cluster di database vettoriale separato. Lance Bridge esplora il percorso più sottile: tenere il feed eventi durabile in JetStream e poi proiettare gli eventi selezionati in uno store LanceDB locale che si può cercare semanticamente senza diventare un'altra piattaforma intera."
            },
            {
                "heading": "Centro tecnico",
                "body": "Il bridge consuma batch JetStream, normalizza i payload, calcola gli embedding con il model registry di LanceDB o con chiamate esplicite di batch embedding, e scrive righe LanceModel in uno store locale che si può poi interrogare come tabelle Arrow. Il centro tecnico è il passaggio: gli eventi di stream hanno bisogno di identificatori stabili, normalizzazione del payload, metadata di embedding e scelte di layout dello storage che rendano comunque possibili compattazione successiva e letture zero-copy."
            },
            {
                "heading": "Prove correnti",
                "body": "L'articolo pubblico espone già la vera superficie ingegneristica invece di vaghe promesse: il modello di schema, il flow di embedding, l'handler dei messaggi NATS, le note sulla compattazione, le letture Arrow zero-copy e 2 PR tracciate in lance-format/lance che mostrano familiarità diretta con gli interni dello storage. Il bridge è intenzionalmente piccolo, ma collega due idee utili: i sistemi a eventi sono bravi sulla freschezza e Lance è bravo sull'accesso analitico e vettoriale locale."
            },
        ],
    },
    "druid-datafusion-bridge": {
        "title": "druid-datafusion-bridge",
        "subtitle": "Interroga i segmenti Apache Druid direttamente attraverso DataFusion.",
        "summary": "Un bridge Rust che legge direttamente i file di segmento Druid e li espone a DataFusion come tabelle interrogabili senza richiedere un cluster Druid in esecuzione.",
        "metaDescription": "druid-datafusion-bridge: bridge Rust che legge segmenti Apache Druid direttamente e li espone come tabelle DataFusion.",
        "status": "Lavoro in corso",
        "coverEyebrow": "Analytics segment-native",
        "coverText": "Leggi gli interni dei segmenti Druid direttamente e portali in DataFusion come tabelle, senza tirare su il cluster originale.",
        "coverAlt": "Logo del progetto druid-datafusion-bridge",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "I motori di query diventano più riutilizzabili quando i formati di storage si possono ispezionare direttamente invece che solo attraverso il sistema di serving originale. I segmenti Druid contengono anni di ingegneria analitica utile, ma sono normalmente affrontati attraverso un cluster Druid in esecuzione; questo progetto si chiede cosa diventa possibile quando quei file di segmento si possono leggere direttamente da uno stack di query Rust."
            },
            {
                "heading": "Centro tecnico",
                "body": "La libreria legge le strutture dei segmenti Druid come i dati index.dr e le mappa nelle astrazioni di tabella ed esecuzione di DataFusion, puntando a un'esecuzione vettorializzata e Arrow-friendly dove possibile. La parte difficile è tradurre interni di storage, dizionari, metriche e pattern di accesso bitmap-oriented nelle astrazioni di DataFusion senza fingere che il formato originale sia stato progettato come un semplice file Arrow."
            },
            {
                "heading": "Prove correnti",
                "body": "Anche da lavoro in corso, la superficie di valutazione è già concreta: un layer parser dedicato per i segmenti, adattatori `TableProvider` ed `ExecutionPlan` per DataFusion, fixture su segmenti Wikipedia e test di integrazione sull'accesso offline ai segmenti, invece di affermazioni architetturali vaghe. Il valore corrente è esplorativo ma specifico: ogni parser e adattatore chiarisce quanto del modello di segmento Druid può essere esposto attraverso le interfacce Arrow e DataFusion moderne."
            },
        ],
    },
    "andreabozzo-site": {
        "title": "AndreaBozzo",
        "subtitle": "Una porta d'ingresso pubblica che combina portfolio, blog, workbench, generatori e una companion API.",
        "summary": "Questo repository è insieme il sito personale e il sistema dietro: una landing page costruita a mano, un blog Hugo, un knowledge workbench Rust/WASM, generatori Go per artefatti statici e una piccola API GitHub stats hostata su Vercel.",
        "metaDescription": "AndreaBozzo: il sito personale come sistema, con landing page handcrafted, blog Hugo, workbench Rust/WASM, generatori Go e API GitHub stats su Vercel.",
        "status": "Sistema live",
        "coverEyebrow": "Portfolio come sistema",
        "coverText": "Un singolo repo che fa da landing page, blog, archivio del lavoro generato e companion API, invece di essere un sito brochure statico.",
        "coverAlt": "Diagramma architetturale del sito AndreaBozzo che mostra landing page, blog Hugo, workbench Rust e WebAssembly, harvester Go, GitHub Pages e companion API Vercel",
        "sections": [
            {
                "heading": "Perché esiste",
                "body": "Un sito personale non dovrebbe essere una pagina profilo sottile se il lavoro stesso è lavoro di sistemi. Questo repository è pensato per funzionare come porta d'ingresso pubblica, archivio di scrittura ed esempio concreto di come mi piace strutturare strumenti e piattaforme. Il sito è quindi trattato come un vero sistema: il contenuto è generato da sorgenti strutturate, il workbench ha dietro un motore Rust/WASM e il percorso di deploy è parte della storia invece che un dopo-pensiero."
            },
            {
                "heading": "Forma del sistema",
                "body": "Il sito root è HTML, CSS e JavaScript puri, la scrittura lunga vive in un blog Hugo, la logica interattiva del workbench è specchiata tra JavaScript e Rust compilato a WebAssembly, e le pagine work generate vengono da JSON strutturato invece che da HTML mantenuto a mano. Quella separazione tiene la superficie pubblica veloce e ispezionabile permettendo però tooling più ricco dietro: i generatori Go costruiscono artefatti, il blog organizza i post lunghi e la homepage può comportarsi come una piccola applicazione."
            },
            {
                "heading": "Centro tecnico",
                "body": "Il repository ora usa un harvester Go per generare artefatti di case study e di contribuzioni, GitHub Actions per assemblare e pubblicare il sito statico su GitHub Pages e una piccola API Go su Vercel per esporre statistiche GitHub live ed endpoint badge che la homepage può consumare. Il centro tecnico è il confine tra affidabilità statica e dati live: la maggior parte del sito resta cacheable e semplice, mentre la companion API gestisce i pezzi che davvero hanno bisogno di cambiare."
            },
            {
                "heading": "Prove correnti",
                "body": "Il repository espone già l'intero percorso pubblico del sistema: JSON strutturato e l'harvester Go generano gli artefatti di work e contribuzioni, Hugo costruisce il blog, la logica del workbench è specchiata in JavaScript e Rust/WASM, e GitHub Pages più l'API Vercel separano la delivery statica dalle statistiche GitHub live. Questo rende il sito utile sia come portfolio sia come implementazione ispezionabile delle stesse preferenze di design mostrate nel lavoro: input tipati, output generati, servizi piccoli e confini di deploy chiari."
            },
        ],
    },
}


def main() -> int:
    with SOURCE.open() as f:
        data = json.load(f, object_pairs_hook=OrderedDict)

    missing = []
    for item in data["items"]:
        slug = item["slug"]
        if slug not in TRANSLATIONS:
            missing.append(slug)
            continue
        item["translations"] = OrderedDict([("it", TRANSLATIONS[slug])])

    if missing:
        print("Missing translations for slugs:", missing, file=sys.stderr)
        return 1

    with SOURCE.open("w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Wrote translations.it for {len(TRANSLATIONS)} case studies")
    return 0


if __name__ == "__main__":
    sys.exit(main())
