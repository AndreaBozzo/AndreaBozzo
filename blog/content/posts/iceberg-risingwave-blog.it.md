---
title: "RisingWave e Iceberg-Rust: Quando il Real-Time Streaming Incontra il Modern Data Lake"
date: 2025-11-10T12:00:00+01:00
draft: false
tags: ["Rust", "Data Engineering", "Apache Iceberg", "RisingWave", "Streaming", "Lakehouse", "CDC"]
categories: ["Data Engineering", "Open Source"]
description: "Come RisingWave e Apache Iceberg Rust stanno rivoluzionando l'architettura dei data lakehouse moderni con streaming real-time, hybrid delete strategy, e un ecosistema Rust end-to-end"
summary: "La partnership tra RisingWave e Iceberg-Rust rappresenta una finestra su dove sta andando il data engineering moderno: streaming CDC real-time, hybrid delete strategy intelligente, e un ecosistema Rust performante che sfida il dominio JVM."
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
    image: ""
    alt: "RisingWave e Iceberg-Rust"
    caption: ""
    relative: false
    hidden: true
---

## Introduzione

L'ecosistema di Apache Iceberg sta vivendo una trasformazione affascinante. Mentre la comunità Java mantiene l'implementazione matura e consolidata, un movimento parallelo in Rust sta guadagnando slancio, portando con sé l'opportunità di costruire streaming data lakehouse che sono veramente efficienti, scalabili e developer-friendly. **RisingWave**, una piattaforma streaming costruita interamente in Rust, è uno dei protagonisti principali di questa rivoluzione, e la sua integrazione con Iceberg-Rust rappresenta un case study affascinante di come le nuove implementazioni del formato Iceberg stanno cambiando il modo in cui facciamo data engineering moderno.

## L'Origine: Da icelake a Apache Iceberg Rust

La storia inizia molto prima del lancio ufficiale di Apache Iceberg Rust come progetto Apache. Nel 2024, uno sviluppatore visionario, Xuanwo, ha creato **icelake**, una libreria Rust non ufficiale per interagire con Apache Iceberg. Il progetto era brillante ma rimase isolato.

Poi, accade qualcosa di importante: **RisingWave scopre icelake** e vede il potenziale. Il team di RisingWave, guidato da Renjie (founder e CEO Yingjun Wu), decide che questo è il pezzo mancante del loro puzzle. Invece di costruire un'altra implementazione Iceberg in Rust, decidono di collaborare con la comunità.

Xuanwo e i contributori di RisingWave (tra cui ZENOTME) integrano icelake e cominciano a risolvere bug, aggiungere write support, e costruire un sink Iceberg robusto. Questa collaborazione incarna perfettamente la filosofia open source: **Community Over Code**. Il risultato? Nel 2024, il progetto viene donato alla Apache Software Foundation e nasce **Apache Iceberg Rust**, diventando il progetto ufficiale.

Questo è un momento cruciale: due problemi vengono risolti simultaneamente. RisingWave ottiene una libreria Iceberg Rust robusta e mantenuta dalla comunità. La comunità Rust ottiene una forza lavoro d'uso reale che guida priorità, bug fix, e roadmap.

## Il Problema che RisingWave Affronta: Lo Streaming CDC a Iceberg

Prima di approfondire la soluzione, è importante capire il problema che RisingWave risolve in modo unico. Quando vuoi fare streaming da database transazionali (PostgreSQL, MySQL, SQL Server) verso Iceberg in tempo reale via CDC (Change Data Capture), affronti una sfida complessa: **come gestire le cancellazioni a livello di riga**?

Apache Iceberg offre due meccanismi:

1. **Position Delete**: Cancella per locazione fisica precisa (file path + row number). Velocissimo per le query, ma richiede di conoscere dove il record vive nel file. Per streaming CDC, questo significa interrogare Iceberg per ogni delete, generando I/O casuale, latenza inaccettabile.

2. **Equality Delete**: Cancella per valore delle colonne (tipicamente primary key). Naturale per CDC perché non richiedi la posizione fisica, solo il valore della chiave. Ma questo crea numerosi file di delete che amplificano le letture nelle query.

Finora, la maggior parte delle soluzioni sceglieva una strada e subiva le conseguenze. RisingWave con iceberg-rust prende una strada diversa.

