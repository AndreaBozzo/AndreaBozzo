---
title: "dlt + dbt su un Solo Unity Catalog (e Perché Non Sono 'Due DLT')"
date: 2026-06-22T12:00:00+02:00
draft: false
tags: ["Data Engineering", "dlt", "dbt", "Databricks", "Unity Catalog", "Lakehouse", "Python"]
categories: ["Data Engineering"]
keywords: ["dlt", "dbt", "Databricks", "Unity Catalog", "Lakehouse", "Delta Live Tables", "data ingestion", "ELT"]
description: "Come l'ingestion con dlt (dlthub) e la trasformazione con dbt si incontrano su un unico schema Unity Catalog su Databricks — e perché qui la pipeline interna è dbt, non Delta Live Tables."
summary: "Ingestion Python-native con dlt (dlthub), trasformazione SQL con dbt e un singolo schema Unity Catalog come contratto tra i due. Note dal cablarli insieme su un workspace Databricks reale — inclusa la collisione di nomi che mi ha morso nel codice vero."
author: "Andrea Bozzo"
showToc: true
TocOpen: true
hidemeta: false
comments: false
ShowReadingTime: true
ShowBreadCrumbs: true
ShowPostNavLinks: true
ShowWordCount: true
cover:
    image: "images/twodlt-cover.png"
    alt: "dlt + dbt su un solo Unity Catalog"
    caption: "Ingestion Python con dlt, trasformazione SQL con dbt, un unico schema Unity Catalog governato come contratto"
    relative: false
    hidden: false
---

Ho passato qualche settimana a costruire un riferimento piccolo ma *eseguibile* per
ingestion-più-trasformazione su Databricks, e la cosa più utile che ho imparato non è stata
architetturale — è stata che due degli strumenti coinvolti hanno quasi lo stesso nome, e quella
collisione non è solo una scocciatura di marketing. Salta fuori nel tuo `sys.path`.

Quindi, prima di tutto, la disambiguazione, perché tutto il post ci si appoggia:

