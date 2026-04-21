---
title: "Zero Grappler: Pensare per Data-Pipeline su un Microcontrollore (Appunti Bozza prima dell'arrivo dell'hardware)"
date: 2026-04-21
draft: false
tags: ["rust", "embassy", "embedded", "no-std", "embedded-ml", "data-pipelines"]
categories: ["Embedded", "Rust", "Open Source"]
description: "Un esperimento nel portare le astrazioni dei sistemi dati — sorgenti, trasformazioni, back-pressure — su 520 KB di SRAM con Rust ed Embassy. Il crate compila e gira sull'host; il bring-up sull'hardware è il prossimo capitolo."
summary: "Zero Grappler è un piccolo crate no_std che applica la mentalità delle pipeline di dati all'ML embedded: tre tratti, due task async, dimensionamento dei buffer a tempo di compilazione, zero allocazioni. Questo post riguarda le scelte di design — non è ancora un report sull'hardware. Lo smoke test su silicio reale con il Pico 2 W è ancora davanti a me."
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
    image: "images/zerograpplerlogo.png"
    alt: "Logo Zero Grappler"
    caption: "Pensare per pipeline, 520 KB alla volta"
    relative: false
    hidden: false
---

## Zero Grappler: Pensare per Data-Pipeline su un Microcontrollore

Ho passato gli ultimi anni a pensare alle pipeline di dati su cluster, data lake e motori colonnari. Questa volta ho cercato di spremere la stessa idea in 520 KB di SRAM e un minuscolo microfono I2S.

Al momento in cui scrivo, il microfono e la scheda non sono ancora arrivati. Quello che segue è un post sul design: l'API, il ragionamento, lo smoke test lato host. Il vero bring-up sul silicio è il prossimo capitolo, e avrà un articolo dedicato una volta che avrò qualcosa di onesto da riportare.

## Perché parlare di Pipeline su un Microcontrollore?

Quando pensi all'ambito "embedded", solitamente immagini un `loop {}` infinito, un paio di ISR e una discreta quantità di colla scritta a mano per tenere sincronizzati periferiche, buffer e stato globale. Nel mondo dei dati e del ML, quasi mai parliamo in questo modo: parliamo di *pipeline* — sorgenti, trasformazioni, modelli, operatori collegati tra loro con code e back-pressure.

Questo articolo è un esperimento: prendere quella mentalità da infrastruttura dati e portarla nell'embedded usando Rust, `async` ed [Embassy](https://embassy.dev/).
Zero Grappler è il risultato: un minuscolo crate `no_std` con tre tratti (traits) e due task generici che offrono una pipeline sensore → DSP → modello senza allocazioni nell'heap e con dimensionamento dei buffer a tempo di compilazione.

## Un filo conduttore tra gli ultimi articoli

Gli ultimi tre post su questo blog hanno spinto lo stesso set di idee attraverso scale molto diverse:

