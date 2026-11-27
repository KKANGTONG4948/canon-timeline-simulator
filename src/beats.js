// Canon Beats inside one .md file, and the window of them that is injected.
//
// A Beat starts at a heading whose first word is its id ("## B01 — 제목") and runs to the next
// such heading. Beats are cut into windows of N (default 20) in the order they appear in the
// file — never by their numbers — and only the current window goes to the model, together with
// the file's header (everything before the first Beat) and the short record of what happened
// in the windows before it (past.js). A file without Beat headings is one window holding the
// whole file, exactly as before.
// Pure: nothing here knows about SillyTavern or the chat.

import { bodyText, keptLines, isHintLine, datesIn } from './files.js';

export const DEFAULT_WINDOW = 20;

// "## B01 — 제목", "## B01: 제목", "### B12a - 제목", "## B03"
const BEAT_HEADING = /^#{1,4}[ \t]+(B\d+[A-Za-z]?)(?:[ \t]*[—–\-:：.]|[ \t]|$)/;
const ANY_HEADING = /^#{1,6}[ \t]+\S/;
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const BLOCK_OPEN = /^\[CANON_BEAT\][ \t]*$/;   // files that mark Beats with blocks only, no headings
const SEP = '\n\n---\n\n';

/**
 * Cuts the tail of a segment: trailing blank lines and horizontal rules are dropped, and
 * (takeHeadings) trailing headings — an episode marker like "# 2화" written just before the next
 * Beat — are returned as `lead` so they travel with the Beat they introduce.
 * Lines before `keep` are never cut (a Beat's own heading).
 */
function cutTail(lines, takeHeadings, keep = 0) {
    let end = lines.length;
    const lead = [];
    const leadAt = [];   // the line of each heading in `lead`
    while (end > keep) {
        const l = lines[end - 1].trim();
        if (!l || RULE.test(l)) { end--; continue; }
        if (takeHeadings && ANY_HEADING.test(l)) { lead.unshift(l); leadAt.unshift(end - 1); end--; continue; }
        break;
    }
    return { body: lines.slice(0, end).join('\n').trim(), lead, leadAt };
}

/**
 * One pass over a file's lines: its header and its Beats. `at` is the line where a Beat's part
 * of the file begins — the first heading that introduces it, or its own heading.
 * Null when the lines hold no Beat.
 */
function scan(lines) {
    const starts = [];
    lines.forEach((l, i) => { const m = l.match(BEAT_HEADING); if (m) starts.push({ line: i, id: m[1], own: 1 }); });
    if (!starts.length) lines.forEach((l, i) => { if (BLOCK_OPEN.test(l.trim())) starts.push({ line: i, id: '', own: 0 }); });
    if (!starts.length) return null;

    const head = cutTail(lines.slice(0, starts[0].line), true);
    let header = head.body;
    let lead = head.lead;
    let leadAt = head.leadAt;
    if (!header && lead.length) { header = lead.shift(); leadAt.shift(); }   // a file that opens with only its title: the title stays the header

    const beats = [];
    let section = '';
    for (let i = 0; i < starts.length; i++) {
        const last = i === starts.length - 1;
        const from = starts[i].line;
        const seg = lines.slice(from, last ? lines.length : starts[i + 1].line);
        const cut = cutTail(seg, !last, starts[i].own);
        const myLead = lead.join('\n');
        if (myLead) section = myLead;
        const id = starts[i].id || cut.body.match(/^[ \t]*id[ \t]*[:：][ \t]*(\S+)/im)?.[1] || `#${i + 1}`;
        beats.push({ id, lead: myLead, section, body: cut.body, at: leadAt.length ? leadAt[0] : from });
        lead = cut.lead;
        leadAt = cut.leadAt.map(n => n + from);
    }
    return { header, beats };
}

/**
 * @returns {{ header: string, beats: { id: string, lead: string, section: string, body: string }[] }}
 *   header  — the text before the first Beat (shared by every window)
 *   lead    — headings written right before this Beat (its episode / arc marker), or ''
 *   section — the latest such marker at or before this Beat (shown when a window starts mid-section)
 *   body    — the Beat itself: its heading through the line before the next Beat
 */
export function parseBeats(text) {
    const src = bodyText(text);
    const found = scan(src.split('\n'));
    if (!found) return { header: src, beats: [] };
    return { header: found.header, beats: found.beats.map(({ id, lead, section, body }) => ({ id, lead, section, body })) };
}

// ---- the same parts, as they are written in the stored file (for fixing them in place)
//
// What is injected is a cleaned copy (rules and hint lines dropped, Beats re-joined). To fix the
// file from the screen the user is shown the stored lines themselves, and exactly those lines are
// replaced — nothing else in the file is reformatted.

