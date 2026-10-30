// The roadmap canvas: pan/zoom board, topic nodes (HTML) and prerequisite links (SVG curves).
// View mode: click a topic to open it. Edit mode: drag topics, drag the dot under a topic
// onto another topic to link them, click a link and press Delete to remove it.
import { NODE_W } from './layout.js';
import { uid } from './store.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Board {
  constructor(el, { onSelect, onChange }) {
    this.el = el;
    this.onSelect = onSelect;
    this.onChange = onChange;
    this.view = { x: 0, y: 0, z: 1 };
    this.rm = null;
    this.editing = false;
    this.selected = null;
    this.selectedLink = null;
    this.counts = () => ({ solved: 0, total: 0 });
    this.heights = new Map();

    el.classList.add('board');
    el.tabIndex = 0;
    el.innerHTML = `
      <div class="world">
        <svg class="links" width="1" height="1" aria-hidden="true">
          <g class="link-layer"></g>
          <path class="ghost-link" d=""></path>
        </svg>
        <div class="node-layer"></div>
      </div>
      <div class="zoom-ctl">
        <button type="button" data-zoom="in" aria-label="Zoom in">+</button>
        <button type="button" data-zoom="out" aria-label="Zoom out">−</button>
        <button type="button" data-zoom="fit" aria-label="Fit roadmap to screen">Fit</button>
      </div>
      <p class="board-hint"></p>`;
    this.world = el.querySelector('.world');
    this.linkLayer = el.querySelector('.link-layer');
    this.ghost = el.querySelector('.ghost-link');
    this.nodeLayer = el.querySelector('.node-layer');
    this.hint = el.querySelector('.board-hint');
    this.bind();
  }

  setRoadmap(rm, { fit = false } = {}) {
    this.rm = rm;
    this.render();
    if (fit) requestAnimationFrame(() => this.fit());
  }

  setEditing(on) {
    this.editing = on;
    this.selectedLink = null;
    this.el.classList.toggle('editing', on);
    this.hint.textContent = on
      ? 'Drag topics to move them. Drag the dot under a topic onto another topic to link them. Click a link, then press Delete to remove it.'
      : '';
    this.renderLinks();
  }

  setCounts(fn) {
    this.counts = fn;
    this.render();
  }

  select(id) {
    this.selected = id;
    for (const n of this.nodeLayer.children) n.classList.toggle('sel', n.dataset.id === id);
  }

  // ---------- rendering ----------
  render() {
    if (!this.rm) return;
    this.nodeLayer.innerHTML = this.rm.topics
      .map((t) => {
        const { solved, total } = this.counts(t);
        const pct = total ? Math.round((solved / total) * 100) : 0;
        const done = total > 0 && solved === total;
        return `<div class="node${t.id === this.selected ? ' sel' : ''}${done ? ' done' : ''}" data-id="${esc(t.id)}"
            style="left:${t.x}px;top:${t.y}px;width:${NODE_W}px" tabindex="0" role="button"
            aria-label="${esc(t.title)}, ${solved} of ${total} solved">
            <span class="node-title">${esc(t.title)}</span>
            <span class="node-bar"><i style="width:${pct}%"></i></span>
            <span class="handle" data-handle title="Drag onto another topic to link"></span>
          </div>`;
      })
      .join('');
    this.heights.clear();
    for (const n of this.nodeLayer.children) this.heights.set(n.dataset.id, n.offsetHeight || 44);
    this.renderLinks();
    this.applyView();
  }

  pathFor(s, t) {
    const sx = s.x + NODE_W / 2;
    const sy = s.y + (this.heights.get(s.id) || 44);
    const tx = t.x + NODE_W / 2;
    const ty = t.y;
    const dy = Math.max(30, Math.abs(ty - sy) / 2);
    return `M${sx},${sy} C${sx},${sy + dy} ${tx},${ty - dy} ${tx},${ty}`;
  }

  renderLinks() {
    if (!this.rm) return;
    const byId = new Map(this.rm.topics.map((t) => [t.id, t]));
    this.linkLayer.innerHTML = this.rm.links
      .map((l) => {
        const s = byId.get(l.source);
        const t = byId.get(l.target);
        if (!s || !t) return '';
        const d = this.pathFor(s, t);
        return `<g class="link${l.id === this.selectedLink ? ' sel' : ''}" data-link="${esc(l.id)}">
          <path class="link-hit" d="${d}"></path><path class="link-line" d="${d}"></path></g>`;
      })
      .join('');
  }

  applyView() {
    const { x, y, z } = this.view;
    this.world.style.transform = `translate(${x}px, ${y}px) scale(${z})`;
    this.el.style.backgroundPosition = `${x}px ${y}px`;
    this.el.style.backgroundSize = `${22 * z}px ${22 * z}px`;
  }

  fit() {
    if (!this.rm || !this.rm.topics.length) return;
    const r = this.el.getBoundingClientRect();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of this.rm.topics) {
      minX = Math.min(minX, t.x);
      minY = Math.min(minY, t.y);
      maxX = Math.max(maxX, t.x + NODE_W);
      maxY = Math.max(maxY, t.y + (this.heights.get(t.id) || 44));
    }
    const pad = 48;
    const z = Math.max(0.3, Math.min(1.25, (r.width - pad * 2) / (maxX - minX), (r.height - pad * 2) / (maxY - minY)));
    this.view = {
      z,
      x: (r.width - (maxX - minX) * z) / 2 - minX * z,
      y: Math.max(pad, (r.height - (maxY - minY) * z) / 2) - minY * z,
    };
    this.applyView();
  }

  zoomAt(factor, cx, cy) {
    const z = Math.max(0.3, Math.min(2, this.view.z * factor));
    const k = z / this.view.z;
    this.view = { z, x: cx - (cx - this.view.x) * k, y: cy - (cy - this.view.y) * k };
    this.applyView();
  }

  // Centre of the visible area, in roadmap coordinates (where new topics appear).
  viewCenter() {
    const r = this.el.getBoundingClientRect();
    return { x: (r.width / 2 - this.view.x) / this.view.z, y: (r.height / 2 - this.view.y) / this.view.z };
  }

  toWorld(clientX, clientY) {
    const r = this.el.getBoundingClientRect();
    return { x: (clientX - r.left - this.view.x) / this.view.z, y: (clientY - r.top - this.view.y) / this.view.z };
  }

  // ---------- interaction ----------
  bind() {
    const el = this.el;
    let drag = null;

    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('.zoom-ctl')) return;
      const node = e.target.closest('.node');
      const linkEl = e.target.closest('.link');
      const start = { x: e.clientX, y: e.clientY };

      if (node && this.editing && e.target.closest('[data-handle]')) {
        drag = { kind: 'connect', from: node.dataset.id, start };
      } else if (node) {
        const t = this.rm.topics.find((x) => x.id === node.dataset.id);
        drag = { kind: 'node', el: node, topic: t, start, orig: { x: t.x, y: t.y }, origView: { ...this.view }, moved: false };
      } else if (linkEl && this.editing) {
        this.selectedLink = linkEl.dataset.link;
        this.renderLinks();
        el.focus({ preventScroll: true });
        return;
      } else {
        drag = { kind: 'pan', start, orig: { ...this.view }, moved: false };
      }
      el.setPointerCapture(e.pointerId);
    });

    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.start.x;
      const dy = e.clientY - drag.start.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.kind === 'pan' && drag.moved) {
        this.view = { ...this.view, x: drag.orig.x + dx, y: drag.orig.y + dy };
        this.applyView();
      } else if (drag.kind === 'node' && drag.moved && this.editing) {
        drag.topic.x = Math.round(drag.orig.x + dx / this.view.z);
        drag.topic.y = Math.round(drag.orig.y + dy / this.view.z);
        drag.el.style.left = `${drag.topic.x}px`;
        drag.el.style.top = `${drag.topic.y}px`;
        this.renderLinks();
      } else if (drag.kind === 'node' && drag.moved) {
        // In view mode, dragging on a topic pans the board instead of moving the topic.
        this.view = { ...this.view, x: drag.origView.x + dx, y: drag.origView.y + dy };
        this.applyView();
      } else if (drag.kind === 'connect') {
        const s = this.rm.topics.find((t) => t.id === drag.from);
        const p = this.toWorld(e.clientX, e.clientY);
        this.ghost.setAttribute('d', this.pathFor(s, { x: p.x - NODE_W / 2, y: p.y }));
        el.classList.add('connecting');
      }
    });

    const end = (e) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (d.kind === 'pan' && !d.moved) {
        this.selectedLink = null;
        this.renderLinks();
        this.onSelect(null);
      } else if (d.kind === 'node') {
        if (!d.moved) this.onSelect(d.topic.id);
        else if (this.editing) this.onChange();
      } else if (d.kind === 'connect') {
        this.ghost.setAttribute('d', '');
        el.classList.remove('connecting');
        const hit = document.elementFromPoint(e.clientX, e.clientY);
        const target = hit && hit.closest && hit.closest('.node');
        if (target) this.addLink(d.from, target.dataset.id);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = el.getBoundingClientRect();
        this.zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
      },
      { passive: false }
    );

    el.querySelector('.zoom-ctl').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const r = el.getBoundingClientRect();
      if (b.dataset.zoom === 'fit') this.fit();
      else this.zoomAt(b.dataset.zoom === 'in' ? 1.2 : 1 / 1.2, r.width / 2, r.height / 2);
    });

    el.addEventListener('keydown', (e) => {
      const node = e.target.closest && e.target.closest('.node');
      if (node && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        this.onSelect(node.dataset.id);
      } else if (this.editing && this.selectedLink && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        this.rm.links = this.rm.links.filter((l) => l.id !== this.selectedLink);
        this.selectedLink = null;
        this.renderLinks();
        this.onChange();
      }
    });

    window.addEventListener('resize', () => this.applyView());
  }

  addLink(source, target) {
    if (source === target) return;
    if (this.rm.links.some((l) => l.source === source && l.target === target)) return;
    this.rm.links.push({ id: uid(), source, target });
    this.renderLinks();
    this.onChange();
  }
}
