/**
 * RIPARTIZIONE DEL NETTO ANNUO SULLE MENSILITÀ
 *
 * Le mensilità NON cambiano il netto annuale: cambiano come viene distribuito.
 * Ma non lo distribuiscono in parti uguali, ed è qui che sta il punto.
 *
 * Sulle mensilità aggiuntive (tredicesima, quattordicesima…) NON si applicano:
 *   - la detrazione da lavoro dipendente (art. 13 TUIR)
 *   - il cuneo fiscale, in entrambe le sue forme
 *   - il trattamento integrativo
 *   - le addizionali regionale e comunale
 *
 * Tutte queste voci sono parametrate sulle DODICI mensilità ordinarie. La
 * mensilità aggiuntiva sconta quindi contributi e IRPEF "a secco", e il suo
 * netto risulta più basso di quello di un mese ordinario — tipicamente del
 * 15-20%. È il motivo per cui la tredicesima in busta delude sempre.
 *
 * Il modello che ne deriva è uniforme per 13 e 14 mensilità:
 *   12 mensilità ordinarie  ->  portano contributi, IRPEF e TUTTI i crediti
 *   N − 12 mensilità aggiuntive  ->  portano solo contributi e IRPEF
 */

import { calcolaIrpefLorda } from './irpef-2026.js';

/** Mensilità contrattuali ammesse dal prototipo. */
export const MENSILITA_AMMESSE = [12, 13, 14];

/** Le mensilità ordinarie sono sempre dodici: le altre si aggiungono. */
export const MENSILITA_ORDINARIE = 12;

/**
 * Ripartisce il netto annuo fra mensilità ordinarie e aggiuntive.
 *
 * @param {object} annuo totali annui già calcolati
 * @param {number} annuo.ral
 * @param {number} annuo.contributiInps
 * @param {number} annuo.irpefLorda
 * @param {number} annuo.irpefNetta
 * @param {number} annuo.cuneoSommaEsente
 * @param {number} annuo.trattamentoIntegrativo
 * @param {number} annuo.addizionali somma di regionale e comunale
 * @param {number} mensilita numero di mensilità contrattuali
 * @returns {{ordinaria: object, aggiuntiva: object|null}}
 */
export function ripartisciMensilita(annuo, mensilita) {
  const aggiuntive = mensilita - MENSILITA_ORDINARIE;

  const lordoMensile = annuo.ral / mensilita;
  const contributiMensili = annuo.contributiInps / mensilita;
  const imponibileMensile = annuo.imponibileFiscale / mensilita;

  // L'IRPEF della mensilità aggiuntiva NON è la quota proporzionale: la
  // mensilità aggiuntiva si somma in cima al reddito e sconta quindi
  // l'aliquota MARGINALE. La calcoliamo per differenza, così il caso in cui
  // la mensilità aggiuntiva è a cavallo di due scaglioni resta esatto.
  const imponibileAggiuntive = imponibileMensile * aggiuntive;
  const irpefAggiuntive =
    aggiuntive > 0
      ? calcolaIrpefLorda(annuo.imponibileFiscale) -
        calcolaIrpefLorda(annuo.imponibileFiscale - imponibileAggiuntive)
      : 0;

  // Alle mensilità ordinarie resta il complemento: la somma torna sempre
  // all'IRPEF lorda annua, per costruzione.
  const irpefOrdinarie = annuo.irpefLorda - irpefAggiuntive;

  // Detrazioni EFFETTIVAMENTE godute: in caso di incapienza una parte è persa
  // e non va distribuita, altrimenti la somma delle mensilità non tornerebbe.
  const detrazioniGodute = annuo.irpefLorda - annuo.irpefNetta;

  // Tutti i crediti e le addizionali gravano sulle sole 12 ordinarie.
  const creditiMensili =
    (detrazioniGodute +
      annuo.cuneoSommaEsente +
      annuo.trattamentoIntegrativo -
      annuo.addizionali) /
    MENSILITA_ORDINARIE;

  const irpefLordaOrdinaria = irpefOrdinarie / MENSILITA_ORDINARIE;
  const ordinaria = {
    lordo: lordoMensile,
    contributi: contributiMensili,
    irpefLorda: irpefLordaOrdinaria,
    creditiEAddizionali: creditiMensili,
    netto: lordoMensile - contributiMensili - irpefLordaOrdinaria + creditiMensili,
  };

  if (aggiuntive === 0) {
    return { ordinaria, aggiuntiva: null };
  }

  const irpefLordaAggiuntiva = irpefAggiuntive / aggiuntive;
  return {
    ordinaria,
    aggiuntiva: {
      lordo: lordoMensile,
      contributi: contributiMensili,
      irpefLorda: irpefLordaAggiuntiva,
      creditiEAddizionali: 0,
      netto: lordoMensile - contributiMensili - irpefLordaAggiuntiva,
    },
  };
}