/** The stored lines and, per Beat, the stored line its part begins at (empty for a file without Beats). */
function layout(text) {
    const { raw, kept } = keptLines(text);
    // bodyText() is these kept lines, trimmed only at the two ends — the lines parseBeats reads.
    const found = scan(bodyText(text).split('\n'));
    return { raw, at: found ? found.beats.map(b => kept[b.at]) : [] };
}

const isTail = (l) => { const t = l.trim(); return !t || RULE.test(t) || isHintLine(l); };

/** Lines [from, to) without the blank lines at the top and the blank / --- / hint lines at the end. */
function part(raw, from, to) {
    while (to > from && isTail(raw[to - 1])) to--;
    while (from < to && !raw[from].trim()) from++;
    return from < to ? { from, to, text: raw.slice(from, to).join('\n') } : null;
}

/**
 * Beats [start, end) as the file has them, with the heading(s) that introduce the first of them:
 * the stored text a Beat window is injected from. A file without Beats: the whole file.
 * The separator after the last Beat (blank lines, ---, the NEXT_FILE_HINT line) is not part of it.
 * @returns {{ from: number, to: number, text: string } | null} stored lines [from, to); null when there is nothing there
 */
export function beatsSource(text, start, end) {
    const { raw, at } = layout(text);
    if (!at.length) return part(raw, 0, raw.length);
    if (!(Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end && end <= at.length)) return null;
    return part(raw, at[start], end < at.length ? at[end] : raw.length);
}

/** The file's header as the file has it — everything before the first Beat's part. Null when there is none (or no Beats). */
export function headerSource(text) {
    const { raw, at } = layout(text);
    return at.length ? part(raw, 0, at[0]) : null;
}

/** The stored text with the lines of `src` (from beatsSource / headerSource of this same text) replaced by `next`. */
export function replaceSource(text, src, next) {
    const raw = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const lines = String(next ?? '').replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n');
    return [...raw.slice(0, src.from), ...lines, ...raw.slice(src.to)].join('\n');
}

/** The date of one Beat: its "date:" line ([TIME] / [SCHEDULE]); a range gives its end. Null when it has none. */
export function beatDate(body) {
    for (const m of String(body ?? '').matchAll(/^[ \t]*date[ \t]*[:：][ \t]*(.+)$/gim)) {
        const found = datesIn(m[1]);
        if (found.length) return found[found.length - 1];
    }
    return null;
}

/**
 * The original text of Beats [from, to), each with the heading(s) that introduce it. A range
 * that starts in the middle of a section opens with that section's marker.
 */
export function beatsText(parsed, from, to) {
    return parsed.beats.slice(from, to).map((b, k) => {
        const lead = b.lead || (k === 0 ? b.section : '');
        return (lead ? `${lead}\n\n` : '') + b.body;
    }).join(SEP);
}

/**
 * The window at `index` (clamped): Beats [start, end) of the file.
 *   header — the file's shared header;  body — the original text of this window's Beats.
 * A file without Beats is one window: header '' and body = the whole file.
 * @returns {{ index: number, count: number, total: number, size: number, start: number, end: number, firstId: string, lastId: string, label: string, header: string, body: string, lastDate: string|null }}
 */
export function beatWindow(parsed, index, size = DEFAULT_WINDOW) {
    const total = parsed.beats.length;
    const sz = Math.max(1, Math.floor(Number(size)) || DEFAULT_WINDOW);
    if (!total) return { index: 0, count: 1, total: 0, size: sz, start: 0, end: 0, firstId: '', lastId: '', label: '파일 전체', header: '', body: parsed.header, lastDate: null };
    const count = Math.ceil(total / sz);
    const i = Math.min(Math.max(0, Math.floor(Number(index)) || 0), count - 1);
    const start = i * sz;
    const end = Math.min(total, start + sz);
    const firstId = parsed.beats[start].id;
    const lastId = parsed.beats[end - 1].id;
    return {
        index: i, count, total, size: sz, start, end, firstId, lastId,
        label: firstId === lastId ? firstId : `${firstId} ~ ${lastId}`,
        header: parsed.header,
        body: beatsText(parsed, start, end),
        lastDate: beatDate(parsed.beats[end - 1].body),
    };
}

// Parsing a large file on every render is wasteful; cache per file until its text changes.
const cache = new Map();
export function parseCached(file) {
    const key = `${file.updatedAt ?? ''}|${file.text?.length ?? 0}`;
    const hit = cache.get(file.id);
    if (hit && hit.key === key && hit.text === file.text) return hit.parsed;
    const parsed = parseBeats(file.text);
    cache.set(file.id, { key, text: file.text, parsed });
    return parsed;
}
