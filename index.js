// Canon Timeline Simulator — standalone SillyTavern extension.
//
// Several canon .md files are registered in reading order and exactly one (the checked file)
// is the original's baseline. Of that file only the current window of Beats (20 by default) is
// injected, with the file's header; the user steps through the windows by hand. A window that is
// left behind is reduced to a short list of the original's objective events ([PAST CANON EVENTS],
// built from the Beats alone, never from the chat) and stays in the prompt in that form — unless
// the user has switched that off (pastEnabled), in which case windows just move.
// A mistake in the file can be fixed from the screen: the Beats now injected (or the file's header)
// are shown as the stored file has them, and saving replaces just those lines (editSource).
// When the user switches to the next file, the stretch
// just passed is written up as a Canon Episode (the md compared with the chat since the file was
// chosen); episodes fold into Canon Chapters and a Canon Saga, injected separately. Off-screen,
// the original keeps unfolding by default; where the chat changed it, the chat wins.
// Nothing moves the pointer but the user. No per-event state, no automatic judgement.
// One icon beside the message box opens a window with the injected block, and the same Beat-window
// buttons are offered inside that window, with a box to type a Beat number into (src/bar.js).
//
// Split out of the "코끼리를 생각하지마" canon4 module, with its story-memory dependencies removed.

import { ctx, hasChat, chatLength, toast, confirmBox, inputBox, persistChat, errorDetail } from './src/st.js';
import { addFile as addFileTo, removeFile as removeFileFrom, moveFile as moveFileIn, dateNumber } from './src/files.js';
import { callModel, summaryProfile, summaryCall, safeError } from './src/model.js';
import { migratePrompts, addPrompt as addPromptTo, selectPrompt as selectPromptIn, renamePrompt as renamePromptIn, removePrompt as removePromptFrom, setPromptText as setPromptTextIn } from './src/prompts.js';
import { emptyMemory, normalizeMemory, coveredFileIds, currentIndex, currentFile, setIndex } from './src/state.js';
import { hintState, storyDate } from './src/date.js';
import { makeEpisode, compact } from './src/memory.js';
import { parseCached, beatWindow, beatsSource, headerSource, replaceSource } from './src/beats.js';
import { makePastEvents, putPast, pastTask, owedBefore, snapshots } from './src/past.js';
import { applyInjection, planned, PROMPT_KEY_MD, PROMPT_KEY_MEM } from './src/inject.js';
import { mountPanel, renderPanel, setBusy } from './src/ui.js';

export const MODULE = 'canon_timeline_simulator';   // extensionSettings key
export const META_KEY = 'canon_timeline_simulator'; // chatMetadata key
export const LOG = '[Canon Timeline Simulator]';
export { PROMPT_KEY_MD, PROMPT_KEY_MEM };

export const defaultSettings = Object.freeze({
    enabled: true,
    files: [],                 // { id, name, text, addedAt, updatedAt } in reading order
    beatWindowSize: 20,        // Beats of the checked file injected at a time (the position is per chat)
    pastEnabled: true,         // [PAST CANON EVENTS]: false = not injected and not written when the window moves (stored records are kept)
    inputBar: true,            // the 📜 icon beside the message box that opens the canon window (src/bar.js)
    mdPosition: 'in_chat',     // baseline md: far from the latest messages
    mdDepth: 12,
    memPosition: 'in_chat',    // canon progress: a little closer
    memDepth: 8,
    maxEpisodes: 6,
    chapterSize: 3,
    maxChapters: 4,
    sagaWords: 600,
    transcriptTokens: 24000,   // chat text sent for one episode; older lines are dropped above this
    profileId: '',             // Connection Manager profile for the summaries; '' = current connection
    maxTokens: 4096,
    retries: 1,
    language: 'chat',
    hintEnabled: true,
    savedPrompts: {},          // saved instructions per PROMPT_DEFS key: { active, items: [{ id, title, text }] }
    ui: { open: true, beatOpen: false, advancedOpen: false, promptsOpen: false, debugOpen: false },
});

// ---------- settings (global) ----------

