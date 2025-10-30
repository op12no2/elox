#!/usr/bin/env node
// src/flatten.js
// Reads dat/* and dat/ratings/*.json, generates Tabulator columns+rows,
// injects into src/template.htm (<!-- DATA -->), writes ./index.htm

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
function ensureDir(p) {
  if (!fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    console.error(`Missing dir: ${p}`); process.exit(1);
  }
}
// Minimal HTML escape for labels/titles/URLs inserted into anchors
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

ensureDir(DAT_DIR);
ensureDir(RATINGS_DIR);
if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error(`Missing template: ${TEMPLATE_PATH}`); process.exit(1);
}

// Load metadata
const enginesArr = readJSON(path.join(DAT_DIR, 'engines.json'));
const sourcesArr = readJSON(path.join(DAT_DIR, 'sources.json'));
const evalArr    = readJSON(path.join(DAT_DIR, 'eval.json'));
const searchArr  = readJSON(path.join(DAT_DIR, 'search.json'));

// Lookups
const enginesById     = new Map(enginesArr.map(e => [e.id, e]));
const sourcesById     = new Map(sourcesArr.map(s => [s.id, s]));
const evalLabelById   = new Map(evalArr.map(e => [e.id, e.label ?? e.name ?? e.id]));
const searchLabelById = new Map(searchArr.map(s => [s.id, s.label ?? s.name ?? s.id]));

// Gather ratings
const ratingFiles = fs.readdirSync(RATINGS_DIR).filter(f => f.toLowerCase().endsWith('.json'));

// rowsMap key => { engineId, build, ratings: Map(sourceId -> {elo,date}) }
const rowsMap = new Map();

for (const fname of ratingFiles) {
  const filePath = path.join(RATINGS_DIR, fname);
  let sourceId = path.basename(fname, '.json');

  // Try to map filename to a known source id case-insensitively
  if (!sourcesById.has(sourceId)) {
    const lower = sourceId.toLowerCase();
    const match = [...sourcesById.keys()].find(k => k.toLowerCase() === lower);
    if (match) sourceId = match;
  }
  if (!sourcesById.has(sourceId)) {
    console.warn(`Warning: source "${sourceId}" (from ${fname}) not in sources.json`);
  }

  const list = readJSON(filePath);
  if (!Array.isArray(list)) {
    console.warn(`Skipping ${filePath}: not a top-level array`); continue;
  }

  for (const entry of list) {
    const engineId = entry['engine-id'];
    const build    = entry['build'];
    const elo      = entry['elo'];
    const date     = entry['date'] ?? null;

    if (!engineId || !build) {
      console.warn(`Skipping rating with missing engine-id/build in ${filePath}: ${JSON.stringify(entry)}`);
      continue;
    }

    const key = `${engineId}||${build}`;
    if (!rowsMap.has(key)) rowsMap.set(key, { engineId, build, ratings: new Map() });

    const row = rowsMap.get(key);
    const existing = row.ratings.get(sourceId);
    if (!existing) {
      row.ratings.set(sourceId, { elo, date });
    } else {
      const ed = existing.date ? Date.parse(existing.date) : null;
      const nd = date ? Date.parse(date) : null;
      if (nd && (!ed || nd > ed)) row.ratings.set(sourceId, { elo, date });
      else if (!ed && !nd)        row.ratings.set(sourceId, { elo, date });
    }
  }
}

