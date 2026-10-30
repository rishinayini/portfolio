// DevPath phase 1: app shell, routing, roadmap list, editor and topic panel.
import * as store from './store.js';
import { Board } from './graph.js';
import { tidy, NODE_W } from './layout.js';
import { parseProblemRef, getProblemIndex, fetchProgress, progressIndex, statusOf, problemUrl, keyOf } from './codeforces.js';

const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const ICON = {
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7"/></svg>',
  dot: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.5"/></svg>',
  ext: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 3h7v7M13 3L6.5 9.5M11 9.5V13H3V5h3.5"/></svg>',
};

let progress = store.getProgress();
let pidx = progressIndex(progress);
let openNextInEdit = false;
let ed = null; // state of the open editor

// ---------- progress helpers ----------
function topicCounts(t) {
  let solved = 0;
  for (const p of t.problems) if (statusOf(p, pidx) === 'solved') solved++;
  return { solved, total: t.problems.length };
}

function roadmapCounts(rm) {
  let solved = 0, total = 0;
  for (const t of rm.topics) {
    const c = topicCounts(t);
    solved += c.solved;
    total += c.total;
  }
  return { solved, total };
}

const bar = (solved, total) =>
  `<span class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${solved}"><i style="width:${total ? (solved / total) * 100 : 0}%"></i></span>`;

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

// ---------- shell + sync ----------
function renderShell() {
  app.innerHTML = `
    <header class="topbar">
      <a class="brand" href="#/"><span class="brand-mark">&lt;/&gt;</span>DevPath</a>
      <form class="sync" id="sync-form">
        <label for="cf-handle" class="sr">Codeforces handle</label>
        <input id="cf-handle" name="handle" placeholder="Codeforces handle" autocomplete="off" spellcheck="false" autocapitalize="off" value="${esc(progress?.handle || '')}">
        <button type="submit" class="btn btn-primary" id="sync-btn">Sync</button>
        <p class="sync-status" id="sync-status" aria-live="polite"></p>
      </form>
    </header>
    <main id="view"></main>`;
  document.getElementById('sync-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const handle = document.getElementById('cf-handle').value.trim();
    if (handle) doSync(handle);
    else setSyncStatus('Enter your Codeforces handle first.', 'error');
  });
  setSyncStatus();
}

function setSyncStatus(msg, kind = '') {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.className = `sync-status ${kind}`;
  el.textContent = msg ?? (progress ? `${progress.solved.length} solved · synced ${ago(progress.syncedAt)}` : 'Sync your handle to track progress');
}

async function doSync(handle, { quiet = false } = {}) {
  const btn = document.getElementById('sync-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Syncing…';
  }
  if (!quiet) setSyncStatus('Fetching your submissions…');
  try {
    progress = await fetchProgress(handle);
    store.setProgress(progress);
    pidx = progressIndex(progress);
    try {
      refreshProblemMeta(await getProblemIndex());
    } catch {
      /* names can be filled on a later sync */
    }
    setSyncStatus();
    route();
  } catch (err) {
    if (!quiet) setSyncStatus(err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sync';
    }
  }
}

// Fills in official names and ratings for every problem in every roadmap.
function refreshProblemMeta(idx) {
  for (const rm of store.getRoadmaps()) {
    let changed = false;
    for (const t of rm.topics)
      for (const p of t.problems) {
        const m = idx[keyOf(p)];
        if (m && (p.name !== m[0] || p.rating !== m[1] || p.pending)) {
          p.name = m[0];
          p.rating = m[1];
          delete p.pending;
          changed = true;
        }
      }
    if (changed) store.saveRoadmap(rm);
  }
}

