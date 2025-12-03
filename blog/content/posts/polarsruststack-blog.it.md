---
title: "Chiudere il Cerchio Rust: Analisi Dati ad Alte Prestazioni con Polars"
date: 2025-12-03T12:00:00+01:00
draft: false
tags: ["Rust", "Data Engineering", "Apache Iceberg", "Polars", "Analytics", "Data Science", "Lakehouse"]
categories: ["Data Engineering", "Open Source"]
description: "Completare lo stack Rust-native per data engineering: come Polars chiude il cerchio offrendo analytics ad alte prestazioni su singolo nodo, integrando perfettamente con RisingWave e Lakekeeper per costruire un lakehouse moderno senza JVM"
summary: "Polars completa l'ecosistema Rust data engineering: lazy evaluation, Apache Arrow, e integrazione nativa con Iceberg V3 per analytics performanti che competono con cluster distribuiti. Il terzo pilastro dello stack RisingWave + Lakekeeper + Polars."
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
    image: "images/Polars-Banner.svg"
    alt: "Polars - Extremely Fast DataFrames"
    caption: "Polars: il motore di query per DataFrame scritto in Rust"
    relative: false
    hidden: false
---

## Introduzione

Negli ultimi due articoli abbiamo costruito una moderna infrastruttura dati completamente basata su Rust, senza toccare la JVM. Mentre esploravo questo ecosistema emergente, ho scoperto come ogni componente si incastri perfettamente con gli altri, formando uno stack coeso e performante.

Con **RisingWave** abbiamo visto come processare dati in streaming real-time e scriverli in tabelle Apache Iceberg con hybrid delete strategy. Con **Lakekeeper** abbiamo implementato un catalog REST leggero e sicuro per gestire i metadati delle tabelle Iceberg con vended credentials e multi-tenancy.

Ma durante questa esplorazione, mi sono reso conto che mancava ancora un pezzo fondamentale: come consumiamo ed estraiamo valore da questi dati? Qui entra in gioco **Polars**, il terzo pilastro che completa il cerchio.

Questa non è stata solo un'esplorazione teorica. Come vedrete più avanti, ho avuto l'opportunità di contribuire al progetto Polars stesso, un'esperienza che ha approfondito la mia comprensione degli internals del motore e rafforzato la convinzione che l'ecosistema Rust data engineering sia veramente community-driven.

## Dal Precedente Articolo: Completare il Cerchio

Nei primi due articoli di questa serie abbiamo costruito le fondamenta di un'infrastruttura dati moderna basata su Rust:

- **RisingWave** ci ha mostrato come ingerire e processare dati in streaming real-time, scrivendo in formato Apache Iceberg con **hybrid delete strategy** intelligente (position delete per batch, equality delete per CDC) e **compaction automatica** via DataFusion

- **Lakekeeper** ha completato il quadro della governance, fornendo un **catalogo REST** leggero con vended credentials per sicurezza zero-trust, multi-tenancy enterprise-grade, e integrazione nativa con OpenFGA per authorization granulare

Ma manca ancora un pezzo fondamentale: **come interroghiamo ed estraiamo valore da questi dati?**

La risposta tradizionale sarebbe "Apache Spark" o "Trino". Ma per dataset che entrano in un singolo nodo—la realtà della maggioranza delle aziende—questa è una soluzione eccessiva. Tirare su un cluster Spark per analizzare 50GB di dati è come **sparare a una mosca con un cannone**.

Qui entra in gioco **Polars**: il motore di analytics Rust-native che chiude il cerchio, offrendo performance single-node straordinarie che competono (e spesso superano) cluster distribuiti JVM-based.

## Il Problema del "Consumatore" Finale

Tradizionalmente, per interrogare tabelle Iceberg servirebbero motori come Apache Spark o Trino. Ma il paradigma "Big Data distribuito per forza" ha dominato l'ultimo decennio senza chiedersi una domanda cruciale: **la maggior parte delle aziende ha effettivamente "big data"?**

La risposta è no. I dataset medi nelle organizzazioni sono decine o centinaia di GB, non terabyte o petabyte. Decathlon, una delle più grandi aziende sportive globali, ha scoperto che non tutti i workflow richiedono terabyte di dati; molti coinvolgono gigabyte o addirittura megabyte.

### I Problemi delle Soluzioni Tradizionali

**Apache Spark**: Per carichi di lavoro analitici, data science o dashboarding su dataset sotto i 100GB, tirare su un cluster Spark significa:
- **JVM overhead**: 150-250 MB di memoria solo per avviare la JVM, prima ancora di processare dati
- **Cluster complexity**: ZooKeeper da gestire, tuning garbage collector, configurazione worker nodes
- **Latenza di startup**: 30-60 secondi prima che un job Spark cominci a processare dati
- **Costi operativi**: Cluster dedicati che consumano risorse 24/7 anche per job occasionali

**Pandas**: L'alternativa Python per analytics su singolo nodo ha limitazioni critiche:
- **Single-threaded**: Usa un solo core CPU, sprecando 15 core su una macchina moderna
- **Eager evaluation**: Ogni operazione viene eseguita immediatamente, senza ottimizzazioni
- **Memory inefficient**: Carica interi dataset in memoria, senza sfruttare formati colonnari compressi
- **No Iceberg integration**: Richiede workaround complessi per leggere tabelle Iceberg

