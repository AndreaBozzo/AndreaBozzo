---
title: "Where Should the Library Stop?"
date: 2026-10-20T17:15:00+02:00
draft: false
tags: ["Data Quality", "Data Engineering", "Open Source", "dataprof", "dlt", "DuckDB", "API Design"]
categories: ["Data Engineering", "Open Source"]
keywords: ["dataprof", "dlt", "DuckDB", "data quality gate", "library design", "dogfooding", "pipeline glue", "write-audit-publish", "whylogs", "library boundaries"]
description: "I built a small dlt + DuckDB pipeline that uses my own data profiler as a dependency, and wrote down every line of glue it needed. Seven gaps in the library I maintain, four in the one I don't, none in DuckDB. On what a caller has to own, what the library should add, and the one feature it should refuse."
summary: "My data profiler gives the same untouched file a lower score on New Year's Day. I found that by using it as a dependency for the first time. On the glue a real pipeline needs, and the line between what a library should do and what it should leave to the caller."
author: "Andrea Bozzo"
showToc: true
TocOpen: false
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
    image: "images/where-should-the-library-stop-cover.webp"
    alt: "An open toolcase with every tool in its own cut-out, and one oddly shaped empty slot in the middle with a blank paper tag tied to it"
    caption: "Every tool has its slot. The interesting one is the slot nobody filled."
    relative: false
    hidden: false
---

On 1 January 2027, a file I have not touched will get a worse quality score.