// ---------- routing ----------
function route() {
  const m = location.hash.match(/^#\/r\/([\w-]+)/);
  if (m) showEditor(m[1]);
  else showList();
}

// ---------- roadmap list ----------
function previewSvg(rm) {
  if (!rm.topics.length) return '';
  const H = 44;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const t of rm.topics) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + NODE_W);
    maxY = Math.max(maxY, t.y + H);
  }
  const pad = 40;
  const byId = new Map(rm.topics.map((t) => [t.id, t]));
  const lines = rm.links
    .map((l) => {
      const s = byId.get(l.source), t = byId.get(l.target);
      if (!s || !t) return '';
      const sx = s.x + NODE_W / 2, sy = s.y + H, tx = t.x + NODE_W / 2, ty = t.y, dy = Math.max(20, (ty - sy) / 2);
      return `<path d="M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty}"/>`;
    })
    .join('');
  const boxes = rm.topics
    .map((t) => {
      const c = topicCounts(t);
      return `<rect x="${t.x}" y="${t.y}" width="${NODE_W}" height="${H}" rx="8" class="${c.total && c.solved === c.total ? 'done' : ''}"/>`;
    })
    .join('');
  return `<svg viewBox="${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="pv-links">${lines}</g><g class="pv-nodes">${boxes}</g></svg>`;
}

function showList() {
  ed = null;
  document.title = 'DevPath';
  const view = document.getElementById('view');
  const list = store.getRoadmaps();
  view.className = 'list-view';
  view.innerHTML = `
    <div class="list-wrap">
      <div class="list-head">
        <div>
          <h1>Roadmaps</h1>
          <p class="lede">Lay out topics as a graph, fill each one with Codeforces problems, and sync your handle to see what you've solved.</p>
        </div>
        <div class="list-actions">
          <label class="btn" for="import-file">Import</label>
          <input type="file" id="import-file" accept="application/json,.json" class="sr">
          <button type="button" class="btn btn-primary" id="new-rm">New roadmap</button>
        </div>
      </div>
      <p class="form-msg error" id="list-msg" aria-live="polite"></p>
      <div class="rm-grid">
        ${
          list.length
            ? list
                .map((rm) => {
                  const c = roadmapCounts(rm);
                  return `<a class="rm-card" href="#/r/${esc(rm.id)}">
                    <div class="rm-preview">${previewSvg(rm)}</div>
                    <div class="rm-body">
                      <h2>${esc(rm.title)}</h2>
                      ${rm.description ? `<p>${esc(rm.description)}</p>` : ''}
                      <p class="rm-meta">${rm.topics.length} topics · ${c.total} problems · by ${esc(rm.author)}</p>
                      <div class="rm-progress">${bar(c.solved, c.total)}<span>${progress ? `${c.solved} / ${c.total} solved` : 'Not synced'}</span></div>
                    </div>
                  </a>`;
                })
                .join('')
            : `<div class="empty"><h2>No roadmaps yet</h2><p>Create one, or import a roadmap someone shared with you.</p></div>`
        }
      </div>
    </div>`;

  document.getElementById('new-rm').addEventListener('click', () => {
    const rm = store.createRoadmap();
    openNextInEdit = true;
    location.hash = `#/r/${rm.id}`;
  });
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const rm = store.importRoadmap(JSON.parse(await file.text()));
      location.hash = `#/r/${rm.id}`;
    } catch (err) {
      document.getElementById('list-msg').textContent =
        err instanceof SyntaxError ? "That file isn't valid JSON." : err.message;
    }
  });
}