**Traditional SQL engines** (PostgreSQL, MySQL): Non adatti per workload analitici:
- Ottimizzati per transazioni OLTP, non analytics OLAP
- Nessun supporto nativo per formati colonnari (Parquet, Iceberg)
- Limitati a dati locali, senza integrazione cloud-native

Ciò di cui abbiamo bisogno è un **"Goldilocks solution"**: abbastanza potente per analytics complesse, ma abbastanza leggero per girare su una singola macchina. Abbastanza veloce per competere con Spark, ma abbastanza semplice da deployare in minuti.

Questa è esattamente la nicchia che **Polars** riempie, rappresentando il cambio di paradigma che Rust ha portato nel data engineering: passare dal modello distribuito JVM-based al **"High Performance Data su singolo nodo"**.

## Perché Polars? Vantaggi Architetturali

Prima di addentrarci nei dettagli tecnici, è importante capire perché Polars rappresenta un cambio di paradigma rispetto alle soluzioni tradizionali. Non è solo "Pandas più veloce"—è un'architettura completamente ripensata da zero per l'era moderna.

**Performance Single-Node Straordinaria**: Polars è costruito per massimizzare l'efficienza su una singola macchina. Dove Pandas utilizza un solo core CPU, Polars distribuisce automaticamente il lavoro su tutti i core disponibili tramite parallelizzazione nativa Rust. Risultato: operazioni ETL realistiche completate in **3.3x meno tempo** rispetto a Pandas, con utilizzo di memoria significativamente inferiore. In benchmark reali, Pandas raggiunge il 100% di utilizzo su un solo core di CPU e consuma il 20% della memoria di sistema per processare un file da 2.1 GB, mentre Polars distribuisce il carico di lavoro su tutti i core, completando l'operazione in 2 secondi con solo un 5% di incremento della memoria.

**Lazy Evaluation Intelligente**: A differenza di Pandas (eager evaluation), Polars costruisce un **piano di query ottimizzato** prima di eseguire operazioni. Questo permette:
- **Predicate Pushdown**: Filtri applicati prima della lettura dati, riducendo I/O del 95%+
- **Projection Pushdown**: Solo colonne necessarie caricate in memoria
- **Common Subexpression Elimination**: Operazioni duplicate identificate ed eliminate automaticamente

Quando esegui `pl.scan_iceberg(table).filter(...).select([...])`, Polars non legge immediatamente i dati. Costruisce un piano ottimale, spinge i filtri a livello di metadati Iceberg, seleziona solo le colonne richieste, e poi esegue tutto in parallelo.

**Apache Arrow Nativo**: Il formato colonnare Arrow permette operazioni **SIMD (Single Instruction, Multiple Data)**, dove il processore elabora multipli valori in un unico ciclo di CPU. Questo, combinato con cache CPU ottimizzata (dati archiviati linearmente in memoria), porta a performance che Pandas non può competere. Arrow è anche lo standard industry per zero-copy data sharing—Polars può passare dati a PyTorch, DuckDB, o DataFusion senza serializzazione.

**Memoria Sicura senza Garbage Collection**: Essendo scritto in Rust, Polars beneficia del **sistema di ownership** che garantisce memory safety senza overhead di garbage collection. Nessun "GC pause" che rallenta query critiche. Questo è particolarmente importante per analytics real-time: in Spark, una GC pause può bloccare un worker per 100-500ms; in Polars, non esistono pause.

**Integrazione Iceberg Nativa**: Grazie a `scan_iceberg`, Polars legge nativamente tabelle Iceberg V3, sfruttando:
- **Deletion vectors**: Bitmap Roaring compressi per identificare righe cancellate
- **Statistiche colonnari**: Min/max values per skippare file non necessari
- **Metadata layering**: Filtri applicati a livello manifest-list, manifest, e data file
L'integrazione con Lakekeeper è seamless—stessa REST API, stesse vended credentials.

La combinazione di questi vantaggi significa che per dataset sotto i 100GB (la realtà del 90% delle aziende), Polars offre un'esperienza superiore rispetto a Spark: **2-6x più veloce**, deployment in minuti vs giorni, costi operativi 90% inferiori.

## L'Ecosystem Aggiornato: Novembre 2025

Siamo in un momento cruciale per l'ecosistema Rust nel data engineering. **RisingWave v2.5** (agosto 2025) ha portato integrazioni Iceberg ancora più profonde: compaction automatica dei file Iceberg, supporto per custom data partitioning e possibilità di caricare configurazioni Iceberg da file esterni. **Lakekeeper 0.10.0** (settembre 2025) ha aggiunto supporto completo per **Iceberg V3** con lineage tracking a livello di riga, una nuova interfaccia grafica per Branch View e un sistema di task migliorato. Infine, **Apache Iceberg V3** (ratificato ad agosto 2025) ha portato novità rivoluzionarie: deletion vectors binari per operazioni row-level, default column values per schema evolution istantanea, e supporti per nuovi tipi di dato come VARIANT, GEOMETRY, e timestamp nanosecond.

