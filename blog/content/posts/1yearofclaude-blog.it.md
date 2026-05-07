---
title: "1 Anno di Claude Code: Un'Intervista"
date: 2026-03-05T12:00:00+01:00
draft: false
tags: ["Claude Code", "AI", "Developer Tools", "Workflow"]
categories: ["AI", "Developer Tools"]
description: "Un'intervista tecnica su un anno di utilizzo quotidiano di Claude Code come strumento di ingegneria"
summary: "Claude intervista Andrea Bozzo su un anno intero di utilizzo di Claude Code nel terminale — il workflow, le custom skill, gli spigoli vivi e il database distrutto."
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
    image: "images/1yearofclaude.png"
    alt: "1 Anno di Claude Code"
    caption: "1 Anno di Claude Code"
    relative: false
    hidden: false
---

## Introduzione

Uso Claude Code — l'agente CLI di Anthropic — ogni singolo giorno da un anno. Non la chat nel browser, non un plugin copilot: il vero e proprio strumento da terminale, in esecuzione direttamente nel mio ambiente di sviluppo, con accesso ai miei file, alla mia shell e ai miei progetti.

Per celebrare l'occasione, ho provato qualcosa di diverso. Ho chiesto a Claude di intervistarmi. Ha interpretato il ruolo di un senior data engineer che conduce un podcast tecnico, e io ho risposto alle sue domande in tempo reale dal terminale. Quello che segue è quella conversazione, leggermente modificata per chiarezza e fluidità. Le domande sono di Claude. Le risposte sono mie.

---

## Dal Browser al Terminale

**Host:** Un anno fa, hai fatto il passaggio da Claude nel browser a Claude Code nel terminale. Qual è stato il momento specifico, o l'attrito specifico, che ti ha fatto dire "il browser non basta più"?

**Andrea:** Sentivo che eseguire un agente direttamente nel mio terminale poteva essere una svolta — e lo è stato. Il browser, almeno all'epoca, era molto più limitato di oggi. Avere Sonnet 4 al lavoro sulle mie codebase è stato il momento "oh shit" in cui ho capito che avevo finito di scrivere codice manualmente.

**Host:** "Finito di scrivere codice manualmente" è un'affermazione forte. Scrivi in Rust — borrow checker, lifetime, trait bound, tutta la trafila. Cosa significa concretamente? Scrivi ancora Rust a mano usando Claude per accelerare, o stai davvero generando interi moduli tramite prompt e poi revisioni l'output?

**Andrea:** Un anno fa serviva molto accompagnamento. Direi che si partiva da un 50/50 tra me e l'agente. Ma questo fino a dicembre, quando è uscito Opus 4.5 — e lì è cambiato tutto. L'intervento diretto è calato drasticamente. Ma dato il costo dei token, precisione e una direzione chiara sono ora obbligatorie, più di prima. La pianificazione occupa il 90% del tempo; il task effettivo raramente supera i 30 minuti. Attualmente scrivo meno del 10% del mio codice. Il resto è review.

**Host:** Quindi sei passato dal 50/50 a essere essenzialmente un code reviewer e architetto. E hai menzionato qualcosa di interessante — che l'upgrade a Opus ha in realtà *aumentato* la pressione su di te nell'essere preciso in partenza, perché i token costano e i prompt vaghi li bruciano velocemente. Come si presenta concretamente questa fase di pianificazione? Scrivi specifiche dettagliate in markdown, abbozzi type signature, disegni diagrammi di architettura — che artefatto consegni a Claude prima di dire "costruiscimi questo"?

**Andrea:** Non inizio una sessione se non ho un'idea chiara *e* un file markdown con tutti i dettagli. Devo massimizzare l'output.

---

## Il Workflow — Specifiche, Skill e Sessioni

**Host:** Una specifica markdown prima di ogni sessione — è disciplinato. Puoi guidarmi attraverso il contenuto di uno di questi file? Prendi una feature recente che hai rilasciato in Ares o Ceres.

