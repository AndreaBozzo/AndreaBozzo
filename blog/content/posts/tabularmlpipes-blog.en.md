---
title: "Guardrails for Tabular ML: A Data Engineer's Take on Data Leakage, Poisoning, and Brittle Pipelines"
date: 2026-03-23
draft: false
tags: ["machine-learning", "data-engineering", "apache-arrow", "datafusion", "data-quality"]
summary: "Most ML pipeline failures are not exotic model bugs — they are data issues that nobody encoded as checks. This article walks through building guardrails using pandas, Apache DataFusion, data contracts, and the Arrow C Data Interface."
cover:
    image: "images/tabularml-cover.png"
---

## Guardrails for Tabular ML: A Data Engineer's Take on Data Leakage, Poisoning, and Brittle Pipelines

I have been toying around with [TabICL](https://github.com/soda-inria/tabicl), an open-source large tabular model, and at the same time been asked to "take a quick look" at a few production ML pipelines.
I am not a data scientist, but I do spend most of my time around data systems, Arrow, and query engines. What I found — both in my own experiments and in those pipelines — was not exotic model failures, but something much more mundane: brittle tabular pipelines that could be silently broken — or even "poisoned" — by very basic data issues that were never encoded as checks. The model was the easy part; making sure the data going in was actually clean was not.

This article is my attempt to look at that problem from a data engineer's point of view: starting from a simple pandas script, then moving to Apache DataFusion and Arrow to build guardrails that prevent data leakage, poisoning scenarios, and failing pipelines before the model even sees the data.

## The kind of brittleness I kept seeing

The concrete issues varied, but they had a common shape:

- Train and evaluation sets accidentally sharing exact rows or entities.
- Temporal splits not really being temporal — some "future" data leaking into the training window.
- Class distributions drifting heavily between training and serving without anyone noticing.
- Pipelines that would happily train on obviously corrupted data because nothing upstream was enforcing contracts.

None of this is new to data scientists: cloud ML guides and practitioner articles list data leakage and bad splits as some of the most common reasons models fail in production.
What surprised me was how often these issues were still being handled informally — a notebook here, a manual SQL query there, and a lot of trust.

Even more striking: when checks did exist, they were almost always **post-mortem**. Someone would notice a metric degradation in production, trace it back to a data issue, and then write a one-off notebook to confirm the hypothesis. The check would live in that notebook, maybe get copy-pasted into the next project, but never become a first-class part of the pipeline. It was reactive forensics, not proactive guardrails.

So I started from the tools I know best (Arrow, SQL engines, Rust backends) and asked: what would it look like to treat these checks as first-class citizens of the pipeline?

## Step 1 — A straightforward pandas leakage check

Let's start from something very familiar: a pandas utility that checks for leakage between a training and test set.

```python
import pandas as pd
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split


def evaluate_data_leakage(
    df_train: pd.DataFrame, df_test: pd.DataFrame, id_column=None, target_column=None
):
    """
    Run standard data leakage checks between training and test sets.
    """
    report = {}

    if len(df_test) == 0:
        return {"error": "Test set is empty — nothing to check."}

    # 1. Row Leakage (exact duplicates)
    cols_to_check = [c for c in df_train.columns if c != target_column]

    intersection = pd.merge(
        df_train[cols_to_check],
        df_test[cols_to_check],
        how="inner",
    )

    leaked_rows = len(intersection.drop_duplicates())
    report["Exact duplicate rows (Leakage)"] = leaked_rows
    report["% Leakage on Test Set"] = (leaked_rows / len(df_test)) * 100

    # 2. Entity Leakage (ID overlap)
    if id_column and id_column in df_train.columns:
        ids_train = set(df_train[id_column].dropna().unique())
        ids_test = set(df_test[id_column].dropna().unique())

        shared_entities = ids_train.intersection(ids_test)
        report["Shared entities (IDs)"] = len(shared_entities)

    # 3. Target Drift (basic statistical check)
    if target_column and target_column in df_train.columns:
        train_mean = df_train[target_column].mean()
        test_mean = df_test[target_column].mean()
        report["Target mean difference"] = abs(train_mean - test_mean)

    return report
```

The example then generates a synthetic dataset, introduces deliberate leakage, and runs the function:

```python
# 1. Create a synthetic dataset
X, y = make_classification(n_samples=5000, n_features=20, random_state=42)
df = pd.DataFrame(X, columns=[f"feat_{i}" for i in range(20)])
df["target"] = y
df["user_id"] = np.random.randint(1, 1000, size=5000)  # Simulate entity IDs

# 2. Split (deliberately introduce leakage to test the function)
train_df, test_df = train_test_split(df, test_size=0.2, random_state=42)

# INTRODUCE DELIBERATE LEAKAGE: copy 50 rows from train to test
test_df = pd.concat([test_df, train_df.head(50)])

print("--- Leakage Analysis (Pre-Training) ---")
results = evaluate_data_leakage(
    train_df, test_df, id_column="user_id", target_column="target"
)
for metric, value in results.items():
    if isinstance(value, float):
        print(f"{metric}: {value:.2f}")
    else:
        print(f"{metric}: {value}")
```

What this gives you:

- **Row-level leakage**: exact duplicate feature rows across train and test, ignoring the target.
- **Entity leakage**: shared IDs (e.g. users, sessions) across splits.
- **A simple target drift signal**: mean target difference between train and test.

A caveat: the merge-based duplicate detection matches on exact feature values. For high-dimensional continuous features this works well (exact matches are rare unless data was literally copied), but for categorical-heavy datasets it can produce false positives. Keep that in mind when interpreting results.

This is already much better than nothing and mirrors the basic advice in many ML best-practice documents: make sure splits are disjoint, entities are assigned properly, and distributions are not wildly different.

The problem? Once the data grows beyond a few million rows, doing full inner joins and scans in pandas starts to hurt. And once data lives in a lake, pulling it into Python memory for every check becomes the bottleneck itself.

![Pipeline Progression: from pandas notebooks to Arrow-native data contracts](/images/tabularml-pipeline-progression.png)

## Step 2 — Moving the heavy lifting into Apache DataFusion

Looking at brittle pipelines, a recurring pattern was: data lives in Parquet/Iceberg, but quality checks live in pandas notebooks. That means:

- You constantly pull large tables out of cheap storage into expensive Python memory.
- Checks are ad-hoc instead of being part of the engine that already scans the data.

Apache DataFusion gives us a different option: register Parquet or Iceberg tables as logical relations and run leakage checks as SQL directly on top.

A minimal example looks like this:

```python
import datafusion

def detect_leakage_datafusion(train_path, test_path):
    ctx = datafusion.SessionContext()

    # Register Parquet files (no eager loading into RAM)
    ctx.register_parquet("train", train_path)
    ctx.register_parquet("test", test_path)

    # Check for row/entity overlap using an EXISTS join on id
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

For an Iceberg table you might do something like:

```python
def detect_leakage_iceberg_datafusion(iceberg_table_name):
    ctx = datafusion.SessionContext()

    # NOTE: DataFusion does not have a built-in register_iceberg() method.
    # Integration works through pyiceberg-core, which exposes a table provider
    # that you register via ctx.register_table_provider().
    # The snippet below is pseudocode to illustrate the query pattern.

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

Here the heavy work is done in the engine:

- Data stays in columnar formats backed by Arrow.
- Joins, filters, and aggregates are compiled and executed efficiently.
- Python just orchestrates: register, run, fetch a small result.

From my "systems" point of view, this is already a step towards robustness: you push checks down to the same layer that already runs analytics and ETL, instead of embedding them in scattered notebooks.

DataFusion solved the performance problem. But checks were still scattered across scripts — there was no single source of truth for what "valid data" actually means.

## Step 3 — From ad-hoc checks to an ML data contract (DCE)

Once you have a SQL engine in the picture, there is a natural next step: describe your expectations as a contract and let the engine enforce them.

Here is a simplified internal example of a "Data Contract for Evaluation" (DCE) written in YAML:

```yaml
dataset: tabicl_v2_training

ml_quality:
  # 1. Anti-Leakage Contracts
  - check: no_intersection
    target_dataset: s3://bucket/eval_set
    on_keys: [user_id, session_id]

  # 2. Temporal Validity
  - check: temporal_split
    time_column: event_timestamp
    condition: "max(train) < min(eval)"

  # 3. Class Imbalance Guards
  - check: categorical_distribution
    column: target_class
    min_frequency: 0.05  # Fail if rare classes vanish
```

Each of these checks maps cleanly to SQL on top of DataFusion:

- **Target leakage** — `SELECT corr(feature, target) FROM data`.
  DataFusion has a built-in `corr(x, y)` aggregate, so you can check suspiciously high correlations between features and target without custom code.

- **Feature drift (e.g. PSI)** — SQL histogram bins.
  Use `approx_percentile_cont` or `NTILE()` to define quantile boundaries, then a `CASE WHEN` binning expression to count how many values fall into each bin.

- **Uniqueness** — `COUNT(*) - COUNT(DISTINCT key)`.
  No need for HashSet logic in Rust; the engine already knows how to compute this at scale.

- **Completeness** — `COUNT(field) / COUNT(*)`.
  A single aggregate that turns into a ratio of non-null values.

- **Class balance** — group-by on the label.
  `SELECT label, COUNT(*) * 1.0 / SUM(COUNT(*)) OVER () AS proportion FROM data GROUP BY label` gives you per-class proportions in a single query.

What you are doing here is turning hand-written checks into declarative contracts:

- They live close to the dataset definition.
- They can be version-controlled and reviewed like code.
- They are enforced by a scalable engine rather than a best-effort notebook.

### A note on existing tools

There are mature frameworks in this space — Great Expectations, Pandera, Deepchecks, Evidently — and they solve real problems well. The reason I went with DataFusion and Arrow directly is that the pipelines I was looking at already ran on top of these engines for analytics and ETL. Adding another framework meant another runtime, another serialization boundary, and another set of concepts for the team to learn. Expressing the same checks as SQL contracts inside the engine that already touched the data felt like the lower-friction path. Your mileage may vary — if your stack is already built around one of these tools, use it.

### From the perspective of pipeline brittleness and poisoning

Poisoning is much harder if you have strong no-intersection and temporal rules around what can enter training and evaluation. Drift and imbalance are visible as contract violations instead of "things a human might notice in a dashboard someday".

Contracts cover the SQL layer well. But some pipelines have legacy C++ components that need the same data without reinventing I/O. That's where the next piece comes in.

## Step 4 — Crossing the boundary with the Arrow C Data Interface

So far everything stays at the SQL/engine level. But in some pipelines I looked at, there were legacy C++ components that did very clever things on the data — custom integrity checks, business-specific scoring, etc. The problem was always the same: how do we feed them data without copying and without reinventing a binary format?

Apache Arrow's C Data Interface is exactly designed for this: a stable ABI for exchanging Arrow arrays and schemas between runtimes (Python, Rust, C++, R, etc.) without copying buffers.

The following snippet shows a simplified example using Polars + PyArrow. Note that the `_export_to_c` API shown here is a semi-private, legacy interface — the modern approach is the [Arrow PyCapsule Interface](https://arrow.apache.org/docs/format/CDataInterface/PyCapsuleInterface.html) (`__arrow_c_array__`, `__arrow_c_schema__`), which avoids the need for PyArrow as a dependency and reduces memory management pitfalls. I'm using the older API here because it makes the pointer-passing mechanics more explicit:

```python
import polars as pl
import pyarrow as pa
import ctypes

# 1. Create a massive LazyFrame (Simulation)
df = pl.scan_parquet("large_dataset.parquet")

# 2. Select the "Temporal" and "Entity" columns for leakage checking
table = df.select(["timestamp", "user_id"]).collect().to_arrow()


def check_leakage_c_interface(arrow_table: pa.Table) -> str:
    """
    Hypothetical function passing memory pointers to a C++ backend.
    """
    c_array = pa.lib.FFI_ArrowArray()
    c_schema = pa.lib.FFI_ArrowSchema()

    # Export first record batch to C structs (zero-copy)
    arrow_table.to_batches()[0]._export_to_c(c_array.addr, c_schema.addr)

    print(f"Memory Address of Data: {hex(c_array.addr)}")

    # --- HYPOTHETICAL C-BACKEND CALL ---
    # leakage_lib = ctypes.CDLL("./leakage_validator.so")
    # is_leaking = leakage_lib.validate_temporal_integrity(
    #     c_array.addr, c_schema.addr
    # )
    # ------------------------------------

    return "Pointers successfully passed to backend."


check_leakage_c_interface(table)
```

A few important details:

- `scan_parquet` builds a lazy plan; data is only read when you call `collect()`.
- You materialize only the columns you need for the check (`timestamp`, `user_id`).
- `_export_to_c` fills `ArrowArray` / `ArrowSchema` structs with pointers to the existing buffers; no serialization to some ad-hoc format.

From that point, a C++ function like `validate_temporal_integrity` can:

- Read the buffers using Arrow-C++.
- Run domain-specific checks that would be painful or slow to express in Python.
- Return a simple status code/string back through ctypes.

This is where my "systems" bias really kicks in: instead of bolting quality checks onto the model, you end up with:

- A data contract at the SQL layer (DCE).
- A data plane that is Arrow everywhere (engine, Python, C++).
- Specialized validators that plug into that plane without reinventing I/O.

## A concrete poisoning scenario

![How a broken ETL job poisons a model — and how data contracts catch it](/images/tabularml-poisoning-scenario.png)

When people talk about "poisoning" ML systems, they often focus on adversarial examples and gradient-level attacks. At the pipeline level, however, most failures are more boring — and more common.

Consider this scenario: a broken upstream ETL job silently duplicates a batch of rows where `target = 1` (e.g., approved loan applications). The duplication is not adversarial — it's a retry bug, a misconfigured idempotency key, a partition that got reprocessed. But the effect is real: the training set now has a skewed class distribution, and the model learns that approvals are more common than they actually are. In production, it starts approving loans it should not.

This is "poisoning" in the practical sense — not a sophisticated attack, but corrupted data that degrades model behavior. And it is preventable with the guardrails described above:

- The **`no_intersection`** contract catches the duplicated rows if they also leaked into the eval set.
- The **`categorical_distribution`** check catches the class imbalance shift: if `target = 1` suddenly represents 70% of training instead of 50%, the `min_frequency` / max-frequency thresholds fire.
- The **`temporal_split`** check catches reprocessed partitions if the duplicated rows carry timestamps that violate the temporal ordering.

None of these require knowing that an attack happened. They are structural invariants — if the data violates them, the pipeline stops and asks a human to investigate.

## Wrapping up: from post-mortem to proactive

This is not an article about choosing the right classifier or tuning hyperparameters. It is the view of someone who thinks in terms of Arrow buffers, query engines, and ABI boundaries — who was dropped into ML pipelines and saw them fail for avoidable reasons.

The pattern I kept seeing was: checks exist, but they are post-mortem. Someone notices a production regression, opens a notebook, confirms the data issue, fixes it, and moves on. The check never becomes infrastructure. Next quarter, a similar issue hits a different pipeline, and the cycle repeats.

The recipe sketched here is deliberately simple:

1. Start with something like `evaluate_data_leakage` as a mental model and as a safety net in notebooks.
2. Move heavy-weight checks into a SQL engine like DataFusion, operating directly on Parquet/Iceberg.
3. Encode expectations as contracts (DCE) that the engine can enforce continuously, not just at model-training time.
4. Where needed, bridge to legacy or high-performance C++ components through the Arrow C Data Interface instead of duplicating pipelines.

What this approach does **not** cover: model-level validation (gradient-based adversarial attacks, model fairness audits, hyperparameter sensitivity). Those are real concerns that require different tools. This is specifically about the data plane — making sure the model never sees data that violates basic structural invariants.

For teams already invested in Arrow, Rust, or lakehouse architectures, this is a relatively low-friction way to add robust guardrails around ML pipelines without becoming a data scientist first.
