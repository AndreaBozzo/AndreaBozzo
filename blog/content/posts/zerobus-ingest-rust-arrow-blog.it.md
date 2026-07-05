---
title: "Zerobus Ingest: quando Unity Catalog diventa il sink"
date: 2026-07-05T12:00:00+02:00
draft: false
tags: ["Data Engineering", "Databricks", "Zerobus", "Rust", "Apache Arrow", "Unity Catalog", "Lakehouse", "Streaming"]
categories: ["Data Engineering"]
keywords: ["Zerobus Ingest", "Databricks", "Rust", "Apache Arrow", "Arrow Flight", "Unity Catalog", "Lakehouse", "Streaming", "Delta Lake"]
description: "Una demo reale di Zerobus Ingest su Databricks: catalogo Unity Catalog dedicato, tabella Delta gestita su S3, producer Rust, JSON e Arrow Flight fino al sink."
summary: "Nel post dlt+dbt il contratto era uno schema Unity Catalog. Con Zerobus Ingest ho spostato la stessa domanda al bordo producer: quando il sink è già una tabella Delta governata, serve davvero un bus nel mezzo?"
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
    image: "images/zerobus-cover.png"
    alt: "Zerobus Ingest, Rust producer, Unity Catalog sink"
    caption: "Rust producer, Zerobus Ingest, Unity Catalog governed Delta table"
    relative: false
    hidden: false
---

Nel [post precedente su dlt + dbt](/AndreaBozzo/blog/posts/dlt-dbt-unity-catalog-blog/) ero arrivato
a una forma che mi piaceva proprio per quanto era poco spettacolare: `dlt` scriveva tabelle grezze,
`dbt` costruiva sopra, e il contratto tra i due non era un servizio sempre acceso ma uno **schema
Unity Catalog**.

Questo post parte dallo stesso nervo scoperto, solo più vicino al bordo del sistema. Se il sink è
già noto, governato e transazionale, cioè una tabella Delta in Unity Catalog, quanta infrastruttura
deve stare ancora in mezzo al producer?

La risposta breve è che il bus non sparisce magicamente. Cambia lavoro. E in alcuni casi il suo
lavoro non è più essere Kafka.

![Zerobus cover](/AndreaBozzo/blog/images/zerobus-cover.png "Rust producer, Zerobus Ingest, Unity Catalog governed Delta table")

## Il riflesso Kafka

Per anni il default mentale dello streaming è stato: producer, topic, partizioni, registry, consumer
group, connector, sink. E spesso ha senso. Se hai fan-out, replay, consumer indipendenti, retention
semantica, backfill e team diversi che leggono lo stesso evento con tempi diversi, Kafka o qualcosa
di simile non è un dettaglio: è il prodotto.

Ma c'è una classe di workload molto più stretta e molto comune: sensori, collector, gateway o
servizi applicativi che devono solo spingere eventi freschi dentro una tabella lakehouse. Non stanno
pubblicando un dominio eventi multi-consumer. Stanno alimentando un sink analitico governato.

