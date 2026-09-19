---
title: "Quando un progetto Raspberry Pi del weekend è diventato infrastruttura"
date: 2026-09-19T10:00:00+02:00
draft: false
tags: ["Raspberry Pi", "Self-Hosting", "Backups", "restic", "SQLite", "Docker", "Tailscale", "Disaster Recovery", "Open Source"]
categories: ["Infrastructure", "Open Source"]
keywords: ["Lares", "Raspberry Pi 5", "self-hosted", "backup Vaultwarden", "backup SQLite WAL", "restic", "Backblaze B2", "memory cgroup", "Uptime Kuma", "ntfy", "disaster recovery", "infrastruttura domestica"]
description: "Un weekend iniziato con la ventola impolverata di una PS5 e finito con DNS, un password manager, backup offsite e una procedura per ricostruire tutto da disco vuoto su un Raspberry Pi da 4 GB, più un piccolo progetto open source chiamato Lares. Le parti utili sono venute quasi tutte da cose che si rompevano."
summary: "Sabato ho pulito una PS5. Domenica sera un Raspberry Pi da 4 GB faceva da DNS, custodiva le mie password e si faceva i backup offsite, e le lezioni imparate erano diventate Lares, un piccolo stack pubblico costruito attorno a cosa succede quando le cose si rompono. Lunedì ha morso."
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
    image: "images/lares-cover.webp"
    alt: "Una PS5 mezza smontata, un Raspberry Pi 5 e un SSD esterno su una scrivania, di sera"
    caption: "La cosa è sfuggita di mano."
    relative: false
    hidden: false
---

Lo scorso weekend è iniziato con me che toglievo la polvere dalla PS5.

Niente di drammatico. Pannelli laterali via, ventola fuori, aspirapolvere a portata di mano. Uno di
quei lavori che rimandi per mesi perché la console tanto funziona, finché un sabato la guardi e
decidi che, a quanto pare, oggi è il giorno.

Qualche ora dopo stavo configurando un DNS su un Raspberry Pi.

Domenica sera avevo un password manager, dei backup offsite, una procedura di disaster recovery e
un progetto open source nuovo di zecca. Niente di tutto questo era previsto.

![La ventola di una PS5, smontata e coperta di polvere](/AndreaBozzo/blog/images/lares-ps5-fan.webp "Da qui è partito tutto.")

## Un Pi senza niente da fare

Il Pi era già lì. L'avevo comprato quest'anno per
[Nephtys](/AndreaBozzo/blog/posts/nephtys-edge-power-blog/), perché volevo hardware edge vero per i
benchmark invece di fidarmi dell'opinione del mio portatile su cosa conti come "edge". I benchmark
erano finiti. Quello che restava era un Pi 5, un Samsung T7 e la sensazione che la macchina
dovesse fare qualcosa nel restante 99% della sua vita.

Non volevo l'ennesimo deploy giocattolo. Ne ho già abbastanza. Volevo una macchina di cui mi sarei
accorto se fosse andata offline.

Tanto per chiarire la scala: questo non è un homelab. È un Pi con 4 GB di RAM, lo swap su zram
(quindi "basta aggiungere swap" vuol dire spendere RAM per risparmiare RAM) e un solo SSD, che è
anche il disco di boot. Niente NAS, niente cluster, nessun nodo di riserva pronto a subentrare. Il
che, sinceramente, ha semplificato le cose. Inutile progettare per hardware che non ho.

Tutto è finito in un repository privato. Lo chiamerò il repo di casa, visto che tanto non potete
aprirlo: descrive la mia macchina reale, con il suo hostname, lo storage, la mia rete e tutti i
piccoli compromessi che un computer vero si porta dietro.

Poi ho iniziato ad aggiungere le cose che mi vedevo davvero usare.

Syncthing, così il telefono manda le foto al Pi senza che ci debba pensare. Samba, perché un file
server dovrebbe comportarsi da file server e non richiedere `scp` ogni volta. Tailscale, che ha
reso noioso l'accesso remoto, ed è il complimento più bello che si possa fare all'accesso remoto.
Poi AdGuard Home. Poi Vaultwarden. Poi Uptime Kuma.

Come elenco, niente di interessante. Le cose si sono fatte interessanti quando ho iniziato a
fidarmi.

## Il vault ha rovinato l'atmosfera

Con un container per hobby puoi stare rilassato. La dashboard muore, la riavvii. Il database di
test sparisce, alzi le spalle.

