// Anagrafica clienti (Gestione → Clienti).
//
// Il punto delicato non è il CRUD, è che il cliente vive in due posti: qui
// come record, e nella commessa come testo nel campo Cliente. Finché quel
// campo resta testo, l'unica cosa che tiene insieme i due è il nome — perciò
// il nome è unico, rinominarlo allinea le commesse, ed eliminarlo mentre una
// commessa lo cita è vietato. Sono queste tre regole a essere provate qui:
// senza, l'anagrafica diventa un elenco di nomi che nessuno guarda.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

function app(over) {
  const a = loadApp({ silent: true });
  a.setDb(makeDb(Object.assign({ customers: [], jobs: [] }, over || {})));
  a.asRole('admin');
  return a;
}
function cliente(id, name, over) {
  return Object.assign({ id, name, referente: '', email: '', phone: '', vat: '',
    street: '', streetNumber: '', zip: '', city: '', province: '', country: '', notes: '', active: true }, over || {});
}
function commessa(id, customer) {
  return { id, number: 'COM-2026-' + id, customer, title: '', status: 'aperta', date: '2026-01-10', dueDate: '', active: true };
}
// Compila il modulo in coda alla scheda e preme Aggiungi, come si fa a mano.
function aggiungi(a, campi) {
  Object.entries(campi).forEach(([k, v]) => { a.el(k).value = v; });
  a.eval('addCustomer()');
  return a.snapshot().customers;
}

describe('Clienti — inserimento', () => {
  it('un cliente nuovo entra con i dati del modulo', () => {
    const a = app();
    const cs = aggiungi(a, { 'cli-name': 'Fonderie Bianchi', 'cli-ref': 'Luisa', 'cli-email': 'l@bianchi.it', 'cli-phone': '059 123' });
    assert.equal(cs.length, 1);
    assert.equal(cs[0].name, 'Fonderie Bianchi');
    assert.equal(cs[0].referente, 'Luisa');
    assert.equal(cs[0].email, 'l@bianchi.it');
    assert.equal(cs[0].phone, '059 123');
    assert.equal(cs[0].active, true);
    assert.ok(cs[0].createdAt, 'il record nasce timbrato, o la sincronizzazione non lo vedrebbe');
  });

  it('senza nome non si crea niente', () => {
    const a = app();
    assert.equal(aggiungi(a, { 'cli-name': '', 'cli-ref': 'Luisa' }).length, 0);
  });

  it('lo stesso nome non entra due volte, maiuscole comprese', () => {
    const a = app({ customers: [cliente('c1', 'Fonderie Bianchi')] });
    assert.equal(aggiungi(a, { 'cli-name': 'fonderie bianchi' }).length, 1,
      'due omonimi renderebbero ambiguo il cliente citato dalla commessa');
  });

  it('un lettore non può aggiungere', () => {
    const a = app();
    a.asRole('lettore');
    assert.equal(aggiungi(a, { 'cli-name': 'Fonderie Bianchi' }).length, 0);
  });
});

