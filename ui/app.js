/**
 * UI del calcolatore. Nessun framework: importa direttamente i moduli di /calc,
 * gli stessi che girano nei test. Non c'è duplicazione della logica di calcolo.
 */

import { calcolaNetto } from '../calc/calcola-netto.js';

const form = document.querySelector('#form-ral');
const inputRal = document.querySelector('#ral');
const selectMensilita = document.querySelector('#mensilita');
const risultato = document.querySelector('#risultato');
const errore = document.querySelector('#errore');

const eur = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  // Senza questo, it-IT non raggruppa i numeri di 4 cifre: "2002,40" invece di "2.002,40".
  useGrouping: true,
});

/** Euro senza centesimi: per le soglie degli scaglioni, dove i decimali sono rumore. */
const eurTondo = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});

/** Aliquota senza decimali inutili: "23%" invece di "23,00%". */
const aliquota = (frazione) =>
  `${(frazione * 100).toLocaleString('it-IT', { maximumFractionDigits: 2 })}%`;

const pct = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/**
 * Righe del riepilogo: una cascata che parte dalla RAL e arriva al netto.
 *
 * Ogni riga e' un MOVIMENTO col proprio segno, tranne quelle marcate come
 * subtotale. Sommando la colonna si deve ottenere esattamente il netto: e' il
 * motivo per cui le detrazioni compaiono al loro valore pieno e l'eventuale
 * quota non goduta per incapienza viene sottratta a parte, invece di essere
 * silenziosamente scontata dagli importi.
 */
function righeRiepilogo(r) {
  return [
    { voce: 'Retribuzione annua lorda (RAL)', valore: r.ral },
    { voce: 'Contributi INPS a carico dipendente', valore: -r.contributiInps },
    { tipo: 'subtotale', voce: 'Imponibile fiscale', valore: r.imponibileFiscale },
    { voce: 'IRPEF lorda', valore: -r.irpefLorda },
    {
      tipo: 'detrazione',
      voce: 'Detrazione lavoro dipendente',
      valore: r.detrazioneLavoroDipendente,
      nascondi: r.detrazioneLavoroDipendente === 0,
    },
    {
      tipo: 'detrazione',
      voce: 'Cuneo fiscale — detrazione',
      valore: r.cuneoDetrazione,
      nascondi: r.cuneoDetrazione === 0,
    },
    {
      voce: 'Detrazioni non utilizzate',
      nota: 'Incapienza: l’imposta lorda non basta ad assorbirle e l’eccedenza si perde',
      valore: -r.detrazioniNonGodute,
      nascondi: r.detrazioniNonGodute === 0,
    },
    { voce: 'Addizionale regionale — Lombardia', valore: -r.addizionaleRegionale },
    {
      voce: 'Addizionale comunale — Milano',
      nota: r.addizionaleComunale === 0 ? 'Esente sotto i 23.000€ di imponibile' : null,
      valore: -r.addizionaleComunale,
    },
    {
      tipo: 'detrazione',
      voce: 'Cuneo fiscale — somma esente',
      valore: r.cuneoSommaEsente,
      nascondi: r.cuneoSommaEsente === 0,
    },
    {
      tipo: 'detrazione',
      voce: 'Trattamento integrativo',
      valore: r.trattamentoIntegrativo,
      nascondi: r.trattamentoIntegrativo === 0,
    },
    { tipo: 'totale', voce: 'Netto annuale', valore: r.nettoAnnuale },
    {
      tipo: 'info',
      voce: 'TFR maturato nell’anno',
      nota: 'Accantonato, non incluso nel netto',
      valore: r.tfrAnnuo,
    },
  ].filter((riga) => !riga.nascondi);
}