Un password manager è un'altra storia. Nel momento in cui Vaultwarden è finito sulla macchina, ho
dovuto chiedermi cosa significasse davvero il mio backup.

A quel punto il backup era restic, che ogni notte spingeva il filesystem su Backblaze B2.
Normalissimo. Solo che copiava anche un database SQLite vivo in modalità WAL, nel mezzo di
qualunque transazione stesse girando in quel momento. Roba che funziona benissimo fino alla prima
volta in cui conta.

Così adesso è SQLite stesso a farsi lo snapshot, con i lock giusti. Lo snapshot passa un
`integrity_check`, e solo dopo restic ha il permesso di vederlo. Se lo snapshot del vault fallisce,
fallisce tutto il backup.

Quest'ultima parte mi è costata due tentativi. La prima versione teneva su disco lo snapshot buono
precedente quando quello nuovo falliva, il che sembra prudente finché non ti accorgi di cosa
significa: il backup di oggi si porta dietro in silenzio il vault di ieri e dice comunque
"successo". Preferisco il rumore.

## Il kernel aveva altri piani

Con la memoria è andata allo stesso modo.

Con 4 GB da dividere, ho dato un limite di memoria a ogni container. Il file Compose era
bellissimo. Ogni servizio aveva il suo tetto.

Peccato che Raspberry Pi OS parta con il memory cgroup disabilitato, quindi Docker li aveva buttati
via tutti in silenzio. Una riga di warning, e `docker inspect` che riportava `Memory=0` mentre il
file Compose sosteneva il contrario. La configurazione diceva che i container erano limitati. Il
kernel non era d'accordo, e queste discussioni le vince il kernel.

Mi piace questo esempio perché è tutto il weekend in miniatura. Verifichiamo di aver *chiesto* a un
sistema di fare qualcosa, e poi lo trattiamo come prova che l'abbia *fatto*. Così il repo di casa
si è riempito piano piano di controlli su ciò che è vero davvero: non "Compose contiene
`mem_limit`?" ma "cosa dice `memory.max`?"; non "il container DNS è su?" ma "un dominio bloccato
torna bloccato?"; non "il timer del backup è attivo?" ma "quand'è stato l'ultimo snapshot buono?".

Syncthing mi ha dato la stessa lezione in un altro modo. Ha accettato tranquillamente un percorso
che per me aveva perfettamente senso, e ha scritto tutto in un volume Docker anonimo invece che
nello storage di cui facevo il backup. Tutto sembrava in salute. I file c'erano. Solo non dove Samba
o il backup potevano vederli.

Verificare il comportamento, non le dichiarazioni. È diventata la regola per il resto del weekend.

## Domenica: fingere che il Pi sia morto

Domenica il Pi era diventato utile, il che ha creato un problema nuovo. Cosa succede quando muore
l'SSD?

I dischi muoiono. Se questa cosa tiene i miei file, il mio DNS e le mie password, "probabilmente mi
ricordo come l'ho configurato" non è un piano. Così ho passato la domenica a fingere che la macchina
fosse già morta.

Ne è uscito più codice che da tutti i servizi messi insieme. Uno script di bootstrap che porta un Pi
vuoto a un host funzionante, con una modalità `--check` che ti dice cosa farebbe senza farlo. Uno
script di restore. Timer systemd. Immagini fissate per digest invece di `latest`, perché scoprire a
metà di un recovery che una nuova immagine di Vaultwarden ha deciso di migrarti il vault è un tipo
molto particolare di brutta giornata.

Testare il restore è stato, ovviamente, il momento in cui ho rotto qualcosa. Ho puntato un restore
di prova su `/tmp`, che su Raspberry Pi OS è un tmpfs da 2 GB. In altre parole, RAM. La memoria
libera è scesa da 3,3 GiB a meno di 1 GiB prima che lo fermassi, sulla macchina che faceva da DNS a
tutti i miei dispositivi. Lo script di restore ora rifiuta le destinazioni tmpfs e controlla lo
spazio libero prima di partire. Lezione imparata alla vecchia maniera.

Alla fine il recovery si è ridotto a tre cose che non devono morire insieme alla macchina: il
repository, il backup cifrato offsite e le credenziali per aprirlo.

![Disaster recovery di Lares: tre cose tenute fuori dalla macchina, poi nove passi da una macchina vuota a un host funzionante](/AndreaBozzo/blog/images/lares-recovery.webp "Ricostruire, non riparare: cosa deve sopravvivere fuori dalla macchina, e la strada per tornare da un disco vuoto")

