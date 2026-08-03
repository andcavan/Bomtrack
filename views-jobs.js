// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-jobs.js
// ═══════════════════════════════════════════════════════════
// Commesse: il cliente e la data a monte del lavoro.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.
//
// ── Perché ──
// L'app sapeva già collegare fabbisogno → richiesta → ordine: la catena
// esisteva, ma partiva da un piano di produzione, che è un foglio di lavoro
// interno. Mancava l'anello a monte, cioè **per chi** e **per quando** si sta
// facendo tutto questo. Senza, alla domanda «cosa abbiamo ordinato per la
// commessa 240?» si risponde aprendo gli ordini a uno a uno.
//
// La commessa non aggiunge calcoli: aggiunge un nome e una data in cima alla
// catena, e la possibilità di percorrerla al contrario.

const JOB_STATUS = {
  aperta: 'Aperta',
  produzione: 'In produzione',
  chiusa: 'Chiusa',
  annullata: 'Annullata',
};
function jobList() { return db.jobs || []; }
function getJob(id) { return jobList().find(j => j.id === id); }
function jobLabel(j) { return j ? (j.number + (j.customer ? ' — ' + j.customer : '')) : ''; }
// Progressivo per anno, come richieste, ordini e piani: COM-<anno>-NNN
function nextJobNumber() {
  const prefix = `COM-${new Date().getFullYear()}-`;
  const seqs = jobList().filter(j => (j.number || '').startsWith(prefix))
    .map(j => parseInt((j.number || '').slice(prefix.length), 10) || 0);
  return prefix + String((seqs.length ? Math.max(...seqs) : 0) + 1).padStart(3, '0');
}
function jobOptions(selectedId) {
  // Le commesse chiuse restano selezionabili solo se già scelte: non si
  // aggancia lavoro nuovo a una commessa finita, ma i piani vecchi non devono
  // perdere il proprio riferimento.
  const aperte = jobList().filter(j => j.status !== 'chiusa' && j.status !== 'annullata' || j.id === selectedId);
  return `<option value="">— nessuna —</option>` + aperte
    .map(j => `<option value="${j.id}" ${j.id === selectedId ? 'selected' : ''}>${esc(jobLabel(j))}</option>`).join('');
}

// ─── Tracciabilità: cosa pende da una commessa ───
function jobPlans(jobId) { return (db.plans || []).filter(p => p.jobId === jobId); }
function jobDocs(jobId) {
  const planIds = new Set(jobPlans(jobId).map(p => p.id));
  // Un documento appartiene alla commessa se la cita, oppure se viene da un
  // piano che la cita: la seconda strada copre i documenti generati prima che
  // la commessa fosse assegnata al piano.
  const suo = d => d.jobId === jobId || (d.planId && planIds.has(d.planId));
  return { rfqs: (db.rfqs || []).filter(suo), orders: (db.orders || []).filter(suo) };
}
// Quanto è stato ordinato per una commessa, e quanto è già arrivato.
function jobTotals(jobId) {
  const { orders } = jobDocs(jobId);
  let ordinato = 0, ricevuto = 0, righe = 0;
  orders.forEach(o => {
    if (o.status === 'annullato') return;
    (o.lines || []).forEach(l => {
      const q = Number(l.qty) || 0, p = Number(l.price) || 0, r = Number(l.received) || 0;
      ordinato += q * p; ricevuto += r * p; righe++;
    });
  });
  return { ordinato, ricevuto, righe, ordini: orders.length };
}
// Ritardo: la commessa ha una data e quella data è passata senza chiusura.
function jobLate(j) {
  return !!j && !!j.dueDate && j.status !== 'chiusa' && j.status !== 'annullata' && j.dueDate < oggiISO();
}

// ─── Vista ───
let jobView = 'list';       // 'list' | 'edit'
let currentJobId = null;

