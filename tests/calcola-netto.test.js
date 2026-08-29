/**
 * Test unitari della pipeline V1.
 *
 * Eseguire con:  npm test    (equivale a `node --test tests/`)
 *
 * Due famiglie di test:
 *  1. GOLDEN CASES — valori di riferimento della logica validata (25k/30k/35k/45k/70k).
 *     Fissano il comportamento atteso: qualsiasi refactor che li rompa è una regressione.
 *  2. INVARIANTI E SOGLIE — coerenza interna, confini degli scaglioni,
 *     discontinuità note e casi limite.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { calcolaNetto, MENSILITA, ZONE_TRAPPOLA } from '../calc/calcola-netto.js';
import { calcolaContributiInps, INPS } from '../calc/inps-2026.js';
import {
  calcolaIrpefLorda,
  dettaglioScaglioniIrpef,
  detrazioneLavoroDipendente,
  detrazioneCuneo,
  sommaEsenteCuneo,
  trattamentoIntegrativo,
} from '../calc/irpef-2026.js';
import {
  calcolaAddizionaleRegionale,
  calcolaAddizionaleComunale,
  ADDIZIONALE_REGIONALE_LOMBARDIA_SCAGLIONI,
} from '../calc/addizionali-2026.js';

// ==================== 1. GOLDEN CASES ====================

const GOLDEN = [
  {
    ral: 25000,
    contributiInps: 2297.5,
    imponibileFiscale: 22702.5,
    irpefLorda: 5221.58,
    detrazioneLavoroDipendente: 2394.93,
    cuneoDetrazione: 1000,
    irpefNetta: 1826.65,
    addizionaleRegionale: 306.2,
    addizionaleComunale: 0, // imponibile sotto la soglia di esenzione 23.000€
    nettoAnnuale: 20569.65,
    nettoMensile: 1582.28,
    tfrAnnuo: 1851.85,
  },
  {
    ral: 30000,
    contributiInps: 2757,
    imponibileFiscale: 27243,
    irpefLorda: 6265.89,
    detrazioneLavoroDipendente: 1979.29,
    cuneoDetrazione: 1000,
    irpefNetta: 3286.6,
    addizionaleRegionale: 377.94,
    addizionaleComunale: 217.94,
    nettoAnnuale: 23360.52,
    nettoMensile: 1796.96,
    tfrAnnuo: 2222.22,
  },
  {
    ral: 35000,
    contributiInps: 3216.5,
    imponibileFiscale: 31783.5,
    irpefLorda: 7688.56,
    detrazioneLavoroDipendente: 1581.52,
    cuneoDetrazione: 1000, // ancora pieno: imponibile 31.783,50 < 32.000
    irpefNetta: 5107.03,
    addizionaleRegionale: 454.98,
    addizionaleComunale: 254.27,
    nettoAnnuale: 25967.22,
    nettoMensile: 1997.48,
    tfrAnnuo: 2592.59,
  },
  {
    ral: 45000,
    contributiInps: 4135.5,
    imponibileFiscale: 40864.5,
    irpefLorda: 10685.29,
    detrazioneLavoroDipendente: 793.13,
    cuneoDetrazione: 0, // imponibile oltre 40.000: cuneo azzerato
    irpefNetta: 9892.16,
    addizionaleRegionale: 611.17,
    addizionaleComunale: 326.92,
    nettoAnnuale: 30034.26,
    nettoMensile: 2310.33,
    tfrAnnuo: 3333.33,
  },
  {
    ral: 70000,
    contributiInps: 6570.76, // include il +1% sulla quota oltre 56.224€
    imponibileFiscale: 63429.24,
    irpefLorda: 19474.57,
    detrazioneLavoroDipendente: 0, // imponibile oltre 50.000: detrazione azzerata
    cuneoDetrazione: 0,
    irpefNetta: 19474.57,
    addizionaleRegionale: 1000.63,
    addizionaleComunale: 507.43,
    nettoAnnuale: 42446.61,
    nettoMensile: 3265.12,
    tfrAnnuo: 5185.19,
  },
];

for (const atteso of GOLDEN) {
  test(`golden case — RAL ${atteso.ral}€`, () => {
    const r = calcolaNetto(atteso.ral);
    for (const [voce, valore] of Object.entries(atteso)) {
      assert.equal(r[voce], valore, `voce "${voce}" divergente`);
    }
  });
}

// ==================== 2. COERENZA INTERNA ====================

test('il netto quadra con la somma delle trattenute', () => {
  for (const { ral } of GOLDEN) {
    const r = calcolaNetto(ral);
    const ricostruito =
      r.ral -
      r.contributiInps -
      r.irpefNetta -
      r.addizionaleRegionale -
      r.addizionaleComunale;
    assert.ok(
      Math.abs(ricostruito - r.nettoAnnuale) < 0.01,
      `RAL ${ral}: netto ${r.nettoAnnuale} != ricostruito ${ricostruito}`
    );
    assert.ok(Math.abs(r.ral - r.totaleTrattenute - r.nettoAnnuale) < 0.01);
  }
});

test('il dettaglio per scaglioni somma all\'IRPEF lorda', () => {
  for (const imponibile of [0, 8000, 15000, 28000, 40864.5, 63429.24, 150000]) {
    const somma = dettaglioScaglioniIrpef(imponibile).reduce(
      (a, sc) => a + sc.imposta,
      0
    );
    assert.ok(
      Math.abs(somma - calcolaIrpefLorda(imponibile)) < 0.01,
      `imponibile ${imponibile}: scaglioni ${somma} != lorda ${calcolaIrpefLorda(imponibile)}`
    );
  }
});

/**
 * La tabella di riepilogo mostra una cascata di movimenti che deve sommare
 * esattamente al netto. Questo test riproduce quella somma sui campi esposti:
 * se qualcuno cambia la pipeline senza aggiornare la presentazione, la colonna
 * smetterebbe di quadrare e il test lo intercetta.
 */
