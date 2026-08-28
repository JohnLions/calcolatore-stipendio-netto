/**
 * CONTRIBUTI PREVIDENZIALI A CARICO DIPENDENTE — INPS 2026
 *
 * Fonte parametri: Circolare INPS 6/2026 (minimali, massimali e aliquote).
 *
 * Assunzioni V1:
 * - Lavoratore dipendente del settore privato, iscritto al FPLD.
 * - Aliquota a carico dipendente 9,19% (quota IVS). Non è modellata alcuna
 *   aliquota aggiuntiva da CCNL (es. fondi sanitari o previdenza complementare).
 * - La base contributiva coincide con la RAL: nessuna voce esclusa
 *   dall'imponibile previdenziale (es. rimborsi, welfare, fringe benefit).
 */

export const INPS = {
  // Aliquota IVS ordinaria a carico del lavoratore.
  ALIQUOTA: 0.0919,

  // Aliquota aggiuntiva dell'1% (L. 438/1992, art. 3-ter) dovuta sulla quota
  // di retribuzione eccedente la prima fascia di pensionabilità.
  ALIQUOTA_AGGIUNTIVA: 0.01,
  SOGLIA_ALIQUOTA_AGGIUNTIVA: 56224,

  // Massimale annuo della base contributiva e pensionabile: oltre questa
  // soglia non è dovuta alcuna contribuzione IVS.
  MASSIMALE_CONTRIBUTIVO: 122295,
};

/**
 * Contributi INPS a carico del dipendente.
 *
 * Struttura a tre tratti:
 *   [0, 56.224]        -> 9,19%
 *   (56.224, 122.295]  -> 9,19% + 1% = 10,19%
 *   oltre 122.295      -> 0% (massimale contributivo)
 *
 * @param {number} ral retribuzione annua lorda in euro
 * @returns {number} contributi annui a carico dipendente, in euro
 */
export function calcolaContributiInps(ral) {
  const baseOrdinaria = Math.min(ral, INPS.SOGLIA_ALIQUOTA_AGGIUNTIVA);
  const baseAggiuntiva = Math.max(
    0,
    Math.min(ral, INPS.MASSIMALE_CONTRIBUTIVO) - INPS.SOGLIA_ALIQUOTA_AGGIUNTIVA
  );

  return (
    baseOrdinaria * INPS.ALIQUOTA +
    baseAggiuntiva * (INPS.ALIQUOTA + INPS.ALIQUOTA_AGGIUNTIVA)
  );
}
