// ═══════════════════════════════════════════════════════════
//  BOMTRACK — views-manage.js
// ═══════════════════════════════════════════════════════════
// Vista Gestione: utenti, dati azienda, fornitori, famiglie, centri di lavoro,
// concetti, unità di misura e impostazioni.
// Classic script, scope globale condiviso con gli altri: nessun modulo e
// nessun build, così index.html continua ad aprirsi con un doppio click.

// ═══════════════════════════════════════════════════════════
//  VISTA: GESTIONE
// ═══════════════════════════════════════════════════════════
const MGMT_TABS = [
  { id: 'users', label: '👥 Utenti' },
  { id: 'company', label: '🏢 Dati azienda' },
  { id: 'suppliers', label: '🏭 Fornitori' },
  { id: 'terms', label: '🚚 Condizioni offerta' },
  { id: 'fam-acquistato', label: '🛒 Famiglie commerciali' },
  { id: 'fam-materiale', label: '🧱 Famiglie materie prime' },
  { id: 'fam-parte', label: '⚙️ Famiglie parti' },
  { id: 'concepts', label: '🏷 Concetti' },
  { id: 'workcenters', label: '🔧 Centri di lavoro' },
  { id: 'uoms', label: '📏 Unità di misura' },
  { id: 'settings', label: '📐 Impostazioni' },
  { id: 'import', label: '⬆ Import' },
  { id: 'backup', label: '💾 Backup' },
];
function renderManage() {
  document.getElementById('mgmt-tabs').innerHTML = MGMT_TABS.map(t =>
    `<button class="mgmt-tab ${mgmtTab === t.id ? 'active' : ''}" onclick="setMgmtTab('${t.id}')">${t.label}</button>`).join('');
  const c = document.getElementById('mgmt-content');
  if (mgmtTab === 'users') c.innerHTML = renderUsers();
  else if (mgmtTab === 'company') c.innerHTML = renderCompany();
  else if (mgmtTab === 'terms') c.innerHTML = renderTerms();
  else if (mgmtTab === 'suppliers') c.innerHTML = renderSuppliers();
  else if (mgmtTab === 'fam-acquistato') c.innerHTML = renderFamilies('acquistato');
  else if (mgmtTab === 'fam-materiale') c.innerHTML = renderFamilies('materiale');
  else if (mgmtTab === 'fam-parte') c.innerHTML = renderFamilies('parte');
  else if (mgmtTab === 'workcenters') c.innerHTML = renderWorkCenters();
  else if (mgmtTab === 'concepts') c.innerHTML = renderConcepts();
  else if (mgmtTab === 'uoms') c.innerHTML = renderUoms();
  else if (mgmtTab === 'settings') c.innerHTML = renderSettings();
  else if (mgmtTab === 'import') c.innerHTML = renderImport();
  else if (mgmtTab === 'backup') c.innerHTML = renderBackup();
}
function setMgmtTab(t) { mgmtTab = t; renderManage(); }