// ---------- editor ----------
function showEditor(id) {
  const rm = store.getRoadmap(id);
  const view = document.getElementById('view');
  if (!rm) {
    view.className = 'list-view';
    view.innerHTML = `<div class="list-wrap"><div class="empty"><h2>Roadmap not found</h2><p>It may have been deleted from this browser. <a href="#/">Back to roadmaps</a></p></div></div>`;
    return;
  }
  // Re-rendering the same roadmap (after a sync) keeps the board's position and selection.
  if (ed && ed.rm.id === id) {
    ed.board.setCounts(topicCounts);
    renderProgress();
    renderPanel();
    return;
  }
  document.title = `${rm.title} · DevPath`;
  view.className = 'editor-view';
  view.innerHTML = `
    <div class="ed-bar">
      <a class="back" href="#/">← Roadmaps</a>
      <div class="ed-title" id="ed-title"></div>
      <div class="ed-right">
        <div class="ed-progress" id="ed-progress"></div>
        <div class="seg" role="group" aria-label="Mode">
          <button type="button" data-mode="view">View</button>
          <button type="button" data-mode="edit">Edit</button>
        </div>
        <div class="ed-tools" id="ed-tools"></div>
      </div>
    </div>
    <div class="ed-main">
      <div id="board"></div>
      <aside class="panel" id="panel" hidden></aside>
    </div>`;

  ed = { rm, editing: openNextInEdit, selected: null, saveTimer: 0, deleteArmed: null };
  openNextInEdit = false;
  ed.board = new Board(document.getElementById('board'), {
    onSelect: (tid) => selectTopic(tid),
    onChange: () => save(),
  });
  ed.board.setCounts(topicCounts);
  ed.board.setEditing(ed.editing);
  ed.board.setRoadmap(rm, { fit: true });

  view.querySelector('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) setMode(b.dataset.mode === 'edit');
  });
  setMode(ed.editing);
  renderProgress();
}

function save({ soon = false } = {}) {
  clearTimeout(ed.saveTimer);
  if (soon) ed.saveTimer = setTimeout(() => store.saveRoadmap(ed.rm), 300);
  else store.saveRoadmap(ed.rm);
}

function setMode(editing) {
  ed.editing = editing;
  ed.board.setEditing(editing);
  for (const b of document.querySelectorAll('.seg button')) b.setAttribute('aria-pressed', String((b.dataset.mode === 'edit') === editing));
  renderTitle();
  renderTools();
  renderPanel();
}

function renderTitle() {
  const el = document.getElementById('ed-title');
  const { rm } = ed;
  if (ed.editing) {
    el.innerHTML = `
      <label for="rm-title" class="sr">Roadmap title</label>
      <input id="rm-title" class="title-input" value="${esc(rm.title)}" maxlength="80">
      <label for="rm-desc" class="sr">Description</label>
      <input id="rm-desc" class="desc-input" value="${esc(rm.description)}" placeholder="One line about who this roadmap is for" maxlength="240">`;
    el.querySelector('#rm-title').addEventListener('input', (e) => {
      rm.title = e.target.value || 'Untitled roadmap';
      document.title = `${rm.title} · DevPath`;
      save({ soon: true });
    });
    el.querySelector('#rm-desc').addEventListener('input', (e) => {
      rm.description = e.target.value;
      save({ soon: true });
    });
  } else {
    el.innerHTML = `<h1>${esc(rm.title)}</h1>${rm.description ? `<p>${esc(rm.description)}</p>` : ''}`;
  }
}

function renderProgress() {
  const el = document.getElementById('ed-progress');
  if (!el) return;
  const c = roadmapCounts(ed.rm);
  el.innerHTML = progress
    ? `${bar(c.solved, c.total)}<span><b>${c.solved}</b> / ${c.total} solved</span>`
    : `<span class="muted">${c.total} problems</span>`;
}