La terza nasconde una trappola deliziosa. Vaultwarden non può essere l'unico posto in cui sta la
password del backup che contiene Vaultwarden. Servirebbe la password per ripristinare il vault che
contiene la password. Ci ho messo più di quanto vorrei ammettere ad accorgermene. Il README del repo
di casa, scritto sabato, dice in grassetto che la password di restic va in Vaultwarden.

Certi segreti devono vivere in un posto molto noioso. La carta, fastidiosamente, è ancora bravissima
in questo.

## La notifica che non notificava nessuno

L'altro momento clou della domenica. Uptime Kuma aveva cinque monitor e nessun modo di dirlo a
qualcuno: registrava i disservizi e se li teneva per sé. Così ho aggiunto ntfy, l'ho esposto tramite
Tailscale e ho puntato Kuma allo stesso indirizzo HTTPS che usa il mio telefono. Perfettamente
ragionevole.

Poi ho fermato Vaultwarden per provarlo, e il telefono è rimasto in silenzio per tre minuti.

L'avviso partiva da un container e andava verso un altro, e l'hostname della tailnet per il DNS del
container non significava niente. L'integrazione esisteva, la UI diceva che esisteva, e non
raggiungeva nessuno. L'URL giusto era semplicemente `http://ntfy`. Dopo la correzione, fermare
Vaultwarden mi faceva vibrare il telefono in circa due minuti. Il traffico interno usa nomi interni.
Ovvio col senno di poi, come tutto in questo post.

## Domenica sera: un progetto open source per sbaglio

Domenica pomeriggio ho guardato il repo di casa e ho capito che una parte poteva essere utile anche
fuori da casa mia.

Non l'elenco dei servizi. Esistono migliaia di file Compose con dentro AdGuard e Vaultwarden. Le
parti utili erano gli snapshot SQLite, i limiti di memoria verificati sul kernel, la protezione
contro il tmpfs, le UI di amministrazione che non toccano mai la LAN e una procedura di recovery che
avevo percorso davvero.

