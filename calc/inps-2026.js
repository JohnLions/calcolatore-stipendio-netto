/**
 * CONTRIBUTI PREVIDENZIALI A CARICO DIPENDENTE — INPS 2026
 *
 * Fonte parametri: Circolare INPS n. 6 del 30 gennaio 2026 (minimali e
 * massimali). Tutti e tre i valori sotto sono stati verificati sulla fonte.
 *
 * Assunzioni V1:
 * - Lavoratore dipendente del settore privato, iscritto al FPLD.
 * - Aliquota a carico dipendente 9,19% (quota IVS). È la quota del lavoratore
 *   sul 33% complessivo del FPLD, di cui il 23,81% grava sul datore di lavoro
 *   e non è modellato qui. Nessuna aliquota aggiuntiva da CCNL (fondi sanitari,
 *   enti bilaterali, previdenza complementare).
 * - La base contributiva coincide con la RAL: nessuna voce esclusa
 *   dall'imponibile previdenziale (es. rimborsi, welfare, fringe benefit).
 */

export const INPS = {
  // Aliquota IVS ordinaria a carico del lavoratore.
  ALIQUOTA: 0.0919,

  // Aliquota aggiuntiva dell'1% (art. 3-ter D.L. 384/1992, conv. L. 438/1992)
  // dovuta sulla quota eccedente la prima fascia di retribuzione pensionabile,
  // fissata per il 2026 a 56.224€ annui (4.685€ mensili).
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
