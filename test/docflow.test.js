// A che punto è un documento, e a cosa è legato (0.93.0).
// La barra dei passi è una scorciatoia sopra il menu «Stato»: quello che questi
// test tengono fermo è che dica il passo giusto, che il pulsante faccia la
// stessa cosa del menu (e la salvi), e che i collegamenti puntino ai documenti
// veri in entrambe le direzioni.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb, acq } = require('./fixtures.js');

const RIGA = { id: 'l1', itemId: 'c1', code: 'C1', description: 'Cuscinetto', uom: 'pz', qty: 10, price: '', received: 0 };
function app() {
  const a = loadApp({ silent: true });
  a.setDb(makeDb({
    items: [acq('c1', 12)],
    suppliers: [{ id: 's1', name: 'Rossi', active: true }],
    jobs: [{ id: 'j1', number: 'COM-1', customer: 'Bianchi', title: 'Linea', status: 'aperta', date: '2025-01-01', active: true }],
    plans: [{ id: 'p1', number: 'FAB-1', title: 'Lotto', date: '2025-01-01', jobId: 'j1', lines: [], active: true }],
    rfqs: [{ id: 'r1', number: 'RFQ-1', title: 't', status: 'bozza', date: '2025-01-01', supplierId: 's1',
      planId: 'p1', jobId: 'j1', active: true, lines: [Object.assign({}, RIGA)] }],
    orders: [{ id: 'o1', number: 'ODA-1', title: 't', status: 'confermato', date: '2025-01-01', supplierId: 's1',
      rfqId: 'r1', planId: 'p1', jobId: 'j1', supplierConfirmation: 'C-9', active: true,
      lines: [Object.assign({}, RIGA, { price: 12 })] }],
  }));
  a.asRole('admin');
  return a;
}
const passoAttuale = h => (h.match(/<li class="doc-step now"[^>]*>.*?<\/span>([^<]*)<\/li>/) || [])[1];

describe('La barra dei passi', () => {
  it('accende lo stato attuale e propone il passo dopo', () => {
    const a = app();
    a.eval('renderRfq(); openRfqEdit("r1")');
    const h = a.html('view-rfq');
    assert.equal(passoAttuale(h), 'Bozza');
    assert.match(h, /docAdvance\('rfq','r1','inviata'\)/);
    assert.match(h, /Segna come inviata/);
  });

  it('il pulsante cambia stato e salva, come il menu più «Salva»', () => {
    const a = app();
    a.eval('renderRfq(); openRfqEdit("r1"); docAdvance("rfq", "r1", "inviata")');
    assert.equal(a.eval('getRfq("r1").status'), 'inviata');
    assert.equal(a.eval('rfqDirty'), false, 'il passo non resta in sospeso');
    assert.equal(passoAttuale(a.html('view-rfq')), 'Inviata');
    assert.match(a.html('view-rfq'), /scrivi i prezzi nelle righe/, 'dove decide una persona, la barra lo dice invece di un pulsante');
  });

  it('un ordine confermato propone di ricevere tutto, e dopo il giro è finito', () => {
    const a = app();
    a.eval('renderOrders(); openOrderEdit("o1")');
    assert.match(a.html('view-orders'), /ordMarkAllReceived\('o1'\)/);
    a.eval('ordMarkAllReceived("o1")');
    assert.equal(a.eval('getOrder("o1").status'), 'evaso');
    assert.match(a.html('view-orders'), /Giro completato/);
  });

  it('un ordine annullato è fuori dal giro, e non propone niente', () => {
    const a = app();
    a.eval('getOrder("o1").status = "annullato"; renderOrders(); openOrderEdit("o1")');
    const h = a.html('view-orders');
    assert.equal(passoAttuale(h), undefined);
    assert.match(h, /fuori dal giro/);
    assert.ok(!/doc-step-next"/.test(h));
  });

  it('la commessa ha i suoi passi, e «Metti in produzione» passa dalla stessa domanda del menu', () => {
    const a = app();
    a.eval('renderJobs(); openJobEdit("j1")');
    assert.equal(passoAttuale(a.html('view-jobs')), 'Aperta');
    assert.match(a.html('view-jobs'), /jobSetField\('j1','status','produzione'\)/);
  });
});

describe('I documenti collegati', () => {
  it('l\'ordine risale a richiesta, piano e commessa', () => {
    const a = app();
    const v = JSON.parse(a.eval('JSON.stringify(docLinks("order", getOrder("o1")))'));
    assert.deepEqual(v.map(x => x.tipo + ':' + x.numero), ['job:COM-1', 'plan:FAB-1', 'rfq:RFQ-1']);
  });

  it('la richiesta vede anche l\'ordine che ne è nato', () => {
    const a = app();
    a.eval('renderRfq(); openRfqEdit("r1")');
    const h = a.html('view-rfq');
    assert.match(h, /homeApri\('order','o1'\)/);
    assert.match(h, /homeApri\('plan','p1'\)/);
  });

  it('un documento senza legami non disegna la riga', () => {
    const a = app();
    a.eval('Object.assign(getRfq("r1"), { planId: null, jobId: null }); getOrder("o1").rfqId = null');
    assert.equal(a.eval('docLinksHtml("rfq", getRfq("r1"))'), '');
  });
});
