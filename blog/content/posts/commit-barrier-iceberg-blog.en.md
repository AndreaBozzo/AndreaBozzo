---
title: "I tried to put data quality inside the commit. One pub(crate) stopped it."
date: 2026-09-04T10:00:00+02:00
draft: false
tags: ["Rust", "Apache Iceberg", "Delta Lake", "Data Quality", "Lakehouse", "Transactions", "Open Source", "Data Engineering"]
categories: ["Data Engineering", "Open Source"]
keywords: ["iceberg-rust", "Delta Lake", "idempotent commit", "exactly-once", "data quality", "commit barrier", "TableRequirement", "optimistic concurrency", "Rust", "dataprof"]
description: "A profiler tells you the data is bad after it is already durable. So I tried to make the passing report a precondition of durability, on both Delta and Iceberg, with one trait. Delta worked. Iceberg could not express the commit at all — and the reason is four lines of visibility in a library, not anything in the spec."
summary: "A falsification experiment with a written kill list and a negative result. Delta has a purpose-built idempotent commit; iceberg-rust rebases a transaction onto a base the caller never checked, so an external writer cannot make a commit conditional. The green concurrency test was a false pass — 0 of 40 rounds ever raced — and only a failpoint showed the duplicate."
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
    image: "images/commit-barrier-cover.webp"
    alt: "Writer A checks epoch 1 against base A, the transaction is rebased onto base B, and the premise the check established is lost before the commit lands"
    caption: "The check happened against base A. The commit happened against base B."
    relative: false
    hidden: false
---

```
thread 'iceberg_stale_writer_loses_the_cas_and_does_not_duplicate' panicked at tests\sinks.rs:289:5:
assertion `left == right` failed: the stale writer appended a second copy of epoch 1
  left: 10
 right: 5
```

That test is marked `#[ignore]` in my repository. Not because it is flaky, and not because I
gave up on it. The attached reason says it fails, that this is the experiment's result rather
than a bug in the test, and how to reproduce it. It is the only honest place I had to put the
result the experiment was built to find.

The question it answers is narrow, and I wrote it down before I started so I could not move
it later:

> Can Delta **and** Iceberg both support idempotent `(app_id, epoch)` commit, with the same
> abstraction, without an external transactional coordinator?

The answer is no. Here is how the answer got that specific, and why the "no" is more useful
than the "yes" would have been.

## The idea I was trying to kill

