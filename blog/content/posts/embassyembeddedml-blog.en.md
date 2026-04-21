---
title: "Zero Grappler: Data-Pipeline Thinking on a Microcontroller (Draft Notes from Before the Hardware Arrives)"
date: 2026-04-21
draft: false
tags: ["rust", "embassy", "embedded", "no-std", "embedded-ml", "data-pipelines"]
categories: ["Embedded", "Rust", "Open Source"]
description: "An experiment in carrying data-systems abstractions — sources, transforms, back-pressure — down to 520 KB of SRAM with Rust and Embassy. The crate compiles and runs on the host; the hardware bring-up is the next chapter."
summary: "Zero Grappler is a small no_std crate that applies a data-pipeline mindset to embedded ML: three traits, two async tasks, compile-time buffer sizing, zero allocations. This post is about the design choices — not yet a hardware report. The Pico 2 W smoke test on real silicon is still ahead of me."
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
    alt: "Zero Grappler logo"
    caption: "Pipeline thinking, 520 KB at a time"
    relative: false
    hidden: false
---

## Zero Grappler: Data-Pipeline Thinking on a Microcontroller

I have spent the last few years thinking about data pipelines on clusters, data lakes, and columnar engines. This time I tried to squeeze the same idea into 520 KB of SRAM and a tiny I2S microphone.

At the time of writing, the microphone and the board have not arrived yet. What follows is a design post: the API, the reasoning, the host-side smoke test. The real bring-up on silicon is the next chapter, and it will get its own article once I have something honest to report.

## Why Talk About Pipelines on a Microcontroller?

When you think "embedded", you usually picture an infinite `loop {}`, a couple of ISRs, and a fair amount of hand-rolled glue to keep peripherals, buffers, and global state in sync. In the data and ML world, we almost never talk that way: we talk about *pipelines* — sources, transforms, models, operators wired together with queues and back-pressure.

This article is an experiment: take that data-infrastructure mindset and bring it to embedded using Rust, `async`, and [Embassy](https://embassy.dev/).
Zero Grappler is the result: a tiny `no_std` crate with three traits and two generic tasks that give you a sensor → DSP → model pipeline with no heap allocations and compile-time buffer sizing.

## A Thread Through the Last Few Articles

The last three posts on this blog have been pushing the same handful of ideas through very different scales:

- [**Guardrails for Tabular ML**](https://andreabozzo.pages.dev/posts/tabularmlpipes-blog.en/) — schema contracts and leakage checks on batch pipelines, with Arrow and DataFusion doing the heavy lifting.
- [**Lance Format and LanceDB**](https://andreabozzo.pages.dev/posts/lancearticle-blog.en/) — columnar storage with zero-copy Arrow integration, wired into a live NATS event stream.
- **Zero Grappler (this post)** — the same skeleton of ideas compressed into 520 KB of SRAM: Embassy's `Channel` in place of NATS, `[f32; N]` in place of `RecordBatch`, compile-time sizing in place of runtime validation.

Different scales, same spine: sources, transforms, queues, back-pressure, schema-at-the-boundary. Rust plus Arrow-style thinking continues to hold up even when the operating system disappears, and that is the thread I am most interested in pulling.

## Embassy in Two Paragraphs: Async Without an RTOS

Embassy is a modern embedded framework for Rust that uses `async`/`await` as the primary abstraction instead of a traditional RTOS. The compiler turns each `async fn` into a state machine, and Embassy's executor drives those state machines cooperatively on a single stack, keeping overhead low and avoiding any mandatory heap.

On top of the executor, Embassy provides synchronization primitives (`Channel`, raw mutexes, timers) and HALs for a range of MCUs. If you come from data systems, Embassy's `Channel` feels like a tiny, allocation-free message queue: it connects producers and consumers, and back-pressure is simply the producer awaiting space when the queue is full.

If you come from FreeRTOS-style preemptive threads, the mental map is that each `async fn` plays the role of a task. Each `.await` is a cooperative yield point, and there is no per-task stack to size upfront — the state machine lives in the future.

## From Sensor to Model: the Embedded ML Pipeline

Most embedded ML systems follow the same storyline:

1. A sensor (microphone, IMU, ADC) produces blocks of raw samples.
2. A DSP block turns those samples into more stable features (FFT, MFCC, filters, normalization).
3. A model runs on the features and emits a prediction or event.

Zero Grappler encodes this pipeline into three minimal interfaces and two async loops so that the *wiring* is always the same and you can focus on *how* to read the sensor, *which* DSP to apply, and *which* model to use.

![Sensor → DSP → model pipeline](images/zerograpplerarchitecture.png)

## Three Traits for Three Roles

At the heart of the crate are three traits, each representing one actor in the pipeline.

### `AsyncSource`: the sensor filling the buffer

```rust
pub trait AsyncSource<const N: usize> {
    type Error;

    async fn read(&mut self, buffer: &mut [f32; N]) -> Result<(), Self::Error>;
}
```

`AsyncSource` represents any hardware source capable of filling a buffer of `N` samples: an I2S microphone using DMA, an ADC sampling a voltage, an IMU streaming accelerations. We don't care *how* it gets the data; the only contract is "when `read` returns `Ok(())`, the buffer contains a fresh block of samples ready for processing".

### `Transform`: synchronous, testable DSP

```rust
pub trait Transform<const IN: usize, const OUT: usize> {
    fn process(&mut self, input: &[f32; IN], output: &mut [f32; OUT]);
}
```

`Transform` is the synchronous DSP stage: it takes `IN` samples and produces `OUT` features. Inside this trait you can do anything from a simple `copy_from_slice` to a full MFCC implementation; because it's pure and synchronous, it's easy to test exhaustively on the host without touching hardware.

### `AsyncInference`: the model engine

```rust
pub trait AsyncInference<const N: usize> {
    type Output;
    type Error;

    async fn infer(&mut self, input: &[f32; N]) -> Result<Self::Output, Self::Error>;
}
```

`AsyncInference` is the "model engine": it might be a tiny hand-rolled neural-net interpreter, a runtime like microTVM, or a wrapper around a hardware accelerator. It's asynchronous because the model may need to wait on memory, a coprocessor, or an external device; from the pipeline's perspective, that doesn't matter — you pass a feature buffer in and await a prediction.

## Two Generic Tasks Doing the Dirty Work

With the roles defined, the crate offers two ready-made async loops: one produces data from the sensor, the other consumes it, runs DSP, and calls the model.

### `sensor_task`: from sensor to channel

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

`sensor_task` is a straightforward loop: fill a buffer, send it over a channel, repeat. The buffer lives inside the async state machine, with its size `N` known at compile time; the mutex type and channel depth (`DEPTH`) are generic parameters, so the same code works from bare-metal with `CriticalSectionRawMutex` to more complex setups with different mutex implementations.

### `inference_task`: from channel to model

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
                // TODO: notify the rest of the system
            }
            Err(e) => return e,
        }
    }
}
```

`inference_task` is the symmetric twin: await data on the channel, transform it, call the model. The consumer also acts as a back-pressure controller: if it slows down (because the model is heavy or you're logging too much), the channel fills up and the producer in `sensor_task` is naturally throttled when it awaits `send` on a full queue.

## Wiring Everything Together in an Embassy App

The README contains a minimal example showing how to glue everything together with Embassy.

```rust
use embassy_sync::blocking_mutex::raw::CriticalSectionRawMutex;
use embassy_sync::channel::Channel;

