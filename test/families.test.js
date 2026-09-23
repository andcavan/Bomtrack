// La sigla di famiglia e sottofamiglia compone il codice articolo:
// CMM-MEC-CUS-007. Se si ripete nel proprio campo di gara, da quel codice non
// si risale più a quale famiglia venga l'articolo — che è l'unica ragione per
// cui il codice è costruito a segmenti.
//
// Il campo di gara è quello che il codice non ha già fissato da sé: l'ambito
// per una macrofamiglia (il prefisso CMM/MAT/PRT separa già i tre), la
// macrofamiglia per una sottofamiglia. Fuori di lì la stessa sigla si ripete
// senza ambiguità, e questi test lo mettono per iscritto: sono i due casi
// «ammesso» a distinguere questa regola da un'unicità globale.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const { loadApp } = require('./harness.js');
const { makeDb } = require('./fixtures.js');

function fam(id, name, kind, sigla, subs) {
  return { id, name, kind, sigla, subs: subs || [] };
}
// Due ambiti diversi che portano la stessa sigla MEC: è il caso lecito, e sta
// nei dati di partenza perché ogni test lo attraversi senza doverlo costruire.
function dati() {
  return makeDb({
    families: [
      fam('f1', 'Meccanico', 'acquistato', 'MEC', [
        { id: 'f1s1', name: 'Cuscinetti', sigla: 'CUS' },
        { id: 'f1s2', name: 'Guarnizioni', sigla: 'GUA' },
      ]),
      fam('f2', 'Idraulico', 'acquistato', 'IDR', [
        { id: 'f2s1', name: 'Custodie', sigla: 'CUS' },
      ]),
      fam('f3', 'Meccanica generale', 'materiale', 'MEC', []),
    ],
  });
}
function app() {
  const a = loadApp({ silent: true });
  a.setDb(dati());
  a.asRole('admin');
  return a;
}
const vf = (a, sigla, kind, except) =>
  a.eval(`validateFamilySigla(${JSON.stringify(sigla)}, ${JSON.stringify(kind)}, ${JSON.stringify(except || null)})`);
const vs = (a, sigla, famId, except) =>
  a.eval(`validateSubFamilySigla(${JSON.stringify(sigla)}, ${JSON.stringify(famId)}, ${JSON.stringify(except || null)})`);

describe('Sigla macrofamiglia — unica dentro il suo ambito', () => {
  it('una sigla libera passa', () => {
    assert.equal(vf(app(), 'PNE', 'acquistato'), null);
  });

  it('una sigla già usata nello stesso ambito è rifiutata, e dice da chi', () => {
    const msg = vf(app(), 'MEC', 'acquistato');
    assert.ok(msg, 'MEC è di Meccanico');
    assert.match(msg, /Meccanico/, 'il messaggio deve nominare chi la usa, o non si sa cosa cambiare');
  });

  it('la stessa sigla in un ambito diverso è ammessa', () => {
    assert.equal(vf(app(), 'MEC', 'parte'), null,
      'il prefisso PRT/CMM separa già i due codici: non c\'è ambiguità da impedire');
    assert.equal(vf(app(), 'IDR', 'materiale'), null);
  });

  it('risalvare senza cambiare sigla non si autoblocca', () => {
    assert.equal(vf(app(), 'MEC', 'acquistato', 'f1'), null, 'f1 è proprio chi la porta');
  });

  it('spazi e minuscole non fanno passare un duplicato', () => {
    assert.ok(vf(app(), '  mec ', 'acquistato'), 'la sigla si confronta normalizzata');
  });

  it('una sigla vuota non è un duplicato: la dedurrà dal nome', () => {
    assert.equal(vf(app(), '', 'acquistato'), null);
  });

  it('senza sigla scritta il messaggio dice che è dedotta dal nome', () => {
    const msg = app().eval("validateFamilySigla('MEC', 'acquistato', null, true)");
    assert.match(msg, /dedotta dal nome/,
      'chi ha lasciato il campo vuoto non ha scritto MEC da nessuna parte');
  });
});

describe('Sigla sottofamiglia — unica dentro la sua macrofamiglia', () => {
  it('una sigla libera nella famiglia passa', () => {
    assert.equal(vs(app(), 'RID', 'f1'), null);
  });

  it('una sorella con la stessa sigla la rifiuta', () => {
    const msg = vs(app(), 'CUS', 'f1');
    assert.ok(msg);
    assert.match(msg, /Cuscinetti/);
  });

  it('la stessa sigla in un\'altra macrofamiglia è ammessa', () => {
    assert.equal(vs(app(), 'GUA', 'f2'), null,
      'il segmento precedente ha già scelto la famiglia: CMM-IDR-GUA non si confonde con CMM-MEC-GUA');
  });

  it('risalvare la stessa sottofamiglia non si autoblocca', () => {
    assert.equal(vs(app(), 'CUS', 'f1', 'f1s1'), null);
  });

  it('una famiglia che non esiste non inventa un errore', () => {
    assert.equal(vs(app(), 'CUS', 'inesistente'), null);
  });
});

