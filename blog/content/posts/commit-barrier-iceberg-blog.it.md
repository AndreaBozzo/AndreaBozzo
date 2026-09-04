---
title: "Ho provato a mettere la data quality dentro il commit. Mi ha fermato un pub(crate)."
date: 2026-09-04T10:00:00+02:00
draft: false
tags: ["Rust", "Apache Iceberg", "Delta Lake", "Data Quality", "Lakehouse", "Transactions", "Open Source", "Data Engineering"]
categories: ["Data Engineering", "Open Source"]
keywords: ["iceberg-rust", "Delta Lake", "commit idempotente", "exactly-once", "data quality", "commit barrier", "TableRequirement", "concorrenza ottimistica", "Rust", "dataprof"]
description: "Un profiler ti dice che i dati sono sbagliati quando sono già durevoli. Così ho provato a rendere il report che passa una precondizione della durabilità, su Delta e su Iceberg, con un solo trait. Delta ha funzionato. Iceberg non riesce proprio a esprimere quel commit — e il motivo sono quattro righe di visibilità in una libreria, non qualcosa nella specifica."
summary: "Un esperimento di falsificazione con una kill list scritta prima e un risultato negativo. Delta ha un commit idempotente fatto apposta; iceberg-rust ribasa la transazione su una base che il chiamante non ha mai controllato, quindi uno scrittore esterno non può rendere condizionale un commit. Il test di concorrenza verde era un falso positivo — 0 round su 40 hanno davvero gareggiato — e solo un failpoint ha fatto uscire il duplicato."
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
    alt: "Lo scrittore A controlla epoch 1 sulla base A, la transazione viene ribasata sulla base B, e la premessa stabilita dal controllo si perde prima che il commit atterri"
    caption: "Il controllo è avvenuto sulla base A. Il commit è avvenuto sulla base B."
    relative: false
    hidden: false
---

```
thread 'iceberg_stale_writer_loses_the_cas_and_does_not_duplicate' panicked at tests\sinks.rs:289:5:
assertion `left == right` failed: the stale writer appended a second copy of epoch 1
  left: 10
 right: 5
```

Quel test è marcato `#[ignore]` nel mio repository. Non perché sia flaky, e non perché ci
abbia rinunciato. La motivazione allegata dice che fallisce, che questo è il risultato
dell'esperimento e non un bug del test, e come riprodurlo. È l'unico posto onesto che avevo
per metterci il risultato che l'esperimento era stato costruito per trovare.

La domanda a cui risponde è stretta, e l'ho scritta prima di cominciare proprio per non poterla
spostare dopo:

> Delta **e** Iceberg riescono entrambi a supportare un commit idempotente `(app_id, epoch)`,
> con la stessa astrazione, senza un coordinatore transazionale esterno?

La risposta è no. Ecco come la risposta è diventata così precisa, e perché il "no" è più utile
di quanto sarebbe stato il "sì".

## L'idea che stavo cercando di uccidere