export function getSettings() {
    const { extensionSettings } = ctx();
    if (!extensionSettings[MODULE]) extensionSettings[MODULE] = structuredClone(defaultSettings);
    const s = extensionSettings[MODULE];
    for (const k of Object.keys(defaultSettings)) if (!Object.hasOwn(s, k)) s[k] = structuredClone(defaultSettings[k]);
    for (const k of Object.keys(defaultSettings.ui)) if (!Object.hasOwn(s.ui, k)) s.ui[k] = defaultSettings.ui[k];
    if (!Array.isArray(s.files)) s.files = [];
    if (!s.savedPrompts || typeof s.savedPrompts !== 'object' || Array.isArray(s.savedPrompts)) s.savedPrompts = {};
    migratePrompts(s);   // the single override per instruction of earlier versions → a saved version, still in use
    return s;
}

export function saveSettings() {
    ctx().saveSettingsDebounced?.();
}

export function files() {
    return getSettings().files;
}

// ---------- canon memory (per chat) ----------

export function getMemory(create = false) {
    if (!hasChat()) return null;
    const { chatMetadata } = ctx();
    if (!chatMetadata) return null;
    let cm = chatMetadata[META_KEY];
    if (!cm) {
        if (!create) return null;
        cm = emptyMemory();
        chatMetadata[META_KEY] = cm;
    }
    return normalizeMemory(cm);
}

// ---------- injection ----------

let lastInjected = { md: '', mem: '', at: null };

export function getLastInjected() {
    return lastInjected;
}

/** { md, mem, file, win, past, pending }: the strings refreshInjection() sends and what they were built from (inject.js). */
export function plannedInjection() {
    return planned(getSettings(), getMemory(false), files());
}

export function refreshInjection() {
    const { md, mem, win } = applyInjection(getSettings(), getMemory(false), files());
    lastInjected = { md, mem, win, at: Date.now() };
}

// ---------- file list actions ----------

export function addFile(name, text) {
    const r = addFileTo(files(), name, text);
    saveSettings();
    refreshInjection();
    return r;
}

export function removeFile(id) {
    const ok = removeFileFrom(files(), id);
    if (ok) { saveSettings(); refreshInjection(); }
    return ok;
}

export function moveFile(id, delta) {
    const ok = moveFileIn(files(), id, delta);
    if (ok) { saveSettings(); refreshInjection(); }
    return ok;
}

// ---------- chat actions (all user-driven) ----------

let busy = false;

export function isBusy() {
    return busy;
}

function stillSameChat(chatId) {
    return ctx().getCurrentChatId?.() === chatId;
}

export async function setOn(on) {
    if (!hasChat()) return toast('warning', '채팅을 먼저 열어주세요.');
    const cm = getMemory(true);
    cm.on = !!on;
    currentIndex(cm, files());
    await persistChat();
    refreshInjection();
    renderPanel();
}

/**
 * [이전 파일] / [다음 파일]. Going forward on a file that has no Canon Episode yet writes one
 * first (one model call) and moves only when that succeeded; a file that already has its
 * record is passed over without a call. Going back never calls the model.
 */