Nothing in it will change. The dates in one column are from June 2021, and
[dataprof](https://github.com/AndreaBozzo/dataprof), the data profiler I maintain, measures
timeliness against today's date. Here are two otherwise identical columns, one dated 2021 and one
2020, with the share of values dataprof calls stale and the overall score:

```
2021 0.0 81.44
2020 100.0 68.94
```

When the calendar turns, the 2021 file becomes the 2020 one.

Same code, same bytes, different verdict, depending on when you ask. I had written the library,
its tests and its docs, and none of them made this a problem. A pipeline did, the first time I used
dataprof the way someone else would: as a dependency, with a gate that had to give the same answer
next week.

## Sitting on the other side of the API

When you maintain a library, you spend your time asking what it should expose. When you depend on
one, the question is what your workflow needs from it, and the two lists do not match.

So I built [dataprof-pipeline-reference](https://github.com/AndreaBozzo/dataprof-pipeline-reference),
a small batch pipeline with one question: *a batch loaded successfully. Should consumers see it?*
[dlt](https://dlthub.com) loads a snapshot of customers and orders into a private DuckDB schema.
dataprof and a handful of SQL assertions gate it. Only an accepted batch replaces what consumers
read, both tables at once, in one transaction, with an audit trail. A rejected batch keeps its
evidence and changes nothing.

```
== batch-002: 8% of orders without customer_id
  dataprof orders: fail
    FAILED        max_null_percentage customer_id  observed 8.0  expected <= 2.0
outcome: rejected
published: run r20261010t095429_df5437 (event p20261010t095431_29a76f)
```

The interesting part was never the happy path. It was the rule I set for myself before writing any
code: **every piece of glue I write because a library lacks something gets an entry in a
[findings file](https://github.com/AndreaBozzo/dataprof-pipeline-reference/blob/main/docs/findings.md),
with the evidence and the smallest upstream change that would remove it.**

That rule matters more when the library is mine. I can change either side. If the pipeline needs
something, I can add it to dataprof the same afternoon, or bend the pipeline around the gap and
forget I did. Either way, the next person to use the library hits the gap I quietly routed around.

The final tally, for dataprof 0.12.0, dlt 1.31.0 and DuckDB 1.5.6:

| Library | Gaps recorded | Relationship |
|---|---|---|
| dataprof | 7 | mine |
| dlt | 4 | not mine |
| DuckDB | 0 | not mine |

Seven of the eleven are in the library I wrote. I would like to say that surprised me.

## The clock belongs to the caller

![A wall calendar shedding its pages above a desk, where the same unchanged report's smiley grade slides from green to red](/AndreaBozzo/blog/images/where-should-the-library-stop-calendar.webp "The report did not change. The date did.")

Back to the opening. The timeliness score compares dates with `Utc::now()`. There is a way to pass
a fixed reference date, but it is crate-private. It was added in July so that the library's own
tests would be deterministic. The tests got a stable clock; users did not. So a gate on the
overall score, or on timeliness, cannot be reproduced later. Run it again in January and it may
disagree with itself.

The pipeline's answer is unglamorous: it does not gate on the score at all. Scores are kept in the
stored reports for anyone curious, and the gate uses per-column null limits and a required
completeness metric, which do not depend on what day it is.

That workaround is fine for the pipeline. As a library design it is wrong, and the reason is
ownership. *As of when* is a decision about the business question being asked, and only the caller
knows it. A library that reads the clock is making that decision for the caller, silently, on every
run. The fix ([dataprof#903](https://github.com/AndreaBozzo/dataprof/issues/903)) is a public
`reference_date`, defaulting to today, *recorded in the report*. The last part matters most: a
reproducible result has to carry the inputs that produced it.

The pipeline ran into the same problem with versions. It records which dataprof produced each
verdict, so that a later re-evaluation can be compared with the original. A development build of
dataprof reports the version of the last release, so a report from a build of `master` looks
identical to one from 0.12.0, while two of its behaviours differ
([#907](https://github.com/AndreaBozzo/dataprof/issues/907)). The caller cannot record what the
library will not tell it.

## The glue I wrote around my own library

The other gaps share a shape. The library already computes something close to what the pipeline
needs, and stops one step short.

**A reused key in otherwise distinct rows passes.** dataprof's duplicate check counts entire
duplicate rows. Ten orders that reuse another order's ID still differ in amount, date and customer,
so to a whole-row count they are ten perfectly distinct rows. The pipeline's test records it as
`(physical, business) == (0, 10)`: no duplicate rows, ten duplicate keys. The pipeline checks
uniqueness in SQL. dataprof already computes exact distinct counts per column; a per-column
uniqueness requirement is a small step from there
([#904](https://github.com/AndreaBozzo/dataprof/issues/904)).

**A truncated batch passes.** There was no row-count requirement. Ten rows where ten thousand were
expected passed every check. The pipeline checks volume in SQL. This is the one I fixed:
`check(min_rows=N)` merged five days after I filed it
([#905](https://github.com/AndreaBozzo/dataprof/issues/905)). It is on `master`, not in a release
yet, so the pipeline still runs its own `count(*)`.

**The report forgets the source type.** Arrow's `decimal128(12,2)` comes back as `Float` and
`timestamp[us, tz=UTC]` as `Date`. Fine for a human skimming a profile. Useless for a contract that
wants to say *amount is a decimal with two places*. The pipeline stores the Arrow schema next to
every report itself ([#906](https://github.com/AndreaBozzo/dataprof/issues/906)).

**The policy is a pile of keyword arguments.** The pipeline needs to know, months later, exactly
which policy judged a batch. dataprof takes the policy as keyword arguments and does not serialize
it, so the pipeline loads it from a JSON file and digests it itself. I did not file this one: it
overlaps an open issue about policy files, and a policy object is a bigger design question than
one pipeline should settle.

And then the gap that does not appear in the table, because it is not a missing feature. dataprof
0.12.0 treats `N/A`, `None` and `\N` as values rather than nulls, and types zero-padded codes like
`007` as integers. Both are known, filed long before this pipeline
([#813](https://github.com/AndreaBozzo/dataprof/issues/813),
[#814](https://github.com/AndreaBozzo/dataprof/issues/814)). Both are fixed on `master`. And the
pipeline's fixture IDs carry a letter prefix and never use those null tokens, so neither bug can
reach the gate.

That is exactly the quiet accommodation I wanted the findings file to prevent, and it happened
anyway, in the test data. The defence is that it is written down: a compatibility test pins both
behaviours, and it flips on a development build. If I had not written it down, the fixtures would
just look like a style choice.

## Bounds, yes. Sets, no.

![A sieve holding two grey stones and one rust-coloured one, next to a spilling sack of grain with a single rust-coloured grain inside and a green tick on its tag](/AndreaBozzo/blog/images/where-should-the-library-stop-sieve.webp "Easy to spot among three. The sack still got its tick.")

Here is where the honest answer to "what does the pipeline need?" is: not this, not from me.

The pipeline has two value rules, both in SQL. Order amounts must not be negative. Currency must be
one of `EUR`, `GBP`, `USD`. Both look like they belong in a profiler's gate. Only one does.

**Bounds fit.** A full scan already reports the exact minimum and maximum of a numeric column. I
planted one negative amount in ten thousand rows and printed the reported minimum, the count of
negatives, and the gate's verdict:

```
-1.0 1 pass
```

The profile *knew*: minimum `-1.0`, one negative value in a column flagged as positive. The gate
passed anyway, because the only thing that looks at negatives is the table-wide accuracy score.
That is a missing feature, and the fix follows from what is already in the report: `min_value` and
`max_value` per column, decided from the recorded minimum and maximum
([#908](https://github.com/AndreaBozzo/dataprof/issues/908)). It would even degrade honestly: a
partial scan that *saw* a negative can fail; one that did not can only say it was not evaluated.

**Sets do not.** A profile holds statistics about values, not the values. To check every value
against an allowed set, you have to look at every value. A profiler that tries to answer from its
summary has to approximate, and the approximation gets worse exactly when it matters.

I did not want to argue that from first principles, so I ran it against a tool that does offer the
check. whylogs 1.6.4 has `frequent_strings_in_reference_set`, which checks a profile's frequent
strings against a reference set. One invalid value, first among three valid ones, then among five
thousand:

```
3 distinct valid + 1 invalid -> fail
5000 distinct valid + 1 invalid -> pass
```

It catches it among three and passes it among five thousand. That follows from what the check is:
it looks at the *frequent* strings, and a single bad value among five thousand is not frequent.
But a gate on currency codes or country codes is built to catch exactly that kind of bad value,
and as a gate, a check that passes it is worse than no check.

The tools that get this right all test every row: dbt `accepted_values`, Soda `valid values`, Deequ
`isContainedIn`, or one line of SQL. So set membership stays in SQL, in the pipeline, and dataprof's
gate stays what it is meant to be: thresholds over what a profile actually measured, not arbitrary
expectations. Saying no to that feature is part of the design.

## The dependency I could not change

dlt got the same treatment, with one difference: I could not fix anything. Every gap was going to
be a workaround or an issue.

- `schema_contract="freeze"` on a new dataset rejects tables the pipeline's own schema already
  knows. Since every run loads into a fresh candidate schema, that is every run. The pipeline
  imports the stored schema per run; the bug is filed
  ([dlt-hub/dlt#4539](https://github.com/dlt-hub/dlt/issues/4539)).
- `pipeline.run()` changes `search_path` on a DuckDB connection the caller passed in. Low impact,
  recorded, not filed.
- A dataset named like the DuckDB database file fails with an ambiguous reference, and the error
  suggests retrying a concurrent pipeline. Already known upstream.
- Without a contract, a value that cannot be converted loads as NULL plus a `__v_text` variant
  column. Documented, sensible for exploration, and quietly hostile to a downstream null check.
  The pipeline freezes the schema.

DuckDB: nothing. Transactional view replacement and crash recovery did what the pipeline needed,
and the tests that crash the runner on either side of the publishing commit agree.

What I noticed writing the dlt list is how easy it was to be fair to a library that is not mine.
For dlt I wrote down the gap, the workaround and the issue, and moved on. For dataprof my first
instinct every time was to go and fix it, which is how a library grows features shaped like one
pipeline. The findings file made me treat my own library like the other two: a gap, its evidence,
its smallest change, and a decision about whether it belongs upstream at all.

## Who owns what

The pipeline's architecture doc opens with a four-line table, and it is the most useful thing in
the repository:

| Part | Owns |
|---|---|
| dlt | extraction, normalization, loading, the frozen schema contract |
| dataprof | profiles, gate checks and their verdicts |
| DuckDB | storage, SQL assertions, transactions |
| the pipeline | runs, readiness, outcome, publication, recovery, evidence |

Every dataprof gap in this post is a place where that table was not true yet. The clock and the build
version were the caller's decisions, held by the library. Uniqueness, row counts and bounds were
the library's job, done by the caller in SQL. Set membership looked like the library's job and is
not.

That is the question I came out with: what makes independently useful tools compose into something
you can depend on? Here, at least, the answer was dull and specific. Each tool has to say what it
decides, record the inputs it decided on, and refuse what it cannot decide soundly. The rest is
the caller's, and the caller has to know that.

dataprof is closer to that than it was a month ago, but not in a way a user can install. One of the
seven entries is fixed on `master`, none of the fixes is released, and the pipeline still writes
every line of the glue. Which is the point of keeping the file: the day an entry can be deleted,
the glue goes with it.