describe('Clienti — modifica', () => {
  function conModale(over) {
    const a = app(over);
    a.eval('editCustomerModal("c1")');
    return a;
  }
  it('la modifica salva anagrafica, indirizzo e note', () => {
    const a = conModale({ customers: [cliente('c1', 'Fonderie Bianchi')] });
    Object.entries({ 'ec-name': 'Fonderie Bianchi', 'ec-ref': 'Luisa', 'ec-email': 'l@bianchi.it',
      'ec-phone': '059', 'ec-vat': 'IT0123', 'ec-street': 'Via Emilia', 'ec-num': '12',
      'ec-zip': '41100', 'ec-city': 'Modena', 'ec-prov': 'mo', 'ec-country': 'Italia',
      'ec-notes': 'paga a 60gg' }).forEach(([k, v]) => { a.el(k).value = v; });
    a.eval('saveCustomer("c1")');
    const c = a.snapshot().customers[0];
    assert.equal(c.vat, 'IT0123');
    assert.equal(c.city, 'Modena');
    assert.equal(c.province, 'MO', 'la provincia si normalizza in maiuscolo come per i fornitori');
    assert.equal(c.notes, 'paga a 60gg');
  });

  it('rinominare un cliente allinea le commesse che lo citavano', () => {
    const a = conModale({
      customers: [cliente('c1', 'Bianchi')],
      jobs: [commessa('1', 'Bianchi'), commessa('2', ' bianchi '), commessa('3', 'Rossi')],
    });
    a.el('ec-name').value = 'Fonderie Bianchi';
    a.eval('saveCustomer("c1")');
    const jobs = a.snapshot().jobs;
    assert.equal(jobs[0].customer, 'Fonderie Bianchi');
    assert.equal(jobs[1].customer, 'Fonderie Bianchi', 'spazi e maiuscole non devono lasciare indietro una commessa');
    assert.equal(jobs[2].customer, 'Rossi', 'le altre non si toccano');
  });

  it('non si rinomina addosso a un altro cliente', () => {
    const a = conModale({ customers: [cliente('c1', 'Bianchi'), cliente('c2', 'Rossi')] });
    a.el('ec-name').value = 'Rossi';
    a.eval('saveCustomer("c1")');
    assert.equal(a.snapshot().customers[0].name, 'Bianchi');
  });

  it('svuotare il nome non passa', () => {
    const a = conModale({ customers: [cliente('c1', 'Bianchi')] });
    a.el('ec-name').value = '';
    a.eval('saveCustomer("c1")');
    assert.equal(a.snapshot().customers[0].name, 'Bianchi');
  });
});

describe('Clienti — eliminazione', () => {
  it('un cliente citato da una commessa non si elimina', () => {
    const a = app({ customers: [cliente('c1', 'Bianchi')], jobs: [commessa('1', 'Bianchi')] });
    a.eval('delCustomer("c1"); confirmYes();');
    assert.equal(a.snapshot().customers.length, 1,
      'eliminarlo lascerebbe la commessa a citare un cliente che non esiste più');
  });

  it('un cliente non citato se ne va, e resta nel cestino', () => {
    const a = app({ customers: [cliente('c1', 'Bianchi')], jobs: [commessa('1', 'Rossi')] });
    a.eval('delCustomer("c1"); confirmYes();');
    const db = a.snapshot();
    assert.equal(db.customers.length, 0);
    assert.equal((db.trash || []).filter(t => t.coll === 'customers').length, 1,
      'l\'eliminazione deve restare recuperabile come le altre');
  });
});

describe('Clienti — suggerimento nel campo Cliente della commessa', () => {
  it('i nomi attivi si propongono, ordinati e con i caratteri speciali escapati', () => {
    const a = app({ customers: [cliente('c1', 'Zeta & Co'), cliente('c2', 'Alfa'), cliente('c3', 'Sospeso', { active: false })] });
    const html = a.eval('customerDatalist("job-customer-opts")');
    assert.match(html, /id="job-customer-opts"/);
    assert.ok(html.indexOf('Alfa') < html.indexOf('Zeta'), 'in ordine alfabetico: l\'elenco si scorre a occhio');
    assert.match(html, /Zeta &amp; Co/, 'un nome con &amp; non deve rompere il datalist');
    assert.doesNotMatch(html, /Sospeso/, 'un cliente sospeso non si propone per una commessa nuova');
  });

  it('la scheda della commessa aggancia il datalist al campo Cliente', () => {
    const a = app({ customers: [cliente('c1', 'Bianchi')], jobs: [commessa('1', '')] });
    const html = a.eval('renderJobEdit("1")');
    assert.match(html, /list="job-customer-opts"/);
    assert.match(html, /<datalist id="job-customer-opts">/);
  });
});