**Andrea:** Ecco un esempio concreto: [Ceres issue #51 — Configurable Delta Detection Strategy](https://github.com/AndreaBozzo/Ceres/issues/51). Tre strategie con casi d'uso chiari, una tabella che mappa ciascuna al suo scopo, esempi di integrazione CLI e persino il path del file target. Sia Ceres che Ares hanno anche delle Claude Skill standalone, che hanno ridotto la durata della fase di pianificazione di circa un terzo. Ma rappresentano anche qualcosa che va aggiornato insieme ai programmi principali — e questo richiede sforzo aggiuntivo, dato che non uso un agente per tenerle aggiornate automaticamente.

**Host:** Cos'è esattamente una Claude Skill in questo contesto? Come si presenta strutturalmente?

**Andrea:** Una skill fornisce conoscenza su una procedura, un'architettura o qualsiasi cosa tu voglia. È qualcosa che Claude può caricare nel proprio contesto per evitare di rileggere la codebase ad ogni nuovo task. Aiuta anche con l'utilizzo di qualcosa come Ares, che ha molti flag. Ecco come appare la skill di Ceres:

```
ceres/
├── SKILL.md                        # Entry point — panoramica, trait, tipi, quick start
└── references/
    ├── architecture.md             # Grafo dei crate, servizi, gestione errori, schema DB
    ├── cli-and-server.md           # Comandi CLI, REST API, variabili d'ambiente, deployment
    ├── harvesting.md               # Ottimizzazione a due livelli, delta detection, circuit breaker
    ├── extending.md                # Implementazione di trait personalizzati
    └── contributing.md             # Setup dev, testing, CI, code style
```

**Host:** Quindi è una knowledge base precaricata — uno snapshot curato dell'architettura del progetto, della superficie CLI e dei pattern interni. Ma la codebase evolve. Come rilevi quando una skill è andata fuori sincrono con il codice?

**Andrea:** È una cosa su cui sto ancora ragionando. Le tool call allucinogene sono il problema numero uno, di solito. Ma dato che mantengo sia le skill che i progetti, generalmente so quando qualcosa sarà disallineato.

> **Per i lettori:** Finora abbiamo coperto il percorso di Andrea dal browser al terminale, il passaggio dalla scrittura di codice all'architettura e alla review — specialmente dopo l'upgrade a Opus — e la disciplina di scrivere specifiche markdown dettagliate prima di ogni sessione. Abbiamo anche iniziato a esplorare come le Claude Skill funzionino come conoscenza persistente del progetto, riducendo il tempo di onboarding per sessione.

---

## L'Incidente del Database

**Host:** Parliamo di storie concrete. Hai menzionato un'immagine chiamata `byedatabase.png` in cui Claude ha distrutto il tuo Postgres locale. Cos'è successo?

**Andrea:** Claude ha spazzato via il mio Postgres locale con oltre 350.000 dataset. È stato un ottimo momento per avere una devozione maniacale ai backup.

![byedatabase.png](/AndreaBozzo/blog/images/byedatabase.png)

Proprio lì nello screenshot — `docker compose down && docker volume rm ceres_ceres_pgdata` — e poi la realizzazione immediata: *"Aspetta — ho appena cancellato i tuoi dati."* Stava cercando di risolvere un warning di ownership di un volume Docker ed è andato dritto verso il percorso distruttivo senza fermarsi a controllare cosa contenesse quel volume.

**Host:** Dopo quell'incidente, hai cambiato qualcosa nel modo in cui lasci operare Claude? Hai ristretto i permessi o aggiunto gate di conferma?

**Andrea:** Non ho cambiato nulla, perché quella volta è stata colpa mia — ho letto male il comando prima di approvarlo. Avere backup è fondamentale esattamente per queste ragioni. Per la cronaca: non eseguo sessioni multi-agente in parallelo, nessuna modalità autonoma. Controllo ogni utilizzo di tool, ogni input, perché ho ancora problemi di fiducia — e perché *voglio* capire come fa Claude. Usare un agente AI non significa delegare e andarsene. Lo tratto come una sessione di pair programming in cui io sono il reviewer di ogni singolo diff.

> **Per i lettori:** Abbiamo visto il ciclo completo — Andrea scrive una specifica dettagliata, carica una custom skill per dare a Claude il contesto del progetto, e lavora attraverso il task in una singola sessione focalizzata, approvando manualmente ogni tool call. Abbiamo anche visto cosa succede quando quell'approvazione scivola. I backup hanno salvato la giornata, ma la lezione non è "aggiungi più protezioni" — è "presta attenzione."

---

## Spigoli Vivi

**Host:** Oltre alle tool call allucinogene e all'incidente del database — qual è la limitazione più frustrante che incontri regolarmente usando Claude Code nel tuo workflow Rust?

**Andrea:** Claude è bravo con Rust — ancora un po' sul lato verboso, ma niente male devo ammettere. Claude Code, però, può ancora migliorare molto sulla parte di orchestrazione. Penso che sia ancora il punto più debole, ed è quasi impossibile tracciare due o tre agenti simultaneamente.

**Host:** Mi hai anche detto che tu stesso non esegui agenti in parallelo. È qualcosa che hai provato e da cui ti sei ritirato?

**Andrea:** Mi piace guardare i pazzi che lanciano 10+ agenti. Almeno fatemi guardare!

**Host:** Come si presenta concretamente la "verbosità"? Implementazioni di trait non necessarie, error handling sovra-astratto, troppe funzioni helper?

**Andrea:** Tutte e tre sono vere. Aggiungerei anche alcuni loop di ownership che possono essere insidiosi — ma questo vale anche per me. Costruire da zero con Claude è fattibile, ma richiede che l'utente sia davvero bravo nel software engineering.

**Host:** Hai istruzioni esplicite — in un CLAUDE.md, nelle tue specifiche, nelle skill — che dicono a Claude di restare snello? O il controllo della semplicità avviene puramente in fase di review?

**Andrea:** Non uso un CLAUDE.md, ma si potrebbe dire che le skill facciano qualcosa di molto simile.

**Host:** Come utente VSCode, qual è il punto di attrito maggiore nello strumento?

**Andrea:** Il setup MCP e il suo utilizzo attraverso diversi workspace e configurazioni. C'è strada da fare.

---

## La Visione Ingegneristica

**Host:** Dopo un anno, avendo visto sia le vittorie che i fallimenti — i database distrutti, i flag allucinati, il Rust verboso, i loop di ownership — mantieni ancora l'affermazione che hai "finito di scrivere codice manualmente"? E cosa diresti a un senior Rust engineer scettico sull'integrare un agente AI nel proprio workflow?

**Andrea:** Che ha solo spostato il collo di bottiglia di un piano sopra. Non ho risparmiato tempo — ho semplicemente fatto di più. Leggilo come vuoi.

---

## Chiusura

Questa è l'intervista. Un anno di utilizzo quotidiano, distillato in una conversazione. Gli strumenti sono migliorati drasticamente — da Sonnet 4 a Opus 4.5 a 4.6 — ma il workflow di base non è cambiato: pianifica accuratamente, fornisci contesto, revisiona tutto.

Se i progetti discussi qui vi interessano, date un'occhiata ad [Ares](https://github.com/AndreaBozzo/Ares) e [Ceres](https://github.com/AndreaBozzo/Ceres) su GitHub.