[Zerobus Ingest](https://docs.databricks.com/aws/en/ingestion/zerobus-overview) occupa proprio questo
spazio: un'API push serverless che scrive direttamente in tabelle Delta Unity Catalog. La parte che
mi interessa non è "meno componenti" in astratto. È più precisa: quando il producer sa già che il
contratto è la tabella, Unity Catalog smette di essere solo il posto dove i dati arrivano e diventa
parte del protocollo di ingestione.

![Kafka-style flow vs Zerobus direct ingest](/AndreaBozzo/blog/images/zerobus-before-after.png "Traditional default vs single-sink path")

Questa è la connessione con i miei ultimi post:

- nel post dlt+dbt, Unity Catalog era il confine tra ingestion e trasformazione;
- nei post su Arrow, DataFusion e pipeline tabulari, il punto era non perdere struttura colonnare
  appena i dati diventano interessanti;
- nei post Rust, da Lakekeeper a Zero Grappler, il tema ricorrente era usare Rust dove il confine è
  stretto: rete, memoria, schema, back-pressure.

Zerobus mette tutte e tre le cose nello stesso esperimento piccolo.

## Cosa cambia davvero

La documentazione Databricks descrive Zerobus come un servizio che apre stream diretti verso una
tabella target: il client costruisce messaggi compatibili con lo schema della tabella, il servizio li
rende durevoli, manda ack al client e poi li materializza in Delta.

La frase importante è "compatibili con lo schema della tabella". Zerobus non crea la tabella al posto
tuo, non decide il contratto e non fa schema evolution automatica. La tabella è l'autorità.

Questo sposta la responsabilità in modo netto:

1. **Il producer non manda messaggi generici.** Manda record per una tabella specifica.
2. **Unity Catalog non è un catalogo passivo.** È il punto in cui autorizzazione, schema e storage
   si incontrano.
3. **Lo stream non è un topic.** Uno stream scrive a una tabella; l'ordering è garantito per stream,
   non se round-robin distribuisci messaggi su stream diversi.

Nel mio caso ho usato il [Rust SDK](https://docs.rs/databricks-zerobus-ingest-sdk/latest/databricks_zerobus_ingest_sdk/)
con la feature `arrow-flight` abilitata:

```toml
[dependencies]
arrow-array = "58.3.0"
databricks-zerobus-ingest-sdk = { version = "2.3.0", features = ["arrow-flight"] }
dotenvy = "0.15"
serde_json = "1"
tokio = { version = "1", features = ["macros", "rt-multi-thread", "time"] }
uuid = { version = "1", features = ["v4"] }
```

La prima passata l'ho fatta con JSON, per validare credenziali, endpoint e permessi senza aggiungere
subito attrito Arrow. Poi ho fatto la passata vera con `RecordBatch` e Arrow Flight.

## La parte che mi ha morso: default storage

La demo doveva essere banale: creare una tabella managed Delta nel workspace, dare `USE CATALOG`,
`USE SCHEMA`, `MODIFY` e `SELECT` al service principal, poi lanciare il producer.

Il primo errore utile è stato questo:

```text
InvalidArgument: Unsupported table kind.
Tables created in default storage are not supported.
Error Code: 4024
```

Questo è il tipo di errore che vale un post. La tabella era managed. Era Delta. Era in Unity Catalog.
Ma non era nel tipo di storage che Zerobus accetta.

La limitazione è esplicita nella pagina ufficiale dei
[limiti di Zerobus Ingest](https://docs.databricks.com/aws/en/ingestion/zerobus-limits): scrive solo
su managed Delta tables, ma non su default storage. Quindi ho creato un catalogo dedicato alla demo,
`zerobus_demo`, con una managed location S3 registrata tramite storage credential ed external
location. La documentazione Unity Catalog sui
[managed storage location](https://docs.databricks.com/aws/en/connect/unity-catalog/cloud-storage/managed-storage)
spiega il punto: per un catalog standard, la `MANAGED LOCATION` deve stare dentro una external
location.

La sequenza finale è stata: bucket S3 dedicato in `us-east-2` (stessa region del workspace, altro
requisito Zerobus), storage credential con IAM role, external location `zerobus_demo_location`,
catalogo `zerobus_demo` creato con quella `MANAGED LOCATION`, schema `events`, poi tabella Delta
gestita.

```sql
CREATE SCHEMA IF NOT EXISTS zerobus_demo.events;

CREATE OR REPLACE TABLE zerobus_demo.events.rust_telemetry_events (
  event_id STRING,
  device_id STRING,
  event_time_ms BIGINT,
  batch_id STRING,
  sequence_num BIGINT,
  temperature_c DOUBLE,
  humidity_pct DOUBLE,
  battery_pct DOUBLE,
  source STRING
)
USING DELTA;
```

Al service principal demo ho assegnato solo i privilegi necessari: `USE CATALOG` sul catalogo,
`USE SCHEMA` sullo schema e `SELECT, MODIFY` sulla tabella target. Oggi `databricks grants get table`
sulla tabella mostra esattamente quei due privilegi sul principal, niente altro. Il secret OAuth è
rimasto in un `.env` locale fuori dal repo.

Un dettaglio operativo che mi ha fatto perdere qualche minuto: l'external location aveva i file
events abilitati di default. Per questa demo non servivano, e la validazione chiedeva anche permessi
SNS/SQS oltre a S3. Ho disabilitato i file events sulla location, poi la validazione è passata su
`READ`, `LIST`, `WRITE` e `DELETE`.

```powershell
databricks external-locations update zerobus_demo_location `
  --json '{"enable_file_events":false}' `
  --skip-validation
```

A quel punto la stessa tabella managed è diventata accettabile per Zerobus.

![Workspace receipt with successful JSON and Arrow Flight ingestion](/AndreaBozzo/blog/images/zerobus-catalog-explorer.png "Dedicated catalog, accepted ingest")

## Il producer Rust

Il producer è volutamente piccolo: legge endpoint, workspace URL, tabella e OAuth client credentials
da `.env`, genera 64 eventi telemetry sintetici e li spinge nella tabella. Un'unica variabile,
`ZEROBUS_FORMAT`, decide il percorso: JSON o Arrow Flight. Il codice completo, con il DDL della
tabella e i grant minimi, è su
[github.com/AndreaBozzo/zerobus-rust-demo](https://github.com/AndreaBozzo/zerobus-rust-demo).

Il path JSON è quello da usare quando vuoi togliere variabili. Manda i 64 record uno alla volta
sullo stesso stream, tiene l'ultimo offset e aspetta l'ack solo alla fine:

```rust
let sdk = ZerobusSdk::builder()
    .endpoint(&server_endpoint)
    .unity_catalog_url(&workspace_url)
    .build()?;

let mut stream = sdk
    .stream_builder()
    .table(table_name)
    .oauth(client_id, client_secret)
    .json()
    .max_inflight_requests(32)
    .build()
    .await?;

let mut last_offset = None;
for sequence_num in 0..ROWS {
    let record = telemetry_record(&demo, sequence_num);
    last_offset = Some(stream.ingest_record_offset(JsonValue(record)).await?);
}
if let Some(offset) = last_offset {
    stream.wait_for_offset(offset).await?;
}
stream.close().await?;
```

Il terminale, dopo il fix sul catalogo, ha finalmente detto la cosa noiosa che volevo:

```text
zerobus demo producer
format=json
table=zerobus_demo.events.rust_telemetry_events
batch_id=rust-json-a43bcfa6-133f-4ad8-bd78-423c86b6c437
acked_rows=64
status=ok
```

Poi ho cambiato solo il formato:

```powershell
$env:ZEROBUS_FORMAT = "arrow-flight"
cargo run
```

E la seconda passata è arrivata nella stessa tabella:

```text
zerobus demo producer
format=arrow-flight
table=zerobus_demo.events.rust_telemetry_events
batch_id=rust-arrow-a33a4215-49e2-4c4b-8e17-4668e68279a2
acked_rows=64
status=ok
```

La query di verifica sul SQL warehouse:

```sql
SELECT
  source,
  count(*) AS rows,
  min(sequence_num) AS first_sequence,
  max(sequence_num) AS last_sequence,
  count(DISTINCT batch_id) AS batches
FROM zerobus_demo.events.rust_telemetry_events
GROUP BY source
ORDER BY source;
```

Risultato:

| source | rows | first_sequence | last_sequence | batches |
|---|---:|---:|---:|---:|
| `rust-sdk-arrow-flight` | 64 | 0 | 63 | 1 |
| `rust-sdk-json` | 64 | 0 | 63 | 1 |

## La ricevuta nel Delta log

La verifica che mi è piaciuta di più però non è la `SELECT`. È `DESCRIBE HISTORY`, perché mostra
come Zerobus appare dal punto di vista della tabella:

| version | timestamp (UTC) | operation | engineInfo | isBlindAppend |
|---:|---|---|---|---|
| 2 | 2026-07-05 09:25:50 | WRITE | `Zerobus` | true |
| 1 | 2026-07-05 09:19:00 | WRITE | `Zerobus` | true |
| 0 | 2026-07-05 09:18:23 | CREATE OR REPLACE TABLE | `Databricks-Runtime/18.2.x-…-photon` | true |

Tre commit. Il primo l'ho fatto io dal SQL warehouse, e infatti porta il mio utente e l'engine del
runtime. Gli altri due sono le due passate del producer, e arrivano con `engineInfo=Zerobus`, senza
utente interattivo, come blind append. Ogni run del producer è esattamente un commit Delta: niente
micro-batch sparsi, niente file orfani da compattare subito.

`DESCRIBE DETAIL` chiude il cerchio sul lato AWS:

```text
location    = s3://<demo-bucket>/zerobus-demo/catalog/__unitystorage/
              catalogs/0f88…/tables/c071…
numFiles    = 2
sizeInBytes = 8889
properties  = { "delta.parquet.compression.codec": "zstd", … }
```

L'intera demo, sul bucket, è due file Parquet zstd per 8.9 KB. Il volume non è mai stato il punto:
il punto è che i dati stanno nella managed location S3 del catalogo dedicato, un file per commit,
e ci sono arrivati senza che il producer sapesse nulla di bucket, path o credenziali AWS.

Un dettaglio che rende concreto il "governato": ho provato a fare `LIST` sul path S3 della tabella
direttamente dal warehouse, da owner del catalogo. Rifiutato:

```text
INVALID_PARAMETER_VALUE.LOCATION_OVERLAP: Input path url 's3://…/tables/c071…'
overlaps with managed storage within 'ListFiles' call.
```

Unity Catalog non ti lascia aggirare la tabella per andare a guardare i file della managed location,
nemmeno se quella location l'hai registrata tu. L'accesso passa dal contratto, in scrittura come in
lettura. È esattamente la proprietà su cui Zerobus si appoggia.

## Perché Arrow Flight qui è interessante

La documentazione su
[Arrow Flight con Zerobus Ingest](https://docs.databricks.com/aws/en/ingestion/zerobus-arrow-flight)
lo posiziona come terza opzione accanto a JSON e Protobuf: mandi `RecordBatch` Arrow direttamente
sullo stesso endpoint, con `DoPut` sopra gRPC.

Nel mio demo il vantaggio prestazionale non è il punto: 64 righe non misurano nulla. Il punto è
l'interfaccia mentale. Se stai già aggregando dati in forma colonnare, o se arrivi da Polars,
DataFusion, pyarrow o `arrow-rs`, non devi tornare per forza a JSON riga-per-riga solo per entrare
nel lakehouse.

Il path Arrow nel producer è questo: stesso endpoint, stesso OAuth, ma lo stream si costruisce
attorno a uno schema Arrow e i 64 eventi partono come un singolo `RecordBatch`:

```rust
let schema = Arc::new(ArrowSchema::new(vec![
    Field::new("event_id", DataType::LargeUtf8, true),
    Field::new("device_id", DataType::LargeUtf8, true),
    Field::new("event_time_ms", DataType::Int64, true),
    Field::new("batch_id", DataType::LargeUtf8, true),
    Field::new("sequence_num", DataType::Int64, true),
    Field::new("temperature_c", DataType::Float64, true),
    Field::new("humidity_pct", DataType::Float64, true),
    Field::new("battery_pct", DataType::Float64, true),
    Field::new("source", DataType::LargeUtf8, true),
]));

let mut stream = sdk
    .stream_builder()
    .table(table_name)
    .oauth(client_id, client_secret)
    .arrow(schema.clone())
    .max_inflight_batches(8)
    .build_arrow()
    .await?;

let offset = stream.ingest_batch(batch).await?;
stream.wait_for_offset(offset).await?;
stream.close().await?;
```

![RecordBatch to Delta via Rust SDK and Arrow Flight](/AndreaBozzo/blog/images/zerobus-rust-arrow-flight.png "RecordBatch to Delta via Arrow Flight")

Mi piace per lo stesso motivo per cui continuo a tornare su Arrow nei post sui data systems: non è
un formato "di storage", e non è solo una libreria. È un data plane. Se un producer nasce
colonnare, mantenere quella forma fino al confine di ingestion riduce copie, conversioni e punti in
cui il contratto diventa implicito.

Detto questo, Arrow Flight in Zerobus è ancora in beta. Per traffico semplice, sparso e
one-row-at-a-time, JSON o Protobuf restano più diretti. Arrow diventa interessante quando il batch è
naturale.

## Le limitazioni da mettere prima della demo

Qui è facile vendersi una storia troppo pulita: "no Kafka, basta SDK, fine". Non è il criterio giusto.

I limiti che terrei davanti alla scelta sono questi:

- **Delivery at-least-once.** Il producer deve avere una chiave idempotente o una strategia di deduplica
  se i duplicati contano. Nel mio schema `event_id` esiste per questo.
- **Ordering per stream.** L'ordering è garantito dentro uno stream; se aumenti throughput aprendo
  più stream e fai round-robin, non hai più ordering globale.
- **Niente auto-evolution.** Zerobus non evolve la tabella. Aggiungere colonne nullable è gestibile
  (i campi mancanti diventano NULL), ma schema e producer devono restare coordinati.
- **Managed Delta, non default storage.** Questo è il punto che ho verificato nel workspace reale:
  una tabella managed in default storage non basta.
- **Record size e quote contano.** Il limite per record è 10 MB, e vale anche per ogni singola riga
  dentro un `RecordBatch` Arrow. Le quote documentate sono 100 MB/s e 15.000 record/s per stream,
  10 GB/s per tabella target; workspace e tabella devono stare nella stessa region.
- **Il buffer non è retention.** I dati accettati ma non ancora materializzati vivono al massimo
  31 giorni nel servizio. Non è un log da cui rileggere: è una coda di consegna.
- **Non è un event bus.** Se ti servono replay lunghi, fan-out multi-team, consumer indipendenti o
  retention come prodotto, stai ancora parlando con Kafka, Kinesis, NATS, Pulsar o simili.

Il criterio che userei è semplice: se l'evento ha una vita propria, usa un bus. Se l'evento esiste
per arrivare in una tabella governata e il resto della piattaforma legge da lì, Zerobus merita una
prova.

## La cosa che mi porto via

La parte più istruttiva non è stata scrivere il producer. Quello è stato piacevolmente piccolo. La
parte interessante è stata il fallimento iniziale su default storage, perché mi ha obbligato a
rendere esplicito il confine vero della demo: storage credential, external location, managed
location, catalogo. Tutta la parte AWS che di solito resta implicita è diventata parte del contratto.

Nel post dlt+dbt il confine era "uno schema Unity Catalog tra due tool". Qui il confine è ancora più
presto: il producer entra già nel mondo governato. Non manda un messaggio in un luogo neutro sperando
che un connettore lo interpreti dopo; apre uno stream verso una tabella con nome, schema, permessi e
storage. E il Delta log lo registra come qualsiasi altro writer, con la sua identità.

Questo non rende Zerobus una risposta universale. Ma rende più nitida una domanda che vale anche
fuori da Databricks:

> quando il lakehouse è il sink reale, voglio davvero mantenere un bus general-purpose, o voglio
> spostare il contratto al bordo producer?

Per una piattaforma con molti consumer, la risposta resta bus. Per una pipeline single-sink, governata
e ad alto volume, questa demo mi ha convinto che vale la pena avere una seconda opzione.

## Fonti

- [Zerobus Ingest connector overview](https://docs.databricks.com/aws/en/ingestion/zerobus-overview)
- [Use the Zerobus Ingest connector](https://docs.databricks.com/aws/en/ingestion/zerobus-ingest)
- [Use Arrow Flight with Zerobus Ingest](https://docs.databricks.com/aws/en/ingestion/zerobus-arrow-flight)
- [Zerobus Ingest connector limitations](https://docs.databricks.com/aws/en/ingestion/zerobus-limits)
- [Databricks Zerobus Rust SDK docs](https://docs.rs/databricks-zerobus-ingest-sdk/latest/databricks_zerobus_ingest_sdk/)
- [Unity Catalog managed storage locations](https://docs.databricks.com/aws/en/connect/unity-catalog/cloud-storage/managed-storage)