- [**Guardrails per ML Tabulare**](https://andreabozzo.pages.dev/posts/tabularmlpipes-blog.en/) — contratti di schema e controlli di leakage su pipeline batch, con Arrow e DataFusion a fare il lavoro pesante.
- [**Formato Lance e LanceDB**](https://andreabozzo.pages.dev/posts/lancearticle-blog.en/) — archiviazione colonnare con integrazione Arrow zero-copy, collegata a un flusso di eventi NATS dal vivo.
- **Zero Grappler (questo post)** — lo stesso scheletro di idee compresso in 520 KB di SRAM: il `Channel` di Embassy al posto di NATS, `[f32; N]` al posto di `RecordBatch`, dimensionamento a tempo di compilazione al posto della validazione runtime.

Scale diverse, stessa colonna vertebrale: sorgenti, trasformazioni, code, back-pressure, schema-al-confine. Il pensiero in stile Rust più Arrow continua a reggere anche quando il sistema operativo scompare, ed è questo il filo che mi interessa di più tirare.

## Embassy in due paragrafi: Async senza un RTOS

Embassy è un framework embedded moderno per Rust che usa `async`/`await` come astrazione primaria invece di un RTOS tradizionale. Il compilatore trasforma ogni `async fn` in una macchina a stati, e l'esecutore di Embassy guida quelle macchine a stati in modo cooperativo su un singolo stack, mantenendo basso l'overhead ed evitando qualsiasi heap obbligatorio.

Oltre all'esecutore, Embassy fornisce primitive di sincronizzazione (`Channel`, mutex grezzi, timer) e HAL per una vasta gamma di MCU. Se vieni dai data systems, il `Channel` di Embassy sembra una minuscola coda di messaggi senza allocazioni: collega produttori e consumatori, e la back-pressure è semplicemente il produttore che attende spazio quando la coda è piena.

Se vieni invece dai thread preemptive in stile FreeRTOS, la mappa mentale è che ogni `async fn` fa il ruolo di un task. Ogni `.await` è un punto di yield cooperativo, e non c'è uno stack per-task da dimensionare in anticipo — la macchina a stati vive dentro la future.

## Dal Sensore al Modello: la Pipeline ML Embedded

La maggior parte dei sistemi ML embedded segue la stessa trama:

1. Un sensore (microfono, IMU, ADC) produce blocchi di campioni grezzi.
2. Un blocco DSP trasforma quei campioni in feature più stabili (FFT, MFCC, filtri, normalizzazione).
3. Un modello gira sulle feature ed emette una predizione o un evento.

Zero Grappler codifica questa pipeline in tre interfacce minimali e due loop async, in modo che il *cablaggio* sia sempre lo stesso e tu possa concentrarti su *come* leggere il sensore, *quale* DSP applicare e *quale* modello usare.

![Pipeline Sensore → DSP → modello](images/zerograpplerarchitecture.png)

## Tre Tratti per Tre Ruoli

Al cuore del crate ci sono tre tratti (traits), ognuno dei quali rappresenta un attore nella pipeline.

### `AsyncSource`: il sensore che riempie il buffer

```rust
pub trait AsyncSource<const N: usize> {
    type Error;

    async fn read(&mut self, buffer: &mut [f32; N]) -> Result<(), Self::Error>;
}
```

`AsyncSource` rappresenta qualsiasi sorgente hardware capace di riempire un buffer di `N` campioni: un microfono I2S che usa il DMA, un ADC che campiona una tensione, una IMU che trasmette accelerazioni. Non ci interessa come ottiene i dati; l'unico contratto è "quando `read` restituisce `Ok(())`, il buffer contiene un nuovo blocco di campioni pronto per l'elaborazione".

### `Transform`: DSP sincrono e testabile

```rust
pub trait Transform<const IN: usize, const OUT: usize> {
    fn process(&mut self, input: &[f32; IN], output: &mut [f32; OUT]);
}
```

`Transform` è lo stadio DSP sincrono: prende `IN` campioni e produce `OUT` feature. All'interno di questo tratto puoi fare qualsiasi cosa, da un semplice `copy_from_slice` a un'implementazione completa di MFCC; essendo puro e sincrono, è facile da testare esaustivamente sull'host senza toccare l'hardware.

### `AsyncInference`: il motore del modello

```rust
pub trait AsyncInference<const N: usize> {
    type Output;
    type Error;

    async fn infer(&mut self, input: &[f32; N]) -> Result<Self::Output, Self::Error>;
}
```

`AsyncInference` è il "motore del modello": potrebbe essere un piccolo interprete di reti neurali scritto a mano, un runtime come microTVM, o un wrapper attorno a un acceleratore hardware. È asincrono perché il modello potrebbe dover attendere la memoria, un coprocessore o un dispositivo esterno; dal punto di vista della pipeline, non importa — passi un buffer di feature e attendi una predizione.

## Due Task Generici che fanno il lavoro sporco

Con i ruoli definiti, il crate offre due loop async pronti all'uso: uno produce dati dal sensore, l'altro li consuma, esegue il DSP e chiama il modello.

### `sensor_task`: dal sensore al canale

```rust
pub async fn sensor_task<
    S: AsyncSource<N>,
    M: embassy_sync::blocking_mutex::raw::RawMutex,
    const N: usize,
    const DEPTH: usize,
>(
    mut sensor: S,
    sender: embassy_sync::channel::Sender<'static, M, [f32; N], DEPTH>,
) -> S::Error {
    let mut buffer = [0.0f32; N];

    loop {
        match sensor.read(&mut buffer).await {
            Ok(()) => sender.send(buffer).await,
            Err(e) => return e,
        }
    }
}
```

`sensor_task` è un loop lineare: riempie un buffer, lo invia su un canale, ripete. Il buffer vive all'interno della macchina a stati async, con la sua dimensione `N` nota a tempo di compilazione; il tipo di mutex e la profondità del canale (`DEPTH`) sono parametri generici, quindi lo stesso codice funziona dal bare-metal con `CriticalSectionRawMutex` a configurazioni più complesse.

### `inference_task`: dal canale al modello

```rust
pub async fn inference_task<
    M: embassy_sync::blocking_mutex::raw::RawMutex,
    T: Transform<IN, OUT>,
    I: AsyncInference<OUT>,
    const IN: usize,
    const OUT: usize,
    const DEPTH: usize,
>(
    mut transform: T,
    mut model: I,
    receiver: embassy_sync::channel::Receiver<'static, M, [f32; IN], DEPTH>,
) -> I::Error {
    let mut features = [0.0f32; OUT];

    loop {
        let raw_data = receiver.receive().await;
        transform.process(&raw_data, &mut features);

        match model.infer(&features).await {
            Ok(_prediction) => {
                // TODO: notificare il resto del sistema
            }
            Err(e) => return e,
        }
    }
}
```

`inference_task` è il gemello simmetrico: attende i dati sul canale, li trasforma, chiama il modello. Il consumatore funge anche da controller di back-pressure: se rallenta (perché il modello è pesante o stai loggando troppo), il canale si riempie e il produttore in `sensor_task` viene naturalmente frenato quando attende (`await`) l'invio su una coda piena.

## Cablare il tutto in un'app Embassy

Il README contiene un esempio minimale che mostra come incollare tutto insieme con Embassy.

```rust
use embassy_sync::blocking_mutex::raw::CriticalSectionRawMutex;
use embassy_sync::channel::Channel;

use zero_grappler::buffer::sensor_task;
use zero_grappler::runner::inference_task;
use zero_grappler::traits::{AsyncInference, AsyncSource, Transform};

// Tipo di Mutex, tipo di messaggio, profondità.
static DATA_CHANNEL: Channel<CriticalSectionRawMutex, [f32; 128], 2> = Channel::new();
```

Implementi i tratti per il tuo hardware concreto:

- `Sensor` implementa `AsyncSource<128>` e in `read` comunica con il driver I2S o ADC.
- `Dsp` implementa `Transform<128, 64>` con la logica DSP che ti serve.
- `Model` implementa `AsyncInference<64>` e restituisce, ad esempio, un ID di classe `u8` o un `enum`.

Poi avvolgi i due task generici in task Embassy monomorfici:

```rust
#[embassy_executor::task]
async fn run_sensor() {
    let err = sensor_task(Sensor, DATA_CHANNEL.sender()).await;
    // gestisci o logga `err`
}

#[embassy_executor::task]
async fn run_inference() {
    let err = inference_task(Dsp, Model, DATA_CHANNEL.receiver()).await;
    // gestisci o logga `err`
}
```

Embassy richiede che le funzioni `#[embassy_executor::task]` siano completamente monomorfiche per poterle allocare staticamente a tempo di compilazione; questo pattern mantiene i generici all'interno della libreria e il cablaggio concreto all'interno del codice dell'applicazione.

## Smoke Test lato Host: Eseguire la Pipeline senza Hardware

Prima ancora che un microfono o un accelerometro appaiano sulla mia scrivania, l'intera pipeline gira sul PC tramite `examples/pc_mock.rs`.

L'esempio usa `futures::executor::LocalPool` come minuscolo esecutore e un `Channel<CriticalSectionRawMutex, [f32; 128], 2>` per simulare il canale di Embassy. Definisce:

- `MockSensor` che implementa `AsyncSource<128>` e riempie il buffer con `1.0`.
- `MockDSP` che implementa `Transform<128, 64>` copiando i primi 64 campioni.
- `MockModel` che implementa `AsyncInference<64>` e restituisce sempre `42`.

Sia `sensor_task` che `inference_task` vengono spawnati sul pool locale, e l'esecutore gira finché i future non completano (che, in questo caso, è "mai", a meno che non venga restituito un errore). Questo rende facile iterare sui contratti DSP e del modello interamente sull'host mentre si aspetta il corriere.

## Il Target Rig: Come apparirebbe un setup sotto i 50€

Zero Grappler è stato progettato con una scheda molto concreta in mente: la Raspberry Pi Pico 2 W con l'RP2350. Non l'ho ancora cablata — questa è la distinta base (BOM) che sto pianificando di costruire, non un report di laboratorio. Il motivo per cui la Pico 2 W è la scelta, *a priori*, è che offre 520 KB di SRAM, una FPU per la matematica `f32`, Wi-Fi/BLE integrati e un supporto maturo per Embassy, il che la rende un target confortevole per piccole pipeline audio o di movimento. Se quel comfort sopravviverà al contatto con un vero INMP441 e un vero loop DMA è esattamente ciò che il prossimo articolo dovrà scoprire.

Un setup audio minimale sarebbe composto da:

- Raspberry Pi Pico 2 W (~12€).
- Microfono I2S INMP441 (~3€).
- Breadboard + cavetti jumper (~8€).

Per esperimenti di movimento/gesti si potrebbe aggiungere:

- Accelerometro/giroscopio MPU-6050 su I²C (~6€).

L'intento è avere tutto il necessario per acquisire audio o movimento, calcolare feature in tempo reale e far girare un piccolo modello on-device usando la pipeline di Zero Grappler. Due totali, che rispondono a domande diverse:

- **Se hai già gli attrezzi da banco: ~30–45€.** Costo *netto* di un singolo set funzionante di componenti — una scheda, un microfono, una IMU, una breadboard, cavetti jumper.
- **Se parti da zero assoluto: ~93€.** Aggiunge il kit saldatore, un multipack di Pico per avere scorte, e multipack di sensori così che un INMP441 bruciato non diventi un ritardo di una settimana. È ciò che l'immagine del breakdown qui sotto riflette.

![Stima dei costi hardware](images/zerograpplercost_estimation.png)

Se i numeri reggeranno — budget CPU per MFCC, stabilità del DMA, dimensione del modello rispetto alla SRAM — è lavoro di bring-up, non un'affermazione che sto facendo oggi.

## Design plasmato dai vincoli

Uno dei risultati più interessanti di questo esperimento è quanto i vincoli embedded abbiano plasmato l'API, ancora prima che il silicio venisse coinvolto:

- **`no_std`, zero allocazioni.**
  Non c'è `Vec`, non c'è `Box`. I buffer di campioni e feature sono semplici array `[f32; N]` con `N` noto a tempo di compilazione; se mescoli le dimensioni dei buffer, il compilatore si lamenta invece del tuo MCU.
- **Generico rispetto ai tipi di mutex.**
  I task sono generici rispetto a `M: RawMutex`, quindi funzionano con `CriticalSectionRawMutex`, `ThreadModeRawMutex`, o qualsiasi implementazione personalizzata necessaria nel tuo ambiente.
- **Task Embassy monomorfici.**
  Il requisito che le funzioni `#[embassy_executor::task]` siano monomorfiche forza una netta separazione tra "libreria generica" e "cablaggio dell'applicazione", il che si trasforma in un bel confine architetturale.

Se vieni dal lato dei data systems, è un po' come passare da un motore di pipeline tipizzato dinamicamente a uno con uno schema rigoroso: perdi un po' di flessibilità, ma guadagni la capacità di ragionare sul comportamento e sull'uso delle risorse molto prima — e nell'embedded, "molto prima" significa *prima ancora che l'oggetto venga flashato*.

## Cosa manca (finora) e dove potrebbe andare

Al momento Zero Grappler copre solo lo scheletro del flusso di dati: lettura, trasformazione, inferenza, propagazione degli errori. Fondamentalmente, è stato esercitato solo sull'host. Il prossimo traguardo è quello ovvio: mettere la Pico 2 W e l'INMP441 su una breadboard, implementare `AsyncSource<128>` sopra il driver DMA I2S dell'RP2350 e vedere se le astrazioni sopravvivono a un vero flusso audio senza underrun. Quel bring-up — insieme a tutto ciò che sbaglierò lungo la strada — sarà l'oggetto dell'articolo successivo.

Oltre a questo, ci sono almeno tre direzioni in cui il crate potrebbe crescere:

- **Motori di inferenza reali.**
  Collegare un vero backend `no_std` — Burn compilato per embedded, microTVM, o un piccolo runtime personalizzato per MLP e piccole convnet — dietro il tratto `AsyncInference`.
- **Più di un sensore.**
  Estendere i tratti o aggiungere un altro livello di pipeline per fondere audio, movimento e magari input GPIO.
- **Pattern di output.**
  Oggi `inference_task` consuma letteralmente la predizione e la lascia cadere a terra — il ramo `Ok(_prediction) => {}` in `src/runner.rs` è un blocco vuoto. Il prossimo passo è parametrizzare il task su un sink di output (un secondo `Channel`, un tratto di callback fornito dall'utente, o un piccolo tratto `AsyncSink` simmetrico ad `AsyncSource`) in modo che le predizioni possano fluire in una macchina a stati, guidare attuatori o accendere un LED — qualunque cosa serva all'applicazione. Questo è il buco nell'API che voglio chiudere *prima* del bring-up hardware, perché qualunque forma di sink sceglierò sarà più facile da iterare contro dei mock che contro un flusso I2S dal vivo.

## Da Kafka Streams a un microfono I2S

L'idea centrale dietro Zero Grappler non è ambiziosa: riutilizzare le stesse astrazioni che già usiamo ogni giorno per gestire terabyte di dati — sorgenti, trasformazioni, code, back-pressure — ma applicarle a poche centinaia di campioni audio su un microcontrollore. Embassy fornisce l'esecutore e i blocchi async di base; questo minuscolo crate aggiunge una sottile spina dorsale che ti permette di collegare sensori, DSP e modelli senza riscrivere lo stesso loop infinito per ogni progetto. Questo post è la prima metà della storia, focalizzata sull'API; la metà hardware viene dopo, con tutti i caveat che derivano dal farlo girare davvero: budget temporali, allineamento DMA, priorità degli interrupt e cos'altro il silicio deciderà di insegnarmi.

Se le astrazioni sopravviveranno a tutto ciò, Zero Grappler diventa la base per una piccola serie "ML all'Edge" — in continuità con il lavoro su Arrow e data systems dei post precedenti, solo su una scala molto diversa.