use zero_grappler::buffer::sensor_task;
use zero_grappler::runner::inference_task;
use zero_grappler::traits::{AsyncInference, AsyncSource, Transform};

// Mutex type, message type, depth.
static DATA_CHANNEL: Channel<CriticalSectionRawMutex, [f32; 128], 2> = Channel::new();
```

You implement the traits for your concrete hardware:

- `Sensor` implements `AsyncSource<128>` and in `read` talks to the I2S or ADC driver.
- `Dsp` implements `Transform<128, 64>` with the DSP logic you care about.
- `Model` implements `AsyncInference<64>` and returns, say, a `u8` class ID or an enum.

Then you wrap the two generic tasks in monomorphic Embassy tasks:

```rust
#[embassy_executor::task]
async fn run_sensor() {
    let err = sensor_task(Sensor, DATA_CHANNEL.sender()).await;
    // handle or log `err`
}

#[embassy_executor::task]
async fn run_inference() {
    let err = inference_task(Dsp, Model, DATA_CHANNEL.receiver()).await;
    // handle or log `err`
}
```

Embassy requires `#[embassy_executor::task]` functions to be fully monomorphic so it can allocate them statically at compile time; this pattern keeps the generics inside the library and the concrete wiring inside your application code.

## Host-Side Smoke Test: Running the Pipeline Without Hardware

Before any microphone or accelerometer shows up on my desk, the whole pipeline runs on the PC via `examples/pc_mock.rs`.

The example uses `futures::executor::LocalPool` as a tiny executor and a `Channel<CriticalSectionRawMutex, [f32; 128], 2>` to simulate Embassy's channel. It defines:

- `MockSensor` implementing `AsyncSource<128>` and filling the buffer with `1.0`.
- `MockDSP` implementing `Transform<128, 64>` by copying the first 64 samples.
- `MockModel` implementing `AsyncInference<64>` that always returns `42`.

Both `sensor_task` and `inference_task` are spawned onto the local pool, and the executor runs until the futures complete (which, in this case, is "never", unless an error is returned). This makes it easy to iterate on the DSP and model contracts entirely on the host while waiting on the delivery guy.

