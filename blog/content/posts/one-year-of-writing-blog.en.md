---
title: "One Year, 24 Posts: What Held Up and What Didn't"
date: 2026-11-09T15:30:00+01:00
draft: false
tags: ["Technical Writing", "Data Engineering", "Open Source", "Rust"]
categories: ["Data Engineering", "Open Source"]
description: "A year of writing about data tools, checked against what actually happened: the predictions that held, the ones that failed, how AI changed my work, and why so few people read the posts."
summary: "My first post promised a revolution. My recent ones mostly report what failed. A plain-language look back at a year of writing about data tools, written for readers who have never used any of them."
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
    image: "images/one-year-cover.webp"
    alt: "A seed tray with 24 cells of uneven seedlings, a few bare and one bent, beside a seed packet showing an impossibly perfect plant"
    caption: "Twenty-four cells. The packet promised more."
    relative: false
    hidden: false
---

A year ago, my first post on this blog said that two open-source projects were "revolutionizing
modern data lakehouse architecture." I wrote that sentence, and I believed it.

Twelve months and 24 posts later, my titles sound different. "The speed is the boring part."
"Exactly the same watts." "The useful part is when it says no." Somewhere along the way I stopped
announcing what tools could do and started checking what they actually did. That included the tools
I had built myself, which turned out to need it most.

I started the blog because of a gap. Rust, a programming language known for being fast and hard to
misuse, was turning up in more and more data tools. When I went looking for writing about it, I
found release notes, scattered talks and the odd benchmark. Very little explained what the projects
did, how they fitted together, or whether anyone should use them yet. So I wrote the articles I had
been looking for.

This is the look back: what held up, what didn't, and what I am changing. It is written for someone
who has never heard of any of the tools involved. If that is you, good. You are the reader I failed
to reach this year.

## The plumbing nobody notices

Most of what I write about is data infrastructure: the software that collects data, stores it,
moves it around and checks that it can be trusted. It sits behind every dashboard and every
machine-learning model. When it works, nobody notices. When it breaks quietly, someone makes a
decision based on numbers that are wrong.

The posts fell into three groups.

**Tools other people build.** [RisingWave](/AndreaBozzo/blog/en/posts/iceberg-risingwave-blog/)
processes data the moment it arrives. [Lakekeeper](/AndreaBozzo/blog/en/posts/lakekeeper-blog/)
keeps a register of where each table lives and who may use it.
[Polars](/AndreaBozzo/blog/en/posts/polarsruststack-blog/) analyses those tables.
[Lance](/AndreaBozzo/blog/en/posts/lancearticle-blog/) is a way of storing data built for AI work.
[Mosaico](/AndreaBozzo/blog/en/posts/mosaico-blog/) is a data platform for robots. And
[dbt](/AndreaBozzo/blog/en/posts/dbt-fusion-rust-blog/) is what thousands of teams use to reshape
their data with SQL.

**Tools I build.** [dataprof](/AndreaBozzo/blog/en/posts/arrowfordataprof-blog/) inspects a dataset
and reports what is wrong with it. [Ceres](/AndreaBozzo/blog/en/posts/ceres-blog/) is a search
engine for public open data, because public administrations rarely name their datasets the way
people search for them. [Nephtys](/AndreaBozzo/blog/en/posts/nephtys-edge-power-blog/) is a small
program that moves data between devices.

**Experiments that got out of hand.** A weekend spent cleaning a PS5 ended with a Raspberry Pi
running my home network, my passwords and my backups, and a small project called
[Lares](/AndreaBozzo/blog/en/posts/lares-weekend-pi-blog/). I tried to fit data-pipeline ideas onto
a [microcontroller with 520 KB of memory](/AndreaBozzo/blog/en/posts/embassyembeddedml-blog/), less
than a single photo on your phone. And I built a
[model for my fantasy football auction](/AndreaBozzo/blog/en/posts/fantabuddy-blog/). Its most
useful feature was telling me when to stop bidding.

## What held up