test('la cascata del riepilogo somma sempre al netto annuale', () => {
  for (const ral of [8000, 12000, 16500, 25000, 35000, 45000, 70000, 130000]) {
    const r = calcolaNetto(ral);

    const cascata =
      r.ral -
      r.contributiInps -
      r.irpefLorda +
      r.detrazioneLavoroDipendente +
      r.cuneoDetrazione -
      r.detrazioniNonGodute -
      r.addizionaleRegionale -
      r.addizionaleComunale +
      r.cuneoSommaEsente +
      r.trattamentoIntegrativo;

    assert.ok(
      Math.abs(cascata - r.nettoAnnuale) < 0.02,
      `RAL ${ral}: cascata ${cascata.toFixed(2)} != netto ${r.nettoAnnuale}`
    );
  }
});

test('la cascata quadra anche in caso di incapienza', () => {
  // Sotto la no tax area le detrazioni superano l'imposta lorda: la quota non
  // goduta deve comparire come riga a se, altrimenti la somma sfora.
  const r = calcolaNetto(8000);
  assert.ok(r.detrazioniNonGodute > 0, 'atteso un caso di incapienza');
  assert.equal(r.irpefNetta, 0);

  const cascata =
    r.ral - r.contributiInps - r.irpefLorda + r.detrazioneLavoroDipendente +
    r.cuneoDetrazione - r.detrazioniNonGodute - r.addizionaleRegionale -
    r.addizionaleComunale + r.cuneoSommaEsente + r.trattamentoIntegrativo;

  assert.ok(Math.abs(cascata - r.nettoAnnuale) < 0.02);
});