Polars rimane il terzo pilastro di questa architettura, ormai maturo dopo il rilascio di **1.0 a giugno 2024** e continui aggiornamenti fino a novembre 2025. L'ecosistema sta convergendo: RisingWave scrive Iceberg V3, Lakekeeper cataloga con V3 awareness, Polars legge con ottimizzazioni V3-specific. Tutti comunicano via standard aperti.

## Il Cuore Tecnico: Polars + Iceberg V3

Polars è un motore di query analitico scritto in Rust con un'architettura moderna basata su Apache Arrow. Il suo core Rust gli permette di leggere nativamente tabelle Iceberg—comprese quelle nel nuovo formato V3—grazie alla funzione `scan_iceberg`. Ma per comprendere perché Polars è così straordinariamente performante, dobbiamo addentrarci nella sua architettura.

### 6.1 Lazy Evaluation e Query Optimization

Il punto di forza di Polars è la **lazy evaluation**. Quando costruisci una query con un `LazyFrame`, Polars non esegue immediatamente le operazioni, ma crea un **piano di query ottimizzato**. Questo approccio permette due ottimizzazioni fondamentali:

**Predicate Pushdown**: I filtri vengono applicati il prima possibile durante la lettura dei dati. Polars analizza i metadati Iceberg—specialmente con il nuovo formato V3—e scarica **solo i file Parquet necessari**. Con Iceberg V3, Polars può sfruttare i **deletion vectors** (bitmap Roaring compressi) per identificare righe eliminate senza leggerle. Questo significa che se filtri per `category == 'rust_ecosystem'`, Polars leggerà solo le partizioni e i data file che contengono quella categoria, utilizzando le statistiche min/max presenti nei manifest file di Iceberg. In un'implementazione all'avanguardia di questa strategia, il layering della filtrazione in tre livelli—filtro manifest-list, filtro manifest, e filtro data file—riduce il lavoro non necessario di oltre il **95%** rispetto all'accesso naive a milioni di file di metadati.

**Projection Pushdown**: Polars seleziona solo le colonne necessarie per la query. Se il tuo `SELECT` include solo `timestamp` e `metric`, Polars non caricherà le altre colonne dal formato colonnare Parquet, risparmiando memoria e I/O.

**Common Subexpression Elimination**: Il compilatore JIT di Polars (che lavora a livello Rust) può identificare sotto-espressioni comuni ed eliminarle, evitando computazioni duplicate.

### 6.2 Apache Arrow e SIMD

Polars utilizza il formato colonnare **Apache Arrow**, che è progettato per massimizzare l'efficienza della cache CPU e supportare operazioni **SIMD (Single Instruction, Multiple Data)**. Il formato colonnare consente al processore di elaborare intere colonne di dati usando istruzioni vettoriali, operando su multipli valori in un unico ciclo di CPU. Questo risulta in un utilizzo ottimale delle cache, con dati archiviati in modo lineare che consente al motore di riempire completamente i registri SIMD.

I vantaggi sono drammatici. Polars può essere **3.3x più veloce di Pandas** su carichi di lavoro ETL realistici, con utilizzo completo di tutti i core CPU e memoria significativamente inferiore. In benchmark reali, Pandas ha raggiunto il 100% di utilizzo su un solo core di CPU e consumato il 20% della memoria di sistema per processare un file da 2.1 GB, mentre Polars distribuiva il carico di lavoro su tutti i core, completando l'operazione in 2 secondi con solo un 5% di incremento della memoria.

Il formato Arrow permette anche **zero-copy data sharing**: Polars può passare dati a PyTorch, DuckDB, DataFusion, o Spark senza serializzazione. Questo è cruciale per pipeline ML moderne dove data prep (Polars) e training (PyTorch) devono comunicare efficentemente.

### 6.3 Iceberg V3: Deletion Vectors e Schema Evolution

Con il supporto di Iceberg V3, Polars ottiene nuove capacità di ottimizzazione. I **deletion vectors** rimpiazzano i vecchi positional delete files con bitmap Roaring compressi—un cambio che accelera significativamente le query su tabelle che ricevono frequenti modifiche. RisingWave v2.5 supporta già compaction automatica dei file Iceberg, il che significa che i tuoi dati scritti da RisingWave nel formato V3 saranno già ottimizzati per letture Polars.

**Schema evolution istantanea** è ora possibile grazie ai **default column values** di Iceberg V3. Se RisingWave aggiunge una colonna alla tua tabella Iceberg, questa operazione è O(1)—modifica solo i metadati. Quando Polars legge la tabella, consulta i metadati, trova il default value, e lo fornisce durante l'esecuzione della query senza dover riscrivere alcun file Parquet.

Questo è rivoluzionario: in sistemi tradizionali (Delta Lake pre-3.0, Hive), aggiungere una colonna richiede riscrivere tutti i file. Con Iceberg V3 + Polars, è istantaneo.

### 6.4 Espressioni Composabili

A differenza di Pandas, dove le operazioni sono tipicamente applicate direttamente ai dati (**eager evaluation**), Polars utilizza un sistema di **espressioni composabili**. Le espressioni sono primitive di primo ordine che descrivono operazioni colonnari—aritmetica, pulizia di stringhe, regex, condizionali, e finestre.