describe('Clienti — database e migrazioni', () => {
  it('un database senza clienti ne esce con l\'elenco vuoto, non rotto', () => {
    const a = loadApp({ silent: true });
    a.seedStorage({ schemaVersion: 2, items: [], settings: {} });
    a.ref('Store').load();
    assert.deepEqual(a.snapshot().customers, []);
  });

  it('i campi mancanti di un cliente vecchio si normalizzano, indirizzo compreso', () => {
    const a = loadApp({ silent: true });
    a.seedStorage({ schemaVersion: 2, items: [], settings: {},
      customers: [{ id: 'c1', name: 'Bianchi', address: 'Via Emilia 12' }] });
    a.ref('Store').load();
    const c = a.snapshot().customers[0];
    assert.equal(c.street, 'Via Emilia 12', 'il vecchio campo unico diventa la via');
    assert.equal(c.address, undefined);
    ['referente', 'email', 'phone', 'vat', 'notes', 'zip', 'city', 'province', 'country'].forEach(k => {
      assert.equal(c[k], '', 'campo non normalizzato: ' + k);
    });
    assert.equal(c.active, true);
  });

  it('i clienti sono una collezione come le altre: cestino, sincronizzazione e tabella cloud', () => {
    const a = app({ customers: [cliente('c1', 'Bianchi')] });
    assert.ok(a.eval('COLLECTIONS').includes('customers'));
    assert.equal(a.eval('SCHEMA.customers.table'), 'customers');
    const righe = JSON.parse(a.eval('JSON.stringify(flattenDB(db).customers)'));
    assert.equal(righe.length, 1);
    assert.equal(righe[0].name, 'Bianchi');
    assert.equal(a.eval('TRASH_LABELS.customers'), 'Cliente');
  });
});

// Il foglio Clienti si aggiunge alle schede che Gestione → Import esporta e
// rilegge. La chiave è il nome, come per i fornitori: da un foglio si crea e si
// aggiorna, non si rinomina — rinominare da qui lascerebbe le commesse appese
// a un nome che in anagrafica non c'è più, ed è il motivo per cui il rename
// vive solo in Gestione.
describe('Clienti — foglio Excel delle impostazioni', () => {
  function foglio(a, nome) {
    const sheets = JSON.parse(a.eval('JSON.stringify(settingsSheets())'));
    return sheets.find(x => x.name === nome);
  }
  function importa(a, righe) {
    return JSON.parse(a.eval('JSON.stringify(importSettingsSheets(' + JSON.stringify({ Clienti: righe }) + '))'));
  }

  it("l'export porta via i clienti con tutta l'anagrafica", () => {
    const a = app({ customers: [cliente('c1', 'Bianchi', { referente: 'Luisa', city: 'Modena', province: 'MO', notes: 'a 60gg' })] });
    const sh = foglio(a, 'Clienti');
    assert.ok(sh, "il foglio Clienti deve esserci, o l'anagrafica non esce dal browser");
    assert.deepEqual(sh.aoa[0], ['Nome', 'Referente', 'Email', 'Telefono', 'P.IVA / C.F.', 'Via / indirizzo',
      'Numero civico', 'CAP', 'Città', 'Provincia', 'Stato', 'Note', 'Attivo']);
    assert.deepEqual(sh.aoa[1], ['Bianchi', 'Luisa', '', '', '', '', '', '', 'Modena', 'MO', '', 'a 60gg', 'Sì']);
  });

  it("l'import crea i clienti nuovi e aggiorna quelli che ci sono", () => {
    const a = app({ customers: [cliente('c1', 'Bianchi')] });
    const rep = importa(a, [
      { Nome: 'bianchi', Referente: 'Luisa', 'Città': 'Modena', Provincia: 'mo' },
      { Nome: 'Rossi Srl', Email: 'info@rossi.it' },
    ]);
    const cs = a.snapshot().customers;
    assert.equal(cs.length, 2);
    assert.equal(cs[0].referente, 'Luisa', 'il cliente si riconosce dal nome, maiuscole ignorate');
    assert.equal(cs[0].province, 'MO');
    assert.equal(cs[1].email, 'info@rossi.it');
    const s = rep.sheets.find(x => x.name === 'Clienti');
    assert.equal(s.created, 1);
    assert.equal(s.updated, 1);
  });

  it('una riga senza nome si segnala invece di creare un cliente senza nome', () => {
    const a = app();
    const rep = importa(a, [{ Nome: '', Email: 'info@rossi.it' }]);
    assert.equal(a.snapshot().customers.length, 0);
    assert.equal(rep.errors.length, 1);
    assert.match(rep.errors[0], /Clienti, riga 2/);
  });
});

