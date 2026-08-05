---
title: "dbt si è riscritto in Rust. La velocità è la parte noiosa."
date: 2026-08-04T10:00:00+02:00
draft: false
tags: ["dbt", "Rust", "DuckDB", "Apache Arrow", "DataFusion", "Iceberg", "Open Source", "Data Engineering"]
categories: ["Data Engineering", "Open Source"]
keywords: ["dbt Core v2", "dbt Fusion", "SDF Labs", "Rust", "DuckDB", "Iceberg REST", "AWS Glue", "DataFusion", "artefatti Parquet", "contributi open source"]
description: "Sul branch main di dbt Core non è rimasto nemmeno un motore Python. 77 crate Rust, 18 file .py sparsi, nessun runtime. Tutti parlano dei tempi di parsing. I tempi di parsing sono la cosa meno interessante che è successa."
summary: "Ho aperto una segnalazione di bug su dbt e ho trovato una codebase di cui nessuno mi aveva parlato: 77 crate Rust dove prima c'era il Python. Questo è a cosa serve davvero la riscrittura, perché il marketing la sottovende, e cosa ho smosso frugandoci dentro — due fix, entrambi per bug che non hanno mai stampato un errore."
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
    image: "images/dbt-fusion-cover.png"
    alt: "dbt Core v2: 77 crate Rust, 18 file Python, nessun runtime Python"
    caption: "Sono entrati due motori. Ne è uscito uno, sotto Apache 2.0."
    relative: false
    hidden: false
---

Sono andato a sistemare un bug di una riga in dbt e sono finito a leggere un file C++ di
un'estensione DuckDB a mezzanotte, che non è esattamente dove pensavo sarebbe andata a finire
la serata.

Il viaggio è cominciato con una sorpresa. Clona `dbt-labs/dbt-core`, passa su `main`, e il
motore Python non c'è più. Non ridotto — sparito. Il workspace Cargo elenca 77 crate. L'intero
repository contiene 18 file `.py` e nemmeno uno è una CLI. Il dbt Python che gira in produzione
nella tua azienda è ancora vivo e ancora rilasciato, ma ha cambiato casa: adesso abita sul
branch `1.latest`. `main` è dbt Core v2.0, in alpha da giugno 2026, Rust dal parser degli
argomenti in giù.

Mentre ero là dentro ho contribuito due fix. Sono piccoli e ci arrivo, perché uno è una bella
distrazione di teoria dei grafi e l'altro ha richiesto di discutere con la checklist di un
maintainer. Ma i fix sono la metà più piccola di quello che ne ho ricavato. La metà più grande
è stata capire *perché* qualcuno riscrive in un altro linguaggio uno strumento di dieci anni
con una base installata enorme — e scoprire che il motivo scritto sulla scatola non è quello
vero.

## Come dbt è finito a far girare due motori insieme

La riscrittura non è cominciata dentro dbt Labs. È la parte che quasi tutti i riassunti
saltano.

All'inizio del 2025 dbt Labs ha acquisito SDF Labs, un team che stava costruendo un compilatore
SQL in Rust. A maggio 2025 quel lavoro è emerso come **dbt Fusion engine**: codice nuovo,
costruito per la velocità e per qualcosa che l'annuncio chiamava *SQL comprehension*,
rilasciato sotto ELv2. Non Apache 2.0. Alcuni pezzi — dbt-jinja, gli adapter, le grammatiche,
le specifiche — erano aperti fin dall'inizio. Il motore no, e la community se n'è accorta.

Quello che è seguito è stato un anno genuinamente strano, e non devi credermi sulla parola,
perché dbt Labs l'ha messo per iscritto. Il repo ha una cartella `docs/roadmap/` che risale al
2022, e il post di giugno 2026 è di una franchezza sorprendente. Stavano costruendo due cose
insieme: un motore veloce che capisce il SQL, e una reimplementazione in Rust di dbt Core
fedele battuta per battuta, conforme a ogni comportamento della v1 tranne quelli rotti di
proposito. Ogni bug veniva triagato, corretto e testato due volte. Due linguaggi. Due
framework di test. Parole loro: la cosa "ci ha decisamente rallentati, e rischia una divergenza
di comportamento".