**You can open the code and fix it.** This was why I started, and it is still the best part. When
an open-source tool misbehaves, you can read its code, find the line and propose a change. In the
first four months I had about forty of those changes accepted into other people's projects:
Polars, Apache Iceberg, Lance, Tokio (the library much of Rust's networked software runs on), and
around ten in Mosaico. Many were small. A typo, a clearer
error message, a tidy-up. They were how I learned my way around.

Later the contributions got fewer, and each one started with something breaking while I used it
for my own work. Two of them went into Apache Arrow, a shared layout for data in
memory that lets one program hand a table to another without converting it first. Both fixes were
in the code that does exactly that handover. Those mean more to me than the early ones. Someone else
was going to hit those bugs, probably at a worse moment.

**Rust won, out of sight.** A year ago I bet that Rust would become a serious foundation for data
software. The strongest evidence arrived in August, when I opened dbt's code to report a bug and
found [77 Rust packages where the Python engine used to be](/AndreaBozzo/blog/en/posts/dbt-fusion-rust-blog/).
One of the most widely used data tools had quietly rewritten its engine.

That last part is where my early posts went wrong. My first three described a set of Rust tools that
could together replace the Java software most big data platforms run on. That never happened. Rust
spread by moving inside tools people already use. dbt users still write SQL. Polars and Lance users
still write Python. What they notice is a new version that runs faster and catches more mistakes.
That is probably a better outcome than the one I predicted. I just drew it wrong.

![An old mantel clock with a plain face, its back panel open to show brand-new rust-coloured gears inside a worn wooden case](/AndreaBozzo/blog/images/one-year-gears.webp "Same face. New gears.")

**The Lakekeeper post.** Of the early articles, this one aged best. I still use Lakekeeper, and two
of my fixes this year went into it. The posts that aged worst are the ones I wrote with a
newcomer's enthusiasm, a few weeks into a project and before I had used it for anything of my own.

## What didn't

Three assumptions failed this year. I made the third one more than once.

**"Less memory means less electricity."** In July I measured Nephtys on a Raspberry Pi 5 against
Node-RED, a popular tool for the same job. Mine used 6.6 times less memory. It also drew
[exactly the same power](/AndreaBozzo/blog/en/posts/nephtys-edge-power-blog/). I had half-assumed
that a lighter program would be a cheaper one to run. On that small computer, the electricity bill
did not care. Measure the thing you pay for, separately from the thing that looks good in a chart.

![A small light kettle and a large heavy kettle, each plugged into its own vintage electricity meter, both needles pointing to the same value](/AndreaBozzo/blog/images/one-year-meters.webp "One is much lighter. The meter didn't notice.")

**"If tools share a format, they behave the same."** Apache Iceberg and Delta are two sets of rules
for storing tables as ordinary files, so that different programs can read and write the same data.
In September I tried to add a quality check that had to pass before new data was saved for good.
It [worked with Delta](/AndreaBozzo/blog/en/posts/commit-barrier-iceberg-blog/). Iceberg's rules
allowed it too, but the Rust library I was using kept that option for its own internal use, so an
outside program could not make a save wait for the check. Two tools can read the same files and
still disagree at the one moment that matters. I published a
[small example that reproduces the problem](https://github.com/AndreaBozzo/iceberg-stale-base-repro)
and reported it to the project.

**"Green means it works."** My backup checker reported 24 out of 24 checks passed while the backup
job itself had failed. It checked that a backup was scheduled and that a recent copy existed. It
never asked whether last night's backup had actually run. The Iceberg experiment had its own
version. A test meant to catch two programs saving at the same moment passed every time. In 40
rounds, the two programs had never actually overlapped. When I forced them to, the test found a
duplicate. I collected these cases in
[a post about what a green light really proves](/AndreaBozzo/blog/en/posts/green-is-a-policy-blog/).
If you read one post from this year, read that one.

## How the work changed

In March I [answered a set of interview questions](/AndreaBozzo/blog/en/posts/1yearofclaude-blog/)
about a year of working with Claude Code, an AI coding assistant. I said I was writing less than
10% of my code by hand. That is still true.

It changed what my job is. When most of the code is written for you, the hard part becomes deciding
what counts as proof that it works. A passing test, a green dashboard and a confident summary all
look the same until you ask what they actually checked. The posts I am proudest of this year are all
about that question, which is probably no coincidence. The same rule applies here: an AI assistant
helps me draft, and every claim has to survive being checked against the code.

dataprof changed too. It started as my project. This year 21 other people contributed code to it,
and This Week in Rust, the community's weekly newsletter, listed it as a good place for newcomers to
pick a first task.

In October I finally used it the way a stranger would: as one part inside a
[small data pipeline](/AndreaBozzo/blog/en/posts/where-should-the-library-stop-blog/), a chain of
steps that loads data and decides whether it is fit to use. It embarrassed me twice. dataprof calls
dates stale once they are a certain number of years old, measured from today. On 1 January the
calendar turns, the June 2021 dates in a file nobody has touched cross that line, and its score drops
from 81 to 69. Same file, different verdict, depending on the day you ask. And it happily approved
ten rows of data when the pipeline expected ten thousand. The second gap was fixed within a week. The first taught me more about my own library
than a year of writing it.

## Four bets for next year

I will check these next November.

**Rust keeps spreading, and most people will never see it.** You will meet it as "the new version is
faster," inside tools you already use, in languages you already write.

**The register of tables becomes the place that decides who can do what.** Tools like Lakekeeper, or
Unity Catalog inside the Databricks platform, started as lists of where tables live. More and more,
they decide who may read and change them. Both of my Lakekeeper fixes this year made sure a change in permissions is
recorded before it takes effect. Details like that will matter more as these registers become the
gatekeepers.

**Agreeing on formats was the easy part.** The hard work ahead is agreeing on behaviour: what
happens when two programs save at the same time, or when one fails halfway through. It is less
visible than a new format, and it is where most of the real problems I hit this year came from.

**The more code AI writes, the more the checks matter.** A check that passes for the wrong reason was
always a problem. When the person reading the result did not write the code, it becomes a much
bigger one. This is the bet I care about most, and the one I will keep writing about.

## Reach was poor, and the cause was mine

My LinkedIn numbers have been falling for months. The latest post I shared there had zero reactions
when I checked. Blaming the algorithm is tempting. Then I reread my own posts.

One of my titles this year contained `pub(crate)`, a piece of Rust code meaning roughly "internal
use only." Only a Rust developer can read that title, and most of them would scroll past it. The
LinkedIn posts that introduced the articles were often worse. They described the work and saved the
finding for later, which on a social feed means never.

![A warmly lit workshop window full of carefully arranged tools, under a sign covered in unreadable code-like squiggles, while people on the pavement walk past without looking](/AndreaBozzo/blog/images/one-year-shopfront.webp "Open all year. The sign was in Rust.")

The feedback that helped came by other routes. A peer reviewer asked whether Nephtys really ran on
small hardware, which is how I ended up measuring it on a Raspberry Pi. The maintainer of a curated
list of Polars tools asked whether dataprof could have an R package, which led to a public write-up
of what it would take and why it has to wait. Each of those conversations changed what I did. No
reaction count ever has.

I have been writing for people who already know the tools and hoping everyone else would follow.
Next year I am turning that around:

- every post starts with why the problem matters, in words that need no prior knowledge;
- jargon gets explained the first time it appears, or cut;
- every post ends with a plain answer: what worked, what failed, and what I would do in your place;
- the deep technical detail moves to the code repositories, where you can run it;
- small ideas get short posts;
- when I share a post, the first line says what I found.

The work itself stays the same. It still has to be tested, measured and honest about what failed.
The explanation has to get good enough that you can decide whether it matters to you without
spending the hours I spent finding out.

## Next

The first project of the new year picks up the pipeline from October: deciding whether newly arrived
data is ready to use, and what to do when it isn't. I will write it up in the new style, and you can
tell me whether it worked.

If you read one of these posts this year and got lost halfway through a paragraph, that is on me.
I would genuinely like to know which one. Thank you for reading.
