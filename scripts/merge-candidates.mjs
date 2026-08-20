#!/usr/bin/env node
/**
 * Merges 6 candidate CSV files into one output for Supabase import.
 * Usage:  node scripts/merge-candidates.mjs
 * Output: C:/dev/data/candidates-merged.csv
 *         C:/dev/data/unmatched_records.csv
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const DATA_DIR         = 'C:/dev/data';
const OUTPUT_MERGED    = resolve(DATA_DIR, 'candidates-merged.csv');
const OUTPUT_UNMATCHED = resolve(DATA_DIR, 'unmatched_records.csv');

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  const raw = readFileSync(filePath, 'utf8').replace(/^﻿/, '');
  let i = 0;
  function parseField() {
    if (raw[i] === '"') {
      i++; let val = '';
      while (i < raw.length) {
        if (raw[i] === '"' && raw[i + 1] === '"') { val += '"'; i += 2; }
        else if (raw[i] === '"') { i++; break; }
        else { val += raw[i++]; }
      }
      return val;
    }
    let val = '';
    while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '\r') val += raw[i++];
    return val;
  }
  function parseRow() {
    const fields = [];
    while (i < raw.length && raw[i] !== '\n' && raw[i] !== '\r') { fields.push(parseField()); if (raw[i] === ',') i++; }
    while (i < raw.length && (raw[i] === '\r' || raw[i] === '\n')) i++;
    return fields;
  }
  const headers = parseRow().map(h => h.trim());
  const rows = [];
  while (i < raw.length) {
    if (raw[i] === '\r' || raw[i] === '\n') { i++; continue; }
    const fields = parseRow();
    if (fields.every(f => !f.trim())) continue;
    const obj = {}; headers.forEach((h, idx) => { obj[h] = (fields[idx] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

// ─── Levenshtein ──────────────────────────────────────────────────────────────

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      curr[j] = a[i - 1] === b[j - 1] ? prev[j - 1] : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    prev = curr;
  }
  return prev[n];
}

function lvRatio(a, b) {
  if (!a && !b) return 1; if (!a || !b) return 0;
  return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// ─── Nickname Groups ──────────────────────────────────────────────────────────

const RAW_GROUPS = [
  ['richard', 'rick', 'rich', 'dick', 'ricky'],
  ['robert', 'rob', 'bob', 'bobby', 'robby'],
  ['william', 'bill', 'will', 'willy', 'billy', 'liam'],
  ['james', 'jim', 'jimmy', 'jamie'],
  ['thomas', 'tom', 'tommy'],
  ['michael', 'mike', 'mikey', 'mick', 'mickey'],
  ['christopher', 'chris', 'kris', 'christian'],
  ['david', 'dave', 'davy'],
  ['joseph', 'joe', 'joey'],
  ['daniel', 'dan', 'danny'],
  ['matthew', 'matt', 'matty'],
  ['steven', 'stephen', 'steve', 'stevie', 'steph'],
  ['andrew', 'andy', 'drew'],
  ['benjamin', 'ben', 'benny', 'benji', 'benedict'],
  ['edward', 'ed', 'eddie', 'ted', 'ned'],
  ['frederick', 'fred', 'freddie', 'fredrick'],
  ['gregory', 'greg'],
  ['jeffrey', 'jeff'],
  ['gerald', 'jerry', 'gerry', 'jerome'],
  ['kenneth', 'ken', 'kenny'],
  ['lawrence', 'larry', 'lars'],
  ['leonard', 'len', 'lenny', 'leo'],
  ['nathaniel', 'nathan', 'nate', 'nat'],
  ['nicholas', 'nick', 'nicky', 'nic', 'nicolas'],
  ['patrick', 'pat', 'paddy'],
  ['peter', 'pete'],
  ['phillip', 'philip', 'phil'],
  ['raymond', 'ray', 'ramon'],
  ['ronald', 'ron', 'ronny', 'ronnie'],
  ['samuel', 'sam', 'sammy'],
  ['timothy', 'tim', 'timmy'],
  ['anthony', 'tony', 'ant'],
  ['vincent', 'vince'],
  ['walter', 'walt', 'wally'],
  ['zachary', 'zach', 'zak', 'zack', 'zachariah'],
  ['albert', 'al', 'bert', 'albie'],
  ['alfred', 'al', 'fred', 'alfie'],
  ['arthur', 'art'],
  ['bradley', 'brad'],
  ['charles', 'charlie', 'chuck', 'chas', 'carl'],
  ['clinton', 'clint'],
  ['curtis', 'curt'],
  ['donald', 'don', 'donny'],
  ['douglas', 'doug'],
  ['dennis', 'denny', 'den'],
  ['harold', 'hal', 'harry'],
  ['henry', 'hank', 'harry'],
  ['jacob', 'jake'],
  ['john', 'jack', 'johnny', 'jon'],
  ['jonathan', 'jon', 'jonny'],
  ['joshua', 'josh'],
  ['lewis', 'lew', 'lou', 'louis'],
  ['melvin', 'mel'],
  ['norman', 'norm'],
  ['randall', 'randy', 'rand'],
  ['rodney', 'rod'],
  ['russell', 'russ', 'rusty'],
  ['stanley', 'stan'],
  ['theodore', 'ted', 'theo'],
  ['victor', 'vic'],
  ['wesley', 'wes'],
  ['alexander', 'alex', 'al', 'xander', 'alec'],
  ['bartholomew', 'bart'],
  ['calvin', 'cal'],
  ['ezekiel', 'zeke', 'ez'],
  ['francis', 'frank', 'fran', 'francisco'],
  ['franklin', 'frank'],
  ['gabriel', 'gabe'],
  ['martin', 'marty', 'martyn'],
  ['mitchell', 'mitch'],
  ['reginald', 'reggie', 'reg'],
  ['terrence', 'terry', 'terence'],
  ['sean', 'shawn', 'shaun'],
  ['eugene', 'gene'],
  ['marcus', 'mark'],
  ['elijah', 'eli'],
  ['isaiah', 'ike', 'izzy'],
  ['lucas', 'luke'],
  ['oliver', 'ollie', 'oli'],
  ['trevor', 'trev'],
  ['tyrone', 'ty'],
  ['tyler', 'ty'],
  ['spencer', 'spence'],
  ['corey', 'cory'],
  ['warren', 'ward'],
];

// Build Map: name → Set of all equivalent names (groups may overlap/merge)
const nameToGroup = new Map();
for (const group of RAW_GROUPS) {
  const merged = new Set(group);
  // Merge with any existing groups that share a name
  for (const name of group) {
    const existing = nameToGroup.get(name);
    if (existing) existing.forEach(n => merged.add(n));
  }
  for (const name of merged) nameToGroup.set(name, merged);
}

function getVariants(name) {
  return nameToGroup.get(name) ?? new Set([name]);
}

// ─── Name Parsing ─────────────────────────────────────────────────────────────

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v', 'junior', 'senior']);

function norm(s) { return (s ?? '').toLowerCase().replace(/[^a-z]/g, ''); }

// "Abbott, Jeremy David" → { normLast: 'abbott', normFirst: 'jeremy' }
function parseLastFirst(str) {
  if (!str) return null;
  const c = str.indexOf(',');
  if (c === -1) return null;
  return { normLast: norm(str.slice(0, c)), normFirst: norm(str.slice(c + 1).trim().split(/\s+/)[0]) };
}

// "Gary Quintrall Jr." → [{ normFirst:'gary', normLast:'quintrall' }, ...]
// Returns multiple parse candidates to handle:
//  1) Suffix tokens (Jr., Sr.)
//  2) OCR space in compound last name ("Fleu rmont" → "Fleurmont")
function parseFirstLastCandidates(str) {
  if (!str) return [];
  let tokens = str.trim().split(/\s+/).filter(Boolean);

  // Strip trailing suffixes
  while (tokens.length > 2 && SUFFIXES.has(norm(tokens[tokens.length - 1]))) {
    tokens = tokens.slice(0, -1);
  }
  if (tokens.length < 2) return [];

  const candidates = [];

  // Primary: first token = first, last token = last
  candidates.push({ normFirst: norm(tokens[0]), normLast: norm(tokens[tokens.length - 1]) });

  // OCR fallback: for 3+ tokens, also try last two tokens concatenated as the last name
  if (tokens.length >= 3) {
    candidates.push({
      normFirst: norm(tokens[0]),
      normLast: norm(tokens[tokens.length - 2]) + norm(tokens[tokens.length - 1]),
    });
    // And try second token as first name (handles "Full Middle Last" where Middle is the used name)
    candidates.push({ normFirst: norm(tokens[1]), normLast: norm(tokens[tokens.length - 1]) });
  }

  return candidates;
}

// ─── File 1 Index ─────────────────────────────────────────────────────────────

function buildIndex(file1) {
  const byLast  = new Map(); // normLast → [entry]
  const byExact = new Map(); // normLast_normFirst → entry

  for (let idx = 0; idx < file1.length; idx++) {
    const row    = file1[idx];
    const parsed = parseLastFirst(row['Last, First']);
    if (!parsed) continue;
    const { normLast, normFirst } = parsed;
    const entry = { idx, normLast, normFirst, row };
    byExact.set(`${normLast}_${normFirst}`, entry);
    if (!byLast.has(normLast)) byLast.set(normLast, []);
    byLast.get(normLast).push(entry);
  }
  return { byLast, byExact };
}

// ─── Matching ─────────────────────────────────────────────────────────────────

const THRESHOLD = 0.85;
const CONF_RANK = { exact: 3, nickname: 2, fuzzy: 1 };

function firstMatch(qFirst, eFirst) {
  if (qFirst === eFirst) return 'exact';
  const qv = getVariants(qFirst), ev = getVariants(eFirst);
  for (const q of qv) for (const e of ev) { if (q === e) return 'nickname'; }
  let best = 0;
  for (const q of qv) for (const e of ev) { const r = lvRatio(q, e); if (r > best) best = r; }
  return best >= THRESHOLD ? 'fuzzy' : null;
}

// candidates: array of { normFirst, normLast } — multiple parse attempts for same source row
function findMatch(candidates, index) {
  let bestResult = null;

  for (const { normFirst, normLast } of candidates) {
    // Pass 1: exact last name
    for (const entry of (index.byLast.get(normLast) ?? [])) {
      const fc = firstMatch(normFirst, entry.normFirst);
      if (!fc) continue;
      if (!bestResult || CONF_RANK[fc] > CONF_RANK[bestResult.confidence]) {
        bestResult = { entry, confidence: fc };
      }
      if (bestResult.confidence === 'exact') return bestResult;
    }
  }

  // Pass 2: fuzzy last name (only if no exact-last match)
  if (!bestResult) {
    for (const { normFirst, normLast } of candidates) {
      for (const [, entries] of index.byLast) {
        for (const entry of entries) {
          if (lvRatio(normLast, entry.normLast) < THRESHOLD) continue;
          const fc = firstMatch(normFirst, entry.normFirst);
          if (!fc) continue;
          if (!bestResult) bestResult = { entry, confidence: 'fuzzy' };
        }
      }
    }
  }

  return bestResult;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function cleanOcr(text) {
  if (!text) return '';
  return text
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;])/g, '$1')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\.{2,}/g, '.')
    .replace(/,\s*,/g, ',')
    .trim();
}

function append(existing, value, sep = ', ') {
  const e = (existing ?? '').trim(), v = (value ?? '').trim();
  if (!v) return e; if (!e) return v;
  return `${e}${sep}${v}`;
}

// Return the lower-confidence of two confidence values (worst case for flagging)
function worstConf(a, b) {
  if (!a && !b) return '';
  if (!a) return b; if (!b) return a;
  return CONF_RANK[a] <= CONF_RANK[b] ? a : b;
}

function escapeField(val) {
  const str = val === null || val === undefined ? '' : String(val);
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function writeCSV(path, rows, columns) {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(columns.map(col => escapeField(row[col] ?? '')).join(','));
  writeFileSync(path, lines.join('\n'), 'utf8');
  console.log(`  Wrote ${rows.length} rows → ${path}`);
}

// ─── Parse All Files ──────────────────────────────────────────────────────────

console.log('Parsing files...');
const file1 = parseCSV(resolve(DATA_DIR, '2026 Elders Data1.csv'));
const file2 = parseCSV(resolve(DATA_DIR, '2026 Elders Data2.csv'));
const file3 = parseCSV(resolve(DATA_DIR, '2026 Elders Data3.csv'));
const file4 = parseCSV(resolve(DATA_DIR, '2026 Elders Data4.csv'));
const file5 = parseCSV(resolve(DATA_DIR, '2026 Elders Data5.csv'));
const file6 = parseCSV(resolve(DATA_DIR, '2026 Elders Data6.csv'));

// Deduplicate File 1 by exact "Last, First" string — identical rows appear for some people
const file1Seen = new Set();
const file1Raw = file1;
const file1Deduped = file1Raw.filter(row => {
  const key = row['Last, First'];
  if (file1Seen.has(key)) return false;
  file1Seen.add(key);
  return true;
});
const dupCount = file1Raw.length - file1Deduped.length;
if (dupCount > 0) console.log(`  Removed ${dupCount} duplicate rows from File 1`);

// Use deduped list everywhere
const file1Arr = file1Deduped;

console.log(`  File 1 (base):             ${file1Arr.length} rows (${file1Raw.length} before dedup)`);
console.log(`  File 2 (circuit/enroll):   ${file2.length} rows`);
console.log(`  File 3 (roles → cur_resp): ${file3.length} rows`);
console.log(`  File 4 (roles → comments): ${file4.length} rows`);
console.log(`  File 5 (co_comments):      ${file5.length} rows`);
console.log(`  File 6 (regional exp):     ${file6.length} rows`);

const index = buildIndex(file1Arr);

// ─── Precompute File 5 Matches ────────────────────────────────────────────────

console.log('\nMatching File 5...');

// Track previously unmatched (old exact-key method) for preview
function oldNormFirstLast(str) {
  if (!str) return '';
  const t = str.trim().split(/\s+/).filter(Boolean);
  if (t.length < 2) return norm(t[0] ?? '');
  return norm(t[t.length - 1]) + '_' + norm(t[0]);
}
const oldFile1Keys = new Set(file1Arr.map(r => {
  const p = parseLastFirst(r['Last, First']);
  return p ? `${p.normLast}_${p.normFirst}` : '';
}));
const previouslyUnmatched5 = file5.filter(r => !oldFile1Keys.has(oldNormFirstLast(r['Name'])));

// file5Map: idx (File 1 row index) → { coComments, confidence }
const file5Map = new Map();
const file5Unmatched = [];
let f5Exact = 0, f5Nickname = 0, f5Fuzzy = 0;

// Aggregate File 5 rows per person first (same name may appear multiple times)
const file5Grouped = new Map(); // nameKey → { coComments, candidates }
for (const row of file5) {
  const candidates = parseFirstLastCandidates(row['Name']);
  if (!candidates.length) continue;
  const key = candidates[0].normLast + '_' + candidates[0].normFirst;
  if (!file5Grouped.has(key)) file5Grouped.set(key, { coComments: '', candidates });
  const g = file5Grouped.get(key);
  g.coComments = append(g.coComments, cleanOcr(row['Comments']), '. ');
}

for (const [, { coComments, candidates }] of file5Grouped) {
  const result = findMatch(candidates, index);
  if (result) {
    const existing = file5Map.get(result.entry.idx);
    if (!existing || CONF_RANK[result.confidence] > CONF_RANK[existing.confidence]) {
      file5Map.set(result.entry.idx, { coComments, confidence: result.confidence });
    }
    if (result.confidence === 'exact')    f5Exact++;
    else if (result.confidence === 'nickname') f5Nickname++;
    else                                  f5Fuzzy++;
  } else {
    file5Unmatched.push({ candidates, coComments });
  }
}

console.log(`  Exact: ${f5Exact}  Nickname: ${f5Nickname}  Fuzzy: ${f5Fuzzy}  Unmatched: ${file5Unmatched.length}`);

// ─── Precompute File 6 Matches ────────────────────────────────────────────────

console.log('\nMatching File 6...');

// file6Map: File 1 idx → { row, confidence }
const file6Map = new Map();
const file6NewRows = []; // rows that had no match → become new candidates
let f6Exact = 0, f6Nickname = 0, f6Fuzzy = 0;

for (const row of file6) {
  const parsed = parseLastFirst(row['Last Name, First Name']);
  if (!parsed) continue;
  const candidates = [parsed];

  const result = findMatch(candidates, index);
  if (result) {
    // Only keep the best match per File 1 record
    const existing = file6Map.get(result.entry.idx);
    if (!existing || CONF_RANK[result.confidence] > CONF_RANK[existing.confidence]) {
      file6Map.set(result.entry.idx, { row, confidence: result.confidence });
    }
    if (result.confidence === 'exact')         f6Exact++;
    else if (result.confidence === 'nickname') f6Nickname++;
    else                                       f6Fuzzy++;
  } else {
    file6NewRows.push(row);
  }
}

console.log(`  Exact: ${f6Exact}  Nickname: ${f6Nickname}  Fuzzy: ${f6Fuzzy}`);
console.log(`  Unmatched (will be added as new rows): ${file6NewRows.length}`);

// ─── Preview: Newly Matched File 5 Records ────────────────────────────────────

console.log('\n── File 5 improvements (sample of previously unmatched that now match) ──');
let previewCount = 0;
for (const row of previouslyUnmatched5) {
  const candidates = parseFirstLastCandidates(row['Name']);
  if (!candidates.length) continue;
  const key = candidates[0].normLast + '_' + candidates[0].normFirst;
  const grouped = file5Grouped.get(key);
  if (!grouped) continue;
  const result = findMatch(grouped.candidates, index);
  if (!result) continue;
  const f1Name = result.entry.row['Last, First'];
  console.log(`  "${row['Name']}"  →  "${f1Name}"  [${result.confidence}]`);
  if (++previewCount >= 20) { console.log('  ... (showing first 20)'); break; }
}
if (previewCount === 0) console.log('  (none — all previously unmatched remain unmatched)');

// ─── Build File 2/3/4 Lookup Maps (exact, File 1 takes precedence) ────────────

const file1KeySet = new Set(file1Arr.map(r => {
  const p = parseLastFirst(r['Last, First']); return p ? `${p.normLast}_${p.normFirst}` : '';
}));

// File 2: exact key → row
const map2 = new Map();
for (const row of file2) {
  const p = parseLastFirst(row['Last, First']); if (!p) continue;
  const key = `${p.normLast}_${p.normFirst}`;
  if (file1KeySet.has(key)) map2.set(key, row);
}

// File 3: aggregate roles per person
const raw3 = new Map();
for (const row of file3) {
  const p = parseLastFirst(row['Last, First']); if (!p || !row['Role']) continue;
  const key = `${p.normLast}_${p.normFirst}`;
  raw3.set(key, append(raw3.get(key) ?? '', row['Role']));
}
const map3 = new Map();
for (const [key, roles] of raw3) { if (file1KeySet.has(key)) map3.set(key, roles); }

// File 4: aggregate roles per person
const raw4 = new Map();
for (const row of file4) {
  const p = parseLastFirst(row['Last, First']); if (!p || !row['Role']) continue;
  const key = `${p.normLast}_${p.normFirst}`;
  raw4.set(key, append(raw4.get(key) ?? '', row['Role']));
}
const map4 = new Map();
for (const [key, roles] of raw4) { if (file1KeySet.has(key)) map4.set(key, roles); }

// ─── Unmatched Rows from Files 2/3/4/5 ───────────────────────────────────────

const unmatched = [];

for (const row of file2) {
  const p = parseLastFirst(row['Last, First']); if (!p) continue;
  if (!file1KeySet.has(`${p.normLast}_${p.normFirst}`))
    unmatched.push({ source_file: 'File2', match_key: `${p.normLast}_${p.normFirst}`, ...row });
}
for (const [key, rows] of (new Map(
  [...(new Map(file3.map(r => {
    const p = parseLastFirst(r['Last, First']);
    return p ? [`${p.normLast}_${p.normFirst}`, r] : ['', r];
  })))].filter(([k]) => k && !file1KeySet.has(k))
))) {
  unmatched.push({ source_file: 'File3', match_key: key, 'Last, First': rows['Last, First'], Role: rows['Role'] });
}
// Simpler File 3 unmatched collection
const file3Unmatched = new Map();
for (const row of file3) {
  const p = parseLastFirst(row['Last, First']); if (!p) continue;
  const key = `${p.normLast}_${p.normFirst}`;
  if (!file1KeySet.has(key)) {
    file3Unmatched.set(key, append(file3Unmatched.get(key) ?? '', row['Role']));
    if (!file3Unmatched.has(key + '__name')) file3Unmatched.set(key + '__name', row['Last, First']);
  }
}

const file4Unmatched = new Map();
for (const row of file4) {
  const p = parseLastFirst(row['Last, First']); if (!p) continue;
  const key = `${p.normLast}_${p.normFirst}`;
  if (!file1KeySet.has(key)) {
    file4Unmatched.set(key, append(file4Unmatched.get(key) ?? '', row['Role']));
    if (!file4Unmatched.has(key + '__name')) file4Unmatched.set(key + '__name', row['Last, First']);
  }
}

// Rebuild clean unmatched array
const unmatchedClean = [];
for (const row of file2) {
  const p = parseLastFirst(row['Last, First']); if (!p) continue;
  const key = `${p.normLast}_${p.normFirst}`;
  if (!file1KeySet.has(key)) unmatchedClean.push({ source_file: 'File2', match_key: key, 'Last, First': row['Last, First'], Enrollment: row['Enrollment'], Circuit: row['Circuit'], Language: row['Language'] });
}
for (const [key, roles] of file3Unmatched) {
  if (key.endsWith('__name')) continue;
  unmatchedClean.push({ source_file: 'File3', match_key: key, 'Last, First': file3Unmatched.get(key + '__name') ?? '', Role: roles });
}
for (const [key, roles] of file4Unmatched) {
  if (key.endsWith('__name')) continue;
  unmatchedClean.push({ source_file: 'File4', match_key: key, 'Last, First': file4Unmatched.get(key + '__name') ?? '', Role: roles });
}
for (const { candidates, coComments } of file5Unmatched) {
  unmatchedClean.push({ source_file: 'File5', match_key: candidates[0]?.normLast + '_' + candidates[0]?.normFirst, Name: '', Comments: coComments });
}

// ─── Main Merge Loop ──────────────────────────────────────────────────────────

console.log('\nMerging...');
let m2 = 0, m3 = 0, m4 = 0;

const merged = file1Arr.map((row, idx) => {
  const p = parseLastFirst(row['Last, First']);
  const exactKey = p ? `${p.normLast}_${p.normFirst}` : '';

  const record = {
    full_name:                row['Last, First'] ?? '',
    congregation:             row['Congregation'] ?? '',
    age:                      row['Age']          ?? '',
    location:                 row['Location']     ?? '',
    current_responsibilities: '',
    circuit_responsibilities: '',
    experience:               '',
    comments:                 '',
    co_comments:              '',
    match_confidence:         '',
    source:                   '',
  };

  // File 2: Enrollment → current_responsibilities, Circuit → circuit, Language → comments
  const r2 = map2.get(exactKey);
  if (r2) {
    m2++;
    if (r2['Enrollment']) record.current_responsibilities = r2['Enrollment'];
    if (r2['Circuit'])    record.circuit_responsibilities = r2['Circuit'];
    if (r2['Language'])   record.comments                = r2['Language'];
  }

  // File 3: aggregated roles → append to current_responsibilities
  const roles3 = map3.get(exactKey);
  if (roles3) { m3++; record.current_responsibilities = append(record.current_responsibilities, roles3); }

  // File 4: aggregated roles → append to comments
  const roles4 = map4.get(exactKey);
  if (roles4) { m4++; record.comments = append(record.comments, roles4); }

  // File 5: co_comments (fuzzy matched)
  const f5 = file5Map.get(idx);
  if (f5) {
    record.co_comments       = f5.coComments;
    record.match_confidence  = worstConf(record.match_confidence || null, f5.confidence);
  }

  // File 6: Regional Experience → experience, Comments → comments (fuzzy matched)
  const f6 = file6Map.get(idx);
  if (f6) {
    if (f6.row['Regional Experience']) record.experience = f6.row['Regional Experience'];
    if (f6.row['Comments'])            record.comments   = append(record.comments, f6.row['Comments'], '. ');
    record.match_confidence = worstConf(record.match_confidence || null, f6.confidence);
  }

  return record;
});

// ─── Append File 6 Unmatched as New Candidate Rows ───────────────────────────

for (const row of file6NewRows) {
  merged.push({
    full_name:                row['Last Name, First Name'] ?? '',
    congregation:             row['Congregation']          ?? '',
    age:                      row['Age']                   ?? '',
    location:                 '',
    current_responsibilities: 'RCVdata',
    circuit_responsibilities: '',
    experience:               row['Regional Experience']   ?? '',
    comments:                 row['Comments']              ?? '',
    co_comments:              '',
    match_confidence:         '',
    source:                   'file6_unmatched',
  });
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const n = file1Arr.length;
const pct = (x, d = n) => `${x}/${d} (${Math.round(x / d * 100)}%)`;

console.log('\nMatch rates (against File 1):');
console.log(`  File 2: ${pct(m2)}`);
console.log(`  File 3: ${pct(m3)}`);
console.log(`  File 4: ${pct(m4)}`);
console.log(`  File 5: exact=${f5Exact}  nickname=${f5Nickname}  fuzzy=${f5Fuzzy}  unmatched=${file5Unmatched.length}  (total matched: ${pct(f5Exact + f5Nickname + f5Fuzzy)})`);
console.log(`  File 6: exact=${f6Exact}  nickname=${f6Nickname}  fuzzy=${f6Fuzzy}  new_rows=${file6NewRows.length}  (total matched: ${pct(f6Exact + f6Nickname + f6Fuzzy)})`);

const fuzzyRows = merged.filter(r => r.match_confidence === 'fuzzy').length;
const nicknameRows = merged.filter(r => r.match_confidence === 'nickname').length;
console.log(`\nRows needing review in output:`);
console.log(`  match_confidence="fuzzy":    ${fuzzyRows}`);
console.log(`  match_confidence="nickname": ${nicknameRows}`);
console.log(`  source="file6_unmatched":    ${file6NewRows.length}`);
console.log(`  Total output rows:           ${merged.length}`);

// ─── Write Outputs ────────────────────────────────────────────────────────────

console.log('\nWriting output files...');

const MERGED_COLS = [
  'full_name', 'congregation', 'age', 'location',
  'current_responsibilities', 'circuit_responsibilities',
  'experience', 'comments', 'co_comments',
  'match_confidence', 'source',
];

writeCSV(OUTPUT_MERGED, merged, MERGED_COLS);

const UNMATCHED_COLS = [
  'source_file', 'match_key',
  'Last, First', 'Last Name, First Name', 'Name',
  'Enrollment', 'Circuit', 'Language',
  'Role', 'Regional Experience', 'Comments',
];

writeCSV(OUTPUT_UNMATCHED, unmatchedClean, UNMATCHED_COLS);