export async function switchFile(delta, { summarize = true } = {}) {
    if (!hasChat()) return toast('warning', '채팅을 먼저 열어주세요.');
    if (busy) return toast('warning', '이미 작업 중입니다.');
    const list = files();
    if (!list.length) return toast('info', '원작 파일을 먼저 추가해 주세요.');
    const settings = getSettings();
    const cm = getMemory(true);
    const i = currentIndex(cm, list);
    const j = i + delta;
    if (j < 0) return toast('info', '첫 파일이에요.');
    if (j >= list.length) return toast('info', '마지막 파일이에요.');
    const chatId = ctx().getCurrentChatId();
    const chat = ctx().chat || [];
    const from = Math.max(0, Number(cm.startMessage) || 0);
    const to = chat.length - 1;
    const current = list[i];
    const target = list[j];
    const covered = coveredFileIds(cm).has(current.id);
    const willSummarize = delta > 0 && summarize && cm.on && to >= from && !covered;
    const ask = willSummarize
        ? `${current.name} 구간을 마치고 ${target.name}(으)로 넘어갈까요?\n\n넘어가기 전에 ${current.name}의 원작 대본과 채팅 #${from}~#${to}을 비교해 원작 진행 기록(원작 에피소드)을 한 번 써요 (API 1회).`
        : (delta > 0 && covered
            ? `${target.name}(으)로 넘어갈까요?\n\n${current.name}의 원작 진행 기록은 이미 있어서 다시 쓰지 않아요. 다시 쓰려면 그 기록의 [다시 요약]을 누르세요.`
            : `${target.name}(으)로 넘어갈까요? 원작 진행 기록은 쓰지 않아요.`);
    if (!await confirmBox('원작 파일 바꾸기', ask)) return;
    busy = true;
    setBusy(true, willSummarize ? `원작 구간 정리 중 (${current.name}, #${from}~#${to})` : '');
    try {
        if (willSummarize) {
            const node = await makeEpisode(settings, cm, current, chat, from, to);
            if (!stillSameChat(chatId)) return;
            cm.timeline.push(node);
            try {
                setBusy(true, '원작 기록 정리 중...');
                await compact(settings, cm);
            } catch (err) {
                console.warn(LOG, 'canon compact failed', err);
                toast('warning', `원작 기록 정리는 건너뛰었어요: ${errorDetail(err)}`);
            }
        }
        if (!stillSameChat(chatId)) return;
        setIndex(cm, list, j);
        cm.startMessage = chat.length;
        cm.on = true;
        await persistChat();
        refreshInjection();
        toast('success', `원작 파일: ${target.name}`);
    } catch (err) {
        console.error(LOG, 'switch failed', err);
        toast('error', `원작 파일 바꾸기 실패: ${errorDetail(err)}`);
    } finally {
        busy = false;
        setBusy(false);
        renderPanel();
    }
}

/** What every move of the Beat window starts from; says why and returns null when nothing can move. */
function windowNow() {
    if (!hasChat()) { toast('warning', '채팅을 먼저 열어주세요.'); return null; }
    if (busy) { toast('warning', '이미 작업 중입니다.'); return null; }
    const cm = getMemory(false);
    if (!cm?.on) { toast('info', '이 채팅에서 원작 진행을 먼저 켜 주세요.'); return null; }
    const { file, win } = plannedInjection();
    if (!file || !win) { toast('info', '원작 파일을 먼저 추가해 주세요.'); return null; }
    return { cm, file, win };
}

/**
 * Moves the injected Beat window to window `target` of the checked file — the one rule behind the
 * arrows (shiftWindow) and the number box (goToBeat).
 *
 * Going forward, the Beats before the target window are first reduced to their objective events
 * and added to [PAST CANON EVENTS] (one model call, from the Beats alone); the window moves only
 * after that record is stored. When the record already exists the move is made without a call,
 * and going back never calls the model. `record: false` moves without writing the record.
 *
 * With past events switched off (settings.pastEnabled false) nothing is owed, so every move
 * is immediate: no question, no model call, and the stored records are left as they are.
 * @returns {Promise<boolean>} true when the window moved
 */
async function moveWindow({ cm, file, win }, target, { record = true } = {}) {
    const chatId = ctx().getCurrentChatId();
    const parsed = parseCached(file);
    const next = target === win.index + 1;
    const owed = target > win.index && getSettings().pastEnabled !== false ? owedBefore(cm, file.id, parsed, target * win.size) : null;
    if (owed) {
        const range = owed.firstId === owed.lastId ? owed.firstId : `${owed.firstId} ~ ${owed.lastId}`;
        // A jump over several windows says where it lands and how much is read for the record.
        const what = next ? `${range} 구간` : `${range} 구간(Beat ${owed.to - owed.from}개)`;
        const dest = next ? '다음 구간' : `${beatWindow(parsed, target, win.size).label} 구간`;
        if (record) {
            if (!await confirmBox(next ? '다음 Beat 구간' : 'Beat 구간 이동', `${what}의 원작 사건을 [PAST CANON EVENTS]에 정리한 뒤 ${dest}으로 넘어갈까요?\n\n원작 Beat 원문만 요약 모델에 보내요 (채팅 로그는 보내지 않음, API 1회). 넘어간 뒤에는 이 구간의 원문 대신 정리된 사건 기록만 넣어요.`)) return false;
            busy = true;
            setBusy(true, `지난 원작 사건 정리 중 (${range})`);
            let stored = false;
            try {
                const text = await makePastEvents(getSettings(), owed);
                if (stillSameChat(chatId)) {
                    putPast(cm, file.id, { count: owed.to, lastId: owed.lastId, text, at: Date.now() });
                    stored = true;
                }
            } catch (err) {
                console.error(LOG, 'past events failed', err);
                toast('error', `지난 원작 사건 정리 실패 — Beat 구간은 옮기지 않았어요. (${errorDetail(err)})`, { timeOut: 12000 });
            } finally {
                busy = false;
                setBusy(false);
            }
            if (!stored) return false;
        } else if (!await confirmBox('기록 없이 넘기기', `${what}의 원작 사건 기록 없이 ${dest}으로 넘어갈까요?\n\n이 구간의 원작 내용은 프롬프트에서 빠지고 기록도 남지 않아요. 나중에 [다음 Beat]로 넘길 때 빠진 구간까지 함께 정리해요.`)) {
            return false;
        }
    }
    if (!stillSameChat(chatId)) return false;
    cm.beatWindowIndex = target;
    await persistChat();
    refreshInjection();
    renderPanel();
    return true;
}