## La Soluzione: RisingWave e Iceberg-Rust in Sinergia

### 1. Hybrid Delete Strategy

RisingWave implementa una strategia intelligente:

- **Primary keys aggiornati multiple volte nello stesso batch**: Usa **Position Delete** (efficiente, perché conosce già la posizione dentro il batch)
- **Updates/deletes al di fuori del batch corrente**: Usa **Equality Delete** (la scelta pragmatica per CDC streaming)

Questo è reso possibile grazie alla profonda integrazione di RisingWave con iceberg-rust, dove il codice di RisingWave e quello di iceberg-rust comunicano ad un livello di astrazione che un client HTTP non potrebbe mai raggiungere.

### 2. Schedulable Compaction

Qui entra in gioco un'altra componente Rust cruciale: **DataFusion**. RisingWave usa Apache DataFusion per compaction intelligente che:

- Rimuove periodicamente i file di equality delete
- Compatta i file piccoli in file più grandi
- Riduce l'amplificazione di lettura senza sacrificare la freschezza dei dati

Lo straordinario? RisingWave implementa modalità di compaction diverse a seconda del carico:
- **Low-latency mode**: compaction frequente per query veloci in tempo reale
- **Partial compaction**: limita lo scope basato su range di chiavi
- **Large-scale optimization**: parallelismo multi-node per tabelle TB/PB-scale

### 3. Export Phase: Cross-Engine Compatibility

RisingWave riconosce che non tutti i query engine supportano equality delete (Databricks, Snowflake esterno, Redshift hanno limitazioni). Quindi esegue **targeted compaction prima dell'export** per produrre una versione "pulita" senza file di delete:

- Le query interne real-time continuano a usare la versione con equality delete (bassa latenza)
- I query engine esterni ottengono una versione pulita (compatibilità garantita)

### 4. Exactly-Once Delivery con Two-Phase Commit

A differenza delle soluzioni basate su Flink CDC o Kafka Connect, RisingWave utilizza un **custom logstore con idempotent commits**:

- Tutti i commit sono reproducibili e verificabili
- Zero duplicati, zero perdite di dati
- Overhead minimo, perfetto per scenari ad alta frequenza di update/delete

Questa è abilitata dalla stretta integrazione con iceberg-rust, dove RisingWave può controllare direttamente il ciclo di vita del commit Iceberg.

## Lo Stack Rust Completo: Quando Tutto Si Riunisce

RisingWave non usa iceberg-rust in isolamento. È parte di un ecosistema Rust più ampio:

- **RisingWave**: Built 100% in Rust, streaming database con S3 come primary storage
- **Apache Iceberg Rust**: Libreria nativa Rust per interagire con Iceberg
- **Apache DataFusion**: Engine di query distribuito in Rust, usato da RisingWave per compaction
- **Apache OpenDAL**: Abstrazione di storage unificata che RisingWave usa (supporta S3, GCS, Azure Blob)
- **Apache Arrow**: Formato di memoria per Rust e linguaggi polyglot

Questo stack rappresenta una shift fondamentale nell'architettura dei data platform. Non è JVM + Scala/Java. Non è Python + Spark. È Rust end-to-end, con le performance, memory safety, e senza garbage collection delays che questo comporta.

## Il Case Study Reale: Siemens

Siemens è un cliente enterprise che aveva la seguente pipeline prima di RisingWave:

```
SQL Server → Debezium → Kafka → RisingWave → Spark Job (cleanup) → Iceberg → Snowflake
```

Innumerevoli componenti, innumerevoli punti di configurazione, innumerevoli punti di failure. Con RisingWave e iceberg-rust, la pipeline diventa:

```
SQL Server → RisingWave (con CDC integrato) → Iceberg → Snowflake
```

I benefici:

- **Latency**: Da ore (batch Spark) a secondi (streaming continuo)
- **Operazionale**: Niente Debezium o Kafka da configurare, monitorare, upgradare
- **Cost**: 90% più economico rispetto a Spark jobs frequenti
- **Reliability**: Exactly-once semantics garantite nativamente

Siemens implementa la hybrid delete strategy di RisingWave:
- Position delete per primary key aggiornate multiple volte nel batch
- Equality delete per updates/deletes fuori-batch
- Schedulable compaction automatica che rimuove equality delete files al momento giusto

