/**
 * IRPEF 2026 — scaglioni, detrazione da lavoro dipendente, cuneo fiscale
 *
 * Fonti parametri:
 * - Scaglioni e aliquote: L. 199/2025 (legge di bilancio 2026), che riduce
 *   dal 35% al 33% l'aliquota del secondo scaglione.
 * - Detrazione da lavoro dipendente: art. 13 TUIR, come riscritto dal
 *   D.Lgs. 216/2023 (fasce 15.000 / 28.000 / 50.000).
 * - Cuneo fiscale strutturale: L. 199/2025.
 */

/**
 * Scaglioni IRPEF 2026. `fino` è il limite superiore dello scaglione
 * (progressione per scaglioni: ogni aliquota si applica solo alla quota
 * di imponibile compresa nel proprio scaglione).
 */
export const IRPEF_SCAGLIONI = [
  { fino: 28000, aliquota: 0.23 },
  { fino: 50000, aliquota: 0.33 },
  { fino: Infinity, aliquota: 0.43 },
];

/**
 * IRPEF lorda per scaglioni progressivi.
 *
 * @param {number} imponibile imponibile fiscale (RAL al netto dei contributi)
 * @returns {number} imposta lorda annua in euro
 */
export function calcolaIrpefLorda(imponibile) {
  let irpef = 0;
  let sogliaPrecedente = 0;

  for (const scaglione of IRPEF_SCAGLIONI) {
    if (imponibile <= sogliaPrecedente) break;

    const baseTassata = Math.min(imponibile, scaglione.fino) - sogliaPrecedente;
    irpef += baseTassata * scaglione.aliquota;
    sogliaPrecedente = scaglione.fino;
  }

  return irpef;
}

/**
 * Detrazione per redditi da lavoro dipendente — art. 13, c. 1 TUIR.
 *
 * Formula a fasce:
 *   <= 15.000            -> 1.955 fissi
 *   15.000 < R <= 28.000 -> 1.910 + 1.190 * (28.000 - R) / 13.000
 *   28.000 < R <= 50.000 -> 1.910 * (50.000 - R) / 22.000
 *   > 50.000             -> 0
 *
 * Assunzioni V1:
 * - Rapporto giorni-di-lavoro/365 assunto pari a 1 (anno intero lavorato).
 *   La norma ragguaglia la detrazione ai giorni di lavoro nell'anno.
 * - Detrazione spettante per intero: nessun altro reddito che concorra
 *   alla formazione del reddito complessivo.
 * - Esclusa la maggiorazione di 65€ prevista per la fascia 25.000-35.000.
 *
 * @param {number} imponibile reddito complessivo (qui = imponibile fiscale)
 * @returns {number} detrazione annua spettante in euro
 */
export function detrazioneLavoroDipendente(imponibile) {
  if (imponibile <= 15000) {
    return 1955;
  }
  if (imponibile <= 28000) {
    return 1910 + (1190 * (28000 - imponibile)) / 13000;
  }
  if (imponibile <= 50000) {
    return (1910 * (50000 - imponibile)) / 22000;
  }
  return 0;
}

/**
 * Cuneo fiscale strutturale — L. 199/2025.
 *
 * ATTENZIONE: la norma prevede DUE meccanismi distinti, che agiscono in punti
 * diversi della busta paga e NON vanno confusi:
 *
 *   reddito <= 20.000  ->  SOMMA ESENTE: un importo non tassato che si AGGIUNGE
 *                          al netto. Non riduce l'IRPEF, non concorre alla
 *                          formazione del reddito. Vedi `sommaEsenteCuneo`.
 *
 *   reddito >  20.000  ->  DETRAZIONE: si SOTTRAE dall'imposta lorda, come una
 *                          normale detrazione. Vedi `detrazioneCuneo`.
 *
 * La distinzione non è formale. Sotto i 20.000€ una detrazione varrebbe zero:
 * su 8.500€ di reddito l'IRPEF lorda è 1.955€ e la detrazione da lavoro
 * dipendente è già 1.955€, quindi la capienza residua è nulla e qualunque
 * ulteriore detrazione verrebbe interamente persa per incapienza. È proprio
 * per questo che il legislatore ha scelto la forma della somma esente.
 */

/** Soglia che separa il tratto "somma esente" dal tratto "detrazione". */
export const SOGLIA_CUNEO_SOMMA_DETRAZIONE = 20000;

/**
 * Fasce della somma esente (tratto fino a 20.000€).
 *
 * ATTENZIONE: sono fasce A SCALINO, non scaglioni marginali. La percentuale si
 * applica all'INTERO reddito, non alla sola quota compresa nella fascia. Questo
 * produce due discontinuità reali della norma, in cui un euro lordo in più fa
 * incassare meno netto:
 *   - superando 8.500€:  603,50€ -> 450,55€  (-152,95€)
 *   - superando 15.000€: 795,00€ -> 720,05€  ( -74,95€)
 * Non è un artefatto dell'implementazione: è il disegno della norma.
 */
export const CUNEO_FASCE_SOMMA_ESENTE = [
  { fino: 8500, percentuale: 0.071 },
  { fino: 15000, percentuale: 0.053 },
  { fino: SOGLIA_CUNEO_SOMMA_DETRAZIONE, percentuale: 0.048 },
];