/** Tabella del riepilogo. */
function tabellaRiepilogo(r) {
  const corpo = righeRiepilogo(r)
    .map((riga) => {
      // `+ 0` normalizza lo zero negativo, che si formatterebbe come "-0,00 €".
      const valore = riga.valore + 0;
      const segno = valore < 0 ? 'negativo' : '';
      const nota = riga.nota ? `<span class="nota">${riga.nota}</span>` : '';

      return `<tr class="${riga.tipo ?? ''}">
        <th scope="row">${riga.voce}${nota}</th>
        <td class="importo ${segno}">${eur.format(valore)}</td>
      </tr>`;
    })
    .join('');

  return `<table class="dettaglio">
    <caption>Riepilogo del calcolo</caption>
    <thead><tr><th scope="col">Voce</th><th scope="col">Importo</th></tr></thead>
    <tbody>${corpo}</tbody>
  </table>`;
}

/** Tabella di dettaglio: come si formano IRPEF lorda, detrazioni e crediti. */
function tabellaDettaglio(r) {
  const scaglioni = r.scaglioniIrpef
    .map((sc) => {
      const fascia =
        sc.a === null || !Number.isFinite(sc.a)
          ? `oltre ${eurTondo.format(sc.da)}`
          : sc.da === 0
            ? `fino a ${eurTondo.format(sc.a)}`
            : `da ${eurTondo.format(sc.da)} a ${eurTondo.format(sc.a)}`;

      return `<tr>
        <td><strong>${aliquota(sc.aliquota)}</strong> ${fascia}
          <span class="nota">Quota tassata: ${eur.format(sc.base)}</span></td>
        <td class="importo">${eur.format(sc.imposta)}</td>
      </tr>`;
    })
    .join('');

  const crediti = [
    {
      voce: 'Detrazione lavoro dipendente',
      nota: 'Art. 13 TUIR, considera anno intero lavorato',
      valore: r.detrazioneLavoroDipendente,
    },
    {
      voce: 'Cuneo fiscale — detrazione',
      nota: 'Oltre i 20.000€ di imponibile',
      valore: r.cuneoDetrazione,
    },
    {
      voce: 'Cuneo fiscale — somma esente',
      nota: 'Fino a 20.000€ di imponibile: si aggiunge al netto, non riduce l’imposta',
      valore: r.cuneoSommaEsente,
    },
    {
      voce: 'Trattamento integrativo',
      nota: 'Credito fino a 1.200€ per imponibili sotto i 15.000€',
      valore: r.trattamentoIntegrativo,
    },
  ]
    .filter((c) => c.valore > 0)
    .map(
      (c) => `<tr>
        <td>${c.voce}<span class="nota">${c.nota}</span></td>
        <td class="importo">${eur.format(c.valore)}</td>
      </tr>`
    )
    .join('');

  const totaleCrediti =
    r.detrazioneLavoroDipendente +
    r.cuneoDetrazione +
    r.cuneoSommaEsente +
    r.trattamentoIntegrativo;

  return `
    <p class="sotto-titolo">IRPEF per scaglioni</p>
    <table class="mini">
      <thead><tr><th scope="col">Scaglione</th><th scope="col">Imposta</th></tr></thead>
      <tbody>
        ${scaglioni}
        <tr class="riga-totale">
          <td><strong>IRPEF lorda</strong></td>
          <td class="importo"><strong>${eur.format(r.irpefLorda)}</strong></td>
        </tr>
      </tbody>
    </table>

    <p class="sotto-titolo">Detrazioni e crediti applicati</p>
    ${
      totaleCrediti === 0
        ? '<p class="nota-blocco">Nessuna detrazione o credito spettante a questo livello di reddito.</p>'
        : `<table class="mini">
             <thead><tr><th scope="col">Voce</th><th scope="col">Importo</th></tr></thead>
             <tbody>
               ${crediti}
               <tr class="riga-totale">
                 <td><strong>Totale</strong></td>
                 <td class="importo"><strong>${eur.format(totaleCrediti)}</strong></td>
               </tr>
             </tbody>
           </table>`
    }`;
}

