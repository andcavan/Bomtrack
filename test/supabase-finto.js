// Un Supabase finto, per provare l'archivio condiviso senza un progetto vero.
//
// Parla lo stesso protocollo che cloud.js usa con Supabase — gli indirizzi di
// Auth (/auth/v1/…) e le chiamate RPC di PostgREST (/rest/v1/rpc/…) — ma
// dietro c'è il Postgres dei test (test/pg.js) con il vero supabase/schema.sql:
// push_changes(), pull_changes(), le policy RLS e i trigger sono quelli che
// girano in produzione. Finte sono solo le due cose che Supabase aggiunge
// intorno: chi rilascia i token, e chi traduce una richiesta HTTP in una
// chiamata SQL fatta **come l'utente** (ruolo `authenticated`, auth.uid()).
//
// Serve anche i file dell'app, così una pagina aperta da Playwright e il
// server stanno sulla stessa origine.
//
//   const srv = await avviaSupabaseFinto({ statico: ROOT });
//   srv.crea('anna@x.it', 'segreta', 'Anna')   → id
//   srv.url, srv.chiave, srv.db (test/pg.js), srv.chiudi()

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const pg = require('./pg.js');

const TIPI = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };

function avviaSupabaseFinto(opts) {
  const o = opts || {};
  const db = o.db || pg.nuovoDatabase();
  const chiave = 'chiave-pubblica-di-prova';
  const utenti = new Map();      // email → { id, email, password }
  const token = new Map();       // access token → { id, scade }
  const rinnovi = new Map();     // refresh token → id
  const registro = [];           // le chiamate ricevute, per i test

  const perId = id => [...utenti.values()].find(u => u.id === id);
  const sessione = u => {
    const a = crypto.randomBytes(16).toString('hex'), r = crypto.randomBytes(16).toString('hex');
    const durata = o.durataToken || 3600;
    token.set(a, { id: u.id, scade: Date.now() + durata * 1000 });
    rinnovi.set(r, u.id);
    return { access_token: a, refresh_token: r, token_type: 'bearer', expires_in: durata,
      expires_at: Math.floor(Date.now() / 1000) + durata, user: { id: u.id, email: u.email } };
  };
  const letterale = v => {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);   // come PostgREST: un intero resta un intero
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    let tag = 'q';
    while (s.includes('$' + tag + '$')) tag += 'q';
    return typeof v === 'string' ? `$${tag}$${s}$${tag}$` : `$${tag}$${s}$${tag}$::jsonb`;
  };

  const rispondi = (res, stato, corpo) => {
    res.writeHead(stato, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(corpo === undefined ? '' : JSON.stringify(corpo));
  };
  const leggiCorpo = req => new Promise(ok => {
    const pezzi = [];
    req.on('data', c => pezzi.push(c));
    req.on('end', () => { const t = Buffer.concat(pezzi).toString('utf8'); try { ok(t ? JSON.parse(t) : {}); } catch (e) { ok({}); } });
  });
  const chi = req => {
    const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
    const t = m && token.get(m[1]);
    if (!t) return null;
    if (t.scade < Date.now()) return 'scaduto';
    return t.id;
  };

  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x');
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' });
      return res.end();
    }
    if (srv.spento) { req.socket.destroy(); return; }
    const api = u.pathname.startsWith('/auth/v1/') || u.pathname.startsWith('/rest/v1/');
    if (api && req.headers.apikey !== chiave) return rispondi(res, 401, { message: 'Invalid API key' });
    const corpo = api && req.method !== 'GET' ? await leggiCorpo(req) : {};
    if (api) registro.push({ metodo: req.method, percorso: u.pathname, corpo });

    // ── Auth ──
    if (u.pathname === '/auth/v1/token' && req.method === 'POST') {
      if (u.searchParams.get('grant_type') === 'password') {
        const x = utenti.get(String(corpo.email || '').toLowerCase());
        if (!x || x.password !== corpo.password) return rispondi(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials' });
        return rispondi(res, 200, sessione(x));
      }
      if (u.searchParams.get('grant_type') === 'refresh_token') {
        const id = rinnovi.get(corpo.refresh_token);
        if (!id) return rispondi(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token: Refresh Token Not Found' });
        rinnovi.delete(corpo.refresh_token);
        return rispondi(res, 200, sessione(perId(id)));
      }
    }
    if (u.pathname === '/auth/v1/user') {
      const id = chi(req);
      if (!id || id === 'scaduto') return rispondi(res, 401, { message: 'invalid JWT' });
      const x = perId(id);
      if (req.method === 'PUT' && corpo.password) x.password = corpo.password;
      return rispondi(res, 200, { id: x.id, email: x.email });
    }
    if (u.pathname === '/auth/v1/logout') return rispondi(res, 204);
    if (u.pathname === '/auth/v1/settings') return rispondi(res, 200, { external: { email: true } });
    if (u.pathname === '/auth/v1/recover') return rispondi(res, 200, {});

    // ── RPC ──
    const rpc = /^\/rest\/v1\/rpc\/([a-z_]+)$/.exec(u.pathname);
    if (rpc && req.method === 'POST') {
      const id = chi(req);
      if (id === 'scaduto') return rispondi(res, 401, { code: 'PGRST301', message: 'JWT expired' });
      if (!id) return rispondi(res, 401, { code: 'PGRST301', message: 'No suitable key or wrong key type' });
      const argomenti = Object.keys(corpo).map(k => `${k} => ${letterale(corpo[k])}`).join(', ');
      try {
        const out = db.come(id).sql(`select public.${rpc[1]}(${argomenti});`);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        return res.end(out || 'null');
      } catch (e) {
        const msg = String(e.message || '');
        const testo = (/ERROR:\s+(.*)/.exec(msg) || [])[1] || msg;
        // Come PostgREST quando la funzione non esiste (schema vecchio).
        if (/function .* does not exist/.test(msg)) return rispondi(res, 404, { code: 'PGRST202', message: `Could not find the function public.${rpc[1]} in the schema cache`, details: null, hint: null });
        const permesso = /non scrive|permission denied|row-level security/.test(msg);
        // Come PostgREST: il codice SQLSTATE e il DETAIL di Postgres.
        const dettagli = (/DETAIL:\s+(.*)/.exec(msg) || [])[1] || null;
        const codice = permesso ? '42501' : /violates foreign key constraint/.test(msg) ? '23503' : /violates unique constraint/.test(msg) ? '23505' : 'P0001';
        return rispondi(res, permesso ? 403 : 400, { code: codice, message: testo, details: dettagli, hint: null });
      }
    }
    if (api) return rispondi(res, 404, { message: 'non previsto dal finto: ' + u.pathname });

    // ── File dell'app ──
    if (!o.statico) return rispondi(res, 404, {});
    const file = path.join(o.statico, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    if (!file.startsWith(o.statico) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });

  const srv = {
    db, chiave, registro, spento: false,
    crea(email, password, nome) {
      const id = crypto.randomUUID();
      db.invita(id, email, nome);
      utenti.set(email.toLowerCase(), { id, email, password });
      return id;
    },
    // Fa scadere subito tutti i token in circolazione: il client deve rinnovarli.
    scadiTutto() { token.forEach(t => { t.scade = 0; }); },
    chiudi() { return new Promise(ok => { server.close(() => { if (!o.db) db.chiudi(); ok(); }); if (server.closeAllConnections) server.closeAllConnections(); }); },
  };
  return new Promise(ok => server.listen(0, '127.0.0.1', () => {
    srv.url = 'http://127.0.0.1:' + server.address().port;
    ok(srv);
  }));
}

module.exports = { avviaSupabaseFinto };