/**
 * Somma esente del cuneo fiscale — tratto fino a 20.000€.
 *
 * Importo non tassato che si aggiunge al netto in busta. Non riduce l'imposta
 * e non è soggetto a incapienza: spetta per intero a prescindere dall'IRPEF
 * dovuta.
 *
 * Assunzioni V1:
 * - Base di calcolo e soglie di fascia coincidono entrambe con l'imponibile
 *   fiscale. La norma distingue tra "reddito di lavoro dipendente" (base del
 *   calcolo) e "reddito complessivo" (che determina la fascia): qui coincidono,
 *   perché assumiamo che il lavoro dipendente sia l'unica fonte di reddito.
 * - Reddito già rapportato all'intero anno (anno intero lavorato).
 *
 * @param {number} reddito imponibile fiscale in euro
 * @returns {number} somma esente annua in euro
 */
export function sommaEsenteCuneo(reddito) {
  if (reddito <= 0) return 0;

  for (const fascia of CUNEO_FASCE_SOMMA_ESENTE) {
    if (reddito <= fascia.fino) {
      return reddito * fascia.percentuale;
    }
  }

  return 0; // oltre 20.000€ opera la detrazione, non la somma esente
}

/**
 * Detrazione del cuneo fiscale — tratto oltre 20.000€.
 *
 *   20.000 <  R <= 32.000  ->  1.000 pieni
 *   32.000 <  R <  40.000  ->  1.000 × (40.000 − R) / 8.000
 *   R >= 40.000            ->  0
 *
 * @param {number} reddito imponibile fiscale in euro
 * @returns {number} detrazione annua in euro
 */
export function detrazioneCuneo(reddito) {
  if (reddito <= SOGLIA_CUNEO_SOMMA_DETRAZIONE) {
    return 0; // opera la somma esente
  }
  if (reddito <= 32000) {
    return 1000;
  }
  if (reddito < 40000) {
    return (1000 * (40000 - reddito)) / 8000;
  }
  return 0;
}

/**
 * TRATTAMENTO INTEGRATIVO (ex "bonus Renzi") — D.L. 3/2020 art. 1,
 * come modificato dalla L. 234/2021. Confermato per il 2026.
 *
 * È un CREDITO, non una detrazione: si aggiunge al netto in busta e non riduce
 * l'imposta. Si CUMULA con il cuneo fiscale — le due misure operano su piani
 * diversi e non si escludono a vicenda.
 */
export const TRATTAMENTO_INTEGRATIVO = {
  IMPORTO_MASSIMO: 1200,
  SOGLIA_IMPORTO_PIENO: 15000,
  SOGLIA_SPETTANZA: 28000,
  // La capienza si verifica contro la detrazione art. 13 RIDOTTA di 75 euro.
  RIDUZIONE_CAPIENZA: 75,
};

/**
 * Trattamento integrativo spettante.
 *
 *   R <= 15.000            ->  1.200 pieni, ma solo se l'imposta lorda supera
 *                              la detrazione art. 13 diminuita di 75 euro
 *                              (con detrazione piena: imposta lorda > 1.880)
 *   15.000 < R <= 28.000   ->  differenza tra detrazioni spettanti e imposta
 *                              lorda, se positiva, con tetto a 1.200
 *   R > 28.000             ->  0
 *
 * Assunzioni V1:
 * - Nella fascia 15.000-28.000 la norma confronta l'imposta lorda con la SOMMA
 *   di più detrazioni (carichi di famiglia ex art. 12, lavoro dipendente ex
 *   art. 13, e alcuni oneri come i mutui prima casa ante 2022). Nel profilo
 *   modellato esiste solo la detrazione da lavoro dipendente, quindi è l'unica
 *   che entra nel confronto. Per questo, in V1, in quella fascia il
 *   trattamento integrativo non spetta mai: la detrazione da lavoro dipendente
 *   da sola non supera mai l'imposta lorda sopra i 15.000 euro.
 * - Importo non ragguagliato ai giorni: anno intero lavorato.
 *
 * @param {number} reddito imponibile fiscale in euro
 * @param {number} irpefLorda imposta lorda in euro
 * @param {number} detrazioneLavoro detrazione art. 13 spettante in euro
 * @returns {number} credito annuo in euro
 */
export function trattamentoIntegrativo(reddito, irpefLorda, detrazioneLavoro) {
  if (reddito > TRATTAMENTO_INTEGRATIVO.SOGLIA_SPETTANZA) {
    return 0;
  }

  if (reddito <= TRATTAMENTO_INTEGRATIVO.SOGLIA_IMPORTO_PIENO) {
    const sogliaCapienza =
      detrazioneLavoro - TRATTAMENTO_INTEGRATIVO.RIDUZIONE_CAPIENZA;
    return irpefLorda > sogliaCapienza
      ? TRATTAMENTO_INTEGRATIVO.IMPORTO_MASSIMO
      : 0;
  }

  return Math.min(
    TRATTAMENTO_INTEGRATIVO.IMPORTO_MASSIMO,
    Math.max(0, detrazioneLavoro - irpefLorda)
  );
}