- **`dlt`** (minuscolo) è **[dlthub](https://dlthub.com)**, una libreria **Python** open-source che
  estrae dalle sorgenti e carica nelle destinazioni. `pip install dlt`.
- **`DLT`** / **Delta Live Tables** è un prodotto **Databricks** per pipeline dichiarative, rinominato
  nel 2026 in **Lakeflow Spark Declarative Pipelines**.

Questo post parla del primo. **Il secondo non l'ho usato di proposito.** Qui il layer di
trasformazione è **[dbt](https://www.getdbt.com)**, non Delta Live Tables. La forma che alla fine mi è
piaciuta è noiosa e disaccoppiata: `dlt` deposita le tabelle grezze in uno schema Unity Catalog, `dbt`
legge quello schema e ci costruisce sopra le mart, e l'unica cosa che li collega è il nome di uno
schema. Il codice completo è su GitHub:
[AndreaBozzo/dlt-dbt-databricks](https://github.com/AndreaBozzo/dlt-dbt-databricks).

---

## L'architettura in una riga

`dlt` estrae da una sorgente (qui una REST API o Postgres) e **carica le tabelle grezze in uno schema
Unity Catalog** → **dbt** legge quello schema come `source` e costruisce `staging → intermediate →
marts`, tutto su un SQL warehouse Databricks.

![architettura da dlt a Unity Catalog a dbt](/AndreaBozzo/blog/images/twodlt-architecture.png "dlt deposita le tabelle grezze in uno schema Unity Catalog; dbt legge quello schema e costruisce staging → intermediate → marts su un SQL warehouse")

Non c'è handoff in memoria, nessun file condiviso, nessuna colla di orchestrazione che debba restare
viva perché il contratto regga. Il confine è uno **schema Unity Catalog**. È quella singola decisione
a rendere indipendenti i due strumenti.

---

## Layer esterno: dlt come tessuto di ingestion

`dlt` possiede un solo schema — `<catalog>.raw` per default, più un Volume di staging gestito nello stesso catalog per i `COPY INTO` bulk — e non scrive altro. L'esempio
di punta è una sorgente REST dichiarativa con una relazione parent→child (i post, poi i commenti di
ogni post), caricata con `merge` così che le riesecuzioni facciano upsert invece di duplicare:

```python
from dlt.sources.rest_api import rest_api_source

source = rest_api_source({
    "client": {"base_url": "https://jsonplaceholder.typicode.com/"},
    "resource_defaults": {"write_disposition": "merge", "primary_key": "id"},
    "resources": [
        {"name": "rest_posts", "endpoint": {"path": "posts"}},
        {
            "name": "rest_comments",
            "endpoint": {
                "path": "posts/{post_id}/comments",
                "params": {"post_id": {"type": "resolve", "resource": "rest_posts", "field": "id"}},
            },
        },
    ],
})
```

Le cose che rendono `dlt` un buon layer *esterno* sono quelle poco appariscenti:

- **Python-first.** Si legge come normale codice client con qualche decoratore, non come una lotta con
  un sistema distribuito per scaricare del JSON. La long tail di SaaS di nicchia, endpoint REST interni
  e «il vendor ci ha dato questa strana API» è esattamente dove brilla e dove i connettori gestiti non
  arrivano.
- **Stateful ma noioso.** Cursori incrementali, inferenza dello schema e semantica di merge sono
  dichiarativi. Gli esempi avanzati nel repo mostrano `write_disposition="merge"` +
  `dlt.sources.incremental(...)` che compilano in un `MERGE INTO` idempotente, e contratti di schema
  (`evolve` / `freeze`) che emettono veri vincoli `PRIMARY KEY` / `FOREIGN KEY` sulle tabelle Databricks.
- **Poliglotta.** La stessa pipeline gira in locale, in CI o dentro un job Databricks. C'è anche una
  sorgente Postgres (`sql_database`) e una variante con table-format Iceberg — Databricks è una
  destinazione tra le tante, non il centro di gravità.

Quando `dlt` ha finito, hai **tabelle Delta in uno schema Unity Catalog governato** — non in un Hive
metastore, non in un bucket non governato. È la precondizione su cui si appoggia tutto il resto del
design.

---

## Il contratto: uno schema Unity Catalog, niente di più

Questa è la parte su cui vale la pena essere precisi, perché è tutto il senso dell'accoppiare i due
strumenti.

1. **dlt possiede `raw`.** Ogni run carica in `<catalog>.<DLT_DATASET_NAME>` (default `raw`), accanto
   alle sue tabelle di servizio (`_dlt_loads`, `_dlt_pipeline_state`, `_dlt_version`). Lasciale stare.
2. **dbt legge `raw` come `source`, mai come tabella hardcoded.** Un `sources.yml` dichiara lo schema,
   e i modelli di staging selezionano da `{{ source('raw', 'rest_posts') }}`. Il trucco furbo: lo
   schema della source si risolve da `{{ env_var('DLT_DATASET_NAME', 'raw') }}` — la *stessa* env var
   che leggono le pipeline dlt — così rinominare lo schema di atterraggio non può disallineare i due lati.
3. **dbt possiede `analytics`.** I modelli si materializzano in `<catalog>.<DATABRICKS_SCHEMA>`. Niente
   riscrive mai dentro `raw`.

Poiché il confine è uno schema e non un processo, i due strumenti restano completamente disaccoppiati.
Puoi eseguirli su schedule diverse, da macchine diverse, o l'uno senza l'altro, e il contratto regge
comunque. dbt non sa né gli importa che un progetto Python alimenti le sue source; dlt non sa che
qualcosa le sta leggendo.

![Databricks Catalog Explorer con gli schemi raw e analytics](/AndreaBozzo/blog/images/twodlt-catalog-explorer.png "Catalog Explorer: lo schema raw di dlt (rest_posts, rest_comments e le tabelle di servizio _dlt_*) accanto allo schema analytics di dbt")

---

## Layer interno: dbt, staging → marts

Il lato trasformazione è dbt ordinario, e il repo ci fa passare due dataset distinti.

**Il percorso alimentato da dlt.** Lo staging è una pulizia 1:1 delle tabelle atterrate — rinomina e
cast, nessuna logica di business, dato che dlt ha già normalizzato `camelCase` → `snake_case` in ingresso:

```sql
-- stg_rest_posts.sql
with source as (select * from {{ source('raw', 'rest_posts') }})
select
    cast(id as bigint)      as post_id,
    cast(user_id as bigint) as user_id,
    title, body,
    _dlt_load_id
from source
```

**Un layer analitico vero e disordinato.** I modelli più interessanti stanno sopra
`samples.healthverity.claims_sample_synthetic` — un dataset sintetico di sinistri sanitari (~410k
righe, una riga per *service line* di sinistro) presente in ogni workspace Databricks. È un buon
stress test perché i dati grezzi sono tutti stringhe, ~57% di `line_charge` è `NULL`, e qualche
migliaio di righe è negativo (storni di sinistro). Lo staging fa cast e marca questo; un modello
intermedio aggrega il dettaglio-riga a una riga per sinistro; la mart risponde a una vera domanda di
business — importi addebitati vs. riconosciuti per segmento di payer:

```sql
-- mart_claims_by_payer.sql
select
    payer_type, patient_state, claim_type,
    count(*)                                                   as claims,
    count(distinct hvid)                                       as members,
    sum(total_allowed)                                         as total_allowed,
    round(sum(total_allowed) / nullif(sum(total_charge), 0), 4) as allowed_ratio
from {{ ref('int_claims') }}
group by payer_type, patient_state, claim_type
```

Questa è l'onesta divisione del lavoro: dlt sta vicino a dove vivono HTTP e JSON; dbt sta vicino a
dove vivono SQL, test, surrogate key e strategie di merge incrementale. A nessuno dei due strumenti
viene chiesto di fare il lavoro dell'altro.

![Lo schema analytics — le tabelle di staging, intermediate e mart di dbt](/AndreaBozzo/blog/images/twodlt-analytics-schema.png "Catalog Explorer: lo schema analytics che possiede dbt — stg_*, int_* e mart_* costruiti sopra le tabelle grezze atterrate da dlt")

---

## Cosa si è rotto davvero

L'intro lo prometteva, quindi ecco quelle vere — nessuna architetturale, tutte del tipo che scopri
solo eseguendo.

**I due dlt collidono su `sys.path`.** Databricks serverless include un modulo `dlt` *integrato* —
quello Lakeflow/DLT — il cui import hook mette in ombra il `dlt` di dlthub. `import dlt` in un notebook
può risolversi nel pacchetto sbagliato. La fix nel repo è un brutto piccolo shim che rimuove
temporaneamente il primo finder di `sys.meta_path` così vince il pacchetto giusto:

```python
def import_dlt():
    """Import dltHub's dlt despite Databricks serverless' built-in DLT hook."""
    metas = list(sys.meta_path)
    if os.getenv("DATABRICKS_RUNTIME_VERSION") and metas:
        sys.meta_path = metas[1:]
    try:
        import dlt
        return dlt
    finally:
        sys.meta_path = metas
```

Se hai mai dubitato che la collisione di nomi sia un problema reale e non solo una nota a piè di pagina
pedante: sono sei righe di chirurgia su `meta_path` in codice di produzione.

**Serverless non ha sempre un SQL warehouse per la destinazione di dlt.** La destinazione Databricks di
dlt vuole un warehouse e un volume di staging. Dentro un job serverless quel percorso non è sempre
disponibile, così la pipeline REST ha un fallback `--load-mode spark` che fa semplicemente
`spark.saveAsTable`. Il punto: quel fallback **deve emettere esattamente le stesse colonne `snake_case`
più `_dlt_load_id`** che emetterebbe dlt, altrimenti i modelli di staging di dbt si rompono a valle.
Due percorsi di codice, un solo contratto di schema da rispettare.

**Tenere lo schema della source di dbt sincronizzato con il dataset name di dlt** è la modalità di
fallimento silenziosa — puntali a schemi diversi e dbt costruisce allegramente nulla. Risolverli
entrambi da un'unica env var è ciò che rende il problema inesistente.

---

## Orchestrazione: prima locale, poi un Bundle

Per le demo c'è un piccolo runner locale (~50 righe) che chiama dlt, poi `dbt build`, in un solo
processo — abbastanza per dimostrare l'handoff. Per la produzione il repo fornisce un **Databricks
Asset Bundle**: un Job, due task, `dbt_build` subordinato al successo di `dlt_ingest`, con
infrastruttura versionata e deployabile invece di uno script.

```yaml
resources:
  jobs:
    dlt_dbt_pipeline:
      tasks:
        - task_key: dlt_ingest
          spark_python_task:
            python_file: ingestion/pipelines/rest_api_to_databricks.py
            parameters: ["--catalog", "${var.catalog}", "--dataset-name", "raw", "--load-mode", "spark"]
        - task_key: dbt_build
          depends_on: [{ task_key: dlt_ingest }]
          dbt_task:
            project_directory: transformation/dbt_databricks
            warehouse_id: ${var.warehouse_id}
            commands: ["dbt deps", "dbt build"]
```

![Run di un Job Databricks con due task dipendenti](/AndreaBozzo/blog/images/twodlt-job-run.png "Il Job dell'Asset Bundle deployato: dlt_ingest gira per primo, dbt_build gira solo in caso di successo")

C'è anche un preflight offline `doctor.py` che controlla le env var, fa il parse del progetto dbt ed
esegue `bundle validate` **senza toccare il warehouse** — così un nuovo contributor può capire se il
repo è cablato correttamente prima di spendere un centesimo di compute. Ogni esempio è validato contro
un workspace reale; niente demo morte.

---

## Perché un solo Unity Catalog conta comunque

Anche se il layer interno è dbt e non una pipeline nativa Databricks, far terminare *tutto* in Unity
Catalog è ciò che ripaga lo split:

- **Il controllo accessi** è su catalog e schema, non su bucket a caso — analisti, ML engineer e
  service principal vedono tutti gli stessi permessi.
- **Il lineage** attraversa dalle mart di dbt indietro attraverso lo staging fino alle tabelle `raw`
  atterrate da dlt — e avanti verso qualunque cosa le legga — un solo grafo, entrambi gli strumenti.
- **Una sola superficie di governance.** Tabelle, view, funzioni e qualunque modello tu registri vivono
  tutti sotto lo stesso namespace `catalog.schema` — un solo posto per permessi, audit e lineage,
  invece di storie separate per dati, codice e ML.

![Lineage a livello di colonna in Unity Catalog per la mart mart_claims_by_payer](/AndreaBozzo/blog/images/twodlt-uc-lineage.png "Lineage a livello di colonna in Unity Catalog: mart_claims_by_payer tracciata indietro fino a int_claims — e avanti attraverso lo staging fino alle tabelle grezze atterrate da dlt")

È questo il vero motivo per mandare l'output di dlt dritto in UC invece di parcheggiarlo da qualche
parte e reimportarlo dopo: trasforma una libreria di ingestion in un cittadino di prima classe di un
lakehouse governato, senza scrivere una riga di Spark.

---

## Una checklist, mappata sul repo

1. **Configura Unity Catalog.** Un catalog con uno schema `raw` (dlt) e uno schema `analytics` (dbt),
   e un SQL warehouse attivo. (`make doctor` controlla il resto.)
2. **Configura dlt.** `dlt[databricks]`, punta la destinazione al tuo catalog, modella ogni sorgente
   come `rest_api_source` / `@dlt.resource` con `merge` + cursori incrementali dove ha senso.
3. **Rendi lo schema il contratto.** Risolvi lo schema `source` di dbt e il `DLT_DATASET_NAME` di dlt
   da un'unica env var. Non lasciare che dlt scriva fuori da `raw`.
4. **Costruisci dbt sopra.** `staging → intermediate → marts` leggendo `raw` come source,
   materializzando in `analytics`, con test sulle chiavi.
5. **Promuovi l'orchestrazione.** Parti dal runner locale; spedisci l'Asset Bundle quando lo vuoi in
   produzione.

Alla fine hai un confine di catalog, due strumenti che fanno i lavori in cui sono davvero bravi, e un
posto chiaro dove appendere la governance. Non è l'unico modo di usare Databricks — ma ha smesso di
sembrare prodotti che si sovrappongono e ha iniziato a sembrare un reticolo dove ogni pezzo fa
esattamente la quantità di lavoro in cui è bravo. E no, niente di tutto questo è «DLT».
