# -*- coding: utf-8 -*-
"""Genera manuale.html da MANUALE.md.

Il manuale in-app deve funzionare **offline**, come tutto il resto di Bomtrack:
niente librerie dalla rete, quindi il markdown si converte qui una volta sola e
la pagina esce gia' impaginata. Anche l'indice e le ancore sono scritti nel
file: senza JavaScript la pagina resta leggibile e navigabile, e lo script
aggiunge soltanto il filtro dei capitoli, l'evidenziazione di dove si e' e il
cassetto dell'indice sugli schermi stretti.

Uso:  python genera-manuale.py          # MANUALE.md -> manuale.html
      python genera-manuale.py <sorgente.md> <destinazione.html>
"""
import io
import re
import sys

# ─── Inline ───

def _esc(s):
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def inline(s):
    """Grassetto, corsivo, codice e link. Il codice esce di scena per primo,
    cosi' un asterisco dentro `codice` non diventa un corsivo."""
    slots = []

    def stash(m):
        slots.append('<code>' + _esc(m.group(1)) + '</code>')
        return '\x00%d\x00' % (len(slots) - 1)

    s = re.sub(r'`([^`]+)`', stash, s)
    s = _esc(s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2">\1</a>', s)
    # Non goloso, e senza vietare l'asterisco dentro: il manuale usa il corsivo
    # dentro il grassetto («**parte a *Acquisto da fornitore***»), e una classe
    # negata [^*] lo lasciava indietro come asterischi a video.
    s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'(?<![\w*])\*([^*\n]+)\*(?!\w)', r'<em>\1</em>', s)
    return re.sub(r'\x00(\d+)\x00', lambda m: slots[int(m.group(1))], s)


def slug(s):
    """Le stesse ancore di GitHub, cosi' i link interni del .md valgono anche
    qui. La freccia di «Anagrafica -> Acquisti» sparisce e i suoi due spazi
    restano: due trattini, non uno. Collassarli romperebbe meta' indice."""
    s = re.sub(r'[*`]', '', s).strip().lower()
    s = re.sub(r'[^\w\s-]', '', s, flags=re.UNICODE)
    return s.replace(' ', '-')


# ─── Blocchi ───

def cells(row):
    return [c.strip() for c in row.strip().strip('|').split('|')]


ALIGN = re.compile(r'^:?-{2,}:?$')


def table(rows):
    head = cells(rows[0])
    spec = cells(rows[1])
    al = []
    for c in spec:
        al.append(' align="center"' if c.startswith(':') and c.endswith(':')
                  else (' align="right"' if c.endswith(':') else ''))
    while len(al) < len(head):
        al.append('')
    out = ['<div class="tw"><table>', '<thead><tr>']
    for i, c in enumerate(head):
        out.append('<th%s>%s</th>' % (al[i], inline(c)))
    out.append('</tr></thead><tbody>')
    for r in rows[2:]:
        cs = cells(r)
        out.append('<tr>')
        for i, c in enumerate(cs):
            out.append('<td%s>%s</td>' % (al[i] if i < len(al) else '', inline(c)))
        out.append('</tr>')
    out.append('</tbody></table></div>')
    return ''.join(out)


def quote(lines):
    """Un avviso. Il manuale segna con ⚠ quello che costa caro: due livelli,
    quello che cancella dati senza ritorno e tutto il resto."""
    text = '\n'.join(l[1:].lstrip() if l.startswith('>') else l for l in lines)
    cls = ''
    if '⚠' in text:
        grave = re.search(r'Irreversibil|AZZERA|sovrascriv|riservat|perso i dati|backup regolari',
                          text, re.I)
        cls = ' class="crit"' if grave else ' class="warn"'
    parts = [p.strip() for p in re.split(r'\n\s*\n', text) if p.strip()]
    body = ''.join('<p>%s</p>' % inline(p.replace('\n', ' ')) for p in parts)
    return '<blockquote%s>%s</blockquote>' % (cls, body)


BULLET = re.compile(r'^(\s*)- (.*)$')
NUMBER = re.compile(r'^(\s*)(\d+)\. (.*)$')