I maintain [dataprof](https://github.com/AndreaBozzo/dataprof), a profiler. It reads data and
reports on it. It does not move data, and its `AGENTS.md` says so in one sentence, which
turns out to matter later.

Working on it long enough surfaces the same structural complaint from every direction: a
profiler tells you the data is wrong *after* the data is durable. You get a beautiful report
about a table that production is already reading. The check and the consequence live in
different places, and the gap between them is measured in whatever your orchestration
interval happens to be.

So the idea. Not a better check — a different position for it. An Arrow batch should not
become durable production data unless its contract passes, and the proof that it passed
should commit atomically with the data and with the source progress. Call it a quality-aware
commit barrier.

I want to be careful here, because this is the point where a post like this usually starts
inventing a market. Ingestion systems that treat the commit seriously already exist, and some
of them are excellent at it. Estuary's materialization protocol states the requirement
flatly: "Updates to the checkpoint and to the view state MUST always commit together, in the
exact same transaction." It is equally frank about what happens when the endpoint cannot
participate — "Note that this pattern is at-least-once. A transaction may fail part-way
through and be restarted, causing its effects to be partially or fully replayed." Databricks
does the quality half inside the pipeline, where an expectation can `warn` ("invalid records
are written to the target"), `drop` ("invalid records are dropped before data is written to
the target"), or `fail` ("invalid records prevent the update from succeeding; manual
intervention is required before reprocessing").

None of that is missing. What I could not find was the *portable* version: a barrier that
sits between an arbitrary producer and an arbitrary lakehouse sink and takes part in the
decision to advance state, without owning the whole pipeline.

Every piece of that is either solved or cheap, except one. The commit has to be portable
across storage protocols, or it is not a primitive at all — it is a feature of one table
format wearing a trait as a disguise.

That single unknown is the whole experiment.

## The setup, and the kill list

**Delta is the control.** Its protocol has a purpose-built transaction identifier action
carrying an `appId` (String) and a `version` (Long), for the express purpose of letting an
external application "avoid duplicating data in the face of failures and retries during a
write." Implementing the barrier on Delta and declaring victory would be discovering a Delta
feature. It proves the harness works. It proves nothing about the idea.

**Iceberg is the experiment.** It commits by optimistically writing new metadata and
atomically swapping the table-metadata pointer, with conflict detection and retry. It has no
equivalent application-transaction mechanism. The candidate carrier for the epoch is a
snapshot summary property, and whether a check-then-commit can be folded into the retry loop
safely, using only what `iceberg-rust` exposes, was the unknown.

Then the part I recommend to anyone running an experiment they have an emotional stake in.
Written before any code, in the README, four conditions under which I stop:

1. Iceberg needs a destination-specific architecture rather than the same `CommitSink`
   implementation shape as Delta.
2. Iceberg needs an external transactional store to make the epoch check atomic with the
   commit.
3. `iceberg-rust` cannot express the required commit at all today, **and** the gap is in the
   specification rather than in the implementation's maturity. (An implementation gap is a
   different finding: it means "not yet", not "no".)
4. Making it work requires owning more than a trait's worth of the write path.

The trait itself is deliberately the smallest thing that can carry the claim — `committed_epoch`,
`commit`, and a row count for the tests. If it had to grow a destination-specific method to
make Iceberg work, the experiment had already answered its own question.

![Delta and iceberg-rust commit paths side by side](/AndreaBozzo/blog/images/commit-barrier-delta-vs-iceberg.webp "The same four steps, two protocols: Delta carries the epoch inside the commit, iceberg-rust discards the base the check was made against")

## Three findings from reading, before anything ran

Reading `iceberg` 0.10.1 before writing the sink was the highest-value hour of the project.

**The epoch has somewhere to live.** `FastAppendAction::set_snapshot_properties` puts
arbitrary keys into the snapshot summary and they read back through
`snapshot.summary().additional_properties`. Computed metric keys such as `added-records` win
over user-supplied ones, so a reserved key cannot be corrupted by a caller, and my key is not
reserved.

**The commit path is exactly the right shape.** `Transaction::do_commit`
(`src/transaction/mod.rs:218`) reloads the table from the catalog, discards a stale base,
re-applies the actions against the refreshed metadata, and submits a `TableCommit` carrying
`TableRequirement`s that the catalog validates on the pointer swap.
`TableRequirement::RefSnapshotIdMatch` is a compare-and-swap pin. Refresh, re-check, CAS —
that is the loop an idempotent commit needs, already written.

**And the door to it is locked.** `TransactionAction` is `pub(crate)`
(`src/transaction/action.rs:37`). What the module exports is `ApplyTransactionAction` and
`ActionCommit` — enough to apply the actions the crate already defines, and not enough to
define one. No third party can write an action whose `commit(&table)` runs against the
refreshed table inside the loop.

That third finding is the entire post, and I did not understand it yet.

## The claim I got wrong

An earlier version of my own README said `deltalake` and `iceberg` held `arrow` at 56 against
dataprof's 59 — three majors of skew, an ugly structural argument against the whole idea.

It was wrong, and the error was mine. The 56 in the lockfile came from an `arrow = "56"` pin
in *my* crate's `Cargo.toml`, not from either library. Both `iceberg` 0.10.1 and
`deltalake-core` 0.32.4 require `arrow-array` 58. dataprof is on 59.1.0. The real skew is one
major version, which is an ordinary Tuesday, not an obstacle.

I am including this because the argument I was making did not need it. A crate that writes
Delta tables does not belong in the dataprof workspace, because dataprof profiles data and
does not move it. That was always sufficient. The version claim was decoration, and
decoration is exactly the kind of claim that turns out to be false.

## The test that passed for the wrong reason

Here is the part I would most like other people to steal.

Three tests, one generic body each, parameterised over the sink: replay of a committed epoch
writes nothing, distinct epochs accumulate, concurrent writers of one epoch commit once. Both
sinks passed all three.

```
running 8 tests
test iceberg_replay_of_a_committed_epoch_writes_nothing ... ok
test iceberg_concurrent_writers_of_one_epoch_commit_once ... ok
test iceberg_distinct_epochs_accumulate ... ok
test delta_concurrent_writers_of_one_epoch_commit_once ... ok
test delta_replay_of_a_committed_epoch_writes_nothing ... ok
test delta_distinct_epochs_accumulate ... ok
test iceberg_race_diagnostic_how_often_does_it_conflict ... ok
test result: ok. 7 passed; 0 failed; 1 ignored
```

Green. And the concurrency row is a lie.

I had written a fourth test whose only job is to distrust the third: it runs the race forty
times and counts how often the two writers *actually* contend, reporting the number instead
of asserting on it, because a scheduler is allowed to serialize.

```
iceberg race: 0/40 rounds hit a real optimistic conflict
```

Zero. Not "rarely" — never. The in-process memory catalog takes one mutex for every
operation, so the loser's *read* is already ordered after the winner's commit, and it returns
`AlreadyCommitted` without ever reaching the window where a duplicate could be born. Forty
rounds of a concurrency test that never ran concurrently.

A test that has never been in the state it claims to test is not evidence. It is a green
square. If I had shipped on the strength of that row I would have shipped a duplicate
generator with a passing CI badge.

![Why the green test proved nothing](/AndreaBozzo/blog/images/commit-barrier-false-pass.webp "Left: what the passing test actually did, with one catalog mutex serialising both writers. Right: what the failpoint forced it to do instead")

## The failpoint, and the answer

If scheduling will not reach the window, hold the window open. One failpoint between the
epoch check and the commit:

```
A: checks epoch 1, free -> blocked at failpoint
B: checks epoch 1, free -> writes, commits, wins
A: released -> commits anyway
```

```
assertion `left == right` failed: the stale writer appended a second copy of epoch 1
  left: 10
 right: 5
```

The epoch check cannot be enforced. A writer that checks while the epoch is free, and only
then loses the race, commits a duplicate.

**Why.** `do_commit` reloads the table and rebases onto it before applying any action — on
the first attempt as well as on retries. The requirements the append emits are therefore
derived from the *refreshed* base, not from the base the caller inspected. The stale writer's
`fast_append` is re-pointed at the winner's snapshot and succeeds.

I had assumed the retry loop was the problem, so I had already set
`commit.retry.num-retries = 0` and owned the loop myself. It does not help. It removes the
retry; the rebase is not part of the retry. The rebase is what discards the caller's premise,
and it happens on the way in.

Both ways out are closed, and closed deliberately:

- `TransactionAction` is `pub(crate)`, so the check cannot move inside the loop where it
  would see the refreshed table.
- `TableCommit` is a public struct whose builder's build method is `pub(crate)`
  (`#[builder(build_method(vis = "pub(crate)"))]`, `src/catalog/mod.rs:350`), so a caller
  cannot construct a commit carrying its own `TableRequirement::RefSnapshotIdMatch`. The doc
  comment is explicit about why: "The builder is marked as private since it's dangerous and
  error-prone to construct `TableCommit` directly. Users are supposed to use `Transaction`."

`Catalog::update_table(TableCommit)` is public. Nothing outside the crate can build its
argument.

## This is not a problem with Iceberg

I want to be precise about the blame, because the interesting version of this story is not
"library bad".

The Iceberg specification is fine. It has requirements and an atomic pointer swap, which is
everything the primitive needs. The reference implementation is fine too — better than fine,
it has the exact hook. `SnapshotProducer.validate(TableMetadata currentMetadata, Snapshot snapshot)`
is `protected` in the Java core, `apply()` calls it, and the commit loop calls `apply()` on
every retry attempt, so a Java operation re-validates against the refreshed base each time
around. `BaseRowDelta`, `BaseRewriteFiles` and `StreamingDelete` each override it. That is a
first-class extension point for exactly this.

`iceberg-rust` has the structurally identical hook: `TransactionAction::commit(&Table)`,
invoked by `do_commit` against the refreshed table. The only difference is that Java's is
subclassable and Rust's is `pub(crate)`.

And the closure is defended, which is the part worth arguing about rather than complaining
about. A library that owns its retry loop cannot hand out caller-chosen preconditions without
also handing out a footgun; the `TableCommit` doc comment says as much in plain language.
Owning the retry loop and supporting external preconditions are in genuine tension. Java
resolved it with `protected` — safe by default, reachable by subclass. Rust has no
`protected`, so the same design decision arrives as a much blunter choice, and the blunt
version currently rounds to "no".

There is a third possibility I have to hold open: that the rebase is intended to be
unconditional and the guarantee I wanted was never on offer. If so the fix is a documentation
one — say that a `Transaction` carries no guarantee about the base it was built from, so
nobody else builds a precondition on it.

## The verdict

Against my own kill list, this is **Kill 1**: as things stand, Iceberg would need a
destination-specific architecture. It is Kill 3's exemption in principle — an implementation
gap, "not yet" rather than "no" — but the exemption only pays out if upstream changes, and
until it does the abstraction is Delta-only. A Delta-only commit barrier is a delta-rs
feature. Ruling that out is precisely what the experiment existed to do.

| Test | Delta | Iceberg |
| --- | --- | --- |
| Replay of a committed epoch writes nothing | pass | pass |
| Distinct epochs accumulate | pass | pass |
| Concurrent writers of one epoch commit once | pass | pass, but never raced |
| Stale writer loses the CAS without duplicating | not run | **FAIL** |

The last row deserves its "not run". Delta passes that case by construction — its conflict
checker rejects a second `txn` at the same `(appId, version)`, and the sink converts the
rejection into `AlreadyCommitted` by re-reading — but I wrote the failpoint for Iceberg and
never built the Delta twin. It is an argument from the protocol, not a measurement, and I am
not going to dress it up as one.

The trait held. One `CommitSink`, one set of test bodies, two implementations, no
destination-specific method. The design was sound; the guarantee underneath it was not
available on the only sink that could decide the question.

## What I am doing about it, and what I am not

I stripped the experiment down to a crate that depends on `iceberg`, `tokio` and `tempfile` —
no Arrow, no Parquet, no data files, because the bug is in how `Transaction` picks its base,
not in what the action writes — and published it as
[iceberg-stale-base-repro](https://github.com/AndreaBozzo/iceberg-stale-base-repro). It runs
in one command:

```
B committed epoch 1
A commit result: Ok("Ok")
epochs recorded in the table: ["1", "1"]
```

The issue is [apache/iceberg-rust#3134](https://github.com/apache/iceberg-rust/issues/3134),
opened 2 September 2026, with two concrete directions — export `TransactionAction`, or allow
a caller-supplied `TableRequirement` on a `Transaction` — and an offer to write the PR for
either. As I publish this it is open with no replies. I am not going to pretend that is a
collaboration; it is a message in a bottle with a reproduction attached, which is the most I
can honestly claim.

What I am *not* doing is shipping this in dataprof. Not because it is too ambitious — because
dataprof profiles data and does not move it, and a crate that writes Delta tables moves it.
The quality half of the original idea is tracked where it belongs, as two open issues on
dataprof: [structured, prioritised findings on the report](https://github.com/AndreaBozzo/dataprof/issues/375)
and [a small batch quality-gate API](https://github.com/AndreaBozzo/dataprof/issues/376).
Open. Not shipped, not secretly finished. They lose nothing by the commit half not existing,
which is the clearest signal that the two halves were always separable and I had bundled them
out of enthusiasm.

So: I started out wanting quality to be a precondition of durability, and I ended up learning
that on one of the two major Rust lakehouse clients, *nothing* can be a precondition of
durability from the outside. Not quality — anything. The general problem is upstream of mine,
and it is four lines of visibility wide. Changing those four lines is an afternoon. Deciding
whether they should change is the actual work, and it is not mine to do.

The whole spike is nine commits on a single day. I would rather have found that out in a day
than in six months of a framework.