/** [← 이전 N Beat] / [다음 N Beat →]: one window back or forward inside the checked file (moveWindow). */
export async function shiftWindow(delta, opts) {
    const at = windowNow();
    if (!at) return;
    const target = at.win.index + delta;
    if (target < 0) { toast('info', '첫 Beat 구간이에요.'); return; }
    if (target >= at.win.count) { toast('info', '마지막 Beat 구간이에요.'); return; }
    await moveWindow(at, target, opts);
}

const positions = (win) => `${win.start + 1}~${win.end}`;

/**
 * The number box between the arrows: goes to the window that holds Beat number `typed` — its
 * position in the file, as the counter shows it (1 = the file's first Beat).
 *
 * The windows stay as they are cut (N at a time from the start of the file), so a number from the
 * middle of a window shows that whole window, and the user is told which one. The move itself is
 * moveWindow(): going forward it owes the same record, with the same question and the same single
 * call, as [다음 N Beat]; going back, or with past events off, it is immediate.
 * @returns {Promise<boolean>} true when the window moved
 */
export async function goToBeat(typed) {
    const at = windowNow();
    if (!at) return false;
    const { win } = at;
    if (!win.total) { toast('info', '이 파일은 Beat 제목이 없어 통째로 넣어요. 옮길 구간이 없어요.'); return false; }
    const text = String(typed ?? '').trim();
    const n = /^\d+$/.test(text) ? Number(text) : NaN;
    if (!(n >= 1 && n <= win.total)) { toast('info', `1 ~ ${win.total} 사이의 Beat 번호를 적어 주세요.`); return false; }
    const target = Math.floor((n - 1) / win.size);
    if (target === win.index) {
        if (n - 1 !== win.start) toast('info', `${n}번째 Beat는 지금 넣고 있는 구간(${positions(win)})에 있어요.`);
        return false;
    }
    if (!await moveWindow(at, target)) return false;
    const now = plannedInjection().win;
    if (now && n - 1 !== now.start) toast('info', `${n}번째 Beat가 들어 있는 ${positions(now)} 구간으로 옮겼어요.`);
    return true;
}

const EDIT_BOX = { wide: true, large: true, okButton: '저장', cancelButton: '취소' };

/**
 * [이 구간 고치기] / [머리말 고치기]: fixes the checked file itself, from the screen.
 *
 * The part that is injected now — this window's Beats ('beats'), or the file's header ('header')
 * — is shown as the stored file has it; what the user saves replaces exactly those lines, and the
 * injection follows at once. The rest of the file (other Beats, the NEXT_FILE_HINT line) is not
 * touched. The file list is global, so the fix reaches every chat that uses this file.
 *
 * No model call, and no record is changed: a [PAST CANON EVENTS] record already written from the
 * old text stays as it is (the user is told, and can rewrite it with [지난 사건 다시 정리]).
 * @returns {Promise<boolean>} true when the file was changed
 */