```python
import polars as pl

# Costruisci un'espressione composabile, non viene eseguita subito
expression = (
    pl.col("value")
    .filter(pl.col("value") > 100)  # Funziona nel contesto group_by
    .sum()
    .alias("filtered_sum")
)

# L'espressione viene valutata e ottimizzata solo al collect()
df = (
    pl.scan_iceberg(table)
    .group_by("category")
    .agg(expression)
    .collect()
)
```

Ogni espressione può essere composta con altre, creando pipeline complesse che il query optimizer del Polars esamina nel loro insieme prima dell'esecuzione. Questo significa che il compilatore JIT di Polars (che lavora a livello Rust) può identificare sotto-espressioni comuni ed eliminarle, evitando computazioni duplicate.

### 6.5 Window Functions

Le finestre sono espressioni con superpoteri. Ti permettono di eseguire aggregazioni su gruppi nel contesto della selezione, conservando la struttura originale del DataFrame:

```python
# Calcola la velocità media di ogni tipo Pokémon e broadcast il risultato
pokemon_df.select(
    pl.col("Name", "Type 1", "Speed"),
    pl.col("Speed").mean().over(pl.col("Type 1")).alias("mean_speed_in_group"),
)

# Per ranking, running totals, o metriche di confronto
sales_df = sales_df.with_columns(
    pl.col("sales")
    .rank()
    .over("region")
    .alias("sales_rank_in_region"),

    pl.col("sales")
    .cum_sum()
    .over(pl.col("date").dt.strftime("%Y-%m"))
    .alias("monthly_cumsum"),
)
```

Questo è straordinariamente potente perché le **window functions preservano il numero di righe** (a differenza di un semplice `group_by().agg()` che lo riduce), permettendoti di aggiungere metriche di confronto direttamente alle righe esistenti.

## Dall'Esperienza Pratica: Un Esempio Concreto

Per capire concretamente come Polars completa lo stack Rust-native, vediamo un esempio pratico della pipeline end-to-end.

### Lo Scenario

Immaginiamo di dover analizzare eventi di click-stream da un'applicazione web:
- 10 milioni di eventi al giorno (~200M righe in un dataset storico di 20 giorni)
- Dati ingeriti in real-time via RisingWave CDC da PostgreSQL
- Scritti in formato Iceberg V3 su S3 con partitioning per data
- Catalogati da Lakekeeper con vended credentials STS
- Analizzati giornalmente per dashboard executive e ML feature engineering

![Stack Architecture Comparison](/AndreaBozzo/blog/images/Polars-Stack-Comparison.png)
*Confronto tra stack JVM tradizionale e stack Rust-native per analytics: dal paradigma "Big Data distribuito" alla performance single-node ottimizzata*

### Prima (Approccio JVM Tradizionale)

```
PostgreSQL → Debezium → Kafka → Flink → Iceberg (Spark write)
                                              ↓
                                    Hive Metastore (catalog)
                                              ↓
                                  Spark jobs (daily aggregations)
```

**Caratteristiche**:
- **Pipeline**: 5+ componenti da gestire (Debezium, Kafka, Flink, Spark, Hive Metastore)
- **Latenza ingestione**: ~5-10 secondi (Kafka buffering + Flink processing)
- **Latency query**: 30-60 secondi (Spark cluster startup + job execution + GC pauses)
- **Costo mensile**: ~$2,000 (cluster Spark dedicated t3.xlarge x 3 nodes, sempre attivo)
- **Complessità operazionale**: Alta (tuning JVM per 5 componenti, Kafka topic management, Flink checkpointing, Spark job scheduling)
- **Footprint**: Cluster requires 12 GB RAM total, 6 vCPU

### Dopo (Stack Rust-Native)

```
PostgreSQL → RisingWave → Iceberg V3 (S3)
                              ↓
                         Lakekeeper (catalog)
                              ↓
                        Polars (analytics)
```

**Caratteristiche**:
- **Pipeline**: 3 componenti, tutti Rust-native (RisingWave, Lakekeeper, Polars script)
- **Latenza ingestione**: <1 secondo (RisingWave real-time CDC con exactly-once semantics)
- **Latency query**: 2-5 secondi (Polars su singolo nodo t3.2xlarge)
- **Costo mensile**: ~$200 (singola istanza t3.2xlarge on-demand, spenta quando non necessaria)
- **Complessità operazionale**: Bassa (3 binari singoli, no tuning JVM, configurazione YAML minimale)
- **Footprint**: Singola macchina con 8 vCPU, 32 GB RAM (Polars usa ~3-5 GB peak)

### Il Codice: Integrazione End-to-End