def render(md):
    lines = md.split('\n')
    out, heads = [], []
    i, n = 0, len(lines)
    while i < n:
        line = lines[i]

        if not line.strip():
            i += 1
            continue

        # Blocco di codice / schema
        if line.startswith('```'):
            i += 1
            buf = []
            while i < n and not lines[i].startswith('```'):
                buf.append(lines[i])
                i += 1
            i += 1
            out.append('<pre><code>%s</code></pre>' % _esc('\n'.join(buf)))
            continue

        # Titolo
        m = re.match(r'^(#{1,3}) (.*)$', line)
        if m:
            lv = len(m.group(1))
            raw = m.group(2).strip()
            sid = slug(raw)
            heads.append((lv, raw, sid))
            out.append('<h%d id="%s">%s</h%d>' % (lv, sid, inline(raw), lv))
            i += 1
            continue

        # Linea di separazione
        if re.match(r'^-{3,}$', line.strip()):
            out.append('<hr>')
            i += 1
            continue

        # Avviso
        if line.startswith('>'):
            buf = []
            while i < n and (lines[i].startswith('>') or
                             (lines[i].strip() and buf and not re.match(r'^(#|-{3,}|\||```)', lines[i]))):
                buf.append(lines[i])
                i += 1
            out.append(quote(buf))
            continue

        # Tabella
        if line.lstrip().startswith('|') and i + 1 < n and \
                all(ALIGN.match(c) for c in cells(lines[i + 1]) if c):
            buf = []
            while i < n and lines[i].lstrip().startswith('|'):
                buf.append(lines[i])
                i += 1
            out.append(table(buf))
            continue

        # Elenco puntato o numerato
        mb, mn = BULLET.match(line), NUMBER.match(line)
        if mb or mn:
            tag = 'ul' if mb else 'ol'
            items = []
            while i < n:
                mb, mn = BULLET.match(lines[i]), NUMBER.match(lines[i])
                if mb:
                    items.append(mb.group(2))
                elif mn:
                    items.append(mn.group(3))
                elif lines[i].startswith('  ') and lines[i].strip() and items:
                    # Riga di continuazione: appartiene alla voce precedente.
                    items[-1] += ' ' + lines[i].strip()
                else:
                    break
                i += 1
            out.append('<%s>%s</%s>' % (
                tag, ''.join('<li>%s</li>' % inline(x) for x in items), tag))
            continue

        # Paragrafo
        buf = []
        while i < n and lines[i].strip() and \
                not re.match(r'^(#{1,3} |>|\||```|-{3,}$|\s*- |\s*\d+\. )', lines[i]):
            buf.append(lines[i].strip())
            i += 1
        if buf:
            out.append('<p>%s</p>' % inline(' '.join(buf)))
        else:
            i += 1

    return '\n'.join(out), heads


def toc(heads):
    """L'indice: le parti (h1) con sotto i loro capitoli (h2). Scritto nel file,
    non costruito a video: la pagina si naviga anche senza JavaScript."""
    out = []
    first = True
    open_list = False
    for lv, raw, sid in heads:
        if lv == 1:
            if open_list:
                out.append('</div>')
            label = re.sub(r'\s*[—-]\s*', ' · ', raw)
            out.append('<div class="toc-part%s">%s</div><div class="toc-grp">' %
                       (' first' if first else '', _esc(label)))
            first, open_list = False, True
        elif lv == 2:
            m = re.match(r'^(\d+)\.\s+(.*)$', raw)
            num = m.group(1) if m else '·'
            txt = m.group(2) if m else re.sub(r'^Appendice\s+', '', raw)
            out.append('<a href="#%s"><span class="n">%s</span><span>%s</span></a>'
                       % (sid, num, inline(txt)))
    if open_list:
        out.append('</div>')
    return '\n'.join(out)