export async function editSource(which = 'beats') {
    if (!hasChat()) { toast('warning', '채팅을 먼저 열어주세요.'); return false; }
    if (busy) { toast('warning', '이미 작업 중입니다.'); return false; }
    const { file, win } = plannedInjection();
    if (!file || !win) { toast('info', '지금 넣고 있는 원작 파일이 없어요. 이 채팅에서 원작 진행을 켜 주세요.'); return false; }
    const head = which === 'header';
    const read = (text) => (head ? headerSource(text) : beatsSource(text, win.start, win.end));
    const src = read(file.text);
    if (!src) { toast('info', head ? '이 파일에는 첫 Beat 앞 머리말이 없어요.' : '이 파일에는 고칠 내용이 없어요.'); return false; }
    const what = head ? '머리말(첫 Beat 앞부분)' : (win.total ? `${win.label} 구간` : '전체 내용');
    const typed = await inputBox('원작 대본 고치기',
        `${file.name}의 ${what}이 md 파일에 적힌 그대로예요. 고쳐서 [저장]하면 확장에 저장된 이 파일이 바뀌고 바로 주입에 반영돼요 (이 파일을 쓰는 모든 채팅에 적용). 기기에 있는 원본 .md 파일은 바뀌지 않아요.`,
        src.text, 18, EDIT_BOX);
    if (typed === null) return false;
    const next = String(typed).replace(/\r\n?/g, '\n').replace(/\s+$/, '');
    if (!next.trim()) { toast('info', '내용이 비어 있어 저장하지 않았어요. 파일을 빼려면 파일 목록의 [삭제]를 쓰세요.'); return false; }
    if (next === src.text.replace(/\s+$/, '')) { toast('info', '바뀐 내용이 없어요.'); return false; }
    // The box was open for a while: save only onto the very text it showed.
    const now = files().includes(file) ? read(file.text) : null;
    if (!now || now.text !== src.text) { toast('error', '그 사이에 이 파일이 바뀌어서 저장하지 않았어요. 다시 열어서 고쳐 주세요.'); return false; }
    const before = parseCached(file).beats.length;
    file.text = replaceSource(file.text, now, next);
    file.updatedAt = Date.now();
    saveSettings();
    refreshInjection();
    renderPanel();
    const beats = parseCached(file).beats;
    const notes = [];
    if (beats.length !== before) notes.push(`Beat ${before}개 → ${beats.length}개${beats.length ? '' : ' (Beat 제목이 없어져서 이제 파일 전체를 한 번에 넣어요)'}.`);
    if (!head && snapshots(getMemory(false), file.id, beats).some(s => s.count > win.start)) notes.push('이 구간으로 이미 만든 지난 사건 기록은 그대로예요. 사건 내용을 고쳤다면 다음 구간에서 [지난 사건 다시 정리]를 눌러 주세요.');
    toast('success', [`${file.name}의 ${what}을 고쳤어요.`, ...notes].join(' '), notes.length ? { timeOut: 12000 } : undefined);
    return true;
}

/** Replaces the text of the past-events record now injected. Later snapshots built on it are dropped. */
export async function editPast(text) {
    const cm = getMemory(false);
    const { file, past } = plannedInjection();
    const t = String(text ?? '').trim();
    if (!cm || !file || !past || !t) return false;
    putPast(cm, file.id, { ...past, text: t, at: Date.now() }, { dropLater: true });
    await persistChat();
    refreshInjection();
    renderPanel();
    return true;
}

/** Rebuilds the past-events record now injected from the Beats it covers (one model call). */
export async function redoPast() {
    if (!hasChat()) return toast('warning', '채팅을 먼저 열어주세요.');
    if (busy) return toast('warning', '이미 작업 중입니다.');
    if (getSettings().pastEnabled === false) return toast('info', '지난 원작 사건이 꺼져 있어요. 고급 설정에서 켜면 다시 정리할 수 있어요.');
    const cm = getMemory(false);
    const { file, past } = plannedInjection();
    if (!cm || !file || !past) return toast('info', '다시 정리할 지난 사건 기록이 없어요.');
    const task = pastTask(cm, file.id, parseCached(file), past.count);
    const range = task.firstId === task.lastId ? task.firstId : `${task.firstId} ~ ${task.lastId}`;
    if (!await confirmBox('지난 사건 기록 다시 정리', `${range} 구간의 원작 Beat로 지난 사건 기록을 다시 써요 (API 1회). 이 뒤 구간의 기록이 이미 있으면 지워지고, 넘길 때 다시 만들어져요.`)) return;
    const chatId = ctx().getCurrentChatId();
    busy = true;
    setBusy(true, `지난 원작 사건 다시 정리 중 (${range})`);
    try {
        const text = await makePastEvents(getSettings(), task);
        if (!stillSameChat(chatId)) return;
        putPast(cm, file.id, { count: task.to, lastId: task.lastId, text, at: Date.now() }, { dropLater: true });
        await persistChat();
        refreshInjection();
        toast('success', '지난 사건 기록을 다시 썼어요.');
    } catch (err) {
        console.error(LOG, 'past events redo failed', err);
        toast('error', `지난 사건 기록 다시 정리 실패: ${errorDetail(err)}`);
    } finally {
        busy = false;
        setBusy(false);
        renderPanel();
    }
}

