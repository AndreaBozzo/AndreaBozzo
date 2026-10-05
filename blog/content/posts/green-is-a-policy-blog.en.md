---
title: "Green Is a Policy, Not a Fact"
date: 2026-10-05T17:40:00+02:00
draft: false
tags: ["Testing", "Verification", "Data Quality", "Observability", "CI", "Backups", "Open Source"]
categories: ["Data Engineering", "Infrastructure"]
keywords: ["false pass", "green dashboard", "test evidence", "backup verification", "data quality checks", "CI smoke test", "dbt Information Schema", "dataprof", "verification", "proxy metrics"]
description: "A green status is evidence that a proxy condition passed, not that the thing you care about is true. Five of my own projects went green on the wrong question: a backup verifier, a concurrency test, a Docker smoke test, a metadata matrix and a data-quality check. The fix was never more checks."
summary: "My backup verifier passed 24 of 24 checks while the backup job sat in failed. It is not the only green thing I have built that answered a narrower question than the one I was asking. On what a green light actually proves, and the checks that earn it."
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
    image: "images/green-is-a-policy-cover.webp"
    alt: "A calm, uniform green dot; under a magnifying glass its inside is a tangle of gears, threads, loose papers and one cracked cog"
    caption: "One bit, and everything that was thrown away to make it."
    relative: false
    hidden: false
---

In September I wrote a script called `verify.sh`. Its whole job was to tell me whether the backups
on my Raspberry Pi were healthy, because the night before I had found a bug that could make them
quietly unhealthy.

The next day the bug fired. A restore test I had cancelled halfway left the backup repository
locked, the nightly job mistook the lock for a missing repository, and the backup failed.

I ran `verify.sh`. Twenty-four checks. Twenty-four passed.

It checked that the backup was scheduled and that a recent snapshot existed. Both true. Neither was
the question. The script I wrote specifically to catch a failing backup looked at a failing backup
and called it healthy, because it checked what was *scheduled*, not what had *run*.

I have [told that story before](/AndreaBozzo/blog/en/posts/lares-weekend-pi-blog/), and the fix is
boring: look at the result of the last run. What is not boring is how often the same thing has
happened to me since, in projects that have nothing to do with backups. Different stack, same shape:

**A green light is evidence that some narrower condition passed. It is not evidence that the thing
you care about is true.**

You already own one of these. The green light on a mains-powered smoke alarm means it has power.
On most alarms the test button proves the battery, the circuit and the horn. Whether it can smell
smoke is a separate test, done with a can of aerosol test smoke, and almost nobody does it.

The gap between those questions is where all of my favourite bugs live.

## Green is a policy, not a fact

Green and red are not properties of reality. They are a compression: someone took a rich, messy
state and squeezed it into one bit a human can act on in under a second. That is useful. It is
also lossy, and the loss is invisible.

![A paper funnel full of clocks, gears, scales, string and crumpled notes, dropping a single small green bead into a dish](/AndreaBozzo/blog/images/green-is-a-policy-funnel.webp "Somebody chose what goes in the funnel. Nobody reads the funnel.")

Somebody decided what gets measured, what counts as success, which failures matter, how results
are added up, and where the threshold sits. Every green square carries that contract. Almost
nobody reads it.

The honest reading of any check is something like:

> Given **this input**, under **these conditions**, at **this time**, using **this definition of
> success**, I observed **this result**.

What we actually read is: *works*.

Here are four ways I have watched that sentence get shortened, all from my own repositories, all
re-checked for this post.

## The check ran. The thing it was about did not.

The plain version: a test meant to make two things collide, where they never once collided, and
the test passed anyway.

![Two people carrying boxes walk toward a single turnstile from opposite sides, while a sleepy guard watches and a green flag waves above](/AndreaBozzo/blog/images/green-is-a-policy-turnstile.webp "Forty rounds. Nobody ever bumped into anybody.")

In the [commit-barrier experiment](/AndreaBozzo/blog/en/posts/commit-barrier-iceberg-blog/) I needed
to prove that two writers racing to save the same batch of data would save it once, not twice. The
test for that passed. It still passes; I ran it again yesterday:

```
test iceberg_concurrent_writers_of_one_epoch_commit_once ... ok
iceberg race: 0/40 rounds hit a real optimistic conflict
test result: ok. 7 passed; 0 failed; 1 ignored
```

The second line comes from a diagnostic whose only job is to distrust the first. Forty rounds,
zero races. The in-memory catalog the test ran against takes one lock for everything, so the two
writers politely took turns. A concurrency test that never ran concurrently, green forty times in a
row. When I finally forced both writers into the same window, the duplicate it was supposed to rule
out showed up.

Lares, the backup project from the opening, has its own version, and it is worse because it lived
in CI. A check called "no unbound variables" ran the scripts with an empty environment. The scripts
stopped at their own config check, before reaching any code worth testing, and the step passed
every time. My commit message from the day I found it:

> That is the precise pattern this repo warns about, shipped in its own CI.

The same README promises resource limits "enforced by the kernel rather than declared and
ignored". Its CI had a check that was declared, and ignored by the code it was supposed to test.

## Checking the label instead of the thing

The plain version: the box said apples, the inspector checked the box said apples, and it was full
of pears.

![A wooden crate stamped with a red apple and a green tick, cut open to show it is packed with pears](/AndreaBozzo/blog/images/green-is-a-policy-crate.webp "The label was never wrong.")