function render(r) {
  const avvisi = r.warnings.length
    ? `<div class="avvisi" role="status">
         <strong>Attenzione — zona trappola</strong>
         <ul>${r.warnings.map((w) => `<li>${w}</li>`).join('')}</ul>
       </div>`
    : '';

  risultato.innerHTML = `
    <div class="sintesi">
      <div class="kpi">
        <span class="kpi-label">Netto annuale</span>
        <span class="kpi-valore">${eur.format(r.nettoAnnuale)}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">${
          r.mensilitaAggiuntive > 0
            ? `Netto mensile · ${r.mensilitaOrdinarie} mensilità ordinarie`
            : `Netto mensile · ${r.mensilita} mensilità`
        }</span>
        <span class="kpi-valore">${eur.format(r.nettoMensileOrdinario)}</span>
      </div>
      <div class="kpi">
        <span class="kpi-label">Totale trattenute</span>
        <span class="kpi-valore">${eur.format(r.totaleTrattenute)}</span>
        <span class="kpi-dettaglio">
          di cui <strong>${eur.format(r.totaleImposte)}</strong> di imposte
          e ${eur.format(r.contributiInps)} di contributi
        </span>
      </div>
    </div>

    <div class="badge-riga">
      <span class="badge">
        Aliquota effettiva <strong>${pct(r.aliquotaEffettiva)}</strong>
      </span>
      ${
        r.mensilitaAggiuntive > 0
          ? `<span class="badge">
               ${r.mensilitaAggiuntive === 1 ? 'Tredicesima' : 'Mensilità aggiuntiva'}
               <strong>${eur.format(r.nettoMensileAggiuntivo)}</strong>
               <span class="badge-delta">${pct(r.scartoMensilitaAggiuntiva)}</span>
             </span>`
          : ''
      }
      <span class="badge">
        TFR maturato <strong>${eur.format(r.tfrAnnuo)}</strong>
      </span>
    </div>

    ${avvisi}
    ${tabellaRiepilogo(r)}

    <details class="scheda blocco-dettaglio">
      <summary>Dettaglio del calcolo</summary>
      <div class="scheda-corpo">${tabellaDettaglio(r)}</div>
    </details>
  `;
  risultato.hidden = false;
}


form.addEventListener('submit', (evento) => {
  evento.preventDefault();

  const ral = Number(inputRal.value);
  errore.hidden = true;

  if (!Number.isFinite(ral) || ral <= 0) {
    errore.textContent = 'Inserisci una RAL valida: un numero maggiore di zero.';
    errore.hidden = false;
    risultato.hidden = true;
    return;
  }

  render(calcolaNetto(ral, { mensilita: Number(selectMensilita.value) }));
});

selectMensilita.addEventListener('change', () =>
  form.dispatchEvent(new Event('submit'))
);

// ---------- Navigazione a tab ----------

const tab = [...document.querySelectorAll('[role="tab"]')];

tab.forEach((bottone) => {
  bottone.addEventListener('click', () => mostraTab(bottone));

  // Frecce sinistra/destra fra le tab, come da pattern ARIA.
  bottone.addEventListener('keydown', (evento) => {
    const direzione =
      evento.key === 'ArrowRight' ? 1 : evento.key === 'ArrowLeft' ? -1 : 0;
    if (!direzione) return;

    evento.preventDefault();
    const successiva = tab[(tab.indexOf(bottone) + direzione + tab.length) % tab.length];
    mostraTab(successiva);
    successiva.focus();
  });
});

function mostraTab(attiva) {
  tab.forEach((bottone) => {
    const selezionata = bottone === attiva;
    bottone.setAttribute('aria-selected', String(selezionata));
    bottone.classList.toggle('attiva', selezionata);
    document.getElementById(bottone.getAttribute('aria-controls')).hidden =
      !selezionata;
  });
}

// Calcolo iniziale, così la pagina non si apre vuota.
form.dispatchEvent(new Event('submit'));
