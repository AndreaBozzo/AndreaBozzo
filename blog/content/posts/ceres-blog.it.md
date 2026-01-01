---
title: "Ceres: Semantic Search per i Dati Aperti"
date: 2025-12-20T12:00:00+01:00
draft: false
tags: ["Rust", "Data Engineering", "Semantic Search", "Open Data", "CKAN", "PostgreSQL", "pgvector"]
categories: ["Data Engineering", "Open Source"]
description: "Come Ceres risolve il problema della discoverability nei portali open data europei con ricerca semantica, Rust e PostgreSQL+pgvector"
summary: "Ceres è un motore di ricerca semantico per portali CKAN. Costruito in Rust con Tokio e PostgreSQL+pgvector, affronta il gap tra come le persone cercano e come le PA nominano i dataset."
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
    image: "images/Ceres-logo.jpeg"
    alt: "Ceres Logo"
    caption: "Ceres - Semantic Search for Open Data"
    relative: false
    hidden: false
---

I portali open data basati su CKAN pubblicano migliaia di dataset, eppure spesso rimangono invisibili. Un cittadino cerca "inquinamento aria" e non trova nulla perché il dataset ufficiale si chiama "PM10_monitoring_Q3_2024". Un ricercatore che digita "popolazione comune" non scopre i dati demografici perché taggati diversamente. Il problema non è la quantità di informazione disponibile: è che la ricerca per keyword fallisce sistematicamente quando le persone non conoscono la tassonomia dell'amministrazione.

Ceres affronta esattamente questo gap. È un motore di ricerca semantico per portali CKAN, costruito con Rust, Tokio e PostgreSQL+pgvector. Non è una ricerca accademica, né una proof-of-concept lontana dalla realtà. È una risposta pragmatica a un problema che affligge il panorama europeo di open data: come facciamo gli utenti finali a trovare ciò che cercano quando non conoscono il nome esatto?

## Tre Componenti, Una Filosofia Coerente

L'architettura di Ceres si articola in tre blocchi che rispecchiano una filosofia già vista negli articoli precedenti: **i metadati sono il fondamento, non una conseguenza**.

![Ceres Architecture]({{ "images/Ceres_architecture.png" | relURL }})

### 1. Harvesting Asincrono: Preservare la Semantica Originale

Il primo passo è estrarre metadati da un portale CKAN. Potremmo farlo con un semplice script sequenziale che legge 100 dataset, poi altri 100. Sarebbe inefficiente per portali con decine di migliaia di record. Ceres usa Tokio per fare richieste parallele:

```rust
// Fetch lista di tutti i dataset ID dal portale
let ids = ckan.list_package_ids().await?;

// Process datasets concurrently (10 at a time)
let results: Vec<_> = stream::iter(ids.into_iter())
    .map(|id| {
        let ckan = ckan.clone();
        let gemini = gemini_client.clone();

        async move {
            // Fetch dataset details
            let ckan_data = ckan.show_package(&id).await?;
            let mut new_dataset = CkanClient::into_new_dataset(ckan_data, &portal_url);

            // Generate embedding from title + description
            let combined_text = format!(
                "{} {}",
                new_dataset.title,
                new_dataset.description.as_deref().unwrap_or_default()
            );

            if !combined_text.trim().is_empty() {
                new_dataset.embedding = Some(Vector::from(
                    gemini.get_embeddings(&combined_text).await?
                ));
            }

            repo.upsert(&new_dataset).await
        }
    })
    .buffer_unordered(10)  // 10 richieste parallele
    .collect()
    .await;
```

Tre scelte critiche in questo approccio:

**Concorrenza controllata**: `buffer_unordered(10)` processa 10 dataset in parallelo. Abbastanza per saturare la rete, non troppo da sovraccaricare le API CKAN o Gemini.

**Upsert atomico**: Ogni dataset viene inserito o aggiornato in base alla coppia `(source_portal, original_id)`. Se un dataset esiste già, viene aggiornato; altrimenti viene creato.

**Preservazione dei metadati completi**: Non salvi solo titolo e descrizione. Ceres mantiene un campo `metadata` JSONB che contiene attributi custom. Se un portale aggiunge `budget_year: 2024` o `department: Finance`, rimangono disponibili per filtri successivi.

