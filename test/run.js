// Suite Bomtrack. Nessuna dipendenza: `node test/run.js` e basta.
// Esegue tutti i file test/*.test.js in ordine alfabetico.

const fs = require('node:fs');
const path = require('node:path');
const { summary } = require('./tap.js');

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

console.log('Bomtrack — suite di test (' + files.length + ' file)');
files.forEach(f => {
  console.log('\n=== ' + f + ' ===');
  require(path.join(__dirname, f));
});

process.exitCode = summary() ? 1 : 0;
