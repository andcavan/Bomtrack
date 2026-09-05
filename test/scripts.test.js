// L'ordine dei <script>.
//
// L'app non ha moduli: è una sequenza di classic script in uno scope solo, e
// `init()` sta in fondo all'ultimo di essi. Chi ne aggiunge uno dopo rompe
// l'avvio — le funzioni del file nuovo non esistono ancora quando la prima
// vista si disegna — e su `file://` il browser non lo dice nemmeno: l'errore
// arriva come «Script error.», senza riga né stack, perché lo script viene da
// un'origine opaca. È già successo, e la suite non se n'era accorta perché
// l'harness non chiama `init()`.
//
// Questi due controlli costano niente e rendono impossibile ripeterlo.

const assert = require('node:assert/strict');
const { describe, it } = require('./tap.js');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// Solo gli script dell'app: le librerie di export stanno in vendor/ e vengono
// prima di tutto, nel <head>.
function scriptDiIndex() {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  return [...html.matchAll(/<script src="([^"]+)"><\/script>/g)]
    .map(m => m[1])
    .filter(src => !src.startsWith('vendor/'));
}
function srcDellHarness() {
  const js = fs.readFileSync(path.join(__dirname, 'harness.js'), 'utf8');
  const m = js.match(/const SRC = \[([\s\S]*?)\];/);
  return m[1].split(',').map(s => s.trim().replace(/^'|'$/g, '')).filter(Boolean);
}

describe('Ordine di caricamento', () => {
  it('l\'avvio resta nell\'ultimo script: dopo di lui non ci va nessuno', () => {
    const scripts = scriptDiIndex();
    assert.equal(scripts[scripts.length - 1], 'import-export.js',
      'init() è in fondo a import-export.js: uno script caricato dopo non esiste ancora quando l\'app disegna la prima vista');
  });

  it('la suite carica gli stessi file nello stesso ordine della pagina', () => {
    assert.deepEqual(srcDellHarness(), scriptDiIndex(),
      'se le due sequenze divergono la suite prova un\'app diversa da quella che gira nel browser');
  });

  it('ogni script dichiarato esiste davvero', () => {
    scriptDiIndex().forEach(src => {
      assert.ok(fs.existsSync(path.join(ROOT, src)), `manca il file ${src}`);
    });
  });
});
