---
title: "Dove deve fermarsi la libreria?"
date: 2026-10-20T17:30:00+02:00
draft: false
tags: ["Data Quality", "Data Engineering", "Open Source", "dataprof", "dlt", "DuckDB", "API Design"]
categories: ["Data Engineering", "Open Source"]
keywords: ["dataprof", "dlt", "DuckDB", "quality gate", "design di librerie", "dogfooding", "codice di raccordo", "write-audit-publish", "whylogs", "confini di una libreria"]
description: "Ho costruito una piccola pipeline dlt + DuckDB che usa come dipendenza il profiler di dati che mantengo, e ho annotato ogni riga di codice di raccordo che le è servita. Sette lacune nella libreria che mantengo, quattro in quella che non mantengo, nessuna in DuckDB. Su cosa deve possedere chi chiama, cosa dovrebbe aggiungere la libreria, e l'unica funzionalità che dovrebbe rifiutare."
summary: "Il mio profiler di dati darà allo stesso file, mai toccato, un punteggio più basso a Capodanno. L'ho scoperto usandolo per la prima volta come dipendenza. Sul codice di raccordo che serve a una pipeline vera, e sul confine tra cosa deve fare una libreria e cosa deve lasciare a chi la usa."
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
    alt: "Una valigetta degli attrezzi aperta, ogni attrezzo nel suo incavo, e al centro un incavo vuoto dalla forma strana con un cartellino di carta bianco legato sopra"
    caption: "Ogni attrezzo ha il suo posto. Quello interessante è il posto che nessuno ha riempito."
    relative: false
    hidden: false
---

Il 1° gennaio 2027 un file che non ho toccato riceverà un punteggio di qualità peggiore.

