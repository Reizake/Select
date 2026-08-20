#!/usr/bin/env node
/**
 * Deduplicates contactemail.csv (keeping most-recent convention row per person),
 * splits emails into personal_email vs jwpub_email by domain,
 * fuzzy-matches names against the candidates table (full_name = "Last, First M."),
 * and outputs:
 *   - matched.sql   — UPDATE statements ready to run in Supabase SQL Editor
 *   - review.csv    — fuzzy/nickname matches to eyeball before applying
 *   - unmatched.csv — rows that fell below threshold; handle manually
 *
 * Usage:
 *   node scripts/import-contact-emails.mjs
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in environment
 * (or a .env.local file in the project root — script loads it manually).
 *
 * Input CSV expected at: C:/dev/data/contactemail.csv
 * Outputs written to:    C:/dev/data/
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const DATA_DIR        = 'C:/dev/data';
const INPUT_CSV       = resolve(DATA_DIR, 'contactemail.csv');
const OUTPUT_SQL      = resolve(DATA_DIR, 'matched.sql');
const OUTPUT_REVIEW   = resolve(DATA_DIR, 'review.csv');
const OUTPUT_UNMATCHED = resolve(DATA_DIR, 'unmatched.csv');

// Only emit UPDATE for matches at or above this ratio.
// 0.85 = good balance; lower → more matches but more false positives.
const MATCH_THRESHOLD = 0.85;

// Load .env.local if present (project root, two levels up from scripts/)
const envPath = resolve(__dirname, '..', '.env.local');
if (existsSync(envPath)) {
  const envLines = readFileSync(envPath, 'utf8').split('\n');
  for (const line of envLines) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────

function parseCSV(filePath) {
  const raw = readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
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
    while (i < raw.length && raw[i] !== '\n' && raw[i] !== '\r') {
      fields.push(parseField());
      if (raw[i] === ',') i++;
    }
    while (i < raw.length && (raw[i] === '\r' || raw[i] === '\n')) i++;
    return fields;
  }
  const headers = parseRow().map(h => h.trim());
  const rows = [];
  while (i < raw.length) {
    if (raw[i] === '\r' || raw[i] === '\n') { i++; continue; }
    const fields = parseRow();
    if (fields.every(f => !f.trim())) continue;
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (fields[idx] ?? '').trim(); });
    rows.push(obj);
  }
  return rows;
}

// ─── CSV Writer ───────────────────────────────────────────────────────────────

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

// ─── Fuzzy Matching ───────────────────────────────────────────────────────────

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

// ─── Nickname Map (same as merge-candidates.mjs) ─────────────────────────────

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
  ['benjamin', 'ben', 'benny', 'benji'],
  ['edward', 'ed', 'eddie', 'ted', 'ned'],
  ['gregory', 'greg'],
  ['jeffrey', 'jeff'],
  ['gerald', 'jerry', 'gerry'],
  ['kenneth', 'ken', 'kenny'],
  ['nathaniel', 'nathan', 'nate'],
  ['nicholas', 'nick', 'nicky', 'nic'],
  ['patrick', 'pat', 'paddy'],
  ['peter', 'pete'],
  ['phillip', 'philip', 'phil'],
  ['raymond', 'ray'],
  ['ronald', 'ron', 'ronny'],
  ['samuel', 'sam', 'sammy'],
  ['timothy', 'tim', 'timmy'],
  ['anthony', 'tony', 'ant'],
  ['vincent', 'vince'],
  ['zachary', 'zach', 'zak', 'zack'],
  ['charles', 'charlie', 'chuck', 'carl'],
  ['donald', 'don', 'donny'],
  ['douglas', 'doug'],
  ['harold', 'hal', 'harry'],
  ['jacob', 'jake'],
  ['john', 'jack', 'johnny', 'jon'],
  ['jonathan', 'jon', 'jonny'],
  ['joshua', 'josh'],
  ['alexander', 'alex', 'al', 'alec'],
  ['gabriel', 'gabe'],
  ['mitchell', 'mitch'],
  ['sean', 'shawn', 'shaun'],
  ['eugene', 'gene'],
  ['elijah', 'eli'],
  ['lucas', 'luke'],
  ['oliver', 'ollie'],
  ['tyler', 'ty'],
  ['corey', 'cory'],
  ['calvin', 'cal'],
  ['francis', 'frank', 'fran'],
  ['franklin', 'frank'],
  ['trevor', 'trev'],
  ['terrence', 'terry'],
  ['reginald', 'reggie'],
  ['bradley', 'brad'],
  ['clinton', 'clint'],
  ['randall', 'randy'],
  ['russell', 'russ'],
  ['stanley', 'stan'],
  ['theodore', 'ted', 'theo'],
  ['walter', 'walt'],
  ['warren', 'ward'],
  ['leonard', 'len', 'leo'],
  ['marcus', 'mark'],
];

const nameToGroup = new Map();
for (const group of RAW_GROUPS) {
  const merged = new Set(group);
  for (const name of group) {
    const existing = nameToGroup.get(name);
    if (existing) existing.forEach(n => merged.add(n));
  }
  for (const name of merged) nameToGroup.set(name, merged);
}

function getVariants(name) {
  return nameToGroup.get(name) ?? new Set([name]);
}

// ─── Name Normalization ───────────────────────────────────────────────────────

function norm(s) { return (s ?? '').toLowerCase().replace(/[^a-z]/g, ''); }

// Parse "Smith, John M." → { normLast: 'smith', normFirst: 'john' }
function parseDBName(str) {
  const c = str.indexOf(',');
  if (c === -1) return null;
  const last  = norm(str.slice(0, c));
  const first = norm(str.slice(c + 1).trim().split(/\s+/)[0]);
  return { normLast: last, normFirst: first };
}

// ─── Match Quality ────────────────────────────────────────────────────────────

const CONF_RANK = { exact: 3, nickname: 2, fuzzy: 1 };

function firstMatch(qFirst, eFirst) {
  if (qFirst === eFirst) return 'exact';
  const qv = getVariants(qFirst), ev = getVariants(eFirst);
  for (const q of qv) for (const e of ev) { if (q === e) return 'nickname'; }
  let best = 0;
  for (const q of qv) for (const e of ev) { const r = lvRatio(q, e); if (r > best) best = r; }
  return best >= MATCH_THRESHOLD ? 'fuzzy' : null;
}

// ─── Fetch Candidates from Supabase ──────────────────────────────────────────

async function fetchCandidates() {
  console.log('Fetching candidates from Supabase...');
  const PAGE = 1000;
  let all = [];
  let from = 0;

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/candidates?select=id,full_name&order=full_name&limit=${PAGE}&offset=${from}`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'count=none',
        },
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Supabase error ${res.status}: ${body}`);
    }
    const page = await res.json();
    all = all.concat(page);
    if (page.length < PAGE) break;
    from += PAGE;
  }

  console.log(`  Fetched ${all.length} candidates`);
  return all;
}

// ─── Build Candidate Index ────────────────────────────────────────────────────

function buildIndex(candidates) {
  const byLast  = new Map(); // normLast → [{ id, normLast, normFirst, full_name }]
  const byExact = new Map(); // normLast_normFirst → entry

  for (const c of candidates) {
    const parsed = parseDBName(c.full_name);
    if (!parsed) continue;
    const { normLast, normFirst } = parsed;
    const entry = { id: c.id, normLast, normFirst, full_name: c.full_name };
    byExact.set(`${normLast}_${normFirst}`, entry);
    if (!byLast.has(normLast)) byLast.set(normLast, []);
    byLast.get(normLast).push(entry);
  }
  return { byLast, byExact };
}

// ─── Find Best Match ──────────────────────────────────────────────────────────

function findMatch(normFirst, normLast, index) {
  let best = null;

  // Pass 1: exact last name
  for (const entry of (index.byLast.get(normLast) ?? [])) {
    const fc = firstMatch(normFirst, entry.normFirst);
    if (!fc) continue;
    if (!best || CONF_RANK[fc] > CONF_RANK[best.confidence]) {
      best = { entry, confidence: fc, lastRatio: 1.0 };
    }
    if (best.confidence === 'exact') return best;
  }

  // Pass 2: fuzzy last name (only if no exact-last match found)
  if (!best) {
    for (const [, entries] of index.byLast) {
      for (const entry of entries) {
        const lr = lvRatio(normLast, entry.normLast);
        if (lr < MATCH_THRESHOLD) continue;
        const fc = firstMatch(normFirst, entry.normFirst);
        if (!fc) continue;
        if (!best || lr > best.lastRatio) {
          best = { entry, confidence: 'fuzzy', lastRatio: lr };
        }
      }
    }
  }

  return best;
}

// ─── Deduplicate CSV (keep most-recent convention row per person) ─────────────

function deduplicate(rows) {
  // Per person (last+first), collect all rows and keep the one with latest date.
  // If same person has both jwpub.org and personal email, we want to keep BOTH —
  // so we aggregate: one personal_email, one jwpub_email (latest date per type).
  const byPerson = new Map();

  for (const row of rows) {
    const key = norm(row.last_name) + '_' + norm(row.first_name);
    const date = new Date(row.convention_date);
    const isJwpub = (row.email ?? '').toLowerCase().endsWith('@jwpub.org');

    if (!byPerson.has(key)) {
      byPerson.set(key, {
        last_name:      row.last_name,
        first_name:     row.first_name,
        personal_email: null,
        personal_date:  null,
        jwpub_email:    null,
        jwpub_date:     null,
      });
    }

    const p = byPerson.get(key);
    if (isJwpub) {
      if (!p.jwpub_date || date > p.jwpub_date) {
        p.jwpub_email = row.email;
        p.jwpub_date  = date;
      }
    } else {
      if (!p.personal_date || date > p.personal_date) {
        p.personal_email = row.email;
        p.personal_date  = date;
      }
    }
  }

  return [...byPerson.values()];
}

// ─── SQL Escaping ─────────────────────────────────────────────────────────────

function sqlStr(val) {
  if (!val) return 'NULL';
  return `'${val.replace(/'/g, "''")}'`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Reading CSV...');
  const raw = parseCSV(INPUT_CSV);
  console.log(`  ${raw.length} raw rows`);

  const deduped = deduplicate(raw);
  console.log(`  ${deduped.length} unique people after dedup`);

  const candidates = await fetchCandidates();
  const index = buildIndex(candidates);

  const matched   = [];
  const review    = [];
  const unmatched = [];

  console.log('\nMatching names...');

  for (const person of deduped) {
    const csvFirst = norm(person.first_name);
    const csvLast  = norm(person.last_name);

    const result = findMatch(csvFirst, csvLast, index);

    const row = {
      csv_name:       `${person.last_name}, ${person.first_name}`,
      personal_email: person.personal_email ?? '',
      jwpub_email:    person.jwpub_email ?? '',
      db_name:        result?.entry.full_name ?? '',
      candidate_id:   result?.entry.id ?? '',
      confidence:     result?.confidence ?? 'none',
    };

    if (!result) {
      unmatched.push(row);
    } else {
      matched.push(row);
      if (result.confidence !== 'exact') review.push(row);
    }
  }

  // Stats
  const exact    = matched.filter(r => r.confidence === 'exact').length;
  const nickname = matched.filter(r => r.confidence === 'nickname').length;
  const fuzzy    = matched.filter(r => r.confidence === 'fuzzy').length;

  console.log(`\nResults:`);
  console.log(`  Exact match:    ${exact}`);
  console.log(`  Nickname match: ${nickname}  → included in SQL + review.csv`);
  console.log(`  Fuzzy match:    ${fuzzy}   → included in SQL + review.csv`);
  console.log(`  Unmatched:      ${unmatched.length}  → unmatched.csv`);

  // ── Write matched.sql (all matches: exact + nickname + fuzzy) ──
  const sqlLines = [
    '-- Auto-generated by import-contact-emails.mjs',
    '-- All matches (exact + nickname + fuzzy) are included.',
    '-- review.csv contains only the nickname/fuzzy rows — spot-check before running.',
    '',
    '-- ── PREVIEW ──────────────────────────────────────────────────────────────',
    `SELECT id, full_name, personal_email, jwpub_email FROM candidates WHERE id IN (`,
    matched.map(r => `  '${r.candidate_id}'`).join(',\n'),
    ');',
    '',
    '-- ── UPDATE ───────────────────────────────────────────────────────────────',
    'UPDATE candidates AS c',
    'SET',
    '  personal_email = v.personal_email,',
    '  jwpub_email    = v.jwpub_email',
    'FROM (VALUES',
    matched.map(r =>
      `  (${sqlStr(r.candidate_id)}, ${sqlStr(r.personal_email || null)}, ${sqlStr(r.jwpub_email || null)})`
    ).join(',\n'),
    `) AS v(id, personal_email, jwpub_email)`,
    `WHERE c.id = v.id::uuid;`,
  ];

  writeFileSync(OUTPUT_SQL, sqlLines.join('\n'), 'utf8');
  console.log(`\n  Wrote ${matched.length} UPDATEs → ${OUTPUT_SQL}`);

  // ── Write review.csv (nickname + fuzzy only, for spot-checking) ──
  const REVIEW_COLS = ['confidence', 'csv_name', 'db_name', 'personal_email', 'jwpub_email', 'candidate_id'];
  writeCSV(OUTPUT_REVIEW, review, REVIEW_COLS);

  // ── Write unmatched.csv ──
  const UNMATCHED_COLS = ['csv_name', 'personal_email', 'jwpub_email'];
  writeCSV(OUTPUT_UNMATCHED, unmatched, UNMATCHED_COLS);

  console.log('\nDone.');
  console.log('  1. Skim review.csv to catch any bad fuzzy matches');
  console.log('  2. Remove bad rows from matched.sql if needed');
  console.log('  3. Run the PREVIEW SELECT in Supabase SQL Editor');
  console.log('  4. Run the UPDATE block');
  console.log('  5. Check unmatched.csv for anyone to add by hand');
}

main().catch(err => { console.error(err); process.exit(1); });
