// Runner minimale: nessuna dipendenza, solo moduli core di Node.
// I test sono sincroni e vengono eseguiti nel momento in cui `it()` li registra,
// così l'output segue l'ordine dei file.

let passed = 0;
let failed = 0;
const failures = [];
let suite = '';

function describe(name, fn) {
  suite = name;
  console.log('\n  ' + name);
  fn();
  suite = '';
}

// Un test che restituisce una Promise (async) si conta quando si chiude: prima
// veniva dato per buono subito, e un'asserzione fallita dopo un `await`
// diventava un rifiuto non gestito, fuori dal conteggio. `attendi()` li aspetta
// tutti prima del riepilogo.
const inSospeso = [];
function it(name, fn) {
  const ok = () => { passed++; console.log('    ok   ' + name); };
  const ko = (e, s) => {
    failed++;
    failures.push({ suite: s, name, err: e });
    console.log('    FAIL ' + name);
    console.log('         ' + String((e && e.message) || e).split('\n').join('\n         '));
  };
  const s = suite;
  try {
    const r = fn();
    if (r && typeof r.then === 'function') inSospeso.push(Promise.resolve(r).then(ok, e => ko(e, s)));
    else ok();
  } catch (e) { ko(e, s); }
}
function attendi() { return Promise.all(inSospeso.splice(0)); }

// I costi sono float: il confronto esatto fallirebbe su valori come 220.00000000000003.
function approx(actual, expected, msg, eps) {
  const e = eps == null ? 1e-9 : eps;
  if (!(Math.abs(actual - expected) <= e)) {
    throw new Error((msg ? msg + ': ' : '') + 'atteso ' + expected + ', ottenuto ' + actual);
  }
}

function summary() {
  console.log('\n' + '-'.repeat(56));
  console.log('  ' + passed + ' ok, ' + failed + ' fallito/i');
  if (failed) {
    console.log('\n  Dettaglio fallimenti:');
    failures.forEach(f => {
      console.log('   - [' + f.suite + '] ' + f.name);
      console.log('     ' + String((f.err && f.err.stack) || f.err).split('\n').slice(0, 4).join('\n     '));
    });
  }
  return failed;
}

module.exports = { describe, it, approx, summary, attendi };