/**
 * A reminder, once per window: the story's date has reached, or already passed, the date of the
 * last Beat in the window being injected (the story may skip days, so "passed" counts too).
 * Nothing else happens — no window move, no file switch, no summary.
 */
export function checkBeatDate() {
    const s = getSettings();
    if (!s.enabled || !s.hintEnabled || !hasChat()) return false;
    const cm = getMemory(false);
    if (!cm?.on) return false;
    const { file, win } = plannedInjection();
    if (!file || !win?.lastDate) return false;
    const today = storyDate(ctx().chat || []);
    // Compared as dates, not as text; a date that cannot be read (NaN) never matches.
    if (!today || !(dateNumber(today.date) >= dateNumber(win.lastDate))) return false;
    const shown = cm.lastBeatDateNotice;
    if (shown && shown.fileId === file.id && shown.windowIndex === win.index && shown.date === win.lastDate) return false;
    cm.lastBeatDateNotice = { fileId: file.id, windowIndex: win.index, date: win.lastDate };
    toast('success', '현재 Canon Beat 구간의 마지막 날짜에 도달했거나 지났습니다.', { title: 'Canon Timeline' });
    ctx().saveMetadataDebounced?.();
    return true;
}

/** Rewrites one Canon Episode from its file and message range. The only way a record is written twice. */
export async function resummarize(nodeId) {
    if (!hasChat()) return toast('warning', '채팅을 먼저 열어주세요.');
    if (busy) return toast('warning', '이미 작업 중입니다.');
    const settings = getSettings();
    const cm = getMemory(false);
    const node = cm?.timeline.find(n => n.id === nodeId && n.tier === 'episode');
    if (!node) return toast('info', '원작 에피소드만 다시 요약할 수 있어요.');
    const file = files().find(f => f.id === node.sourceFileId);
    if (!file) return toast('error', '이 기록의 원작 파일이 목록에 없어요. 같은 이름으로 다시 추가해도 새 파일이라 연결되지 않으니, 기록을 지우고 [다음 파일]로 다시 쓰세요.');
    const chat = ctx().chat || [];
    const from = Math.max(0, node.from);
    const to = Math.min(chat.length - 1, node.to);
    if (to < from) return toast('error', '이 기록이 다루는 메시지가 더 이상 없어요.');
    if (!await confirmBox('원작 기록 다시 요약', `"${node.title}"을(를) ${file.name}의 원작 대본과 채팅 #${from}~#${to}으로 다시 써요 (API 1회). 지금 내용은 바뀌어요.`)) return;
    const chatId = ctx().getCurrentChatId();
    busy = true;
    setBusy(true, `원작 구간 다시 정리 중 (${file.name}, #${from}~#${to})`);
    try {
        const fresh = await makeEpisode(settings, cm, file, chat, from, to);
        if (!stillSameChat(chatId)) return;
        Object.assign(node, { title: fresh.title, text: fresh.text, keywords: fresh.keywords, when: fresh.when, fileName: file.name, updatedAt: Date.now() });
        await persistChat();
        refreshInjection();
        toast('success', '원작 기록을 다시 썼어요.');
    } catch (err) {
        console.error(LOG, 'resummarize failed', err);
        toast('error', `원작 기록 다시 요약 실패: ${errorDetail(err)}`);
    } finally {
        busy = false;
        setBusy(false);
        renderPanel();
    }
}