[Nephtys](/AndreaBozzo/blog/en/posts/nephtys-edge-power-blog/) is a data connector whose whole pitch
is running small on cheap ARM boards like the Raspberry Pi. Its Docker image was published with an
entry marked `linux/arm64`, and CI had a smoke test asserting that the entry was there.

It always was.

From 26 July to 4 August, the program behind that label was built for ordinary x86 PCs. One default
value in the Dockerfile (`ARG TARGETARCH=amd64`) overrode the one the build tool supplies per
platform, so both versions were compiled for x86 and one of them was labelled ARM. On a Raspberry
Pi, the hardware the project exists for, `docker run` answered `exec format error`.

CI could not have caught it. The label was never wrong. The fix reads the first bytes of each
binary, the header that says which CPU it was actually built for, and fails if that does not match
the label. That is the difference between checking what an artifact says about itself and checking
what it is.

## Shape without substance

The plain version: the form was filled in, every box was the right shape, and the important box was
blank.

[dbt-isrm](https://github.com/AndreaBozzo/dbt-isrm) runs small test projects through every release
of dbt, a widely used tool for building data models, and records what lands in the metadata tables
dbt writes about each project. Current matrix: dbt 2.0.0 to 2.0.6, six projects, four modes, 168
runs.

All 168 succeed.

One project declares three rules on its columns: two "never empty", one "primary key". The manifest
dbt writes has all three. The metadata table has a column for exactly that, and it is empty in
every row, in every mode, in every release
([dbt-labs/dbt#16553](https://github.com/dbt-labs/dbt/issues/16553)). The file is readable, the
schema is valid, the run succeeded. The information is not there.

And the irony, because there is always one: my own matrix measures how full each column is, and in the
one mode that fills the inferred-type column, it reported it 100% full. It is full, of the wrong
thing. Columns declared `integer`, `varchar` and `decimal(10, 2)` come back as `Int32`, `Utf8` and
`Decimal128(10, 2)`: Apache Arrow's type names, not the database's
([dbt-labs/dbt#16515](https://github.com/dbt-labs/dbt/issues/16515)). The instrument I built to
find green-but-empty fields went green on a full-but-wrong one. It now checks what the values say,
not just whether they exist, and both findings fail in every cell they apply to.

## The average is fine. North is not.

The plain version: three jars of marbles, one of them bad, poured into a big jar that still looks
green.

![Two jars of green marbles on a table while a hand pours a third, mixed with grey marbles, into a large jar that still looks mostly green](/AndreaBozzo/blog/images/green-is-a-policy-marbles.webp "Every row is true. The top one just covers more ground.")

[Metric Evidence](https://github.com/AndreaBozzo/metric-evidence) is a Power BI report on made-up
orders, with problems planted on purpose, that shows evidence about the data next to each number.
One of its checks: at most 5% of orders may be missing their product category.

| Scope | Missing category | Check |
|---|---|---|
| Whole snapshot | 2.17% | pass |
| September, all regions | 4.67% | pass |
| September, North | 10.22% | **fail** |

Nothing in that table is wrong. The top two rows are true statements about the scope they cover,
and that scope happens to water down the one region where labels went missing. Look at September
and you see green, while a tenth of North's September orders sit in *Unknown*.

The same report has a version of this over time. The data stops on 20 September. Compare September
with August as full months and revenue fell 39.8%. Compare the same twenty days of each and it fell
8.5%. Both numbers are computed correctly. One of them answers a question nobody should be asking.
The report also deliberately ignores the overall quality score of the profiler behind it, because
one number does not tell you whether revenue is right. I wrote that profiler, and that score.

## More checks is not the fix

The obvious conclusion is "add more checks". The opening of this post is the counterexample:
`verify.sh` *was* the extra check. It was a green light I built to watch the other green lights.

What fixed each of these was not more checks. It was checks that prove they can see the failure,
the aerosol can instead of the test button:

- the diagnostic that counts how often the race actually happened, instead of trusting the test
  that claims it did;
- forcing the two writers into the same window, instead of hoping the scheduler would;
- reading the binary's header instead of its label;
- the result of the last run instead of the schedule;
- the CI check that was tested in both directions: clean on the current code, and failing when the
  original bug is put back;
- a script in Metric Evidence that changes one loaded value at a time, expects the report to say
  *Mismatch*, and puts the value back.

The common shape: **a check you have never seen fail is a rumour.** Before trusting one, make it go
red on purpose. If you cannot, you do not know what it measures, only what it is called.

## Healthy enough to do what?

None of this argues against green. Green lights are essential; nobody can read the full contract
of every check on every deploy. The problem is forgetting that a contract was there, and what was
thrown away when reality was squeezed into one bit.

So I ask a different question of each status:

- not *is the backup job running?* but *what would convince me I can restore?*
- not *did the pipeline finish?* but *which property of the output do I need to trust?*
- not *do the tests pass?* but *what state did they actually reach?*
- not *is the service healthy?* but *healthy enough to do what?*

For the record, Lares still has no restore test that runs on its own. It is an open issue. By the
standard of this post, my own backups are mostly a promise, just a better-documented one.

I have started reading every green light as a question rather than an answer: what exactly turned
green, and what does that prove?

Usually less than the colour suggests.
