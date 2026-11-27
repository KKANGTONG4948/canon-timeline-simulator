// The canon progress record: a Canon Episode when a file is retired, Canon Episodes folded into
// Canon Chapters, Canon Chapters folded into the Canon Saga. Only three sources ever go to the
// model: the current md, the chat of that stretch, and the earlier canon record.

import { ctx, esc, estTokens, newId } from './st.js';
import { bodyText, canonDate } from './files.js';
import { getPrompt } from './prompts.js';
import { callModel, summaryCall, extractTag, parseNodeBlock, looksRefused, cleanOutput, RefusedError } from './model.js';

export const SAGA_OWNER = 'canon_saga';

export function rangeLabel(from, to) {
    if (from < 0) return 'earlier messages';
    return from === to ? `message #${from}` : `messages #${from}-#${to}`;
}

// ---- transcript

/** Story messages only: no system/comment messages, except narrator messages and messages another
 *  memory extension hid after summarizing them (they are still what happened). */
function isStoryMessage(msg) {
    if (!msg || !String(msg.mes ?? '').trim()) return false;
    if (msg.extra?.type === 'comment') return false;
    if (!msg.is_system) return true;
    return msg.extra?.type === 'narrator' || !!msg.extra?.lm_hidden;
}

/** Drops reasoning and HTML; keeps a status <date> tag as plain text, since dates matter here. */
function stripText(text) {
    return String(text ?? '')
        .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
        .replace(/<date>([^<]{0,64})<\/date>/gi, '(date: $1)')
        .replace(/<[^>]{1,200}>/g, ' ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

export function messageLine(msg, index) {
    const { name1, name2 } = ctx();
    const name = msg.name || (msg.is_user ? name1 : name2) || (msg.is_user ? 'User' : 'Character');
    return `[#${index}] ${name}: ${stripText(msg.mes)}`;
}

/**
 * Lines of messages from..to (inclusive). Over the token cap the OLDEST lines are dropped and
 * `dropped` says how many; nothing replaces them (no other memory is consulted).
 */
export function transcript(chat, from, to, cap) {
    const lines = [];
    const indices = [];
    for (let i = Math.max(0, from); i <= Math.min((chat?.length ?? 0) - 1, to); i++) {
        const msg = chat[i];
        if (!isStoryMessage(msg)) continue;
        lines.push(messageLine(msg, i));
        indices.push(i);
    }
    const limit = Math.max(1000, Number(cap) || 24000);
    let tokens = lines.reduce((n, l) => n + estTokens(l), 0);
    let dropped = 0;
    while (lines.length > 1 && tokens > limit) {
        tokens -= estTokens(lines.shift());
        indices.shift();
        dropped++;
    }
    return { lines, indices, dropped };
}

/** "1996-05-10 ~ 1996-05-12" from the <date> tags in the range, or ''. */
export function dateSpan(chat, indices) {
    const dates = [];
    for (const i of indices || []) {
        for (const m of String(chat?.[i]?.mes ?? '').matchAll(/<date>([^<]{0,64})<\/date>/gi)) {
            const d = canonDate(m[1]);
            if (d) dates.push(d);
        }
    }
    if (!dates.length) return '';
    const a = dates[0];
    const b = dates[dates.length - 1];
    return a === b ? a : `${a} ~ ${b}`;
}

// ---- canon episode

function systemPrompt(task, format) {
    return `${task}\n\nReply with exactly this block and nothing else:\n${format}`;
}

export function episodeUserPrompt(settings, cm, file, chat, from, to) {
    const parts = [];
    parts.push(`<canon_script file="${esc(file.name)}">\nHow this stretch goes in the original work: the baseline world line. It is not a record of this story; where the sources below conflict with it they win, and where they are silent it stands.\n${bodyText(file.text) || '(empty)'}\n</canon_script>`);
    const before = [];
    if (cm.saga?.text?.trim()) before.push(cm.saga.text.trim());
    const recent = cm.timeline.slice(-2).map(n => `### ${n.title}\n${n.text}`).join('\n\n');
    if (recent) before.push(recent);
    if (before.length) parts.push(`<canon_so_far>\n${before.join('\n\n')}\n</canon_so_far>`);
    const { lines, dropped } = transcript(chat, from, to, settings.transcriptTokens);
    parts.push(`<transcript messages="#${from}-#${to}">\n${dropped ? `(${dropped} earlier messages of this stretch omitted for length)\n` : ''}${lines.join('\n\n') || '(no story messages in this range)'}\n</transcript>`);
    parts.push('Write the <canon_episode> block for this stretch now. Where the transcript or the earlier notes conflict with the script, they win; where they are silent, the original progression stands.');
    return { text: parts.join('\n\n'), dropped };
}

const EPISODE_FORMAT = `<canon_episode>
title: <short title, at most 10 words>
keywords: <5-12 comma-separated recall cues: names, places, original events>
summary:
<the bullet points>
</canon_episode>`;

/** One model call → a Canon Episode node, or a thrown error (nothing stored). */
export async function makeEpisode(settings, cm, file, chat, from, to) {
    const { text: user, dropped } = episodeUserPrompt(settings, cm, file, chat, from, to);
    const system = systemPrompt(getPrompt(settings, 'episode'), EPISODE_FORMAT);
    const opts = summaryCall(settings, { expectTag: 'canon_episode' });
    let node = null;
    for (let attempt = 0; attempt < 2 && !node; attempt++) {
        const reminder = attempt > 0 ? '\n\nIMPORTANT: your previous reply could not be parsed. Output only the <canon_episode> block in the exact format described.' : '';
        const out = await callModel(system, user + reminder, opts);
        node = parseNodeBlock(extractTag(out, 'canon_episode'));
        if (!node && attempt > 0) {
            const fallback = cleanOutput(out).trim();
            if (looksRefused(fallback)) throw new RefusedError(`모델이 원작 구간 정리를 거절했어요: "${fallback.slice(0, 80)}"`);
            if (fallback.length >= 40) node = { title: file.name, keywords: [], text: fallback };
        }
    }
    if (!node) throw new Error('원작 구간 정리 응답을 해석하지 못했습니다.');
    const { indices } = transcript(chat, from, to, settings.transcriptTokens);
    return {
        id: newId(), tier: 'episode', sourceFileId: file.id, fileName: file.name, from, to,
        title: node.title, text: node.text, keywords: node.keywords, when: dateSpan(chat, indices), createdAt: Date.now(),
        ...(dropped ? { truncated: dropped } : {}),
    };
}

// ---- chapter / saga

export async function stepChapter(settings, cm, force = false) {
    const episodes = cm.timeline.filter(n => n.tier === 'episode');
    if (!force && episodes.length <= settings.maxEpisodes) return false;
    const run = [];
    for (const node of cm.timeline) {
        if (node.tier === 'episode') { run.push(node); if (run.length >= settings.chapterSize) break; }
        else if (run.length >= 2) break;
        else run.length = 0;
    }
    if (run.length < 2) return false;
    const format = `<canon_chapter>
title: <short title, at most 10 words>
keywords: <5-15 comma-separated recall cues>
summary:
<the chapter>
</canon_chapter>`;
    const user = run.map(n => `<canon_episode file="${esc(n.fileName || '')}" messages="#${n.from}-#${n.to}" title="${esc(n.title)}">\n${n.text}\n</canon_episode>`).join('\n\n');
    const out = await callModel(systemPrompt(getPrompt(settings, 'chapter'), format), user, summaryCall(settings, { expectTag: 'canon_chapter' }));
    const parsed = parseNodeBlock(extractTag(out, 'canon_chapter'));
    if (!parsed) throw new Error('원작 챕터 병합 응답을 해석하지 못했습니다.');
    const chapter = {
        id: newId(), tier: 'chapter', from: run[0].from, to: run[run.length - 1].to,
        sourceFileIds: [...new Set(run.flatMap(n => n.sourceFileIds || [n.sourceFileId]).filter(Boolean))],
        fileName: [...new Set(run.map(n => n.fileName).filter(Boolean))].join(', '),
        when: [run[0].when, run[run.length - 1].when].filter(Boolean).join(' ~ '),
        title: parsed.title, text: parsed.text,
        keywords: [...new Set([...parsed.keywords, ...run.flatMap(n => n.keywords || [])])].slice(0, 24), createdAt: Date.now(),
    };
    for (const n of run) cm.archive.push({ ...n, ownerId: chapter.id, archivedAt: Date.now() });
    const first = cm.timeline.indexOf(run[0]);
    cm.timeline.splice(first, run.length, chapter);
    return true;
}

export async function stepSaga(settings, cm, force = false) {
    const chapters = cm.timeline.filter(n => n.tier === 'chapter');
    if (!force && chapters.length <= settings.maxChapters) return false;
    const run = [];
    for (const node of cm.timeline) {
        if (run.length >= 3) break;
        if (node.tier === 'chapter') run.push(node);
        else break;
    }
    if (!run.length) return false;
    const format = '<canon_saga>\n<the updated original so far>\n</canon_saga>';
    const user = [
        `<original_so_far>\n${cm.saga.text.trim() || '(empty)'}\n</original_so_far>`,
        ...run.map(n => `<canon_chapter messages="#${n.from}-#${n.to}" title="${esc(n.title)}">\n${n.text}\n</canon_chapter>`),
    ].join('\n\n');
    const out = await callModel(systemPrompt(getPrompt(settings, 'saga', { sagaWords: settings.sagaWords }), format), user, summaryCall(settings, { expectTag: 'canon_saga' }));
    const saga = extractTag(out, 'canon_saga');
    if (!saga) throw new Error('원작 진행 전체 갱신 응답을 해석하지 못했습니다.');
    for (const n of run) cm.archive.push({ ...n, ownerId: SAGA_OWNER, archivedAt: Date.now() });
    const ids = new Set(run.map(n => n.id));
    const fileIds = [...new Set([...(cm.saga.fileIds || []), ...run.flatMap(n => n.sourceFileIds || [n.sourceFileId]).filter(Boolean)])];
    cm.saga = { text: saga.trim(), coversTo: run[run.length - 1].to, fileIds };
    cm.timeline = cm.timeline.filter(n => !ids.has(n.id));
    return true;
}

/** Folds until the limits hold (force: one round even within the limits). */
export async function compact(settings, cm, { force = false } = {}) {
    let did = false;
    for (let i = 0; i < 12; i++) {
        if (await stepChapter(settings, cm, force && i === 0)) { did = true; continue; }
        if (await stepSaga(settings, cm, force && i === 0)) { did = true; continue; }
        break;
    }
    return did;
}