// ═══════════════════════════════════════════════════════════
//  Il campo Cliente della commessa, dall'anagrafica al documento
// ═══════════════════════════════════════════════════════════
// L'anagrafica non vincola la commessa: **suggerisce**. È la scelta che regge
// tutto il resto — un cliente nuovo si scrive comunque e si registra dopo — e
// proprio per questo il legame è il nome, non un riferimento. Qui si prova il
// giro intero: creare, suggerire, scegliere, rinominare, sospendere.
function conAnagrafica() {
  const a = loadApp({ silent: true });
  a.asRole('admin');
  a.setDb(makeDb({
    customers: [
      { id: 'c1', name: 'Rossi Srl', active: true },
      { id: 'c2', name: 'Bianchi Spa', active: true },
      { id: 'c3', name: 'Verdi & C.', active: true },
    ],
    jobs: [{ id: 'j1', number: 'COM-001', customer: '', title: 'Linea', status: 'aperta',
      date: '2026-09-01', lines: [], active: true }],
  }));
  return a;
}
const proposti = a => JSON.parse(a.eval('JSON.stringify(customerNames())'));
const opzioni = html => (html.match(/<datalist id="job-customer-opts">([\s\S]*?)<\/datalist>/) || ['', ''])[1]
  .match(/value="[^"]*"/g) || [];

describe('Il campo Cliente propone l-anagrafica', () => {
  it('la scheda della commessa aggancia il campo al suo elenco', () => {
    const a = conAnagrafica();
    const h = a.eval('renderJobEdit("j1")');
    assert.match(h, /list="job-customer-opts"/);
    assert.match(h, /<datalist id="job-customer-opts">/);
  });

  it('propone i clienti in ordine alfabetico', () => {
    assert.deepEqual(proposti(conAnagrafica()), ['Bianchi Spa', 'Rossi Srl', 'Verdi & C.']);
  });

  it('i nomi finiscono nel datalist, escapati', () => {
    const a = conAnagrafica();
    a.eval('db.customers.push({ id: "c4", name: "D\'Angelo & Figli <Srl>", active: true })');
    const o = opzioni(a.eval('renderJobEdit("j1")'));
    assert.equal(o.length, 4);
    assert.ok(o.some(x => /D&#39;Angelo &amp; Figli &lt;Srl&gt;/.test(x)),
      'il nome viene dall-anagrafica, ma finisce dentro un attributo');
  });

  it('un cliente sospeso non si propone più', () => {
    const a = conAnagrafica();
    a.eval('toggleActive("customers", "c2", "Cliente")');
    assert.deepEqual(proposti(a), ['Rossi Srl', 'Verdi & C.']);
    assert.equal(opzioni(a.eval('renderJobEdit("j1")')).length, 2);
  });

  it('un cliente senza nome non lascia una voce vuota nell-elenco', () => {
    const a = conAnagrafica();
    a.eval('db.customers.push({ id: "c9", name: "", active: true })');
    assert.deepEqual(proposti(a), ['Bianchi Spa', 'Rossi Srl', 'Verdi & C.']);
  });

  it('con l-anagrafica vuota l-elenco c-è ma è vuoto, e il campo resta scrivibile', () => {
    const a = conAnagrafica();
    a.eval('db.customers = []');
    const h = a.eval('renderJobEdit("j1")');
    assert.match(h, /<datalist id="job-customer-opts"><\/datalist>/);
    assert.match(h, /list="job-customer-opts"/, 'suggerire non è vincolare');
  });
});

describe('Il campo Cliente accetta quello che si scrive', () => {
  it('un nome scelto dall-elenco si scrive tale e quale', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "Rossi Srl")');
    assert.equal(a.eval('getJob("j1").customer'), 'Rossi Srl');
  });

  it('un cliente che in anagrafica non c-è si scrive lo stesso', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "Cliente Mai Visto")');
    assert.equal(a.eval('getJob("j1").customer'), 'Cliente Mai Visto');
    assert.equal(a.eval('db.customers.length'), 3, 'e non lo si registra di nascosto');
  });

  it('gli spazi ai bordi non entrano nel dato', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "  Rossi Srl  ")');
    assert.equal(a.eval('getJob("j1").customer'), 'Rossi Srl',
      'quel testo è la chiave verso l-anagrafica: coinciderebbe solo perché ogni confronto ricorda di ripulirlo');
  });
});

