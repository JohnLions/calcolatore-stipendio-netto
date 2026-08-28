/**
 * ADDIZIONALI IRPEF — Regione Lombardia + Comune di Milano
 *
 * Fonti parametri (verificate):
 * - Addizionale regionale Lombardia: art. 72, c. 1, L.R. 14 luglio 2003 n. 10.
 *   Aliquote pubblicate dal Dipartimento delle Finanze (MEF), Portale del
 *   Federalismo Fiscale, regione codice 10.
 *   -> PROGRESSIVA PER SCAGLIONI, sugli stessi scaglioni dell'IRPEF nazionale.
 * - Addizionale comunale Milano: aliquota unica dello 0,80% con soglia di
 *   esenzione a 23.000€ di reddito imponibile.
 *   -> ALIQUOTA UNICA sull'intero imponibile, non a scaglioni.
 *
 * Le due addizionali hanno quindi STRUTTURE DIVERSE, ed è corretto così:
 * la regionale è marginale (ogni aliquota solo sulla quota di reddito nel
 * proprio scaglione), la comunale è piatta sull'intero imponibile.
 *
 * Assunzioni V1:
 * - Base di calcolo: l'imponibile fiscale (RAL - contributi), PRIMA delle
 *   detrazioni IRPEF. Le addizionali non sono infatti ridotte dalle
 *   detrazioni per lavoro dipendente.
 * - Escluso il meccanismo reale "a rata": le addizionali dell'anno N sono
 *   trattenute in 11 rate nell'anno N+1. Qui sono calcolate a regime, come
 *   se maturassero e fossero trattenute nello stesso anno.
 */

/**
 * Scaglioni dell'addizionale regionale Lombardia. `fino` è il limite superiore
 * dello scaglione: come per l'IRPEF nazionale, ogni aliquota si applica SOLO
 * alla quota di reddito compresa nel proprio scaglione.
 */
export const ADDIZIONALE_REGIONALE_LOMBARDIA_SCAGLIONI = [
  { fino: 15000, aliquota: 0.0123 },
  { fino: 28000, aliquota: 0.0158 },
  { fino: 50000, aliquota: 0.0172 },
  { fino: Infinity, aliquota: 0.0173 },
];

export const ADDIZIONALE_COMUNALE_MILANO = {
  ALIQUOTA: 0.008,
  SOGLIA_ESENZIONE: 23000,
};

/**
 * Addizionale regionale Lombardia, progressiva per scaglioni.
 *
 * @param {number} imponibile imponibile fiscale in euro
 * @returns {number} addizionale annua in euro
 */
export function calcolaAddizionaleRegionale(imponibile) {
  let addizionale = 0;
  let sogliaPrecedente = 0;

  for (const scaglione of ADDIZIONALE_REGIONALE_LOMBARDIA_SCAGLIONI) {
    if (imponibile <= sogliaPrecedente) break;

    const baseTassata = Math.min(imponibile, scaglione.fino) - sogliaPrecedente;
    addizionale += baseTassata * scaglione.aliquota;
    sogliaPrecedente = scaglione.fino;
  }

  return addizionale;
}

/**
 * Addizionale comunale Milano, con esenzione totale sotto soglia.
 * @param {number} imponibile imponibile fiscale in euro
 * @returns {number} addizionale annua in euro
 */
export function calcolaAddizionaleComunale(imponibile) {
  if (imponibile <= ADDIZIONALE_COMUNALE_MILANO.SOGLIA_ESENZIONE) {
    return 0;
  }
  return imponibile * ADDIZIONALE_COMUNALE_MILANO.ALIQUOTA;
}
