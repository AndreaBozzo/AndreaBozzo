---
title: "Guardrail per il ML Tabulare: la prospettiva di un Data Engineer su Data Leakage, Poisoning e Pipeline Fragili"
date: 2026-03-23
draft: false
tags: ["machine-learning", "data-engineering", "apache-arrow", "datafusion", "data-quality"]
summary: "La maggior parte dei fallimenti nelle pipeline ML non nasce da bug esotici del modello, ma da problemi di dati mai codificati come controlli. In questo articolo vediamo come costruire guardrail con pandas, Apache DataFusion, contratti dati e Arrow C Data Interface."
cover:
    image: "images/tabularml-cover.png"
---

## Guardrail per il ML Tabulare: la prospettiva di un Data Engineer su Data Leakage, Poisoning e Pipeline Fragili

Stavo sperimentando con [TabICL](https://github.com/soda-inria/tabicl), un large tabular model open-source, e allo stesso tempo mi è stato chiesto di "dare una rapida occhiata" a pipeline ML in produzione.
Non sono un data scientist, ma passo gran parte del mio tempo tra sistemi dati, Arrow e motori di query. Quello che ho trovato — sia nei miei esperimenti sia in quelle pipeline — non erano failure esotiche del modello, ma qualcosa di molto più ordinario: pipeline tabulari fragili, che potevano rompersi in silenzio, o addirittura essere "avvelenate", da problemi di dati molto elementari mai codificati come controlli. Il modello era la parte facile; assicurarsi che i dati in ingresso fossero davvero puliti, no.

Questo articolo è il mio tentativo di guardare il problema dal punto di vista di un data engineer: partire da un semplice script pandas, poi passare ad Apache DataFusion e Arrow per costruire guardrail che prevengano data leakage, scenari di poisoning e rotture della pipeline prima ancora che il modello veda i dati.

## Il tipo di fragilità che continuavo a vedere

I problemi concreti variavano, ma avevano una forma comune:

- Set di training e valutazione che condividevano accidentalmente righe o entità identiche.
- Split temporali che in realtà non erano davvero temporali: dati "futuri" finivano nella finestra di training.
- Distribuzioni di classe che driftavano pesantemente tra training e serving senza che nessuno se ne accorgesse.
- Pipeline che addestravano serenamente su dati evidentemente corrotti, perché a monte nessuno imponeva contratti.

Per i data scientist non c'è nulla di nuovo: guide cloud sul ML e articoli pratici indicano data leakage e split sbagliati tra le cause più comuni di fallimento dei modelli in produzione.
Quello che mi ha sorpreso è quanto spesso questi temi venissero ancora gestiti in modo informale: un notebook qui, una query SQL manuale là, e molta fiducia.

Ancora più evidente: quando i controlli esistevano, erano quasi sempre **post-mortem**. Qualcuno notava un degrado delle metriche in produzione, risaliva a un problema dati, poi scriveva un notebook una tantum per confermare l'ipotesi. Il controllo rimaneva in quel notebook, magari veniva copiato nel progetto successivo, ma non diventava mai una parte di prima classe della pipeline. Era forensica reattiva, non guardrail proattivi.

Quindi sono partito dagli strumenti che conosco meglio (Arrow, motori SQL, backend Rust) e mi sono chiesto: cosa succederebbe se trattassimo questi controlli come cittadini di prima classe della pipeline?

## Step 1 — Un controllo leakage diretto con pandas

Partiamo da qualcosa di molto familiare: una utility pandas che controlla il leakage tra training set e test set.

```python
import pandas as pd
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split


def evaluate_data_leakage(
    df_train: pd.DataFrame, df_test: pd.DataFrame, id_column=None, target_column=None
):
    """
    Esegue controlli standard di data leakage tra training e test.
    """
    report = {}

    if len(df_test) == 0:
        return {"error": "Il test set è vuoto: nulla da controllare."}

    # 1. Row Leakage (duplicati esatti)
    cols_to_check = [c for c in df_train.columns if c != target_column]

    intersection = pd.merge(
        df_train[cols_to_check],
        df_test[cols_to_check],
        how="inner",
    )

    leaked_rows = len(intersection.drop_duplicates())
    report["Righe duplicate esatte (Leakage)"] = leaked_rows
    report["% Leakage sul Test Set"] = (leaked_rows / len(df_test)) * 100

    # 2. Entity Leakage (sovrapposizione ID)
    if id_column and id_column in df_train.columns:
        ids_train = set(df_train[id_column].dropna().unique())
        ids_test = set(df_test[id_column].dropna().unique())

        shared_entities = ids_train.intersection(ids_test)
        report["Entità condivise (ID)"] = len(shared_entities)

    # 3. Target Drift (controllo statistico base)
    if target_column and target_column in df_train.columns:
        train_mean = df_train[target_column].mean()
        test_mean = df_test[target_column].mean()
        report["Differenza media target"] = abs(train_mean - test_mean)

    return report
```

L'esempio poi genera un dataset sintetico, introduce leakage deliberato ed esegue la funzione:

```python
# 1. Crea un dataset sintetico
X, y = make_classification(n_samples=5000, n_features=20, random_state=42)
df = pd.DataFrame(X, columns=[f"feat_{i}" for i in range(20)])
df["target"] = y
df["user_id"] = np.random.randint(1, 1000, size=5000)  # Simula ID entità

# 2. Split (introduciamo deliberatamente leakage per testare la funzione)
train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)

# INTRODUZIONE DELIBERATA DI LEAKAGE: copia 50 righe da train a test
test_df = pd.concat([test_df, train_df.head(50)])

print("--- Analisi Leakage (Pre-Training) ---")
results = evaluate_data_leakage(
    train_df, test_df, id_column="user_id", target_column="target"
)
for metric, value in results.items():
    if isinstance(value, float):
        print(f"{metric}: {value:.2f}")
    else:
        print(f"{metric}: {value}")
```

Cosa ottieni:

- **Leakage a livello riga**: righe di feature duplicate esatte tra train e test, ignorando il target.
- **Entity leakage**: ID condivisi (es. utenti, sessioni) tra split.
- **Un segnale semplice di target drift**: differenza della media del target tra train e test.

Una nota: il rilevamento dei duplicati basato su merge confronta valori di feature esatti. Per feature continue ad alta dimensionalità funziona bene (match esatti rari, a meno che i dati non siano stati copiati letteralmente), ma su dataset ricchi di variabili categoriche può produrre falsi positivi. Tienilo presente nell'interpretazione.

È già molto meglio di niente e riflette i consigli base di molti documenti di best practice ML: assicurati che gli split siano disgiunti, che le entità siano assegnate correttamente e che le distribuzioni non siano troppo diverse.

Il problema? Appena i dati superano qualche milione di righe, fare inner join e scan completi in pandas inizia a pesare. E quando i dati vivono in un data lake, portarli in memoria Python a ogni controllo diventa esso stesso il collo di bottiglia.

![Evoluzione della pipeline: dai notebook pandas ai data contract Arrow-native](/AndreaBozzo/blog/images/tabularml-pipeline-progression.png)

## Step 2 — Spostare il lavoro pesante in Apache DataFusion

Osservando pipeline fragili, uno schema ricorrente era: dati in Parquet/Iceberg, ma controlli qualità in notebook pandas. Questo significa:

- Estrarre continuamente tabelle grandi da storage economico verso memoria Python costosa.
- Avere controlli ad hoc invece di integrarli nel motore che già scansiona i dati.

Apache DataFusion offre un'opzione diversa: registrare tabelle Parquet o Iceberg come relazioni logiche ed eseguire i controlli leakage come SQL direttamente sopra.

Un esempio minimale è questo:

```python
import datafusion

def detect_leakage_datafusion(train_path, test_path):
    ctx = datafusion.SessionContext()

    # Registra file Parquet (nessun caricamento eager in RAM)
    ctx.register_parquet("train", train_path)
    ctx.register_parquet("test", test_path)

    # Controlla sovrapposizione righe/entità con join EXISTS su id
    df_leak = ctx.sql("""
        SELECT *
        FROM train
        WHERE EXISTS (
            SELECT 1
            FROM test
            WHERE train.id = test.id
        )
    """)

    return df_leak.collect()
```

Per una tabella Iceberg, puoi fare qualcosa del genere:

```python
def detect_leakage_iceberg_datafusion(iceberg_table_name):
    ctx = datafusion.SessionContext()

    # NOTA: DataFusion non ha un metodo register_iceberg() integrato.
    # L'integrazione passa da pyiceberg-core, che espone un table provider
    # da registrare con ctx.register_table_provider().
    # Lo snippet sotto è pseudocodice per illustrare il pattern di query.

    query = f"""
        SELECT COUNT(*) AS leaked_rows
        FROM {iceberg_table_name} train
        WHERE EXISTS (
            SELECT 1
            FROM {iceberg_table_name} test
            WHERE train.user_id = test.user_id
              AND train.split = 'train'
              AND test.split = 'test'
        )
    """
    df = ctx.sql(query)

    return df.collect()
```

Qui il lavoro pesante è svolto dal motore:

- I dati restano in formati colonnari basati su Arrow.
- Join, filtri e aggregazioni vengono compilati ed eseguiti in modo efficiente.
- Python orchestra soltanto: registra, esegue, recupera un risultato piccolo.

Dal mio punto di vista orientato ai sistemi, questo è già un passo verso la robustezza: sposti i controlli allo stesso layer che esegue analytics ed ETL, invece di incapsularli in notebook sparsi.

DataFusion ha risolto il problema di performance. Ma i controlli erano ancora sparsi negli script: non c'era una singola fonte di verità su cosa significasse davvero "dato valido".

## Step 3 — Da controlli ad hoc a un ML data contract (DCE)

Una volta che hai un motore SQL in gioco, il passo successivo è naturale: descrivere le aspettative come contratto e lasciare che sia il motore a farle rispettare.

Ecco un esempio interno semplificato di "Data Contract for Evaluation" (DCE) scritto in YAML:

```yaml
dataset: tabicl_v2_training

ml_quality:
  # 1. Contratti anti-leakage
  - check: no_intersection
    target_dataset: s3://bucket/eval_set
    on_keys: [user_id, session_id]

  # 2. Validità temporale
  - check: temporal_split
    time_column: event_timestamp
    condition: "max(train) < min(eval)"

  # 3. Guardrail su class imbalance
  - check: categorical_distribution
    column: target_class
    min_frequency: 0.05  # Fail se classi rare scompaiono
```

Ognuno di questi controlli si mappa bene su SQL sopra DataFusion:

- **Target leakage** — `SELECT corr(feature, target) FROM data`.
  DataFusion ha l'aggregazione `corr(x, y)` integrata, quindi puoi verificare correlazioni sospettosamente alte tra feature e target senza codice custom.

- **Feature drift (es. PSI)** — istogrammi in SQL.
  Usa `approx_percentile_cont` o `NTILE()` per definire confini per quantili, poi una `CASE WHEN` di binning per contare quanti valori cadono in ogni bin.

- **Unicità** — `COUNT(*) - COUNT(DISTINCT key)`.
  Nessuna logica HashSet in Rust: il motore sa già calcolarlo su grandi volumi.

- **Completezza** — `COUNT(field) / COUNT(*)`.
  Una singola aggregazione che produce il rapporto di valori non null.

- **Bilanciamento classi** — group-by sulla label.
  `SELECT label, COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS proportion FROM data GROUP BY label` restituisce le proporzioni per classe in una sola query.

In pratica stai trasformando controlli scritti a mano in contratti dichiarativi:

- Vivono vicino alla definizione del dataset.
- Possono essere versionati e revisionati come codice.
- Sono imposti da un motore scalabile, non da un notebook messo insieme alla buona.

### Nota sugli strumenti esistenti

Esistono framework maturi in questo spazio, come Great Expectations, Pandera, Deepchecks, Evidently, e risolvono bene problemi reali. Il motivo per cui ho scelto direttamente DataFusion e Arrow è che le pipeline che osservavo giravano già su questi motori per analytics ed ETL. Aggiungere un altro framework significava un altro runtime, un altro confine di serializzazione e un altro set di concetti da imparare per il team. Esprimere gli stessi controlli come contratti SQL nel motore che già toccava i dati mi è sembrata la strada a minor attrito. Naturalmente dipende dal contesto: se il tuo stack è già costruito attorno a uno di questi strumenti, usa quello.

### Dal punto di vista di fragilità pipeline e poisoning

Il poisoning è molto più difficile se hai regole forti di no-intersection e temporalità su ciò che può entrare in training e valutazione. Drift e sbilanciamento diventano violazioni di contratto, non "cose che forse un umano noterà in dashboard un giorno".

I contratti coprono bene il layer SQL. Ma alcune pipeline hanno componenti C++ legacy che devono usare gli stessi dati senza reinventare I/O. Qui entra in gioco il pezzo successivo.

## Step 4 — Attraversare il confine con Arrow C Data Interface

Fin qui tutto resta al livello SQL/motore. Ma in alcune pipeline che ho visto c'erano componenti C++ legacy che facevano cose molto sofisticate sui dati: controlli di integrità custom, punteggi business-specific, ecc. Il problema era sempre lo stesso: come passargli i dati senza copiare e senza reinventare un formato binario?

L'Arrow C Data Interface è pensata esattamente per questo: un ABI stabile per scambiare array e schemi Arrow tra runtime diversi (Python, Rust, C++, R, ecc.) senza copiare buffer.

Lo snippet seguente mostra un esempio semplificato con Polars + PyArrow. Nota che l'API `_export_to_c` mostrata qui è un'interfaccia legacy semi-privata: l'approccio moderno è la [Arrow PyCapsule Interface](https://arrow.apache.org/docs/format/CDataInterface/PyCapsuleInterface.html) (`__arrow_c_array__`, `__arrow_c_schema__`), che evita la dipendenza da PyArrow e riduce i rischi di gestione della memoria. Uso l'API più vecchia qui perché rende più esplicita la meccanica di passaggio dei puntatori:

```python
import polars as pl
import pyarrow as pa
import ctypes

# 1. Crea una LazyFrame enorme (simulazione)
df = pl.scan_parquet("large_dataset.parquet")

# 2. Seleziona le colonne "Temporal" e "Entity" per controllare leakage
table = df.select(["timestamp", "user_id"]).collect().to_arrow()


def check_leakage_c_interface(arrow_table: pa.Table) -> str:
    """
    Funzione ipotetica che passa puntatori memoria a un backend C++.
    """
    c_array = pa.lib.FFI_ArrowArray()
    c_schema = pa.lib.FFI_ArrowSchema()

    # Esporta il primo record batch verso struct C (zero-copy)
    arrow_table.to_batches()[0]._export_to_c(c_array.addr, c_schema.addr)

    print(f"Memory Address of Data: {hex(c_array.addr)}")

    # --- CHIAMATA IPOTETICA AL BACKEND C ---
    # leakage_lib = ctypes.CDLL("./leakage_validator.so")
    # is_leaking = leakage_lib.validate_temporal_integrity(
    #     c_array.addr, c_schema.addr
    # )
    # ----------------------------------------

    return "Puntatori passati con successo al backend."


check_leakage_c_interface(table)
```

Alcuni dettagli importanti:

- `scan_parquet` costruisce un piano lazy; i dati vengono letti solo quando chiami `collect()`.
- Materializzi soltanto le colonne necessarie al controllo (`timestamp`, `user_id`).
- `_export_to_c` popola le struct `ArrowArray` e `ArrowSchema` con puntatori ai buffer esistenti, senza serializzare in un formato ad hoc.

Da quel punto, una funzione C++ come `validate_temporal_integrity` può:

- Leggere i buffer con Arrow-C++.
- Eseguire controlli domain-specific difficili o lenti da esprimere in Python.
- Restituire un semplice status code/string tramite ctypes.

È qui che emerge il mio bias "systems": invece di agganciare controlli qualità al modello, ottieni:

- Un data contract al layer SQL (DCE).
- Un data plane Arrow ovunque (motore, Python, C++).
- Validator specializzati che si collegano a quel data plane senza reinventare I/O.

## Uno scenario concreto di poisoning

![Come un job ETL rotto avvelena un modello e come i data contract lo intercettano](/AndreaBozzo/blog/images/tabularml-poisoning-scenario.png)

Quando si parla di "poisoning" nei sistemi ML, spesso si pensa ad esempi avversariali e attacchi a livello di gradiente. A livello pipeline, però, la maggior parte dei problemi è più noiosa e molto più comune.

Considera questo scenario: un job ETL a monte rotto duplica silenziosamente un batch di righe dove `target = 1` (per esempio prestiti approvati). La duplicazione non è avversariale: è un bug di retry, una chiave di idempotenza mal configurata, una partizione rielaborata. Ma l'effetto è reale: il training set ha ora una distribuzione di classe distorta e il modello impara che le approvazioni sono più frequenti di quanto siano davvero. In produzione, inizia ad approvare prestiti che non dovrebbe.

Questo è "poisoning" in senso pratico: non un attacco sofisticato, ma dati corrotti che degradano il comportamento del modello. Ed è prevenibile con i guardrail descritti sopra:

- Il contratto **`no_intersection`** intercetta righe duplicate se sono finite anche nell'eval set.
- Il controllo **`categorical_distribution`** intercetta lo shift di sbilanciamento tra classi: se `target = 1` passa improvvisamente dal 50% al 70% del training, scattano le soglie `min_frequency` / max-frequency.
- Il controllo **`temporal_split`** intercetta partizioni rielaborate se le righe duplicate hanno timestamp che violano l'ordinamento temporale.

Nessuno di questi controlli richiede di sapere che è avvenuto un attacco. Sono invarianti strutturali: se i dati li violano, la pipeline si ferma e chiede a un umano di investigare.

## Conclusione: dal post-mortem al proattivo

Questo non è un articolo su quale classificatore scegliere o su come fare tuning degli iperparametri. È il punto di vista di chi ragiona in termini di buffer Arrow, motori di query e confini ABI, ed è stato catapultato in pipeline ML vedendole fallire per ragioni evitabili.

Il pattern che ho visto più spesso è: i controlli esistono, ma sono post-mortem. Qualcuno nota una regressione in produzione, apre un notebook, conferma il problema dati, lo corregge e va avanti. Il controllo non diventa mai infrastruttura. Il trimestre dopo, un problema simile colpisce un'altra pipeline e il ciclo si ripete.

La ricetta proposta qui è volutamente semplice:

1. Parti da qualcosa come `evaluate_data_leakage` come modello mentale e rete di sicurezza nei notebook.
2. Sposta i controlli pesanti in un motore SQL come DataFusion, operando direttamente su Parquet/Iceberg.
3. Codifica le aspettative come contratti (DCE) che il motore può imporre in continuo, non solo in fase di training.
4. Dove serve, collega componenti C++ legacy o ad alte prestazioni tramite Arrow C Data Interface invece di duplicare pipeline.

Cosa **non** copre questo approccio: validazione a livello modello (attacchi avversariali basati su gradiente, audit di fairness, sensibilità agli iperparametri). Sono temi reali che richiedono strumenti diversi. Qui il focus è specificamente sul data plane: fare in modo che il modello non veda mai dati che violano invarianti strutturali di base.

Per team già investiti in Arrow, Rust o architetture lakehouse, questa è una strada a basso attrito per aggiungere guardrail robusti alle pipeline ML senza dover diventare data scientist prima.
