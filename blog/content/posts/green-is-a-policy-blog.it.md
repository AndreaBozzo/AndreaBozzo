---
title: "Il verde è una scelta, non un fatto"
date: 2026-10-05T17:40:00+02:00
draft: false
tags: ["Testing", "Verification", "Data Quality", "Observability", "CI", "Backups", "Open Source"]
categories: ["Data Engineering", "Infrastructure"]
keywords: ["falso positivo", "dashboard verde", "evidenza dei test", "verifica dei backup", "controlli di qualità dei dati", "smoke test CI", "dbt Information Schema", "dataprof", "verifica", "metriche proxy"]
description: "Uno stato verde dice che è passata una condizione più stretta, non che è vero ciò che ti interessa. Cinque miei progetti sono diventati verdi sulla domanda sbagliata: un verificatore di backup, un test di concorrenza, uno smoke test Docker, una matrice di metadati e un controllo di qualità dei dati. La soluzione non è mai stata aggiungere controlli."
summary: "Il mio verificatore di backup ha passato 24 controlli su 24 mentre il job di backup era in failed. Non è l'unica cosa verde che ho costruito a rispondere a una domanda più stretta di quella che stavo facendo. Su cosa dimostra davvero una luce verde, e sui controlli che se la guadagnano."
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
    image: "images/green-is-a-policy-cover.webp"
    alt: "Un cerchio verde, calmo e uniforme; sotto una lente d'ingrandimento il suo interno è un groviglio di ingranaggi, fili, fogli e una ruota dentata incrinata"
    caption: "Un bit solo, e tutto quello che è stato buttato via per ottenerlo."
    relative: false
    hidden: false
---

A settembre ho scritto uno script chiamato `verify.sh`. Il suo unico compito era dirmi se i backup
del mio Raspberry Pi erano sani, perché la sera prima avevo trovato un bug che poteva farli
ammalare in silenzio.

Il giorno dopo il bug è scattato. Un test di ripristino che avevo interrotto a metà aveva lasciato
il repository dei backup bloccato, il job notturno ha scambiato il blocco per un repository
mancante, e il backup è fallito.

Ho lanciato `verify.sh`. Ventiquattro controlli. Ventiquattro passati.

Controllava che il backup fosse pianificato e che esistesse uno snapshot recente. Vero entrambi.
Nessuno dei due era la domanda. Lo script che avevo scritto apposta per beccare un backup fallito
ha guardato un backup fallito e l'ha dichiarato sano, perché controllava cosa era *pianificato*,
non cosa era *girato*.

