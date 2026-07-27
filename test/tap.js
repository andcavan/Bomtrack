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

function it(name, fn) {
  try {
    fn();
    passed++;
    console.log('    ok   ' + name);
  } catch (e) {
    failed++;
    failures.push({ suite, name, err: e });
    console.log('    FAIL ' + name);
    console.log('         ' + String((e && e.message) || e).split('\n').join('\n         '));
  }
}

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

module.exports = { describe, it, approx, summary };