test('imposte e contributi sono separati e sommano alle trattenute', () => {
  for (const ral of [12000, 25000, 35000, 70000, 130000]) {
    const r = calcolaNetto(ral);

    // Le imposte sono IRPEF netta + addizionali: i contributi NON sono imposte.
    const atteso = r.irpefNetta + r.addizionaleRegionale + r.addizionaleComunale;
    assert.ok(
      Math.abs(r.totaleImposte - atteso) < 0.01,
      `RAL ${ral}: totaleImposte ${r.totaleImposte} != ${atteso.toFixed(2)}`
    );

    assert.ok(
      Math.abs(r.contributiInps + r.totaleImposte - r.totaleTrattenute) < 0.01,
      `RAL ${ral}: contributi + imposte != totale trattenute`
    );

    // Le imposte sono sempre una parte propria del totale, mai il totale.
    assert.ok(r.totaleImposte < r.totaleTrattenute);
  }
});

test('netto mensile = netto annuale / mensilità', () => {
  const r = calcolaNetto(35000);
  assert.equal(r.mensilita, MENSILITA);

  // Tolleranza: `nettoMensile` è arrotondato ai centesimi, quindi
  // moltiplicandolo per le mensilità si accumula fino a mezzo centesimo
  // per mensilità. È un artefatto di arrotondamento, non un errore di calcolo.
  const tolleranza = MENSILITA * 0.005;
  assert.ok(
    Math.abs(r.nettoMensile * MENSILITA - r.nettoAnnuale) <= tolleranza,
    `drift ${(r.nettoMensile * MENSILITA - r.nettoAnnuale).toFixed(4)}€ oltre tolleranza`
  );
});

/**
 * Il netto NON è monotono crescente: esistono due punti in cui un euro lordo
 * in più fa incassare meno netto. Entrambi sono effetti reali della norma, non
 * difetti dell'implementazione, ed entrambi sono soglie "a scalino":
 *
 *   RAL ~9.361  la somma esente del cuneo passa dal 7,1% al 5,3% dell'INTERO
 *               reddito, superati 8.500€ di imponibile
 *   RAL ~25.328 l'addizionale comunale di Milano si attiva sull'INTERO
 *               imponibile, superati 23.000€ (è una soglia, non una franchigia)
 *
 * Il test le inchioda entrambe: se ne compare una terza, o se una di queste
 * cambia di posizione o di ampiezza, è una regressione da indagare.
 */
/**
 * Le discontinuità note, in ENTRAMBE le direzioni. Il test precedente
 * cercava solo i cali e non vedeva il salto più grande di tutti: a RAL 9.002
 * scatta la capienza del trattamento integrativo e il netto sale di 1.200€
 * per un euro di lordo in più.
 */
test('tutti i salti oltre 50€ sono i quattro noti', () => {
  const attesi = [
    { ral: 9002, salto: 1200.96, causa: 'scatta la capienza del trattamento integrativo' },
    { ral: 9361, salto: -152.22, causa: 'scalino cuneo a 8.500€' },
    { ral: 16519, salto: -129.36, causa: 'decade il trattamento integrativo' },
    { ral: 25328, salto: -183.4, causa: 'soglia comunale Milano a 23.000€' },
  ];

  const trovati = [];
  let precedente = null;

  for (let ral = 1; ral <= 60000; ral += 1) {
    const { nettoAnnuale } = calcolaNetto(ral);
    if (precedente !== null && Math.abs(nettoAnnuale - precedente) > 50) {
      trovati.push({ ral, salto: Number((nettoAnnuale - precedente).toFixed(2)) });
    }
    precedente = nettoAnnuale;
  }

  assert.equal(
    trovati.length,
    attesi.length,
    `salti inattesi: ${JSON.stringify(trovati)}`
  );

  attesi.forEach((atteso, i) => {
    assert.equal(trovati[i].ral, atteso.ral, `posizione — ${atteso.causa}`);
    assert.ok(
      Math.abs(trovati[i].salto - atteso.salto) < 0.5,
      `ampiezza — ${atteso.causa}: ${trovati[i].salto} invece di ${atteso.salto}`
    );
  });
});