function renderTools() {
  const el = document.getElementById('ed-tools');
  el.innerHTML = ed.editing
    ? `<button type="button" class="btn" data-tool="add">+ Topic</button>
       <button type="button" class="btn" data-tool="tidy">Tidy layout</button>
       <button type="button" class="btn" data-tool="export">Export</button>
       <button type="button" class="btn btn-danger" data-tool="delete">Delete</button>`
    : `<button type="button" class="btn" data-tool="export">Export</button>`;
  el.onclick = (e) => {
    const b = e.target.closest('[data-tool]');
    if (!b) return;
    const tool = b.dataset.tool;
    if (tool === 'add') addTopic();
    else if (tool === 'tidy') {
      tidy(ed.rm);
      save();
      ed.board.render();
      ed.board.fit();
    } else if (tool === 'export') exportCurrent();
    else if (tool === 'delete') {
      if (b.dataset.armed) {
        store.deleteRoadmap(ed.rm.id);
        location.hash = '#/';
      } else {
        b.dataset.armed = '1';
        b.textContent = 'Click again to delete';
        setTimeout(() => {
          if (b.isConnected) {
            delete b.dataset.armed;
            b.textContent = 'Delete';
          }
        }, 3000);
      }
    }
  };
}

function exportCurrent() {
  const blob = new Blob([JSON.stringify(store.exportRoadmap(ed.rm), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${ed.rm.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roadmap'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

function addTopic() {
  const { rm, board } = ed;
  const parent = rm.topics.find((t) => t.id === ed.selected);
  let x, y;
  if (parent) {
    x = parent.x;
    y = parent.y + 110;
  } else {
    const c = board.viewCenter();
    x = Math.round(c.x - NODE_W / 2);
    y = Math.round(c.y - 22);
  }
  const t = { id: store.uid(), title: 'New topic', x, y, problems: [] };
  rm.topics.push(t);
  if (parent) rm.links.push({ id: store.uid(), source: parent.id, target: t.id });
  save();
  board.render();
  selectTopic(t.id);
  const input = document.getElementById('topic-title');
  if (input) {
    input.focus();
    input.select();
  }
}

function selectTopic(id) {
  ed.selected = id;
  ed.board.select(id);
  renderPanel();
}

function renderPanel(message) {
  const panel = document.getElementById('panel');
  if (!panel || !ed) return;
  const t = ed.rm.topics.find((x) => x.id === ed.selected);
  if (!t) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  const c = topicCounts(t);
  const label = { solved: 'Solved', tried: 'Attempted, not solved yet', none: 'Not attempted' };
  const rows = t.problems
    .map((p, i) => {
      const s = statusOf(p, pidx);
      return `<li class="prob s-${s}">
        <span class="status" title="${label[s]}"><span class="sr">${label[s]}</span>${s === 'solved' ? ICON.check : s === 'tried' ? ICON.dot : ''}</span>
        <div class="prob-main">
          <a href="${problemUrl(p)}" target="_blank" rel="noopener">${esc(p.name)}${ICON.ext}</a>
          <span class="prob-meta"><code>${esc(keyOf(p))}</code>${p.rating ? ` · ${p.rating}` : ''}${p.pending ? ' · name updates on next sync' : ''}</span>
        </div>
        ${ed.editing ? `<button type="button" class="icon-btn" data-remove="${i}" aria-label="Remove ${esc(p.name)}">×</button>` : ''}
      </li>`;
    })
    .join('');

  panel.innerHTML = `
    <div class="panel-head">
      ${
        ed.editing
          ? `<label for="topic-title" class="sr">Topic name</label><input id="topic-title" class="topic-input" value="${esc(t.title)}" maxlength="60">`
          : `<h2>${esc(t.title)}</h2>`
      }
      <button type="button" class="icon-btn" data-act="close" aria-label="Close panel">×</button>
    </div>
    <div class="panel-progress">${bar(c.solved, c.total)}<span>${progress ? `${c.solved} / ${c.total} solved` : `${c.total} problems`}</span></div>
    ${
      t.problems.length
        ? `<ol class="problems">${rows}</ol>`
        : `<p class="panel-empty">${ed.editing ? 'No problems yet. Paste Codeforces links below.' : 'No problems yet. Switch to Edit to add some.'}</p>`
    }
    ${
      ed.editing
        ? `<form class="add-form" id="add-form">
            <label for="add-input">Add problems</label>
            <textarea id="add-input" rows="4" spellcheck="false" placeholder="Paste Codeforces links, one per line&#10;https://codeforces.com/problemset/problem/4/A&#10;1520D"></textarea>
            <button type="submit" class="btn btn-primary">Add</button>
            <p class="form-msg ${message?.kind || ''}" id="add-msg" aria-live="polite">${esc(message?.text || '')}</p>
          </form>
          <button type="button" class="btn btn-danger btn-block" data-act="delete-topic">Delete topic</button>`
        : !progress
          ? `<p class="panel-note">Sync your Codeforces handle at the top to mark solved problems.</p>`
          : ''
    }`;

  panel.onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.act === 'close') selectTopic(null);
    else if (b.dataset.remove != null) {
      t.problems.splice(Number(b.dataset.remove), 1);
      save();
      ed.board.render();
      renderProgress();
      renderPanel();
    } else if (b.dataset.act === 'delete-topic') {
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = `Click again to delete "${t.title}"`;
        return;
      }
      ed.rm.topics = ed.rm.topics.filter((x) => x.id !== t.id);
      ed.rm.links = ed.rm.links.filter((l) => l.source !== t.id && l.target !== t.id);
      save();
      ed.board.render();
      renderProgress();
      selectTopic(null);
    }
  };

  const title = panel.querySelector('#topic-title');
  if (title)
    title.addEventListener('input', () => {
      t.title = title.value || 'Untitled topic';
      save({ soon: true });
      ed.board.render();
    });

  const form = panel.querySelector('#add-form');
  if (form)
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      addProblems(t, panel.querySelector('#add-input').value);
    });
}