## The Target Rig: What a Sub-€50 Setup Would Look Like

Zero Grappler was designed with a very concrete board in mind: the Raspberry Pi Pico 2 W with the RP2350. I have not wired it up yet — this is the BOM I am planning to build around, not a lab report. The reason the Pico 2 W is the pick, *a priori*, is that it offers 520 KB of SRAM, an FPU for `f32` math, on-board Wi-Fi/BLE, and mature Embassy support, which makes it a comfortable target for small audio or motion pipelines. Whether that comfort survives contact with a real INMP441 and a real DMA loop is exactly what the next article is meant to find out.

A minimal audio setup would look like this:

- Raspberry Pi Pico 2 W (~€12).
- INMP441 I2S microphone (~€3).
- Breadboard + jumper wires (~€8).

For motion/gesture experiments you could add:

- MPU-6050 accelerometer/gyroscope over I²C (~€6).

The intent is to have everything needed to acquire audio or motion, compute features in real time, and run a small on-device model using Zero Grappler's pipeline. Two totals, answering different questions:

- **If you already have the bench tools: ~€30–45.** Net cost of one working set of components — one board, one mic, one IMU, a breadboard, jumper wires.
- **If you are starting from absolutely nothing: ~€93.** Adds the soldering kit, a multipack of Picos for spares, and sensor multipacks so a fried INMP441 is not a week-long delay. That is what the breakdown image below reflects.

![Hardware cost breakdown](images/zerograpplercost_estimation.png)

Whether the numbers hold — CPU budget for MFCC, DMA stability, model size vs. SRAM — is bring-up work, not a claim I am making today.

## Design Shaped by Constraints

One of the most interesting outcomes of this experiment is how strongly embedded constraints shaped the API, even before any silicon is involved:

- **`no_std`, zero allocations.**
  There is no `Vec`, no `Box`. Sample and feature buffers are plain `[f32; N]` arrays with `N` known at compile time; if you mix buffer sizes, the compiler complains instead of your MCU.
- **Generic over mutex types.**
  The tasks are generic over `M: RawMutex`, so they work with `CriticalSectionRawMutex`, `ThreadModeRawMutex`, or any custom implementation you need in your environment.
- **Monomorphic Embassy tasks.**
  The requirement that `#[embassy_executor::task]` functions be monomorphic forces a clean separation between "generic library" and "application wiring", which actually turns into a nice architecture boundary.

If you come from the data systems side, it is a bit like moving from a dynamically typed pipeline engine to one with a strict schema: you lose some flexibility, but you gain the ability to reason about behavior and resource usage far earlier — and in embedded, "far earlier" means *before the thing is even flashed*.

## What's Missing (So Far) and Where This Could Go

Right now Zero Grappler only covers the data-flow skeleton: read, transform, infer, propagate errors. Crucially, it has only been exercised on the host. The next milestone is the obvious one: get the Pico 2 W and the INMP441 on a breadboard, implement `AsyncSource<128>` on top of the RP2350 I2S DMA driver, and see whether the abstractions survive a real audio stream without underruns. That bring-up — plus whatever I get wrong on the way — is what the follow-up article will be about.

Beyond that, there are at least three directions the crate could grow:

- **Real inference engines.**
  Plug in a real `no_std` backend — Burn compiled for embedded, microTVM, or a tiny custom runtime for MLPs and small convnets — behind the `AsyncInference` trait.
- **More than one sensor.**
  Extend the traits or add another layer of pipeline to fuse audio, motion, and perhaps GPIO inputs.
- **Output patterns.**
  Today `inference_task` literally consumes the prediction and drops it on the floor — the `Ok(_prediction) => {}` arm in `src/runner.rs` is an empty block. The next step is to parameterize the task over an output sink (a second `Channel`, a user-supplied callback trait, or a small `AsyncSink` trait symmetric to `AsyncSource`) so that predictions can flow into a state machine, drive actuators, or light up an LED — whatever the application needs. This is the API hole I want to close before the hardware bring-up, because whatever sink shape I pick will be easier to iterate on against mocks than against a live I2S stream.

## From Kafka Streams to an I2S Microphone

The core idea behind Zero Grappler is not ambitious: re-use the same abstractions we already use every day to manage terabytes of data — sources, transforms, queues, back-pressure — but apply them to a few hundred audio samples on a microcontroller. Embassy provides the executor and basic async building blocks; this tiny crate adds a thin spine that lets you plug in sensors, DSP, and models without rewriting the same infinite loop for every project. This post is the API-first half of the story; the hardware half comes next, with all the caveats that come from actually running it: timing budgets, DMA alignment, interrupt priorities, whatever else the silicon decides to teach me.

If the abstractions survive that, Zero Grappler becomes the base for a small "ML at the Edge" mini-series — continuous with the Arrow/data systems work from the previous posts, just at a very different scale.
