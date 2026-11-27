// Every instruction the extension sends, as editable templates. Each has a built-in default
// (PROMPT_DEFS) and any number of saved versions with a title, one of which is in use
// (settings.savedPrompts, see below). The output formats (<canon_episode> …) are appended in
// code, so an edited template cannot break parsing.

import { newId } from './st.js';

export const LANGUAGES = {
    chat: { label: '채팅 언어 따라가기', instruction: 'Write in the same language the story transcript is mostly written in.' },
    en: { label: 'English', instruction: 'Write in English.' },
    ko: { label: '한국어', instruction: 'Write in Korean (한국어).' },
    ja: { label: '日本語', instruction: 'Write in Japanese (日本語).' },
    zh: { label: '中文', instruction: 'Write in Simplified Chinese (简体中文).' },
};

export const PROMPT_DEFS = {
    mdHeader: {
        label: '원작 대본 머리말',
        hint: '원작 대본 블록 맨 앞에 붙는 설명: Canon Timeline은 따라갈 줄거리가 아니라 배경 세계의 사건이라는 것. {{file}}은 파일 이름, {{user}}는 SillyTavern이 페르소나 이름으로 바꿔요',
        // The timeline is the world behind the RP, never a list of scenes to show. {{user}} is left for
        // SillyTavern's own macro substitution (it runs on every extension prompt).
        text: `The Canon Timeline below ("{{file}}") is background world continuity. It is not a storyline this RP is supposed to follow. It describes predefined events, set in advance by the user from the original work, that normally occur in the world as RP time passes. They exist on the same layer as the off-screen lives of all other NPCs; the only difference is that these events were decided beforehand instead of being improvised.

These events do not belong to the narrative camera. The Beats are not a list of scenes to show, not a queue to run in order, not something {{user}} is meant to witness, and not a destination for the current scene. They may occur outside {{user}}'s visible scene, just as other NPCs continue their lives and activities while {{user}} is elsewhere. Do not move, redirect, delay, or restructure the current RP in order to display a Canon event. Do not make {{user}} arrive in time to witness Canon merely because the event appears in the current window.

A Canon event becomes visible only when the established current RP scene naturally intersects with it: {{user}} is already in that place and situation and the RP's own course runs into the event. The reason is that intersection, never that it is the Beat's turn. Otherwise the event may occur entirely off-camera. Temporal overlap does not imply narrative exposure. A Beat matching the current date, or {{user}} being in the same school, house, neighborhood, date, or general time period, does not by itself mean that {{user}} witnesses the event or that it must be depicted.

When an off-camera Canon event has occurred, there is no need to recap, recall, reconstruct, explain, or reenact it for {{user}}: no flashback, no inner monologue that walks through it, no character suddenly reporting it. Its consequences may simply exist in the world afterward. Characters it touched behave as people to whom it has happened, and only what comes up naturally in the current interaction is shown. {{user}} does not automatically know events that occurred outside {{user}}'s presence. Preserve normal information boundaries.

Established RP history (the actual chat and the canon progress notes) takes priority whenever it actually changes, prevents, replaces, redirects, or contradicts the Canon baseline, and what the RP has changed is never restored to the original. Absence from the visible chat alone does not cancel Canon.

Future Canon is background future history, not a goal for the present scene. Do not foreshadow, prepare, expose, or steer toward a later Canon event merely because it is visible in the supplied timeline.

"CURRENT CANON WINDOW" means the currently loaded timeline reference range around the present RP time, not events that are due to be depicted in the current response. "PAST CANON EVENTS", when present, is the plain record of what the original says happened before that range. Neither directs the camera.

Use Canon to maintain the world behind the RP, not to control the RP camera. Use it silently: do not quote or summarize this block in replies.`,
    },
    pastHeader: {
        label: '지난 원작 사건 머리말',
        hint: '원작 대본 블록 안의 [PAST CANON EVENTS] 바로 아래에 붙는 설명',
        text: 'What the original says happened before the Beats shown below: a plain record of past events of the original world, kept only as background history. It does not say how anyone feels now or how any relationship stands now — the actual chat and its memory decide that — and where the established story differs from it, the story wins. It is not material to replay: do not recall, re-enact, retell or explain these events in the scene, do not summarize them to the user\'s character or in dialogue, and do not pull the current scene back to them. The actual chat and the current interaction come first.',
    },
    pastEvents: {
        label: '지난 원작 사건 정리 지시문',
        hint: '"다음 Beat 구간"으로 넘길 때, 방금 지난 구간의 원작 Beat에서 객관적인 사건만 뽑아 [PAST CANON EVENTS]에 더하는 지시. 채팅 로그는 보내지 않아요',
        text: `You keep a concise record of the events of an original work (the "Canon"). You are given the record so far and the next part of the original's script (Canon Beats). List the events of that part so they can be added to the record.

Summarize only the objective events that occurred in the original Canon.
Record what characters did, what happened, what was decided, what was revealed, what changed factually, and what concrete events took place: who said or confessed what to whom, who refused or helped whom, who moved where or came to live with whom, who learned which fact, which secret came out and to whom, which promise or agreement was made, which goal was declared, who obtained what, exams, admissions, graduations, moves, incidents and accidents.
Do not summarize emotional states, psychological interpretations, relationship temperature, current motivation strength, or temporary reactions. A line that can only be written as a feeling or an interpretation ("she was furious", "they grew closer", "he began to notice her") is left out; if there is a concrete event behind it ("he tutored her for a week"), record that event and nothing more.
Do not infer the characters' current state.
Do not use RP history.
Do not reconcile Canon with RP.
This is a concise record of original Canon events, not a character-state summary.

Rules:
- One short line per event, past tense, in the order the events happen. No dialogue, no scene description, no atmosphere, no order of reactions.
- Write events as history, never as a statement about the present ("is now used to living there").
- Use only what the script says. Where the script separates them, the route the original actually took and its factual outcomes are the events; goal lines about feelings are not events. Do not add events the script does not contain.
- Do not repeat an event the existing record already contains. One event that runs across several Beats may be one line, but do not merge different events so that information is lost.
- Language: {{language}}`,
    },
    memHeader: {
        label: '원작 진행 기록 머리말',
        hint: '원작 에피소드·챕터·전체 진행 기록 앞에 붙는 설명',
        text: 'This is the record of how the original work\'s events have actually played out in this story so far, compared with the original: what happened as in the original, what the user changed, what did not happen, and what that changes for later events. Where it differs from the baseline script, this record wins; where the recent chat differs from it, the chat wins; where it is silent about an original event, that event is assumed to have run its course as in the original. Use it silently.',
    },
    episode: {
        label: '원작 구간 정리 지시문',
        hint: '"다음 파일"을 누를 때, 그 원작 .md와 그동안의 실제 대화를 비교해 원작 진행 기록(원작 에피소드)을 쓰는 지시',
        text: `You keep the canon progress notes of a long-running interactive story that follows an original work. The original's script is the baseline world line: the events of the original keep unfolding in this world by default, whether or not the user's character is there to see them. The chat follows the user's character, so it shows only part of that world.

The user has just moved on to the next part of the script, so treat this stretch as a portion of the original timeline whose time and opportunity have now passed in the world. Write how this stretch of the original was handled in this story.

How to weigh the sources:
1. The transcript (the actual chat).
2. The earlier canon progress notes (<canon_so_far>).
3. The original's script (<canon_script>) — the baseline.
A higher source wins only where it CONFLICTS with a lower one. Where the higher sources are silent, the baseline is not void: it stands as this stretch's default world history, and these notes are the only place it survives once this script is retired, so its important results must be written down here:
- Canon events do not need to appear in the chat to have occurred. Absence from the visible chat is not evidence that an off-screen original event failed to happen, and it is not a reason to leave the event out. (The script says the heroine's house collapses; the chat shows the user's character at a cafe that day and never mentions the house, and nothing in the sources prevented or changed the collapse → record that the house collapsed as in the original and that the family lost their home, noting that established history did not alter it. Do not record it as "did not happen", and do not drop it.)
- If the chat or the earlier canon notes show that the user's character or other events changed, prevented, replaced or redirected an original event, that established history overrides the original route. (The script says the heroine moves into the Irie house; the chat shows the user's character helped her family secure another long-term home, so the move became unnecessary → record that the original move-in did not happen and what replaced it. Never restore an original route that established history has made impossible or changed.)
- For original events that established history neither contradicts nor alters, preserve their important results as the default world progression — only the result needed for continuity, in the script's own terms. Do not invent details beyond the script to fill gaps, and do not infer extra events that are in neither the script nor the established history.

Record only, in this order:
1. The original's events of this stretch that the chat actually shows.
2. Important original events of this stretch that the chat does not show but that established history did not contradict, prevent, replace or redirect — record their important result as having proceeded per the original baseline.
3. Important original events of this stretch that did NOT happen — only with positive evidence: the chat or the earlier notes state a different outcome, the user's intervention removed the event's premise, another event replaced it, or the sources clearly say it did not happen. "The user's character was not there" or "the chat has no such scene" is never such evidence; such an event belongs under 2, not here.
4. Outcomes the user's character changed, and how.
5. Changes that affect the cause and effect of later original events.

Do not record: everyday life and talk that does not affect how the original progresses, relationship moments that change nothing for the original's course, emotional description, scenery, atmosphere, style or wording. These notes are not a summary of the story itself.
Be concrete: names, places, dates, decisions and their consequences. Third person, past tense, 5-15 short bullet points.
Language: {{language}}`,
    },
    chapter: {
        label: '원작 에피소드 → 원작 챕터',
        hint: '오래된 원작 에피소드 여러 개를 한 챕터로 합칠 때',
        text: 'Task: merge the consecutive canon progress notes below into one chapter. Keep every point where this story differed from the original and every consequence for later original events, keep the key outcomes that matched the original, and keep the original events that proceeded off-screen per the baseline whenever a later original event depends on them (a lost home that leads to a later move, a promise that is later kept). Keep chronological order. Drop repetition. Aim for about half of their combined length. Do not add events the notes do not contain, and do not turn an event the notes record as having happened, or leave open, into one that did not happen.\nLanguage: {{language}}',
    },
    saga: {
        label: '원작 챕터 → 원작 진행 전체',
        hint: '오래된 원작 챕터를 전체 원작 진행 기록에 합칠 때. {{sagaWords}}는 최대 단어 수',
        text: 'Task: update "the original so far" by folding in the canon chapters below, which come right after it in time. Keep the result under {{sagaWords}} words. Compress the oldest material first, but never drop: where and how this story departed from the original, which original outcomes still hold (including those that proceeded off-screen per the baseline), and any result that a later original event depends on. Do not add events the chapters do not contain.\nLanguage: {{language}}',
    },
};

