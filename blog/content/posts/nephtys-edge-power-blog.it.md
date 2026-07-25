---
title: "Nephtys su un Raspberry Pi: 6.6× meno memoria, esattamente gli stessi watt"
date: 2026-07-25T12:00:00+02:00
draft: false
tags: ["Edge Computing", "Go", "NATS", "Raspberry Pi", "Streaming", "Benchmarking", "Open Source"]
categories: ["Data Engineering", "Embedded", "Open Source"]
keywords: ["Nephtys", "edge computing", "Raspberry Pi 5", "Node-RED", "NATS JetStream", "misura di potenza", "efficienza energetica", "Go", "benchmarking"]
description: "Un revisore ha chiesto se il mio connettore edge girasse davvero su hardware edge. Gira, usando 6.59× meno memoria di Node-RED — e assorbendo esattamente la stessa potenza. Perché la seconda metà di questa frase è quella utile."
summary: "Non avevo mai scritto pubblicamente di Nephtys, e la prima cosa che devo riportare su hardware reale è un risultato nullo: il vantaggio di memoria si è riprodotto su un Raspberry Pi 5, il vantaggio energetico non è mai esistito."
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
    image: "images/nephtys-cover.png"
    alt: "Nephtys su un Raspberry Pi 5: 19.51 MB contro 128.47 MB, 3.610 W contro 3.584 W"
    caption: "Il vantaggio di footprint era reale. Quello energetico non è mai esistito."
    relative: false
    hidden: false
---