Poi a giugno 2026 i due sono collassati in uno. Il cuore della riscrittura Rust è uscito come
dbt Core v2.0 — alpha, Apache 2.0, su `main`. Il repo `dbt-fusion` è stato archiviato. I repo
separati degli adapter sono stati ripiegati nel monorepo. Ed è successo tutto la stessa
settimana in cui Fivetran e dbt Labs hanno annunciato che diventavano una sola azienda, che è
un bel po' di fusioni per un unico ciclo di notizie.

La mia riga preferita di quel post di roadmap è un'ammissione contro il proprio interesse. Le
release di Fusion erano numerate `2.0.0.xxx` fin dalla primissima, a maggio 2025. La
chiamavano v2 da un anno prima di ammettere che era la v2. Come dice il post: la data era
giusta, era l'anno a essere sbagliato di uno.

Quello che esiste adesso è quindi una codebase e due distribuzioni. **dbt Core** è la base
Apache 2.0. **Fusion** è lo stesso motore più le funzionalità di SQL comprehension — linting,
lineage a livello di colonna — dietro `dbt login`. Una specifica di linguaggio, uno strato di
adapter, codice portabile in entrambe le direzioni.

Quel confine lo puoi guardare in diretta, perché il changelog è un unico file con voci
etichettate:

```
- [dbt-core] Databricks: detect a changed view definition so that view_update_via_alter …
- [fusion]   dbt lint: do not raise UnionColumnCountMismatch (dbt0165 / AM07) for BY NAME …
- [internal] Add a run-cache unit test pinning that a model materialized as a built-in name …
```

Quel file dice più di qualsiasi FAQ sulle licenze. `[fusion]` è quasi tutto linting, language
server, caching dello stato. `[dbt-core]` è materializzazioni, adapter, correttezza. La linea
fra i due non è arbitraria e non riguarda davvero le licenze: cade quasi esattamente fra
*eseguire il tuo progetto* e *capire il tuo progetto*.

![Two engines into one](/AndreaBozzo/blog/images/dbt-two-engines-timeline.png "From the SDF acquisition to dbt Core v2.0 alpha: what was ELv2, what was Apache 2.0, and what merged")

Un po' di contesto sul ritmo, perché cambia la sensazione di contribuire: `CHANGELOG-fusion.md`
registra **181 preview release** della 2.0.0. La preview 204 è uscita il 29 luglio 2026. La 205
il 31 luglio. Ognuna cita per nome i contributor esterni — nove solo sulla 205. La tua patch
non sta aspettando un treno di rilascio trimestrale.

## Cosa è stato riscritto davvero

| Layer | Crate |
|---|---|
| DAG e traversal | `dbt-dag`, `dbt-scheduler`, `dbt-selector-parser` |
| Runtime Jinja | `dbt-jinja` (un fork di minijinja), `dbt-jinja-ctx`, `dbt-jinja-filters` |
| Front end SQL | `dbt-sql/dbt-lexer-{bigquery,databricks,duckdb,redshift,snowflake,trino}` |
| Adapter e cataloghi | `dbt-adapter`, `dbt-adapter-core`, `dbt-adapter-sql`, `dbt-adbc` |
| Schema e validazione | `dbt-schemas`, `dbt-schema-store` |
| Metadati e lineage | `dbt-metadata`, `dbt-metadata-parquet`, `dbt-lineage-core` |
| Esecuzione query sui metadati | `dbt-df-providers` |

Quattordici pacchetti di macro degli adapter stanno adesso nello stesso repository — BigQuery,
Databricks, Snowflake, Redshift, Postgres, DuckDB, Spark, Fabric, ClickHouse, Exasol,
Salesforce e compagnia — dove prima erano progetti separati con cicli di rilascio separati e
banda di manutenzione separata.

E "riscritto in Rust" qui non significa quello che significa di solito. Non è Python con i
percorsi caldi spinti dentro un'estensione nativa. Non c'è nessun runtime Python nel giro. La
v2 esce come un unico binario autocontenuto. L'unico `pyo3` in tutto il workspace è
`crates/dbt-jinja/minijinja-py` — i binding Python *di* minijinja, vendorizzati, che la CLI non
tocca mai. Il `pyproject.toml` alla radice del repo serve a pubblicare il binario come wheel
pip. Non esegue niente.

![The dbt Core v2 crate map](/AndreaBozzo/blog/images/dbt-fusion-crates.png "77 workspace crates and 14 bundled adapters, grouped by what they replaced")

