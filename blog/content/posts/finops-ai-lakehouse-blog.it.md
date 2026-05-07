---
title: "FinOps per Piattaforme Dati AI nel 2026: Databricks vs AWS-Native vs Iceberg DIY sul Tuo Warehouse"
date: 2026-05-07T12:00:00+02:00
draft: false
tags: ["Data Engineering", "FinOps", "Databricks", "AWS", "Apache Iceberg", "Lakehouse", "AI", "Streaming"]
categories: ["Data Engineering", "FinOps"]
description: "Un confronto FinOps-first tra Databricks, AWS Glue/Athena con Iceberg e uno stack Iceberg DIY per aggiungere AI/ML e streaming sopra un warehouse esistente, con i prezzi 2026 in USD ed EUR."
summary: "Tre stack lakehouse per aggiungere AI/ML e streaming sopra un warehouse esistente, confrontati con una lente FinOps: DBU, DPU, TB scansionati, S3 GB-mese ed egress, applicati a workload reali con i prezzi 2026."
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
    image: "images/FinOps-Lakehouse-Cover.png"
    alt: "FinOps per Piattaforme Dati AI 2026"
    caption: "Databricks vs AWS-Native vs Iceberg DIY, attraverso una lente FinOps"
    relative: false
    hidden: false
---

## Introduzione

La maggior parte delle conversazioni che ho con founder e platform lead in questi mesi segue lo stesso schema. C'è già un warehouse — Snowflake, Redshift, BigQuery, a volte Postgres che fa finta di esserlo — e non si tocca. Attorno, tre pressioni si sono accumulate quasi in contemporanea: storia più economica su object storage, pipeline di feature AI/ML che devono alimentare sia training che serving, e una qualche forma di streaming o analytics near-real-time. Prendi una qualsiasi startup con un footprint dati serio nel 2026 e sentirai una variante di "ci serve un lakehouse accanto al warehouse, senza che la bolletta cloud esploda."

Questo è il taglio FinOps-first di quella conversazione. Tre famiglie continuano a tornare: Databricks, AWS-native (Glue + Athena + Iceberg, incluso S3 Tables), e uno stack Iceberg DIY con motori come Spark, Flink e Trino. Voglio guardare a come si comportano i loro pricing primitive quando li mappi su workload AI/ML e streaming reali, non a chi vince su una matrice di feature. I numeri sono in USD con conversioni indicative in EUR per i lettori europei, usando la media year-to-date 2026 di circa 1 EUR ≈ 1,17 USD.

In sintesi: Databricks è la piattaforma AI più integrata e quella su cui le bollette sono più difficili da prevedere; AWS-native è il percorso di minor resistenza se sei già dentro AWS e apprezzi il serverless; Iceberg DIY offre la migliore unit economics di lungo periodo, ma solo se hai i platform engineer per farlo girare. Il lavoro vero è capire quale di questi vincoli morde per primo nel tuo team.

## Il Frame della Decisione: Warehouse + Lakehouse, Non Warehouse vs Lakehouse

Il punto di partenza conta. I team con cui parlo non vogliono quasi mai smantellare il warehouse. Il warehouse è dove vivono finance e product analytics, dove le dashboard si sono stabilizzate, dove sono concentrate le competenze SQL. Quello che vogliono è un secondo livello di storage e compute che gestisca tre cose che il warehouse fa male o caro: conservare anni di storia raw e semi-strutturata a prezzi da object storage, fare training e serving di feature ML e gen-AI su quella storia, e ingerire stream con freschezza al secondo invece di micro-batch ELT ogni quindici minuti.

Questo cambia il confronto. La domanda giusta non è "Databricks vs Snowflake" o "Athena vs BigQuery" in isolamento. È "qual è il costo marginale di attaccare un lakehouse capace di AI/streaming a un warehouse che resta," sapendo che alcuni workload migreranno nel tempo e altri resteranno dove sono. Le tre opzioni qui sotto rispondono a quella domanda, ma lo fanno con pricing primitive diversi e assunzioni diverse sul tuo team.

## Pricing Primitive da Avere in Testa

