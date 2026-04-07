---
title: "Lance Format e LanceDB: Storage Columnar per l'Era degli Embedding"
date: 2026-04-07
draft: false
tags: ["lancedb", "lance-format", "embeddings", "apache-arrow", "data-engineering", "nats"]
categories: ["Data Engineering", "Open Source"]
description: "Lance è un formato columnar costruito per i workload ML — accesso casuale veloce, indicizzazione vettoriale nativa e integrazione Arrow zero-copy. Questo articolo esplora il formato, LanceDB, e come l'ho collegato a uno stream NATS in tempo reale."
summary: "Lance è un formato di storage columnar costruito per i workload di machine learning — accesso casuale veloce, indicizzazione vettoriale nativa e integrazione Arrow zero-copy. Questo articolo esplora il formato stesso, come LanceDB ci costruisce sopra, e come l'ho collegato a uno stream NATS live per costruire un layer di ricerca semantica su eventi in tempo reale."
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
    image: "images/lanceformat-cover.png"
    alt: "Lance Format e LanceDB"
    caption: "Storage columnar per l'era degli embedding"
    relative: false
    hidden: false
---

## Lance Format e LanceDB: Storage Columnar per l'Era degli Embedding

Ultimamente ho dedicato tempo a guardare i formati di storage dalla prospettiva dell'infrastruttura ML piuttosto che dell'analytics. La maggior parte del mio lavoro quotidiano vive nell'ecosistema Arrow/DataFusion, quindi quando ho voluto aggiungere un layer di ricerca vettoriale a un piccolo progetto di event streaming, il mio primo istinto è stato chiedermi: esiste un formato che parla Arrow nativamente, gestisce gli embedding senza un database vettoriale separato, e non richiede di far girare un server dedicato?

Lance si è rivelato quel formato. Ma prima di scrivere una singola riga del bridge project che ho costruito sopra di esso, ero già entrato nel codebase come contributor — ed è probabilmente il modo più onesto per spiegare perché mi fido abbastanza da costruirci sopra.

## Contribuire Prima di Costruire

