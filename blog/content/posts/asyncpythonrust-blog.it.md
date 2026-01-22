---
title: "Async in Python e Rust: Due Mondi, Una Sola Keyword"
date: 2026-01-25T12:00:00+01:00
draft: false
tags: ["Rust", "Python", "Async", "Tokio", "asyncio", "Concurrency", "Performance"]
categories: ["Software Engineering", "Open Source"]
description: "Perché async/await sembra uguale in Python e Rust ma nasconde filosofie radicalmente diverse: dal runtime generoso di asyncio alle state machine zero-cost di Tokio"
summary: "Un'esplorazione tecnica di async/await in Python e Rust: come la stessa sintassi nasconda modelli di esecuzione completamente diversi, con esempi pratici da contributi a Tokio e progetti Python."
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
    image: "images/asyncpython&rust.png"
    alt: "Async in Python e Rust"
    caption: "Due approcci all'asincrono: runtime generoso vs state machine zero-cost"
    relative: false
    hidden: false
---

## Introduzione

*Perché `async/await` sembra uguale in entrambi i linguaggi, ma nasconde filosofie radicalmente diverse*

Negli ultimi anni `async/await` è diventato onnipresente: lo usiamo in Python con `asyncio`, lo troviamo in JavaScript, lo vediamo comparire nei framework HTTP, nei client per database, nei wrapper per le API. Quando però si passa a Rust e a Tokio, molti sviluppatori hanno una sensazione strana: la sintassi sembra familiare, ma il modo in cui bisogna pensare al codice asincrono è radicalmente diverso.

In questo articolo proverò a fare ordine: partiremo dal problema che l'asincrono risolve davvero, poi metteremo a confronto il modello di Python e quello di Rust, usando Tokio come lente per capire cosa significa avere un runtime "a costo zero" ma guidato dal compilatore. Concluderemo con alcune linee guida pratiche — e con qualche storia dal campo tratta da PR recenti su Tokio e su progetti Python.

Questa non è stata solo un'esplorazione teorica. Come vedrete più avanti, ho avuto l'opportunità di contribuire sia a Tokio che a progetti Python dell'ecosistema GenAI, un'esperienza che ha approfondito la mia comprensione delle differenze tra i due modelli asincroni.

***

## Il problema che l'asincrono risolve davvero

Prima di entrare nei dettagli, vale la pena resettare il vocabolario: concorrenza e parallelismo non sono sinonimi, e l'asincrono non è una bacchetta magica per "andare più veloce".

### I/O-bound vs CPU-bound

La distinzione fondamentale è tra:

- **I/O-bound**: il programma passa la maggior parte del tempo *aspettando* qualcosa di esterno — una risposta HTTP, una query al database, un file da disco, un token da un LLM.
- **CPU-bound**: il programma passa la maggior parte del tempo *calcolando* — comprimere dati, addestrare un modello, fare hash di password.

L'asincrono brilla nel primo caso: invece di bloccare un thread (costoso in memoria e context switch) mentre aspettiamo, *cediamo il controllo* a un event loop che nel frattempo può far avanzare altri task.

### Il modello a thread OS e i suoi limiti

Il modello classico "un thread per richiesta" funziona bene fino a un certo punto. Un server che gestisce 10.000 connessioni simultanee con altrettanti thread rischia di:

- Consumare gigabyte di memoria (ogni thread ha il suo stack).
- Passare più tempo a fare context switch che a eseguire codice utile.
- Diventare imprevedibile sotto carico.

L'event loop risolve il problema multiplexando molte operazioni I/O su pochi thread (spesso uno solo). Ma richiede un cambio di mentalità: ogni task deve **cedere esplicitamente il controllo** nei punti in cui aspetta qualcosa.

### Un esempio identico in superficie

Guardiamo due snippet che fanno la stessa cosa: recuperano un utente dal database e il suo profilo da un servizio HTTP, poi li fondono.

```python
# Python (asyncio)
async def fetch_user(user_id: int) -> UserProfile:
    user = await db.get_user(user_id)
    profile = await http_client.get(f"/profiles/{user_id}")
    return merge(user, profile)
```

```rust
// Rust (Tokio)
async fn fetch_user(user_id: UserId) -> Result<UserProfile> {
    let user = db.get_user(user_id).await?;
    let profile = http_client.get(format!("/profiles/{user_id}")).await?;
    Ok(merge(user, profile))
}
```