// ---- saved instructions
//
// Each instruction (a key of PROMPT_DEFS) can have any number of saved versions, one of them in use:
//   settings.savedPrompts[key] = { active: <id> | '', items: [{ id, title, text }] }
// active '' is the built-in default above. The title is a name for the person choosing between
// them and goes nowhere else: the model is only ever given the text.

/** { active, items } of one instruction, cleaned up, without touching the settings. */
export function savedPrompts(settings, key) {
    const set = settings?.savedPrompts?.[key];
    const items = Array.isArray(set?.items) ? set.items.filter(it => it && typeof it.id === 'string' && it.id && typeof it.text === 'string') : [];
    const active = typeof set?.active === 'string' && items.some(it => it.id === set.active) ? set.active : '';
    return { active, items };
}

/** The saved version in use, or null while the built-in default is. */
export function activePrompt(settings, key) {
    const { active, items } = savedPrompts(settings, key);
    return active ? items.find(it => it.id === active) : null;
}

/** The instruction text in use: the chosen saved version, or the built-in default (also when that version is empty). */
export function promptTemplate(settings, key) {
    const text = activePrompt(settings, key)?.text;
    return typeof text === 'string' && text.trim() ? text : PROMPT_DEFS[key].text;
}

function ownSet(settings, key) {
    if (!settings || !PROMPT_DEFS[key]) return null;
    if (!settings.savedPrompts || typeof settings.savedPrompts !== 'object' || Array.isArray(settings.savedPrompts)) settings.savedPrompts = {};
    const set = savedPrompts(settings, key);
    settings.savedPrompts[key] = set;   // the cleaned-up view becomes what is stored
    return set;
}