## Sei lexer non sono un'ottimizzazione di performance

Ogni annuncio apre con i tempi di parsing e compilazione. Va bene — sono reali, e la v1.12
spedisce persino il nuovo parser dietro `dbt parse --use-v2-parser`, così lo puoi sentire senza
migrare.

Ma torna a guardare il front end SQL. Sei lexer. Uno per dialetto di warehouse.

Nessuno scrive sei lexer per andare più veloce. Sei lexer li scrivi perché hai deciso di
smettere di trattare il SQL come una stringa.

Quella singola decisione regge tutto quello che sta nella colonna `[fusion]`. Quella regola di
lint su `UnionColumnCountMismatch` con `UNION ALL BY NAME` deve sapere cos'è un'operazione
insiemistica e come quel dialetto allinea le colonne. Il lineage a livello di colonna deve
risolvere quale colonna in uscita viene da quale espressione in ingresso. Un language server
deve offrire completamenti dentro un modello che stai scrivendo a metà.

Il mio preferito del gruppo è il linting SQL "simbolico" o "scheletrico", che parsa SQL che ha
ancora dentro i buchi Jinja. Una voce di changelog parla di permettere che il nome di una CTE
in una clausola `WITH` sia un buco Jinja "senza rendere bucabile ogni posizione di
identificatore". È una frase che può esistere solo in un universo dove qualcuno sta parsando
strutturalmente il tuo SQL templato, prima del rendering, e si preoccupa di dove i buchi sono
ammessi.

Un motore Python che sostituisce Jinja come stringa e spedisce il risultato al warehouse non
può fare niente di tutto questo, a nessuna velocità. Quindi l'inquadratura "adesso è più
veloce" sottovende genuinamente il lavoro fatto. La riscrittura ha comprato un'intera
*categoria* di capacità. Il guadagno di latenza è un effetto collaterale.

La specifica più stretta discende dalla stessa decisione. La v1.10 e la v1.11 hanno cominciato
ad avvisare su config scritte male o messe nel posto sbagliato; la v2 le trasforma in errori,
dagli stessi schemi fortemente tipizzati. E puoi imporlo solo quando esiste una cosa tipizzata
contro cui imporlo — che, guarda un po', è esattamente lo strato in cui sono andato a sbattere
dal lato sbagliato. Ci arrivo fra poco.

## I metadati adesso sono Parquet, e a interrogarli è DataFusion

Ecco la parte che non avevo previsto.

La v2 emette i suoi artefatti come Parquet, non solo come JSON. `dbt-metadata-parquet` ha un
modulo per famiglia di artefatti: nodi parsati, nodi compilati, epoche di lineage a livello di
colonna, risultati di run, invocazioni, freshness. `manifest.json` esiste ancora per
compatibilità, ma non è più la rappresentazione primaria. Poi `dbt-df-providers` passa lo
schema store a DataFusion come catalog provider, così il motore risolve e interroga i propri
metadati in modo lazy invece di registrare ogni tabella in anticipo.

Il guadagno visibile è il nuovo `dbt docs`, che legge quei file invece di infilare un blob
JSON gigantesco nel tuo browser sperando bene.

Il guadagno che mi interessa davvero sta nella roadmap. Siccome i metadati di progetto adesso
sono un dataset colonnare con davanti un motore di query, **i controlli di qualità di progetto
si possono scrivere in SQL** e ripiegare dentro il task graph. Bloccare un `dbt build` perché
un modello non ha un owner, o viola una convenzione di naming, o seleziona da una source da cui
non dovrebbe — come query sui metadati. Non come manipolazione Jinja di `{{ graph }}`, che il
post di roadmap descrive come "tanto impressionante quanto illeggibile", e chiunque abbia
letto dbt-project-evaluator riconoscerà come generoso.