/**
 * Sotto i ~12.000€ il netto SUPERA la RAL: i crediti ricevuti (trattamento
 * integrativo e somma esente) valgono più di quanto viene trattenuto. Non è
 * un errore, ed è il motivo per cui l'aliquota effettiva risulta negativa.
 */
test('sotto i 12.000€ il netto supera la RAL, e l\'aliquota è negativa', () => {
  const dentro = calcolaNetto(10000);
  assert.ok(dentro.nettoAnnuale > dentro.ral, 'atteso netto sopra la RAL');
  assert.ok(dentro.aliquotaEffettiva < 0, 'attesa aliquota effettiva negativa');
  assert.ok(dentro.trattamentoIntegrativo > 0 && dentro.cuneoSommaEsente > 0);

  // Fuori dalla fascia si torna alla normalità.
  for (const ral of [9000, 13000, 35000]) {
    const r = calcolaNetto(ral);
    assert.ok(r.nettoAnnuale < r.ral, `RAL ${ral}: netto sopra la RAL`);
    assert.ok(r.aliquotaEffettiva > 0, `RAL ${ral}: aliquota non positiva`);
  }
});

test('nessun valore non finito su tutto l\'intervallo utile', () => {
  for (let ral = 1; ral <= 300000; ral += 97) {
    const r = calcolaNetto(ral);
    for (const [campo, valore] of Object.entries(r)) {
      if (typeof valore === 'number') {
        assert.ok(
          Number.isFinite(valore),
          `RAL ${ral}: campo "${campo}" non finito (${valore})`
        );
      }
    }
    assert.ok(r.irpefNetta >= 0 && r.contributiInps >= 0 && r.imponibileFiscale >= 0);
    assert.ok(r.totaleImposte <= r.totaleTrattenute);
  }
});

test('le uniche discontinuità del netto sono le due note', () => {
  const attese = [
    { ral: 9361, calo: -152.22, causa: 'scalino cuneo a 8.500€' },
    { ral: 16519, calo: -129.36, causa: 'decadenza trattamento integrativo a 15.000€' },
    { ral: 25328, calo: -183.4, causa: 'soglia comunale Milano a 23.000€' },
  ];

  const trovate = [];
  let precedente = null;

  for (let ral = 1; ral <= 45000; ral += 1) {
    const { nettoAnnuale } = calcolaNetto(ral);
    if (precedente !== null && nettoAnnuale < precedente) {
      trovate.push({ ral, calo: Number((nettoAnnuale - precedente).toFixed(2)) });
    }
    precedente = nettoAnnuale;
  }

  assert.equal(
    trovate.length,
    attese.length,
    `discontinuità inattese: ${JSON.stringify(trovate)}`
  );

  attese.forEach((atteso, i) => {
    assert.equal(trovate[i].ral, atteso.ral, `posizione — ${atteso.causa}`);
    assert.ok(
      Math.abs(trovate[i].calo - atteso.calo) < 0.5,
      `ampiezza — ${atteso.causa}: ${trovate[i].calo} invece di ${atteso.calo}`
    );
  });
});

test('il netto è monotono crescente oltre i 45.000€', () => {
  let precedente = -1;
  for (let ral = 45000; ral <= 200000; ral += 500) {
    const { nettoAnnuale } = calcolaNetto(ral);
    assert.ok(
      nettoAnnuale > precedente,
      `netto non crescente a RAL ${ral}: ${nettoAnnuale} <= ${precedente}`
    );
    precedente = nettoAnnuale;
  }
});

test("l'IRPEF netta non è mai negativa (incapienza)", () => {
  for (let ral = 0; ral <= 20000; ral += 500) {
    const r = calcolaNetto(ral);
    assert.ok(r.irpefNetta >= 0, `IRPEF netta negativa a RAL ${ral}`);
  }
});

// ==================== 3. SOGLIE E CASI LIMITE ====================