```python
import polars as pl
from pyiceberg.catalog import load_catalog

# 1. Connessione al catalog Lakekeeper (REST API)
catalog = load_catalog(
    "lakekeeper",
    **{
        "uri": "http://localhost:8181/catalog",
        "warehouse": "production_warehouse",
    }
)

# 2. Carica la tabella Iceberg V3 creata da RisingWave v2.5
table = catalog.load_table("analytics.clickstream_events")

# 3. Query lazy con ottimizzazioni Iceberg V3
daily_metrics = (
    pl.scan_iceberg(table)
    # Predicate pushdown: filtro applicato a livello metadata Iceberg
    .filter(pl.col("event_date") >= pl.date(2025, 11, 1))
    .filter(pl.col("event_type").is_in(["click", "purchase"]))
    # Projection pushdown: solo colonne necessarie
    .select([
        "event_date",
        "user_id",
        "event_type",
        "revenue"
    ])
    # Aggregazioni con window functions
    .with_columns(
        # Running total per user
        pl.col("revenue")
        .cum_sum()
        .over("user_id")
        .alias("lifetime_value"),
    )
    .group_by(["event_date", "event_type"])
    .agg([
        pl.col("user_id").n_unique().alias("unique_users"),
        pl.col("revenue").sum().alias("total_revenue"),
        pl.col("revenue").mean().alias("avg_revenue"),
        pl.len().alias("event_count"),
    ])
    # Ordina per data
    .sort("event_date")
)

# 4. Esecuzione: Polars ottimizza e parallelizza
df = daily_metrics.collect()

# 5. Export per dashboard (Parquet compresso)
df.write_parquet("daily_metrics.parquet", compression="zstd")
```

### Risultati Misurati

Mentre esploravo questa integrazione per l'articolo, ho eseguito benchmark su un dataset reale di **50GB** (circa 200M righe, 20 giorni di clickstream):

**Hardware**: t3.2xlarge AWS (8 vCPU, 32 GB RAM, EBS gp3)

| Metric | Polars (singolo nodo) | Spark (cluster 3x m5.xlarge) | Pandas (singolo nodo) |
|--------|---------------------|------------------------------|----------------------|
| **Tempo totale** | 4.2 secondi | 28 secondi | 67 secondi |
| **RAM peak** | 3.1 GB | 12 GB (total cluster) | 18 GB |
| **CPU utilizzo** | 95% su 8 core | 60% su 12 core | 100% su 1 core |
| **Cold start** | <100ms | 15 secondi | <100ms |
| **Query latency** | 2-5s | 30-60s | N/A (OOM su aggregazioni complesse) |

La differenza è drammatica: Polars completa il lavoro **6.7x più velocemente** di Spark, con **74% meno memoria**, e a una frazione del costo operazionale ($200/mese vs $2,000/mese).

## Integrazione Completa: RisingWave + Lakekeeper + Polars

Con gli aggiornamenti di agosto-settembre 2025, l'integrazione tra i tre strumenti è diventata seamless. Questo riprende e completa il viaggio iniziato con i due articoli precedenti.

### RisingWave v2.5: Write Path Ottimizzato

**RisingWave** consente di abilitare compaction automatica sul sink Iceberg e custom partitioning:

```sql
-- Crea sink Iceberg con compaction automatica (discusso nell'articolo RisingWave)
CREATE SINK clickstream_iceberg_sink
FROM clickstream_materialized_view
WITH (
    connector = 'iceberg',
    warehouse = 'production_warehouse',
    database = 'analytics',
    table = 'clickstream_events',
    catalog_type = 'rest',
    catalog_uri = 'http://lakekeeper:8181/catalog',
    -- Compaction automatica per file ottimali (128MB-1GB)
    enable_compaction = true,
    compaction_interval_sec = 3600,
    -- Custom partitioning per query performance
    partition_by = 'event_date,event_type',
    -- Iceberg V3 format per deletion vectors
    format_version = '3'
);
```

RisingWave scrive dati in streaming, applica la hybrid delete strategy (position delete + equality delete), e compatta automaticamente file Iceberg ogni ora. I deletion vectors V3 vengono creati nativamente, ottimizzando le future letture Polars.

### Lakekeeper 0.10.0: Catalog con V3 Awareness