// ─── Utenti (solo amministratori) ───
// Le invarianti (ultimo admin, azioni su se stessi) vivono nei mutatori, non
// nella UI: in cloud diventeranno vincoli e policy lato Supabase.
function roleOptions(sel) {
  return Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('');
}
function renderUsers() {
  const list = userList().map(u => {
    const me = currentUser && u.id === currentUser.id;
    const susp = u.active === false;
    return `<div class="mgmt-item" style="border-left:3px solid ${safeColor(u.color)}">
      <span class="mgmt-item-name">${esc(u.name)}${me ? ' <span class="mgmt-item-meta">(tu)</span>' : ''}</span>
      <span class="mgmt-item-meta">${esc(u.email || '—')}${u.username ? ' · @' + esc(u.username) : ''}</span>
      <span class="doc-badge">${esc(roleLabel(u.role))}</span>
      <span class="doc-badge ${susp ? 'st-sospeso' : 'st-attivo'}">${susp ? 'Sospeso' : 'Attivo'}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="editUserModal('${u.id}')" title="Modifica">✏</button>
        <button class="mini-btn" onclick="resetUserPasswordModal('${u.id}')" title="Imposta password">🔑</button>
        <button class="mini-btn" onclick="toggleUserActive('${u.id}')" title="${susp ? 'Riattiva' : 'Sospendi'}">${susp ? '✓' : '⏸'}</button>
        <button class="mini-btn danger" onclick="delUser('${u.id}')" title="Elimina">🗑</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessun utente.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="nu-name" placeholder="Nome e cognome">
      <input id="nu-email" placeholder="Email">
      <input id="nu-username" placeholder="Username (opzionale)">
      <select id="nu-role">${roleOptions('progettazione')}</select>
      <input type="color" id="nu-color" value="#3A7BE8" title="Colore" style="padding:2px;width:44px">
      <input type="password" id="nu-password" placeholder="Password iniziale">
      <button class="add-btn-sm" onclick="addUser()">+ Aggiungi</button></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">
      <strong>Amministratore</strong>: tutto, compresi utenti, impostazioni e backup ·
      <strong>Ufficio acquisti</strong>: richieste e ordini ·
      <strong>Progettazione</strong>: articoli e distinte ·
      <strong>Lettore</strong>: sola lettura.<br>
      ⚠ Con i dati nel browser questi ruoli separano le responsabilità, non proteggono i dati: la protezione vera arriverà con l'accesso Supabase.</p></div>`;
}
function addUser() {
  if (!roleGuard('manage')) return;
  const name = val('nu-name'), email = val('nu-email');
  const pwd = document.getElementById('nu-password').value;
  if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (!email) { showToast('Email richiesta', 'error'); return; }
  if (findUserByEmail(email)) { showToast('Email già usata da un altro utente', 'error'); return; }
  if (pwd.length < 4) { showToast('La password deve avere almeno 4 caratteri', 'error'); return; }
  const u = { id: gid(), name, username: val('nu-username'), email, role: val('nu-role') || 'lettore',
    color: safeColor(val('nu-color')), active: true };
  setUserPassword(u, pwd);
  Store.insert('users', u);
  renderManage(); showToast('Utente creato');
}
function editUserModal(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  openModal(`<h3>✏ Modifica utente</h3>
    <div class="modal-field"><label>Nome e cognome</label><input id="eu-name" value="${esc(u.name)}"></div>
    <div class="modal-grid">
      <div class="modal-field"><label>Email</label><input id="eu-email" value="${esc(u.email || '')}"></div>
      <div class="modal-field"><label>Username</label><input id="eu-username" value="${esc(u.username || '')}"></div>
      <div class="modal-field"><label>Ruolo</label><select id="eu-role">${roleOptions(u.role)}</select></div>
      <div class="modal-field"><label>Colore</label><input type="color" id="eu-color" value="${safeColor(u.color)}"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveUserEdit('${id}')">Salva</button></div>`);
}
function saveUserEdit(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  const name = val('eu-name'), email = val('eu-email'), role = val('eu-role');
  if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (!email) { showToast('Email richiesta', 'error'); return; }
  const dup = findUserByEmail(email);
  if (dup && dup.id !== id) { showToast('Email già usata da un altro utente', 'error'); return; }
  // Restare senza amministratori attivi chiuderebbe fuori tutti dalla Gestione
  if (u.role === 'admin' && role !== 'admin' && !activeAdmins(id).length) {
    showToast('Deve restare almeno un amministratore attivo', 'error'); return;
  }
  Object.assign(u, { name, email, username: val('eu-username'), role, color: safeColor(val('eu-color')) });
  touch(u); saveDB(); closeModal();
  if (currentUser && currentUser.id === id) { currentUser = u; renderUserPill(); renderNav(); }
  renderManage(); showToast('Utente aggiornato');
}
function resetUserPasswordModal(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  openModal(`<h3>🔑 Password di ${esc(u.name)}</h3>
    <div class="modal-field"><label>Nuova password</label><input type="password" id="ru-pwd"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveUserPassword('${id}')">Imposta</button></div>`);
}
function saveUserPassword(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  const pwd = document.getElementById('ru-pwd').value;
  if (pwd.length < 4) { showToast('La password deve avere almeno 4 caratteri', 'error'); return; }
  setUserPassword(u, pwd);
  touch(u); saveDB(); closeModal(); showToast('Password impostata');
}
function toggleUserActive(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  if (currentUser && id === currentUser.id) { showToast('Non puoi sospendere te stesso', 'error'); return; }
  if (u.active !== false && u.role === 'admin' && !activeAdmins(id).length) {
    showToast('Deve restare almeno un amministratore attivo', 'error'); return;
  }
  u.active = u.active === false;
  touch(u); saveDB(); renderManage();
  showToast(u.active ? u.name + ' riattivato' : u.name + ' sospeso');
}
function delUser(id) {
  if (!roleGuard('manage')) return;
  const u = getUser(id); if (!u) return;
  if (currentUser && id === currentUser.id) { showToast('Non puoi eliminare te stesso', 'error'); return; }
  if (u.role === 'admin' && !activeAdmins(id).length) { showToast('Deve restare almeno un amministratore attivo', 'error'); return; }
  askConfirm(`Eliminare l'utente "${u.name}"? I record che ha creato restano, con il riferimento all'autore.`, () => {
    removeConUndo('users', id, `Utente "${u.name}" eliminato`, renderManage);
  });
}

function renderTerms() {
  const s = db.settings;
  const sect = (kind, title, def) => {
    const arr = s[kind + 'Options'] || [];
    const list = arr.map((o, i) => `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(o)}${o === def ? ' <span class="terms-default">predefinito</span>' : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="termsSetDefault('${kind}',${i})" title="Imposta/rimuovi predefinito">${o === def ? '★' : '☆'}</button>
        <button class="mini-btn danger" onclick="termsDel('${kind}',${i})">🗑</button>
      </div></div>`).join('') || '<div class="empty-text">Nessuna voce.</div>';
    return `<h3 class="settings-group-title">${title}</h3>
      <div class="mgmt-list">${list}</div>
      <div class="mgmt-form"><input id="terms-${kind}-new" placeholder="Nuova voce"><button class="add-btn-sm" onclick="termsAdd('${kind}')">+ Aggiungi</button></div>`;
  };
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Gestisci le voci selezionabili per Trasporto e Pagamento nelle richieste di offerta. La voce con ★ precompila automaticamente le nuove richieste.</p>
    ${sect('transport', '🚚 Tipi di trasporto / resa', s.transportDefault)}
    ${sect('payment', '💳 Tipi di pagamento', s.paymentDefault)}</div>`;
}
function termsAdd(kind) {
  if (!roleGuard('manage')) return;
  const v = val('terms-' + kind + '-new'); if (!v) { showToast('Valore richiesto', 'error'); return; }
  const key = kind + 'Options';
  db.settings[key] = db.settings[key] || [];
  if (db.settings[key].includes(v)) { showToast('Voce già presente', 'error'); return; }
  db.settings[key].push(v);
  saveDB(); renderManage(); showToast('Aggiunto');
}
function termsDel(kind, i) {
  if (!roleGuard('manage')) return;
  const key = kind + 'Options', arr = db.settings[key] || [];
  const v = arr[i]; if (v == null) return;
  db.settings[key] = arr.filter((_, idx) => idx !== i);
  if (db.settings[kind + 'Default'] === v) db.settings[kind + 'Default'] = '';
  saveDB(); renderManage(); showToast('Eliminato');
}
function termsSetDefault(kind, i) {
  if (!roleGuard('manage')) return;
  const arr = db.settings[kind + 'Options'] || [];
  const v = arr[i]; if (v == null) return;
  db.settings[kind + 'Default'] = (db.settings[kind + 'Default'] === v) ? '' : v;
  saveDB(); renderManage();
}

function renderCompany() {
  const co = db.settings.company || {};
  return `<div class="mgmt-panel">
    <h3 class="settings-group-title">🏢 Dati azienda (richiedente)</h3>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Questi dati identificano la tua azienda e vengono stampati come intestazione del richiedente sui documenti di richiesta di offerta.</p>
    <div class="modal-grid">
      <div class="modal-field"><label>Ragione sociale</label><input id="co-name" value="${esc(co.name || '')}"></div>
      <div class="modal-field"><label>Referente</label><input id="co-ref" value="${esc(co.referente || '')}"></div>
      <div class="modal-field"><label>Email</label><input id="co-email" value="${esc(co.email || '')}"></div>
      <div class="modal-field"><label>Telefono</label><input id="co-phone" value="${esc(co.phone || '')}"></div>
      <div class="modal-field"><label>P.IVA / C.F.</label><input id="co-vat" value="${esc(co.vat || '')}"></div>
      ${addressFieldsHtml('co', co)}
    </div>
    <button class="add-btn-sm" onclick="saveCompany()">Salva dati azienda</button></div>`;
}
function saveCompany() {
  if (!roleGuard('manage')) return;
  db.settings.company = Object.assign({
    name: val('co-name'), referente: val('co-ref'), email: val('co-email'),
    phone: val('co-phone'), vat: val('co-vat'),
  }, readAddressFields('co'));
  saveDB(); renderManage(); showToast('Dati azienda salvati');
}

function renderSuppliers() {
  const list = db.suppliers.map(s => {
    const loc = [s.city, s.province ? '(' + s.province + ')' : ''].filter(Boolean).join(' ');
    return `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(s.name)}</span>
    <span class="mgmt-item-meta">${esc(s.referente || '')} ${s.email ? '· ' + esc(s.email) : ''} ${s.phone ? '· ' + esc(s.phone) : ''} ${loc ? '· ' + esc(loc) : ''}</span>
    <div class="mgmt-item-actions">
      <button class="mini-btn" onclick="editSupplierModal('${s.id}')">✏</button>
      <button class="mini-btn danger" onclick="delSupplier('${s.id}')">🗑</button></div></div>`;
  }).join('') || '<div class="empty-text">Nessun fornitore.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="sup-name" placeholder="Nome fornitore">
      <input id="sup-ref" placeholder="Referente">
      <input id="sup-email" placeholder="Email">
      <input id="sup-phone" placeholder="Telefono">
      <button class="add-btn-sm" onclick="addSupplier()">+ Aggiungi</button></div>
    <p class="empty-text" style="text-align:left;padding:6px 0 0">Indirizzo completo e P.IVA si inseriscono con ✏ Modifica.</p></div>`;
}
function addSupplier() {
  if (!roleGuard('manage')) return;
  const n = val('sup-name'); if (!n) { showToast('Nome richiesto', 'error'); return; }
  Store.insert('suppliers', { id: gid(), name: n, referente: val('sup-ref'), email: val('sup-email'),
    phone: val('sup-phone'), vat: '', street: '', streetNumber: '', zip: '', city: '', province: '', country: '',
    defaultTransport: '', defaultPayment: '', active: true });
  renderManage(); showToast('Fornitore aggiunto');
}
function addressFieldsHtml(pfx, o) {
  o = o || {};
  return `<div class="modal-field" style="grid-column:1/-1"><label>Via / indirizzo</label><input id="${pfx}-street" value="${esc(o.street || '')}"></div>
    <div class="modal-field"><label>Numero civico</label><input id="${pfx}-num" value="${esc(o.streetNumber || '')}"></div>
    <div class="modal-field"><label>CAP</label><input id="${pfx}-zip" value="${esc(o.zip || '')}"></div>
    <div class="modal-field"><label>Città</label><input id="${pfx}-city" value="${esc(o.city || '')}"></div>
    <div class="modal-field"><label>Provincia</label><input id="${pfx}-prov" value="${esc(o.province || '')}" maxlength="4" placeholder="es. MO"></div>
    <div class="modal-field"><label>Stato</label><input id="${pfx}-country" value="${esc(o.country || '')}" placeholder="es. Italia"></div>`;
}
function readAddressFields(pfx) {
  return { street: val(pfx + '-street'), streetNumber: val(pfx + '-num'), zip: val(pfx + '-zip'),
    city: val(pfx + '-city'), province: val(pfx + '-prov').toUpperCase(), country: val(pfx + '-country') };
}
function editSupplierModal(id) {
  const s = db.suppliers.find(x => x.id === id); if (!s) return;
  openModal(`<h3>✏ Modifica fornitore</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome</label><input id="es-name" value="${esc(s.name)}"></div>
      <div class="modal-field"><label>Referente</label><input id="es-ref" value="${esc(s.referente || '')}"></div>
      <div class="modal-field"><label>Email</label><input id="es-email" value="${esc(s.email || '')}"></div>
      <div class="modal-field"><label>Telefono</label><input id="es-phone" value="${esc(s.phone || '')}"></div>
      <div class="modal-field"><label>P.IVA / C.F.</label><input id="es-vat" value="${esc(s.vat || '')}"></div>
      <div class="modal-field"><label>Pagamento predefinito</label>
        <input id="es-dpayment" list="sup-payment-opts" value="${esc(s.defaultPayment || '')}" placeholder="es. Bonifico 30gg">
        <datalist id="sup-payment-opts">${(db.settings.paymentOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      <div class="modal-field"><label>Trasporto predefinito</label>
        <input id="es-dtransport" list="sup-transport-opts" value="${esc(s.defaultTransport || '')}" placeholder="es. Porto franco">
        <datalist id="sup-transport-opts">${(db.settings.transportOptions || []).map(o => `<option value="${esc(o)}"></option>`).join('')}</datalist></div>
      ${addressFieldsHtml('es', s)}
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveSupplier('${id}')">Salva</button></div>`, true);
}
function saveSupplier(id) {
  if (!roleGuard('manage')) return;
  const s = db.suppliers.find(x => x.id === id); if (!s) return;
  s.name = val('es-name'); s.referente = val('es-ref'); s.email = val('es-email');
  s.phone = val('es-phone'); s.vat = val('es-vat');
  s.defaultPayment = val('es-dpayment'); s.defaultTransport = val('es-dtransport');
  Object.assign(s, readAddressFields('es'));
  touch(s);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornato');
}
// Dove compare un fornitore: articoli, quotazioni a listino, documenti e
// lavorazioni esterne di ciclo. Controllare i soli articoli lasciava riferimenti
// orfani — uno storico prezzi che punta a un fornitore che non esiste più.
function supplierUses(id) {
  const usi = [];
  const n = (a) => a.length;
  const articoli = (db.items || []).filter(i => i.supplierId === id);
  if (n(articoli)) usi.push(articoli.length + (articoli.length === 1 ? ' articolo' : ' articoli'));
  const quotati = (db.items || []).filter(i => (i.priceList || []).some(r => r.supplierId === id));
  if (n(quotati)) usi.push(quotati.length + (quotati.length === 1 ? ' listino' : ' listini'));
  const cicli = (db.items || []).filter(i => (i.cycle || []).some(r => r.kind === 'op' && r.supplierId === id));
  if (n(cicli)) usi.push(cicli.length + (cicli.length === 1 ? ' ciclo' : ' cicli'));
  const rfqs = (db.rfqs || []).filter(r => r.supplierId === id);
  if (n(rfqs)) usi.push(rfqs.length + (rfqs.length === 1 ? ' richiesta' : ' richieste'));
  const ordini = (db.orders || []).filter(o => o.supplierId === id);
  if (n(ordini)) usi.push(ordini.length + (ordini.length === 1 ? ' ordine' : ' ordini'));
  return usi;
}
function delSupplier(id) {
  if (!roleGuard('manage')) return;
  const usi = supplierUses(id);
  if (usi.length) { showToast('Fornitore usato in: ' + usi.join(', '), 'error'); return; }
  askConfirm('Eliminare il fornitore?', () => {
    removeConUndo('suppliers', id, 'Fornitore eliminato', renderManage);
  });
}

// ─── Famiglie / sottofamiglie ───
function familyPanelHtml(f) {
  const subs = (f.subs || []).map(s => `<div class="mgmt-item" style="padding:6px 12px">
      <span class="mgmt-item-name" style="font-size:13px;font-weight:500">${esc(s.name)} <span style="font-family:var(--mono);color:var(--text-dim);font-size:11px">[${esc(s.sigla || siglaFromName(s.name))}]</span></span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="editSubFamilyModal('${f.id}','${s.id}')">✏</button>
        <button class="mini-btn danger" onclick="delSubFamily('${f.id}','${s.id}')">🗑</button></div></div>`).join('')
    || '<div class="empty-text" style="padding:6px 0">Nessuna sottofamiglia.</div>';
  return `<div class="mgmt-panel" style="margin-bottom:12px">
      <div class="mgmt-item" style="background:transparent;border:none;padding:0 0 10px">
        <span class="mgmt-item-name" style="font-size:15px;color:var(--accent)">🗂 ${esc(f.name)} <span style="font-family:var(--mono);color:var(--text-dim);font-size:12px">[${esc(f.sigla || siglaFromName(f.name))}]</span></span>
        <div class="mgmt-item-actions">
          <button class="mini-btn" onclick="editFamilyModal('${f.id}')">✏</button>
          <button class="mini-btn danger" onclick="delFamily('${f.id}')">🗑</button></div></div>
      <div class="mgmt-list" style="margin-bottom:10px">${subs}</div>
      <div class="mgmt-form">
        <input id="sub-name-${f.id}" placeholder="Nuova sottofamiglia">
        <input id="sub-sigla-${f.id}" placeholder="Sigla" maxlength="6" style="max-width:90px">
        <button class="add-btn-sm" onclick="addSubFamily('${f.id}')">+ Sottofamiglia</button></div>
    </div>`;
}
function renderFamilies(kind) {
  kind = kind || 'acquistato';
  const hint = kind === 'materiale' ? 'Nuova macrofamiglia (es. Acciaio)'
    : kind === 'parte' ? 'Nuova macrofamiglia (es. Lavorazioni meccaniche)'
    : 'Nuova macrofamiglia (es. Idraulico)';
  const blocks = (db.families || []).filter(f => (f.kind || 'acquistato') === kind).map(familyPanelHtml).join('')
    || '<div class="empty-text">Nessuna macrofamiglia.</div>';
  return `<div>${blocks}
    <div class="mgmt-panel"><div class="mgmt-form">
      <input id="fam-name-${kind}" placeholder="${hint}">
      <input id="fam-sigla-${kind}" placeholder="Sigla" maxlength="6" style="max-width:90px">
      <button class="add-btn-sm" onclick="addFamily('${kind}')">+ Aggiungi macrofamiglia</button></div></div></div>`;
}
function addFamily(kind) {
  if (!roleGuard('manage')) return;
  kind = kind || 'acquistato';
  const n = val('fam-name-' + kind); if (!n) { showToast('Nome richiesto', 'error'); return; }
  const sg = val('fam-sigla-' + kind);
  Store.insert('families', { id: gid(), name: n, kind, sigla: sg ? sg.toUpperCase() : siglaFromName(n), subs: [] });
  renderManage(); showToast('Macrofamiglia aggiunta');
}
function editFamilyModal(id) {
  const f = getFamily(id); if (!f) return;
  openModal(`<h3>✏ Modifica macrofamiglia</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome</label><input id="ef-name" value="${esc(f.name)}"></div>
      <div class="modal-field"><label>Sigla (per codifica)</label><input id="ef-sigla" value="${esc(f.sigla || siglaFromName(f.name))}" maxlength="6"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveFamily('${id}')">Salva</button></div>`);
}
function saveFamily(id) {
  if (!roleGuard('manage')) return;
  const f = getFamily(id); if (!f) return;
  f.name = val('ef-name') || f.name;
  const sg = val('ef-sigla'); f.sigla = sg ? sg.toUpperCase() : siglaFromName(f.name);
  touch(f);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornata');
}
function delFamily(id) {
  if (!roleGuard('manage')) return;
  const used = db.items.filter(i => i.familyId === id);
  if (used.length) { showToast('Famiglia usata da ' + used.length + ' articoli', 'error'); return; }
  askConfirm('Eliminare la macrofamiglia e le sue sottofamiglie?', () => {
    removeConUndo('families', id, 'Macrofamiglia eliminata', renderManage);
  });
}
function addSubFamily(familyId) {
  if (!roleGuard('manage')) return;
  const f = getFamily(familyId); if (!f) return;
  const n = val('sub-name-' + familyId); if (!n) { showToast('Nome richiesto', 'error'); return; }
  if (!f.subs) f.subs = [];
  const sg = val('sub-sigla-' + familyId);
  f.subs.push(stampNew({ id: gid(), name: n, sigla: sg ? sg.toUpperCase() : siglaFromName(n) }));
  touch(f);
  saveDB(); renderManage(); showToast('Sottofamiglia aggiunta');
}
function editSubFamilyModal(familyId, subId) {
  const f = getFamily(familyId); const s = f && (f.subs || []).find(x => x.id === subId); if (!s) return;
  openModal(`<h3>✏ Modifica sottofamiglia</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Nome (in ${esc(f.name)})</label><input id="esf-name" value="${esc(s.name)}"></div>
      <div class="modal-field"><label>Sigla (per codifica)</label><input id="esf-sigla" value="${esc(s.sigla || siglaFromName(s.name))}" maxlength="6"></div>
    </div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveSubFamily('${familyId}','${subId}')">Salva</button></div>`);
}
function saveSubFamily(familyId, subId) {
  if (!roleGuard('manage')) return;
  const f = getFamily(familyId); const s = f && (f.subs || []).find(x => x.id === subId); if (!s) return;
  s.name = val('esf-name') || s.name;
  const sg = val('esf-sigla'); s.sigla = sg ? sg.toUpperCase() : siglaFromName(s.name);
  touch(s);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornata');
}
function delSubFamily(familyId, subId) {
  if (!roleGuard('manage')) return;
  const used = db.items.filter(i => i.subFamilyId === subId);
  if (used.length) { showToast('Sottofamiglia usata da ' + used.length + ' articoli', 'error'); return; }
  askConfirm('Eliminare la sottofamiglia?', () => {
    const f = getFamily(familyId); if (!f) return;
    f.subs = (f.subs || []).filter(x => x.id !== subId);
    saveDB(); renderManage(); showToast('Eliminata');
  });
}

function renderWorkCenters() {
  const list = db.workCenters.map(w => `<div class="mgmt-item">
    <span class="mgmt-item-name">${esc(w.name)}</span>
    <span class="mgmt-item-meta">${fmtN(w.hourlyRate)}/h</span>
    <div class="mgmt-item-actions">
      <button class="mini-btn" onclick="editWcModal('${w.id}')">✏</button>
      <button class="mini-btn danger" onclick="delWc('${w.id}')">🗑</button></div></div>`).join('') || '<div class="empty-text">Nessun centro di lavoro.</div>';
  return `<div class="mgmt-panel"><div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="wc-name" placeholder="Nome (es. Tornitura)">
      <input id="wc-rate" type="number" min="0" step="0.5" placeholder="Tariffa ${esc(cur())}/h" title="Tariffa oraria del centro di lavoro, in ${esc(cur())} per ora">
      <button class="add-btn-sm" onclick="addWc()">+ Aggiungi</button></div></div>`;
}
function addWc() {
  if (!roleGuard('manage')) return;
  const n = val('wc-name'); if (!n) { showToast('Nome richiesto', 'error'); return; }
  if (isNeg('wc-rate')) { showToast('La tariffa non può essere negativa', 'error'); return; }
  Store.insert('workCenters', { id: gid(), name: n, hourlyRate: numVal('wc-rate', 0), active: true });
  renderManage(); showToast('Centro di lavoro aggiunto');
}
function editWcModal(id) {
  const w = db.workCenters.find(x => x.id === id); if (!w) return;
  openModal(`<h3>✏ Modifica centro di lavoro</h3>
    <div class="modal-field"><label>Nome</label><input id="ew-name" value="${esc(w.name)}"></div>
    <div class="modal-field"><label>Tariffa (${cur()}/h)</label><input id="ew-rate" type="number" min="0" step="0.5" value="${w.hourlyRate}"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveWc('${id}')">Salva</button></div>`);
}
function saveWc(id) {
  if (!roleGuard('manage')) return;
  const w = db.workCenters.find(x => x.id === id); if (!w) return;
  if (isNeg('ew-rate')) { showToast('La tariffa non può essere negativa', 'error'); return; }
  w.name = val('ew-name'); w.hourlyRate = numVal('ew-rate', 0);
  touch(w);
  saveDB(); closeModal(); renderManage(); showToast('Aggiornato');
}
function delWc(id) {
  if (!roleGuard('manage')) return;
  const used = db.items.filter(i => (i.operations || []).some(o => o.workCenterId === id));
  if (used.length) { showToast('Usato in ' + used.length + ' distinte', 'error'); return; }
  askConfirm('Eliminare il centro di lavoro?', () => {
    removeConUndo('workCenters', id, 'Centro di lavoro eliminato', renderManage);
  });
}

// ─── Unità di misura ───
// Quante volte un codice U.M. è usato in anagrafica articoli e nei documenti.
// ─── Concetti (parte "standardizzata" del nome delle Parti) ───
function conceptUsage(id) {
  return (db.items || []).filter(i => i.type === 'parte' && i.conceptId === id).length;
}
function renderConcepts() {
  const list = conceptList().map((c, i) => {
    const used = conceptUsage(c.id);
    return `<div class="mgmt-item">
      <span class="mgmt-item-name">${esc(c.name)}</span>
      <span class="mgmt-item-meta">${used ? 'usato ' + used + '×' : 'non usato'}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="editConceptModal(${i})">✏</button>
        <button class="mini-btn danger" onclick="delConcept(${i})">🗑</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessun concetto.</div>';
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Elenco dei <strong>concetti</strong> (sempre in <strong>MAIUSCOLO</strong>): la parte predeterminata del nome di una <strong>Parte</strong> (l'oggetto), completata da una descrizione libera — es. concetto <em>ALBERO</em> + <em>motore 20×100</em> → <em>ALBERO motore 20×100</em>. Un concetto in uso non può essere rinominato né eliminato.</p>
    <div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="concept-name" placeholder="Concetto (es. ALBERO)" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()">
      <button class="add-btn-sm" onclick="addConcept()">+ Aggiungi</button></div></div>`;
}
function addConcept() {
  if (!roleGuard('manage')) return;
  const name = val('concept-name').trim().toUpperCase(); if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (conceptList().some(c => c.name === name)) { showToast('Concetto già presente', 'error'); return; }
  db.settings.concepts.push({ id: gid(), name });
  saveDB(); renderManage(); showToast('Concetto aggiunto');
}
function editConceptModal(i) {
  if (!roleGuard('manage')) return;
  const c = conceptList()[i]; if (!c) return;
  openModal(`<h3>✏ Modifica concetto</h3>
    <div class="modal-field"><label>Concetto</label><input id="ec-name" value="${esc(c.name)}" style="text-transform:uppercase" oninput="this.value=this.value.toUpperCase()"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveConcept(${i})">Salva</button></div>`);
}
function saveConcept(i) {
  if (!roleGuard('manage')) return;
  const c = conceptList()[i]; if (!c) return;
  const name = val('ec-name').trim().toUpperCase(); if (!name) { showToast('Nome richiesto', 'error'); return; }
  if (name !== c.name) {
    // Un concetto in uso è congelato: i nomi delle parti già composte non devono cambiare da soli
    if (conceptUsage(c.id)) { showToast('Concetto in uso: rinomina non consentita', 'error'); return; }
    if (conceptList().some((x, j) => j !== i && x.name === name)) { showToast('Concetto già presente', 'error'); return; }
  }
  c.name = name;
  saveDB(); closeModal(); renderManage(); showToast('Aggiornato');
}
function delConcept(i) {
  if (!roleGuard('manage')) return;
  const c = conceptList()[i]; if (!c) return;
  const used = conceptUsage(c.id);
  if (used) { showToast(`Usato in ${used} parti`, 'error'); return; }
  askConfirm(`Eliminare il concetto "${c.name}"?`, () => {
    db.settings.concepts = conceptList().filter((_, j) => j !== i);
    saveDB(); renderManage(); showToast('Eliminato');
  });
}

function uomUsage(code) {
  let n = 0;
  (db.items || []).forEach(i => { if (i.uom === code) n++; });
  (db.rfqs || []).forEach(r => (r.lines || []).forEach(l => { if (l.uom === code) n++; }));
  (db.orders || []).forEach(o => (o.lines || []).forEach(l => { if (l.uom === code) n++; }));
  return n;
}
function renderUoms() {
  const def = defaultUom();
  const list = uomList().map((u, i) => {
    const used = uomUsage(u.code);
    return `<div class="mgmt-item">
      <span class="mgmt-item-name" style="font-family:var(--mono)">${esc(u.code)}${u.code === def ? ' <span class="terms-default">predefinita</span>' : ''}</span>
      <span class="mgmt-item-meta">${esc(u.name || '—')}${used ? ' · usata ' + used + '×' : ''}</span>
      <div class="mgmt-item-actions">
        <button class="mini-btn" onclick="uomSetDefault(${i})" title="Imposta come predefinita">${u.code === def ? '★' : '☆'}</button>
        <button class="mini-btn" onclick="editUomModal(${i})">✏</button>
        <button class="mini-btn danger" onclick="delUom(${i})">🗑</button>
      </div></div>`;
  }).join('') || '<div class="empty-text">Nessuna unità di misura.</div>';
  return `<div class="mgmt-panel">
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Elenco delle unità di misura selezionabili in anagrafica articoli e nelle righe di richieste di offerta e ordini. La voce con ★ è quella proposta per le nuove righe. Rinominando un codice l'aggiornamento si propaga a tutti gli articoli e documenti che lo usano.</p>
    <div class="mgmt-list">${list}</div>
    <div class="mgmt-form">
      <input id="uom-code" placeholder="Codice (es. kg)" maxlength="10">
      <input id="uom-name" placeholder="Descrizione (es. Chilogrammi)">
      <button class="add-btn-sm" onclick="addUom()">+ Aggiungi</button></div></div>`;
}
function addUom() {
  if (!roleGuard('manage')) return;
  const code = val('uom-code'); if (!code) { showToast('Codice richiesto', 'error'); return; }
  if (uomList().some(u => u.code === code)) { showToast('Unità di misura già presente', 'error'); return; }
  db.settings.uoms.push({ code, name: val('uom-name') });
  saveDB(); renderManage(); showToast('Unità di misura aggiunta');
}
function editUomModal(i) {
  const u = uomList()[i]; if (!u) return;
  openModal(`<h3>✏ Modifica unità di misura</h3>
    <div class="modal-field"><label>Codice</label><input id="eu-code" maxlength="10" value="${esc(u.code)}"></div>
    <div class="modal-field"><label>Descrizione</label><input id="eu-name" value="${esc(u.name || '')}"></div>
    <div class="modal-actions"><button class="btn-ghost" onclick="closeModal()">Annulla</button>
      <button class="add-btn-sm" onclick="saveUom(${i})">Salva</button></div>`);
}
function saveUom(i) {
  if (!roleGuard('manage')) return;
  const u = uomList()[i]; if (!u) return;
  const code = val('eu-code'); if (!code) { showToast('Codice richiesto', 'error'); return; }
  if (code !== u.code && uomList().some((x, j) => j !== i && x.code === code)) { showToast('Codice già in uso', 'error'); return; }
  if (code !== u.code) renameUom(u.code, code);
  u.code = code; u.name = val('eu-name');
  saveDB(); closeModal(); renderManage(); showToast('Aggiornato');
}
// Propaga il nuovo codice ovunque sia referenziato (l'U.M. è salvata per valore)
function renameUom(oldCode, newCode) {
  (db.items || []).forEach(it => { if (it.uom === oldCode) { it.uom = newCode; touch(it); } });
  (db.rfqs || []).forEach(r => (r.lines || []).forEach(l => { if (l.uom === oldCode) l.uom = newCode; }));
  (db.orders || []).forEach(o => (o.lines || []).forEach(l => { if (l.uom === oldCode) l.uom = newCode; }));
  if (db.settings.uomDefault === oldCode) db.settings.uomDefault = newCode;
}
function delUom(i) {
  if (!roleGuard('manage')) return;
  const u = uomList()[i]; if (!u) return;
  const used = uomUsage(u.code);
  if (used) { showToast(`Usata in ${used} tra articoli e righe documento`, 'error'); return; }
  askConfirm(`Eliminare l'unità di misura "${u.code}"?`, () => {
    db.settings.uoms = uomList().filter((_, j) => j !== i);
    if (db.settings.uomDefault === u.code) db.settings.uomDefault = '';
    saveDB(); renderManage(); showToast('Eliminata');
  });
}
function uomSetDefault(i) {
  if (!roleGuard('manage')) return;
  const u = uomList()[i]; if (!u) return;
  db.settings.uomDefault = u.code;
  saveDB(); renderManage();
}

function renderSettings() {
  const s = db.settings;
  return `<div class="mgmt-panel">
    <h3 class="settings-group-title">💶 Costi e margini</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Spese generali / overhead (%)</label><input type="number" id="set-ov" min="0" max="1000" step="0.1" value="${s.overheadPct}"></div>
      <div class="modal-field"><label>Margine / markup (%)</label><input type="number" id="set-mg" min="0" max="1000" step="0.1" value="${s.marginPct}"></div>
      <div class="modal-field"><label>Simbolo valuta</label><input id="set-cur" value="${esc(s.currency)}" maxlength="3"></div>
      <div class="modal-field"><label>Approvvigionamento parte (default)</label><select id="set-partsourcing">${partSourcingOptions(defaultPartSourcing())}</select></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Le percentuali sono i valori di default applicati a tutti i prodotti. Si possono sovrascrivere per singola macchina dalla "Modifica testata".<br>L'approvvigionamento è quello proposto alle <strong>nuove</strong> parti, e da esso dipende anche da dove viene il costo: dal ciclo se prodotta in casa, dal listino se acquistata. Su ciascuna parte resta modificabile nella sua scheda; quelle già a catalogo non si toccano.</p>

    <h3 class="settings-group-title">🏷 Codifica automatica articoli</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Cifre parte incrementale codice</label><input type="number" id="set-digits" min="1" max="10" step="1" value="${codeDigits()}"></div>
      <div class="modal-field"><label>Prefisso codice — Commerciali</label><input id="set-pfx-acq" maxlength="10" value="${esc(s.codePrefixAcquistato || 'CMM')}" placeholder="CMM"></div>
      <div class="modal-field"><label>Prefisso codice — Materie prime</label><input id="set-pfx-mat" maxlength="10" value="${esc(s.codePrefixMateriale || 'MAT')}" placeholder="MAT"></div>
      <div class="modal-field"><label>Prefisso codice — Parti</label><input id="set-pfx-prt" maxlength="10" value="${esc(s.codePrefixParte || 'PRT')}" placeholder="PRT"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Le cifre della parte incrementale determinano lo zero-padding del progressivo (es. 3 → <span style="font-family:var(--mono)">${esc(s.codePrefixMateriale || 'MAT')}-ACC-LAM-001</span>). Il prefisso codice è la sigla iniziale usata nei codici automatici per commerciali, materie prime e parti.<br>Macchine, gruppi, sottogruppi e le parti legate a una macchina usano invece la <strong>codifica gerarchica</strong> (es. <span style="font-family:var(--mono)">TRN-BAS-001</span>), il cui schema si configura sulla singola macchina.</p>

    <h3 class="settings-group-title">🔒 Accesso</h3>
    <div class="modal-grid">
      <div class="modal-field"><label>Durata della sessione salvata (giorni)</label><input type="number" id="set-session" min="0" max="365" step="1" value="${sessionMaxDays()}"></div>
    </div>
    <p class="empty-text" style="text-align:left;padding:4px 0 12px">Passati questi giorni dall'ultimo accesso, "Ricordami su questo PC" smette di valere e va reinserita la password. <strong>0 = la sessione non scade mai</strong> (com'era fino alla 0.21.0): comodo su un PC personale, meno su una postazione condivisa in officina.</p>

    <button class="add-btn-sm" onclick="saveSettings()">Salva impostazioni</button></div>`;
}
function saveSettings() {
  if (!roleGuard('manage')) return;
  // Percentuali riportate dentro 0-1000 in silenzio, come già fa codeDigits qui sotto.
  db.settings.overheadPct = numVal('set-ov', 0, 1000);
  db.settings.marginPct = numVal('set-mg', 0, 1000);
  db.settings.currency = val('set-cur') || '€';
  const pso = val('set-partsourcing');
  db.settings.partSourcingDefault = PART_SOURCING[pso] ? pso : 'buy';
  const d = parseInt(val('set-digits'), 10);
  db.settings.codeDigits = (d >= 1 && d <= 10) ? d : 3;
  db.settings.codePrefixAcquistato = (val('set-pfx-acq') || 'CMM').toUpperCase();
  db.settings.codePrefixMateriale = (val('set-pfx-mat') || 'MAT').toUpperCase();
  db.settings.codePrefixParte = (val('set-pfx-prt') || 'PRT').toUpperCase();
  db.settings.sessionDays = numVal('set-session', 0, 365);
  saveDB(); renderManage(); showToast('Impostazioni salvate');
}