test('INPS: +1% solo sulla quota oltre 56.224€', () => {
  const sotto = calcolaContributiInps(INPS.SOGLIA_ALIQUOTA_AGGIUNTIVA);
  assert.ok(
    Math.abs(sotto - INPS.SOGLIA_ALIQUOTA_AGGIUNTIVA * INPS.ALIQUOTA) < 0.01
  );

  // 1.000€ oltre soglia -> +1.000 * 10,19%
  const oltre = calcolaContributiInps(INPS.SOGLIA_ALIQUOTA_AGGIUNTIVA + 1000);
  assert.ok(Math.abs(oltre - sotto - 101.9) < 0.01);
});

test('INPS: nessun contributo oltre il massimale di 122.295€', () => {
  const alMassimale = calcolaContributiInps(INPS.MASSIMALE_CONTRIBUTIVO);
  const oltreMassimale = calcolaContributiInps(INPS.MASSIMALE_CONTRIBUTIVO + 50000);
  assert.equal(alMassimale, oltreMassimale);
});

test('IRPEF: scaglioni 23% / 33% / 43%', () => {
  assert.ok(Math.abs(calcolaIrpefLorda(28000) - 28000 * 0.23) < 0.01);
  assert.ok(Math.abs(calcolaIrpefLorda(50000) - (6440 + 22000 * 0.33)) < 0.01);
  assert.ok(
    Math.abs(calcolaIrpefLorda(60000) - (6440 + 7260 + 10000 * 0.43)) < 0.01
  );
  assert.equal(calcolaIrpefLorda(0), 0);
});

test('detrazione lavoro dipendente: continuità e azzeramento a 50.000€', () => {
  assert.equal(detrazioneLavoroDipendente(15000), 1955);
  assert.ok(Math.abs(detrazioneLavoroDipendente(28000) - 1910) < 0.01);
  assert.equal(detrazioneLavoroDipendente(50000), 0);
  assert.equal(detrazioneLavoroDipendente(60000), 0);
});

test('cuneo — detrazione: piatta 20k-32k, decrescente 32k-40k, nulla fuori', () => {
  assert.equal(detrazioneCuneo(20000), 0); // qui opera la somma esente
  assert.equal(detrazioneCuneo(20001), 1000);
  assert.equal(detrazioneCuneo(32000), 1000);
  assert.equal(detrazioneCuneo(36000), 500);
  assert.equal(detrazioneCuneo(40000), 0);
  assert.equal(detrazioneCuneo(50000), 0);
});

test('cuneo — somma esente: 7,1% / 5,3% / 4,8% sull\'intero reddito', () => {
  assert.equal(sommaEsenteCuneo(0), 0);
  assert.equal(sommaEsenteCuneo(8500), 8500 * 0.071);
  assert.equal(sommaEsenteCuneo(15000), 15000 * 0.053);
  assert.equal(sommaEsenteCuneo(20000), 20000 * 0.048);
  assert.equal(sommaEsenteCuneo(20001), 0); // oltre soglia opera la detrazione
});

test('cuneo — i due tratti si escludono a vicenda', () => {
  for (let r = 500; r <= 45000; r += 500) {
    const entrambi = sommaEsenteCuneo(r) > 0 && detrazioneCuneo(r) > 0;
    assert.ok(!entrambi, `a reddito ${r} si sommano somma esente e detrazione`);
  }
});

test('cuneo — la somma esente NON è soggetta a incapienza', () => {
  // Su 8.500€ la capienza residua è zero (IRPEF lorda 1.955 = detrazione 1.955):
  // una detrazione varrebbe 0, la somma esente deve invece arrivare in busta.
  const r = calcolaNetto(8500 / (1 - 0.0919));
  assert.equal(r.irpefNetta, 0, 'atteso IRPEF netta azzerata');
  assert.ok(
    r.cuneoSommaEsente > 590,
    `somma esente persa per incapienza: ${r.cuneoSommaEsente}`
  );
  // e deve comparire nel netto, non nelle detrazioni
  assert.equal(r.cuneoDetrazione, 0);
});