function renderJobs() {
  const host = document.getElementById('view-jobs'); if (!host) return;
  invalidateCaches();
  if (jobView === 'edit' && !getJob(currentJobId)) { jobView = 'list'; currentJobId = null; }
  host.innerHTML = jobView === 'edit' ? renderJobEdit(currentJobId) : renderJobList();
  a11yFields(host);
}
function jobSearchInput() { debounced('jobs', renderJobs); }
function renderJobList() {
  const q = (val('job-search') || '').toLowerCase();
  const tutte = jobList().slice().sort((a, b) => String(b.number || '').localeCompare(String(a.number || '')));
  const righe = tutte.filter(j => !q || (j.number + ' ' + (j.customer || '') + ' ' + (j.title || '')).toLowerCase().includes(q));
  const corpo = righe.map(j => {
    const t = jobTotals(j.id);
    const piani = jobPlans(j.id).length;
    return `<div class="mgmt-item" ${clickAttrs(`openJobEdit('${j.id}')`, `Apri la commessa ${j.number}`)} style="cursor:pointer">
      <span style="font-family:var(--mono);font-weight:700;width:130px">${esc(j.number)}</span>
      <span class="doc-badge">${esc(JOB_STATUS[j.status] || j.status || '—')}</span>
      <span style="flex:1">${esc(j.customer || '')}${j.title ? ' · ' + esc(j.title) : ''}</span>
      <span class="empty-text" style="padding:0${jobLate(j) ? ';color:var(--red);font-weight:700' : ''}">
        ${j.dueDate ? (jobLate(j) ? '⚠ ' : '') + esc(fmtDateIt(j.dueDate)) : '—'}</span>
      <span class="empty-text" style="padding:0;width:170px;text-align:right">${piani} ${piani === 1 ? 'piano' : 'piani'} · ${t.ordini} ${t.ordini === 1 ? 'ordine' : 'ordini'}</span>
      <span style="font-family:var(--mono);width:110px;text-align:right">${fmtN(t.ordinato)}</span>
    </div>`;
  }).join('') || `<div class="empty-text">${tutte.length ? 'Nessuna commessa con questa ricerca.' : 'Nessuna commessa. Creane una con "+ Nuova commessa".'}</div>`;
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <h2 class="section-title">🧾 Commesse</h2>
      <button class="add-btn-sm" onclick="newJob()">+ Nuova commessa</button>
    </div>
    <div class="catalog-filters">
      <input type="text" class="search" id="job-search" value="${esc(val('job-search'))}" placeholder="🔍 Numero, cliente o descrizione..." oninput="jobSearchInput()">
      <span class="doc-filter-count">${righe.length === tutte.length ? tutte.length + (tutte.length === 1 ? ' commessa' : ' commesse') : righe.length + ' di ' + tutte.length}</span>
    </div>
    <div class="mgmt-list">${corpo}</div></div>`;
}
function renderJobEdit(id) {
  const j = getJob(id); if (!j) return '';
  const piani = jobPlans(id);
  const { rfqs, orders } = jobDocs(id);
  const t = jobTotals(id);
  const elenco = (titolo, righe, vuoto) => `<div class="mrp-section">
    <div class="cycle-section-head"><h3>${titolo}</h3></div>
    ${righe || `<div class="empty-text">${vuoto}</div>`}</div>`;
  const rigaPiano = p => `<div class="mgmt-item">
      <span style="font-family:var(--mono);width:150px">${esc(p.number)}</span>
      <span style="flex:1">${esc(p.title || '')}</span>
      <span class="empty-text" style="padding:0">${p.dueDate ? esc(fmtDateIt(p.dueDate)) : ''}</span>
      <button class="btn-ghost" onclick="apriPianoDaCommessa('${p.id}')">Apri →</button></div>`;
  const rigaDoc = (d, tipo) => `<div class="mgmt-item">
      <span style="font-family:var(--mono);width:150px">${esc(d.number)}</span>
      <span class="doc-badge">${esc((tipo === 'rfq' ? RFQ_STATUS : ORDER_STATUS)[d.status] || d.status)}</span>
      <span style="flex:1">${esc(supplierName(d.supplierId) || '—')}</span>
      <button class="btn-ghost" onclick="${tipo === 'rfq' ? `apriRfqDaCommessa('${d.id}')` : `apriOrdineDaCommessa('${d.id}')`}">Apri →</button></div>`;
  return `<div class="manage-wrap">
    <div class="bom-toolbar">
      <button class="btn-outline" onclick="jobBackToList()">← Elenco</button>
      <h2 class="section-title" style="margin:0">🧾 ${esc(j.number)}</h2>
      <button class="btn-outline" style="color:var(--red);border-color:var(--red)" onclick="delJob('${id}')">🗑 Elimina</button>
    </div>
    <div class="modal-grid">
      <div class="modal-field"><label>Cliente</label>
        <input value="${esc(j.customer || '')}" onchange="jobSetField('${id}','customer',this.value)"></div>
      <div class="modal-field"><label>Descrizione</label>
        <input value="${esc(j.title || '')}" onchange="jobSetField('${id}','title',this.value)"></div>
      <div class="modal-field"><label>Riferimento cliente</label>
        <input value="${esc(j.customerRef || '')}" placeholder="ordine cliente, offerta…" onchange="jobSetField('${id}','customerRef',this.value)"></div>
      <div class="modal-field"><label>Stato</label>
        <select onchange="jobSetField('${id}','status',this.value)">
          ${Object.keys(JOB_STATUS).map(k => `<option value="${k}" ${j.status === k ? 'selected' : ''}>${esc(JOB_STATUS[k])}</option>`).join('')}
        </select></div>
      <div class="modal-field"><label>Data apertura</label>
        <input type="date" value="${esc(j.date || '')}" onchange="jobSetField('${id}','date',this.value)"></div>
      <div class="modal-field"><label>Consegna al cliente</label>
        <input type="date" value="${esc(j.dueDate || '')}" onchange="jobSetField('${id}','dueDate',this.value)"></div>
      <div class="modal-field" style="grid-column:1/-1"><label>Note</label>
        <input value="${esc(j.notes || '')}" onchange="jobSetField('${id}','notes',this.value)"></div>
    </div>
    ${jobLate(j) ? `<div class="empty-text" style="text-align:left;color:var(--red)">⚠ La consegna al cliente era il ${esc(fmtDateIt(j.dueDate))} e la commessa è ancora ${esc((JOB_STATUS[j.status] || '').toLowerCase())}.</div>` : ''}
    ${stampLine(j)}

    <div class="cost-summary">
      ${kpi('Ordinato', fmtN(t.ordinato), 'accent')}
      ${kpi('Già ricevuto', fmtN(t.ricevuto), 'green')}
      ${kpi('Ancora atteso', fmtN(t.ordinato - t.ricevuto), t.ordinato - t.ricevuto > 0 ? 'orange' : '')}
      ${kpi('Piani di fabbisogno', String(piani.length), 'purple')}
    </div>

    ${elenco('📋 Fabbisogni', piani.map(rigaPiano).join(''), 'Nessun piano collegato. Si aggancia dalla testata di un piano, nel campo Commessa.')}
    ${elenco('📨 Richieste di offerta', rfqs.map(d => rigaDoc(d, 'rfq')).join(''), 'Nessuna richiesta.')}
    ${elenco('🧾 Ordini a fornitore', orders.map(d => rigaDoc(d, 'order')).join(''), 'Nessun ordine.')}
    </div>`;
}

// ─── Navigazione fra le viste ───
// Aprire il piano o il documento citato dalla commessa: la catena si percorre
// nei due versi, non solo a scendere.
function apriPianoDaCommessa(planId) { currentPlanId = planId; mrpView = 'edit'; setView('mrp'); }
function apriRfqDaCommessa(id) { currentRfqId = id; rfqView = 'edit'; rfqDirty = false; rfqUnlockedId = null; setView('rfq'); }
function apriOrdineDaCommessa(id) { currentOrderId = id; orderView = 'edit'; orderDirty = false; orderUnlockedId = null; setView('orders'); }

// ─── Mutatori ───
function newJob() {
  if (!roleGuard('docs')) return;
  const j = Store.insert('jobs', { id: gid(), number: nextJobNumber(), customer: '', title: '',
    customerRef: '', status: 'aperta', date: oggiISO(), dueDate: '', notes: '', active: true });
  currentJobId = j.id; jobView = 'edit'; renderJobs();
}
function openJobEdit(id) { currentJobId = id; jobView = 'edit'; renderJobs(); }
function jobBackToList() { jobView = 'list'; currentJobId = null; renderJobs(); }
function jobSetField(id, field, value) {
  if (!roleGuard('docs')) { renderJobs(); return; }
  const j = getJob(id); if (!j) return;
  j[field] = value;
  touch(j); saveDB();
  // Lo stato e le date cambiano l'intestazione e l'avviso di ritardo: si
  // ridisegna. Gli altri campi no, per non far saltare il cursore.
  if (field === 'status' || field === 'dueDate') renderJobs();
}
function delJob(id) {
  if (!roleGuard('docs')) return;
  const j = getJob(id); if (!j) return;
  const piani = jobPlans(id);
  const { rfqs, orders } = jobDocs(id);
  // Non si cancella una commessa che regge del lavoro: si lascerebbero piani e
  // documenti che citano un numero inesistente.
  if (piani.length || rfqs.length || orders.length) {
    const usi = [];
    if (piani.length) usi.push(piani.length + (piani.length === 1 ? ' piano' : ' piani'));
    if (rfqs.length) usi.push(rfqs.length + (rfqs.length === 1 ? ' richiesta' : ' richieste'));
    if (orders.length) usi.push(orders.length + (orders.length === 1 ? ' ordine' : ' ordini'));
    showToast('Commessa collegata a ' + usi.join(', ') + ': scollegali prima, oppure chiudila.', 'error');
    return;
  }
  askConfirm(`Eliminare la commessa ${j.number}?`, () => {
    if (currentJobId === id) { currentJobId = null; jobView = 'list'; }
    removeConUndo('jobs', id, `Commessa ${j.number} eliminata`, renderJobs);
  });
}
