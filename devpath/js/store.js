// Local persistence for phase 1. Everything lives in this browser's localStorage.
// Phase 2 swaps these functions for Supabase calls; the rest of the app stays the same.
import { makeSeedRoadmap } from './seed.js';

const RM_KEY = 'devpath.roadmaps.v1';
const PROG_KEY = 'devpath.progress.v1';

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const uid = () => Math.random().toString(36).slice(2, 10);

let roadmaps = null;

function persist() {
  write(RM_KEY, roadmaps);
}

export function getRoadmaps() {
  if (!roadmaps) {
    roadmaps = read(RM_KEY, null);
    if (!Array.isArray(roadmaps)) {
      roadmaps = [makeSeedRoadmap()];
      persist();
    }
  }
  return roadmaps;
}

export function getRoadmap(id) {
  return getRoadmaps().find((r) => r.id === id) || null;
}

export function saveRoadmap(rm) {
  rm.updatedAt = Date.now();
  const list = getRoadmaps();
  const i = list.findIndex((r) => r.id === rm.id);
  if (i < 0) list.unshift(rm);
  else list[i] = rm;
  persist();
}

export function deleteRoadmap(id) {
  roadmaps = getRoadmaps().filter((r) => r.id !== id);
  persist();
}

export function createRoadmap() {
  const rm = {
    id: uid(),
    title: 'Untitled roadmap',
    description: '',
    author: 'you',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    topics: [{ id: uid(), title: 'First topic', x: 0, y: 0, problems: [] }],
    links: [],
  };
  saveRoadmap(rm);
  return rm;
}

// Accepts a JSON object exported from DevPath and returns a clean roadmap, or throws.
export function importRoadmap(obj) {
  if (!obj || !Array.isArray(obj.topics)) throw new Error('This file is not a DevPath roadmap export.');
  const idMap = new Map();
  const topics = obj.topics.map((t) => {
    const id = uid();
    idMap.set(t.id, id);
    return {
      id,
      title: String(t.title || 'Topic').slice(0, 60),
      x: Number(t.x) || 0,
      y: Number(t.y) || 0,
      problems: (Array.isArray(t.problems) ? t.problems : [])
        .filter((p) => Number.isInteger(p.contestId) && typeof p.index === 'string')
        .map((p) => ({
          contestId: p.contestId,
          index: p.index.toUpperCase(),
          name: String(p.name || `Problem ${p.contestId}${p.index}`),
          rating: Number(p.rating) || 0,
        })),
    };
  });
  const links = (Array.isArray(obj.links) ? obj.links : [])
    .filter((l) => idMap.has(l.source) && idMap.has(l.target))
    .map((l) => ({ id: uid(), source: idMap.get(l.source), target: idMap.get(l.target) }));
  const rm = {
    id: uid(),
    title: String(obj.title || 'Imported roadmap').slice(0, 80),
    description: String(obj.description || '').slice(0, 240),
    author: String(obj.author || 'unknown'),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    topics,
    links,
  };
  saveRoadmap(rm);
  return rm;
}

export function exportRoadmap(rm) {
  const { id, createdAt, updatedAt, ...rest } = rm;
  return { format: 'devpath-roadmap', version: 1, id, ...rest };
}

// ---- Codeforces progress (one handle per browser) ----
export function getProgress() {
  return read(PROG_KEY, null);
}

export function setProgress(p) {
  write(PROG_KEY, p);
}
