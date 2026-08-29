# Calcolatore RAL → Netto — prototipo V1

Prototipo che, data una **retribuzione annua lorda (RAL)**, calcola il **netto
annuale e mensile** e mostra **tutte le voci trattenute** lungo il percorso.

Parametri fiscali e contributivi **2026**. HTML/CSS/JS vanilla, nessun framework,
nessuna dipendenza, nessun build step.

**→ [Demo online](https://calcolatore-stipendio-netto-beta.vercel.app)**

Inserisci una RAL e ottieni netto annuale, netto mensile e il totale delle
trattenute, separando le **imposte** dai **contributi previdenziali**. La scheda
*Metodo, fonti e assunzioni* documenta il calcolo, il caso modellato e i suoi
limiti; *Approfondimenti* raccoglie le spiegazioni di dominio e le estensioni
possibili.

---

## Come si usa

**Interfaccia web** — serve un server statico, perché la pagina usa ES modules
(aprire `index.html` con doppio clic non funziona: il browser blocca gli import
via `file://`). Dalla radice del progetto:

```bash
python3 -m http.server 8000
```

Poi apri <http://localhost:8000/ui/index.html>.

**Test:**

```bash
npm test
```

**Da codice:**

```js
import { calcolaNetto } from './calc/calcola-netto.js';
console.log(calcolaNetto(35000));
```

---

## Struttura

```
calc/
  inps-2026.js          Aliquote, soglia aggiuntiva, massimale contributivo
  irpef-2026.js         Scaglioni, detrazioni, cuneo fiscale, trattamento integrativo
  addizionali-2026.js   Addizionale regionale Lombardia + comunale Milano
  mensilita.js          Ripartizione del netto annuo sulle mensilità
  calcola-netto.js      Orchestrazione della pipeline (nessuna costante qui)
ui/
  index.html            Tre schede: calcolatore, metodo e assunzioni, approfondimenti
  app.js                Rendering (importa gli stessi moduli dei test)
  style.css
tests/
  calcola-netto.test.js 45 test: golden case, coerenza, soglie, mensilità
```

I parametri normativi vivono **solo** nei tre moduli di `calc/`. `calcola-netto.js`
contiene esclusivamente l'ordine dei passaggi. La UI importa gli stessi moduli
che girano nei test: la logica di calcolo non è duplicata da nessuna parte.

---

## La pipeline di calcolo

L'ordine dei passaggi ricalca quello reale della busta paga. Conta: applicare le
detrazioni all'imponibile invece che all'imposta, o calcolare le addizionali dopo
le detrazioni invece che prima, produce risultati diversi.

| # | Passaggio | Formula |
|---|-----------|---------|
| 1 | Contributi previdenziali | sulla RAL, aliquota a fasce |
| 2 | Imponibile fiscale | `RAL − contributi` (non concorrono a formare il reddito) |
| 3 | IRPEF lorda | scaglioni progressivi sull'imponibile fiscale |
| 4 | IRPEF netta | `max(0, IRPEF lorda − detrazione − cuneo detrazione)` |
| 5 | Addizionali | sull'imponibile fiscale, **prima** delle detrazioni |
| 6 | Netto | `imponibile − IRPEF netta − addizionali + cuneo somma esente + trattamento integrativo` |

L'output distingue **imposte** (IRPEF netta + addizionali) da **contributi
previdenziali**. Non è la stessa cosa: i contributi non sono un'imposta, sono
retribuzione differita che torna al lavoratore sotto forma di pensione. Il
campo `totaleTrattenute` somma le due voci, `totaleImposte` isola la prima.

Le mensilità **non cambiano l'ammontare annuo**, solo come viene ripartito — e
la ripartizione non è uniforme: vedi la sezione sulla tredicesima.

---

## Assunzioni e semplificazioni

Il dominio è vastissimo e il prototipo copre un solo caso, dichiarato. Ogni
scelta qui sotto è deliberata e motivata.

### Profilo del lavoratore

| Assunzione | Perché |
|---|---|
| Impiegato, tempo indeterminato | Caso richiesto dalla traccia. Contratti a termine e apprendistato hanno aliquote contributive diverse. |
| Residente a Milano (Lombardia) | Caso richiesto. Determina le due addizionali locali. |
| Nessun familiare a carico | Le detrazioni per carichi di famiglia dipendono da numero, età e reddito dei familiari: un intero sotto-dominio, fuori dal caso "standard". |
| Nessuna agevolazione personale | Impatriati, rientro cervelli, under 30: regimi speciali con requisiti soggettivi non desumibili da una RAL. |
| Anno intero lavorato | Permette di assumere il rapporto giorni-di-lavoro/365 = 1 nella detrazione ex art. 13 TUIR. |
| Mensilità 12 / 13 / 14 | Selezionabili, default 13. Nella realtà il numero dipende dal CCNL: le 14 sono previste da Commercio, Turismo, Credito, Assicurazioni, Chimici e Alimentari. Incidono solo sulla ripartizione, non sul totale annuo. |

### Nessun CCNL modellato

Il prototipo usa **solo parametri fiscali e contributivi nazionali**. Nessun CCNL
specifico è modellato.

Un CCNL reale aggiunge: aliquote contributive proprie (fondi sanitari, previdenza
complementare, enti bilaterali), numero di mensilità, minimi tabellari per livello,
scatti di anzianità, superminimi. Modellarli significherebbe scegliere *un* CCNL
e *un* livello, cioè restringere il prototipo invece di generalizzarlo. Il
verifica sul cedolino reale (sotto) misura esattamente questo scarto.

### Contributi INPS

Aliquota a carico dipendente **9,19%** (quota IVS, FPLD settore privato), con:

- **+1%** sulla quota eccedente **56.224 €** (art. 3-ter D.L. 384/1992, conv. L. 438/1992)
- **massimale contributivo a 122.295 €**: oltre, nessun contributo IVS dovuto

Tutti e tre i valori sono verificati sulla **Circolare INPS n. 6 del 30 gennaio
2026**. Il 9,19% è la quota del lavoratore sul 33% complessivo del FPLD: il
restante 23,81% grava sul datore di lavoro e non è modellato qui.

Assunto che la base contributiva coincida con la RAL: nessuna voce esclusa
dall'imponibile previdenziale (rimborsi, welfare, fringe benefit).

**A variare non è il CCNL, ma la categoria di lavoratore.** Il 9,19% è l'IVS del
settore privato e vale per qualunque CCNL: le aliquote contributive le fissa la
legge. Quel che cambia l'aliquota è *chi sei* — un apprendista versa il 5,84%,
e dipendenti pubblici, dirigenti, agricoli e lavoratori dello spettacolo hanno
gestioni proprie. Il modello copre il solo impiegato privato a tempo
indeterminato.

Il CCNL può però aggiungere trattenute che **non sono INPS**: fondi sanitari,
enti bilaterali, previdenza complementare. È lo scarto emerso dalla verifica sul cedolino
reale: un'aliquota implicita del **9,86%** contro il 9,19% del modello, e quei
0,67 punti sono voci contrattuali.

Resta interamente fuori la quota a carico del **datore di lavoro**, attorno al
30%: è lì che pesano settore, dimensione aziendale, inquadramento e rischio INAIL.

### IRPEF

Scaglioni **23% / 33% / 43%** con soglie a 28.000 € e 50.000 € — la L. 199/2025
riduce il secondo scaglione dal 35% al 33%.

**Detrazione da lavoro dipendente** (art. 13 TUIR, come riscritto dal
D.Lgs. 216/2023), formula a fasce 15k / 28k / 50k, spettante per intero.
Testo verificato alla lettera sulla fonte:

```
R ≤ 15.000       →  1.955
15.000 < R ≤ 28.000  →  1.910 + 1.190 × (28.000 − R) / 13.000
28.000 < R ≤ 50.000  →  1.910 × (50.000 − R) / 22.000
R > 50.000       →  0
```

> **Il salto a 15.000 € è nella norma, non nel codice.** La prima fascia dà
> 1.955 €; la seconda, valutata appena sopra i 15.000 €, dà
> `1.910 + 1.190 × (13.000/13.000) = 3.100 €`. C'è quindi una discontinuità di
> **+1.145 €** nella detrazione. È il testo letterale dell'art. 13, c. 1 TUIR,
> verificato sulla fonte. Il salto è verso l'alto, quindi non produce una zona
> trappola: attraversando i 15.000 € il netto aumenta più del lordo.
> L'art. 13 prevede anche un minimo garantito di 690 €, che in V1 non ha mai
> effetto perché rileva solo quando la detrazione è ragguagliata ai giorni di
> lavoro, e qui l'anno è intero.

**Cuneo fiscale strutturale** (L. 199/2025). La norma prevede **due meccanismi
distinti**, che agiscono in punti opposti della busta paga e non vanno confusi.

*Fino a 20.000 € — somma esente.* Un importo **non tassato che si aggiunge al
netto**. Non riduce l'imposta, non concorre alla formazione del reddito, e non
è soggetto a incapienza. Percentuali applicate all'**intero** imponibile:

```
R ≤ 8.500            →  7,1% × R
8.500 < R ≤ 15.000   →  5,3% × R
15.000 < R ≤ 20.000  →  4,8% × R
```

*Oltre 20.000 € — detrazione.* Si **sottrae dall'imposta lorda**, come una
normale detrazione:

```
20.000 < R ≤ 32.000  →  1.000 pieni
32.000 < R < 40.000  →  1.000 × (40.000 − R) / 8.000
R ≥ 40.000           →  0
```

> **Perché la distinzione conta.** Sotto i 20.000 € una detrazione varrebbe
> **zero**: su 8.500 € di reddito l'IRPEF lorda è 1.955 € e la detrazione da
> lavoro dipendente è già 1.955 €, quindi la capienza residua è nulla e
> qualunque ulteriore detrazione sarebbe interamente persa per incapienza. È
> precisamente per questo che il legislatore ha scelto la forma della somma
> esente. Implementare il tratto basso come detrazione produrrebbe un netto
> identico a quello senza alcun beneficio.

Le fasce della somma esente sono **a scalino, non marginali**: la percentuale si
applica all'intero reddito, non alla sola quota compresa nella fascia. Questo
produce discontinuità reali della norma — vedi la sezione sulle discontinuità.

Assunzione V1: base di calcolo e soglie di fascia coincidono entrambe con
l'imponibile fiscale. La norma distingue tra *reddito di lavoro dipendente*
(base del calcolo) e *reddito complessivo* (che determina la fascia); qui
coincidono, perché il lavoro dipendente è l'unica fonte di reddito assunta.

**Trattamento integrativo** (ex "bonus Renzi", D.L. 3/2020 art. 1, come
modificato dalla L. 234/2021; confermato per il 2026). È un **credito**, non una
detrazione: si aggiunge al netto e non riduce l'imposta. **Si cumula con il
cuneo** — le due misure operano su piani diversi e non si escludono.

```
R ≤ 15.000           →  1.200, ma solo se l'imposta lorda supera la
                        detrazione art. 13 diminuita di 75 € (cioè 1.880 €,
                        che equivale a un imponibile sopra ~8.174 €)
15.000 < R ≤ 28.000  →  differenza fra detrazioni spettanti e imposta lorda,
                        se positiva, con tetto a 1.200
R > 28.000           →  0
```

Verificato contro un esempio pubblicato: una RAL di 16.500 € dà 1.200 € di
trattamento integrativo **più** ~794 € di somma esente del cuneo. Il
calcolatore produce 1.200 € e 794,13 € — la coincidenza sul secondo valore
conferma anche che la base di calcolo è l'imponibile fiscale, non la RAL.

### Addizionali locali

Le due addizionali hanno **strutture diverse**, ed è corretto così — verificato
sulle fonti, non assunto.

**Regionale Lombardia — progressiva per scaglioni**, sugli stessi scaglioni
dell'IRPEF nazionale. Ogni aliquota si applica **solo alla quota di reddito
compresa nel proprio scaglione**, esattamente come l'IRPEF:

```
fino a 15.000       →  1,23%
15.000 – 28.000     →  1,58%
28.000 – 50.000     →  1,72%
oltre 50.000        →  1,73%
```

Fonte: art. 72, c. 1, L.R. Lombardia 14 luglio 2003 n. 10; aliquote pubblicate
dal Dipartimento delle Finanze (MEF), Portale del Federalismo Fiscale.

**Comunale Milano — aliquota unica dello 0,80%**, con **esenzione totale fino a
23.000 €** di imponibile. Verificato sulla
[pagina ufficiale del Comune di Milano](https://www.comune.milano.it/argomenti/tributi/addizionale-comunale-irpef)
(Deliberazione C.C. n. 46 del 28 settembre 2020 per la soglia, n. 36 del
21 ottobre 2013 per l'aliquota unica). Non è a scaglioni. Ed è una **soglia, non una
franchigia**: superati i 23.000 €, lo 0,80% si applica sull'**intero**
imponibile, non solo sull'eccedenza. Verificato sull'esempio pubblicato dalla
fonte (35.000 € imponibili → 280 € di addizionale), che un test riproduce.

Base di calcolo di entrambe: l'imponibile fiscale **prima** delle detrazioni
IRPEF — le addizionali non sono ridotte dalla detrazione per lavoro dipendente.

### TFR

Mostrato come **riga informativa separata**, escluso dal netto: il TFR matura
sulla RAL ma è accantonato, non erogato in busta paga. Quota annua `RAL / 13,5`
(art. 2120 c.c.), trascurando rivalutazione annua e contributo dello 0,50% al
Fondo di garanzia.

### Cosa è escluso, consapevolmente

| Escluso | Motivo |
|---|---|
| Maggiorazione detrazione di 65 € (fascia 25–35k) | Effetto marginale, non cambia l'ordine di grandezza. |
| Tetto alle detrazioni oltre 75k / 200k | Fuori dal caso "standard"; rileva solo su redditi alti. |
| Trattamento integrativo nella fascia 15.000–28.000 € | La norma lo riconosce se la *somma* delle detrazioni (familiari, lavoro dipendente, mutuo ante 2022) supera l'imposta lorda. Nel profilo V1 esiste la sola detrazione da lavoro dipendente, che sopra i 15.000 € non supera mai l'imposta lorda: il credito in quella fascia è quindi sempre zero. Con familiari a carico potrebbe spettare. |
| Meccanismo "a rata" delle addizionali | Nella realtà l'acconto è trattenuto in massimo 9 rate da marzo e il saldo in massimo 11 rate dopo il conguaglio. Qui tutto è calcolato **a regime**, nello stesso anno: rende il risultato leggibile come "stipendio a regime" invece che come fotografia di un anno di transizione. |
| Incapienza rimborsabile | Se le detrazioni superano l'imposta lorda, l'eccedenza è persa (IRPEF netta a zero). L'importo non goduto è comunque esposto nel campo `detrazioniNonGodute`. |
| Premi di risultato, welfare, fringe benefit, straordinari | Non desumibili da una RAL. |

---

## Perché la tredicesima è più bassa

Le mensilità non cambiano il netto annuale: cambiano solo come viene
distribuito. Ma **non lo distribuiscono in parti uguali**, e questo è il punto
che quasi nessun calcolatore online modella.

Sulle mensilità aggiuntive **non si applicano**:

- la detrazione da lavoro dipendente (art. 13 TUIR)
- il cuneo fiscale, in entrambe le sue forme
- il trattamento integrativo
- le addizionali regionale e comunale

Tutte queste voci sono parametrate sulle **dodici mensilità ordinarie**. In più,
la mensilità aggiuntiva si somma in cima al reddito e sconta quindi
l'**aliquota marginale**, non quella media.

Il modello che ne deriva è uniforme per 13 e 14 mensilità:

```
12 mensilità ordinarie    →  contributi, IRPEF e TUTTI i crediti
N − 12 mensilità aggiuntive →  solo contributi e IRPEF, ad aliquota marginale
```

L'IRPEF della mensilità aggiuntiva è calcolata **per differenza** — imposta
sull'imponibile pieno meno imposta sull'imponibile senza le mensilità
aggiuntive — così il caso in cui la mensilità è a cavallo di due scaglioni
resta esatto.

Su RAL 35.000 € con 13 mensilità: mensilità ordinaria **2.027,43 €**,
tredicesima **1.638,07 €**, cioè **−19,20%**. Un test verifica che lo scarto
resti nell'ordine di grandezza indicato dalle fonti (15–20%), e un altro che la
somma delle mensilità torni sempre al netto annuale, per tutte e quattro le
configurazioni.

Il campo `nettoMensile` resta esposto come **media**, ma non corrisponde a
nessuna busta paga reale: è la media fra dodici mensilità piene e le aggiuntive
tassate a secco.

**Semplificazione dichiarata:** le addizionali sono ripartite sulle 12 mensilità
ordinarie; nella realtà sono trattenute in 11 rate.

### Un limite di impianto

Questo calcolatore parte dal totale dell'anno e poi lo divide fra le mensilità.
Una busta paga vera fa l'opposto: ogni mese trattiene una stima, e a dicembre
tira le somme con il **conguaglio**, restituendo o recuperando la differenza.

Sul netto annuale i due modi arrivano allo stesso risultato, e così anche sullo
scarto fra una mensilità ordinaria e la tredicesima. Ma se volessi sapere quanto
ti arriva in un mese preciso — per esempio a marzo, dopo un aumento preso a
febbraio — questo calcolatore non può dirtelo.

Non è una funzione che manca e si può aggiungere: sarebbe un calcolatore
costruito al contrario.

---

## Le discontinuità del netto

Il netto **non è monotono crescente** rispetto alla RAL. Esistono tre intervalli
— chiamiamoli *zone trappola* — in cui aumentare il lordo fa incassare **meno**
netto di quanto si prenderebbe restando appena sotto la soglia. Entrambi sono
effetti reali della normativa, e nascono dalla stessa causa: sono soglie **a
scalino**, in cui superare il limite cambia il trattamento dell'**intero**
importo e non solo dell'eccedenza.

| Zona trappola | Calo massimo | Causa |
|---|---:|---|
| RAL 9.361 – 9.567 € | −152,22 € | La somma esente del cuneo scende dal 7,1% al 5,3% dell'intero reddito, superati 8.500 € di imponibile |
| RAL 16.519 – 16.719 € | −129,36 € | Il trattamento integrativo di 1.200 € decade, superati 15.000 € di imponibile. Il salto della detrazione art. 13 (+1.145 €) ne assorbe quasi tutto l'effetto, ma non del tutto |
| RAL 25.328 – 25.636 € | −183,40 € | L'addizionale comunale di Milano si attiva sull'intero imponibile, superati 23.000 € (soglia, non franchigia) |

Dentro queste fasce il calcolatore **emette un avviso esplicito**, spiegando la
causa e indicando che con una RAL inferiore il netto sarebbe più alto.

Tre test presidiano la cosa: uno scandisce l'intervallo 1–45.000 € con passo di
1 € e asserisce che le discontinuità siano **esattamente queste tre**, nella
posizione e con l'ampiezza attese; un altro verifica che dentro ogni zona il
netto sia davvero inferiore a quello di poco prima, e che la zona finisca
esattamente dove dichiarato; un terzo verifica che l'avviso compaia solo lì.
Se una soglia futura ne introducesse una terza, i test falliscono.

Oltre i 45.000 € il netto è monotono crescente fino a 200.000 €.

L'addizionale regionale, essendo **marginale**, non introduce discontinuità: un
test lo verifica esplicitamente su tutte e tre le sue soglie.

---

## Test

`npm test` — 45 test, quattro famiglie:

1. **Golden case** su RAL 25k / 30k / 35k / 45k / 70k. Congelano voce per voce
   l'output della logica validata: qualsiasi refactor che li rompa è una regressione.
2. **Coerenza interna.** Il netto quadra con la somma delle trattenute; il netto
   è monotono crescente rispetto alla RAL su tutto l'intervallo 1k–200k (nessuna
   soglia produce un salto perverso in cui guadagnare di più fa incassare di meno);
   l'IRPEF netta non è mai negativa.
3. **Soglie e casi limite.** Massimale INPS, aliquota aggiuntiva, confini degli
   scaglioni, azzeramento della detrazione a 50k, le tre fasce della somma
   esente e i tre tratti della detrazione del cuneo, la soglia di esenzione
   comunale verificata sull'esempio della fonte, gli scaglioni dell'addizionale
   regionale, i warning delle zone trappola, gli input non validi.
4. **Ripartizione sulle mensilità.** La somma delle mensilità torna al netto
   annuale per 12/13/14; il netto annuale non dipende dalle mensilità; la
   mensilità aggiuntiva è sempre più bassa dell'ordinaria; l'IRPEF che sconta è
   davvero quella marginale.
5. **Confronto con fonti esterne** — cedolino reale e tre calcolatori online (vedi sotto).

### La verifica su cedolino reale

Il modello è stato confrontato anche con un **cedolino reale** (CCNL Commercio,
14 mensilità), annualizzandone le voci. Il netto è risultato entro l'**1,42%**
del valore calcolato dal prototipo.

Non era atteso un match esatto, e non doveva esserlo: il CCNL reale ha aliquote
contributive proprie che questo modello dichiaratamente non copre. L'aliquota
implicita nel cedolino era del **9,86%** contro il 9,19% dei soli contributi
IVS, e la differenza sono le voci contrattuali — fondi sanitari, enti
bilaterali, previdenza complementare — che non sono contribuzione previdenziale
obbligatoria.

I dati del cedolino non sono nel repository: sono le retribuzioni di una
persona reale. Restano gli scostamenti misurati, che è ciò che serve a valutare
l'attendibilità del modello.

---

## Confronto con tre calcolatori online

Oltre al cedolino reale, il modello è stato confrontato con **tre calcolatori
pubblici** — indicati qui come A, B e C — su due livelli di RAL scelti per
attraversare regimi diversi. Due di essi arrotondano l'importo inserito, quindi
i loro risultati si riferiscono a 44.998 € e 11.999 €.

Il punto dell'esercizio non è stabilire chi ha ragione: è verificare che, dove
i risultati divergono, **la ragione sia identificabile**.

### RAL 45.000 € — il caso standard

| Fonte | Netto annuo | INPS | Addizionali |
|---|---:|---|---|
| Calcolatore A | 30.279,50 € | 9,19% | **non calcolate** |
| Calcolatore B | 30.033,24 € | 9,19% | sì |
| **Questo prototipo** | **30.034,26 €** | **9,19%** | **sì** |
| Calcolatore C | 29.958,00 € | 9,49% | sì, presentate aggregate |

Escursione fra i tre esterni: **321,50 €**, lo 0,71% della RAL.

**Con B la coincidenza è al centesimo**, e non solo sul totale: contributi
4.135, IRPEF netta 9.891, addizionale regionale 611, comunale 327 — ogni voce
combacia a meno dell'arrotondamento all'unità che B applica.

**A è più alto perché non calcola le addizionali.** Il suo diagramma di flusso
lo mostra apertamente: dalla RAL escono solo INPS e IRPEF, e
`imponibile 40.865 − IRPEF 10.585 = 30.280`, che è il suo risultato. Mancano i
938 € di addizionali regionale e comunale.

**C è più basso perché usa un'aliquota contributiva del 9,49%** invece del
9,19% della Circolare INPS 6/2026: 135 € l'anno di differenza. Non dichiara da
dove venga quello 0,30% aggiuntivo.

### RAL 12.000 € — dove il modello viene messo alla prova

| Fonte | Netto annuo | Cuneo | Tratt. integrativo | Addizionali |
|---|---:|---|---|---|
| Calcolatore C | 11.960,00 € | sì, 576 € | sì, 1.200 € | sì |
| **Questo prototipo** | **11.989,36 €** | **sì, 577,55 €** | **sì, 1.200 €** | **sì** |
| Calcolatore B | 11.411,12 € | **no** | sì, 1.200 € | sì |
| Calcolatore A | 10.897,20 € | **no** | **no** | **no** |

Qui l'escursione sale a **1.092 €**, il 9% della RAL: sotto i 20.000 € i
modelli divergono molto più che sul caso standard.

**B non modella la somma esente del cuneo.** Ha il trattamento integrativo, ma
`11.999 − 1.103 − 551 − 134 + 1.200 = 11.411` è esattamente il suo risultato: i
577 € di somma esente non compaiono. Su 45.000 € l'omissione non era visibile,
perché lì il cuneo vale zero.

**C è l'unico esterno completo**, e infatti dista 29 € dal nostro — differenza
interamente spiegata dalla sua aliquota INPS. Lo stesso vale a 16.500 € e a
45.000 €: C ci segue su tutti e tre i livelli, sempre con lo stesso scarto di
origine.

### RAL 16.500 € — il caso di confine

Il più discriminante dei tre: l'imponibile fiscale è **14.983,65 €**, appena
**16 € sotto** la soglia dei 15.000 € oltre la quale decade il trattamento
integrativo.

| Fonte | Netto annuo | Scarto | Causa |
|---|---:|---:|---|
| **Questo prototipo** | **15.302,25 €** | — | — |
| Calcolatore C | 15.262,00 € | −40,25 € | aliquota INPS |
| Calcolatore A | 14.983,65 € | −318,60 € | si ferma dopo i contributi |
| Calcolatore B | 14.508,11 € | −794,14 € | somma esente del cuneo |

**Ogni scarto si ricostruisce al centesimo.**

Con B: `15.302,25 − 794,13` (la nostra somma esente) `= 14.508,12`, contro i
14.508,11 dichiarati. Un centesimo di differenza, e conferma la diagnosi già
emersa a 12.000 €.

Con A: il suo netto, 14.983,65 €, è **identico al nostro imponibile fiscale**.
Dichiara "IRPEF: 0 €" a fronte di un'imposta lorda di 3.446 €, e non applica
addizionali né crediti.

Con C i 40,25 € si scompongono così: paghiamo 49,65 € in meno di contributi
(9,19% contro 9,49%), ma proprio per questo abbiamo un imponibile più alto e
paghiamo 11,24 € in più di IRPEF, 2,13 € in più di cuneo e 0,30 € in più di
addizionale. Somma: 40,24 €. **Nessuna differenza di modello, solo un
parametro.**

### La ripartizione sulle mensilità

Il confronto più istruttivo riguarda la tredicesima. Simulando sul nostro codice
una ripartizione **proporzionale** dell'IRPEF al posto di quella **marginale**:

| RAL | Questo prototipo | Variante proporzionale | Calcolatore C dichiara |
|---:|---|---|---|
| 12.000 € | 945,33 / 645,45 → −31,7% | 945,33 / 645,45 → −31,7% | 943 / 643 |
| 45.000 € | 2.327,35 / 2.106,09 → **−9,5%** | 2.309,40 / 2.321,48 → **+0,5%** | 2.304 / **2.314** |

C ripartisce l'IRPEF proporzionalmente. Sui redditi bassi non si nota, perché i
crediti dominano e il segno resta negativo; sui redditi alti, dove di crediti
non ne restano, il metodo fa **invertire il segno** e la tredicesima risulta
più alta di una mensilità ordinaria. Che è il contrario di come funziona.

È lo stesso errore commesso nella prima stesura di questo modello, corretto
perché produceva uno scarto del 7,8% invece del 15-20% indicato dalle fonti.

### Cosa se ne ricava

Nessuno dei tre calcolatori esterni fa contemporaneamente le tre cose che
contano: **aliquota contributiva da circolare**, **cuneo modellato in entrambe
le sue forme**, e **tredicesima all'aliquota marginale**.

Questo prototipo coincide con ciascuno di essi nell'intervallo in cui quel
calcolatore è completo, e dove diverge la causa è sempre riconducibile a una
voce mancante o a un parametro diverso — mai a un errore di calcolo.

C è quello che ci somiglia di più: modello completo, e uno scarto costante
dovuto alla sola aliquota contributiva. Resta però la differenza sulla
ripartizione della tredicesima, che a 45.000 € gli fa invertire il segno.

## Limiti da tenere a mente

È un **prototipo didattico**, non uno strumento di elaborazione paghe. Il numero
che produce è una stima di ordine di grandezza per il caso dichiarato. Per un
calcolo reale servono il CCNL, il livello di inquadramento, la situazione
familiare e le eventuali agevolazioni del singolo lavoratore.

Le fonti dei parametri sono citate nei commenti in testa a ciascun modulo di `calc/`.