Due piccole PR di mia mano sono arrivate nel repo [`lance-format/lance`](https://github.com/lance-format/lance) nel gennaio 2026.

[#5577](https://github.com/lance-format/lance/pull/5577) ha aggiunto un type hint basato su `Protocol` per il parametro `to_tensor_fn` in `lance/torch/data.py`. L'annotazione originale era un generico `Callable[[pa.RecordBatch], ...]` che non catturava la firma effettiva — in particolare gli argomenti keyword opzionali `hf_converter` e `use_blob_api`. La fix introduce un protocollo `ToTensorFn` che li rende espliciti, il che conta in un SDK che usa pesantemente pydantic, dove le annotazioni di tipo guidano la validazione e l'inferenza dell'IDE.

[#5739](https://github.com/lance-format/lance/pull/5739) ha corretto un bug a livello Rust in `dataset/transaction.rs`. Durante le riscritture di compaction, il codice andava in hard-error se un UUID di indice referenziato nel piano di compaction non esisteva più — ad esempio perché un'operazione concorrente lo aveva già rimosso — invece di saltarlo silenziosamente. La fix sostituisce il pattern `.ok_or_else(|| Error::invalid_input(...))?` con un guard `let Some(...) else { continue }`, e aggiunge un test di regressione per coprire il caso.

Nessuna delle due è direttamente collegata a ciò che ho costruito successivamente su Lance. Il path del torch data loader è lontano anni luce da un consumer NATS, e l'edge case della compaction è qualcosa che ho incontrato in pratica solo in seguito. Ma scavare nel codebase per trovare e correggere questi bug è esattamente come ho costruito la fiducia sufficiente negli internals per sapere su cosa stavo costruendo.

## Cos'è Lance

Lance è un formato di storage columnar open-source progettato specificamente per i workload ML. _Non_ è Parquet con il supporto vettoriale aggiunto sopra — fa una serie diversa di trade-off:

- **Accesso casuale a livello di riga** — Parquet è eccellente per le scansioni complete di colonne, ma costoso per recuperare singole righe (bisogna decomprimere un'intera page). Lance memorizza i dati in modo da rendere economico l'accesso casuale O(1) alle righe, il che conta per i training loop che campionano mini-batch in modo non sequenziale.
- **Indicizzazione vettoriale nativa** — Lance costruisce indici IVFPQ e HNSW direttamente nel formato, non come struttura esterna. Non c'è un server di indici separato.
- **Integrazione Arrow zero-copy** — Una tabella Lance è direttamente leggibile come Arrow `RecordBatch`. Nessun passaggio di deserializzazione, nessuna traduzione di formato. Il core Rust di Lance usa direttamente il layout di memoria IPC di Arrow.
- **Versionato e append-friendly** — Lance supporta l'evoluzione dello schema e mantiene le versioni dei dati nativamente, rendendolo adatto come store "live" piuttosto che come archivio write-once.

La struttura su disco usa un file manifest, un insieme di frammenti di dati (file `.lance`) e una directory degli indici. Ogni frammento è leggibile indipendentemente, il che abilita sia l'ingestione parallela che le scansioni parziali.

## LanceDB Sopra

LanceDB è il database embedded che avvolge il formato Lance. "Embedded" è la parola importante — gira in-process, come DuckDB o SQLite, senza alcun daemon da gestire. Si fa `lancedb.connect("./path")` ed è fatta.

L'API Python è volutamente sottile rispetto al formato:

```python
import lancedb

db = lancedb.connect("./data/my_db")
table = db.create_table("events", schema=MyLanceModel)
table.add(records)

results = table.search(query_vector).limit(10).to_arrow()
```

Cosa aggiunge l'SDK rispetto al Lance grezzo: generazione automatica di embedding tramite modelli registrati (l'API `get_registry()`), indici di ricerca full-text basati su Tantivy, e una modalità di ricerca ibrida che combina punteggi vettoriali e keyword. Tutto questo è disponibile senza far girare un servizio separato.

Per i team che usano già Arrow — leggendo Parquet, eseguendo query DataFusion, lavorando con `pyarrow.RecordBatch` — il percorso di integrazione è breve. Le tabelle LanceDB sono tabelle Arrow con un layer di indice.

## Il Bridge Nephtys

Il [lancedb-nephtys-bridge](https://github.com/AndreaBozzo/lancedb-nephtys-bridge) è partito da una domanda: se ho un topic NATS JetStream che pubblica eventi di modifica di Wikipedia come batch JSON, posso indicizzarli in LanceDB con embedding semantici in tempo reale con codice minimale?

La risposta è sì, e il codice rimane piccolo. Il cuore è uno schema `LanceModel`:

```python
from lancedb.pydantic import LanceModel, Vector
from lancedb.embeddings import get_registry

model = get_registry().get("sentence-transformers").create(name="all-MiniLM-L6-v2")

class NephtysEvent(LanceModel):
    source_id: str
    timestamp: int
    text: str = model.SourceField()
    vector: Vector(model.ndims()) = model.VectorField()
```

`SourceField` dice a LanceDB quale colonna guida la generazione degli embedding. `VectorField` dice dove memorizzare l'output. Quando si chiama `table.add(records)`, l'SDK chiama automaticamente `compute_source_embeddings` sulla colonna `text` e popola `vector` — nessun loop di embedding esplicito necessario.

Nel bridge, calcolo gli embedding esplicitamente in batch prima dell'inserimento per avere più controllo sul passaggio di embedding, ma il percorso automatico funziona in modo identico per casi d'uso più semplici.

Il consumer NATS normalizza i batch di modifiche in arrivo, filtra le modifiche dei bot, costruisce una frase leggibile per ogni modifica, e passa i `NephtysEvent` risultanti a LanceDB. La normalizzazione del timestamp gestisce il fatto che i payload NATS a volte portano valori in epoch-secondi e a volte in millisecondi:

```python
async def message_handler(msg):
    data = json.loads(msg.data.decode())
    # ... filtra, normalizza, costruisce event_rows ...
    vectors = model.compute_source_embeddings(texts_to_embed)
    records_to_insert = [
        NephtysEvent(
            source_id=row["source_id"],
            timestamp=row["timestamp"],
            text=row["text"],
            vector=vector,
        )
        for row, vector in zip(event_rows, vectors)
    ]
    table.add(records_to_insert)
    await msg.ack()
```

Il risultato è uno store Lance locale che cresce con lo stream. In qualsiasi momento si può interrogarlo semanticamente:

```python
results = table.search(query_vector).limit(10).to_arrow()
```

Nessun cluster di database vettoriale, nessun Redis, nessun Elasticsearch — solo una directory su disco che parla Arrow.

## Cosa Emerge Eseguendolo

Alcune cose che non sono ovvie dalla documentazione emergono rapidamente in pratica.

**Gli append sono economici, la compaction non è gratuita.** Il modello di append di Lance funziona scrivendo nuovi frammenti. Dopo molti piccoli append — un batch NATS, un frammento — si accumula un gran numero di frammenti che degradano le prestazioni di scansione. L'SDK espone `table.compact_files()` per questo, ma bisogna chiamarlo esplicitamente. In uno scenario di streaming in produzione si pianificherebbe la compaction come job in background. Questo è lo stesso problema di compaction dei small file che gli utenti Iceberg conoscono bene, ed è anche il punto dove il bug corretto in [#5739](https://github.com/lance-format/lance/pull/5739) diventa rilevante: se il loop di compaction gira abbastanza frequentemente, può andare in race con scritture concorrenti e incontrare UUID di indice che non esistono più. Quella fix rende il percorso di riscrittura resiliente a questo caso.

**Il registro degli embedding è conveniente ma opinionated.** `get_registry().get("sentence-transformers")` scaricherà il modello al primo utilizzo e lo metterà in cache localmente. Questo è ergonomico per lo sviluppo ma vale la pena considerarlo in un ambiente container dove si vogliono pesi del modello deterministici e pre-scaricati.

**I round-trip Arrow sono genuinamente zero-copy.** `table.to_arrow()` restituisce una `pyarrow.Table` supportata da buffer memory-mapped dai file Lance su disco. Non c'è deserializzazione — il core Rust usa direttamente il layout di memoria IPC di Arrow, quindi rileggere in Python è un passaggio di puntatore, non una copia.

**La latenza della ricerca vettoriale è competitiva per workload locali.** Su una tabella piccola (~50k righe) la ricerca ANN con IVFPQ era nell'ordine dei singoli millisecondi senza GPU. L'indice deve essere creato esplicitamente dopo il primo caricamento bulk tramite `table.create_index()`, e viene ricostruito in caso di modifiche significative ai dati. Per l'ingestione in streaming, pianificare le ricostruzioni dell'indice periodicamente piuttosto che dopo ogni scrittura.

## Lance vs. Parquet per lo Storage ML

| Dimensione | Parquet | Lance |
|---|---|---|
| Scansioni di colonne | Eccellente (vettorizzato, compresso) | Buono, leggermente meno compresso |
| Accesso casuale alle righe | Lento (decompressione della page) | Veloce (O(1) tramite offset di riga) |
| Indicizzazione vettoriale | Nessuna (sistema esterno necessario) | IVFPQ / HNSW nativo |
| Integrazione Arrow | Tramite `pyarrow.parquet` (copia) | Diretto (zero-copy) |
| Evoluzione dello schema | Limitata (aggiunta/rimozione colonne) | Versioning completo |
| Append in streaming | Riscrittura costosa | Economico (nuovi frammenti) |
| Maturità dell'ecosistema | Molto matura | In rapida crescita |

La versione breve: se il tuo workload è analytics ed ETL, Parquet è il default giusto. Se il tuo workload coinvolge training loop ad accesso casuale, ricerca di embedding, o indici vettoriali aggiornati in tempo reale, Lance fa trade-off reali a tuo favore.

## Dove Si Colloca nello Stack Arrow

Dal punto di vista del data engineering, ciò che rende Lance interessante non è la ricerca vettoriale in sé — puoi fare ricerca vettoriale con molti strumenti. È che Lance è un _formato_ con Arrow come API di prima classe, piuttosto che un database che espone casualmente un endpoint Arrow.

Questo si inserisce naturalmente in uno stack dove usi già Arrow per la comunicazione inter-processo (la C Data Interface), DataFusion per l'esecuzione delle query, e Parquet/Iceberg per lo storage freddo. LanceDB occupa il layer "hot vector store" in quello stack: i dati arrivano, vengono embeddati, e sono immediatamente interrogabili — tutto senza uscire dal modello di memoria Arrow.

Se il [precedente articolo sui guardrail delle pipeline ML](https://andreabozzo.pages.dev/posts/tabularmlpipes-blog.en/) riguardava il mantenere i dati puliti prima che raggiungano un modello, questo è il complemento naturale: una volta che hai dati puliti ed embeddati, dove li metti in modo che rimangano interrogabili in tempo reale senza un cluster database? Per il caso d'uso del bridge Nephtys, la risposta è una directory su disco che il formato Lance trasforma in un event log semanticamente interrogabile.