export async function runCompact() {
    if (!hasChat()) return toast('warning', '채팅을 먼저 열어주세요.');
    if (busy) return toast('warning', '이미 작업 중입니다.');
    const cm = getMemory(false);
    if (!cm || cm.timeline.length < 2) return toast('info', '원작 에피소드가 두 개 이상 쌓이면 정리할 수 있어요.');
    if (!await confirmBox('원작 기록 정리', '오래된 원작 에피소드를 챕터로, 오래된 챕터를 전체 진행 기록으로 합칠까요? (API 1회 이상)')) return;
    busy = true;
    setBusy(true, '원작 기록 정리 중...');
    try {
        const did = await compact(getSettings(), cm, { force: true });
        await persistChat();
        refreshInjection();
        toast(did ? 'success' : 'info', did ? '원작 기록을 정리했어요.' : '정리할 것이 없어요.');
    } catch (err) {
        console.error(LOG, 'compact failed', err);
        toast('error', `원작 기록 정리 실패: ${errorDetail(err)}`);
    } finally {
        busy = false;
        setBusy(false);
        renderPanel();
    }
}

export async function deleteNode(nodeId) {
    const cm = getMemory(false);
    const node = cm?.timeline.find(n => n.id === nodeId);
    if (!node) return;
    if (!await confirmBox('원작 기록 지우기', `"${node.title}"을(를) 지울까요?`)) return;
    cm.timeline = cm.timeline.filter(n => n.id !== nodeId);
    await persistChat();
    refreshInjection();
    renderPanel();
}

export async function editNode(nodeId, text) {
    const cm = getMemory(false);
    const node = cm?.timeline.find(n => n.id === nodeId);
    if (!node) return false;
    const t = String(text ?? '').trim();
    if (!t) return false;
    node.text = t;
    node.updatedAt = Date.now();
    await persistChat();
    refreshInjection();
    renderPanel();
    return true;
}

/** Once per file per chat, when the story's date reaches the file's NEXT_FILE_HINT. Never switches files. */
export function checkHint() {
    const s = getSettings();
    if (!s.enabled || !s.hintEnabled || !hasChat()) return false;
    const cm = getMemory(false);
    if (!cm?.on) return false;
    const st = hintState(cm, files(), ctx().chat || []);
    if (!st?.due || cm.noticeShownFor === st.file.id) return false;
    cm.noticeShownFor = st.file.id;
    const list = files();
    const next = list[currentIndex(cm, list) + 1];
    toast('info', `현재 원작 파일의 예상 전환 시점(${st.hint.raw})에 도달했습니다. 작중 날짜 ${st.today.date}.<br>현재: ${st.file.name}<br>다음: ${next ? next.name : '(마지막 파일)'}<br>[다음 파일]로 직접 넘겨 주세요.`, { timeOut: 20000, escapeHtml: false });
    ctx().saveMetadataDebounced?.();
    renderPanel();
    return true;
}

export function currentHint() {
    return hasChat() ? hintState(getMemory(false), files(), ctx().chat || []) : null;
}

// ---------- saved instructions (global: the same for every chat) ----------
//
// Each instruction can have several saved versions with a title; one is in use, or the built-in
// default. The title only names a version for the person choosing — it is never sent to a model.

function promptsChanged(render = true) {
    saveSettings();
    refreshInjection();
    if (render) renderPanel();
}

/** Saves `text` as a new version of the instruction `key` under `title` and puts it in use. */
export function addPrompt(key, title, text) {
    const item = addPromptTo(getSettings(), key, title, text);
    if (item) promptsChanged();
    return item;
}

/** Puts a saved version in use; id '' is the built-in default. */
export function selectPrompt(key, id) {
    const ok = selectPromptIn(getSettings(), key, id);
    if (ok) promptsChanged();
    return ok;
}

export function renamePrompt(key, id, title) {
    const ok = renamePromptIn(getSettings(), key, id, title);
    if (ok) promptsChanged();
    return ok;
}

export function removePrompt(key, id) {
    const ok = removePromptFrom(getSettings(), key, id);
    if (ok) promptsChanged();
    return ok;
}

/** Typing in the textarea of the version in use: saved and injected at once, without re-rendering (that would steal the focus). */
export function setPromptText(key, text) {
    const ok = setPromptTextIn(getSettings(), key, text);
    if (ok) promptsChanged(false);
    return ok;
}

// ---------- summary model: connection test ----------

const TEST_SYSTEM = 'This is a connection test. Reply with exactly: OK';
const TEST_USER = 'Connection test. Reply with exactly: OK';

let testing = false;
let lastModelTest = null;   // { ok, profileId, profile, reason, at } — kept in memory only, never saved

