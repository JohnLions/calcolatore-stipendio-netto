/**
 * CALCOLATORE RAL -> NETTO — V1 "caso semplice standard"
 *
 * Profilo modellato:
 *   impiegato, contratto a tempo indeterminato, residente a Milano (Lombardia),
 *   nessun familiare a carico, nessuna agevolazione personale (impatriati,
 *   rientro cervelli, ecc.), anno intero lavorato, 13 mensilità.
 *
 * Questo file contiene SOLO l'orchestrazione della pipeline. Tutti i parametri
 * normativi vivono nei moduli dedicati:
 *   - inps-2026.js        contributi previdenziali a carico dipendente
 *   - irpef-2026.js       scaglioni, detrazione lavoro dipendente, cuneo fiscale
 *   - addizionali-2026.js addizionale regionale Lombardia + comunale Milano
 *
 * L'elenco completo e motivato delle semplificazioni è nel README.
 */

import { calcolaContributiInps } from './inps-2026.js';
import {
  calcolaIrpefLorda,
  detrazioneLavoroDipendente,
  detrazioneCuneo,
  sommaEsenteCuneo,
  trattamentoIntegrativo,
} from './irpef-2026.js';
import {
  calcolaAddizionaleRegionale,
  calcolaAddizionaleComunale,
} from './addizionali-2026.js';
import {
  ripartisciMensilita,
  MENSILITA_AMMESSE,
  MENSILITA_ORDINARIE,
} from './mensilita.js';

/**
 * Mensilità contrattuali di default. Nella realtà dipende dal CCNL: il
 * Commercio ne prevede 14. Incide solo sulla RIPARTIZIONE del netto annuale,
 * mai sul suo ammontare — ma la ripartizione non è uniforme, vedi mensilita.js.
 */
export const MENSILITA = 13;

/**
 * Divisore convenzionale per l'accantonamento TFR (art. 2120 c.c.: la quota
 * annua è la retribuzione divisa per 13,5). Trascurata la rivalutazione annua
 * e il contributo dello 0,50% al Fondo di garanzia.
 */
export const DIVISORE_TFR = 13.5;

/**
 * Pipeline completa RAL -> netto.
 *
 * Ordine dei passaggi (è l'ordine reale della busta paga):
 *   1. contributi previdenziali sulla RAL
 *   2. imponibile fiscale = RAL - contributi
 *   3. IRPEF lorda per scaglioni sull'imponibile fiscale
 *   4. detrazioni (lavoro dipendente + cuneo oltre 20k) -> IRPEF netta
 *   5. addizionali regionale e comunale sull'imponibile fiscale
 *   6. netto = imponibile - IRPEF netta - addizionali
 *              + somma esente cuneo + trattamento integrativo
 *
 * @param {number} ral retribuzione annua lorda in euro
 * @param {object} [opzioni]
 * @param {number} [opzioni.mensilita=13] mensilità contrattuali (12, 13 o 14)
 * @returns {object} dettaglio di tutte le voci trattenute e del netto
 */