describe('Rinominare un cliente allinea le commesse', () => {
  it('la commessa segue il nome nuovo', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "Rossi Srl")');
    a.eval('editCustomerModal("c1")');
    a.el('ec-name').value = 'Rossi S.r.l.';
    a.eval('saveCustomer("c1")');
    assert.equal(a.eval('db.customers.find(c => c.id === "c1").name'), 'Rossi S.r.l.');
    assert.equal(a.eval('getJob("j1").customer'), 'Rossi S.r.l.',
      'altrimenti resterebbe appesa a un nome che in anagrafica non esiste più');
  });

  it('allinea anche chi l-aveva scritto con altre maiuscole', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "ROSSI SRL")');
    a.eval('editCustomerModal("c1")');
    a.el('ec-name').value = 'Rossi S.r.l.';
    a.eval('saveCustomer("c1")');
    assert.equal(a.eval('getJob("j1").customer'), 'Rossi S.r.l.');
  });

  it('le commesse di altri clienti non si toccano', () => {
    const a = conAnagrafica();
    a.eval('db.jobs.push({ id: "j2", number: "COM-002", customer: "Bianchi Spa", title: "Y", status: "aperta", date: "2026-09-02", lines: [], active: true })');
    a.eval('jobSetField("j1", "customer", "Rossi Srl")');
    a.eval('editCustomerModal("c1")');
    a.el('ec-name').value = 'Rossi S.r.l.';
    a.eval('saveCustomer("c1")');
    assert.equal(a.eval('getJob("j2").customer'), 'Bianchi Spa');
  });

  it('due clienti non possono chiamarsi uguale, nemmeno cambiando le maiuscole', () => {
    const a = conAnagrafica();
    a.eval('editCustomerModal("c1")');
    a.el('ec-name').value = 'bianchi spa';
    a.eval('saveCustomer("c1")');
    assert.equal(a.eval('db.customers.find(c => c.id === "c1").name'), 'Rossi Srl',
      'due omonimi renderebbero ambigua la citazione della commessa');
  });
});

describe('Un cliente citato da una commessa non si elimina', () => {
  it('con una commessa che lo cita, resta', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "Rossi Srl")');
    a.eval('delCustomer("c1")');
    a.eval('try { confirmYes(); } catch (e) {}');
    assert.ok(a.eval('!!db.customers.find(c => c.id === "c1")'));
  });

  it('vale anche se la commessa lo scrive con altre maiuscole o spazi', () => {
    const a = conAnagrafica();
    a.eval('db.jobs[0].customer = "  rossi srl "');
    a.eval('delCustomer("c1")');
    a.eval('try { confirmYes(); } catch (e) {}');
    assert.ok(a.eval('!!db.customers.find(c => c.id === "c1")'));
  });

  it('chi non è citato da nessuno si elimina', () => {
    const a = conAnagrafica();
    a.eval('delCustomer("c3")');
    a.eval('confirmYes()');
    assert.equal(a.eval('!!db.customers.find(c => c.id === "c3")'), false);
  });
});

describe('Il cliente nella vita della commessa', () => {
  it('la ricerca dell-elenco lo trova', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "Rossi Srl")');
    a.eval('jobView = "list"; renderJobs();');
    a.el('job-search').value = 'rossi';
    assert.equal(a.eval('jobFilteredList().length'), 1);
    a.el('job-search').value = 'bianchi';
    assert.equal(a.eval('jobFilteredList().length'), 0);
  });

  it('ed esce nell-export dell-elenco', () => {
    const a = conAnagrafica();
    a.eval('jobSetField("j1", "customer", "Rossi Srl")');
    a.eval('jobView = "list"; renderJobs();');
    const righe = a.eval('JSON.stringify(jobsExportSpec().sezioni[0].righe)');
    assert.match(righe, /Rossi Srl/);
  });
});