La sintassi è quasi identica. La domanda che guiderà il resto dell'articolo è: **perché questi due snippet vivono in mondi così diversi?**

![Async Models Comparison](/images/async-models-comparison.png)
*Confronto tra i modelli asincroni: Python con runtime generoso vs Rust con state machine a compile time*

***

## Python: l'asincrono come feature del runtime

In Python, `async/await` è un pattern di alto livello agganciato a un runtime generoso che "si occupa lui" di molti dettagli. Questo lo rende estremamente produttivo, ma nasconde costi che prima o poi emergono.

### Come funziona l'event loop

Quando scrivi `async def`, Python crea un oggetto *coroutine*. Quando chiami `await`, la coroutine **cede il controllo** all'event loop, che può far avanzare altri task in attesa. L'event loop è tipicamente single-threaded e fornisce:

- Uno scheduler per le coroutine.
- Primitive I/O (socket, subprocess, file con supporto limitato).
- Integrazione con librerie esterne (aiohttp, asyncpg, aioredis, ecc.).

Il modello è semplice e potente, ma ha alcune caratteristiche da tenere a mente:

1. **Granularità grossa**: il context switch avviene *solo* sui punti `await`. Se fai lavoro pesante tra un `await` e l'altro, blocchi tutto.
2. **Tipi dinamici**: le coroutine sono oggetti opachi; il type system non ti dice molto su cosa contengono o quanto costano.
3. **Costo in memoria**: ogni task ha un overhead relativamente alto (centinaia di byte) e poco trasparente.

### Il GIL: l'elefante nella stanza

Python ha il Global Interpreter Lock (GIL), che impedisce l'esecuzione parallela di bytecode Python nello stesso processo. Per il codice I/O-bound questo spesso non è un problema: mentre aspetti la rete, il GIL viene rilasciato.

Ma attenzione: se dentro un `async def` fai lavoro CPU-intensive puro (parsing pesante, calcoli numerici in Python puro, ecc.), **bloccherai l'intero event loop**. La soluzione classica è offloadare su un thread pool o un process pool — ma questo introduce complessità e overhead.

### Un errore comune: async che non è async