export function calcolaNetto(ral, opzioni = {}) {
  if (typeof ral !== 'number' || !Number.isFinite(ral) || ral < 0) {
    throw new TypeError('La RAL deve essere un numero finito non negativo.');
  }

  const mensilita = opzioni.mensilita ?? MENSILITA;
  if (!MENSILITA_AMMESSE.includes(mensilita)) {
    throw new RangeError(
      `Mensilità non ammesse: ${mensilita}. Valori validi: ${MENSILITA_AMMESSE.join(', ')}.`
    );
  }

  // Step 1 — Contributi previdenziali a carico dipendente.
  const contributiInps = calcolaContributiInps(ral);

  // Step 2 — Imponibile fiscale: base di calcolo sia dell'IRPEF sia delle
  // addizionali. I contributi previdenziali obbligatori NON concorrono a
  // formare il reddito di lavoro dipendente (art. 51, c. 2, lett. a TUIR):
  // non sono "oneri deducibili" in senso tecnico, semplicemente non entrano
  // mai nell'imponibile. Nessun tetto: si sottrae l'intero importo.
  const imponibileFiscale = ral - contributiInps;

  // Step 3 — IRPEF lorda.
  const irpefLorda = calcolaIrpefLorda(imponibileFiscale);

  // Step 4 — Detrazioni. Si sottraggono dall'imposta lorda, non dall'imponibile.
  // L'IRPEF netta non può essere negativa: l'eventuale eccedenza di detrazione
  // è "incapienza" e in V1 viene semplicemente persa (nessun rimborso).
  const detrazione = detrazioneLavoroDipendente(imponibileFiscale);
  const cuneoDetrazione = detrazioneCuneo(imponibileFiscale);
  const irpefNetta = Math.max(0, irpefLorda - detrazione - cuneoDetrazione);
  const detrazioniNonGodute = Math.max(
    0,
    detrazione + cuneoDetrazione - irpefLorda
  );

  // Cuneo fiscale, tratto fino a 20.000€: NON è una detrazione. È una somma
  // esente che si aggiunge al netto (step 6), non riduce l'imposta e non
  // soffre di incapienza. I due tratti si escludono a vicenda.
  const cuneoSommaEsente = sommaEsenteCuneo(imponibileFiscale);

  // Trattamento integrativo: anch'esso un credito che si aggiunge al netto,
  // cumulabile con il cuneo. La capienza si valuta sull'IRPEF LORDA, prima
  // di qualsiasi detrazione.
  const trattIntegrativo = trattamentoIntegrativo(
    imponibileFiscale,
    irpefLorda,
    detrazione
  );

  // Step 5 — Addizionali, calcolate sull'imponibile PRIMA delle detrazioni.
  const addizionaleRegionale = calcolaAddizionaleRegionale(imponibileFiscale);
  const addizionaleComunale = calcolaAddizionaleComunale(imponibileFiscale);

  // Step 6 — Netto.
  const totaleTrattenute =
    contributiInps + irpefNetta + addizionaleRegionale + addizionaleComunale;
  const nettoAnnuale =
    imponibileFiscale -
    irpefNetta -
    addizionaleRegionale -
    addizionaleComunale +
    cuneoSommaEsente +
    trattIntegrativo;
  const nettoMensile = nettoAnnuale / mensilita;

  // Ripartizione sulle mensilità: le aggiuntive non portano detrazioni,
  // crediti né addizionali, quindi il loro netto è più basso.
  const { ordinaria, aggiuntiva } = ripartisciMensilita(
    {
      ral,
      contributiInps,
      imponibileFiscale,
      irpefLorda,
      irpefNetta,
      cuneoSommaEsente,
      trattamentoIntegrativo: trattIntegrativo,
      addizionali: addizionaleRegionale + addizionaleComunale,
    },
    mensilita
  );

  // Voce informativa: il TFR matura sulla RAL ma è accantonato, non erogato
  // in busta. Non entra quindi nel netto.
  const tfrAnnuo = ral / DIVISORE_TFR;

  return {
    ral,
    contributiInps: round2(contributiInps),
    imponibileFiscale: round2(imponibileFiscale),
    irpefLorda: round2(irpefLorda),
    detrazioneLavoroDipendente: round2(detrazione),
    cuneoDetrazione: round2(cuneoDetrazione),
    cuneoSommaEsente: round2(cuneoSommaEsente),
    trattamentoIntegrativo: round2(trattIntegrativo),
    detrazioniNonGodute: round2(detrazioniNonGodute),
    irpefNetta: round2(irpefNetta),
    addizionaleRegionale: round2(addizionaleRegionale),
    addizionaleComunale: round2(addizionaleComunale),
    totaleTrattenute: round2(totaleTrattenute),
    nettoAnnuale: round2(nettoAnnuale),
    nettoMensile: round2(nettoMensile),
    mensilita,
    mensilitaOrdinarie: MENSILITA_ORDINARIE,
    mensilitaAggiuntive: mensilita - MENSILITA_ORDINARIE,
    nettoMensileOrdinario: round2(ordinaria.netto),
    nettoMensileAggiuntivo: aggiuntiva ? round2(aggiuntiva.netto) : null,
    scartoMensilitaAggiuntiva: aggiuntiva
      ? round2(((aggiuntiva.netto - ordinaria.netto) / ordinaria.netto) * 100)
      : null,
    tfrAnnuo: round2(tfrAnnuo),
    // Prelievo effettivo al netto della somma esente, che è denaro che rientra
    // in busta: senza sottrarla l'aliquota risulterebbe sovrastimata.
    aliquotaEffettiva:
      round2(
        ((totaleTrattenute - cuneoSommaEsente - trattIntegrativo) / ral) * 100
      ) || 0,
    warnings: raccogliWarning(ral),
  };
}

/**
 * "Zone trappola": intervalli di RAL in cui, per effetto di una soglia a
 * scalino, un aumento del lordo produce un netto INFERIORE a quello che si
 * otterrebbe restando appena sotto la soglia.
 *
 * Gli estremi sono ricavati empiricamente dalla pipeline e verificati dai test,
 * che scandiscono l'intervallo con passo di 1€ e falliscono se una zona si
 * sposta, cambia ampiezza o se ne compare una nuova.
 */
export const ZONE_TRAPPOLA = [
  {
    da: 9361,
    a: 9567,
    causa:
      'la somma esente del cuneo scende dal 7,1% al 5,3% dell’intero reddito, ' +
      'superati 8.500€ di imponibile',
  },
  {
    da: 16519,
    a: 16719,
    causa:
      'il trattamento integrativo di 1.200€ decade, superati 15.000€ di ' +
      'imponibile. Il salto della detrazione art. 13 (+1.145€) ne assorbe ' +
      'quasi tutto l’effetto, ma non del tutto',
  },
  {
    da: 25328,
    a: 25636,
    causa:
      'l’addizionale comunale di Milano si attiva sull’intero imponibile, ' +
      'superati 23.000€ (è una soglia, non una franchigia)',
  },
];

/**
 * Segnala i casi in cui il risultato, pur corretto, va letto con attenzione.
 *
 * @param {number} ral retribuzione annua lorda
 * @returns {string[]} elenco di avvisi, vuoto se non ce ne sono
 */
function raccogliWarning(ral) {
  // `useGrouping` esplicito: senza, it-IT non separa le migliaia sui numeri
  // di 4 cifre e "9.361" verrebbe reso "9361", incoerente con "25.328".
  const euro = (n) => n.toLocaleString('it-IT', { useGrouping: true });

  return ZONE_TRAPPOLA.filter((zona) => ral >= zona.da && ral <= zona.a).map(
    (zona) =>
      `Questa RAL cade in una "zona trappola" (${euro(zona.da)}–${euro(zona.a)}€): ` +
      `${zona.causa}. Con una RAL di ${euro(zona.da - 1)}€ il netto sarebbe più alto. ` +
      'È un effetto reale della normativa, non un errore di calcolo.'
  );
}

/** Arrotondamento a 2 decimali (centesimi di euro). */
export function round2(n) {
  return Math.round(n * 100) / 100;
}