export function isTesting() {
    return testing;
}

export function getModelTest() {
    return lastModelTest;
}

/**
 * [연결 테스트]: one tiny request through the call the summaries make — the same profile
 * (summaryCall), the same transport (callModel), the same reply size — to see that the selected
 * profile can really be called. It sends no canon text and no chat, and it writes nothing: not
 * the chat's canon memory, not the settings, not the prompts.
 * @returns {Promise<{ ok: boolean, profileId: string, profile: string, reason: string, at: number } | null>}
 *   the result, or null when a test is already running
 */
export async function testConnection() {
    if (testing) return null;
    const s = getSettings();
    const profile = summaryProfile(s);
    const finish = (ok, kind, message, reason = '') => {
        lastModelTest = { ok, profileId: profile.id, profile: profile.name, reason, at: Date.now() };
        toast(kind, message, { title: 'Canon Timeline' });
        renderPanel();
        return lastModelTest;
    };
    if (!profile.id) return finish(false, 'warning', '먼저 요약 모델 프로필을 선택하세요. 프로필이 비어 있으면 요약은 채팅의 현재 연결을 쓰고, 연결 테스트는 프로필만 확인해요.', '프로필이 선택되지 않음');
    if (!profile.found) return finish(false, 'error', '요약 모델 연결 실패: 선택한 프로필을 찾을 수 없어요. 프로필을 다시 골라 주세요.', '프로필을 찾을 수 없음');
    testing = true;
    let ok = false;
    let reason = '';
    try {
        renderPanel();
        await callModel(TEST_SYSTEM, TEST_USER, summaryCall(s, { retries: 0 }));
        ok = true;
    } catch (err) {
        // A reply that reads like a refusal is still a reply: the connection itself works.
        if (err?.refused) ok = true;
        else {
            reason = safeError(err);
            console.warn(LOG, 'connection test failed:', reason);   // the masked line only, never the error object
        }
    } finally {
        testing = false;
    }
    return ok
        ? finish(true, 'success', `요약 모델 연결 성공: ${profile.name}`)
        : finish(false, 'error', `요약 모델 연결 실패: ${reason}`, reason);
}

// ---------- coexistence notice ----------

let coexistWarned = false;
/** The elephant canon4 build injects the same thing on its own keys; say so once. */
export function warnIfElephantCanon() {
    if (coexistWarned) return false;
    const c = ctx();
    const lm = c.extensionSettings?.long_memory;
    const prompts = c.extensionPrompts || {};
    const theirs = (Array.isArray(lm?.canonMdFiles) && lm.canonMdFiles.length && lm.canonMdEnabled !== false)
        || Object.keys(prompts).some(k => k.startsWith('long_memory_canon') && String(prompts[k]?.value ?? prompts[k] ?? '').trim());
    if (!theirs) return false;
    coexistWarned = true;
    toast('warning', '코끼리를 생각하지마(canon 포함 버전)의 원작 기능도 켜져 있어요. 둘 다 켜면 원작 대본과 원작 진행 기록이 프롬프트에 두 번 들어갈 수 있어요. 한쪽만 켜 두세요.', { timeOut: 15000 });
    return true;
}

// ---------- init ----------

function refresh() {
    refreshInjection();
    renderPanel();
    try { warnIfElephantCanon(); } catch (err) { console.warn(LOG, 'coexist check failed', err); }
}

(function init() {
    const c = ctx();
    const es = c.eventSource;
    const types = c.eventTypes || c.event_types || {};
    if (!es?.on) return;
    es.on(types.APP_READY, () => {
        getSettings();
        mountPanel();
        refresh();
    });
    es.on(types.CHAT_CHANGED, refresh);
    es.on(types.MESSAGE_RECEIVED, () => {
        try { checkHint(); } catch (err) { console.warn(LOG, 'hint check failed', err); }
        try { checkBeatDate(); } catch (err) { console.warn(LOG, 'beat date check failed', err); }
        renderPanel();
    });
    if (types.GENERATION_AFTER_COMMANDS) es.on(types.GENERATION_AFTER_COMMANDS, () => refreshInjection());
    for (const name of ['MESSAGE_SENT', 'MESSAGE_DELETED']) if (types[name]) es.on(types[name], () => renderPanel());
})();
