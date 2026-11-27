// The canon .md files (a global list in the extension settings) and what is read out of them.
// Pure: every function works on the array it is given.

import { newId } from './st.js';

const HINT_RE = /^[ \t]*NEXT_FILE_HINT[ \t]*[:：][ \t]*(.+?)[ \t]*$/im;

/** Adds a file, or replaces the text of the file with the same name. */
export function addFile(files, name, text) {
    const clean = String(name || '').trim() || `canon_${files.length + 1}.md`;
    const existing = files.find(f => f.name === clean);
    if (existing) {
        existing.text = String(text ?? '');
        existing.updatedAt = Date.now();
        return { file: existing, replaced: true };
    }
    const file = { id: newId(), name: clean, text: String(text ?? ''), addedAt: Date.now(), updatedAt: Date.now() };
    files.push(file);
    return { file, replaced: false };
}

export function removeFile(files, id) {
    const i = files.findIndex(f => f.id === id);
    if (i < 0) return false;
    files.splice(i, 1);
    return true;
}

export function moveFile(files, id, delta) {
    const i = files.findIndex(f => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= files.length) return false;
    [files[i], files[j]] = [files[j], files[i]];
    return true;
}

export function isHintLine(line) {
    return HINT_RE.test(String(line ?? ''));
}

/**
 * The file's lines as they are stored (newlines normalised) and which of them bodyText keeps:
 * `kept` holds their indices in `raw`, in order — every line but the NEXT_FILE_HINT line(s), the
 * blank lines at the top, and the blank / --- lines at the end.
 */
export function keptLines(text) {
    const raw = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const kept = [];
    raw.forEach((l, i) => { if (!HINT_RE.test(l)) kept.push(i); });
    while (kept.length && /^\s*(-{3,}|)\s*$/.test(raw[kept[kept.length - 1]])) kept.pop();
    while (kept.length && !raw[kept[0]].trim()) kept.shift();
    return { raw, kept };
}

/** The md without its NEXT_FILE_HINT line and the --- lines left around it at the end. */
export function bodyText(text) {
    const { raw, kept } = keptLines(text);
    return kept.map(i => raw[i]).join('\n').trim();
}

const DATE_SRC = '(\\d{4})\\s*(?:[-./]\\s*(\\d{1,2})\\s*[-./]\\s*(\\d{1,2})|년\\s*(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일?)';

function toCanonDate(m) {
    const y = Number(m[1]);
    const mo = Number(m[2] ?? m[4]);
    const d = Number(m[3] ?? m[5]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** "1996-05-12", "1996/05/12", "1996.5.3", "1996년 5월 3일" (anything may follow) → "1996-05-12"; else null. */
export function canonDate(str) {
    const m = String(str ?? '').match(new RegExp(DATE_SRC));
    return m ? toCanonDate(m) : null;
}

/**
 * A date as a number that orders like the calendar (year, month, day → 19900618), read with the
 * same parser as everything else; NaN when the text holds no valid date. For "is this date on or
 * after that one" — NaN compares false either way.
 */
export function dateNumber(str) {
    const d = canonDate(str);
    if (!d) return NaN;
    const [y, mo, day] = d.split('-').map(Number);
    return y * 10000 + mo * 100 + day;
}

/** Every valid date in the text, in order, in the same canonical form ("a ~ b" gives both ends). */
export function datesIn(str) {
    const out = [];
    for (const m of String(str ?? '').matchAll(new RegExp(DATE_SRC, 'g'))) {
        const d = toCanonDate(m);
        if (d) out.push(d);
    }
    return out;
}

/** { raw, from, to } from the file's NEXT_FILE_HINT line ("a ~ b" is a range), or null. */
export function parseHint(text) {
    const m = String(text ?? '').match(HINT_RE);
    if (!m) return null;
    const raw = m[1].trim();
    const parts = raw.split(/\s*[~〜]\s*/);
    const from = canonDate(parts[0]);
    const to = parts.length > 1 ? canonDate(parts[1]) : from;
    return { raw, from, to: to || from };
}