Prima di entrare negli stack, vale la pena interiorizzare l'unit economics dei livelli sotto a tutto il resto. Sono i numeri a cui torno nelle conversazioni, e si traducono direttamente in stime back-of-the-envelope per i pattern di workload più avanti.

**Databricks DBU.** Le guide indipendenti 2026 piazzano i tassi DBU reali in una banda larga, all'incirca 0,07–0,95 USD per DBU-ora a seconda della classe di workload e del tier. Jobs Compute (classico) e Lakeflow Declarative Pipelines core stanno verso il basso; serverless SQL warehouse e serverless all-purpose compute stanno in cima. Controintuitivamente, le DBU di Model Serving sono fra le più economiche del catalogo — il costo dei workload Mosaic AI viene quasi sempre dal consumo a token dei foundation model e dal compute GPU sottostante, non dal tasso DBU. In EUR, parliamo di circa 0,06–0,81 EUR per DBU-ora. Le DBU si sommano ai costi dell'infrastruttura EC2/Azure/GCP sottostante, quindi il fee della piattaforma è una colonna su una bolletta a due colonne. Gli impegni pre-purchase di uno o tre anni possono togliere fino a circa il 37% dal listino, ma solo se riesci a prevedere il consumo — cosa che la maggior parte dei team non fa nel primo anno.

**AWS Glue DPU.** I job ETL e i crawler di Glue fatturano per DPU-secondo con un minimo di un minuto. L'esecuzione standard è 0,44 USD per DPU-ora (~0,38 EUR), e il tier Flex per job non urgenti scende a 0,29 USD per DPU-ora (~0,25 EUR). L'esempio canonico AWS, un job Spark di 15 minuti su 6 DPU, fa 0,66 USD. Un numero piccolo abbastanza da rassicurare, finché non lo moltiplichi per centinaia di job su molte tabelle, che è esattamente quello che succede quando una feature platform prende forma.

**Athena.** SQL on-demand al famoso 5,00 USD per TB scansionato (~4,27 EUR/TB), con un minimo di 10 MB per query verso fonti dati federate. Le capacity reservation costano 0,30 USD per DPU-ora con un minimo di 24 DPU e billing al minuto, mentre Athena Spark sta a 0,35 USD per DPU-ora. Partition pruning, formati colonnari e pruning dei metadati Iceberg non sono ottimizzazioni opzionali qui; sono la differenza fra un layer analytics sostenibile e una bolletta fuori controllo.

**Storage S3 ed egress.** S3 Standard in regioni paragonabili a eu-central-1 sta intorno a 0,023 USD per GB-mese, ovvero ~23 USD per TB-mese (~20 EUR). L'egress sorprende più spesso: portare dati fuori da una regione AWS parte tipicamente da 0,09 USD per GB, quindi un singolo terabyte che lascia la regione costa circa 90 USD — più di tre mesi di storage per quello stesso TB. Nelle nuove regioni AWS European Sovereign Cloud (lanciato a gennaio 2026 con la regione di Brandeburgo), i prezzi di listino sono quotati direttamente in EUR e stanno circa il 15–17% sopra i prezzi di eu-central-1 paragonabili; quel gap conta per i team europei con vincoli regolatori.

Da qui derivano due cose. Il markup di piattaforma sopra l'infrastruttura grezza varia enormemente: uno stack DIY paga vicino ai prezzi infra puri, AWS-native paga un premio Glue/Athena moderato, Databricks stratifica le DBU sopra tutto. E egress e movimento cross-region sono le voci silenziose della bolletta — penalizzano architetture che fanno rimbalzare dati fra cloud e premiano stack dove il compute vive nella stessa regione dello storage.

## Opzione 1: Databricks (Delta + Mosaic AI)

