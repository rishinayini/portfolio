// "Tidy layout": arranges topics top-to-bottom by prerequisite depth.
// 1. Rank each topic by the longest chain of prerequisites above it.
// 2. Walk the rows top-down, placing each topic under the average x of its parents,
//    then push neighbours apart so nothing overlaps.

export const NODE_W = 150;

export function tidy(rm, gapX = 36, gapY = 96) {
  const ids = rm.topics.map((t) => t.id);
  const byId = new Map(rm.topics.map((t) => [t.id, t]));
  const parents = new Map(ids.map((i) => [i, []]));
  const children = new Map(ids.map((i) => [i, []]));
  for (const l of rm.links) {
    if (!byId.has(l.source) || !byId.has(l.target)) continue;
    children.get(l.source).push(l.target);
    parents.get(l.target).push(l.source);
  }

  // Longest-path ranking (Kahn's algorithm). Topics stuck in a cycle keep the rank they reached.
  const rank = new Map(ids.map((i) => [i, 0]));
  const indeg = new Map(ids.map((i) => [i, parents.get(i).length]));
  const queue = ids.filter((i) => indeg.get(i) === 0);
  while (queue.length) {
    const n = queue.shift();
    for (const c of children.get(n)) {
      rank.set(c, Math.max(rank.get(c), rank.get(n) + 1));
      indeg.set(c, indeg.get(c) - 1);
      if (indeg.get(c) === 0) queue.push(c);
    }
  }

  const rows = [];
  for (const id of ids) (rows[rank.get(id)] ||= []).push(id);

  const centerX = new Map();
  const step = NODE_W + gapX;
  rows.forEach((row, r) => {
    if (!row) return;
    const desired = row.map((id) => {
      const ps = parents.get(id).filter((p) => centerX.has(p));
      const x = ps.length ? ps.reduce((s, p) => s + centerX.get(p), 0) / ps.length : byId.get(id).x + NODE_W / 2;
      return { id, x };
    });
    desired.sort((a, b) => a.x - b.x);
    if (r === 0) desired.forEach((d, i) => (d.x = (i - (desired.length - 1) / 2) * step));
    const pos = desired.map((d) => d.x);
    for (let i = 1; i < pos.length; i++) pos[i] = Math.max(pos[i], pos[i - 1] + step);
    const shift = desired.reduce((s, d, i) => s + d.x - pos[i], 0) / desired.length;
    desired.forEach((d, i) => {
      const cx = pos[i] + shift;
      centerX.set(d.id, cx);
      const t = byId.get(d.id);
      t.x = Math.round(cx - NODE_W / 2);
      t.y = r * gapY;
    });
  });
}