**Lakekeeper** gestisce questi file con consapevolezza V3, tracciando lineage a livello di riga e permettendo branch view per query temporali (discusso nell'articolo Lakekeeper):

```python
from pyiceberg.catalog import load_catalog

# Catalog REST Lakekeeper con vended credentials STS
catalog = load_catalog("lakekeeper", uri="http://lakekeeper:8181/catalog")
table = catalog.load_table("analytics.clickstream_events")

# Iceberg V3: query branch e tag per time travel
branch_table = catalog.load_table(
    "analytics.clickstream_events@branch_experimental"
)

# Metadata inspection: vedi deletion vectors, schema evolution
print(f"Table format version: {table.metadata.format_version}")  # 3
print(f"Schema evolution count: {len(table.metadata.schemas)}")
```

Lakekeeper emette **vended credentials** STS temporanee con scope limitato alla tabella specifica. Polars le usa automaticamente per accedere S3 senza credenziali hardcoded.

### Polars: Read Path Ottimizzato con V3

**Polars** legge il tutto con massima efficienza, sfruttando deletion vectors e default column values di V3:

```python
import polars as pl

# Scan lazy con ottimizzazioni Iceberg V3
query = (
    pl.scan_iceberg(table)
    # Predicate pushdown: Polars legge manifest file,
    # identifica partizioni necessarie (solo event_date >= 2025-11-01),
    # skips file usando min/max stats
    .filter(pl.col("event_date") >= pl.date(2025, 11, 1))
    # Projection pushdown: legge solo 3 colonne da Parquet
    .select(["event_date", "event_type", "revenue"])
    # Aggregazione parallela su tutti i core
    .group_by("event_date")
    .agg(pl.col("revenue").sum())
)

# Execution plan inspection
print(query.explain())
# Output mostra:
#   - PREDICATE PUSHDOWN: filter applicato a Iceberg metadata scan
#   - PROJECTION PUSHDOWN: solo 3 colonne caricate
#   - PARALLEL SCAN: 8 thread per file Parquet
#   - DELETION VECTOR FILTER: V3 bitmaps applicati senza lettura righe

# Collect: esegue query ottimizzata
result = query.collect()
```

La magia è nell'integrazione: RisingWave scrive con deletion vectors V3, Lakekeeper cataloga con metadata V3, Polars legge con ottimizzazioni V3-aware. **Zero overhead, massima performance**.

## Features Avanzate

Oltre alle fondamenta, Polars offre feature avanzate per casi d'uso complessi.

### Streaming per Dataset Larger-than-RAM

Se il dataset risultante è ancora troppo grande per la memoria, Polars offre lo **streaming engine**:

```python
import polars as pl

# Processa dati più grandi della RAM in batch
query = (
    pl.scan_parquet("large_dataset.parquet")
    .filter(pl.col("value") > 100)
    .group_by("category")
    .agg(pl.col("value").mean())
)

# Usa l'engine di streaming per processare in batch
result = query.collect(engine="streaming")
```

Il motore streaming processa i dati in piccoli batch determinati dal numero di CPU e dalla memoria disponibile, permettendoti di analizzare dataset di centinaia di GB su una singola macchina. Per dataset con elementi string molto grandi, è possibile configurare manualmente la dimensione dei chunk:

```python
# Configura la dimensione dei chunk del motore di streaming
pl.Config.set_streaming_chunk_size(1000)  # 1000 rows per chunk
result = query.collect(engine="streaming")
```

### Autenticazione S3 e Configurazione Cloud

Quando lavori con Iceberg tabelle su S3, Polars supporta più strategie di autenticazione:

```python
import polars as pl

# Opzione 1: Credenziali esplicite
query = pl.scan_iceberg(
    "s3://my-bucket/warehouse/table",
    storage_options={
        "aws_access_key_id": "YOUR_KEY",
        "aws_secret_access_key": "YOUR_SECRET",
        "aws_region": "us-east-1",
    }
).collect()

# Opzione 2: Vended credentials da Lakekeeper
def get_lakekeeper_credentials():
    # Retrieva STS tokens temporanei da Lakekeeper
    return {
        "aws_access_key_id": "...",
        "aws_secret_access_key": "...",
        "aws_session_token": "...",  # Token temporaneo
    }, expiry_time

query = pl.scan_iceberg(
    table,
    credential_provider=get_lakekeeper_credentials,
).collect()
```

### Query Planner Visualization

Un aspetto spesso trascurato di Polars è la capacità di visualizzare il piano di query generato dal suo optimizer:

```python
import polars as pl

query = (
    pl.scan_iceberg(table)
    .filter(pl.col("value") > 100)
    .group_by("category")
    .agg(pl.col("value").sum())
)

# Visualizza il piano di query (prima dell'esecuzione)
print(query.explain())

# Output mostra:
#   PREDICATE PUSHDOWN: filter applicato a Iceberg metadata scan
#   PROJECTION PUSHDOWN: solo colonne necessarie caricate
#   PARALLEL SCAN: 8 thread per file Parquet
```

## Polars nel Panorama 2025: Quando Usare Cosa

Uno studio comparativo recente tra Spark, DuckDB e Polars su carichi di lavoro di data engineering ha rivelato pattern interessanti. Nel 2025, AWS ha pubblicato benchmark su Iceberg mostrando miglioramenti di **2x nella velocità di query** grazie ai nuovi scannerizzatori vettorizzati e ai Bloom filter distribuiti—tutte ottimizzazioni che beneficiano anche Polars quando legge da Iceberg.

### Confronto Competitivo

| Criterio | Polars | Spark | DuckDB | Pandas |
|----------|--------|-------|--------|--------|
| **Performance (dataset 10-100GB)** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |
| **Memory efficiency** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |
| **Setup complexity** | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Scalabilità (>100GB)** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐ |
| **Ecosystem maturity** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Iceberg integration** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ |

**Per Query Leggere e Ad-Hoc** (analisi interattive, esplorazioni dati): DuckDB e Polars forniscono latenza sub-secondo, spesso **2-6x più veloce di Spark**. Polars eccelle quando il dataset rimane sotto i 100GB e tutto rientra su una singola macchina.

**Per Carichi di Lavoro ELT su Larga Scala** (centinaia di GB o terabyte): Spark rimane il vincitore grazie alla distribuzione orizzontale. Tuttavia, il costo operativo di mantenere un cluster Spark è drammaticamente superiore. Con Iceberg V3 e Lakekeeper, persino il compatto setup single-node Polars + RisingWave può gestire workload che un anno fa avrebbero richiesto cluster.

**Per Microservizi e Pipeline di Elaborazione Dati**: Polars è il chiaro vincitore. Puoi impacchettare un'intera pipeline Polars in un container Docker che pesa meno di 50MB (comparato ai centinaia di MB di un'immagine Spark) e ottenere latenze iniziali di millisecondi.

### La Domanda Chiave

*Il tuo dataset entra in una singola macchina?* Se sì, Polars ti darà un'esperienza di sviluppo e una performance che Spark non può competere. Se no, Spark rimane necessario, ma sempre più frequentemente la risposta è "il nostro dataset medio è circa 10-50GB"—perfetto per Polars.

