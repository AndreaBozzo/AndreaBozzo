---
title: "I Built a Model for Fantacalcio. The Useful Part Is When It Says No."
date: 2026-08-20T10:00:00+02:00
draft: false
tags: ["Fantacalcio", "Python", "DuckDB", "Machine Learning", "Data Engineering", "Open Source", "Football Manager"]
categories: ["Data Engineering", "Open Source"]
keywords: ["Fantabuddy", "Fantacalcio", "Championship Manager 03/04", "Football Manager", "Python", "DuckDB", "API-Football", "machine learning", "fantasy football auction", "fantacalcio-py"]
description: "From Championship Manager 03/04 to Fantabuddy: how twenty years of football obsession became a reproducible auction report, with fresh data, models allowed to lose, and decisions that remain human."
summary: "I started with Milan in Championship Manager 03/04, went through an almost perfect auction and a season shaped by injuries, then built Fantabuddy on holiday: a system that turns player lists, history and APIs into an auditable auction report."
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
    image: "images/fantabuddy-cover.webp"
    alt: "Two friends preparing their Fantacalcio auction together during a summer holiday"
    caption: "Data prepares the auction. We still have to manage the team."
    relative: false
    hidden: false
---

I had been away from Fantabuddy for twelve days. The player list, meanwhile, had not gone
on holiday.

The file I had used on August 5 contained 494 rows, 491 of them active; the one I
downloaded on August 18 contained 519 rows and 504 active players. Twenty-five new names,
twelve players out of the active pool and 148 rows of the ranking changed. Four days from
the first whistle of the Serie A season, my perfectly reproducible model was already only
as useful as its freshest input.

This is the story of Fantabuddy. But it starts long before Python, DuckDB and Brier
scores.

## The first save is always Milan

