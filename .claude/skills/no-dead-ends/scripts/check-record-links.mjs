// check-record-links.mjs
// Heuristic guard against dead ends: flags JSX/TSX/Vue/Svelte lines that
// render an entity's identifier without going through RecordLink / linkTo.
//
// Catches the two common shapes:
//   inline:  <td>{row.invoiceNumber}</td>
//   columns: { key: 'ticketNumber', render: (r) => r.ticketNumber }
//
// Reports two kinds of finding:
//   DEAD END  - identifier rendered with no link at all (rule NAV-01)
//   HAND URL  - linked, but with a hand-written URL instead of the registry (NAV-02)
//
// Accept a deliberate exception (e.g. a record's own id in its own header)
// with a trailing comment on the line:  // nav-ok: <reason>
//
// Usage:
//   node check-record-links.mjs [paths...]                       (default: client/src)
//   node check-record-links.mjs client/src --write-baseline .nav-baseline.json
//   node check-record-links.mjs client/src --baseline .nav-baseline.json
//
// Exit code: 0 = pass, 1 = findings.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

// Tuned to this project's domain. Add entities here as the app grows.
const ENTITIES = 'ticket|item|customer|client|project|employee|user|comment|audit|'
  + 'order|invoice|asset|vehicle|document|task|vendor|supplier';
const SUFFIX = '(?:Number|No|Code|Ref|Id)';

const INLINE = new RegExp(`\\.(?:(?:${ENTITIES})${SUFFIX})\\b`, 'i');
const COLUMN = new RegExp(
  `\\b(?:key|accessor|field|dataIndex)\\s*:\\s*['"\`](?:(?:${ENTITIES})${SUFFIX})['"\`]`, 'i');

const REGISTRY = /RecordLink|linkTo\(|<Ref\b|nav-ok:/;
const HAND_LINK = /<Link\b|<a\s[^>]*href=|\bhref=|navigate\(|router\.push\(/;
const IGNORE = /console\.|^\s*(\/\/|\*|\/\*)|^\s*import\s|value=\{|placeholder=|key=\{/;
const UI_FILE = /\.(jsx|tsx|vue|svelte)$/;
const LOOKAHEAD = 2; // column definitions often put the render/link on the next lines

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args.splice(i, 2)[1] : null;
};
const writeBaseline = flag('--write-baseline');
const baselineFile = flag('--baseline');
const roots = args.length ? args : ['client/src'];

const files = (p) => {
  if (!existsSync(p)) return [];
  if (statSync(p).isFile()) return UI_FILE.test(p) ? [p] : [];
  return readdirSync(p).flatMap((f) =>
    (f === 'node_modules' || f.startsWith('.') ? [] : files(join(p, f))));
};

export function scanFile(file) {
  const findings = [];
  const lines = readFileSync(file, 'utf8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (IGNORE.test(line)) continue;

    const isColumn = COLUMN.test(line);
    if (!isColumn && !(line.includes('{') && INLINE.test(line))) continue;

    // A multi-line column puts its render/link on the following lines; stop at
    // the line that closes it, so the NEXT column's link is not credited to it.
    let end = i;
    if (isColumn && !/}\s*,?\s*$/.test(line)) {
      while (end < i + LOOKAHEAD && end + 1 < lines.length) {
        end++;
        if (/}\s*,?\s*$/.test(lines[end])) break;
      }
    }

    const window = lines.slice(i, end + 1).join('\n');
    if (!REGISTRY.test(window)) {
      findings.push({
        kind: HAND_LINK.test(window) ? 'HAND URL' : 'DEAD END',
        file: relative(process.cwd(), file).replace(/\\/g, '/'),
        line: i + 1,
        text: line.trim().slice(0, 140),
      });
    }
    i = end; // do not report the same column's render line twice
  }

  return findings;
}

// Baseline keys are file + line text, so they survive lines moving up or down.
const keyOf = (f) => `${f.kind}|${f.file}|${f.text}`;
const all = roots.flatMap(files).flatMap(scanFile);

if (writeBaseline) {
  writeFileSync(writeBaseline, JSON.stringify(all.map(keyOf).sort(), null, 2) + '\n');
  console.log(`baseline written: ${all.length} known finding(s) -> ${writeBaseline}`);
  process.exit(0);
}

const known = baselineFile && existsSync(baselineFile)
  ? new Set(JSON.parse(readFileSync(baselineFile, 'utf8')))
  : new Set();
const fresh = all.filter((f) => !known.has(keyOf(f)));

for (const f of fresh) console.log(`${f.kind}  ${f.file}:${f.line}  ${f.text}`);

const dead = fresh.filter((f) => f.kind === 'DEAD END').length;
const hand = fresh.length - dead;
const baselineNote = known.size ? ` (${all.length - fresh.length} known finding(s) in baseline)` : '';

console.log(fresh.length
  ? `\n${dead} dead end(s), ${hand} hand-written URL(s)${baselineNote}\n`
    + 'Fix: render identifiers with <RecordLink type id> / linkTo(); '
    + 'mark real exceptions "// nav-ok: <reason>".'
  : `check-record-links: PASS${baselineNote}`);

process.exit(fresh.length ? 1 : 0);