Mantengo [dataprof](https://github.com/AndreaBozzo/dataprof), un profiler. Legge i dati e ne
fa un report. Non sposta i dati, e il suo `AGENTS.md` lo dice in una riga — cosa che più
avanti conta.

Lavorarci abbastanza a lungo fa emergere sempre la stessa lamentela strutturale, da ogni
direzione: un profiler ti dice che i dati sono sbagliati *dopo* che i dati sono durevoli. Ti
ritrovi un report bellissimo su una tabella che la produzione sta già leggendo. Il controllo e
la conseguenza vivono in posti diversi, e la distanza fra i due si misura in qualunque
intervallo abbia la tua orchestrazione.

Da qui l'idea. Non un controllo migliore: una posizione diversa per il controllo. Un batch
Arrow non dovrebbe diventare dato di produzione durevole se il suo contratto non passa, e la
prova che è passato dovrebbe committare atomicamente insieme ai dati e all'avanzamento della
sorgente. Chiamiamolo quality-aware commit barrier.

Qui voglio andarci piano, perché è il punto in cui un post come questo di solito si inventa un
mercato. Sistemi di ingestion che prendono il commit sul serio esistono già, e alcuni lo fanno
benissimo. Il protocollo di materializzazione di Estuary mette il requisito nero su bianco:
"gli aggiornamenti al checkpoint e allo stato della vista DEVONO sempre committare insieme,
nella stessa identica transazione". Ed è altrettanto onesto su cosa succede quando la
destinazione non può partecipare: "questo schema è at-least-once. Una transazione può fallire
a metà ed essere riavviata, causando la riesecuzione parziale o totale dei suoi effetti".
Databricks fa la metà quality dentro la pipeline, dove una expectation può fare `warn` ("i
record non validi vengono scritti nella destinazione"), `drop` ("i record non validi vengono
scartati prima che i dati siano scritti nella destinazione") oppure `fail` ("i record non
validi impediscono all'update di riuscire; serve un intervento manuale prima di
riprocessare").

Niente di tutto questo manca. Quello che non sono riuscito a trovare è la versione
*portabile*: una barriera che sta fra un producer qualsiasi e un sink lakehouse qualsiasi e
partecipa alla decisione di far avanzare lo stato, senza possedere tutta la pipeline.

Ogni pezzo di quella cosa è già risolto o costa poco, tranne uno. Il commit deve essere
portabile fra protocolli di storage, altrimenti non è affatto una primitiva: è la feature di
un singolo table format travestita da trait.

Quell'unica incognita è tutto l'esperimento.

## Il setup, e la kill list

**Delta è il controllo.** Il suo protocollo ha un'azione di identificazione transazione fatta
apposta, che porta un `appId` (String) e una `version` (Long), con lo scopo esplicito di
permettere a un'applicazione esterna di "evitare la duplicazione dei dati di fronte a
fallimenti e retry durante una scrittura". Implementare la barriera su Delta e cantare vittoria
significherebbe aver scoperto una feature di Delta. Dimostra che l'impalcatura funziona. Non
dimostra niente sull'idea.

**Iceberg è l'esperimento.** Committa scrivendo ottimisticamente nuovi metadati e scambiando
atomicamente il puntatore ai metadati della tabella, con rilevamento dei conflitti e retry. Non
ha un meccanismo equivalente di transazione applicativa. Il candidato per trasportare l'epoch è
una proprietà del summary dello snapshot, e se un check-then-commit si potesse ripiegare dentro
il retry loop in modo sicuro, usando solo quello che `iceberg-rust` espone, era l'incognita.

Poi la parte che consiglio a chiunque conduca un esperimento in cui è coinvolto
emotivamente. Scritte prima di qualsiasi riga di codice, nel README, quattro condizioni per
fermarsi:

1. Iceberg richiede un'architettura specifica per destinazione invece della stessa forma di
   implementazione `CommitSink` di Delta.
2. Iceberg richiede uno store transazionale esterno per rendere il check dell'epoch atomico con
   il commit.
3. `iceberg-rust` non riesce proprio a esprimere il commit richiesto, **e** il buco sta nella
   specifica invece che nella maturità dell'implementazione. (Un buco di implementazione è un
   risultato diverso: vuol dire "non ancora", non "no".)
4. Farlo funzionare richiede possedere più del valore di un trait del percorso di scrittura.

Il trait è deliberatamente la cosa più piccola che possa reggere la tesi — `committed_epoch`,
`commit`, e un conteggio di righe per i test. Se avesse dovuto farsi crescere un metodo
specifico per destinazione per far funzionare Iceberg, l'esperimento avrebbe già risposto alla
propria domanda.

![I percorsi di commit di Delta e iceberg-rust affiancati](/AndreaBozzo/blog/images/commit-barrier-delta-vs-iceberg.webp "Gli stessi quattro passi, due protocolli: Delta porta l'epoch dentro il commit, iceberg-rust scarta la base su cui è stato fatto il controllo")

## Tre scoperte fatte leggendo, prima di eseguire qualsiasi cosa

Leggere `iceberg` 0.10.1 prima di scrivere il sink è stata l'ora più redditizia del progetto.

**L'epoch ha un posto dove stare.** `FastAppendAction::set_snapshot_properties` mette chiavi
arbitrarie nel summary dello snapshot, e si rileggono da
`snapshot.summary().additional_properties`. Le chiavi metriche calcolate come `added-records`
vincono su quelle fornite dall'utente, quindi una chiave riservata non può essere corrotta da
un chiamante, e la mia chiave non è riservata.

**Il percorso di commit ha esattamente la forma giusta.** `Transaction::do_commit`
(`src/transaction/mod.rs:218`) ricarica la tabella dal catalogo, scarta una base stale,
riapplica le azioni sui metadati aggiornati e sottomette un `TableCommit` che porta dei
`TableRequirement` che il catalogo valida al momento dello scambio del puntatore.
`TableRequirement::RefSnapshotIdMatch` è un pin compare-and-swap. Refresh, ricontrollo, CAS: è
esattamente il loop di cui ha bisogno un commit idempotente, già scritto.

**E la porta per arrivarci è chiusa a chiave.** `TransactionAction` è `pub(crate)`
(`src/transaction/action.rs:37`). Quello che il modulo esporta è `ApplyTransactionAction` e
`ActionCommit` — abbastanza per applicare le azioni che il crate già definisce, non abbastanza
per definirne una. Nessuna terza parte può scrivere un'azione il cui `commit(&table)` giri
sulla tabella aggiornata dentro il loop.

Quella terza scoperta è tutto il post, e non l'avevo ancora capita.

## L'affermazione che ho sbagliato

Una versione precedente del mio stesso README diceva che `deltalake` e `iceberg` tenevano
`arrow` alla 56 contro la 59 di dataprof: tre major di scarto, un brutto argomento strutturale
contro tutta l'idea.

Era sbagliato, e l'errore era mio. Il 56 nel lockfile veniva da un pin `arrow = "56"` nel
`Cargo.toml` del *mio* crate, non da nessuna delle due librerie. Sia `iceberg` 0.10.1 sia
`deltalake-core` 0.32.4 richiedono `arrow-array` 58. dataprof è sulla 59.1.0. Lo scarto vero è
di un major, che è un normale martedì, non un ostacolo.

Lo includo perché l'argomento che stavo facendo non ne aveva bisogno. Un crate che scrive
tabelle Delta non sta nel workspace di dataprof, perché dataprof profila i dati e non li
sposta. Quello bastava già. L'affermazione sulle versioni era decorazione, e la decorazione è
esattamente il tipo di affermazione che poi si scopre falsa.

## Il test che passava per il motivo sbagliato

Ecco la parte che più mi piacerebbe venisse rubata da altri.

Tre test, un corpo generico ciascuno, parametrizzato sul sink: il replay di un epoch già
committato non scrive niente, epoch distinti si accumulano, scrittori concorrenti dello stesso
epoch committano una volta sola. Entrambi i sink passavano tutti e tre.

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

Verde. E la riga sulla concorrenza è una bugia.

Avevo scritto un quarto test il cui unico compito è diffidare del terzo: esegue la gara
quaranta volte e conta quante volte i due scrittori si contendono *davvero* la risorsa,
riportando il numero invece di asserirci sopra, perché uno scheduler ha il diritto di
serializzare.

```
iceberg race: 0/40 rounds hit a real optimistic conflict
```

Zero. Non "raramente": mai. Il catalogo in memoria in-process prende un mutex per ogni
operazione, quindi la *lettura* di chi perde è già ordinata dopo il commit di chi vince, e
ritorna `AlreadyCommitted` senza mai arrivare alla finestra in cui un duplicato potrebbe
nascere. Quaranta round di un test di concorrenza che non è mai stato concorrente.

Un test che non è mai stato nello stato che dice di testare non è una prova. È un quadratino
verde. Se avessi spedito sulla forza di quella riga, avrei spedito un generatore di duplicati
con un badge di CI che passa.

![Perché il test verde non dimostrava niente](/AndreaBozzo/blog/images/commit-barrier-false-pass.webp "A sinistra: quello che il test che passa faceva davvero, con un mutex del catalogo a serializzare entrambi gli scrittori. A destra: quello che il failpoint lo ha costretto a fare")

## Il failpoint, e la risposta

Se lo scheduling non arriva alla finestra, tieni la finestra aperta a mano. Un failpoint fra il
check dell'epoch e il commit:

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

Il check dell'epoch non è imponibile. Uno scrittore che controlla mentre l'epoch è libero, e
solo dopo perde la gara, committa un duplicato.

**Perché.** `do_commit` ricarica la tabella e ci ribasa sopra prima di applicare qualsiasi
azione — al primo tentativo come nei retry. I requirement che l'append emette derivano quindi
dalla base *aggiornata*, non dalla base che il chiamante aveva ispezionato. Il `fast_append`
dello scrittore stale viene ripuntato sullo snapshot del vincitore e riesce.

Avevo dato per scontato che il problema fosse il retry loop, quindi avevo già impostato
`commit.retry.num-retries = 0` e mi ero preso il loop in casa. Non serve. Toglie il retry; il
rebase non fa parte del retry. Il rebase è ciò che scarta la premessa del chiamante, e avviene
già in entrata.

Entrambe le vie d'uscita sono chiuse, e chiuse deliberatamente:

- `TransactionAction` è `pub(crate)`, quindi il check non può spostarsi dentro il loop, dove
  vedrebbe la tabella aggiornata.
- `TableCommit` è una struct pubblica il cui metodo di build del builder è `pub(crate)`
  (`#[builder(build_method(vis = "pub(crate)"))]`, `src/catalog/mod.rs:350`), quindi un
  chiamante non può costruirsi un commit che porti il proprio
  `TableRequirement::RefSnapshotIdMatch`. Il commento di documentazione è esplicito sul perché:
  "The builder is marked as private since it's dangerous and error-prone to construct
  `TableCommit` directly. Users are supposed to use `Transaction`."

`Catalog::update_table(TableCommit)` è pubblico. Niente, fuori dal crate, può costruirne
l'argomento.

## Questo non è un problema di Iceberg

Voglio essere preciso su dove va la colpa, perché la versione interessante di questa storia non
è "libreria brutta".

La specifica Iceberg va benissimo. Ha i requirement e lo scambio atomico del puntatore, che è
tutto quello che serve alla primitiva. Anche l'implementazione di riferimento va benissimo —
meglio che benissimo, ha esattamente l'hook giusto.
`SnapshotProducer.validate(TableMetadata currentMetadata, Snapshot snapshot)` è `protected` nel
core Java, `apply()` la chiama, e il commit loop chiama `apply()` a ogni tentativo di retry,
quindi un'operazione Java si rivalida sulla base aggiornata a ogni giro. `BaseRowDelta`,
`BaseRewriteFiles` e `StreamingDelete` ne fanno l'override. Quello è un punto di estensione di
prima classe per esattamente questa cosa.

`iceberg-rust` ha l'hook strutturalmente identico: `TransactionAction::commit(&Table)`,
invocato da `do_commit` sulla tabella aggiornata. L'unica differenza è che quello Java è
sottoclassabile e quello Rust è `pub(crate)`.

E la chiusura è difesa, che è la parte su cui vale la pena discutere invece che lamentarsi. Una
libreria che possiede il proprio retry loop non può distribuire precondizioni scelte dal
chiamante senza distribuire anche un footgun; il commento di documentazione di `TableCommit` lo
dice in parole povere. Possedere il retry loop e supportare precondizioni esterne sono in
tensione reale. Java l'ha risolta con `protected`: sicuro di default, raggiungibile per
sottoclasse. Rust non ha `protected`, quindi la stessa decisione di design arriva come una
scelta molto più netta, e la versione netta oggi arrotonda a "no".

C'è una terza possibilità che devo tenere aperta: che il rebase sia inteso come incondizionato
e che la garanzia che volevo non fosse mai stata offerta. In quel caso il fix è di
documentazione — dire che una `Transaction` non porta nessuna garanzia sulla base da cui è
stata costruita, così nessun altro ci costruisce sopra una precondizione.

## Il verdetto

Contro la mia stessa kill list, questo è **Kill 1**: allo stato attuale, Iceberg richiederebbe
un'architettura specifica per destinazione. È l'esenzione del Kill 3 in linea di principio — un
buco di implementazione, "non ancora" invece di "no" — ma l'esenzione paga solo se upstream
cambia, e finché non cambia l'astrazione è solo-Delta. Un commit barrier solo-Delta è una
feature di delta-rs. Escluderlo è esattamente quello per cui l'esperimento esisteva.

| Test | Delta | Iceberg |
| --- | --- | --- |
| Il replay di un epoch committato non scrive niente | pass | pass |
| Epoch distinti si accumulano | pass | pass |
| Scrittori concorrenti dello stesso epoch committano una volta | pass | pass, ma non ha mai gareggiato |
| Lo scrittore stale perde il CAS senza duplicare | non eseguito | **FAIL** |

L'ultima riga si merita il suo "non eseguito". Delta passa quel caso per costruzione — il suo
conflict checker rifiuta un secondo `txn` sullo stesso `(appId, version)`, e il sink converte
il rifiuto in `AlreadyCommitted` rileggendo — ma il failpoint l'ho scritto per Iceberg e il
gemello per Delta non l'ho mai costruito. È un argomento che viene dal protocollo, non una
misura, e non ho intenzione di spacciarlo per tale.

Il trait ha retto. Un solo `CommitSink`, un solo insieme di corpi di test, due implementazioni,
nessun metodo specifico per destinazione. Il design era solido; la garanzia sotto non era
disponibile sull'unico sink che poteva decidere la questione.

## Cosa ne faccio, e cosa non ne faccio

Ho ridotto l'esperimento a un crate che dipende solo da `iceberg`, `tokio` e `tempfile` —
niente Arrow, niente Parquet, nessun file di dati, perché il bug sta in come `Transaction`
sceglie la propria base, non in cosa scrive l'azione — e l'ho pubblicato come
[iceberg-stale-base-repro](https://github.com/AndreaBozzo/iceberg-stale-base-repro). Gira con
un comando:

```
B committed epoch 1
A commit result: Ok("Ok")
epochs recorded in the table: ["1", "1"]
```

L'issue è [apache/iceberg-rust#3134](https://github.com/apache/iceberg-rust/issues/3134),
aperta il 2 settembre 2026, con due direzioni concrete — esportare `TransactionAction`, oppure
permettere un `TableRequirement` fornito dal chiamante su una `Transaction` — e l'offerta di
scrivere io la PR per una delle due. Mentre pubblico questo è aperta e senza risposte. Non ho
intenzione di far finta che sia una collaborazione: è un messaggio in bottiglia con allegata una
riproduzione, che è il massimo che posso onestamente rivendicare.

Quello che *non* faccio è farla finire dentro dataprof. Non perché sia troppo ambiziosa: perché
dataprof profila i dati e non li sposta, e un crate che scrive tabelle Delta li sposta. La metà
quality dell'idea originale è tracciata dove le compete, come due issue aperte su dataprof:
[finding strutturati e prioritizzati sul report](https://github.com/AndreaBozzo/dataprof/issues/375)
e [una piccola API di quality gate batch](https://github.com/AndreaBozzo/dataprof/issues/376).
Aperte. Non spedite, non segretamente già fatte. Non perdono niente dal fatto che la metà
commit non esista, che è il segnale più chiaro che le due metà erano sempre state separabili e
che le avevo impacchettate insieme per entusiasmo.

Quindi: sono partito volendo che la qualità fosse una precondizione della durabilità, e sono
arrivato a scoprire che su uno dei due principali client lakehouse in Rust *niente* può essere
una precondizione della durabilità dall'esterno. Non la qualità: niente. Il problema generale
sta a monte del mio, ed è largo quattro righe di visibilità. Cambiare quelle quattro righe è un
pomeriggio. Decidere se vadano cambiate è il lavoro vero, e non tocca a me farlo.

Tutto lo spike sono nove commit in un giorno solo. Preferisco averlo scoperto in un giorno che
in sei mesi di framework.