describe('siglaLibera — la prima sigla libera vicina', () => {
  it('se la proposta è libera la tiene', () => {
    assert.equal(app().eval("siglaLibera('Pneumatico', 'PNE', new Set(['MEC']))"), 'PNE');
  });

  it('prima si allunga sul nome, che resta leggibile', () => {
    assert.equal(app().eval("siglaLibera('Meccanica', 'MEC', new Set(['MEC']))"), 'MECC',
      'MECC dice ancora "Meccanica"; MEC2 non dice niente');
  });

  it('quando il nome è esaurito, numera', () => {
    assert.equal(app().eval("siglaLibera('Mec', 'MEC', new Set(['MEC']))"), 'MEC2',
      'un nome di tre lettere non ha un quarto carattere da offrire');
  });

  it('non supera mai i 6 caratteri, che è il massimo del campo in Gestione', () => {
    const prese = ['MEC', 'MECC', 'MECCA', 'MECCAN', 'MEC2', 'MEC3'];
    const s = app().eval(`siglaLibera('Meccanicamente', 'MEC', new Set(${JSON.stringify(prese)}))`);
    assert.ok(s.length <= 6, 'sigla troppo lunga: ' + s);
    assert.ok(!prese.includes(s), 'e deve essere libera: ' + s);
  });

  it('un nome senza lettere ricade sul ripiego, senza girare a vuoto', () => {
    const s = app().eval("siglaLibera('123', '', new Set(['XXX']))");
    assert.ok(s && s !== 'XXX', 'ha trovato ' + s);
  });
});

describe('duplicateSiglaGroups — le sigle ripetute già in archivio', () => {
  it('un archivio pulito non segnala niente', () => {
    assert.equal(app().eval('duplicateSiglaGroups().length'), 0,
      'MEC in due ambiti diversi e CUS in due famiglie diverse non sono duplicati');
  });

  it('due macrofamiglie dello stesso ambito con la stessa sigla si segnalano', () => {
    const a = app();
    a.eval("db.families.push({ id: 'f4', name: 'Meccanica fine', kind: 'acquistato', sigla: 'MEC', subs: [] })");
    const g = JSON.parse(a.eval('JSON.stringify(duplicateSiglaGroups())'));
    assert.equal(g.length, 1);
    assert.equal(g[0].sigla, 'MEC');
    assert.equal(g[0].dove, 'macrofamiglie');
    assert.deepEqual(g[0].nomi.slice().sort(), ['Meccanica fine', 'Meccanico']);
  });

  it('due sorelle con la stessa sigla si segnalano, e dicono in quale famiglia', () => {
    const a = app();
    a.eval("getFamily('f1').subs.push({ id: 'f1s3', name: 'Custodie', sigla: 'CUS' })");
    const g = JSON.parse(a.eval('JSON.stringify(duplicateSiglaGroups())'));
    assert.equal(g.length, 1);
    assert.equal(g[0].dove, 'Meccanico', 'senza il nome della famiglia non si sa dove guardare');
  });

  it('filtrando per ambito non si vedono i duplicati degli altri', () => {
    const a = app();
    a.eval("db.families.push({ id: 'f5', name: 'Meccanica fine', kind: 'materiale', sigla: 'MEC', subs: [] })");
    assert.equal(a.eval("duplicateSiglaGroups('materiale').length"), 1);
    assert.equal(a.eval("duplicateSiglaGroups('acquistato').length"), 0);
  });
});

describe('Gestione — la guardia impedisce di introdurre duplicati', () => {
  it('una macrofamiglia con sigla già in uso non entra nel database', () => {
    const a = app();
    a.el('fam-name-acquistato').value = 'Meccanica fine';
    a.el('fam-sigla-acquistato').value = 'MEC';
    a.eval('addFamily("acquistato")');
    assert.equal(a.eval('db.families.length'), 3, 'niente scritto');
  });

  it('la stessa sigla in un altro ambito entra', () => {
    const a = app();
    a.el('fam-name-parte').value = 'Meccanica fine';
    a.el('fam-sigla-parte').value = 'MEC';
    a.eval('addFamily("parte")');
    assert.equal(a.eval('db.families.length'), 4);
  });

  it('una sottofamiglia con la sigla di una sorella non entra', () => {
    const a = app();
    a.el('sub-name-f1').value = 'Custodie';
    a.el('sub-sigla-f1').value = 'CUS';
    a.eval('addSubFamily("f1")');
    assert.equal(a.eval("getFamily('f1').subs.length"), 2, 'niente aggiunto');
  });

  it('anche la sigla dedotta dal nome è soggetta alla regola', () => {
    const a = app();
    a.el('fam-name-acquistato').value = 'Meccanismi';   // → MEC, come Meccanico
    a.el('fam-sigla-acquistato').value = '';
    a.eval('addFamily("acquistato")');
    assert.equal(a.eval('db.families.length'), 3,
      'lasciare il campo vuoto non è una scorciatoia per introdurre un duplicato');
  });
});

