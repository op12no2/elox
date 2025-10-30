#!/usr/bin/env node
// src/flatten.js
// Read dat/ and dat/ratings, build columns+rows (as before), then merge into src/template.htm
// and write ./index.htm

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const DAT_DIR = path.join(ROOT, 'dat');
const RATINGS_DIR = path.join(DAT_DIR, 'ratings');
const TEMPLATE_PATH = path.join(ROOT, 'src', 'template.htm');
const OUT_PATH = path.join(ROOT, 'index.htm');

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { console.error(`Failed to parse ${p}: ${e.message}`); process.exit(1); }
}

function ensureDir(p) { if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) { console.error(`Missing dir: ${p}`); process.exit(1); } }

ensureDir(DAT_DIR);
ensureDir(RATINGS_DIR);
if (!fs.existsSync(TEMPLATE_PATH)) { console.error(`Missing template: ${TEMPLATE_PATH}`); process.exit(1); }

const enginesArr = readJSON(path.join(DAT_DIR, 'engines.json'));
const sourcesArr = readJSON(path.join(DAT_DIR, 'sources.json'));
const evalArr = readJSON(path.join(DAT_DIR, 'eval.json'));
const searchArr = readJSON(path.join(DAT_DIR, 'search.json'));

const enginesById = new Map(enginesArr.map(e => [e.id, e]));
const sourcesById = new Map(sourcesArr.map(s => [s.id, s]));
const evalLabelById = new Map(evalArr.map(e => [e.id, e.label ?? e.name ?? e.id]));
const searchLabelById = new Map(searchArr.map(s => [s.id, s.label ?? s.name ?? s.id]));

// read ratings files
const ratingFiles = fs.readdirSync(RATINGS_DIR).filter(f => f.toLowerCase().endsWith('.json'));
const rowsMap = new Map();

for (const fname of ratingFiles) {
  const filePath = path.join(RATINGS_DIR, fname);
  let sourceId = path.basename(fname, '.json');
  if (!sourcesById.has(sourceId)) {
    const lower = sourceId.toLowerCase();
    const match = [...sourcesById.keys()].find(k => k.toLowerCase() === lower);
    if (match) sourceId = match;
  }
  if (!sourcesById.has(sourceId)) console.warn(`Warning: source ${sourceId} (from ${fname}) not in sources.json`);

  const list = readJSON(filePath);
  if (!Array.isArray(list)) { console.warn(`Skipping ${filePath}: not an array`); continue; }

  for (const entry of list) {
    const engineId = entry['engine-id'];
    const build = entry['build'];
    const elo = entry['elo'];
    const date = entry['date'] ?? null;
    if (!engineId || !build) { console.warn(`Skipping invalid rating in ${filePath}: ${JSON.stringify(entry)}`); continue; }
    const key = `${engineId}||${build}`;
    if (!rowsMap.has(key)) rowsMap.set(key, { engineId, build, ratings: new Map() });
    const row = rowsMap.get(key);
    const existing = row.ratings.get(sourceId);
    if (!existing) row.ratings.set(sourceId, { elo, date });
    else {
      const ed = existing.date ? Date.parse(existing.date) : null;
      const nd = date ? Date.parse(date) : null;
      if (nd && (!ed || nd > ed)) row.ratings.set(sourceId, { elo, date });
      else if (!ed && !nd) row.ratings.set(sourceId, { elo, date });
    }
  }
}

// build rows array
const rows = [];
for (const [key, meta] of rowsMap.entries()) {
  const { engineId, build, ratings } = meta;
  const em = enginesById.get(engineId) || {};
  const rowObj = {
    'engine-id': engineId,
    engine: em.label ?? em.name ?? engineId,
    build,
    country: em.country ?? '',
    language: em.language ?? '',
    eval: evalLabelById.get(em['eval-id']) ?? em['eval-id'] ?? '',
    search: searchLabelById.get(em['search-id']) ?? em['search-id'] ?? ''
  };
  for (const [sid] of sourcesById.entries()) {
    rowObj[sid] = ratings.has(sid) ? ratings.get(sid).elo : null;
  }
  for (const [sid, r] of ratings.entries()) if (!rowObj.hasOwnProperty(sid)) rowObj[sid] = r ? r.elo : null;
  rows.push(rowObj);
}
rows.sort((a,b)=> (a.engine||'').localeCompare(b.engine||'') || (a.build||'').localeCompare(b.build||''));

// build columns
const columns = [];
columns.push({ field: 'engine', title: 'Engine', headerFilter: 'input' });
columns.push({ field: 'build', title: 'Build', headerFilter: 'input' });
columns.push({ field: 'country', title: 'Nat', headerFilter: 'input' });
columns.push({ field: 'language', title: 'Lang', headerFilter: 'input' });
columns.push({ field: 'eval', title: 'Eval', headerFilter: 'input' });
columns.push({ field: 'search', title: 'Search', headerFilter: 'input' });
for (const s of sourcesArr) {
  columns.push({ field: s.id, title: s.label ?? s.name ?? s.id, hozAlign: 'right', sorter: 'number', headerFilter: 'input' });
}
const extra = new Set();
for (const r of rows) for (const k of Object.keys(r)) if (!['engine-id','engine','build','country','language','eval','search'].includes(k) && !sourcesById.has(k)) extra.add(k);
for (const e of [...extra].sort()) columns.push({ field: e, title: e, hozAlign: 'right', sorter: 'number', headerFilter: 'input' });

const out = { columns, rows };

// read template and replace marker
let tmpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const marker = '<!-- DATA -->';
if (!tmpl.includes(marker)) { console.error('Template missing marker "<!-- DATA -->"'); process.exit(1); }

const insert = `<script>window.__TABLE_DATA__ = ${JSON.stringify(out, null, 2)};</script>`;
const result = tmpl.replace(marker, insert);

fs.writeFileSync(OUT_PATH, result, 'utf8');
console.log(`Wrote ${OUT_PATH} (${rows.length} rows, ${columns.length} columns)`);