Questo punto è particolarmente insidioso. Ho recentemente contribuito a [datapizza-ai](https://github.com/datapizza-labs/datapizza-ai/pull/106), un framework Python per soluzioni GenAI, dove ho trovato un pattern molto diffuso ma problematico:

```python
# PRIMA: codice marcato async ma completamente sincrono
async def a_embed(self, texts: list[str]) -> list[list[float]]:
    # Nessun await! Blocca l'event loop
    embeddings = []
    for text in texts:
        embedding = self.model.embed(text)  # CPU-bound, sincrono
        embeddings.append(embedding)
    return embeddings
```

Il metodo `a_embed()` era marcato `async`, ma non conteneva nessun `await`. Risultato: chi lo chiamava con `await a_embed(...)` si aspettava di cedere il controllo all'event loop, ma in realtà il codice **bloccava tutto** per l'intera durata dell'embedding.

La fix è stata usare `asyncio.to_thread()` per offloadare il lavoro bloccante:

```python
# DOPO: delega correttamente al thread pool
async def a_embed(self, texts: list[str]) -> list[list[float]]:
    return await asyncio.to_thread(self.embed, texts)
```

Questo pattern è molto più comune di quanto si pensi. Il takeaway: **`async def` non rende magicamente il codice non-bloccante**. Se non ci sono `await` su operazioni I/O reali, stai solo aggiungendo overhead senza benefici.

### Quando asyncio brilla

Nonostante i limiti, asyncio è eccellente per:

- **API server** che fanno principalmente I/O (FastAPI, aiohttp).
- **Orchestrazione** di chiamate a servizi esterni.
- **Scripting avanzato** dove la velocità di sviluppo conta più delle performance pure.
- **Prototipazione** di sistemi che potrebbero evolvere verso soluzioni più performanti.

L'ecosistema è enorme, la learning curve è dolce per chi già usa Python, e per la maggior parte dei casi d'uso è *good enough*.

***

## Rust: l'asincrono come state machine

In Rust, `async/await` ha lo stesso aspetto sintattico, ma si materializza in qualcosa di completamente diverso: una **state machine** generata dal compilatore, con layout in memoria noto a compile time.

### Futures: non magia, ma tipi

Quando scrivi `async fn` in Rust, il compilatore non crea un "oggetto coroutine" dinamico. Genera invece un tipo che implementa il trait `Future<Output = T>`. Questo tipo è una state machine esplicita:

- Ogni `await` diventa un *punto di sospensione*.
- Lo stato della funzione (variabili locali, punto di esecuzione) viene "impacchettato" nella struct generata.
- La dimensione della Future è **nota a compile time**.

Questo significa che:

1. **Niente allocazioni nascoste**: sai esattamente quanta memoria usa ogni task.
2. **Niente overhead di runtime per la gestione delle coroutine**: il compilatore ha già fatto tutto il lavoro.
3. **Type safety completa**: il sistema di tipi ti dice se una Future è `Send` (può attraversare thread) o `Sync` (può essere condivisa).

### Il runtime è esterno: entra Tokio

Ma le Future da sole non fanno nulla. Servono un *executor* che le esegua e un *reactor* che gestisca l'I/O. Qui entra [Tokio](https://github.com/tokio-rs/tokio), il runtime asincrono più usato in Rust.

Tokio fornisce:

- Un **thread pool** con work stealing (i thread inattivi "rubano" task da quelli occupati).
- Uno **scheduler** per le Future.
- Un **reattore I/O** basato su epoll/kqueue/io_uring.
- Primitive come `TcpStream`, `UdpSocket`, timer, canali MPSC, mutex async.

La macro `#[tokio::main]` crea il runtime e esegue la tua `async fn main`:

```rust
#[tokio::main]
async fn main() {
    // Qui dentro puoi usare .await
    let result = fetch_user(42).await;
}
```

Un punto cruciale: **in Rust puoi scegliere runtime diversi**. Tokio è il più popolare, ma esistono alternative come async-std, smol, glommio (ottimizzato per io_uring). Il contratto tra il tuo codice e il runtime è il trait `Future`, il che rende l'ecosistema molto componibile.

### Il costo della precisione: Send, Sync, Pin

La precisione di Rust ha un prezzo in complessità iniziale. Tre concetti che in Python non esistono (o sono impliciti) diventano espliciti:

- **Send**: "Questo valore può essere spostato su un altro thread." Se la tua Future contiene un `Rc<T>` (reference counting non thread-safe), non sarà `Send` e non potrai usarla con `tokio::spawn`.
- **Sync**: "Questo valore può essere condiviso tra thread." Rilevante per dati condivisi in contesti async.
- **Pin**: "Questo valore non può essere spostato in memoria." Necessario per alcune Future che contengono riferimenti a se stesse.

All'inizio questi vincoli sembrano ostili. Con il tempo, diventano una rete di sicurezza: **il compilatore ti impedisce di scrivere data race**, anche in codice asincrono complesso.

***

## Tokio vs asyncio: confronto diretto

Mettiamo a confronto i due approcci su dimensioni concrete.

![Runtime Architecture](/images/async-runtime-architecture.png)
*Architettura dei runtime: asyncio single-threaded con event loop vs Tokio multi-threaded con work stealing*


| Aspetto | Python asyncio | Rust + Tokio |
| :-- | :-- | :-- |
| **Modello di tipo** | Coroutine dinamica | `Future<T>` con layout noto a compile time |
| **Runtime** | Integrato nella stdlib | Libreria esterna, pluggable |
| **Scheduling** | Cooperativo, single-thread di default | Cooperativo, multi-thread con work stealing |
| **GIL** | Sì, limita parallelismo CPU | No, pieno parallelismo |
| **Controllo memoria** | Limitato, allocazioni nascoste | Esplicito, zero-cost abstractions |
| **Type safety** | Dinamica | Statica, Send/Sync/Pin |
| **Learning curve** | Dolce | Ripida, poi consistente |
| **Ecosistema** | Enorme, maturo | Grande, in crescita |

### Prevedibilità vs velocità di sviluppo

Tokio e Rust ti obbligano a pensare in anticipo a:

- Lifetime dei dati condivisi tra task.
- Quali Future sono `Send` e quali no.
- Come gestire il pinning per API avanzate.

Questo allunga il tempo di sviluppo iniziale. Ma il payoff è:

- **Meno sorprese in produzione**: se compila, probabilmente non hai data race.
- **Performance prevedibili**: sai quanta memoria usa ogni task, il garbage collector non esiste.
- **Capacità di spremere l'hardware**: multi-core reale, latency tail sotto controllo.


***

## I Miei Contributi: Esperienza sul Campo

Durante l'esplorazione di questi due mondi asincroni, ho avuto l'opportunità di contribuire a progetti in entrambi gli ecosistemi. Queste esperienze hands-on hanno consolidato la mia comprensione delle differenze filosofiche tra Python e Rust.

### Tokio: Documentazione del Time Module

Ho contribuito a Tokio con due PR focalizzate sulla documentazione del modulo `time`:

**[PR #7858](https://github.com/tokio-rs/tokio/pull/7858)** — Miglioramento della documentazione sulla manipolazione del tempo nei test. Il problema: molti utenti scoprivano per trial-and-error comportamenti sottili come il fatto che `spawn_blocking` impedisce l'auto-advance del tempo quando è in pausa, o le differenze tra `sleep` e `advance` per forzare timeout nei test.

In Python, queste sfumature spesso non esistono — o sono nascoste dietro astrazioni che "funzionano e basta" finché non smettono di funzionare. In Tokio, il runtime ti espone questi dettagli perché **sono parte del tuo modello mentale**. La documentazione ora spiega chiaramente quando usare quale approccio:

```rust
// Per testare timeout in modo affidabile
tokio::time::pause();
let result = tokio::time::timeout(
    Duration::from_secs(5),
    some_async_operation()
).await;
// Con pause() attivo, sleep avanza il tempo automaticamente
```

**[PR #7798](https://github.com/tokio-rs/tokio/pull/7798)** — Cross-reference nella documentazione di `copy` e `copy_buf`, con focus su `SyncIoBridge`. In Rust esistono due "mondi" di I/O — sincrono (`std::io`) e asincrono (`tokio::io`). Molte librerie esistenti (hasher, compressori, parser) sono sincrone. `SyncIoBridge` è l'adapter che permette di usarle in contesto async senza bloccare il runtime.

L'esistenza stessa di questo bridge evidenzia una differenza fondamentale: **in Rust devi essere consapevole del confine tra sync e async**, mentre in Python questo confine è molto più sfumato (e spesso fonte di bug sottili).

### datapizza-ai: Async che Non Era Async

Sul fronte Python, ho contribuito a [datapizza-ai](https://github.com/datapizza-labs/datapizza-ai/pull/106), un framework per soluzioni GenAI. Ho trovato un pattern molto diffuso ma problematico: metodi marcati `async` che non contenevano nessun `await`.

```python
# PRIMA: async fake
async def a_embed(self, texts: list[str]) -> list[list[float]]:
    # Nessun await! Blocca l'event loop
    embeddings = []
    for text in texts:
        embedding = self.model.embed(text)  # CPU-bound, sincrono
        embeddings.append(embedding)
    return embeddings
```

Chi chiamava `await a_embed(...)` si aspettava di cedere il controllo all'event loop, ma in realtà il codice **bloccava tutto** per l'intera durata dell'embedding. La fix è stata usare `asyncio.to_thread()`:

```python
# DOPO: delega correttamente al thread pool
async def a_embed(self, texts: list[str]) -> list[list[float]]:
    return await asyncio.to_thread(self.embed, texts)
```

### Riflessioni dall'Esperienza

Contribuire a entrambi gli ecosistemi ha cristallizzato una differenza chiave:

- In **Rust/Tokio**, il compilatore ti obbliga a pensare ai confini async/sync. Non puoi "fingere" che qualcosa sia asincrono — il sistema di tipi ti smaschera.
- In **Python/asyncio**, la flessibilità del linguaggio permette pattern che *sembrano* corretti ma nascondono problemi. Il bug `async def` senza `await` è comune proprio perché Python non ti ferma.

L'esperienza di review su Tokio è stata particolarmente istruttiva: la community è attenta alla documentazione quanto al codice, perché in un runtime esplicito come Tokio, **capire il modello mentale è importante quanto usare l'API**.

***

## Quando Python, quando Rust: linee guida pratiche

Dopo tutta questa teoria, la domanda pratica: **cosa uso per il mio prossimo progetto?**

### Resta su Python/asyncio se:

- La maggior parte del lavoro è **I/O-bound ad alto livello**: chiamate HTTP, orchestrazione di microservizi, query a database, interazione con LLM.
- Il **collo di bottiglia è fuori dal tuo processo**: tempo di risposta di API esterne, latenza di rete, lentezza del database.
- Hai bisogno dell'**ecosistema Python**: pandas, numpy, librerie di ML, tooling di data engineering.
- La **velocità di sviluppo** conta più delle performance pure.
- Stai **prototipando** qualcosa che potrebbe evolvere.

Il messaggio chiave: se il tuo problema principale è *complessità di dominio* e non *complessità di sistema*, asyncio ti permette di muoverti velocemente con un cost model *good enough*.

### Considera Rust + Tokio se:

- Hai requisiti stringenti su **latency tail** (p95, p99) o throughput sotto carico.
- Stai costruendo **infrastruttura**: servizi centrali ad alto carico, componenti di data platform, gateway, proxy.
- Non puoi permetterti **leak di memoria** o comportamenti imprevedibili sotto stress.
- Il **modello di esecuzione** non è un dettaglio implementativo, ma il tuo vero prodotto.
- Vuoi **multi-core reale** senza lottare con il GIL o il multiprocessing.

Il messaggio chiave: Rust + Tokio diventano interessanti quando il **come** il codice viene eseguito è importante quanto il **cosa** fa.

***

## Conclusione: stessa keyword, filosofie diverse

`async/await` è diventato una parola d'ordine, ma sotto la superficie nasconde modelli molto diversi.

In **Python**, l'asincrono è una promessa di semplicità: "pensa al flusso logico, ci pensa il runtime". È un pattern di programmazione di alto livello, ottimizzato per produttività e velocità di iterazione. Il costo è una certa opacità: non sempre sai quanto costa un task, non sempre sai se stai davvero cedendo il controllo all'event loop.

In **Rust**, l'asincrono è una promessa di controllo: "pensa al layout del tuo codice nel tempo e nello spazio, il compilatore ti aiuta a non sbagliare". È un'astrazione zero-cost che si materializza in state machine con memoria nota a compile time. Il costo è una curva di apprendimento più ripida e un sistema di tipi che a volte sembra ostile.

Nessuno dei due approcci è "migliore" in assoluto. Sono ottimizzati per problemi diversi, team diversi, fasi diverse di un progetto. La cosa importante è capire **quale trade-off stai facendo** quando scegli l'uno o l'altro.

E se dopo questo articolo ti è venuta voglia di esplorare Tokio più a fondo, nel prossimo post entreremo nel dettaglio del runtime: come funziona lo scheduler, come sono implementate le Future, e cosa succede davvero quando chiami `.await`.

***

## Orizzonti Futuri: Dove Va l'Asincrono

L'ecosistema asincrono in entrambi i linguaggi è in rapida evoluzione:

**Python**: Il PEP 703 (rimozione opzionale del GIL) e il lavoro su "free-threaded Python" in 3.13+ potrebbero cambiare radicalmente il panorama. Se il GIL diventa opzionale, asyncio potrebbe non essere più l'unica via per la concorrenza I/O-bound performante. Tuttavia, il modello async/await rimarrà rilevante per la sua ergonomia.

**Rust**: L'ecosistema si sta consolidando attorno a Tokio, ma alternative come `async-std` e `smol` offrono trade-off diversi. Il supporto per `async fn` nei trait (stabilizzato in Rust 1.75) apre nuove possibilità per API generiche. Il lavoro su `io_uring` (tramite `tokio-uring` e `glommio`) promette performance I/O ancora migliori su Linux.

**Interoperabilità**: Progetti come PyO3 permettono di scrivere estensioni Python in Rust, combinando la produttività di Python con le performance di Rust. Per workload asincroni critici, è possibile implementare il "hot path" in Rust e orchestrare da Python.

Il futuro non è "Python vs Rust" ma piuttosto capire **quale strumento per quale problema**. La stessa keyword `async/await` continuerà a significare cose diverse nei due mondi — e questa è una feature, non un bug.

---

*Le PR citate in questo articolo: [tokio#7798](https://github.com/tokio-rs/tokio/pull/7798) (SyncIoBridge docs), [tokio#7858](https://github.com/tokio-rs/tokio/pull/7858) (time manipulation docs), [datapizza-ai#106](https://github.com/datapizza-labs/datapizza-ai/pull/106) (async embed fix).*

