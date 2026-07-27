// Costruttori di database sintetici. Volutamente minimi: ogni test dichiara
// solo ciò che serve al ramo che verifica, così i numeri attesi restano
// calcolabili a mente e un fallimento indica un punto preciso.

// schemaVersion: 2 è obbligatorio — senza, migrateDB() lancerebbe migrateV2()
// e riscriverebbe tutti gli id in UUID, mandando a vuoto i riferimenti scritti
// a mano qui sotto. I flag *Seeded evitano il seed delle famiglie predefinite.
function makeDb(over) {
  const o = over || {};
  const base = {
    schemaVersion: 2,
    suppliers: [], rfqs: [], orders: [], users: [], families: [],
    workCenters: o.workCenters || [],
    items: o.items || [],
    settings: Object.assign({
      overheadPct: 0, marginPct: 0, currency: '€', codeDigits: 3,
      partCostModeDefault: 'cycle',
      uoms: [], uomDefault: 'pz', concepts: [],
      mpFamiliesSeeded: true, partFamiliesSeeded: true,
    }, o.settings || {}),
  };
  Object.keys(o).forEach(k => { if (k !== 'settings') base[k] = o[k]; });
  return base;
}

function mat(id, unitCost) {
  return { id, code: id.toUpperCase(), name: 'Materia ' + id, type: 'materiale', uom: 'kg', unitCost, active: true };
}
function acq(id, purchasePrice) {
  return { id, code: id.toUpperCase(), name: 'Commerciale ' + id, type: 'acquistato', uom: 'pz', purchasePrice, active: true };
}
function parte(id, o) {
  return Object.assign({ id, code: id.toUpperCase(), name: 'Parte ' + id, type: 'parte', uom: 'pz', unitCost: 0, cycle: [], active: true }, o || {});
}
function asm(id, type, o) {
  return Object.assign({ id, code: id.toUpperCase(), name: 'Assieme ' + id, type, uom: 'pz', components: [], operations: [], active: true }, o || {});
}
function comp(itemId, qty, scrapPct) { return { itemId, qty, scrapPct: scrapPct || 0 }; }
function wc(id, hourlyRate) { return { id, name: 'CDL ' + id, hourlyRate, active: true }; }

module.exports = { makeDb, mat, acq, parte, asm, comp, wc };