describe('Import — la sigla si scosta da sola, e lo dichiara', () => {
  const REP = '{ warnings: [], createdFamilies: 0, createdSubFamilies: 0 }';

  it('una famiglia nuova che collide nasce con una sigla diversa', () => {
    const a = app();
    const out = JSON.parse(a.eval(`
      (() => {
        const r = ${REP};
        const res = findOrCreateFamily('Meccanismi', '', 'acquistato', r);
        return JSON.stringify({ sigla: getFamily(res.familyId).sigla, warn: r.warnings });
      })()`));
    assert.notEqual(out.sigla, 'MEC', 'MEC era di Meccanico');
    assert.equal(out.warn.length, 1, 'e la cosa non deve succedere in silenzio');
    assert.match(out.warn[0], /Meccanismi/);
  });

  it('senza collisione non lascia avvisi', () => {
    const a = app();
    assert.equal(a.eval(`
      (() => {
        const r = ${REP};
        findOrCreateFamily('Pneumatico', '', 'acquistato', r);
        return r.warnings.length;
      })()`), 0);
  });

  it('due famiglie nuove che collidono fra loro prendono sigle diverse', () => {
    const a = app();
    const sigle = JSON.parse(a.eval(`
      (() => {
        const r = ${REP};
        const x = findOrCreateFamily('Pneumatica', '', 'acquistato', r);
        const y = findOrCreateFamily('Pneumatico', '', 'acquistato', r);
        return JSON.stringify([getFamily(x.familyId).sigla, getFamily(y.familyId).sigla]);
      })()`));
    assert.notEqual(sigle[0], sigle[1], 'la seconda deve vedere la prima appena creata');
  });

  it('anche una sottofamiglia nuova che collide si scosta', () => {
    const a = app();
    const out = JSON.parse(a.eval(`
      (() => {
        const r = ${REP};
        const res = findOrCreateFamily('Meccanico', 'Custodie', 'acquistato', r);
        const s = getFamily('f1').subs.find(x => x.id === res.subFamilyId);
        return JSON.stringify({ sigla: s.sigla, warn: r.warnings });
      })()`));
    assert.notEqual(out.sigla, 'CUS', 'CUS era di Cuscinetti, nella stessa famiglia');
    assert.equal(out.warn.length, 1);
  });
});

// L'avviso finisce in innerHTML in tutti e due i report d'import, che si
// affidano a chi lo scrive: qui il testo arriva da una cella Excel, cioè da
// fuori. Ogni altro push del repo passa da esc(); questo se n-era dimenticato.
describe('Import — l-avviso porta testo che viene da un file', () => {
  const REP = '{ warnings: [], createdFamilies: 0, createdSubFamilies: 0 }';

  it('un nome con dentro del markup esce escapato', () => {
    const a = app();
    const cattivo = 'Meccanismi <img src=x onerror=alert(1)>';
    const warn = JSON.parse(a.eval(`
      (() => {
        const r = ${REP};
        findOrCreateFamily(${JSON.stringify(cattivo)}, '', 'acquistato', r);
        return JSON.stringify(r.warnings);
      })()`));
    assert.equal(warn.length, 1, 'la sigla collide con MEC di Meccanico, quindi l-avviso c-è');
    assert.doesNotMatch(warn[0], /<img/, 'il tag non deve arrivare intero al innerHTML del report');
    assert.match(warn[0], /&lt;img/, 'ci arriva scritto, e si legge');
  });

  it('la famiglia viene creata lo stesso, col suo nome vero', () => {
    const a = app();
    const cattivo = 'Meccanismi <img src=x>';
    const nome = a.eval(`
      (() => {
        const r = ${REP};
        const res = findOrCreateFamily(${JSON.stringify(cattivo)}, '', 'acquistato', r);
        return getFamily(res.familyId).name;
      })()`);
    assert.equal(nome, cattivo, 'escapare è un fatto della stampa, non del dato');
  });
});