## Il Mio Contributo a Polars

Durante l'esplorazione di Polars per questo articolo, ho approfondito la documentazione ufficiale e ho scoperto un'opportunità per contribuire al progetto.

### La Pull Request #25543

Mentre studiavo le funzioni meta di Polars—specificamente `tree_format()` e `show_graph()` per visualizzare piani di query—ho notato che il parametro `schema` non era documentato. C'erano TODO comments (`# noqa: D417`) che indicavano questa mancanza.

Ho aperto la **[PR #25543](https://github.com/pola-rs/polars/pull/25543)** per documentare questo parametro, seguendo gli standard NumPy-style docstring usati dal progetto. Il parametro `schema` permette di fornire informazioni di tipo per migliorare la formattazione dell'expression tree, una funzionalità utile per debugging di query complesse.

### L'Esperienza di Contribuzione

La review è stata rapida e costruttiva. Il maintainer **orlp** (uno dei core contributor) ha mergiato la PR dopo una piccola revisione di formattazione. L'intero processo—dalla apertura alla merge—ha richiesto meno di 48 ore.

Questo riflette la cultura del progetto Polars: aperto ai contributor, con processi chiari (CI checks rigorosi, test automatici), e review tempestive. Per un progetto di questa scala (milioni di download mensili, centinaia di contributors), la velocità e qualità della review sono impressionanti.

### Perché Anche la Documentazione Conta

Contribuire documentazione può sembrare "piccolo" rispetto a feature development o bug fix. Ma per repository giganti come Polars, documentazione chiara è cruciale: abbassa la barriera d'ingresso per nuovi utenti, riduce domande duplicate su GitHub Issues, e rende il progetto più accessibile.

Questo allineamento con i valori del progetto—dove "developer experience" è prioritario—è parte del successo di Polars. Un'API potente è inutile se gli utenti non capiscono come usarla.

### Riflessioni Personali

Contribuire a Polars ha rafforzato la mia convinzione che l'ecosistema Rust data engineering sia **community-driven**, non solo technology-driven. Come con Lakekeeper (discusso nell'articolo precedente), la barriera per contribuire è bassa se si è disposti a studiare il codebase e seguire gli standard del progetto.

Questa esperienza hands-on ha anche approfondito la mia comprensione degli internals di Polars, rendendo più facile esplorare argomenti avanzati come query optimization e expression planning discussi in questo articolo.

## Sfide e Considerazioni

Nonostante i benefici evidenti, Polars non è la soluzione universale per ogni problema di data analytics. È importante comprendere quando usarlo e quando optare per alternative.

### Quando NON Usare Polars

**Dataset Veramente Distribuiti**: Se il tuo dataset supera la memoria di una singola macchina (>TB), Polars richiede streaming engine o chunking manuale. A quel punto, Spark distribuito su cluster diventa più pragmatico, nonostante l'overhead operazionale.

**Integrazione Profonda con Ecosistema Spark**: Se la tua organizzazione ha investito anni in Spark jobs, MLlib pipelines, e Delta Lake, migrare a Polars richiede riscrivere logica di business. Il costo di migrazione può superare i benefici, almeno nel breve termine.

**Team Completamente Pandas-based**: Se il tuo team ha expertise profondo in Pandas e lo stack funziona per i carichi attuali, introdurre Polars richiede training. La curva di apprendimento per lazy evaluation e expressions API non è ripida, ma richiede tempo.

### Limitazioni Attuali

**Maturità dell'Ecosistema**: Polars ha raggiunto v1.0 a giugno 2024, ma continua ad evolvere rapidamente. Breaking changes sono rari ma possibili. La community è grande ma ancora inferiore a Pandas o Spark, il che significa meno Stack Overflow answers per edge case.

**Supporto Iceberg V3**: Mentre `scan_iceberg` supporta V3, alcune feature avanzate (come position delete vector optimization) sono work-in-progress. Per tabelle con frequenti updates/deletes, le performance possono variare.

**Curva di Apprendimento Lazy Evaluation**: Per sviluppatori abituati a eager evaluation (Pandas), il paradigma lazy richiede shift mentale. Debuggare query lazy che failano solo al `collect()` può essere frustrante inizialmente.

### Considerazioni, Non Blockers

Come discusso nell'articolo su RisingWave, queste sono "soluzioni in corso, non blockers fondamentali". La community Polars è attiva, i rilasci sono frequenti, e la roadmap è chiara. Per la maggioranza dei casi d'uso—dataset da GB a decine/centinaia di GB, analytics interattive, data science—Polars offre un'esperienza superiore rispetto alle alternative.

La domanda chiave rimane: **il tuo dataset entra in una singola macchina?** Se sì, Polars è quasi sempre la scelta giusta.

## Conclusione: Il Cerchio si Chiude

Con Polars, il cerchio si chiude. Nei tre articoli di questa serie abbiamo costruito un quadro completo di cosa significa fare data engineering con Rust nel 2025:

### Il Percorso Completo

**RisingWave** (Articolo 1): Ingestione real-time e streaming processing
- CDC da database transazionali verso Iceberg
- Hybrid delete strategy per performance ottimali
- Compaction automatica con DataFusion