### 2. Generazione Embedding: Semplicità ed Efficacia

Una volta raccolti i metadati, Ceres genera embeddings usando Google Gemini (`text-embedding-004`, 768 dimensioni). L'approccio è volutamente semplice: concatena titolo e descrizione in un unico testo e genera un singolo vettore.

```rust
let combined_text = format!(
    "{} {}",
    dataset.title,
    dataset.description.as_deref().unwrap_or_default()
);

let embedding = gemini.get_embeddings(&combined_text).await?;
```

Perché non usare pesi differenziati per campo? Nella pratica, i modelli di embedding moderni catturano già la struttura semantica. Un titolo chiaro domina naturalmente perché appare per primo e contiene i termini più salienti. Aggiungere complessità (pesi, concatenazioni multiple) raramente migliora i risultati in modo significativo, ma aumenta i costi API.

Questa scelta rispecchia la filosofia che hai visto con Lakekeeper: i metadati non sono una conseguenza di altre decisioni, sono il fondamento su cui costruisci l'architettura.

### 3. Storage Ibrido in PostgreSQL

Il terzo blocco è dove conservi i vettori e i metadati. Scelta consapevole: niente motore vettoriale esterno. PostgreSQL + pgvector.

```sql
CREATE TABLE datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    original_id VARCHAR NOT NULL,
    source_portal VARCHAR NOT NULL,
    url VARCHAR NOT NULL,

    title TEXT NOT NULL,
    description TEXT,
    embedding vector(768),
    metadata JSONB DEFAULT '{}'::jsonb,

    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT uk_portal_original_id UNIQUE (source_portal, original_id)
);

-- HNSW index per ricerca vettoriale veloce
CREATE INDEX ON datasets USING hnsw (embedding vector_cosine_ops);
```

Il design ibrido (vettori + JSONB) abilita:

**Filtri semantici raffinati**: Recuperi i top 10 per similarità, poi filtra per licenza o anno con `metadata->>'license' = 'CC-BY'`.

**Audit trail temporale**: `first_seen_at` traccia quando un dataset è apparso per la prima volta; `last_updated_at` quando è stato aggiornato l'ultima volta. Utile per analisi di freshness.

**HNSW per velocità**: L'indice HNSW (Hierarchical Navigable Small World) è più veloce di IVFFlat per query approximate nearest neighbor, con trade-off minimo sulla precisione.

## L'Evoluzione Necessaria: Delta Harvesting

Oggi Ceres esegue un full-sync ad ogni harvest: scarica tutti i dataset dal portale e rigenera tutti gli embedding. Con 50k dataset, ogni run costa circa $3.75 in API Gemini. Per aggiornamenti giornalieri, parliamo di ~$112/mese solo di embedding—sostenibile, ma non ottimale.

L'evoluzione naturale è il **delta harvesting**: rigenerare embedding solo per i dataset effettivamente modificati. L'idea è semplice:

1. Calcolare un `content_hash` (SHA-256 di titolo + descrizione) per ogni dataset
2. Al prossimo harvest, confrontare l'hash esistente con quello nuovo
3. Se identico → skip embedding, aggiorna solo `last_updated_at`
4. Se diverso → rigenera embedding e salva il nuovo hash

L'impatto economico è significativo. Prendiamo un portale con 50k dataset e ~100 modifiche a settimana (un pattern realistico per una PA attiva). Con full-sync: 50k embedding × 52 settimane = 2.6 milioni di chiamate API all'anno. Con delta harvesting: 100 embedding × 52 = 5.200 chiamate all'anno. **Risparmio del 99.8%**.

Questa feature è nella roadmap di Ceres. La struttura del database è già predisposta: il campo `metadata` JSONB può ospitare il content hash senza modifiche allo schema. L'implementazione richiede principalmente logica applicativa nel harvester.

## Use Cases che Accadono Veramente

**Citizen Discovery**: Un cittadino di Milano cerca "traffico Milano". Con full-text search puro sul dataset ufficiale "Flussi_veicoli_viabilità_RTB", ottiene zero risultati. Con Ceres, il sistema capisce che sta cercando informazioni sul movimento di veicoli in città e restituisce il dataset corretto.