test('addizionale comunale Milano: aliquota unica con esenzione a 23.000€', () => {
  assert.equal(calcolaAddizionaleComunale(23000), 0);
  // Sopra soglia si applica sull'INTERO imponibile, non solo sull'eccedenza.
  assert.ok(Math.abs(calcolaAddizionaleComunale(23001) - 23001 * 0.008) < 0.01);
  // Esempio numerico pubblicato dalla fonte: 35.000€ imponibili -> 280€.
  assert.equal(calcolaAddizionaleComunale(35000), 280);
});

test('addizionale regionale Lombardia: progressiva per scaglioni', () => {
  // Ogni aliquota si applica SOLO alla quota nel proprio scaglione,
  // come l'IRPEF nazionale. Fonte: MEF, Portale del Federalismo Fiscale.
  assert.ok(Math.abs(calcolaAddizionaleRegionale(15000) - 15000 * 0.0123) < 0.01);
  assert.ok(
    Math.abs(calcolaAddizionaleRegionale(28000) - (184.5 + 13000 * 0.0158)) < 0.01
  );
  assert.ok(
    Math.abs(calcolaAddizionaleRegionale(50000) - (184.5 + 205.4 + 22000 * 0.0172)) <
      0.01
  );
  assert.ok(
    Math.abs(calcolaAddizionaleRegionale(60000) - (768.3 + 10000 * 0.0173)) < 0.01
  );
  assert.equal(calcolaAddizionaleRegionale(0), 0);
});

test('addizionale regionale: aliquote e soglie dalla fonte MEF', () => {
  assert.deepEqual(
    ADDIZIONALE_REGIONALE_LOMBARDIA_SCAGLIONI.map((sc) => [sc.fino, sc.aliquota]),
    [
      [15000, 0.0123],
      [28000, 0.0158],
      [50000, 0.0172],
      [Infinity, 0.0173],
    ]
  );
});

test('addizionale regionale: continua, nessuno scalino alle soglie', () => {
  for (const soglia of [15000, 28000, 50000]) {
    const sotto = calcolaAddizionaleRegionale(soglia);
    const sopra = calcolaAddizionaleRegionale(soglia + 1);
    assert.ok(
      sopra - sotto < 0.02,
      `scalino di ${(sopra - sotto).toFixed(2)}€ alla soglia ${soglia}`
    );
  }
});

test('le zone trappola sono segnalate, e solo lì', () => {
  for (const zona of ZONE_TRAPPOLA) {
    assert.equal(calcolaNetto(zona.da - 1).warnings.length, 0, `prima di ${zona.da}`);
    assert.equal(calcolaNetto(zona.da).warnings.length, 1, `all'inizio di ${zona.da}`);
    assert.equal(calcolaNetto(zona.a).warnings.length, 1, `alla fine di ${zona.a}`);
    assert.equal(calcolaNetto(zona.a + 1).warnings.length, 0, `dopo ${zona.a}`);
  }
  assert.equal(calcolaNetto(35000).warnings.length, 0);
});

test('ogni zona trappola è davvero una trappola, e finisce dove dichiarato', () => {
  for (const zona of ZONE_TRAPPOLA) {
    const nettoPrimaDelloScalino = calcolaNetto(zona.da - 1).nettoAnnuale;

    // Dentro la zona il netto è sempre inferiore a quello di poco prima.
    for (let ral = zona.da; ral <= zona.a; ral += 1) {
      assert.ok(
        calcolaNetto(ral).nettoAnnuale < nettoPrimaDelloScalino,
        `RAL ${ral} non è dentro la trappola dichiarata ${zona.da}-${zona.a}`
      );
    }

    // Un euro dopo la fine dichiarata, il netto è tornato almeno al livello.
    assert.ok(
      calcolaNetto(zona.a + 1).nettoAnnuale >= nettoPrimaDelloScalino,
      `la zona ${zona.da}-${zona.a} finisce più tardi di quanto dichiarato`
    );
  }
});