Il repo di casa non poteva diventare pubblico, e non deve. Sa troppe cose del mio Pi, ed è
esattamente il suo lavoro. Così ho tirato fuori le parti che non erano specifiche di casa mia, e sono
diventate [Lares](https://github.com/AndreaBozzo/lares). Il nome viene dai Lari romani, le divinità
protettrici della casa. Un po' pretenzioso per un repo fatto soprattutto di snapshot SQLite e
configurazione di Samba, ma mi piaceva.

![Architettura di Lares: dispositivi fidati, l'host di casa con Tailscale, i servizi Compose e restic, e lo storage offsite](/AndreaBozzo/blog/images/lares-architecture.webp "Le UI di amministrazione ascoltano su localhost e sono pubblicate solo sulla tailnet; Samba è l'unica cosa sulla LAN; restic è l'unica cosa che esce di casa")

La prima versione sembrava sorprendentemente pulita. Poi l'ho letta come se un estraneo stesse per
clonarla, e ha cominciato a confessare.

Lo script di backup usava una variabile che esisteva solo sulla mia macchina, quindi ogni backup
programmato sarebbe morto prima di scrivere un byte. La configurazione di Samba conteneva
`${PI_USER}`, che Samba non espande, quindi avrebbe rifiutato ogni login. La guida di recovery
diceva di ripristinare su `/tmp`, che, come abbiamo visto, lo script di restore rifiuta. E il vero
hostname del mio Pi era sopravvissuto alla pulizia come valore funzionante in `compose.yaml`.

Anche la CI ha avuto il suo momento. Un controllo pensato per trovare variabili di shell non
definite lanciava gli script con un ambiente vuoto, gli script uscivano subito perché mancava il
loro file di configurazione, e la CI diventava verde. Un test che passa su codice che non ha mai
raggiunto. Ho già
[scritto di questa esatta specie di bug](/AndreaBozzo/blog/posts/commit-barrier-iceberg-blog/), e a
quanto pare avevo bisogno di ripassarla.

E il mio preferito: il controllo che avevo scritto per evitare che l'ID della mia tailnet finisse
online funzionava cercando l'ID della mia tailnet. Il rilevatore di leak era l'ultimo leak rimasto.
Adesso cerca la *forma* di un leak invece di un elenco dei miei valori privati.

Renderlo generico ha costretto ogni assunzione a rispondere a una domanda: fa parte del design, o è
solo vero a casa mia?

## Lunedì: ha morso

Mentre sistemavo Lares domenica sera, ho trovato un bug nello script di backup. Prima di ogni
esecuzione controllava se il repository restic esistesse, e se il controllo falliva dava per
scontato che il repository non ci fosse ancora e ne creava uno.

Il problema è che "il repository non esiste" e "in questo momento non riesco a raggiungere il
repository" da quel controllo sembrano identici. Indovina male e ti ritrovi un repository nuovo e
vuoto che fa backup felice per sempre, mentre quello vero resta irraggiungibile e il monitor rimane
verde. Così Lares ha smesso di tirare a indovinare. Fallisce, e dice cosa si rifiuta di decidere.

L'ho corretto in Lares. Nel repo di casa, quella sera, no.

Lunedì è scattato davvero. Un restore di prova che avevo interrotto con `pkill` aveva lasciato tre
lock nel repository su B2, il lock faceva fallire il controllo, e l'esecuzione notturna ha annunciato
che il repository non era inizializzato e ha provato a crearne uno nuovo. Esattamente sopra il backup
esistente.

Restic si è rifiutato, perché il repository era chiaramente già lì. Quel rifiuto è l'unica ragione
per cui questa storia fa ridere.

E non è finita. Ho lanciato `verify.sh`, lo script che avevo scritto la sera prima proprio per
questo genere di cose, sul Pi rotto. Tutti e ventiquattro i controlli sono passati. Il timer era
attivo, uno snapshot recente esisteva, e intanto il job di backup era fermo in `failed`. Il mio
stesso verificatore controllava cosa era programmato, non cosa era girato davvero. Verificare il
comportamento, non le dichiarazioni. Sì, lo so.

Adesso entrambi i repo ripuliscono prima i lock vecchi, non creano mai un repository di loro
iniziativa e controllano l'esito dell'ultima esecuzione. Se due guasti sembrano identici dal punto in
cui ti trovi, l'automazione non ha il diritto di scegliere quello comodo.

Lunedì ha risposto anche all'ultima domanda della lista: e se il Pi venisse compromesso? La
documentazione sosteneva che la chiave B2, limitata a un solo bucket, non potesse cancellare i
propri backup. Ho chiesto a B2 cosa potesse fare davvero quella chiave, e `deleteFiles` era lì in
bella vista. Il limite al bucket decide *quale* bucket, non cosa puoi farci dentro. Adesso il Pi ha
una chiave append-only: può aggiungere backup e leggerli, non cancellarli. Un'altra dichiarazione,
un altro controllo.

## Com'è andata a finire

Oggi i due repo si dividono il lavoro in modo pulito. Il repo di casa è com'è fatta davvero la mia
macchina. Lares è quello che ho imparato facendola girare e che vale la pena tenere anche quando la
mia macchina esce dalla storia. Le correzioni viaggiano in entrambe le direzioni, e alcune cose
restano private di proposito. Il mio Pi ora accetta solo chiavi SSH, per esempio, ma farne un default
di Lares chiuderebbe fuori chiunque abbia seguito la guida di installazione con una password.

Lares fa girare AdGuard Home, Syncthing, Vaultwarden, Uptime Kuma, ntfy, Samba, Tailscale e restic
in circa 900 MiB di RAM. Potrei sostituirne metà domani e resterebbe lo stesso progetto, perché il
progetto sono in realtà le domande. E se il database sta scrivendo durante il backup? E se
un'immagine cambia a monte? E se il backup smette di girare in silenzio? E se tra sei mesi devo
ricostruire tutto, dopo essermene dimenticato metà?

Resta parecchio da fare, parcheggiato in issue aperte e non in buoni propositi: le route di
Tailscale che vivono ancora in prosa, un output di verifica leggibile da una macchina, e un restore
canary che giri da solo, perché un backup che nessuno ha mai ripristinato è ancora soprattutto una
promessa.

Quello che sto cercando in tutti i modi di non fare è trasformarlo in una distribuzione da homelab.
C'è sempre un altro servizio da installare, e quella strada non finisce mai. Quello che voglio è più
piccolo: pochi servizi che contano, su hardware che capisco, con modi di rompersi che ho davvero
provocato, e una strada per tornare indietro quando la macchina, prima o poi, morirà.

Ci è voluto un weekend, più un lunedì in cui mi ha morso. Mentre scrivo il Pi è acceso da circa 120
ore, e lo uso tutti i giorni senza pensarci, che era esattamente il punto.

E le ventole della PS5 sono pulite.