Sviluppo [Nephtys](https://github.com/AndreaBozzo/Nephtys) da mesi e non ne ho mai scritto
una parola qui. Questo è quell'articolo, e apre con la cosa meno lusinghiera che so sul
progetto.

Un short paper su Nephtys è stato sottoposto a revisione tra pari e accettato a IEEE UIC
2026. Un revisore ha fatto un'osservazione su cui non potevo obiettare: il paper descriveva
un connettore *progettato per il deployment edge*, e ogni numero al suo interno veniva da un
laptop. Nulla era mai stato misurato su hardware edge.

Così ho comprato un Raspberry Pi 5 e una presa smart, e ho eseguito il confronto come si
deve.

Il risultato sulla memoria si è riprodotto, anzi è migliorato: 19.51 MB contro i 128.47 MB
di Node-RED, un fattore 6.59×, con output identico byte per byte. Il risultato energetico è
quello interessante. Non c'è. Sulla stessa board, con lo stesso workload, i due sistemi
hanno assorbito la stessa potenza — e se proprio si vuole un segno, Nephtys ne ha assorbita
lo 0.7 % *in più*.

![Nephtys on a Raspberry Pi 5](/AndreaBozzo/blog/images/nephtys-cover.png "19.51 MB against 128.47 MB, 3.610 W against 3.584 W")

Quel risultato nullo per me vale più del numero sulla memoria, perché il numero sulla
memoria è quello in cui già credevo.

## Cos'è Nephtys

È anche, per la cronaca, il mio primo progetto Go serio. L'ho iniziato per imparare
davvero il linguaggio su qualcosa che volevo esistesse, e non avrei previsto nulla di quel
che segue — revisione tra pari, un misuratore da parete, o un risultato che mi contraddice.

Nephtys è un singolo binario Go che ingerisce stream real-time e pubblica eventi
normalizzati su [NATS JetStream](https://nats.io). Parla WebSocket, SSE, REST polling,
webhook in ingresso e gRPC. I connettori WebSocket e SSE si riconnettono da soli con
backoff esponenziale; il REST polling riprova al tick successivo; quelli in ingresso
delegano il retry a chi li chiama, perché accettano connessioni invece di aprirle.

Tra una sorgente e il broker sta una **middleware pipeline** per stream — filter,
transform, dedup, threshold, batch — configurata come JSON allegato alla registrazione
dello stream. Il senso della pipeline è buttare via lavoro il prima possibile, sul gateway,
così che il link vincolato a monte trasporti meno.

Non c'è un database. JetStream tiene gli eventi *e* la configurazione degli stream, in un
bucket key-value, così un restart recupera i suoi connettori senza altre dipendenze
stateful. Le pipeline si possono sostituire a runtime con un `PUT`, dietro un
`atomic.Pointer`, quindi lo swap è lock-free e la connessione alla sorgente non cade mai.

![Nephtys architecture](/AndreaBozzo/blog/images/nephtys-architecture.png "Sources, per-stream middleware pipeline, JetStream for both events and configuration")

Tutto l'esperimento è una registrazione:

```json {linenos=false}
{
  "id": "compare-nephtys",
  "kind": "websocket",
  "url": "ws://host:9091/ws",
  "topic": "nephtys.stream.compare.nephtys",
  "pipeline": {
    "transform": {"mapping": {"station": "station_id", "pm25": "pm25"}},
    "dedup": {"enabled": true, "cache_size": 500, "ttl": "30s"},
    "threshold": {"enabled": true, "path": "pm25", "delta": 1.0},
    "batch": {"enabled": true, "max_batch_size": 50, "flush_interval": "5s"}
  }
}
```

## La tesi che stavo davvero testando

Sul mio laptop, contro un flow Node-RED equivalente costruito con nodi core, Nephtys usava
19.14 ± 0.07 MB di memoria residente contro i 109.60 ± 0.40 MB di Node-RED, e i due
producevano output identico su input identico.

Chiunque legga quel dato — me compreso, per un po' — completa la frase allo stesso modo:
*quindi consumerà meno energia su una board piccola*. Quell'inferenza fa un lavoro che
nessuno le ha pagato. Un footprint è una proprietà statica; la potenza è un rate. L'una
implica l'altra solo se l'occupazione di memoria è ciò su cui l'hardware sta spendendo la
sua energia. Su un Raspberry Pi a un event rate modesto, non lo è affatto.

Quel completamento è l'ipotesi che questo esperimento esiste per testare, ed è stata
falsificata.

## Costruire un confronto che potesse fallire

La tentazione, con un progetto proprio, è costruire un benchmark che vinca. La difesa è
decidere le condizioni di invalidazione prima di guardare qualsiasi numero.

L'equivalenza viene prima, perché un confronto di prestazioni tra due sistemi che fanno
*lavoro diverso* è privo di senso per quanto accuratamente si misuri. Entrambi i sistemi
ricevono la stessa sequenza deterministica di 12.000 eventi da un simulatore con seed
fisso. Un subscriber NATS neutrale consuma i due output, normalizza gli envelope, e calcola
l'hash della sequenza di eventi trattenuti in modo indipendente dai timestamp. Se i due
hash differiscono, il run si butta — senza eccezioni e senza interpretazioni.

![The benchmark rig](/AndreaBozzo/blog/images/nephtys-pi-rig.jpg "The actual rig: Pi 5, USB SSD, wired Ethernet, and the protocol document open on the laptop driving it")

Poi le regole operative. Tre trial per sistema, **interlacciati** invece che consecutivi,
così che la deriva termica e il rumore di fondo non possano ricadere interamente su un solo
sistema. Potenza misurata alla presa di rete, così che le perdite di conversione
dell'alimentatore ufficiale stiano dentro il numero e nessuna baseline di idle venga
sottratta di nascosto. Il misuratore interrogato dal laptop che orchestra e mai dal Pi,
perché campionare il dispositivo sotto test aggiunge carico alla cosa che stai misurando.

E cinque gate, ognuno dei quali da solo invalida uno slot: esattamente 12.000 eventi,
esattamente un client WebSocket, nessun campione di throttling, un delta di energia alla
presa positivo, e hash di sequenza coincidenti.

![Measurement topology and validity gates](/AndreaBozzo/blog/images/nephtys-measurement-rig.png "Five gates; any one of them invalidates a slot")

Tutti e sei gli slot sono passati al primo tentativo. Il SoC non è mai andato in throttling
— `throttled=0x0` su tutti i 1.316 campioni, 45–51 °C con il cooler attivo. Il throughput
ottenuto è stato tra 40.01 e 40.04 eventi al secondo, che è il carico previsto, non un test
di saturazione.

## Tre modi in cui la misura mi ha mentito

Questa è la parte che avrei voluto leggere prima di iniziare.

**Il misuratore accumula energia a blocchi.** La presa Shelly espone un registro di energia
cumulata, che è la cosa ovvia da leggere. Non cresce in modo continuo. Avanza a scatti
discreti di 0.206 Wh — ne ho contati undici nell'arco della sessione — che a ~3.6 W sono
circa tre minuti e mezzo di energia che arrivano tutti insieme. Uno slot di misura di
cinque minuti accumula in tutto circa 0.31 Wh. Quindi un delta di registro per slot è
quantizzato a circa due terzi della quantità che si sta misurando, e a seconda di dove
cadono i confini può legittimamente leggere 0.000 Wh su un run perfettamente valido.

L'app del produttore lo mostra chiaramente. Questo è il contatore di energia del misuratore
nell'arco di un giorno: piatto, poi uno scalino, poi un salto, poi un plateau. Niente nel
carico assomigliava a questo.

![The Shelly app showing blocky energy accumulation](/AndreaBozzo/blog/images/nephtys-meter-quantisation.jpg "The meter's own app: a cumulative energy counter that arrives in steps rather than continuously. Not the benchmark window — this is the instrument's general behaviour.")

Così ho smesso di leggere il registro e ho integrato sull'host la lettura di potenza
istantanea del misuratore, circa ogni 1.4 secondi, tenendo il registro come controprova su
finestra lunga. Sull'intera sessione il registro è avanzato di 2.273 Wh contro 2.1165 Wh
integrati — un accordo entro uno dei suoi stessi blocchi da 0.206 Wh, cioè il meglio a cui
possa accordarsi.

**Un locale si è mangiato i millisecondi.** Il sampler portava il timestamp del campione
precedente tra invocazioni come stringa ISO-8601. `ConvertFrom-Json` di PowerShell
reidrata premurosamente quella stringa in un `[datetime]`, e riconvertirlo in stringa per
il parsing lo rende nel formato breve `it-IT` di questa macchina — che non ha componente
sotto il secondo. Ogni intervallo guadagnava silenziosamente la frazione scartata, circa
mezzo secondo su campioni da 1.4 secondi. Gli intervalli sommavano a 931 secondi su una
finestra che in realtà è durata 716. L'energia integrata risultava circa il 30 % più alta.

Nulla nei numeri risultanti sembrava sbagliato. Erano plausibili, coerenti con se stessi, e
gonfiati. Ciò che l'ha scoperto è un'aritmetica che doveva tornare e non tornava: 0.4231 Wh
in 306 secondi implicano 4.97 W, mentre i campioni di potenza sulla stessa finestra
mediavano 3.687 W. Sono due percorsi verso la stessa quantità, e divergevano esattamente
della quantità introdotta dal bug.

> La lezione non è "attenzione ai bug di locale". È che ogni numero di testata ha bisogno di
> un secondo percorso indipendente per arrivarci, altrimenti pubblicherai qualunque cosa
> produca il primo.

Il tempo ora viaggia come tick interi, che attraversano JSON esattamente. Dopo la correzione
i due percorsi concordano allo 0.07 %.

**Una chiamata `ssh` si è piantata dopo aver finito.** L'orchestratore campiona il Pi via
SSH una volta per intervallo. `ssh.exe` di Windows senza `-n` inoltra lo stdin ereditato al
comando remoto; quando l'orchestratore gira staccato con l'output rediretto, quell'handle
non raggiunge mai EOF, e ssh può bloccarsi indefinitamente *dopo* che il comando remoto è
già uscito. Ha bloccato uno slot per undici minuti. Se fosse successo dentro il loop di
campionamento invece che tra slot, avrebbe corrotto silenziosamente un run invece di
ritardarne uno.

Ho buttato il run parziale coinvolto e rieseguito l'intero benchmark da zero. È la mossa
noiosa, costosa e corretta, ed è il motivo per cui mi fido di quel che segue.

## Il risultato

Tre trial validi per sistema, media ± deviazione standard campionaria:

- **Memoria residente, solo connettore** — 19.51 ± 0.07 MB contro 128.47 ± 0.44 MB. Un fattore 6.59×.
- **Connettore più NATS** — 38.85 ± 0.10 MB contro 147.07 ± 0.48 MB. 3.79×.
- **CPU**, dove 100 % è un core — 0.32 ± 0.00 % contro 0.72 ± 0.01 %.
- **Latenza p95** — 2009 ± 1 ms contro 2013 ± 1 ms. Entrambe dominate dalla politica di batching.
- **Potenza alla presa, board intera** — 3.610 ± 0.005 W contro 3.584 ± 0.014 W.
- **Energia per evento** — 92.2 ± 0.3 mJ contro 91.5 ± 0.4 mJ.

L'output è stato identico in ogni slot: 12.000 eventi in ingresso, 7.733 sopravvissuti a
dedup e threshold, compattati in 155 batch — 67.30 % di byte in meno e 98.71 % di messaggi
in meno, per entrambi i sistemi, su entrambe le piattaforme. Tutti e sei gli slot hanno
prodotto un unico hash di sequenza. Le pipeline sono equivalenti tra architetture, non
soltanto simili.

![The gap that did not transfer](/AndreaBozzo/blog/images/nephtys-pi-results.png "Two zero-based panels: a 6.59× memory gap beside a power difference that is not there")

Il divario di memoria si è anzi allargato su ARM64. Lì Node-RED costa il 17.2 % di memoria
residente in più che su x86-64; Nephtys è praticamente invariato, a +1.9 %.

E la potenza è piatta. Nephtys ha misurato 0.025 W in più — 0.7 %, segno opposto al
risultato sulla memoria, e sotto un passo di quantizzazione della lettura di potenza del
misuratore stesso. Non ho intenzione di travestirlo da vittoria in nessuna delle due
direzioni. È un risultato nullo.

Il motivo non è sottile, una volta che lo si cerca. La board assorbe circa 3.0 W stando lì
a fare niente; uno sweep esplorativo precedente metteva il solo OS a 3.096 W, e aggiungere
NATS e Nephtys in idle lo cambiava di 3 mW. A 40 eventi al secondo, il lavoro che i due
strumenti svolgono è un errore di arrotondamento sopra un costo hardware fisso. Lo stesso
sweep trovava il costo marginale di un evento scendere da 64 mJ a 10 eventi/s a 1.3 mJ a
1000 eventi/s — il termine di processing diventa visibile solo molto sopra il carico di
questo paper.

## A che serve allora il footprint?

Se non è potenza, è capacità — e su questa classe di hardware non è un premio di
consolazione.

Il Pi ha 4 GB. La differenza tra un connettore residente in 19 MB e uno residente in 128 MB
è la differenza tra un gateway di ingestione che lascia la board libera per qualcos'altro —
un modello di inferenza locale, un buffer abbastanza profondo per attraversare
un'interruzione lunga dell'uplink, un secondo e un terzo stream — e uno che ha già speso una
quota visibile della macchina per il fatto di esserci. Lo 0.72 % di un core contro lo 0.32 %
dice qualcosa di simile sul margine termico e di scheduling.

Questa è una affermazione ingegneristica reale, è supportata dalla misura, ed è più
circoscritta di quella che avrei fatto se non avessi mai attaccato il misuratore.

## Cosa direi a me stesso prima di iniziare

**Misura ciò che affermi, non ciò che è facile misurare.** La memoria residente è
banalmente osservabile e l'avevo gratis. La potenza alla presa ha richiesto di comprare
hardware, ed è il numero che davvero riguarda "adatto al deployment edge".

**Un footprint non è un dato energetico.** Sono grandezze fisiche diverse e il ponte tra
loro è un'assunzione su dove stia andando l'energia. Su un dispositivo con un floor da 3 W
e un carico leggero, quell'assunzione è semplicemente falsa.

**Dai a ogni numero di testata due percorsi indipendenti.** Entrambi i bug che contavano
sono stati scoperti da un disaccordo tra due modi di calcolare la stessa cosa, non da
un'ispezione. Una singola pipeline che si comporta apparentemente bene ti consegnerà una
risposta sbagliata con totale sicurezza.

**Pubblica le deviazioni.** Il mio run ha usato un'immagine OS desktop invece della Lite, un
SSD USB invece di una microSD, un misuratore consumer non calibrato, e un link Wi-Fi sul
laptop che orchestrava. Nulla di questo cambia il confronto, perché è tutto comune ai due
sistemi nella stessa sessione interlacciata — ma un lettore ha diritto di deciderlo da sé,
quindi la directory dei risultati lo dichiara per intero.

**Un revisore che chiede prove che non hai ti sta facendo un favore.** La risposta onesta ha
indebolito una tesi che mi piaceva e prodotto un paper più nitido. Preferisco scoprirlo da
un revisore che da qualcuno che l'ha messo in produzione.

A proposito: grazie ai revisori anonimi, la cui insistenza sull'hardware reale è l'unico
motivo per cui questo articolo contiene una misura invece di un'assunzione, e al
Prof. Fortino dell'Università della Calabria, che ha gestito la revisione del paper. Le
conclusioni qui, compresa quella scomoda, sono soltanto mie.
<!-- Surname only on purpose: first name unconfirmed (Giancarlo vs Gianluca). Add it once verified. -->

## Dove sta il lavoro

Nephtys è su [AndreaBozzo/Nephtys](https://github.com/AndreaBozzo/Nephtys). Il protocollo di
benchmark, l'orchestratore, i campioni grezzi al secondo, i log per slot, le deviazioni
registrate e il verbale dei gate stanno nel repository companion
[AndreaBozzo/uic2026-nephtys](https://github.com/AndreaBozzo/uic2026-nephtys), sotto
`demo/comparison/results/pi-20260725T075732Z/`. L'aritmetica del summary lì è stata
ricalcolata in modo indipendente dai contatori grezzi; tutte e 24 le metriche coincidono.

L'esperimento successivo ovvio è quello che questo run non può fare: uno sweep sull'event
rate sulla board, per trovare dove il termine di processing supera finalmente il floor di
idle. Da qualche parte sopra i 40 eventi al secondo le due curve devono separarsi. Non so
dove, e non ho intenzione di indovinare in pubblico — è tutto il punto delle ultime tre
settimane.
