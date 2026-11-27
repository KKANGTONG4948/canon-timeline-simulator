// The story's current date, for the NEXT_FILE_HINT notice only. A date never completes or
// switches anything.

import { canonDate, parseHint } from './files.js';
import { currentFile } from './state.js';

const DATE_TAG = /<date>([^<]{0,64})<\/date>/gi;

/**
 * Newest date in the last 300 assistant messages: a <date>…</date> tag first, else a short
 * status-bar-like line (bracketed, or with ·|/ separators) that holds a date with a year.
 * @returns {{ date: string, at: number, source: 'tag'|'status' } | null}
 */
export function storyDate(chat) {
    if (!Array.isArray(chat)) return null;
    for (let i = chat.length - 1; i >= 0 && i > chat.length - 301; i--) {
        const msg = chat[i];
        if (!msg || msg.is_user) continue;
        const text = String(msg.mes ?? '');
        let last = null;
        DATE_TAG.lastIndex = 0;
        for (const m of text.matchAll(DATE_TAG)) { const d = canonDate(m[1]); if (d) last = d; }
        if (last) return { date: last, at: i, source: 'tag' };
        for (const line of text.split('\n')) {
            const t = line.trim();
            if (!t || t.length > 220) continue;
            const barLike = /^[[【〔「『〈(（]/.test(t) || /[·•|｜∙]/.test(t) || /^[\s>*_\-•·|]*(?:[\p{Extended_Pictographic}️]+\s*)?[^:：\n]{1,14}[:：]/u.test(t);
            if (!barLike) continue;
            const d = canonDate(t);
            if (d) return { date: d, at: i, source: 'status' };
        }
    }
    return null;
}

/** { file, hint, today, due } for the notice, or null without a current file. */
export function hintState(cm, files, chat) {
    const file = cm ? currentFile(cm, files) : null;
    if (!file) return null;
    const hint = parseHint(file.text);
    if (!hint?.from) return { file, hint, today: null, due: false };
    const today = storyDate(chat);
    return { file, hint, today, due: !!today && today.date >= hint.from };
}