/** A title no other version of this instruction has: "제목", "제목 (2)", … */
function freeTitle(items, wanted, exceptId = '') {
    const base = String(wanted ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || '새 지시문';
    const taken = new Set(items.filter(it => it.id !== exceptId).map(it => it.title));
    if (!taken.has(base)) return base;
    for (let n = 2; ; n++) if (!taken.has(`${base} (${n})`)) return `${base} (${n})`;
}

/** Saves a new version under a title and puts it in use. */
export function addPrompt(settings, key, title, text) {
    const set = ownSet(settings, key);
    if (!set) return null;
    const item = { id: newId(), title: freeTitle(set.items, title), text: String(text ?? '') };
    set.items.push(item);
    set.active = item.id;
    return item;
}

/** Puts a saved version in use; '' (or an id that does not exist) goes back to the built-in default. */
export function selectPrompt(settings, key, id) {
    const set = ownSet(settings, key);
    if (!set) return false;
    set.active = set.items.some(it => it.id === id) ? id : '';
    return true;
}

export function renamePrompt(settings, key, id, title) {
    const set = ownSet(settings, key);
    const item = set?.items.find(it => it.id === id);
    if (!item || !String(title ?? '').trim()) return false;
    item.title = freeTitle(set.items, title, id);
    return true;
}

/** Deletes a saved version; if it was the one in use, the built-in default takes over. */
export function removePrompt(settings, key, id) {
    const set = ownSet(settings, key);
    if (!set || !set.items.some(it => it.id === id)) return false;
    set.items = set.items.filter(it => it.id !== id);
    if (set.active === id) set.active = '';
    return true;
}

/** Changes the text of the version in use. The built-in default is not editable: false. */
export function setPromptText(settings, key, text) {
    const set = ownSet(settings, key);
    const item = set?.items.find(it => it.id === set.active);
    if (!item) return false;
    item.text = String(text ?? '');
    return true;
}

/**
 * Before saved versions there was one override per instruction (settings.prompts[key] = text).
 * Each becomes a saved version that stays in use, so nothing changes for the model.
 */
export function migratePrompts(settings) {
    if (!settings || !Object.hasOwn(settings, 'prompts')) return;
    const old = settings.prompts;
    if (old && typeof old === 'object') {
        for (const [key, text] of Object.entries(old)) {
            if (!PROMPT_DEFS[key] || typeof text !== 'string' || !text.trim() || text.trim() === PROMPT_DEFS[key].text.trim()) continue;
            addPrompt(settings, key, '기존 지시문', text);
        }
    }
    delete settings.prompts;
}

const PROPER_NOUNS = 'Keep proper nouns (names, places, titles) in their original spelling.';

/**
 * The {{language}} line for a call that is given no chat (the past-events record): "follow the
 * chat" has nothing to follow there, so it follows the script instead.
 */
export function scriptLanguage(settings) {
    const lang = LANGUAGES[settings?.language];
    return `${lang && settings.language !== 'chat' ? lang.instruction : 'Write in the same language the Canon Beats are mostly written in.'} ${PROPER_NOUNS}`;
}

/** Fills {{key}} placeholders; a placeholder alone on its line disappears with the line when empty. */
export function getPrompt(settings, key, vars = {}) {
    let text = promptTemplate(settings, key);
    const lang = LANGUAGES[settings?.language] ?? LANGUAGES.chat;
    const all = { language: `${lang.instruction} ${PROPER_NOUNS}`, ...vars };
    for (const [k, v] of Object.entries(all)) {
        const value = String(v ?? '');
        if (!value) text = text.replace(new RegExp(`^[ \\t]*\\{\\{${k}\\}\\}[ \\t]*(\\r?\\n|$)`, 'gim'), '');
        text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'gi'), () => value);
    }
    return text.trim();
}
