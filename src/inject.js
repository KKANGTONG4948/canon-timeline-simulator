// What goes into the generation prompt, on two keys with their own position and depth:
//
//   <canon_baseline>  [FILE HEADER]           the checked file's text before its first Beat
//                     [PAST CANON EVENTS]     what the original says happened in the Beats before
//                                             this window (omitted in the first window, and
//                                             altogether when the user switched it off)
//                     [CURRENT CANON WINDOW]  the original text of this window's Beats
//   <canon_progress>  the canon progress record (Canon Episodes / Chapters / Saga)
//
// planned() is the single source: applyInjection() sends its strings to SillyTavern and the
// panel shows the very same strings, so what the user reads is what the model gets.

import { ctx, esc, POSITIONS, ROLES, POSITION_LABELS } from './st.js';
import { getPrompt } from './prompts.js';
import { currentFile } from './state.js';
import { rangeLabel } from './memory.js';
import { parseCached, beatWindow } from './beats.js';
import { pastBefore, pendingPast } from './past.js';

export const PROMPT_KEY_MD = 'canon_timeline_simulator_md';
export const PROMPT_KEY_MEM = 'canon_timeline_simulator_memory';
export const HEADER_LABEL = '[FILE HEADER]';
export const PAST_LABEL = '[PAST CANON EVENTS]';
export const WINDOW_LABEL = '[CURRENT CANON WINDOW]';

/**
 * The <canon_baseline> block. A file with Beats: header, past events (when there are any), the
 * current window. A file without Beats: the whole file, as before.
 */
export function mdText(settings, file, win, past = null) {
    if (!win) return '';
    const body = win.total
        ? [
            win.header ? `${HEADER_LABEL}\n${win.header}` : '',
            past?.text?.trim() ? `${PAST_LABEL}\n${getPrompt(settings, 'pastHeader')}\n\n${past.text.trim()}` : '',
            `${WINDOW_LABEL}\n\n${win.body}`,
        ].filter(Boolean).join('\n\n')
        : win.body;
    if (!body) return '';
    const beats = win.total ? ` beats="${esc(win.firstId)}~${esc(win.lastId)}"` : '';
    return [`<canon_baseline file="${esc(file.name)}"${beats}>`, getPrompt(settings, 'mdHeader', { file: file.name }), '', body, '</canon_baseline>'].join('\n');
}

function timelineText(cm) {
    return cm.timeline
        .map(n => `### ${n.tier === 'chapter' ? 'Canon Chapter' : 'Canon Episode'}: ${n.title} (${n.fileName ? `${n.fileName}; ` : ''}${rangeLabel(n.from, n.to)}${n.when ? `; in-story: ${n.when}` : ''})\n${n.text}`)
        .join('\n\n');
}

export function memoryText(settings, cm) {
    if (!cm) return '';
    const sections = [];
    if (cm.saga?.text?.trim()) sections.push(`[The original so far]\n${cm.saga.text.trim()}`);
    if (cm.timeline.length) sections.push(`[Canon progress, oldest to newest]\n${timelineText(cm)}`);
    if (!sections.length) return '';
    return ['<canon_progress>', getPrompt(settings, 'memHeader'), '', sections.join('\n\n'), '</canon_progress>'].join('\n');
}

/**
 * Everything about what is injected now:
 *   md, mem  — the two strings (empty when nothing is injected)
 *   file     — the checked file
 *   win      — the Beat window `md` holds (beats.js)
 *   past     — the past-events snapshot `md` holds, or null (first window, or none recorded yet)
 *   pending  — what moving to the next window would have to record first, or null
 *
 * With past events switched off (settings.pastEnabled false) both are null: the section is not
 * injected and a window move owes nothing. The stored records are not read and not changed, so
 * switching it on again shows them as they were.
 */
export function planned(settings, cm, files) {
    const none = { md: '', mem: '', file: null, win: null, past: null, pending: null };
    if (!settings?.enabled || !cm?.on) return none;
    const file = currentFile(cm, files);
    if (!file) return { ...none, mem: memoryText(settings, cm) };
    const parsed = parseCached(file);
    const win = beatWindow(parsed, cm.beatWindowIndex, settings.beatWindowSize);
    const usePast = settings.pastEnabled !== false && !!win.total;
    const past = usePast ? pastBefore(cm, file.id, parsed.beats, win.start) : null;
    const pending = usePast && win.index < win.count - 1 ? pendingPast(cm, file.id, parsed, win) : null;
    return { md: mdText(settings, file, win, past), mem: memoryText(settings, cm), file, win, past, pending };
}

export function whereLabel(position, depth) {
    return position === 'in_chat' ? `채팅 안 깊이 ${depth}` : (POSITION_LABELS[position] || position);
}

export function applyInjection(settings, cm, files) {
    const { setExtensionPrompt } = ctx();
    const plan = planned(settings, cm, files);
    const put = (key, text, position, depth) => setExtensionPrompt(key, text, text ? (POSITIONS[position] ?? POSITIONS.in_chat) : POSITIONS.in_chat, text ? Math.max(0, Number(depth) || 0) : 0, false, ROLES.system);
    put(PROMPT_KEY_MD, plan.md, settings.mdPosition, settings.mdDepth);
    put(PROMPT_KEY_MEM, plan.mem, settings.memPosition, settings.memDepth);
    return plan;
}