**Ricerca Interdisciplinare**: Un epidemiologo del Politecnico cerca "fattori ambientali che correlano con malattie respiratorie". Non sa quali dataset esistono. Ceres propone semanticamente correlati: qualità dell'aria, verde urbano per zona, densità di popolazione, densità industriale, dati ospedalieri aggregati. L'idea non è "trovare un dataset", ma "scoprire uno spazio di dati rilevanti".

**Cross-Portal Aggregation**: Un urbanista che studia "spazi pubblici" vuole risultati da Milano, Roma, Firenze contemporaneamente. Una query unica torna dataset da tutti e tre i portali, ordinati per rilevanza semantica indipendentemente dalla fonte.

## Cost-Effectiveness Consapevole

Una delle ragioni chiave per cui Ceres usa Google Gemini (non GPT-4 o modelli alternativi) è **pragmatismo economico**.

**Setup iniziale per 50k dataset**: Gemini API (~$3.75 di embedding) + PostgreSQL t3.small (~$20/mese) = **~$24 totali** per la prima indicizzazione.

**Costo ricorrente (monthly)**: Con delta harvesting (futuro), solo embedding per nuovi/modificati dataset (~$0.10-0.50) + infrastruttura PostgreSQL ($20) = **~$20-21/mese**.

Comparare con alternative: Pinecone costa $48-150/mese, Weaviate $60-200/mese per lo stesso volume. Ceres arriva a **1/5 del costo** delle soluzioni cloud-only.

Non è accidentale. È una decisione deliberata di usare PostgreSQL come prima scelta, non come fallback. Una PA o un'organizzazione piccola-media non deve fare scappatoie finanziarie per avere un semantic search decente.

## Limitazioni Esplicite e Direzioni Future

Essere onesti sui limiti è parte della crescita di un progetto:

**Cosa non fa (ancora)**:

- **Offline**: Dipende da Gemini API live. Se Google ha un'interruzione, Ceres non può generare embedding.
- **Delta harvesting**: Attualmente ogni harvest rigenera tutti gli embedding. L'ottimizzazione descritta sopra è pianificata ma non ancora implementata.
- **Re-ranking sofisticato**: Il ranking finale è puramente per similarità coseno. Non tiene conto di freschezza del dataset o popularità tra utenti.
- **Deduplicazione cross-portal**: Se Milano e Roma caricano lo stesso dataset ISTAT, Ceres li tratta come separati.
- **Multilingualità avanzata**: Gemini gestisce bene l'italiano, ma non c'è ancora traduzione automatica per query cross-lingua.

**Direzioni future**:

- **Delta/incremental harvesting**: Rigenerare embedding solo per dataset modificati (descritto sopra).
- **Lazy re-indexing**: Quando esce una nuova versione del modello embedding, rigenerare solo per i dataset più cercati.
- **Traduzione multilingue**: Tradurre query e contenuti in una lingua pivot per migliorare il retrieval cross-lingua.
- **Ricerca ibrida**: Combinare semantic search con full-text PostgreSQL come fallback.
- **Integrazione Lakekeeper**: Combinare similarità semantica con data quality score dal catalog.

## Perché Ceres Merita Attenzione

Nel panorama europeo di open data, CKAN domina come piattaforma. Centinaia di portali pubblici (PA locali, nazionali, organizzazioni internazionali) lo usano. Ma rimangono per la maggior parte **discoverable solo a esperti**: persone che sanno navigare metadati, tags, tassonomie.

Ceres non cambia il formato dei dati. Non tocca CKAN direttamente. Aggiunge uno strato di semantica che rende i dati scopribili anche a chi non parla il "linguaggio tecnico" dell'amministrazione.

L'implementazione in Rust garantisce performance, basso overhead di memoria, e facilità di deployment (un binario, niente runtime complexities). Tokio gestisce l'asincronia per harvesting parallelo. PostgreSQL è stabile, ben compreso, non richiede specialisti.

Il progetto è giovane e open source. Il codice è disponibile su [GitHub](https://github.com/AndreaBozzo/Ceres). Se semantic search, open data, e Rust ti attraggono, c'è spazio per collaborare.