I have played football management games since
[**Championship Manager 03/04**](https://www.gamesurf.it/recensioni/gioco/championship-manager-03-04-c1380),
known as *Scudetto 03/04* in Italy. It was still Ancelotti's great Milan, fresh from
winning the
[2002/03 Champions League](https://www.uefa.com/uefachampionsleague/news/0253-0d7b3011dd29-b3eede70c2ce-1000--milan-lift-european-crown/)
against Juventus in Manchester. My first save in every Championship Manager or Football
Manager has always been Milan. It is the club I have supported all my life; I doubt that
tradition will change any time soon.

I did not know terms such as *feature engineering* or *temporal validation* yet, but the
game was already a huge database for making decisions: minutes, form, roles, injuries,
potential and price. Football was the story; data was how I entered it.

Moving to Fantacalcio — Italy's version of fantasy football — felt natural. Over the
last few years, as my data experience grew, recurring wins in friendly leagues followed.
Not because a spreadsheet can predict a season, but because it helps me do a few
unglamorous things more consistently: buy starters, spread the budget, recognise value
before it becomes consensus, and avoid falling in love with too many gambles at once.

## The almost perfect auction

The 2024/25 season is the one I remember as my almost perfect auction. Orsolini and
Çalhanoğlu carried me through much of the league, but the squad worked because every
department was well assembled.

| Player | Serie A 2024/25 result |
|---|---:|
| Meret | 16 clean sheets, 25 goals conceded, 2 penalties saved |
| Dumfries | 7 goals, 2 assists |
| Çalhanoğlu | 5 goals, 6 assists |
| Orsolini | 15 goals, 4 assists |
| Krstović | 11 goals, 5 assists — bought for 1 credit |

The four outfield players produced **38 goals and 17 assists** between them. Krstović is
the snapshot of that season: one credit, 37 rated appearances, 11 goals and 5 assists.
The kind of bargain everyone talks about afterwards, but one that only works if the rest
of the squad is not made up of seven more bargains waiting to happen.

That year I also used
[`fantacalcio-py`](https://github.com/piopy/fantacalcio-py), an open-source project by
[Antonio Pio Volgarino](https://github.com/piopy). I later contributed four pull
requests: a CLI, a fix for duplicate columns in Excel files, JSON export and a fix for
output-directory handling. It was not Fantabuddy, but it was the first concrete bridge
between this passion and open source: a real tool, used for a real auction, that I could
improve for other people too.

The next season taught me the opposite lesson. In 2025/26 I entered two leagues, won
both cup competitions and finished third in one, but the main title stayed out of reach.
Vlahović suffered a high-grade adductor injury, Giménez needed ankle surgery, De Bruyne
tore his biceps femoris and Lukaku also stopped with a serious thigh injury.

That is not an excuse. It is the difference between the quality of a decision and its
outcome. You can build a good squad and still lose a volume of minutes no pre-auction
model could have known about.

And then you still have to manage it. In the second league my co-manager **Renato** was
fundamental: setting the lineup every week, reading the moment, not piling up auction
gambles, and correcting mistakes as the season moved. He is not on GitHub or LinkedIn;
he is simply a friend with whom I share the team. Data prepares the pitch. Someone still
has to play the match.

## What Fantabuddy can actually control

Fantabuddy exists to make the controllable part repeatable. It imports snapshots of the
official player list, connects them to API-Football history, stores everything in
DuckDB, and produces prices consistent with my league rules: ten teams, twenty-five
slots per squad and **10,000 total credits**, reconciled down to the last one. Every
screenshot below is in Italian, like the auction it was built for.

![The boundary between Fantabuddy's repeatable work and human decisions](/AndreaBozzo/blog/images/fantabuddy-human-loop-en.webp "Player lists and APIs become an auditable report; auction and lineup decisions remain with Andrea and Renato")

The August 18 snapshot contains 504 active players. An accepted API identity exists for
503; all 504 still have an explicit decision, because a match made on string similarity
alone is never approved automatically — it waits in a pending queue until I look at it.
For 471 players, the system can build a forecast from fixture-level history. Current
squads, transfers, availability and fixtures all declare when they were observed.

Per-match granularity matters. Every row used by the model sees only what was known
before that match: rolling averages stop at the previous appearance, while the current
start, minutes, rating and bonuses live separately as labels. The future cannot sneak
into training through a side door.

Then the model has to earn the right to appear in the report, and it has to earn it
twice, because the two things I predict are checked in different ways.

Availability — will he start, and for how many minutes — trains on every season before
the last one and is validated on the last one, which never enters training. That model
ships only if it beats a simple baseline by at least 1%.

| Prediction | Baseline | Model | Decision |
|---|---:|---:|---|
| Starting probability, Brier score | 0.1581 | 0.1335 | model, -15.6% |
| Minutes per match, MAE | 20.10 | 17.76 | model, -11.6% |

Seasonal scoring is a harder room. Each role is backtested walk-forward across folds,
and what reaches the report is never the model on its own: it is a blend of the official
market value and the model, weighted at most 60% towards the model. To be accepted, that
blend has to cut the baseline's error by at least 3% without losing rank correlation.
Goalkeepers, defenders and midfielders cleared it. Forwards did not, so their column is
the baseline, untouched.

That is my favourite result in the entire project. A useful model is not one that always
has a prediction. It is one allowed to lose when a simpler answer is better.

![Model validation, coverage and freshness in the Fantabuddy report](/AndreaBozzo/blog/images/fantabuddy-report-method.webp "The report exposes its gates, coverage and source observation times")

## A price is an opinion, and mine lives in a YAML file

Something has to turn a score into a number I can shout across a table, and that step is
not science. It is my league's constitution, sitting in `config/league.default.yaml`
where anyone can disagree with it.

Ten squads of twenty-five slots means exactly 250 players can be bought. The other 254
in the list are worth one credit each and are marked tier E: the model still ranks them,
the budget never sees them. Every one of the 250 slots gets one credit as a floor, and
the remaining 9,750 are divided by role — 48% to forwards, 28% to midfielders, 16% to
defenders, 8% to goalkeepers.

Inside a role, the money does not follow the score. It follows the gap between a player
and the last man who still makes a squad — replacement level — raised to the power 1.15,
so the curve leans towards the top without collapsing onto it. Then a hard cap per role:
90, 130, 280, 500. On August 18 that produced 810 credits for goalkeepers, 1,640 for
defenders, 2,810 for midfielders and 4,740 for forwards. Exactly 10,000; the build raises
an assertion and dies if it is not.

The part I find honest is what the caps do. In all four roles, exactly one name is
sitting on the ceiling — Svilar, Dimarco, Nico Paz, Malen. The curve would happily spend
more on each of them and I do not let it. And that 48% to forwards is not a discovery
either: it is a bet on how my league behaves at an auction, one number in a file, and one
I can be wrong about for an entire season.

## Even APIs do not know everything

Having thousands of calls available is not a reason to spend them. Before the season
started, API-Football still marked player statistics and injuries for Serie A 2026/27 as
unavailable. I refreshed what could genuinely have changed — squads, transfers,
availability history and fixtures — and left the rest alone. The provider itself
recommends checking coverage before every
[acquisition](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage).

Coverage does not mean completeness either. Reconstructing 2025/26, the history I
ingested correctly contained Lukaku's thigh injury, but no episode at all for De Bruyne,
nothing for Vlahović — who by then had left the pool my squad queries cover — and, for
Giménez, a summer ankle sprain instead of the December operation I actually lived
through. Three players, three different ways of being wrong. That is why injuries are
**alerts to verify** in the report, not medical records. The API reduces uncertainty; it
does not erase it.

The ratings underneath the whole model are the provider's, too, not the official
Fantacalcio votes. Everything Fantabuddy predicts is a proxy for the thing my league
actually scores. I would rather write that here than let a reader discover it in the
fourth column of the ranking.

## The product is the HTML

A Parquet file does not follow me to an auction. A half-open notebook cannot quickly
show me which likely starters cost forty credits or fewer. That is why Fantabuddy's
main output is a self-contained, filterable HTML report that works offline.

![Fantabuddy report overview on August 18, 2026](/AndreaBozzo/blog/images/fantabuddy-report-overview.webp "Current snapshot, reconciled budget and top choices by position")

It shows top picks by position, possible low-cost starters, availability alerts, recent
transfers and changes since the previous snapshot. The full ranking exposes price, FVM,
starting probability, expected minutes, bonuses, reliability and the explanation behind
the estimate. At the bottom, instead of hiding them, it shows model gates, coverage and
the freshness of every source.

![Operational report signals: low-cost starters, alerts and transfers](/AndreaBozzo/blog/images/fantabuddy-report-signals.webp "API data becomes a concrete shortlist of questions to investigate before the auction")

It will not tell me whom to buy without thinking. It will not stop four forwards from
getting injured, and it will not set the lineup with Renato. It does something less
spectacular and more useful: it preserves what we knew, when we knew it, and why a
decision looked good.

In Championship Manager 03/04, the database was the world in which I imagined my next
season with Milan. More than twenty years later, I built a much smaller one to prepare
for an auction among friends. The passion is the same. Now it has immutable snapshots
and an HTML report.

## Where to find the work

Fantabuddy is available at
[`AndreaBozzo/fantabuddy`](https://github.com/AndreaBozzo/fantabuddy). The project I used
during the 2024/25 season is
[`piopy/fantacalcio-py`](https://github.com/piopy/fantacalcio-py); my four contributions
are collected in this
[pull-request search](https://github.com/piopy/fantacalcio-py/pulls?q=is%3Apr+author%3AAndreaBozzo).

The 2024/25 statistics above can be checked in the Fantacalcio archives for
[Orsolini](https://www.fantacalcio.it/serie-a/squadre/giocatore/orsolini/2167/2024-25/italia),
[Çalhanoğlu](https://www.fantacalcio.it/serie-a/squadre/inter/calhanoglu/2194/2024-25),
[Dumfries](https://www.fantacalcio.it/serie-a/squadre/inter/dumfries/5513/2024-25),
[Krstović](https://www.fantacalcio.it/serie-a/squadre/lecce/krstovic/6435/2024-25) and
[Meret](https://www.fantacalcio.it/serie-a/squadre/napoli/meret/572/2024-25). Official
club statements document the injuries suffered by
[Lukaku](https://sscnapoli.it/en/bollettino-medico-le-condizioni-di-lukaku/),
[De Bruyne](https://sscnapoli.it/en/nota-medica-kevin-de-bruyne/),
[Vlahović](https://www.juventus.com/en/news/articles/medical-update-dusan-vlahovic-01-12-25)
and [Giménez](https://www.acmilan.com/it/news/articoli/media/2025-12-18/comunicato-ufficiale-santiago-gimenez).

*Thanks to Antonio for making `fantacalcio-py` open source, and to Renato for everything
that happens after the report is closed and the matchday lineup still has to be set.*