def main(src_path, dst_path):
    md = io.open(src_path, encoding='utf-8').read()

    # La testata della pagina dice gia' titolo, versione e come leggere il
    # manuale, e la colonna di sinistra e' l'indice: la testata e l'indice del
    # file sarebbero un doppione.
    start = md.find('\n# Parte I')
    body = md[start + 1:] if start > -1 else md

    colo = ''
    cut = body.rfind('\n---\n\n*Manuale di Bomtrack')
    if cut > -1:
        colo = re.sub(r'[-*\n]+', ' ', body[cut:]).strip()
        body = body[:cut]

    version = re.search(r'documentata:\s*([\d.]+)', md)
    html, heads = render(body)

    page = (SHELL.replace('{{VERSIONE}}', version.group(1) if version else '')
                 .replace('{{INDICE}}', toc(heads))
                 .replace('{{CORPO}}', html)
                 .replace('{{CHIUSURA}}', _esc(colo)))
    io.open(dst_path, 'w', encoding='utf-8', newline='\n').write(page)
    print('%s scritto: %d capitoli, %d byte'
          % (dst_path, sum(1 for h in heads if h[0] == 2), len(page.encode('utf-8'))))



# ─── Il guscio della pagina ───
# Testata, colonna dell'indice, stili e script stanno qui dentro invece che
# in un file a parte: il manuale si rigenera con un comando solo, e non c'e'
# modo di aggiornarne meta'. I segnaposto {{...}} li riempie main().
SHELL = r"""<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Manuale d'uso — Bomtrack</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
/* ─── Temi ───
   Gli stessi tre stati dell'app e gli stessi nomi di token, cosi' il manuale
   non sembra una pagina di un altro programma. Lo scuro e' il :root di
   partenza, com'e' in style.css; il chiaro arriva dalla media query e
   dall'attributo `data-theme`, che vince sul sistema.
   Il manuale legge la chiave `bomtrack_theme` in fondo alla pagina: chi ha
   scelto il chiaro nell'app apre il manuale in chiaro. */
:root{
  color-scheme:dark;
  --bg:#0F1117;--card:#181B24;--card-hover:#1E2230;--border:#2A2E3B;
  --text:#E8E9ED;--text-dim:#8B8FA3;
  --accent:#4583E9;--accent-h:#77A6F0;
  --red:#E85D3A;--orange:#E8A33A;
  --shadow:rgba(0,0,0,.45);
  --font:'DM Sans','Segoe UI',system-ui,sans-serif;
  --mono:'JetBrains Mono','SF Mono',Consolas,monospace;
}
@media(prefers-color-scheme:light){
  :root:not([data-theme=dark]){
    color-scheme:light;
    --bg:#F5F6F8;--card:#FFFFFF;--card-hover:#EDEFF3;--border:#DCE0E8;
    --text:#171A21;--text-dim:#5D6472;
    --accent:#2563C7;--accent-h:#1B4CA0;
    --red:#C4381A;--orange:#95610D;
    --shadow:rgba(23,26,33,.16);
  }
}
:root[data-theme=light]{
  color-scheme:light;
  --bg:#F5F6F8;--card:#FFFFFF;--card-hover:#EDEFF3;--border:#DCE0E8;
  --text:#171A21;--text-dim:#5D6472;
  --accent:#2563C7;--accent-h:#1B4CA0;
  --red:#C4381A;--orange:#95610D;
  --shadow:rgba(23,26,33,.16);
}
:root{
  --accent-soft:color-mix(in srgb,var(--accent) 12%,transparent);
  --accent-line:color-mix(in srgb,var(--accent) 32%,transparent);
  --red-soft:color-mix(in srgb,var(--red) 13%,transparent);
  --orange-soft:color-mix(in srgb,var(--orange) 13%,transparent);
  --hairline:color-mix(in srgb,var(--border) 55%,transparent);
}

*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font);
  font-size:15.5px;line-height:1.68;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-underline-offset:2px}
a:hover{color:var(--accent-h)}
a:focus-visible,button:focus-visible,input:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}

/* ─── Telaio ─── */
.wrap{display:grid;grid-template-columns:292px minmax(0,1fr);min-height:100vh}
.rail{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;
  background:var(--card);border-right:1px solid var(--border)}
.main{min-width:0;padding:0 clamp(20px,5vw,68px) 120px}

.brand{padding:20px 22px 15px;border-bottom:1px solid var(--hairline);flex:none}
.brand-top{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.brand-name{font-weight:800;font-size:19px;letter-spacing:-.02em;line-height:1}
.chip{font-family:var(--mono);font-size:10px;font-weight:600;color:var(--text-dim);
  border:1px solid var(--border);border-radius:4px;padding:1.5px 5px;line-height:1.5}
.brand-sub{font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--text-dim);margin-top:7px}

.find{padding:13px 18px;flex:none}
.find input{width:100%;font-family:var(--font);font-size:13.5px;color:var(--text);
  background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:8px 10px}
.find input::placeholder{color:var(--text-dim)}

.toc{overflow-y:auto;padding:0 10px 26px;flex:1;scrollbar-width:thin}
.toc-part{font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;
  color:var(--text-dim);padding:17px 12px 6px;border-top:1px solid var(--hairline);margin-top:7px}
.toc-part.first{border-top:0;margin-top:0;padding-top:5px}
.toc a{display:grid;grid-template-columns:22px 1fr;gap:5px;align-items:baseline;
  font-size:13.5px;line-height:1.36;color:var(--text-dim);text-decoration:none;
  padding:5.5px 12px;border-radius:6px;border-left:2px solid transparent}
.toc a:hover{background:var(--card-hover);color:var(--text)}
.toc a .n{font-family:var(--mono);font-size:10.5px;font-variant-numeric:tabular-nums;
  color:color-mix(in srgb,var(--text-dim) 75%,transparent)}
.toc a.on{background:var(--accent-soft);color:var(--accent);font-weight:600;border-left-color:var(--accent)}
.toc a.on .n{color:var(--accent)}
.toc a.hide,.toc-part.hide{display:none}
.toc .empty{font-size:13px;color:var(--text-dim);padding:14px 12px}

/* ─── Testata ─── */
.mast{padding:clamp(36px,6vw,68px) 0 30px;max-width:72ch;border-bottom:1px solid var(--border)}
.mast .kick{display:flex;gap:7px;flex-wrap:wrap;margin-bottom:20px}
.mast h1{font-weight:800;font-size:clamp(30px,4.6vw,44px);line-height:1.06;
  letter-spacing:-.03em;margin:0 0 16px;text-wrap:balance}
.mast .lede{font-size:18px;line-height:1.6;color:var(--text);margin:0;max-width:64ch}
.mast .lede2{margin-top:12px;font-size:15.5px;color:var(--text-dim)}
.back{display:inline-block;margin-top:24px;font-size:13.5px;font-weight:600;
  color:var(--text-dim);text-decoration:none;border:1px solid var(--border);
  border-radius:6px;padding:7px 13px;background:var(--card)}
.back:hover{background:var(--card-hover);color:var(--text)}

/* ─── Corpo ─── */
.doc{max-width:72ch;padding-top:6px}
.doc h1{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;
  color:var(--accent);margin:74px 0 0;padding-bottom:8px;
  border-bottom:2px solid var(--accent-line);scroll-margin-top:20px}
.doc h2{font-weight:800;font-size:clamp(24px,3vw,29px);line-height:1.18;letter-spacing:-.025em;
  margin:48px 0 16px;scroll-margin-top:20px;text-wrap:balance}
.doc h1 + h2{margin-top:28px}
.doc h3{font-weight:700;font-size:17.5px;line-height:1.32;letter-spacing:-.01em;
  margin:34px 0 11px;scroll-margin-top:20px}
.doc p{margin:0 0 14px}
.doc ul,.doc ol{margin:0 0 16px;padding-left:21px}
.doc li{margin-bottom:5px}
.doc li::marker{color:var(--text-dim)}
.doc hr{border:0;border-top:1px solid var(--border);margin:40px 0}
.doc strong{font-weight:700}
.doc em{color:var(--text-dim)}

.doc code{font-family:var(--mono);font-size:.85em;background:var(--card);
  border:1px solid var(--hairline);border-radius:4px;padding:.12em .34em}
.doc pre{background:var(--card);border:1px solid var(--border);border-radius:8px;
  padding:17px 19px;overflow-x:auto;margin:0 0 20px}
.doc pre code{font-family:var(--mono);font-size:12px;line-height:1.6;background:none;
  border:0;padding:0;color:var(--text-dim);white-space:pre}

.tw{overflow-x:auto;margin:0 0 22px;border:1px solid var(--border);border-radius:8px;
  background:var(--card)}
.doc table{border-collapse:collapse;width:100%;font-size:13.5px;line-height:1.5}
.doc th{font-weight:700;text-align:left;color:var(--text-dim);font-size:10.5px;
  letter-spacing:.07em;text-transform:uppercase;padding:10px 14px;
  border-bottom:1px solid var(--border);white-space:nowrap;background:var(--card-hover)}
.doc td{padding:10px 14px;border-bottom:1px solid var(--hairline);vertical-align:top;
  color:var(--text-dim)}
.doc tr:last-child td{border-bottom:0}
.doc td strong{color:var(--text)}
.doc td code{font-size:11.5px}
.doc th[align=center],.doc td[align=center]{text-align:center}

.doc blockquote{margin:0 0 22px;padding:14px 18px;border-radius:0 8px 8px 0;
  background:var(--card);border-left:3px solid var(--border);font-size:14.5px;color:var(--text-dim)}
.doc blockquote p{margin:0 0 9px}
.doc blockquote p:last-child{margin:0}
.doc blockquote.warn{background:var(--orange-soft);border-left-color:var(--orange)}
.doc blockquote.warn strong{color:var(--orange)}
.doc blockquote.crit{background:var(--red-soft);border-left-color:var(--red)}
.doc blockquote.crit strong{color:var(--red)}

.colophon{max-width:72ch;margin-top:52px;padding-top:20px;border-top:1px solid var(--border);
  font-size:12.5px;color:var(--text-dim)}

/* ─── Barra sugli schermi stretti ─── */
.bar{display:none;position:sticky;top:0;z-index:20;align-items:center;gap:11px;
  padding:10px 15px;background:var(--card);border-bottom:1px solid var(--border)}
.bar button{font-family:var(--font);font-size:13px;font-weight:600;color:var(--text);
  background:var(--bg);border:1px solid var(--border);border-radius:6px;padding:7px 12px;cursor:pointer}
.bar .brand-name{font-size:16px}
.scrim{position:fixed;inset:0;z-index:25;background:rgba(0,0,0,.45);display:none}

@media(max-width:980px){
  .wrap{grid-template-columns:1fr}
  .bar{display:flex}
  .rail{position:fixed;inset:0 auto 0 0;width:292px;z-index:30;transform:translateX(-100%);
    transition:transform .2s ease;box-shadow:0 0 40px var(--shadow)}
  .rail.open{transform:none}
  .scrim.on{display:block}
  .main{padding:0 18px 96px}
  .mast{padding-top:32px}
}
@media(prefers-reduced-motion:reduce){*{transition:none!important}html{scroll-behavior:auto}}
@media print{
  :root{color-scheme:light;--bg:#fff;--card:#fff;--card-hover:#fff;--border:#c9ced8;
    --text:#171A21;--text-dim:#4a5261;--accent:#2563C7}
  .rail,.bar,.scrim,.back{display:none}
  .wrap{display:block}.main{padding:0}
  .doc h2{page-break-after:avoid}.tw,.doc pre,.doc blockquote{page-break-inside:avoid}
}
</style>
</head>
<body>

<div class="bar">
  <button id="menu" aria-expanded="false">Indice</button>
  <span class="brand-name">Manuale</span>
</div>
<div class="scrim" id="scrim"></div>

<div class="wrap">
  <aside class="rail" id="rail">
    <div class="brand">
      <div class="brand-top">
        <span class="brand-name">Bomtrack</span>
        <span class="chip">v{{VERSIONE}}</span>
      </div>
      <div class="brand-sub">Manuale d&rsquo;uso</div>
    </div>
    <div class="find">
      <input id="q" type="search" placeholder="Filtra i capitoli&hellip;" aria-label="Filtra i capitoli">
    </div>
    <nav class="toc" id="toc" aria-label="Indice del manuale">
{{INDICE}}
      <div class="empty" id="empty" hidden>Nessun capitolo con questo testo.</div>
    </nav>
  </aside>

  <main class="main">
    <header class="mast">
      <div class="kick">
        <span class="chip">Distinte base</span>
        <span class="chip">Costificazione</span>
        <span class="chip">Acquisti e conto lavoro</span>
      </div>
      <h1>Manuale d&rsquo;uso di Bomtrack</h1>
      <p class="lede">Cosa fa ogni schermata, come si compilano i campi e &mdash; soprattutto &mdash;
        in che ordine si lavora: dalla commessa del cliente fino alla merce che entra a magazzino.</p>
      <p class="lede lede2">Se &egrave; il primo giorno, leggi nell&rsquo;ordine il capitolo 1, il 2 e
        poi tutto il 4: il capitolo 4 &egrave; il giro completo del lavoro, e gli altri sono il
        dettaglio di ciascuna sua tappa.</p>
      <a class="back" href="index.html">&larr; Torna all&rsquo;app</a>
    </header>

    <article class="doc" id="doc">
{{CORPO}}
    </article>
    <p class="colophon">{{CHIUSURA}}</p>
  </main>
</div>

<script>
// La pagina e' gia' impaginata e navigabile senza di me: qui si aggiungono
// soltanto il tema dell'app, il filtro dei capitoli, l'evidenziazione di dove
// si e' e il cassetto dell'indice sugli schermi stretti.
(function () {
  "use strict";

  // ─── Il tema scelto nell'app ───
  // Stessa chiave di theme.js. Se non c'e' (o il browser non concede lo
  // storage) resta «come il sistema», che e' il valore di partenza dell'app.
  try {
    var t = localStorage.getItem("bomtrack_theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* niente da leggere, niente da rompere */ }

  var toc = document.getElementById("toc");
  var links = Array.prototype.slice.call(toc.querySelectorAll("a"));
  var heads = Array.prototype.slice.call(document.querySelectorAll(".doc h2"));
  var empty = document.getElementById("empty");

  // ─── Filtro dei capitoli ───
  document.getElementById("q").addEventListener("input", function (e) {
    var v = e.target.value.trim().toLowerCase();
    var shown = 0;
    links.forEach(function (a) {
      var hit = !v || a.textContent.toLowerCase().indexOf(v) > -1;
      a.classList.toggle("hide", !hit);
      if (hit) shown++;
    });
    // Un titolo di parte senza capitoli sotto non dice piu' niente.
    toc.querySelectorAll(".toc-part").forEach(function (h) {
      var g = h.nextElementSibling;
      var any = g ? !!g.querySelector("a:not(.hide)") : false;
      h.classList.toggle("hide", !any);
    });
    empty.hidden = shown > 0;
  });

  // ─── Dove sono ───
  var byId = {};
  links.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });
  var active = null;
  function spy() {
    var best = null;
    for (var i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().top <= 120) best = heads[i];
      else break;
    }
    var a = best ? byId[best.id] : links[0];
    if (a === active) return;
    if (active) active.classList.remove("on");
    active = a;
    if (a) {
      a.classList.add("on");
      // Tenerlo a vista: l'indice non sta in una schermata.
      var r = a.getBoundingClientRect(), b = toc.getBoundingClientRect();
      if (r.top < b.top + 8 || r.bottom > b.bottom - 8) {
        toc.scrollTop += r.top - b.top - b.height / 2;
      }
    }
  }
  var tick = false;
  window.addEventListener("scroll", function () {
    if (tick) return;
    tick = true;
    requestAnimationFrame(function () { spy(); tick = false; });
  }, { passive: true });
  spy();

  // ─── Cassetto dell'indice sotto i 980px ───
  var rail = document.getElementById("rail");
  var scrim = document.getElementById("scrim");
  var menu = document.getElementById("menu");
  function shut() {
    rail.classList.remove("open");
    scrim.classList.remove("on");
    menu.setAttribute("aria-expanded", "false");
  }
  menu.addEventListener("click", function () {
    var open = rail.classList.toggle("open");
    scrim.classList.toggle("on", open);
    menu.setAttribute("aria-expanded", open ? "true" : "false");
  });
  scrim.addEventListener("click", shut);
  document.addEventListener("click", function (e) {
    if (e.target.closest(".toc a") || e.target.closest(".doc a")) shut();
  });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") shut(); });
})();
</script>
</body>
</html>
"""


if __name__ == '__main__':
    a = sys.argv[1:]
    main(a[0] if a else 'MANUALE.md', a[1] if len(a) > 1 else 'manuale.html')
