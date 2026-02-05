---
title: "Progettare un Data Profiler attorno ad Apache Arrow: Lezioni da dataprof"
date: 2026-02-05
draft: false
tags: ["Rust", "Python", "Apache Arrow", "DataFusion", "Parquet", "Columnar"]
categories: ["Data Engineering", "Open Source"]
description: "Come la scelta di Apache Arrow come modello di dati centrale ha trasformato un semplice data profiler in un piccolo motore analitico, e cosa mi ha insegnato sul design columnar."
summary: "Una storia di design di dataprof: perché ho costruito un profiler attorno ad Apache Arrow, come ha cambiato l'architettura, e come questo percorso mi ha portato a contribuire al lettore Parquet di arrow-rs."
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
    image: "images/dataprof-arrow.png"
    alt: "Profiling data attorno ad Apache Arrow"
    caption: "Dalle righe alle colonne: progettare dataprof attorno ad Apache Arrow"
    relative: false
    hidden: false
---

## Introduzione

*Come ho smesso di pensare al profiling come "pandas ma automatizzato", e ho iniziato a pensare in termini di batch Arrow e colonne.*

Quando ho iniziato a lavorare su [`dataprof`](https://github.com/AndreaBozzo/dataprof), pensavo di stare costruendo un data profiler abbastanza standard: scansionare una tabella, calcolare statistiche per colonna, emettere un rapporto. Sarebbe stato uno strumento CLI, con un'API Python, qualcosa che potessi comodamente inserire nelle pipeline dati.

Quel piano è durato solo alcuni giorni.

Molto rapidamente, Apache Arrow ha smesso di essere "solo il formato in-memoria" e è diventato il **centro del design** del progetto. Nel momento in cui mi sono impegnato con gli array Arrow e i `RecordBatch`, il profiler ha smesso di sembrare uno script glorificato e ha iniziato a comportarsi come un piccolo motore analitico: layout columnar, elaborazione orientata ai batch, SQL via DataFusion, Parquet ovunque.

In questo articolo voglio approfondire questo cambiamento. Cominceremo da quello che un profiler deve effettivamente fare (oltre agli HTML carini), poi guarderemo cosa cambia quando metti Arrow al centro, e infine vedremo come questo percorso mi ha spinto a contribuire a `arrow-rs`, specialmente attorno al lettore Parquet.

***

## Il Problema che un Data Profiler Risolve Veramente

Prima di parlare di formati e motori, aiuta a ricalibrare le aspettative. Il "profiling" può significare cose molto diverse a seconda di chi chiedi.

Dal lato dei notebook, il profiling spesso significa: puntare uno strumento a un DataFrame, ottenere un rapporto HTML ricco, scorrere distribuzioni e correlazioni, magari salvare un PDF. È interattivo, visuale, ed è fortemente legato a un unico runtime (solitamente pandas in Python).

Quello che avevo bisogno che dataprof facesse era diverso:

- Eseguirsi come una **CLI in CI/CD** o nelle pipeline dati.
- Gestire **tabelle larghe e dataset di grandi dimensioni**, non solo i 100 MB che puoi comodamente tenere in RAM.
- Produrre **output interpretabili da macchine**, non solo rapporti orientati all'uomo.
- Integrarsi con entrambi gli ecosistemi **Rust** e **Python** senza insegnare a ciascuno un nuovo formato personalizzato.

In altre parole, volevo qualcosa più simile a un **componente di sistema** che a uno strumento di notebook. E quel requisito pone immediatamente una domanda: se il profiling deve stare nel mezzo di seri flussi dati, quale è la giusta rappresentazione interna in modo che non mi penta della mia scelta tre mesi dopo?

***

## Scegliere Apache Arrow come Astrazione Centrale

A quel punto, avrei potuto fare la cosa ovvia: operare su righe in memoria (struct, record) e convertire solo a quello che il chiamante ha bisogno ai bordi.

Invece, ho scelto di mettere Apache Arrow proprio al centro.

Arrow è un **formato columnar in-memoria** progettato per carichi di lavoro analitici e interoperabilità zero-copy tra linguaggi. Una volta che i tuoi dati sono negli array Arrow e nei `RecordBatch`, puoi alimentarli in codice Rust, librerie Python, motori SQL come DataFusion, e formati come Parquet o IPC senza uno zoo di conversioni ad-hoc.

Quella sola decisione ha avuto alcune conseguenze immediate:

- Ho smesso di pensare in termini di "righe che provengono da un file", e ho iniziato a pensare in termini di **batch di colonne** che scorrono attraverso il profiler.
- I tipi in Arrow (`Int64Array`, `Float64Array`, `StringArray`, e compagni) sono diventati il **contratto** tra componenti piuttosto che un dettaglio di implementazione.
- L'interoperabilità con Python e Rust ha smesso di essere un'aggiunta successiva e è diventata un obiettivo di prima classe: se mantengo tutto in Arrow, posso condividere la memoria invece di copiarla.

In pratica, Arrow si è rivelato essere non un piccolo dettaglio di implementazione, ma un vincolo che ha plasmato tutto il resto.

### Da "file" a `RecordBatch`

Uno dei cambiamenti più importanti è stato il passaggio da "leggi un file" a "scorrere `RecordBatch`".

Un profiler basato su righe classico potrebbe leggere righe da un file CSV, analizzarle in qualche struct, e aggiornare contatori mentre procede. Con Arrow, volevo operare su **chunk di colonne** invece:

![Row-Oriented vs Columnar Processing](/images/columnarbatchprocessingflow.png "Confronto tra approcci di elaborazione orientati alle righe e columnar")

- Il lettore Parquet o CSV produce `RecordBatch` di N righe.
- Ogni batch contiene un insieme di array Arrow, uno per colonna.
- Tutte le metriche in dataprof sono definite come **operazioni su questi array**, non su struct di righe arbitrarie.

Questo può sembrare un cambiamento sottile, ma trasforma la forma del tuo codice. Invece di "per ogni riga, ispeziona tutte le colonne", pensi "per ogni chunk di colonna, calcola le statistiche in modo vettorizzato".

Rende anche il comportamento delle prestazioni più facile da ragionare: gli array Arrow sono densamente imballati, spesso compatibili con SIMD, e si allineano bene con le cache della CPU.

### Perché Arrow invece di un formato personalizzato?

Avrei potuto progettare i miei struct columnar personalizzati e la serializzazione. Ma Arrow offre alcune cose che non volevo reinventare:

- Un **layout di memoria** ben definito e indipendente dal linguaggio.
- Un'**implementazione Rust** (`arrow-rs`) con supporto per lettori/scrittori per CSV, Parquet, IPC.
- Una **storia Python** (pyarrow, integrazione pandas) che funziona già in molti ecosistemi.
- Un **motore di query** (DataFusion) che parla Arrow nativamente.

Per un profiler che aspira a stare in mezzo ai flussi dati, questi non sono vantaggi minori. Sono la differenza tra "questo è il mio strumento" e "questo può diventare un pezzo di una piattaforma più grande".

***

## Note di Design da dataprof: Tutto È una Colonna

Una volta che Arrow è nel mezzo, inizi a scoprire quali idee sopravvivono e quali no. dataprof mi ha costretto a cristallizzare alcuni principi di design.

![dataprof Architecture](/images/dataprofhiglevelarchitecture.png "Architettura di alto livello di dataprof con Arrow al centro")

### 1. Ogni metrica è un'operazione di colonna

Il profiling spesso si riduce a rispondere a domande come:

- Quanti null ha questa colonna?
- Quanti valori distinti?
- Qual è la distribuzione (istogramma, quantili)?
- Come si comporta questa colonna tra partizioni o tabelle?

In dataprof, tutti questi sono implementati come operazioni su array Arrow:

- I conteggi null diventano semplici ispezioni della **bitmap** e della lunghezza dell'array.
- I conteggi distinti usano strutture basate su hash sui valori dell'array.
- Gli istogrammi e i quantili sono derivati dai valori di colonna in forma batch.

Il punto chiave è che l'**unità naturale di lavoro è la colonna**, non la riga. Questo combacia con il design di Arrow e rende possibile vettorizzare le operazioni, riutilizzare il codice tra backend, e ragionare sull'uso della memoria per colonna.

Inoltre, ti forza a prendere seriamente i tipi Arrow. A un certo punto, smetti di pensare "colonna di stringhe" e inizi a pensare "array di stringhe con valori potenzialmente grandi con codifica offset". La logica del tuo profiler deve rispettare quelle semantiche piuttosto che appiattire tutto in stringhe generiche.

### 2. DataFusion come futuro livello SQL

Uno degli aspetti affascinanti della progettazione attorno ad Arrow è che ottieni quasi gratuitamente un motore SQL—almeno in teoria.

[`DataFusion`](https://github.com/apache/datafusion) è un motore di query nativo di Rust che usa Apache Arrow come modello di dati principale. Se il tuo profiler rappresenta già i risultati come Arrow `RecordBatch`, alimentarli in DataFusion diventa semplice.

Questa è una direzione che sto esplorando per dataprof:

- Materializzare i risultati del profiling come batch Arrow.
- Registrarli come tabelle in un contesto DataFusion.
- Permettere agli utenti di scrivere SQL per affettare e dividere i risultati.

L'architettura già supporta questo—le rappresentazioni interne di dataprof sono native di Arrow. L'interfaccia di query non è completamente sviluppata ancora, ma quando lo sarà, Arrow è quello che la farà funzionare con basso attrito: nessun disadattamento di impedenza, nessun adattatore personalizzato.

### 3. Tabelle larghe, molti gruppi, e Parquet che fa il lavoro pesante

Non tutte le tabelle sono amichevoli. Alcune sono molto larghe (centinaia di colonne), altre richiedono il profiling per tenant, per partizione, o per altri raggruppamenti.

Questi sono i casi in cui le implementazioni ingenue crollano:

- Esaurisci la memoria caricando troppe colonne alla volta.
- Vieni ucciso da pattern di accesso casuale.
- Reimplemeti ottimizzazioni che il lettore Parquet già conosce come fare.

Arrow e Parquet ti danno un diverso insieme di strumenti:

- **Late materialization**: decodifica solo le colonne di cui hai bisogno.
- **Page pruning**: lascia che il lettore salti interi chunk in base alle statistiche.
- **Batch size tuning**: scegli una dimensione di batch che bilancia il throughput e la memoria per il tuo ambiente.

In dataprof, ho dovuto riconsiderare alcuni presupposti:

- Invece di "leggi sempre tutto e calcola tutto", ho iniziato a strutturare il profiler come un insieme di passaggi che possono **selettivamente** toccare le colonne.
- Mi sono affidato al lettore Parquet per minimizzare le letture non necessarie, invece di scrivere il mio strato di indicizzazione.

Quella esperienza si è riversata nello stesso arrow-rs.

***

## Dal Codice alla Comunità: Contribuire a arrow-rs

Lavorare su dataprof mi ha spinto più profondamente nell'implementazione Arrow di Rust di quanto mi aspettassi. In particolare, ho raggiunto i limiti della mia comprensione attorno al lettore Parquet.

A un certo punto, l'unica mossa ragionevole era **aggiustare le cose upstream**.

### PR #9116 – Preservare la codifica del dizionario nelle letture Parquet

Uno scenario ricorrente nel profiling è i dati categorici: colonne con molti valori ripetuti e cardinalità relativamente bassa. Parquet tipicamente memorizza questi con **dictionary encoding** per risparmiare spazio e I/O.

Tuttavia, in pratica, era facile finire con esempi o path di codice che decodificavano avidamente i dizionari in array semplici, perdendo quei vantaggi. Per i dataset con enormi colonne categoriche, questo può essere sia dispendioso che più lento.

In [PR #9116](https://github.com/apache/arrow-rs/pull/9116), ho aggiunto un nuovo esempio a `ArrowReaderOptions::with_schema` che dimostra come preservare la dictionary encoding quando si leggono colonne di stringhe Parquet. La documentazione esistente mostrava la mappatura dello schema ma non copriva il caso comune di mantenere i dizionari intatti.

Questo importa per strumenti come dataprof perché:

- Mantenere la dictionary encoding può drasticamente ridurre l'**impronta di memoria** quando si profilano tabelle larghe e pesanti di dati categorici.
- Mantiene il profiling più vicino alla "realtà su disco" dei dati, il che è utile quando si ragiona su layout e prestazioni.

Quello che è iniziato come "perché questa lettura è così pesante?" si è trasformato in un contributo che aiuta chiunque usi arrow-rs per carichi di lavoro Parquet, non solo il mio progetto.

### PR #9163 – Rendere gli esempi del lettore Parquet più autocontenuti

Il secondo contributo è venuto da un angolo più umano: **molti utenti (compreso me) stavano lottando con il modo "giusto" di usare il lettore Parquet**.

I bisogni del mondo reale spesso assomigliano a:

- Leggere solo un sottoinsieme di colonne.
- Gestire schemi abbastanza complessi senza implementare manualmente troppi plumbing.
- Capire quali manopole girare quando si sintonizzano le prestazioni.

In [PR #9163](https://github.com/apache/arrow-rs/pull/9163), ho aggiornato tre esempi di documentazione nel lettore Parquet per usare buffer in memoria invece di file temporanei. Questo rende gli esempi più autocontenuti e più facili da seguire nella documentazione renderizzata—un piccolo polish, ma il tipo che aiuta i principianti a eseguire effettivamente il codice.

Ancora una volta, l'origine era molto locale ("voglio solo che dataprof legga Parquet in modo sensato"), ma il risultato è più generale: i documenti adesso rendono più facile adottare il lettore Parquet per carichi di lavoro seri, includendo i tool di profiling.

Entrambi i PR hanno rafforzato una lezione che ho imparato per la prima volta nell'ecosistema Tokio: **se costruisci attorno a una libreria potente, a un certo punto i tuoi problemi diventano indistinguibili dai gap di documentazione di quella libreria**. Aggiustare quei gap upstream è sia egoistico che generoso.

***

## Ponti Più Corti: Rust ↔ Python Quando Tutto Parla Arrow

Uno degli obiettivi per dataprof era essere bilingue: un **crate Rust**, una **CLI**, e un **pacchetto Python** che puoi installare da PyPI.

Scegliere Arrow come modello di dati condiviso ha semplificato quella storia enormemente:

- Il core Rust usa array Arrow e `RecordBatch` come i suoi tipi primari.
- La CLI opera su input nativi di Arrow (ad es. Parquet) e emette output friendly per Arrow (ad es. Parquet/IPC).
- Il pacchetto Python può esporre i risultati come tabelle pyarrow o DataFrame pandas con copia minima.

Questo significa che non ho bisogno di un formato di serializzazione personalizzato tra Rust e Python. Il confine è "solo" Arrow.

Questo è molto diverso dall'approccio ingenuo di serializzare tutto in JSON, CSV, o alcuni blob binari personalizzati. Questi possono funzionare per script piccoli, ma non scalano bene in complessità o interoperabilità.

In pratica, Arrow mi ha dato:

- Un **contratto comune** tra linguaggi.
- Un modo di aggiungere nuovi front-end (ad es. un servizio che espone Arrow Flight o un'API HTTP che restituisce Arrow) senza riprogettare tutto.
- La libertà di spingere più logica giù in Rust mantenendo comunque piacevole il consumo da Python.

***

## Quando Mettere Arrow al Centro (e Quando Non Farlo)

Dopo aver passato tempo immerso in Arrow con dataprof e aver contribuito a arrow-rs, ho un senso più concreto di quando questo approccio ha senso.

### Arrow al centro ha senso se…

- Hai a che fare con **dataset medi o grandi** regolarmente, non solo una volta ogni tanto.
- Hai bisogno di servire sia **Rust** che **Python** (o altri linguaggi) senza costantemente reinventare l'interop.
- Il tuo strumento assomiglia sospettosamente a un **mini motore analitico**: calcoli aggregati, filtra, raggruppa, e vuoi riutilizzare quella logica in altri contesti.
- Ci si aspetta di interagire con altri sistemi basati su Arrow: DataFusion, altri motori di query, componenti del data lake.

In quel mondo, il costo iniziale di imparare Arrow e il suo ecosistema si ripaga rapidamente.

### …e quando è probabilmente eccessivo

D'altra parte, ci penserei due volte prima di centrare tutto su Arrow se:

- Stai scrivendo **script monouso** o piccoli tool dove la complessità principale è la logica di business, non il volume di dati.
- Il tuo team vive interamente nei **notebook Python** e non ha appetito per i toolchain Rust o i modelli mentali columnar.
- I tuoi dataset sono abbastanza piccoli che il collo di bottiglia è il tuo tempo di riflessione, non I/O o memoria.

Arrow è un'astrazione potente, ma impone anche un modo di pensare. Se tutto ciò di cui hai bisogno è un veloce script "questo CSV è corrotto?", un paio di chiamate pandas potrebbero essere più che sufficienti.

***

## Pensieri di Chiusura: Una Volta che Diventi Columnar…

Ho iniziato dataprof pensando in termini di "un profiler che usa Arrow per caso". Ad un certo punto, si è silenziosamente trasformato in "uno strumento columnar che per caso fa profiling".

Mettere Apache Arrow al centro ha cambiato come:

- Modello le metriche (colonne per prime).
- Penso alle prestazioni (batch, dictionary encoding, pagine Parquet).
- Struttura il progetto (Arrow nel core, DataFusion come futuro livello query, tipi condivisi tra Rust e Python).

Ha anche cambiato la mia relazione con l'ecosistema. Nel momento in cui ho raggiunto i limiti del lettore Parquet, la mossa naturale non era fare un hack intorno ad esso per sempre, ma aprire PR a arrow-rs per migliorare documenti ed esempi.

Una volta che inizi a pensare in questo modo, diventa molto difficile tornare a un mondo dove ogni strumento inventa il suo formato in-memoria e il suo protocollo di filo. Il design columnar smette di essere un trucco di prestazione e diventa una **filosofia di design**.

dataprof è ancora un progetto relativamente piccolo, ma trae già beneficio dalla posizione su spalle di Arrow. E se c'è una meta-lezione in tutto questo, è probabilmente questa:

> Per alcune classi di strumenti, scegliere l'astrazione giusta presto importa più di qualsiasi singola ottimizzazione che farai mai.

Arrow, per dataprof, era quella astrazione.

---