Dentro non cambierà niente. Le date di una colonna sono di giugno 2021, e
[dataprof](https://github.com/AndreaBozzo/dataprof), il profiler di dati che mantengo, misura la
tempestività rispetto alla data di oggi. Ecco due colonne identiche in tutto il resto, una con date
del 2021 e una del 2020, con la quota di valori che dataprof considera vecchi e il punteggio
complessivo:

```
2021 0.0 81.44
2020 100.0 68.94
```

Quando cambia l'anno, il file del 2021 diventa quello del 2020.

Stesso codice, stessi byte, verdetto diverso, a seconda di quando lo chiedi. Avevo scritto la
libreria, i suoi test e la sua documentazione, e nessuno di questi ne aveva fatto un problema. Ci
ha pensato una pipeline, la prima volta che ho usato dataprof come lo userebbe qualcun altro: come
dipendenza, con un gate che doveva dare la stessa risposta anche la settimana dopo.

## Dall'altra parte dell'API

Quando mantieni una libreria, passi il tempo a chiederti cosa dovrebbe esporre. Quando ne dipendi,
la domanda è cosa serve al tuo flusso di lavoro, e le due liste non coincidono.

Così ho costruito
[dataprof-pipeline-reference](https://github.com/AndreaBozzo/dataprof-pipeline-reference), una
piccola pipeline batch con una sola domanda: *un batch è stato caricato senza errori. I consumatori
devono vederlo?* [dlt](https://dlthub.com) carica uno snapshot di clienti e ordini in uno schema
DuckDB privato. dataprof e una manciata di asserzioni SQL fanno da gate. Solo un batch accettato
sostituisce ciò che leggono i consumatori, entrambe le tabelle insieme, in una sola transazione, con
una traccia di audit. Un batch rifiutato conserva le sue evidenze e non cambia nulla.

```
== batch-002: 8% of orders without customer_id
  dataprof orders: fail
    FAILED        max_null_percentage customer_id  observed 8.0  expected <= 2.0
outcome: rejected
published: run r20261010t095429_df5437 (event p20261010t095431_29a76f)
```

La parte interessante non è mai stata il caso felice. È stata la regola che mi sono dato prima di
scrivere codice: **ogni pezzo di raccordo che scrivo perché a una libreria manca qualcosa finisce
in un [file di findings](https://github.com/AndreaBozzo/dataprof-pipeline-reference/blob/main/docs/findings.md),
con l'evidenza e la modifica upstream più piccola che lo eliminerebbe.**

Quella regola conta di più quando la libreria è mia. Posso cambiare entrambi i lati. Se alla
pipeline serve qualcosa, posso aggiungerlo a dataprof nello stesso pomeriggio, oppure piegare la
pipeline attorno alla lacuna e dimenticarmene. In entrambi i casi, il prossimo che usa la libreria
inciampa nella lacuna che io ho aggirato in silenzio.

Il conto finale, per dataprof 0.12.0, dlt 1.31.0 e DuckDB 1.5.6:

| Libreria | Lacune registrate | Rapporto |
|---|---|---|
| dataprof | 7 | mia |
| dlt | 4 | non mia |
| DuckDB | 0 | non mia |

Sette su undici sono nella libreria che ho scritto io. Mi piacerebbe dire che mi ha sorpreso.

## L'orologio è di chi chiama

![Un calendario da parete che perde i suoi fogli sopra una scrivania, dove il voto a faccine dello stesso report, mai modificato, scivola dal verde al rosso](/AndreaBozzo/blog/images/where-should-the-library-stop-calendar.webp "Il report non è cambiato. La data sì.")

Torniamo all'inizio. Il punteggio di tempestività confronta le date con `Utc::now()`. Esiste un
modo per passare una data di riferimento fissa, ma è privato al crate. È stato aggiunto a luglio
perché i test della libreria fossero deterministici. I test hanno avuto un orologio stabile; gli
utenti no. Quindi un gate sul punteggio complessivo, o sulla tempestività, non si può riprodurre
più tardi. Rilancialo a gennaio e potrebbe contraddirsi.

La risposta della pipeline è poco elegante: non fa gate sul punteggio, punto. I punteggi restano
nei report salvati per chi è curioso, e il gate usa limiti di null per colonna e una metrica di
completezza obbligatoria, che non dipendono dal giorno.

Come workaround per la pipeline va bene. Come design di una libreria è sbagliato, e il motivo è la
proprietà. *A che data* è una decisione sulla domanda di business che si sta facendo, e solo chi
chiama la conosce. Una libreria che legge l'orologio prende quella decisione al posto suo, in
silenzio, a ogni esecuzione. La correzione
([dataprof#903](https://github.com/AndreaBozzo/dataprof/issues/903)) è un `reference_date`
pubblico, con oggi come default, *registrato nel report*. L'ultima parte è la più importante: un
risultato riproducibile deve portarsi dietro gli input che l'hanno prodotto.

La pipeline ha incontrato lo stesso problema con le versioni. Registra quale dataprof ha prodotto
ogni verdetto, così una rivalutazione successiva si può confrontare con l'originale. Una build di
sviluppo di dataprof riporta la versione dell'ultima release, quindi un report da una build di
`master` sembra identico a uno della 0.12.0, mentre due dei suoi comportamenti sono diversi
([#907](https://github.com/AndreaBozzo/dataprof/issues/907)). Chi chiama non può registrare quello
che la libreria non gli dice.

## Il raccordo che ho scritto attorno alla mia libreria

Le altre lacune hanno la stessa forma. La libreria calcola già qualcosa di vicino a ciò che serve
alla pipeline, e si ferma un passo prima.

**Una chiave riusata in righe per il resto distinte passa.** Il controllo dei duplicati di dataprof
conta le righe duplicate intere. Dieci ordini che riusano l'ID di un altro ordine differiscono
comunque per importo, data e cliente, quindi per un conteggio a righe intere sono dieci righe
perfettamente distinte. Il test della pipeline lo registra come `(physical, business) == (0, 10)`:
nessuna riga duplicata, dieci chiavi duplicate. La pipeline controlla l'unicità in SQL. dataprof
calcola già il numero esatto di valori distinti per colonna; un requisito di unicità per colonna è
un passo breve da lì ([#904](https://github.com/AndreaBozzo/dataprof/issues/904)).

**Un batch troncato passa.** Non c'era un requisito sul numero di righe. Dieci righe dove ne erano
attese diecimila passavano ogni controllo. La pipeline controlla il volume in SQL. Questa è quella
che ho corretto: `check(min_rows=N)` è stato unito cinque giorni dopo che l'avevo aperta
([#905](https://github.com/AndreaBozzo/dataprof/issues/905)). È su `master`, non ancora in una
release, quindi la pipeline esegue ancora il suo `count(*)`.

**Il report dimentica il tipo di origine.** Il `decimal128(12,2)` di Arrow torna come `Float` e
`timestamp[us, tz=UTC]` come `Date`. Va bene per una persona che scorre un profilo. Inutile per un
contratto che vuole dire *amount è un decimale a due cifre*. La pipeline salva da sé lo schema
Arrow accanto a ogni report ([#906](https://github.com/AndreaBozzo/dataprof/issues/906)).

**La policy è un mucchio di argomenti keyword.** La pipeline deve sapere, mesi dopo, esattamente
quale policy ha giudicato un batch. dataprof riceve la policy come argomenti keyword e non la
serializza, quindi la pipeline la carica da un file JSON e ne calcola il digest da sola. Questa
non l'ho aperta: si sovrappone a una issue aperta sui file di policy, e un oggetto policy è una
questione di design più grande di quella che una singola pipeline dovrebbe risolvere.

E poi c'è la lacuna che non compare nella tabella, perché non è una funzionalità mancante.
dataprof 0.12.0 tratta `N/A`, `None` e `\N` come valori invece che come null, e tipizza codici con
zeri iniziali come `007` come interi. Sono entrambi noti, aperti molto prima di questa pipeline
([#813](https://github.com/AndreaBozzo/dataprof/issues/813),
[#814](https://github.com/AndreaBozzo/dataprof/issues/814)). Sono entrambi corretti su `master`. E
gli ID delle fixture della pipeline hanno un prefisso alfabetico e non usano mai quei token di
null, quindi nessuno dei due bug può arrivare al gate.

È esattamente l'accomodamento silenzioso che il file di findings doveva impedire, ed è successo
lo stesso, nei dati di test. La difesa è che è scritto: un test di compatibilità fissa entrambi i
comportamenti, e su una build di sviluppo si ribalta. Se non l'avessi scritto, le fixture
sembrerebbero solo una scelta di stile.

## Limiti sì, insiemi no

![Un setaccio con due sassi grigi e uno color ruggine, accanto a un sacco di grano rovesciato con un solo chicco color ruggine dentro e una spunta verde sul cartellino](/AndreaBozzo/blog/images/where-should-the-library-stop-sieve.webp "Facile da vedere tra tre. Il sacco ha avuto lo stesso la sua spunta.")

Ecco dove la risposta onesta a "cosa serve alla pipeline?" è: non questo, non da me.

La pipeline ha due regole sui valori, entrambe in SQL. Gli importi degli ordini non devono essere
negativi. La valuta deve essere una tra `EUR`, `GBP`, `USD`. Sembrano entrambe roba da gate di un
profiler. Lo è solo una.

**I limiti ci stanno.** Una scansione completa riporta già il minimo e il massimo esatti di una
colonna numerica. Ho piazzato un importo negativo in diecimila righe e ho stampato il minimo
riportato, il numero di negativi e il verdetto del gate:

```
-1.0 1 pass
```

Il profilo *lo sapeva*: minimo `-1.0`, un valore negativo in una colonna segnata come positiva. Il
gate è passato lo stesso, perché l'unica cosa che guarda i negativi è il punteggio di accuratezza
a livello di tabella. È una funzionalità mancante, e la correzione discende da ciò che è già nel
report: `min_value` e `max_value` per colonna, decisi dal minimo e dal massimo registrati
([#908](https://github.com/AndreaBozzo/dataprof/issues/908)). Degraderebbe perfino in modo onesto:
una scansione parziale che *ha visto* un negativo può fallire; una che non l'ha visto può solo
dire che non è stato valutato.

**Gli insiemi no.** Un profilo contiene statistiche sui valori, non i valori. Per confrontare ogni
valore con un insieme ammesso, devi guardare ogni valore. Un profiler che prova a rispondere dal
suo riassunto deve approssimare, e l'approssimazione peggiora proprio quando conta.

Non volevo argomentarlo a tavolino, quindi l'ho provato su uno strumento che il controllo lo
offre. whylogs 1.6.4 ha `frequent_strings_in_reference_set`, che confronta le stringhe frequenti
di un profilo con un insieme di riferimento. Un valore non valido, prima tra tre valori validi,
poi tra cinquemila:

```
3 distinct valid + 1 invalid -> fail
5000 distinct valid + 1 invalid -> pass
```

Lo becca tra tre e lo lascia passare tra cinquemila. Discende da cosa è il controllo: guarda le
stringhe *frequenti*, e un singolo valore sbagliato tra cinquemila non è frequente. Ma un gate su
codici valuta o codici paese esiste proprio per beccare quel tipo di valore sbagliato, e come gate
un controllo che lo lascia passare è peggio di nessun controllo.

Gli strumenti che lo fanno bene testano tutti ogni riga: dbt `accepted_values`, Soda `valid
values`, Deequ `isContainedIn`, o una riga di SQL. Quindi l'appartenenza a un insieme resta in
SQL, nella pipeline, e il gate di dataprof resta quello che deve essere: soglie su ciò che un
profilo ha davvero misurato, non aspettative arbitrarie. Dire no a quella funzionalità fa parte del
design.

## La dipendenza che non potevo cambiare

dlt ha avuto lo stesso trattamento, con una differenza: non potevo correggere niente. Ogni lacuna
sarebbe diventata un workaround o una issue.

- `schema_contract="freeze"` su un dataset nuovo rifiuta tabelle che lo schema della pipeline
  conosce già. Visto che ogni esecuzione carica in uno schema candidato nuovo, succede a ogni
  esecuzione. La pipeline importa lo schema salvato a ogni esecuzione; il bug è aperto
  ([dlt-hub/dlt#4539](https://github.com/dlt-hub/dlt/issues/4539)).
- `pipeline.run()` cambia il `search_path` su una connessione DuckDB passata da chi chiama. Impatto
  basso, registrato, non aperto.
- Un dataset con lo stesso nome del file del database DuckDB fallisce con un riferimento ambiguo, e
  l'errore suggerisce di riprovare una pipeline concorrente. Già noto upstream.
- Senza contratto, un valore che non si può convertire viene caricato come NULL più una colonna
  variante `__v_text`. Documentato, sensato in esplorazione, e silenziosamente ostile a un
  controllo sui null a valle. La pipeline congela lo schema.

DuckDB: niente. La sostituzione transazionale delle viste e il recovery dopo un crash hanno fatto
quello che serviva alla pipeline, e i test che fanno crashare il runner prima e dopo il commit di
pubblicazione sono d'accordo.

Scrivendo la lista di dlt ho notato quanto fosse facile essere equo con una libreria che non è mia.
Per dlt ho annotato la lacuna, il workaround e la issue, e sono andato avanti. Per dataprof il mio
primo istinto ogni volta era andare a correggerla, che è il modo in cui una libreria si riempie di
funzionalità sagomate su una sola pipeline. Il file di findings mi ha costretto a trattare la mia
libreria come le altre due: una lacuna, la sua evidenza, la modifica più piccola, e una decisione
su se appartenga davvero upstream.

## Chi possiede cosa

Il documento di architettura della pipeline si apre con una tabella di quattro righe, ed è la cosa
più utile del repository:

| Parte | Possiede |
|---|---|
| dlt | estrazione, normalizzazione, caricamento, il contratto di schema congelato |
| dataprof | profili, controlli del gate e i loro verdetti |
| DuckDB | storage, asserzioni SQL, transazioni |
| la pipeline | esecuzioni, prontezza, esito, pubblicazione, recovery, evidenze |

Ogni lacuna di dataprof in questo post è un punto in cui quella tabella non era ancora vera.
L'orologio e la versione della build erano decisioni di chi chiama, tenute dalla libreria.
Unicità, numero di righe e limiti erano compito della libreria, fatto da chi chiama in SQL.
L'appartenenza a un insieme sembrava compito della libreria, e non lo è.

È la domanda con cui ne sono uscito: cosa fa sì che strumenti utili ciascuno per conto suo si
compongano in qualcosa su cui puoi contare? Qui, almeno, la risposta è stata noiosa e precisa. Ogni
strumento deve dire cosa decide, registrare gli input su cui ha deciso, e rifiutare quello che non
può decidere in modo solido. Il resto è di chi chiama, e chi chiama deve saperlo.

dataprof ci è più vicino di un mese fa, ma non in un modo che un utente possa installare. Una delle
sette voci è corretta su `master`, nessuna delle correzioni è in una release, e la pipeline scrive
ancora ogni riga del raccordo. È il motivo per tenere il file: il giorno in cui una voce si può
cancellare, il raccordo se ne va con lei.