// Build rows for Tabulator
const rows = [];
for (const { engineId, build, ratings } of rowsMap.values()) {
  const em = enginesById.get(engineId) || {};
  const label      = em.label ?? em.name ?? engineId;
  const engineUrl  = em.url ?? '';
  const engineName = em.name ?? label;

  // Engine cell as hyperlink (or plain text if URL missing)
  const engineHtml = engineUrl
    ? `<a href="${escapeHtml(engineUrl)}" title="${escapeHtml(engineUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    : escapeHtml(label);

  const rowObj = {
    'engine-id': engineId,
    engine:   engineHtml, // HTML anchor rendered via formatter:'html'
    'engine-url': engineUrl, // keep raw URL as a hidden/aux field if needed later
    build,
    country:  em.country ?? '',
    language: em.language ?? '',
    eval:     evalLabelById.get(em['eval-id'])     ?? em['eval-id']     ?? '',
    search:   searchLabelById.get(em['search-id']) ?? em['search-id']   ?? ''
  };

  // Fill source columns (sparse matrix)
  for (const [sid] of sourcesById.entries()) {
    rowObj[sid] = ratings.has(sid) ? ratings.get(sid).elo : null;
  }
  // Include any extra source ids present in files but not in sources.json
  for (const [sid, r] of ratings.entries()) {
    if (!(sid in rowObj)) rowObj[sid] = r ? r.elo : null;
  }

  rows.push(rowObj);
}

// Stable output order
rows.sort((a, b) =>
  (a.engine || '').localeCompare(b.engine || '') ||
  (a.build  || '').localeCompare(b.build  || '')
);

// Build columns for Tabulator
const columns = [];
columns.push({ field: 'engine',   title: 'Engine',  headerFilter: 'input', formatter: 'html' });
columns.push({ field: 'build',    title: 'Build',   headerFilter: 'input' });
columns.push({ field: 'country',  title: 'Country', headerFilter: 'input' });
columns.push({ field: 'language', title: 'Lang',    headerFilter: 'input' });
columns.push({ field: 'eval',     title: 'Eval',    headerFilter: 'input' });
columns.push({ field: 'search',   title: 'Search',  headerFilter: 'input' });

//for (const s of sourcesArr) {
  //columns.push({
    //field: s.id,
    //title: s.label ?? s.name ?? s.id,
    //hozAlign: 'right',
    //sorter: 'number',
    //headerFilter: 'input'
  //});
//}

for (const s of sourcesArr) {
  const icon = "&#9432;"; // (info inside circle)
  const fid   = s.id;
  const label = s.label ?? s.name ?? fid;
  const url   = s.url ?? "";
  const tip   = s.overview || s.name || label;

  // Title HTML: left label + right “?” link (click stops sort)
  const titleHtml = url
    ? `<div class="hdr"><span class="hdr-text">${escapeHtml(label)}</span><a class="hdr-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Open ${escapeHtml(tip)}" onclick="event.stopPropagation();">${icon}</a></div>`
    : `<div class="hdr"><span class="hdr-text">${escapeHtml(label)}</span></div>`;

  columns.push({
    field: fid,
    title: titleHtml,          // HTML title
    hozAlign: 'right',
    sorter: 'number',
    headerFilter: 'input',
    headerSort: true           // keep sorting on header text
  });
}

// Any extra source fields discovered in rows but not in sources.json
const staticFields = new Set(['engine-id','engine','engine-url','build','country','language','eval','search']);
const extra = new Set();
for (const r of rows) {
  for (const k of Object.keys(r)) {
    if (!staticFields.has(k) && !sourcesById.has(k)) extra.add(k);
  }
}
for (const e of [...extra].sort()) {
  columns.push({ field: e, title: e, hozAlign: 'right', sorter: 'number', headerFilter: 'input' });
}

// Compose output payload
const out = { columns, rows };

// Inject into template and write index.htm
let tmpl = fs.readFileSync(TEMPLATE_PATH, 'utf8');
const marker = '<!-- DATA -->';
if (!tmpl.includes(marker)) {
  console.error('Template missing marker "<!-- DATA -->"'); process.exit(1);
}

const insert = `<script>window.__TABLE_DATA__ = ${JSON.stringify(out, null, 2)};</script>`;
const result = tmpl.replace(marker, insert);

fs.writeFileSync(OUT_PATH, result, 'utf8');
console.log(`Wrote ${OUT_PATH} (${rows.length} rows, ${columns.length} columns)`);