test('input non validi vengono rifiutati', () => {
  assert.throws(() => calcolaNetto(-1), TypeError);
  assert.throws(() => calcolaNetto('30000'), TypeError);
  assert.throws(() => calcolaNetto(NaN), TypeError);
});

test('trattamento integrativo: pieno sotto 15.000€, se c\'è capienza', () => {
  const detraz = 1955;

  // Capienza: serve imposta lorda > 1.955 - 75 = 1.880.
  assert.equal(trattamentoIntegrativo(8000, 1840, detraz), 0, 'incapiente');
  assert.equal(trattamentoIntegrativo(8500, 1955, detraz), 1200, 'capiente');
  assert.equal(trattamentoIntegrativo(15000, 3450, detraz), 1200);
});

test('trattamento integrativo: mai spettante oltre 28.000€', () => {
  assert.equal(trattamentoIntegrativo(28001, 6500, 0), 0);
  assert.equal(trattamentoIntegrativo(50000, 15000, 0), 0);
});

test('trattamento integrativo: nella fascia 15k-28k è differenziale', () => {
  // Spetta solo se le detrazioni superano l'imposta lorda.
  assert.equal(trattamentoIntegrativo(20000, 4600, 2642.31), 0);
  // Caso teorico con detrazioni capienti (non raggiungibile nel profilo V1,
  // che ha la sola detrazione da lavoro dipendente): differenza, con tetto.
  assert.equal(trattamentoIntegrativo(20000, 4600, 5000), 400);
  assert.equal(trattamentoIntegrativo(20000, 4600, 9000), 1200, 'tetto a 1.200');
});

test('nel profilo V1 il trattamento integrativo non spetta mai fra 15k e 28k', () => {
  // La sola detrazione da lavoro dipendente non supera mai l'imposta lorda
  // sopra i 15.000€: senza familiari a carico né oneri, il credito è sempre 0.
  for (let ral = 16520; ral <= 32000; ral += 20) {
    const r = calcolaNetto(ral);
    if (r.imponibileFiscale <= 15000 || r.imponibileFiscale > 28000) continue;
    assert.equal(
      r.trattamentoIntegrativo,
      0,
      `atteso 0 a RAL ${ral} (imponibile ${r.imponibileFiscale})`
    );
  }
});

test('trattamento integrativo e cuneo si cumulano', () => {
  // Esempio pubblicato dalla fonte: RAL 16.500€ -> 1.200€ di trattamento
  // integrativo PIÙ ~794€ di somma esente del cuneo.
  const r = calcolaNetto(16500);
  assert.equal(r.trattamentoIntegrativo, 1200);
  assert.ok(
    Math.abs(r.cuneoSommaEsente - 794) < 1,
    `somma esente ${r.cuneoSommaEsente}, attesa ~794`
  );
});

// ==================== 3-bis. RIPARTIZIONE SULLE MENSILITÀ ====================

const MENSILITA_DA_TESTARE = [12, 13, 14];

test('la somma delle mensilità torna sempre al netto annuale', () => {
  for (const mensilita of MENSILITA_DA_TESTARE) {
    for (const ral of [12000, 16500, 25000, 35000, 45000, 70000, 130000]) {
      const r = calcolaNetto(ral, { mensilita });
      const somma =
        r.nettoMensileOrdinario * r.mensilitaOrdinarie +
        (r.nettoMensileAggiuntivo ?? 0) * r.mensilitaAggiuntive;

      assert.ok(
        Math.abs(somma - r.nettoAnnuale) < 0.1,
        `RAL ${ral} a ${mensilita} mensilità: somma ${somma.toFixed(2)} != ${r.nettoAnnuale}`
      );
    }
  }
});