Il risultato? I sistemi di controllo del rischio di Siemens ottengono visibility real-time ai dati Iceberg con latenza di secondi, mentre Snowflake ottiene una versione pulita e compatibile dei dati per analytics.

## Le Lacune di Iceberg-Rust che RisingWave Sta Aiutando a Colmare

Ricordiamo dalla ricerca precedente che Iceberg-Rust ha diverse lacune rispetto alla versione Java. RisingWave sta dimostrando come superarle nella pratica:

1. **Write Operations**: RisingWave contribuisce continuamente a iceberg-rust con miglioramenti di write performance e supporto per nuove operazioni
2. **Delete Handling**: La soluzione hybrid di RisingWave è diventata un modello per come altre librerie dovrebbero affrontare il problema
3. **Compaction**: RisingWave contribuisce a miglioramenti di DataFusion per compaction Iceberg
4. **Transazioni**: Le primitive di two-phase commit che RisingWave usa influenzano il design delle transazioni future in iceberg-rust

RisingWave non è solo un utente di iceberg-rust; è un driver di innovazione dell'ecosistema Rust.

## L'Implicazione Più Ampia: Un Nuovo Paradigma di Data Engineering

La sinergia tra RisingWave e Iceberg-Rust rappresenta qualcosa di più profondo di una semplice integrazione prodotto. Rappresenta l'emergere di un nuovo paradigma:

### Prima (JVM-dominant):
```
Data → Kafka (JVM) → Spark (JVM) → Parquet/Delta → Data Warehouse
    (Scala/Java impl)
```

### Ora (Polyglot, Rust-accelerated):
```
Data → RisingWave (Rust) → Iceberg (Rust impl) → Data Lakehouse
    (DataFusion for compute)
         ↓
    Other query engines (Trino, DuckDB, etc.)
```

### Benefici:

1. **Performance**: Rust offre performance superiore senza garbage collection pauses
2. **Memory efficiency**: Streaming CDC con RisingWave usa una frazione della memoria di Spark jobs equivalenti
3. **Latency**: Sub-100ms query latency per streaming analytics
4. **Cost**: AWS report di 90% cost reduction vs. Spark-based approaches
5. **Flexibility**: Interoperabilità con Databricks, Snowflake, Redshift tramite standard Iceberg

## Sfide e Considerazioni

Nonostante il progresso, rimangono sfide:

1. **Maturity**: Iceberg-Rust è ancora v0.7.0. Non tutti gli edge case sono coperti rispetto a Java.
2. **Puffin & Deletion Vectors V3**: Ancora in sviluppo. RisingWave supporta V2 per ora.
3. **Cross-engine testing**: RisingWave usa test di Spark tramite DataFusion Comet, ma non tutte le combinazioni sono testate.
4. **Community size**: Il team di contributor è più piccolo che per Java, il che significa meno bandwidth per bug fix.

Ma questi sono "soluzioni in corso", non blockers fondamentali.

## Conclusione: Il Futuro è Streaming + Lakehouse + Rust

La partnership tra RisingWave e Iceberg-Rust non è un'anomalia; è una finestra su dove sta andando il data engineering moderno.

RisingWave ha scelto di costruire sulla fondazione di iceberg-rust invece che reinventare. In cambio, ha guadagnato una libreria Iceberg robusta, mantenuta, e continuamente migliorata. L'ecosistema Rust ha guadagnato un case study di produzione che guida innovation e priorità.

Per le organizzazioni che guardano avanti, il messaggio è chiaro: **il panorama dei data platform non è più dominato da JVM**. Rust non è una scelta eccentrica di nicchia; è una alternativa pragmatica, con performance, memory safety, e operational efficiency che la rende attraente per streaming data lakehouse moderni.

Se stai costruendo pipeline di data real-time, stai considerando Iceberg per data lake aperto, o sei interessato al futuro dei data platform, RisingWave + Iceberg-Rust è un case study che merita la tua attenzione.

---

## Risorse Consigliate

- RisingWave documentation: Interact with Apache Iceberg
- Apache Iceberg Rust: https://github.com/apache/iceberg-rust
- The Equality Delete Problem in Apache Iceberg (blog RisingWave)
- Postgres CDC to Iceberg: Lessons from Real-World Data Engineering (blog RisingWave)
- Deep Dive: S3-as-primary-storage Architecture (blog RisingWave)
