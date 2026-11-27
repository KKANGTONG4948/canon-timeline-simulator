// [PAST CANON EVENTS]: what the original says happened in the Beats that have left the prompt.
//
// When the user moves to the next Beat window, the window being left is reduced to a short list
// of objective events of the original and appended to the record. Only two things go to the
// model for this: the record so far and the original text of those Beats. The chat is never
// sent — this is the original's history, not the state of the role-play; feelings, relationships
// and whatever the story changed stay with the chat and its own memory.
//
// Stored per chat and per file as cumulative snapshots:
//   cm.pastEvents[fileId] = [{ count, lastId, text, at }]
// `count` Beats from the start of the file are covered by `text`; `lastId` is the id of the last
// of them, so a snapshot that no longer matches the file (edited md) is simply ignored.
// The window that starts at Beat N is injected with the snapshot whose count is N (or the
// nearest one before it), so going back a window shows the record as it was at that point.

import { esc } from './st.js';
import { getPrompt, scriptLanguage } from './prompts.js';
import { callModel, summaryCall, extractTag, cleanOutput, looksRefused, RefusedError } from './model.js';
import { beatsText } from './beats.js';

/** This file's snapshots that still match its Beats, smallest count first. */
export function snapshots(cm, fileId, beats) {
    const list = cm?.pastEvents?.[fileId];
    if (!Array.isArray(list)) return [];
    return list
        .filter(s => s && Number.isInteger(s.count) && s.count > 0 && s.count <= beats.length
            && typeof s.text === 'string' && s.text.trim() && beats[s.count - 1].id === s.lastId)
        .sort((a, b) => a.count - b.count);
}

/** The record to show before the Beat at index `start`: the largest snapshot with count ≤ start. */
export function pastBefore(cm, fileId, beats, start) {
    let best = null;
    for (const s of snapshots(cm, fileId, beats)) if (s.count <= start) best = s;
    return best;
}

/**
 * Stores a snapshot (replacing one with the same count). `dropLater` also removes the snapshots
 * that cover more Beats: they were built on the text being replaced.
 */
export function putPast(cm, fileId, snap, { dropLater = false } = {}) {
    if (!cm.pastEvents || typeof cm.pastEvents !== 'object' || Array.isArray(cm.pastEvents)) cm.pastEvents = {};
    const list = (Array.isArray(cm.pastEvents[fileId]) ? cm.pastEvents[fileId] : [])
        .filter(s => s && s.count !== snap.count && !(dropLater && s.count > snap.count));
    list.push(snap);
    list.sort((a, b) => a.count - b.count);
    cm.pastEvents[fileId] = list;
}

/**
 * The job that produces the snapshot covering the first `to` Beats: start from the best snapshot
 * before it and read the Beats in between (normally exactly one window; more when a window was
 * passed without a record).
 */
export function pastTask(cm, fileId, parsed, to) {
    const base = pastBefore(cm, fileId, parsed.beats, to - 1);
    const from = base ? base.count : 0;
    return { from, to, firstId: parsed.beats[from].id, lastId: parsed.beats[to - 1].id, baseText: base?.text || '', script: beatsText(parsed, from, to) };
}

/** What [다음 N Beat] must record before leaving this window; null when its record already exists. */
export function pendingPast(cm, fileId, parsed, win) {
    if (!win?.total || win.end <= 0) return null;
    if (snapshots(cm, fileId, parsed.beats).some(s => s.count === win.end)) return null;
    return pastTask(cm, fileId, parsed, win.end);
}

// ---- text

/** Lines of a list of events, without their bullet or number. */
export function eventLines(text) {
    return String(text ?? '').split('\n')
        .map(l => l.trim().replace(/^(?:[-*•·]|\d+[.)])\s+/, '').trim())
        .filter(l => l && !/^<\/?[a-z_]+>$/i.test(l));
}

const lineKey = (l) => l.replace(/\s+/g, ' ').replace(/[.。]+$/, '').trim();

/**
 * The record with the new events added at the end. The record so far is kept exactly as it is
 * (the model never rewrites it); a line it already has is not added again.
 */
export function mergeEvents(baseText, lines) {
    const base = String(baseText ?? '').trim();
    const have = new Set(eventLines(base).map(lineKey));
    const fresh = [];
    for (const l of lines) {
        const key = lineKey(l);
        if (!key || have.has(key)) continue;
        have.add(key);
        fresh.push(`- ${l}`);
    }
    return [base, ...fresh].filter(Boolean).join('\n');
}

// ---- model

const FORMAT = `<past_canon_events>
- <one event>
- <one event>
</past_canon_events>`;

/** The record so far and the original text of the Beats — nothing from the chat. */
export function pastUserPrompt(task) {
    return [
        `<existing_past_canon_events>\n${task.baseText.trim() || '(none yet)'}\n</existing_past_canon_events>`,
        `<canon_beats beats="${esc(task.firstId)}~${esc(task.lastId)}">\n${task.script}\n</canon_beats>`,
        'Write the <past_canon_events> block now: only the objective events of these Beats that the existing record does not already contain.',
    ].join('\n\n');
}

/** One model call → the updated cumulative record, or a thrown error (nothing stored). */
export async function makePastEvents(settings, task) {
    const system = `${getPrompt(settings, 'pastEvents', { language: scriptLanguage(settings) })}\n\nReply with exactly this block and nothing else:\n${FORMAT}`;
    const user = pastUserPrompt(task);
    const opts = summaryCall(settings, { expectTag: 'past_canon_events' });
    let lines = null;
    for (let attempt = 0; attempt < 2 && !lines; attempt++) {
        const reminder = attempt > 0 ? '\n\nIMPORTANT: your previous reply could not be parsed. Output only the <past_canon_events> block, one event per line starting with "- ".' : '';
        const out = await callModel(system, user + reminder, opts);
        let block = extractTag(out, 'past_canon_events');
        if (block === null && attempt > 0) {
            const fallback = cleanOutput(out).trim();
            if (looksRefused(fallback)) throw new RefusedError(`모델이 지난 원작 사건 정리를 거절했어요: "${fallback.slice(0, 80)}"`);
            if (/^\s*[-*•]\s+\S/m.test(fallback)) block = fallback.split('\n').filter(l => /^\s*[-*•]\s+\S/.test(l)).join('\n');
        }
        // An empty block is a valid answer ("nothing new") only when there is a record to keep.
        const got = block === null ? null : eventLines(block);
        if (got && (got.length || task.baseText.trim())) lines = got;
    }
    if (!lines) throw new Error('지난 원작 사건 정리 응답을 해석하지 못했습니다.');
    return mergeEvents(task.baseText, lines);
}