Questa storia [l'ho già raccontata](/AndreaBozzo/blog/posts/lares-weekend-pi-blog/), e la
soluzione è noiosa: guardare l'esito dell'ultima esecuzione. Quello che non è noioso è quante
volte mi è successa la stessa cosa da allora, in progetti che con i backup non c'entrano niente.
Stack diverso, stessa forma:

**Una luce verde è la prova che è passata una condizione più stretta. Non è la prova che sia vera
la cosa che ti interessa.**

Ne hai già una in casa. La luce verde di un rilevatore di fumo collegato alla corrente vuol dire
che ha corrente. Sulla maggior parte dei rilevatori il pulsante di test verifica batteria, circuito
e sirena. Se sente davvero il fumo è un'altra prova, che si fa con una bomboletta di fumo spray
apposita, e che non fa quasi nessuno.

Lo spazio tra queste due domande è dove vivono tutti i miei bug preferiti.

## Il verde è una scelta, non un fatto

Verde e rosso non sono proprietà della realtà. Sono una compressione: qualcuno ha preso uno stato
ricco e disordinato e l'ha schiacciato in un bit su cui un essere umano può agire in meno di un
secondo. È utile. È anche una compressione con perdita, e la perdita non si vede.

![Un imbuto di carta pieno di orologi, ingranaggi, bilance, spago e fogli accartocciati, da cui cade una sola pallina verde in una ciotola](/AndreaBozzo/blog/images/green-is-a-policy-funnel.webp "Qualcuno ha scelto cosa mettere nell'imbuto. Nessuno legge l'imbuto.")

Qualcuno ha deciso cosa si misura, cosa conta come successo, quali fallimenti contano, come si
sommano i risultati e dove sta la soglia. Ogni quadratino verde si porta dietro questo contratto.
Quasi nessuno lo legge.

La lettura onesta di un controllo qualsiasi suona più o meno così:

> Dato **questo input**, in **queste condizioni**, in **questo momento**, usando **questa
> definizione di successo**, ho osservato **questo risultato**.

Quella che leggiamo davvero è: *funziona*.

Ecco quattro modi in cui ho visto accorciare quella frase, tutti presi dai miei repository, tutti
ricontrollati per questo articolo.

## Il controllo è girato. La cosa che doveva controllare no.

La versione semplice: un test che doveva far scontrare due cose, che non si sono scontrate mai, e
il test è passato lo stesso.

![Due persone con una scatola in mano camminano da lati opposti verso un unico tornello, mentre una guardia assonnata osserva e una bandierina verde sventola sopra](/AndreaBozzo/blog/images/green-is-a-policy-turnstile.webp "Quaranta round. Nessuno ha mai urtato nessuno.")

Nell'[esperimento commit-barrier](/AndreaBozzo/blog/posts/commit-barrier-iceberg-blog/) dovevo
dimostrare che due scrittori in gara per salvare lo stesso blocco di dati lo salvassero una volta,
non due. Il test per questo passava. Passa ancora: l'ho rilanciato ieri.

```
test iceberg_concurrent_writers_of_one_epoch_commit_once ... ok
iceberg race: 0/40 rounds hit a real optimistic conflict
test result: ok. 7 passed; 0 failed; 1 ignored
```

La seconda riga viene da una diagnostica il cui unico compito è diffidare della prima. Quaranta
round, zero gare. Il catalogo in memoria su cui girava il test usa un unico lock per tutto, quindi
i due scrittori facevano educatamente a turno. Un test di concorrenza che non è mai stato
concorrente, verde quaranta volte di fila. Quando ho finalmente costretto i due scrittori nella
stessa finestra, il duplicato che il test doveva escludere è comparso.

Lares, il progetto di backup dell'inizio, ha la sua versione, ed è peggio perché stava in CI. Un
controllo chiamato "no unbound variables" lanciava gli script con un ambiente vuoto. Gli script si
fermavano al loro stesso controllo di configurazione, prima di arrivare a qualunque codice valesse
la pena testare, e lo step passava ogni volta. Il mio messaggio di commit del giorno in cui l'ho
scoperto:

> That is the precise pattern this repo warns about, shipped in its own CI.

Lo stesso README promette limiti di risorse "imposti dal kernel, non dichiarati e ignorati". La sua
CI aveva un controllo dichiarato, e ignorato dal codice che doveva testare.

## Controllare l'etichetta invece della cosa

La versione semplice: sulla cassa c'era scritto mele, l'ispettore ha controllato che sulla cassa
ci fosse scritto mele, ed era piena di pere.

![Una cassetta di legno con il timbro di una mela rossa e una spunta verde, aperta su un lato per mostrare che è piena di pere](/AndreaBozzo/blog/images/green-is-a-policy-crate.webp "L'etichetta non è mai stata sbagliata.")

[Nephtys](/AndreaBozzo/blog/posts/nephtys-edge-power-blog/) è un connettore di dati che ha come
unico argomento di vendita girare leggero su schede ARM economiche come il Raspberry Pi. La sua
immagine Docker veniva pubblicata con una voce marcata `linux/arm64`, e la CI aveva uno smoke test
che verificava che quella voce ci fosse.

C'era sempre.

Dal 26 luglio al 4 agosto, il programma dietro quell'etichetta era compilato per normali PC x86.
Un valore di default nel Dockerfile (`ARG TARGETARCH=amd64`) scavalcava quello che lo strumento di
build fornisce per ogni piattaforma, quindi entrambe le versioni venivano compilate per x86 e una
delle due veniva etichettata ARM. Su un Raspberry Pi, l'hardware per cui il progetto esiste,
`docker run` rispondeva `exec format error`.

La CI non poteva accorgersene. L'etichetta non è mai stata sbagliata. La correzione legge i primi
byte di ogni binario, l'intestazione che dice per quale CPU è stato davvero compilato, e fallisce
se non corrisponde all'etichetta. È la differenza tra controllare cosa un artefatto dice di sé e
controllare cosa è.

## La forma senza la sostanza

La versione semplice: il modulo era compilato, ogni casella aveva la forma giusta, e la casella
importante era vuota.

[dbt-isrm](https://github.com/AndreaBozzo/dbt-isrm) fa girare piccoli progetti di prova su ogni
release di dbt, uno strumento molto diffuso per costruire modelli di dati, e registra cosa finisce
nelle tabelle di metadati che dbt scrive su ogni progetto. Matrice attuale: dbt dalla 2.0.0 alla
2.0.6, sei progetti, quattro modalità, 168 esecuzioni.

Tutte e 168 riescono.

Un progetto dichiara tre regole sulle sue colonne: due "mai vuota", una "chiave primaria". Il
manifest che dbt scrive le ha tutte e tre. La tabella dei metadati ha una colonna esattamente per
quello, ed è vuota in ogni riga, in ogni modalità, in ogni release
([dbt-labs/dbt#16553](https://github.com/dbt-labs/dbt/issues/16553)). Il file si legge, lo schema
è valido, l'esecuzione è riuscita. L'informazione non c'è.

E l'ironia, perché ce n'è sempre una: la mia matrice misura quanto è piena ogni colonna, e
nell'unica modalità che riempie la colonna dei tipi inferiti l'ha data piena al 100%. È piena, ma
della cosa sbagliata. Colonne dichiarate `integer`, `varchar` e `decimal(10, 2)` tornano come
`Int32`, `Utf8` e `Decimal128(10, 2)`: i nomi dei tipi di Apache Arrow, non quelli del database
([dbt-labs/dbt#16515](https://github.com/dbt-labs/dbt/issues/16515)). Lo strumento che avevo
costruito per trovare campi verdi ma vuoti è diventato verde su un campo pieno ma sbagliato. Adesso
controlla cosa dicono i valori, non solo se esistono, ed entrambi i problemi falliscono in ogni
cella a cui si applicano.

## La media va bene. Il Nord no.

La versione semplice: tre barattoli di biglie, uno dei tre guasto, versati in un barattolo grande
che sembra ancora verde.

![Due barattoli di biglie verdi su un tavolo mentre una mano ne versa un terzo, misto a biglie grigie, in un barattolo grande che sembra ancora quasi tutto verde](/AndreaBozzo/blog/images/green-is-a-policy-marbles.webp "Ogni riga è vera. Quella in alto copre solo più terreno.")

[Metric Evidence](https://github.com/AndreaBozzo/metric-evidence) è un report Power BI su ordini
inventati, con problemi piantati apposta, che mostra accanto a ogni numero le evidenze sui dati che
lo sostengono. Uno dei suoi controlli: al massimo il 5% degli ordini può essere senza categoria di
prodotto.

| Ambito | Categoria mancante | Controllo |
|---|---|---|
| Snapshot intero | 2,17% | passa |
| Settembre, tutte le regioni | 4,67% | passa |
| Settembre, Nord | 10,22% | **fallisce** |

In quella tabella non c'è niente di sbagliato. Le prime due righe dicono il vero sull'ambito che
coprono, e quell'ambito finisce per annacquare l'unica regione in cui le etichette sono sparite.
Guardi settembre e vedi verde, mentre un decimo degli ordini di settembre del Nord sta in
*Unknown*.

Lo stesso report ha anche la versione nel tempo. I dati si fermano al 20 settembre. Confronta
settembre con agosto a mesi interi e il fatturato è sceso del 39,8%. Confronta gli stessi venti
giorni di ciascuno ed è sceso dell'8,5%. Entrambi i numeri sono calcolati correttamente. Uno dei
due risponde a una domanda che nessuno dovrebbe farsi. Il report ignora anche, di proposito, il
punteggio di qualità complessivo del profiler che lo alimenta, perché un numero solo non ti dice se
il fatturato è giusto. Quel profiler l'ho scritto io. Anche il punteggio.

## Aggiungere controlli non è la soluzione

La conclusione ovvia è "aggiungi controlli". L'inizio di questo articolo è il controesempio:
`verify.sh` *era* il controllo in più. Era una luce verde che avevo costruito per sorvegliare le
altre luci verdi.

Quello che ha risolto ognuno di questi casi non sono stati più controlli. Sono stati controlli che
dimostrano di saper vedere il guasto, la bomboletta invece del pulsante di test:

- la diagnostica che conta quante volte la gara è avvenuta davvero, invece di fidarsi del test che
  dice che è avvenuta;
- costringere i due scrittori nella stessa finestra, invece di sperare che ce li mettesse lo
  scheduler;
- leggere l'intestazione del binario invece della sua etichetta;
- l'esito dell'ultima esecuzione invece della pianificazione;
- il controllo di CI verificato nei due sensi: pulito sul codice attuale, e rosso quando si
  reintroduce il bug originale;
- uno script di Metric Evidence che cambia un valore caricato alla volta, si aspetta che il report
  dica *Mismatch*, e rimette il valore a posto.

La forma comune: **un controllo che non hai mai visto fallire è una voce di corridoio.** Prima di
fidartene, fallo diventare rosso apposta. Se non ci riesci, non sai cosa misura, sai solo come si
chiama.

## Abbastanza sano per fare cosa?

Niente di tutto questo è contro il verde. Le luci verdi sono indispensabili: nessuno può leggere il
contratto completo di ogni controllo a ogni deploy. Il problema è dimenticare che un contratto
c'era, e cosa è stato buttato via quando la realtà è stata schiacciata in un bit.

Così a ogni stato faccio una domanda diversa:

- non *il job di backup gira?* ma *cosa mi convincerebbe che posso ripristinare?*
- non *la pipeline è finita?* ma *di quale proprietà dell'output ho bisogno di fidarmi?*
- non *i test passano?* ma *in che stato sono arrivati davvero?*
- non *il servizio è sano?* ma *abbastanza sano per fare cosa?*

Per la cronaca, Lares non ha ancora un test di ripristino che giri da solo. È una issue aperta.
Secondo lo standard di questo articolo, i miei backup sono soprattutto una promessa, solo
documentata meglio.

Ho cominciato a leggere ogni luce verde come una domanda invece che come una risposta: cosa è
diventato verde, esattamente, e cosa dimostra?

Di solito meno di quanto suggerisca il colore.