Quindi lo stato del tuo progetto dbt adesso è un dataset colonnare interrogabile, e a
interrogarlo è lo stesso runtime DataFusion che useresti sugli estratti del tuo warehouse. Se
hai letto [l'articolo sul formato Lance](../lancearticle-blog/) o
[il lavoro su Arrow dietro dataprof](../arrowfordataprof-blog/), questo è quello stack che
spunta un piano più in alto di dove me lo aspettavo: non sotto lo storage, ma sotto la
contabilità interna dello strumento di trasformazione.

## Due bug, e nessuno dei due ha detto una parola

Che poi è il motivo per cui ero là dentro. Entrambi i fix sono piccoli. Quello che li rende
degni di spazio è che nessuno dei due bug ha stampato niente. Uno restituiva un insieme vuoto.
L'altro buttava via metà della tua configurazione sulla strada verso il database. Entrambi
sembravano successi.

### L'operatore che restituiva zitto zitto niente

L'operatore `@` di dbt significa: il nodo, i suoi discendenti, e gli antenati di quei
discendenti. È quello a cui ricorri quando vuoi ricostruire tutto ciò che alimenta qualsiasi
cosa a valle.

Catena di tre, `a → b → c`, dove `c` non ha figli. `@b` ti dava `a, b, c`. `+c` ti dava
`a, b, c`. E `@c` non ti dava assolutamente niente — non un errore, una *selezione vuota*, che
dbt poi eseguiva allegramente non facendo alcun lavoro.

Fermati un attimo su questo. Se `@leaf` sta in un job di CI, quel job diventa verde. Diventa
verde perché non ha testato nulla, e verde è verde.

La causa sta in `collect_childrens_parents` dentro `dbt-scheduler`, ed è il tipo di cosa che si
legge come ovviamente corretta finché non lo è. Sia `downstream()` che `upstream()`
restituiscono *archi*, non nodi. Una foglia non ha archi uscenti. Quindi l'insieme dei
discendenti torna vuoto, il passaggio che individua le foglie non ha niente su cui iterare, e
la risalita verso gli antenati non parte mai. La logica era giusta per ogni nodo con almeno un
figlio — un assunto che nessuno aveva mai messo per iscritto, perché su una lavagna "un nodo è
discendente di sé stesso" è troppo ovvio per dirlo ad alta voce.

Due righe di intenzione lo sistemano. Inizializza i candidati-foglia con i nodi selezionati
stessi. Poi inserisci esplicitamente ogni foglia prima di risalire ai suoi antenati, perché
anche un nodo isolato non ha archi entranti, e la stessa trappola aspetta un livello più sotto:

```rust
    let leaf_nodes: BTreeSet<String> = desc
        .keys()
        .chain(desc.values().flatten())
        .chain(selected_nodes)
        .filter(|node| {
            // A node is a leaf if it has no outgoing dependencies in the descendant graph
            !desc.contains_key(*node) || desc.get(*node).is_none_or(|children| children.is_empty())
        })
        .cloned()
        .collect();
    for leaf in leaf_nodes {
        add_nodes(upstream(deps, &leaf, u32::MAX), &mut selected);
        selected.insert(leaf);
    }
```

Il comportamento sui non-foglia resta intatto: i nodi selezionati entrano nell'insieme dei
candidati, e il filtro li scarta nel momento in cui hanno archi uscenti. E lo stesso fix copre
il selettore YAML `childrens_parents: true`, che compila nella stessa traversal — quindi se
tieni i selettori in `selectors.yml` avevi lo stesso identico bug vestito con un'altra
sintassi.

### Una config che validava, e poi evaporava

Il secondo vive nello spazio fra quel bello strato di schema tipizzato e quello che esce
davvero dall'altra parte.

`catalogs.yml` v2 ti permette di attaccare DuckDB a un catalogo Iceberg REST, e per AWS c'è una
scorciatoia: dichiara il *tipo* di endpoint e lascia che sia DuckDB a ricavare il resto.

```yaml
catalogs:
  - name: aws_glue
    type: glue
    table_format: iceberg
    config:
      duckdb:
        endpoint_type: GLUE
        secret: glue_s3
```

Lo schema prende la cosa estremamente sul serio. `endpoint_type` è enumerato a `GLUE` e
`S3_TABLES`. Mutuamente esclusivo con `endpoint`, esattamente uno dei due obbligatorio.
`S3_TABLES` richiede anche `warehouse`. `authorization_type` non può essere combinato con
`endpoint_type`. Quattro regole, tutte applicate, tutte corrette.

Poi il builder componeva l'istruzione `ATTACH` e non emetteva `ENDPOINT_TYPE` per niente.

Finisci in un posto davvero sgradevole. La tua config è valida, quindi niente ti avvisa. DuckDB
riceve un'istruzione senza `ENDPOINT`, senza `ENDPOINT_TYPE`, senza `AUTHORIZATION_TYPE`,
scrolla le spalle e ripiega sul suo default oauth2 — sbagliato per Glue e sbagliato per S3
Tables. E non puoi nemmeno aggirarlo a mano, perché lo schema ti vieta di impostare
`authorization_type` da solo. Config valida, comportamento sbagliato, nessuna via d'uscita.

![Validated, then dropped](/AndreaBozzo/blog/images/dbt-endpoint-type-drop.png "Every schema rule passed. The statement that came out the other side was missing the option that mattered.")

La regressione si traccia con precisione, ed è un piccolo monumento a quanto costa il
consolidamento. L'emissione di `ENDPOINT_TYPE` era stata aggiunta a maggio 2026 e rimossa un
mese dopo da `dfe9a517c`, la prima parte della riscrittura dello stack cataloghi. Quel commit
ha tenuto ogni regola di schema e ha eliminato il ramo del builder. Nello stesso respiro ha
cancellato `glue_minimal` e `glue_with_secret_and_endpoint_type` — vale a dire, ogni fixture di
attach Glue del repository. Nessuna fixture, nessun test rosso, nessun segnale. I test di sola
validazione continuavano a passare, e facevano bene: la validazione non è mai stata la cosa che
si era rotta.

Il fix ripristina quelle fixture e ne aggiunge due. Il pezzo che ha richiesto più tempo è
invisibile nel diff — DuckDB legge l'operando di `ATTACH` per Glue come un *catalog path* e lo
verifica contro la propria grammatica (`':'`, un account id di dodici cifre, `'cat1/cat2'`). Il
vecchio default, il nome del catalogo dbt, quella verifica la fallisce di netto. Quindi anche un
`ENDPOINT_TYPE` emesso correttamente si sarebbe attaccato esattamente a nulla.

### La parte in cui litigo con la issue

La issue era stata aperta da un maintainer di dbt Labs, riscritta una volta contro un checkout
fresco, e arrivava con una checklist ordinata di cinque punti. È una buona issue — migliore
della maggior parte delle mie. Due punti non sopravvivono al contatto con il sorgente.

Dice di dare a Glue un default `AUTHORIZATION_TYPE 'SIGV4'`. Corretto, e anche una trappola:
non deve mai combinarsi con `endpoint_type`, perché `S3OrGlueAttachInternal` imposta SigV4 da
sé e DuckDB a quel punto lancia `'endpoint_type' can not be combined with 'authorization_type'`.
Spedirli entrambi significa aver scambiato una misconfigurazione silenziosa con un crash secco
al momento dell'attach. Discutibilmente un miglioramento. Non il fix.

Dice anche che un URL `endpoint` scritto per intero si ritrova con lo schema doppio,
`https://https://`. Non è vero. `AddHttpHostIfMissing` è lungo quattro righe e restituisce
l'input così com'è quando uno schema c'è già. Il comportamento davvero sorprendente è l'ultima
riga di quella funzione: un host *nudo* si prende `http://`. Non https. È quella la cosa che
vale la pena documentare, ed è più o meno l'opposto di quello che la checklist mi chiedeva di
normalizzare via.

Nessuna delle due correzioni era una questione di opinione. Stanno tutte e due in un file che
chiunque può aprire. Non avrei trovato né l'una né l'altra partendo dalla documentazione,
perché la documentazione descrive l'intenzione, e l'intenzione non è quello che l'estensione
esegue. È il C++ di mezzanotte di cui parlavo all'inizio, e lo rifarei.

## Nessuno ti dice che il repo è un mirror

Ecco la cosa che mi ha colto completamente in contropiede, e non sta in nessuna guida per
contributor.

`dbt-labs/dbt-core` su GitHub è un mirror. Tu apri una PR, un bot copia la tua modifica nel
repository di review interno di dbt Labs, un maintainer la revisiona *lì*, e se viene merged
torna sul `main` pubblico con un sync periodico. Poi il bot chiude la tua PR al posto tuo.

Così la mia PR sull'operatore `@` risulta **closed**. Non merged — closed. Guardi solo quello e
concludi che è stata rifiutata. Non lo è stata: il fix è in `main`, è atterrato il 27 luglio
2026 come commit `f95a810b7`, con il bot di sync come autore, e la mia PR si è chiusa il giorno
dopo quando il sync ha recuperato. La voce di changelog porta il mio nome. Il commit no.

Non mi sto lamentando — per un'azienda che spedisce una distribuzione commerciale a partire da
una codebase condivisa è un assetto ragionevole, e il bot racconta educatamente ogni passaggio.
Ma qui il segnale universale per "il mio contributo è arrivato?" è invertito, e lo scopri dopo
aver già aperto la PR.

Altre due cose che vale la pena sapere prima di iniziare:

**I golden test sono il contratto.** `dbt-goldie` è l'harness di snapshot interno;
`GOLDIE_UPDATE=1 cargo test -p <crate>` rigenera le fixture. Alcuni golden — fra cui lo schema
JSON dei cataloghi — si possono rigenerare solo con tooling interno. Se la tua modifica tocca
una doc string di schema, scrivilo nella descrizione della PR e lascia che se ne occupi un
maintainer, invece di spedire qualcosa che diventa rosso dalla loro parte e sembra colpa tua.

**La conformità è tutta la personalità di questo progetto.** dbt Labs ha passato più di sei
mesi a fare una sola domanda a ogni modifica: stesso progetto in ingresso, stessi risultati
della v1 in uscita? Da lì sono usciti migliaia di bug. Una volta che lo sai, la codebase smette
di sembrare paranoica e comincia ad avere senso — il modulo `record_replay` nello strato
adapter, i test pieni di fixture, l'insistenza che i cambi di comportamento siano circoscritti e
dichiarati. Una patch che sposta silenziosamente l'output su un percorso non correlato è
esattamente la cosa che questo progetto è stato costruito per intercettare.

## Se sei ancora sulla v1 — e lo sei

Lo sono quasi tutti, e per ora niente di tutto questo lo cambia.

La v2.0 è alpha. Il Python della v1 vive su `1.latest`. La v1.12 è uscita a maggio 2026 con una
lista di feature davvero robusta, e le patch release continuano a partire da quel branch. dbt
Labs ha detto che la v1 non sparisce a breve e che terrà d'occhio l'adozione della v2 prima di
prendere decisioni di manutenzione a lungo termine.

Cosa significa alpha in pratica: vogliono che sia il tuo progetto a romperla, e lo dicono
chiaramente — il lavoro di parità è stato fatto contro progetti che controllano loro, e i casi
limite interessanti stanno nel tuo. Il primo passo più economico è `dbt parse --use-v2-parser`
sulla v1.12 — ma attenzione, tutto il punto del nuovo parser è che smette di perdonare cose che
il vecchio ignorava, quindi una run pulita non è garantita e una run sporca è il risultato
utile.

E se sei già sulla v2 con DuckDB e un catalogo Glue o S3 Tables: salta `endpoint_type` finché
il mio fix non arriva. Imposta `endpoint` a un host regionale nudo, `warehouse` al tuo account
id AWS, e `authorization_type: SIGV4` a mano.

## Dove sta il lavoro

Il fix dell'operatore `@` è in `main` come `f95a810b7`, via
[#15372](https://github.com/dbt-labs/dbt-core/pull/15372) e issue
[#15280](https://github.com/dbt-labs/dbt-core/issues/15280). Il fix DuckDB su `ENDPOINT_TYPE` è
[#15764](https://github.com/dbt-labs/dbt-core/pull/15764), contro la issue
[#15725](https://github.com/dbt-labs/dbt-core/issues/15725) — aperta e non ancora revisionata
mentre premo pubblica.

Fatti un favore e leggi
[`docs/roadmap/`](https://github.com/dbt-labs/dbt-core/tree/main/docs/roadmap) nel repo stesso.
Un decennio di post di roadmap, scritti da gente che chiaramente si sta divertendo, con
battute, gag sugli off-by-one e qualche smorfia pubblica. Se vuoi la storia di come uno
strumento Python è diventato uno strumento Rust senza la compressione da comunicato stampa,
quella cartella batte qualunque riassunto io possa farne qui.

Quello che non posso dirti è come andrà la review della #15764. Secondo me la regola di
esclusività fra `endpoint_type` e `authorization_type` rispecchia l'errore secco di DuckDB
stesso, ed è quindi esattamente il contratto che dbt vuole tenere. Un maintainer potrebbe
benissimo sapere un motivo per cui doveva essere solo temporanea. È lo stato onesto di una PR
aperta: puoi leggere ogni riga del sorgente coinvolto e ancora non sapere perché qualcuno l'ha
scritto in quel modo.