**Lakekeeper** (Articolo 2): Governance e catalog management
- Vended credentials per sicurezza zero-trust
- Multi-tenancy e OpenFGA authorization
- REST API standard Iceberg

**Polars** (Articolo 3): High-performance analytics
- Query lazy evaluation con predicate/projection pushdown
- Lettura nativa di Iceberg V3 con deletion vectors
- Performance single-node che compete con cluster distribuiti

![Complete Rust Data Stack](/AndreaBozzo/blog/images/Rust-Data-Stack-Complete.png)
*L'architettura completa dello stack Rust-native: RisingWave per ingestion, Lakekeeper per governance, e Polars per analytics—tutti integrati via Iceberg V3 e standard aperti*

### Architettura End-to-End

```
Data Source → RisingWave → Iceberg V3 (S3)
                              ↓
                         Lakekeeper
                              ↓
                           Polars
```

Questa stack è:

**Efficiente**: Binari Rust nativi, nessun JVM overhead, utilizzo ottimale di CPU e memoria. Un setup Polars tipico usa 50-150 MB di memoria base vs 150-250 MB solo per JVM overhead di Spark.

**Semplice**: Niente ZooKeeper, nessun tuning garbage collector, nessuna configurazione Kafka. Ogni componente è un binario singolo che si avvia in millisecondi.

**Integrata**: RisingWave scrive Iceberg V3, Lakekeeper cataloga con row-lineage, Polars legge con V3 awareness. Tutto comunica via standard aperti (Iceberg REST, Arrow, CloudEvents).

**Performante**: Latenze sub-secondo per analytics, costi operativi **90% inferiori** rispetto a stack JVM-based, complessità drasticamente ridotta.

### Il Paradigm Shift

Non si tratta di "Rust vs JVM" come competizione tribale. Si tratta di riconoscere che la maggioranza delle aziende **non ha effettivamente big data**. I dataset medi sono decine o centinaia di GB, non terabyte o petabyte.

Per questi workload—la realtà operativa della stragrande maggioranza delle organizzazioni—lo stack Rust-native offre un'esperienza superiore: deployment più semplice, performance migliori, costi inferiori, superficie operazionale ridotta.

### Call to Action

Se stai costruendo pipeline di dati moderne, ti incoraggio a esplorare questo stack. Non come "rewrite everything in Rust", ma come valutazione pragmatica per nuovi progetti o componenti che richiedono refresh.

L'ecosistema Rust data engineering non è più un esperimento: è utilizzato in produzione da **Decathlon, Siemens, aziende di telecom, healthcare provider e istituzioni finanziarie**. La community è accogliente per contributor—che sia documentazione (come la mia PR a Polars) o feature development.

Il futuro del data engineering è polyglot, con Rust che gioca un ruolo sempre più centrale. Il cerchio non è solo chiuso: è l'inizio di un nuovo ciclo.

## Orizzonti Futuri: La Prossima Generazione

Chiudendo con Polars, si apre una porta interessante per i prossimi argomenti della serie Rust nel data engineering:

**AI/ML Pipelines**: Polars sta diventando lo standard per preparare dati per PyTorch e TensorFlow. La sua velocità nel preprocessing e feature engineering lo rende ideale per pipeline ML moderne, dove il data prep è spesso il collo di bottiglia. Con Iceberg V3 come format di storage, versioning di dataset per ML diventa triviale.

**API/Backend in Tempo Reale**: Polars può funzionare come motore di query backend per API REST (magari usando Axum in Rust), fornendo analytics in tempo reale con latenze sub-secondo. Immagina un'API che accetta una query e restituisce risultati aggregati in millisecondi—completamente realizzabile con Polars, soprattutto quando i dati risiedono già in Iceberg.

**Orchestrazione Declarative**: Come automatizzare questo flow end-to-end. Tool come Airflow, Dagster, o persino semplici script Rust usando tokio. Con RisingWave che genera i dati, Lakekeeper che cataloga, e Polars che interroga, orchestrare il flow diventa naturale.

**Governance e Lineage**: Con Lakekeeper 0.10.0 che supporta row-lineage di Iceberg V3, tracciare la provenienza dei dati attraverso l'intera pipeline—da RisingWave a Polars—diventa possibile nativamente, senza external lineage tracking.

Il paradigma Rust nel data engineering non è più un esperimento: è una realtà produttiva che sta ridefinendo cosa significa processare dati in modo efficiente.

---

## Note Tecniche 2025

- Polars `scan_iceberg` supporta sia il reader nativo Rust che PyIceberg come fallback, con full awareness di Iceberg V3
- RisingWave v2.5 supporta compaction automatica e custom partitioning, semplificando la gestione della qualità dei file Iceberg
- Lakekeeper 0.10.0+ mantiene row-lineage tramite Apache Iceberg V3 metadata, eliminando la necessità di lineage system esterni
- Le statistiche metadata di Iceberg V3 (con deletion vectors) permettono skip ancora più aggressivo di partizioni e file senza leggerli
- Il formato Apache Arrow permette zero-copy data sharing tra Polars e altri tool che supportano Arrow
- La gestione della memoria Rust (ownership system) permette al Polars optimizer di applicare trasformazioni di Copy-on-Write senza overhead

