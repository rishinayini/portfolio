// Codeforces API client: parsing problem links, looking up problem names, syncing a user's solves.
// Docs: https://codeforces.com/apiHelp

const DIRECT = 'https://codeforces.com/api/';

export class CFError extends Error {}

// Calls the API directly from the browser first. If that fails (network or CORS),
// it falls back to the optional /api/cf proxy (see api/cf.js, works when deployed on Vercel).
export async function cfCall(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const urls = [`${DIRECT}${method}?${qs}`, `/api/cf?${new URLSearchParams({ method, ...params })}`];
  for (const url of urls) {
    let data;
    try {
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      data = await res.json();
    } catch {
      continue;
    }
    if (data && data.status === 'OK') return data.result;
    if (data && data.status === 'FAILED') throw new CFError(friendly(data.comment));
  }
  throw new CFError("Couldn't reach Codeforces. Check your connection, or try again in a minute (the API is sometimes down).");
}

function friendly(comment = '') {
  if (/not found/i.test(comment)) return 'No Codeforces user with that handle.';
  if (/limit/i.test(comment)) return 'Codeforces is rate-limiting requests. Wait a few seconds and try again.';
  return comment || 'Codeforces returned an error.';
}

export const keyOf = (p) => `${p.contestId}${p.index}`;

// Accepts:
//   https://codeforces.com/contest/1520/problem/D
//   https://codeforces.com/problemset/problem/1520/D
//   https://codeforces.com/gym/102951/problem/A
//   1520D, 1520 D, 1520/D
export function parseProblemRef(text) {
  const s = text.trim();
  if (!s) return null;
  const patterns = [
    /codeforces\.com\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z]\d?)\b/i,
    /codeforces\.com\/problemset\/problem\/(\d+)\/([A-Za-z]\d?)\b/i,
    /^(\d{1,6})\s*[\/\s]?\s*([A-Za-z]\d?)$/,
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m) return { contestId: Number(m[1]), index: m[2].toUpperCase() };
  }
  return null;
}

// ---- Problemset index (names + ratings), cached for a day ----
const PS_KEY = 'devpath.cf.problemset.v1';
const DAY = 24 * 60 * 60 * 1000;
let index = null;
let loading = null;

export function getProblemIndex() {
  if (index) return Promise.resolve(index);
  if (loading) return loading;
  try {
    const cached = JSON.parse(localStorage.getItem(PS_KEY) || 'null');
    if (cached && Date.now() - cached.at < DAY) {
      index = cached.map;
      return Promise.resolve(index);
    }
  } catch {
    /* ignore a broken cache */
  }
  loading = cfCall('problemset.problems')
    .then((result) => {
      const map = {};
      for (const p of result.problems) map[keyOf(p)] = [p.name, p.rating || 0];
      index = map;
      try {
        localStorage.setItem(PS_KEY, JSON.stringify({ at: Date.now(), map }));
      } catch {
        /* storage full: keep it in memory only */
      }
      return map;
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

// ---- A user's solves ----
export async function fetchProgress(handle) {
  const subs = await cfCall('user.status', { handle });
  const solved = new Map();
  const tried = new Set();
  for (const s of subs) {
    const p = s.problem;
    if (!p || p.contestId == null) continue;
    const k = keyOf(p);
    if (s.verdict === 'OK') solved.set(k, [p.contestId, p.index, p.name]);
    else tried.add(k);
  }
  for (const k of solved.keys()) tried.delete(k);
  return { handle, solved: [...solved.values()], tried: [...tried], syncedAt: Date.now() };
}

// Builds fast lookups from saved progress.
export function progressIndex(prog) {
  if (!prog) return null;
  const keys = new Set();
  const names = new Map();
  for (const [c, i, n] of prog.solved) {
    keys.add(`${c}${i}`);
    if (!names.has(n)) names.set(n, []);
    names.get(n).push(c);
  }
  return { keys, names, tried: new Set(prog.tried) };
}

// 'solved' | 'tried' | 'none'
// Div. 1 and Div. 2 rounds often share a problem under two consecutive contest ids,
// so a solve of the same-named problem in a neighbouring contest also counts.
export function statusOf(p, idx) {
  if (!idx) return 'none';
  const k = keyOf(p);
  if (idx.keys.has(k)) return 'solved';
  const cs = idx.names.get(p.name);
  if (cs && cs.some((c) => Math.abs(c - p.contestId) <= 1)) return 'solved';
  if (idx.tried.has(k)) return 'tried';
  return 'none';
}

export const problemUrl = (p) =>
  p.contestId >= 100000
    ? `https://codeforces.com/gym/${p.contestId}/problem/${p.index}`
    : `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
