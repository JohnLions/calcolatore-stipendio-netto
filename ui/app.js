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

const pct = (n) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;

/** Righe della tabella di dettaglio, nell'ordine della pipeline di calcolo. */
function righe(r) {
  return [
    { tipo: 'base', voce: 'Retribuzione annua lorda (RAL)', valore: r.ral },

    { tipo: 'sezione', voce: '1 · Contributi previdenziali' },
    {
      tipo: 'trattenuta',
      voce: 'Contributi INPS a carico dipendente',
      nota: '9,19% · +1% oltre 56.224€ · massimale 122.295€',
      valore: -r.contributiInps,
    },

    { tipo: 'sezione', voce: '2 · Imponibile fiscale' },
    {
      tipo: 'subtotale',
      voce: 'Imponibile fiscale',
      nota: 'RAL meno i contributi previdenziali',
      valore: r.imponibileFiscale,
    },

    { tipo: 'sezione', voce: '3 · IRPEF' },
    {
      tipo: 'neutro',
      voce: 'IRPEF lorda',
      nota: 'Scaglioni 23% fino a 28.000€ · 33% fino a 50.000€ · 43% oltre',
      valore: r.irpefLorda,
    },
    {
      tipo: 'detrazione',
      voce: 'Detrazione lavoro dipendente',
      nota: 'Art. 13 TUIR, considera anno intero lavorato',
      valore: -r.detrazioneLavoroDipendente,
    },
    {
      tipo: 'detrazione',
      voce: 'Cuneo fiscale — detrazione',
      nota:
        'L. 199/2025 · 1.000€ pieni fino a 32.000€, poi decrescente fino a ' +
        '40.000€. Sotto i 20.000€ il cuneo cambia forma: non è una detrazione ' +
        'ma una somma esente che si aggiunge al netto',
      valore: -r.cuneoDetrazione,
      nascondi: r.cuneoDetrazione === 0 && r.cuneoSommaEsente > 0,
    },
    {
      tipo: 'trattenuta',
      voce: 'IRPEF netta',
      nota: 'IRPEF lorda meno le detrazioni, con minimo a zero',
      valore: -r.irpefNetta,
    },

    { tipo: 'sezione', voce: '4 · Addizionali locali' },
    {
      tipo: 'trattenuta',
      voce: 'Addizionale regionale — Lombardia',
      nota: 'Per scaglioni: 1,23% / 1,58% / 1,72% / 1,73% (soglie 15k · 28k · 50k)',
      valore: -r.addizionaleRegionale,
    },
    {
      tipo: 'trattenuta',
      voce: 'Addizionale comunale — Milano',
      nota:
        r.addizionaleComunale === 0
          ? 'Esente: imponibile pari o inferiore a 23.000€'
          : '0,80% · superati i 23.000€ si paga sull’intero imponibile, non solo sulla parte eccedente',
      valore: -r.addizionaleComunale,
    },

    { tipo: 'sezione', voce: '5 · Risultato' },
    {
      tipo: 'aggiunta',
      voce: 'Trattamento integrativo',
      nota:
        'Ex bonus Renzi · fino a 1.200€ per imponibili sotto i 15.000€, se ' +
        'l’imposta lorda è capiente. È un credito, si cumula con il cuneo.',
      valore: r.trattamentoIntegrativo,
      nascondi: r.trattamentoIntegrativo === 0,
    },
    {
      tipo: 'aggiunta',
      voce: 'Cuneo fiscale — somma esente',
      nota:
        'L. 199/2025 · fino a 20.000€: 7,1% / 5,3% / 4,8% sull’intero imponibile. ' +
        'Non è una detrazione: è una somma non tassata che si aggiunge al netto.',
      valore: r.cuneoSommaEsente,
      nascondi: r.cuneoSommaEsente === 0,
    },
    {
      tipo: 'trattenuta',
      voce: 'Totale imposte',
      nota: 'IRPEF netta + addizionali. I contributi previdenziali non sono imposte',
      valore: -r.totaleImposte,
    },
    {
      tipo: 'trattenuta',
      voce: 'Totale trattenute',
      nota:
        'Contributi + IRPEF netta + addizionali' +
        (r.cuneoSommaEsente + r.trattamentoIntegrativo > 0
          ? `. Al netto dei crediti in busta il prelievo effettivo è il ${pct(r.aliquotaEffettiva)} della RAL`
          : ` · ${pct(r.aliquotaEffettiva)} della RAL`),
      valore: -r.totaleTrattenute,
    },
    { tipo: 'totale', voce: 'Netto annuale', valore: r.nettoAnnuale },
    { tipo: 'sezione', voce: `6 · Ripartizione su ${r.mensilita} mensilità` },
    {
      tipo: 'totale',
      voce:
        r.mensilitaAggiuntive > 0
          ? `Mensilità ordinaria (× ${r.mensilitaOrdinarie})`
          : `Netto mensile (× ${r.mensilita})`,
      nota:
        r.mensilitaAggiuntive > 0
          ? 'Porta detrazioni, cuneo, trattamento integrativo e addizionali'
          : null,
      valore: r.nettoMensileOrdinario,
    },
    {
      tipo: 'totale',
      voce:
        r.mensilitaAggiuntive === 1
          ? 'Tredicesima (× 1)'
          : `Mensilità aggiuntiva (× ${r.mensilitaAggiuntive})`,
      nota:
        'Nessuna detrazione, nessun credito, nessuna addizionale: si somma in ' +
        'cima al reddito e sconta l’aliquota marginale',
      valore: r.nettoMensileAggiuntivo ?? 0,
      nascondi: r.mensilitaAggiuntive === 0,
    },
    {
      tipo: 'neutro',
      voce: 'Media su tutte le mensilità',
      nota: 'Netto annuale diviso le mensilità: non corrisponde a nessuna busta paga reale',
      valore: r.nettoMensile,
      nascondi: r.mensilitaAggiuntive === 0,
    },

    { tipo: 'sezione', voce: 'Voce informativa (non inclusa nel netto)' },
    {
      tipo: 'info',
      voce: 'TFR maturato nell’anno',
      nota: 'RAL / 13,5 · accantonato, non erogato in busta paga',
      valore: r.tfrAnnuo,
    },
  ];
}

function render(r) {
  const corpo = righe(r)
    .filter((riga) => !riga.nascondi)
    .map((riga) => {
      if (riga.tipo === 'sezione') {
        return `<tr class="sezione"><th colspan="2">${riga.voce}</th></tr>`;
      }

      // `+ 0` normalizza lo zero negativo: senza, una voce esente a -0
      // verrebbe formattata come "-0,00 €".
      const valore = riga.valore + 0;
      const segno = valore < 0 ? 'negativo' : '';
      const nota = riga.nota ? `<span class="nota">${riga.nota}</span>` : '';

      return `<tr class="${riga.tipo}">
        <th scope="row">${riga.voce}${nota}</th>
        <td class="importo ${segno}">${eur.format(valore)}</td>
      </tr>`;
    })
    .join('');

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
    <table class="dettaglio">
      <caption>Dettaglio di tutte le voci trattenute</caption>
      <thead>
        <tr><th scope="col">Voce</th><th scope="col">Importo</th></tr>
      </thead>
      <tbody>${corpo}</tbody>
    </table>
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