Databricks è l'opzione che i founder citano per primi quando dicono "vogliamo un solo strumento che faccia tutto." La piattaforma copre davvero tutta la superficie da ingestion a model serving, e l'integrazione è abbastanza stretta da permettere a un ML engineer di passare da una tabella Delta a un agente deployato senza uscire dal workspace. Mosaic AI mette insieme model training, una agent platform (Agent Bricks, il successore dell'Agent Framework originale), vector search, un AI gateway (oggi Unity AI Gateway, portato sotto la governance di Unity Catalog) e model serving dentro il lakehouse; MLflow gestisce experiment tracking e registry; il Feature Store con online serving si aggancia a Unity Catalog per governance e lineage. Spark Structured Streaming con Photon offre un'API unificata batch-and-stream sulle stesse tabelle Delta, con micro-batch al secondo che bastano per la maggior parte delle feature pipeline.

![Stack DBU di Databricks](images/Databricks-DBU-Stack.png "Le classi di DBU di Databricks — Jobs, SQL, Serverless, Mosaic AI — sopra l'infrastruttura EC2 condivisa")

Il costo è dove Databricks diventa più difficile da ragionare. La DBU non è un prezzo unico, è una famiglia di prezzi che dipende dalla classe di workload. Le DBU Jobs sono economiche, quelle SQL warehouse più care, le serverless SQL e serverless all-purpose le più care del lotto. Un team mid-size ben governato di mia conoscenza riporta charge mensili di piattaforma Databricks nel range 500–5.000 USD — circa 430–4.270 EUR — *prima* dei costi di compute sottostante. La bolletta diventa difficile da prevedere perché quattro o cinque bucket DBU si riempiono in contemporanea, e l'autoscaling serverless può silenziosamente spingerti su per la curva.

Qui la disciplina FinOps conta più che nelle altre due opzioni. Cluster policy, timeout sui job, sizing degli instance pool, decisioni su Photon on/off, min/max delle SQL warehouse serverless, quota control su Mosaic AI — sono tutti leveraggi che hanno bisogno di un owner. Senza, la frizione zero della piattaforma diventa il suo costo. Con, Databricks può essere molto competitiva, soprattutto quando riesci a consolidare abbastanza workload del warehouse dentro il lakehouse per ammortizzare il fee di piattaforma su un footprint più ampio.

Delta come formato è eccellente dentro Databricks: Photon, Liquid Clustering (ora il default raccomandato al posto di Z-Order per le nuove tabelle), auto-compaction e Predictive Optimization tirano fuori performance reali. Fuori da Databricks, Delta funziona ma è chiaramente un cittadino di seconda classe rispetto al dentro; la flessibilità multi-engine — quello che Iceberg oggi fa bene — non è il forte di Delta, anche con UniForm a fare da ponte verso i lettori Iceberg. Se ti aspetti Trino, Flink, Snowflake e servizi custom che colpiscono tutti le stesse tabelle, è un segnale che spinge lontano da questa opzione.

Databricks calza quando il team è disposto a consolidare workload sul lakehouse, quando la velocità AI/ML è la pressione di business dominante e quando c'è budget e headcount reali per la governance FinOps. Calza male quando il warehouse resta primario e vuoi solo un thin layer lakehouse di fianco; in quella postura paghi molta piattaforma che ancora non usi.

## Opzione 2: AWS-Native (Glue + Athena + Iceberg / S3 Tables)

Il percorso AWS-native è quello che vedo scelto più spesso da team lean già su AWS che non vogliono una nuova relazione con un vendor. Architetturalmente è familiare: S3 è il lake, Glue gestisce ETL/ELT e il catalogo, Athena interroga il lake contro tabelle Iceberg, SageMaker porta avanti il ciclo ML. Sempre più, AWS sta raggruppando Glue Data Catalog e Lake Formation sotto l'ombrello più ampio di **SageMaker Lakehouse**, con un'API AWS Glue Iceberg REST Catalog e supporto a catalog federati — la risposta AWS-native a "dammi un layer di catalogo unificato," non solo "Glue più quello che ti pare." AWS ha pubblicato case study di migrazione in questa direzione, inclusi team che sostituiscono Databricks/Delta con job Glue che scrivono tabelle Iceberg su S3 e Athena che le sezione dinamicamente per il training. Il pitch è semplice: pricing serverless, niente cluster long-running, IAM come identity layer unificante.

S3 Tables è il pezzo nuovo e interessante. È storage Iceberg fully managed su S3, con compaction automatica, gestione degli snapshot e integrazione più stretta con il Glue Data Catalog. AWS dichiara "fino a 3x query throughput più veloce e 10x transazioni al secondo in più" rispetto a Iceberg self-managed su S3 standard, beneficio reale per chi non vuole gestire la compaction. Il catch è il livello di costo di manutenzione: il benchmark Onehouse del 2025 su scritture Iceberg small-file-heavy aveva originariamente trovato la compaction self-managed su EMR circa 29x più economica di S3 Tables. Dopo il taglio prezzi S3 Tables di luglio 2025 (compaction giù dell'80–90% per byte, 50% per object), i numeri aggiornati di Onehouse mettono il gap intorno a 3x. Ancora significativo, non più ordini di grandezza, e il benchmark era deliberatamente small-file-heavy in un modo che favorisce il self-management; i risultati cambiano con la distribuzione delle dimensioni dei file e la cadenza di scrittura.

L'unit economics è più semplice da ragionare di Databricks. Un job Glue Spark di 15 minuti su 6 DPU costa 0,66 USD; moltiplichi per numero di job e frequenza per dimensionare la bolletta ETL. Le query Athena a 5,00 USD per TB scansionato (~4,3 EUR/TB) sono indulgenti finché le tabelle sono partizionate e in Parquet o Iceberg. Le capacity reservation aiutano una volta che il volume di query è abbastanza prevedibile da impegnarsi su una baseline. Lo storage S3 a 23 USD per TB-mese è il pavimento; i fee di manutenzione di S3 Tables si sommano sopra a seconda di quanto spesso i dati vengono riscritti.

Dove questa opzione lotta con le altre due è sulla profondità di integrazione. Glue è forte sui default managed, debole sul tuning fine rispetto a Databricks; non c'è un equivalente Photon per Athena SQL quando concurrency o complessità di join si fanno cattive. Anche il lato ML è meno integrato: SageMaker è una piattaforma seria, ma cucirla con Glue, Athena, Step Functions ed EventBridge in un ciclo coerente di feature-and-model è lavoro di composizione che il tuo team deve fare. Il guadagno è che niente di questa composizione è esotico — la maggior parte dei team già su AWS sa cablare quei servizi.

AWS-native funziona bene quando warehouse esistente e analytics sono concentrati su AWS, quando il platform team è abbastanza piccolo che "meno vendor in giro" pesa più di "miglior UX AI in classe," e quando il workload AI/ML è reale ma non il centro di gravità quotidiano. Funziona meno bene quando ti serve un multi-cloud first-class, o quando il team è già standardizzato su strumenti che vivono fuori da AWS.

## Opzione 3: Iceberg DIY + Motori (Spark / Flink / Trino)

La terza opzione è quella che trovo più interessante a livello personale, e quella che raccomando con più cautela. Uno stack Iceberg DIY tipicamente si presenta così: object storage (S3 o compatibile), Apache Iceberg come formato tabellare, un catalogo a scelta (Glue, Hive Metastore, o cataloghi REST come [Lakekeeper](https://andreabozzo.github.io/AndreaBozzo/blog/posts/lakekeeper-blog.it/), Nessie o Apache Polaris — che è diventato top-level project Apache a febbraio 2026), e uno o più motori sopra: Spark per il batch, Flink per lo streaming, Trino o Presto per SQL interattivo, eventualmente DuckDB o DataFusion per analytics embedded. Il tooling ML e AI è quello su cui sei già standardizzato (MLflow, KServe, servizi custom), cablato ai motori via interfacce aperte.

![Tre stack lakehouse a confronto](images/Lakehouse-Three-Stacks.png "Stack Databricks, AWS-Native e Iceberg DIY sopra un layer di object storage S3-compatibile condiviso")

L'argomento per questo stack nel 2026 è che la guerra dei formati aperti è finita e Iceberg ha vinto. La compatibilità multi-engine non è più una promessa futura; Spark, Flink, Trino, Presto, Snowflake, Dremio, RisingWave e un numero crescente di sistemi Rust-native leggono e scrivono le stesse tabelle Iceberg oggi. Una volta accettato questo, la questione del lock-in si sposta di un layer in alto. Il formato file non ti intrappola più; il catalogo e i servizi di piattaforma intorno sì. Scegliere il catalogo e impegnarsi sopra in modo deliberato è la decisione architetturale più importante in questa opzione.

La storia dei costi è la più semplice delle tre sulla carta e la più dura nella pratica. Non c'è DBU, niente markup DPU oltre a quello che i motori stessi caricano per il compute. Paghi storage S3, request S3, EMR o EKS o Kubernetes self-managed per il compute, e fee minori di catalogo se ne usi uno managed. A scala è materialmente più economico delle altre due. Il motivo per cui non è la risposta ovvia è che le performance Iceberg dipendono da manutenzione continua: strategie di compaction, snapshot expiry, riparazione di small-file, statistiche di partizione. Sbagli una di queste e i tempi di query degradano, i costi storage strisciano in alto, e il tuo team passa i venerdì pomeriggio a fare tuning invece di shippare.

Quel carico di manutenzione è esattamente quello che servizi Iceberg managed come S3 Tables, Starburst-managed Iceberg e diversi altri stanno vendendo. Reintroducono un fee di piattaforma per togliere il dolore operativo. La domanda DIY si spacca in due: DIY puro (più economico, più duro) o DIY ibrido con catalogo managed e manutenzione tabelle managed (ancora più economico di Databricks, molto più facile del DIY pieno)? La risposta dipende dal fatto se hai una platform guild che vuole davvero possedere motori JVM, Kubernetes e interni del lakehouse, o se preferisci pagare qualcuno per gestire la compaction.

Sullo streaming, la rotta DIY brilla. Flink + Iceberg è il pattern canonico per processing event-time sub-secondo dentro il lakehouse, e la pipeline Kafka → Flink → Iceberg è abbastanza consolidata da permettere a streaming engineer esperti di metterla in piedi in un paio di settimane. Se hai letto il mio [articolo su RisingWave](https://andreabozzo.github.io/AndreaBozzo/blog/posts/iceberg-risingwave-blog.it/), sai che trovo le varianti Rust-native di questo pattern (RisingWave + Iceberg-Rust + Lakekeeper + DataFusion) particolarmente convincenti per team che vogliono uscire da operations JVM-pesanti.

## Tre Pattern di Workload, Tre Bollette

I pricing primitive diventano utili solo quando li mappi su forme di workload reali. I pattern qui sotto sono quelli che mi ritrovo a disegnare più spesso sulla lavagna. Nessuno è un modello TCO preciso; sono direzionali e assumono baseline ben tunate per ogni stack.

### Pattern 1: Feature Pipeline Batch + Retraining Settimanale del Modello

Il workload AI/ML canonico: job ETL notturni che costruiscono tabelle di feature, un job settimanale che riallena un modello, una valutazione offline che gira contro held-out data, il modello deployato su uno stack di serving.

Su Databricks vive in modo naturale. Lakeflow Declarative Pipelines (le ribattezzate Delta Live Tables) e Lakeflow Jobs gestiscono le feature pipeline; notebook e SQL warehouse servono la fase esplorativa; Mosaic AI porta training e serving. Il costo di piattaforma dipende da quanto è disciplinato il team — un team mid-size ben governato in questo pattern atterra tipicamente nel range 500–5.000 USD/mese per le DBU (~430–4.270 EUR) prima di EC2. La versione indisciplinata è molto più alta, soprattutto a causa di SQL warehouse sempre accese e cluster all-purpose sovradimensionati.

Su AWS-native, lo stesso workload si frammenta in molti job Glue piccoli e query Athena. Ogni job è economico singolarmente (l'esempio canonico da 0,66 USD), ma la bolletta totale è dominata dal numero di job e dai TB scansionati durante l'esplorazione. Storage e runtime Glue sono prevedibili; Athena è il costo variabile, e una tabella partizionata male si vede subito. Il training SageMaker è una voce a parte con pricing EC2-style familiare. Per lo stesso workload effettivo, la bolletta tende a essere più piatta e prevedibile di Databricks, anche se a volte più alta in valore assoluto una volta aggiunto SageMaker.

Su Iceberg DIY, il costo è dominato dai nodi EMR o Kubernetes che girano Spark per le feature pipeline, più storage e request S3, più qualsiasi cosa il team usi per il ciclo ML. Niente sovrapprezzo di piattaforma. A scala questa può essere l'opzione più economica con margine — ma solo se il platform team copre davvero il costo di gestire compaction e catalogo. Se non lo fa, paghi in performance degradate e firefighting del venerdì pomeriggio invece che in fatture, e spesso è peggio.

### Pattern 2: Analytics Ad-Hoc ed Esplorazione Heavy su Notebook

Il workload che sorprende di più i team in bolletta: data scientist che esplorano, lanciano query contro tutto, lasciano i notebook aperti, riallenano roba in modo informale.

Databricks è il più ergonomico dei tre per questo, e il più pericoloso sul costo. SQL warehouse serverless sempre accese e cluster all-purpose dimenticati generano DBU che qualcuno stia effettivamente lavorando o no. Cluster policy, idle timeout e quota control non sono opzionali.

Athena è costruito per questo pattern. Pay-per-query a 5 USD per TB scansionato (~4,3 EUR/TB) è difficile da battere per esplorazione sporadica, *se* le tabelle sono partizionate e colonnari. La UX notebook è meno integrata di Databricks, ma Athena Spark e capacity reservation hanno chiuso parte del gap. Per team i cui data scientist sono comodi con flussi SQL-first, è spesso il posto più economico per fare esplorazione.

Iceberg DIY con un cluster Trino condiviso dà SQL sub-secondo su Iceberg con billing prevedibile per node-ora e nessun sovrapprezzo per query. Il punto dolente è che "right-sized" richiede capacity planning vero, e gli ambienti Jupyter o simili vanno hostati a parte. I team che già fanno girare Trino tendono ad amare questo pattern; i team che no, si ritrovano a fare più platform work del previsto.

### Pattern 3: Feature Pipeline Real-Time o Low-Latency

Il workload che tutti vogliono nello schema architetturale e che pochi team davvero hanno bisogno a latenza sub-secondo.

Databricks Structured Streaming su Delta gestisce bene micro-batch al secondo, sufficiente per la maggior parte delle feature pipeline real-time che vedo nella pratica. Il serving sub-secondo è di solito delegato a un online store esterno; Mosaic AI vector search copre il serving in stile RAG dentro la piattaforma. Il costo è grosso modo consumo DBU continuo a tariffe Jobs o DLT, più il compute sottostante, che diventa prevedibile una volta che i job di streaming si stabilizzano.

AWS-native usa Glue Streaming (Spark-based) più Kinesis o MSK per ingestion in Iceberg, con online store come DynamoDB o ElastiCache per il serving. Funziona, ma il costo di composizione è reale: orchestrazione, observability e semantica exactly-once attraverso più servizi aggiungono peso operativo. Athena non è un percorso di serving; è il layer di query analytics sopra i dati streamati.

Iceberg DIY con Flink è l'opzione tecnica più forte per processing event-time davvero a bassa latenza. Pipeline sub-secondo sono raggiungibili, la semantica exactly-once è ben capita, il pattern Kafka → Flink → Iceberg è maturo. Il costo è operativo: Flink non è gentile, e farlo girare bene è una skill specializzata. Per team che ce l'hanno, l'unit economics è eccellente. Per team che no, lo streaming Databricks o AWS-native li porta a "abbastanza buono" molto più in fretta.

## Un Filtro Decisionale Pratico

Matrici di costo e confronti di feature sono utili, ma la scelta di solito si riduce a un set più piccolo di funzioni forzanti. Dalle conversazioni degli ultimi mesi, tre filtri tendono a chiudere la questione in fretta.

![Funnel decisionale lakehouse](images/Lakehouse-Decision-Funnel.png "I tre filtri che di solito chiudono la scelta lakehouse: forma del team, footprint del warehouse, appetito di portabilità")

**Forma del team, non workload.** Un team piccolo che parla AWS fluentemente e vuole un vendor in meno otterrà più cose su AWS-native che su Databricks, anche quando Databricks sembra oggettivamente migliore sulla carta. Un team con una platform guild vera che si diverte a far girare motori JVM otterrà più leva da Iceberg DIY che da una delle due opzioni managed. Un team che vuole velocità AI/ML sopra ogni altra cosa e può permettersi il fee di piattaforma si muoverà più rapido su Databricks.

**Quanta parte del warehouse resta.** Se il warehouse terrà la maggior parte dei workload analitici per il prevedibile futuro, il layer lakehouse va tenuto magro ed economico, il che spinge verso AWS-native o Iceberg DIY. Se il lakehouse assorbirà quote crescenti nel tempo, pagare per una piattaforma più integrata come Databricks ammortizza meglio.

**Appetito di portabilità.** Se multi-engine e multi-cloud sono requisiti futuri credibili — e per molti team europei nel 2026 lo sono, anche per ragioni di sovranità — Iceberg come substrato è la scommessa più sicura, e la scelta collassa su "AWS-native con Iceberg e la convenienza S3 Tables" contro "Iceberg DIY con un catalogo portabile come Lakekeeper." Delta-su-Databricks è una vendita più dura in quella postura.

## Dove Vive Davvero il Lock-In nel 2026

Un pattern vale la pena nominarlo, perché cambia il modo in cui consiglio i team adesso: **il lock-in è migrato in alto nello stack**. Per la maggior parte dell'ultima decade, la scelta del formato tabellare era la decisione strategica — Delta o Iceberg o Hudi — e sbagliarla significava una migrazione dolorosa più tardi. Quella conversazione è in larga parte chiusa. Iceberg ha effettivamente vinto come formato tabellare aperto, con supporto multi-engine ampio e sviluppo attivo nell'ecosistema.

La conversazione sul lock-in si è spostata di un layer in alto. La decisione che oggi conta di più è il **layer catalogo e piattaforma**: Unity Catalog dentro Databricks, SageMaker Lakehouse sopra Glue Data Catalog ed S3 Tables dentro AWS, o un catalogo open portabile come Lakekeeper, Nessie o Apache Polaris se vuoi vera neutralità. È lì che governance, access control, lineage e l'AI control plane si incrociano, ed è lì che gli switching cost sono più alti nel 2026.

Questo riformula anche la conversazione FinOps. Quando confronti DBU Databricks a DPU Glue a compute EMR/EKS nudo, non stai solo confrontando prezzi di compute — stai confrontando quanto stai pagando per il catalogo e l'AI control plane sopra i motori. Databricks impacchetta molto di quel valore di piattaforma dentro la DBU; AWS lo spacchetta su Glue Data Catalog, IAM, Lake Formation e SageMaker; Iceberg DIY ti lascia assemblarlo da te o comprarlo a pezzi. Nessuna delle tre è universalmente giusta. Nominare il trade-off in modo esplicito — "per cosa sto pagando sopra il motore?" — si rivela essere la domanda FinOps più affilata che puoi fare a uno qualsiasi di questi stack.

## Considerazioni Finali

Se dovessi comprimere tutto quanto sopra in un singolo pattern di raccomandazione: scegli lo stack che corrisponde al vincolo che morde per primo nel tuo team, non quello che fa la figura migliore su una matrice di feature. Per la maggior parte dei team early-stage con cui parlo, quel vincolo è la capacità di platform engineering, e la risposta onesta è AWS-native con Iceberg e una scelta di catalogo deliberata. Per team con pressione AI/ML reale e budget in linea, Databricks si guadagna il premio se ti impegni sulla disciplina FinOps dal giorno uno. Per team con una platform guild forte e un futuro multi-engine in roadmap, Iceberg DIY con un catalogo portabile invecchierà meglio, e l'unit economics ti ripagherà dell'investimento operativo.

Lo spostamento sotto a tutto questo è che il lakehouse aperto non è più una scommessa di ricerca. Iceberg è maturo, l'ecosistema dei cataloghi si sta riempiendo, e i componenti Rust-native stanno cominciando a competere seriamente con i default JVM-dominanti. Buona notizia per i team preoccupati dal lock-in, e buona notizia per il FinOps: quando il substrato è davvero portabile, negozi da una posizione più forte su ogni layer sopra.

Sono curioso di sapere quale di questi tre pattern risuona di più con il team in cui sei adesso. Se stai lavorando su una di queste decisioni e vuoi un secondo paio d'occhi — in particolare sul lato modeling FinOps — sentiti libero di scrivermi.