async function addProblems(topic, text) {
  const msg = document.getElementById('add-msg');
  const parts = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) {
    msg.className = 'form-msg error';
    msg.textContent = 'Paste at least one Codeforces problem link.';
    return;
  }
  const refs = [];
  const unreadable = [];
  for (const part of parts) {
    const r = parseProblemRef(part);
    if (r) refs.push(r);
    else unreadable.push(part);
  }
  msg.className = 'form-msg';
  msg.textContent = 'Looking up problems…';

  let idx = null;
  try {
    idx = await getProblemIndex();
  } catch {
    /* offline or API down: add with placeholder names */
  }

  let added = 0, pending = 0;
  const dupes = [], missing = [];
  for (const r of refs) {
    const k = keyOf(r);
    if (topic.problems.some((p) => keyOf(p) === k)) {
      dupes.push(k);
      continue;
    }
    const m = idx && idx[k];
    if (idx && !m && r.contestId < 100000) {
      missing.push(k);
      continue;
    }
    topic.problems.push(
      m ? { ...r, name: m[0], rating: m[1] } : { ...r, name: `Problem ${k}`, rating: 0, pending: true }
    );
    added++;
    if (!m) pending++;
  }
  save();
  ed.board.render();
  renderProgress();

  const notes = [];
  if (added) notes.push(`Added ${added} problem${added === 1 ? '' : 's'}.`);
  if (pending) notes.push("Couldn't reach Codeforces for names; they'll fill in on your next sync.");
  if (dupes.length) notes.push(`Already in this topic: ${dupes.join(', ')}.`);
  if (missing.length) notes.push(`Not in the Codeforces problemset: ${missing.join(', ')}.`);
  if (unreadable.length) notes.push(`Not a Codeforces problem link: ${unreadable.slice(0, 3).join(', ')}${unreadable.length > 3 ? '…' : ''}`);
  renderPanel({ text: notes.join(' '), kind: added && !unreadable.length && !missing.length ? 'ok' : 'error' });
  if (!added) document.getElementById('add-input').value = text;
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ed && ed.selected) selectTopic(null);
});

// ---------- start ----------
renderShell();
window.addEventListener('hashchange', route);
route();
if (progress && Date.now() - progress.syncedAt > 30 * 60 * 1000) doSync(progress.handle, { quiet: true });