test('le mensilità non cambiano il netto ANNUALE, solo la ripartizione', () => {
  const riferimento = calcolaNetto(35000, { mensilita: 13 }).nettoAnnuale;
  for (const mensilita of MENSILITA_DA_TESTARE) {
    assert.equal(calcolaNetto(35000, { mensilita }).nettoAnnuale, riferimento);
  }
});

test('con 12 mensilità non esiste mensilità aggiuntiva', () => {
  const r = calcolaNetto(35000, { mensilita: 12 });
  assert.equal(r.mensilitaAggiuntive, 0);
  assert.equal(r.nettoMensileAggiuntivo, null);
  assert.equal(r.scartoMensilitaAggiuntiva, null);
  // Tutte le mensilità sono uguali: coincidono con la media.
  assert.ok(Math.abs(r.nettoMensileOrdinario - r.nettoAnnuale / 12) < 0.01);
});

test('la mensilità aggiuntiva è sempre più bassa di quella ordinaria', () => {
  for (const mensilita of [13, 14]) {
    for (let ral = 10000; ral <= 130000; ral += 2500) {
      const r = calcolaNetto(ral, { mensilita });
      assert.ok(
        r.nettoMensileAggiuntivo < r.nettoMensileOrdinario,
        `RAL ${ral} a ${mensilita} mensilità: aggiuntiva ${r.nettoMensileAggiuntivo} >= ordinaria ${r.nettoMensileOrdinario}`
      );
    }
  }
});

test('la mensilità aggiuntiva sconta l\'aliquota MARGINALE', () => {
  const r = calcolaNetto(35000, { mensilita: 13 });
  const imponibileMensile = r.imponibileFiscale / 13;

  // L'IRPEF della tredicesima è la differenza fra l'imposta sull'imponibile
  // pieno e quella sull'imponibile senza la tredicesima.
  const irpefAttesa =
    calcolaIrpefLorda(r.imponibileFiscale) -
    calcolaIrpefLorda(r.imponibileFiscale - imponibileMensile);

  const lordoMensile = 35000 / 13;
  const contributiMensili = r.contributiInps / 13;
  const nettoAtteso = lordoMensile - contributiMensili - irpefAttesa;

  assert.ok(
    Math.abs(r.nettoMensileAggiuntivo - nettoAtteso) < 0.01,
    `atteso ${nettoAtteso.toFixed(2)}, ottenuto ${r.nettoMensileAggiuntivo}`
  );

  // E dev'essere più alta della quota proporzionale: è il punto di tutto.
  assert.ok(irpefAttesa > r.irpefLorda / 13);
});

test('lo scarto della tredicesima è nell\'ordine di grandezza atteso', () => {
  // Le fonti indicano un netto della tredicesima inferiore del 15-20% circa.
  const r = calcolaNetto(35000, { mensilita: 13 });
  assert.ok(
    r.scartoMensilitaAggiuntiva < -15 && r.scartoMensilitaAggiuntiva > -25,
    `scarto ${r.scartoMensilitaAggiuntiva}% fuori dall'ordine di grandezza atteso`
  );
});

test('mensilità non ammesse vengono rifiutate', () => {
  for (const mensilita of [11, 15, 16, 13.5, 0, -1]) {
    assert.throws(() => calcolaNetto(35000, { mensilita }), RangeError);
  }
});

test('senza opzioni le mensilità sono 13', () => {
  assert.equal(calcolaNetto(35000).mensilita, MENSILITA);
  assert.equal(MENSILITA, 13);
});

// ==================== 4. VERIFICA SU CEDOLINO REALE ====================

// Il modello e stato confrontato anche con un cedolino reale (CCNL Commercio,
// 14 mensilita), annualizzandone le voci: il netto e risultato entro l'1,42%.
// I dati non sono nel repository perche sono retribuzioni di una persona reale;
// restano gli scostamenti misurati, documentati nel README.
