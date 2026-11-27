// [PAST CANON EVENTS]: when the Beat window moves forward, the window left behind is reduced to
// the original's objective events — from the Beats alone, never from the chat — appended to the
// record, and injected before the current window. A failed summary does not move the window.
// (Which lines the model picks is its judgement; these check what it is given and what is kept.)
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { PROMPT_DEFS, getPrompt } from '../src/prompts.js';
import { eventLines, mergeEvents, pastTask, pastBefore, putPast, snapshots, makePastEvents } from '../src/past.js';
import { parseBeats } from '../src/beats.js';
import { normalizeMemory } from '../src/state.js';
import { HEADER_LABEL, PAST_LABEL, WINDOW_LABEL } from '../src/inject.js';

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const HEADER = '# Canon Timeline\n\n이 파일은 세계의 배경 역사이다.';
const mk = (list, tag = '') => [HEADER, ...list.map(id => `## ${id} — 제목 ${id}\n\n[TARGET]\n- ${tag}${id} 내용`)].join('\n\n---\n\n');
const raw = (text, id, tag = '') => text.includes(`- ${tag}${id} 내용`);   // the original text of one Beat

const chat = makeChat(8, (i) => (i === 5 ? 'RP전용: 코토코가 러브레터를 건네지 않고 찢어 버렸다.' : `RP줄 ${i}`));
const h = load({ chat });
const s = app.getSettings();
s.files.length = 0; s.retries = 0; s.beatWindowSize = 20;
app.addFile('a.md', mk(ids(45)));
app.addFile('b.md', mk(ids(25), 'b-'));
app.addFile('c.md', '# 일반 문서\n\nBeat 제목이 없는 원작 줄거리.');
const A = s.files[0];
const B = s.files[1];
const md = () => h.prompts[app.PROMPT_KEY_MD].text;
const mem = () => h.prompts[app.PROMPT_KEY_MEM].text;
const calls = () => h.state.calls.length;
const lastCall = () => h.state.calls.at(-1).args;
const snaps = (cm, file) => (cm.pastEvents[file.id] || []).map(x => [x.count, x.lastId, x.text]);
// A stand-in summary model: one line naming the Beats it was given.
const evt = (args) => {
    const m = args.prompt.match(/<canon_beats beats="([^"~]+)~([^"]+)">/);
    return `<past_canon_events>\n- ${args.prompt.includes('- b-') ? 'b편 ' : ''}${m[1]}부터 ${m[2]}까지의 사건\n</past_canon_events>`;
};
h.state.reply = evt;
const E1 = '- B01부터 B20까지의 사건';
const E2 = '- B21부터 B40까지의 사건';

// ---- the instructions (sections 22, 23, 31 of the request)
const SEVEN = [
    'Summarize only the objective events that occurred in the original Canon.',
    'Record what characters did, what happened, what was decided, what was revealed, what changed factually, and what concrete events took place',
    'Do not summarize emotional states, psychological interpretations, relationship temperature, current motivation strength, or temporary reactions.',
    'Do not infer the characters\' current state.',
    'Do not use RP history.',
    'Do not reconcile Canon with RP.',
    'This is a concise record of original Canon events, not a character-state summary.',
];
for (const line of SEVEN) assert.includes(PROMPT_DEFS.pastEvents.text, line, 'summary instruction');
assert.includes(PROMPT_DEFS.pastEvents.text, 'never as a statement about the present', 'events stay history, not present state');
assert.includes(PROMPT_DEFS.pastEvents.text, 'do not merge different events so that information is lost');
assert.includes(PROMPT_DEFS.pastEvents.text, 'Do not repeat an event the existing record already contains');
assert.includes(PROMPT_DEFS.pastHeader.text, 'It is not material to replay: do not recall, re-enact, retell or explain these events in the scene, do not summarize them to the user\'s character or in dialogue, and do not pull the current scene back to them', 'injected record is not a replay instruction');
assert.includes(PROMPT_DEFS.pastHeader.text, 'where the established story differs from it, the story wins');
assert.includes(PROMPT_DEFS.pastHeader.text, 'The actual chat and the current interaction come first');
assert.includes(PROMPT_DEFS.pastHeader.text, 'It does not say how anyone feels now or how any relationship stands now', 'history, not present state');

// ---- text helpers
assert.same(eventLines('- a\n* b\n1. c\n2) d\n\n<past_canon_events>\n  • e\n</past_canon_events>'), ['a', 'b', 'c', 'd', 'e'], 'bullets and numbers stripped, tags dropped');
assert.strictEqual(mergeEvents('- a\n- b', ['b', 'c', 'c', 'b.']), '- a\n- b\n- c', 'a line the record has is not added again');
assert.strictEqual(mergeEvents('', ['x']), '- x');
assert.strictEqual(mergeEvents('- 아이하라 부녀가 이리에가에 입주했다', ['나오키가 일주일 동안 코토코의 시험공부를 도왔다.']),
    '- 아이하라 부녀가 이리에가에 입주했다\n- 나오키가 일주일 동안 코토코의 시험공부를 도왔다.', 'earlier events stay exactly as written; new ones are appended');

// ---- snapshots: by number of Beats covered, checked against the file
const beatsA = parseBeats(A.text).beats;
const tmp = { pastEvents: {} };
putPast(tmp, 'f', { count: 40, lastId: 'B40', text: '- x\n- y', at: 2 });
putPast(tmp, 'f', { count: 20, lastId: 'B20', text: '- x', at: 1 });
assert.same(snapshots(tmp, 'f', beatsA).map(x => x.count), [20, 40]);
assert.same([pastBefore(tmp, 'f', beatsA, 0), pastBefore(tmp, 'f', beatsA, 19), pastBefore(tmp, 'f', beatsA, 20).count, pastBefore(tmp, 'f', beatsA, 39).count, pastBefore(tmp, 'f', beatsA, 40).count], [null, null, 20, 20, 40], 'the record for a window is the one that ends where it starts');
putPast(tmp, 'f', { count: 20, lastId: 'B20', text: '- z', at: 3 }, { dropLater: true });
assert.same(tmp.pastEvents.f.map(x => [x.count, x.text]), [[20, '- z']], 'replacing a record drops those built on it');
tmp.pastEvents.f.push({ count: 40, lastId: 'B39', text: '- stale' }, { count: 99, lastId: 'B99', text: '- beyond' }, { count: 30, lastId: 'B30', text: ' ' });
assert.same(snapshots(tmp, 'f', beatsA).map(x => x.count), [20], 'records that no longer match the file are ignored');
assert.same(snapshots({}, 'f', beatsA), []);

// ---- first window: header + current window, no past events
app.refreshInjection();
await app.setOn(true);
const cm = app.getMemory(false);
let p = app.plannedInjection();
assert.excludes(md(), PAST_LABEL, 'first window: no [PAST CANON EVENTS]');
assert.ok(md().includes(`\n\n${HEADER_LABEL}\n${HEADER}\n\n${WINDOW_LABEL}\n\n## B01 — `), 'first window: [FILE HEADER], then [CURRENT CANON WINDOW]');
assert.same([HEADER_LABEL, PAST_LABEL, WINDOW_LABEL], ['[FILE HEADER]', '[PAST CANON EVENTS]', '[CURRENT CANON WINDOW]']);
assert.same([p.past, p.pending.from, p.pending.to, p.pending.firstId, p.pending.lastId, p.pending.baseText, cm.pastEvents], [null, 0, 20, 'B01', 'B20', '', {}]);

// ---- [다음 20 Beat →]: record the window being left, then move
h.confirms.length = 0;
await app.shiftWindow(1);
assert.same([calls(), cm.beatWindowIndex], [1, 1], 'one call, then the window moved');
const c1 = h.state.calls[0].args;
for (const line of SEVEN) assert.includes(c1.systemPrompt, line, 'the call carries the instruction');
assert.includes(c1.systemPrompt, '<past_canon_events>', 'output format appended in code');
assert.includes(c1.systemPrompt, 'Language: Write in the same language the Canon Beats are mostly written in.', 'no chat is sent, so the language follows the script');
assert.excludes(c1.systemPrompt, 'story transcript');
assert.includes(c1.prompt, '<existing_past_canon_events>\n(none yet)\n</existing_past_canon_events>', 'input 1: the record so far');
assert.includes(c1.prompt, '<canon_beats beats="B01~B20">', 'input 2: the Beats of the window being left');
assert.ok(ids(20).every(id => raw(c1.prompt, id)) && !raw(c1.prompt, 'B21'), 'exactly that window\'s original text');
for (const no of ['RP전용', 'RP줄', '<transcript', 'canon_so_far', 'canon_progress']) assert.excludes(c1.systemPrompt + c1.prompt, no, 'nothing from the chat or its memory is sent');
assert.includes(h.confirms[0], '채팅 로그는 보내지 않음', 'the confirm says what is sent');
assert.same(snaps(cm, A), [[20, 'B20', E1]], 'stored per chat, per file, by Beats covered');

// injected: [FILE HEADER] → [PAST CANON EVENTS] → [CURRENT CANON WINDOW]
p = app.plannedInjection();
let t = md();
const order = [HEADER_LABEL, HEADER, PAST_LABEL, getPrompt(s, 'pastHeader'), E1, WINDOW_LABEL, '## B21 — '].map(x => t.indexOf(x));
assert.ok(order.every((v, i) => v >= 0 && (i === 0 || v > order[i - 1])), `header → past events → current window (${order})`);
assert.same([HEADER_LABEL, PAST_LABEL, WINDOW_LABEL].map(l => t.split(l).length - 1), [1, 1, 1], 'each label once');
assert.ok(t.includes(`${E1}\n\n${WINDOW_LABEL}\n\n## B21 — `));
assert.ok(!ids(20).some(id => raw(t, id)) && ids(20, 21).every(id => raw(t, id)) && !raw(t, 'B41'), 'the previous window\'s original text is gone; only B21~B40 remains');
assert.strictEqual(p.md, t, 'the panel shows the injected string');
assert.same([p.past.count, p.win.label, t.startsWith('<canon_baseline file="a.md" beats="B21~B40">')], [20, 'B21 ~ B40', true]);
assert.same([mem(), cm.timeline.length, cm.saga.text], ['', 0, ''], 'canon memory (episodes) is not touched');

// the next window: existing record + the new window only; the result is appended
await app.shiftWindow(1);
const c2 = h.state.calls[1].args;
assert.includes(c2.prompt, `<existing_past_canon_events>\n${E1}\n</existing_past_canon_events>`);
assert.includes(c2.prompt, '<canon_beats beats="B21~B40">');
assert.ok(!ids(20).some(id => raw(c2.prompt, id)) && ids(20, 21).every(id => raw(c2.prompt, id)) && !raw(c2.prompt, 'B41'), 'earlier original text is not sent again');
assert.excludes(c2.systemPrompt + c2.prompt, 'RP전용');
assert.same(snaps(cm, A), [[20, 'B20', E1], [40, 'B40', `${E1}\n${E2}`]], 'cumulative: earlier lines kept, new ones added');
p = app.plannedInjection();
assert.same([cm.beatWindowIndex, p.win.label, p.pending], [2, 'B41 ~ B45', null], 'last window: nothing further to record');
assert.ok(md().includes(`${E1}\n${E2}\n\n${WINDOW_LABEL}\n\n## B41 — `) && !raw(md(), 'B40'));
await app.shiftWindow(1);
assert.same([calls(), cm.beatWindowIndex, h.toasts.at(-1)], [2, 2, 'info:마지막 Beat 구간이에요.']);

// going back: no call, and each window shows the record as it stood before it
await app.shiftWindow(-1);
assert.ok(md().includes(`${E1}\n\n${WINDOW_LABEL}\n\n## B21 — `) && !md().includes(E2), 'window 2 does not list its own Beats as past');
await app.shiftWindow(-1);
assert.excludes(md(), PAST_LABEL, 'first window again: no past events');
await app.shiftWindow(1); await app.shiftWindow(1);
assert.same([calls(), cm.beatWindowIndex], [2, 2], 'windows already recorded are passed without a call');

// ---- failure: the window does not move and nothing is stored
h.state.chatId = 'F';
await app.setOn(true);
const cf = app.getMemory(false);
assert.same([cf.beatWindowIndex, cf.pastEvents, md().includes(PAST_LABEL)], [0, {}, false], 'another chat starts without any record');
const before = md();
let n = calls();
h.state.fail = new Error('boom');
await app.shiftWindow(1);
assert.same([calls() - n, cf.beatWindowIndex, cf.pastEvents, md() === before, app.isBusy()], [1, 0, {}, true, false], 'request error → no move, no record');
assert.ok(h.toasts.at(-1).startsWith('err:지난 원작 사건 정리 실패') && h.toasts.at(-1).includes('옮기지 않았어요') && h.toasts.at(-1).includes('boom'));
h.state.fail = null;
n = calls();
h.state.reply = '어떤 사건이 있었는지 설명을 드리자면 이렇습니다만 형식은 지키지 않았습니다.';
await app.shiftWindow(1);
assert.same([calls() - n, cf.beatWindowIndex, cf.pastEvents], [2, 0, {}], 'unparseable reply (asked once more) → no move');
n = calls();
h.state.reply = 'I cannot help with that.';
await app.shiftWindow(1);
assert.same([calls() - n, cf.beatWindowIndex, cf.pastEvents], [1, 0, {}], 'refusal → no move');
n = calls();
h.state.reply = '<past_canon_events>\n</past_canon_events>';
await app.shiftWindow(1);
assert.same([calls() - n, cf.beatWindowIndex, cf.pastEvents], [2, 0, {}], 'an empty first record → no move');
n = calls();
h.state.confirm = false;
h.state.reply = evt;
await app.shiftWindow(1);
assert.same([calls() - n, cf.beatWindowIndex], [0, 0], 'cancelled → no call, no move');
h.state.confirm = true;

// the model's lines are stored as given; a repeated line is not stored twice
const X1 = '- 등교 중 코토코가 치한을 당했고, 하차 후 나오키와 언쟁했다.';
const X2 = '- 나오키가 일주일 동안 코토코의 시험공부를 도왔다.';
const X3 = '- 코토코가 기말시험에서 100등 안에 들었다.';
h.state.reply = `<past_canon_events>\n${X1}\n${X2}\n</past_canon_events>`;
await app.shiftWindow(1);
assert.same([cf.beatWindowIndex, snaps(cf, A)], [1, [[20, 'B20', `${X1}\n${X2}`]]]);
h.state.reply = `<think>고민</think>\n<past_canon_events>\n${X2}\n${X3}\n</past_canon_events>`;
await app.shiftWindow(1);
assert.same(snaps(cf, A)[1], [40, 'B40', `${X1}\n${X2}\n${X3}`], 'duplicate dropped, order kept');

// replies in other shapes
const task = pastTask(cf, A.id, parseBeats(A.text), 40);
assert.same([task.from, task.to, task.firstId, task.lastId, task.baseText], [20, 40, 'B21', 'B40', `${X1}\n${X2}`]);
h.state.reply = '<past_canon_events>\n</past_canon_events>';
assert.strictEqual(await makePastEvents(s, task), `${X1}\n${X2}`, 'nothing new → the record is kept as it is');
h.state.reply = '새 사건 목록입니다:\n- 사건 하나\n- 사건 둘';
n = calls();
assert.strictEqual(await makePastEvents(s, task), `${X1}\n${X2}\n- 사건 하나\n- 사건 둘`, 'bullets without the tag are accepted on the second try');
assert.strictEqual(calls() - n, 2);
const mine = app.addPrompt('pastEvents', '내 정리 지시문', 'MY PAST {{language}}');   // a saved instruction in use
h.state.reply = evt;
await makePastEvents(s, task);
assert.ok(lastCall().systemPrompt.startsWith('MY PAST Write in the same language') && lastCall().systemPrompt.includes('<past_canon_events>'), 'an edited instruction is used; the format stays');
assert.excludes(lastCall().systemPrompt + lastCall().prompt, '내 정리 지시문', 'the title of a saved instruction is not sent');
app.removePrompt('pastEvents', mine.id);

// per chat, saved with the chat, not in the settings
assert.same([snaps(h.metas.c[app.META_KEY], A)[0][2], snaps(h.metas.F[app.META_KEY], A)[0][2], s.pastEvents], [E1, `${X1}\n${X2}`, undefined]);
assert.same(normalizeMemory(JSON.parse(JSON.stringify(h.metas.F[app.META_KEY]))).pastEvents[A.id].map(x => x.count), [20, 40], 'survives save and reload');
assert.same([normalizeMemory({ pastEvents: [] }).pastEvents, normalizeMemory({ pastEvents: 'x' }).pastEvents, normalizeMemory({}).pastEvents], [{}, {}, {}], 'bad stored value → empty');

// ---- moving on without a record, and catching up at the next move
h.state.chatId = 'G';
await app.setOn(true);
const cg = app.getMemory(false);
n = calls();
h.confirms.length = 0;
await app.shiftWindow(1, { record: false });
assert.same([calls() - n, cg.beatWindowIndex, cg.pastEvents, md().includes(PAST_LABEL)], [0, 1, {}, false], 'skipped: moved, no call, no record');
assert.includes(h.confirms[0], '기록 없이');
p = app.plannedInjection();
assert.same([p.past, p.pending.from, p.pending.to, p.pending.firstId, p.pending.lastId], [null, 0, 40, 'B01', 'B40'], 'the next move owes both windows');
await app.shiftWindow(1);
assert.same([calls() - n, cg.beatWindowIndex, snaps(cg, A)], [1, 2, [[40, 'B40', '- B01부터 B40까지의 사건']]], 'one call covers the skipped window too');
assert.ok(ids(40).every(id => raw(lastCall().prompt, id)) && !raw(lastCall().prompt, 'B41'));
await app.shiftWindow(-1);
assert.same([md().includes(PAST_LABEL), app.plannedInjection().pending], [false, null], 'a record that reaches past this window is not shown in it, and is not rebuilt');

// ---- 고치기 / 다시 정리 for the record now injected
h.state.chatId = 'c';
app.refreshInjection();
await app.shiftWindow(-1);
assert.same([cm.beatWindowIndex, app.plannedInjection().past.count], [1, 20]);
assert.strictEqual(await app.editPast('- 고친 사건 한 줄'), true);
assert.same(snaps(cm, A), [[20, 'B20', '- 고친 사건 한 줄']], 'edited; the record built on the old text is dropped');
assert.ok(md().includes(`- 고친 사건 한 줄\n\n${WINDOW_LABEL}`) && !md().includes(E1));
assert.strictEqual(await app.editPast('   '), false, 'an empty edit is refused');
n = calls();
await app.shiftWindow(1);
assert.same([calls() - n, cm.beatWindowIndex], [1, 2], 'the dropped record is rebuilt on the way forward');
assert.includes(lastCall().prompt, '<existing_past_canon_events>\n- 고친 사건 한 줄\n</existing_past_canon_events>', 'built on the edited text');
h.state.reply = '<past_canon_events>\n- 다시 쓴 사건\n</past_canon_events>';
await app.redoPast();
assert.includes(lastCall().prompt, '<canon_beats beats="B21~B40">', 'redo reads the Beats that record added');
assert.excludes(lastCall().systemPrompt + lastCall().prompt, 'RP전용', 'redo does not read the chat either');
assert.same(snaps(cm, A), [[20, 'B20', '- 고친 사건 한 줄'], [40, 'B40', '- 고친 사건 한 줄\n- 다시 쓴 사건']]);
h.state.fail = new Error('x');
await app.redoPast();
assert.same([snaps(cm, A)[1][2], app.isBusy()], ['- 고친 사건 한 줄\n- 다시 쓴 사건', false], 'a failed redo leaves the record');
h.state.fail = null;
h.state.reply = evt;
await app.shiftWindow(-1);
await app.redoPast();
assert.includes(lastCall().prompt, '(none yet)');
assert.same(snaps(cm, A), [[20, 'B20', E1]], 'redoing an earlier record drops the later one');
await app.shiftWindow(-1);
n = calls();
await app.redoPast();
assert.same([calls() - n, await app.editPast('- x'), h.toasts.at(-1)], [0, false, 'info:다시 정리할 지난 사건 기록이 없어요.'], 'first window: nothing to redo or edit');

// ---- only inside the current file
await app.shiftWindow(1);
await app.switchFile(1, { summarize: false });
p = app.plannedInjection();
assert.same([p.file.name, p.win.label, p.past, md().includes(PAST_LABEL), md().includes(E1)], ['b.md', 'B01 ~ B20', null, false, false], 'another file starts without the previous file\'s events');
n = calls();
await app.shiftWindow(1);
assert.includes(lastCall().prompt, '(none yet)', 'the other file\'s record is not passed along');
assert.ok(raw(lastCall().prompt, 'B01', 'b-') && !raw(lastCall().prompt, 'B01'));
assert.same([calls() - n, snaps(cm, B), snaps(cm, A)], [1, [[20, 'B20', '- b편 B01부터 B20까지의 사건']], [[20, 'B20', E1]]], 'each file keeps its own record');
assert.ok(md().includes('- b편 B01부터 B20까지의 사건') && !md().includes(E1));
await app.switchFile(-1, { summarize: false });
n = calls();
await app.shiftWindow(1);
assert.same([app.plannedInjection().file.name, calls() - n, md().includes(E1)], ['a.md', 0, true], 'back in the first file: its record is still there');

// the file was edited so the record no longer lines up → ignored, rebuilt on the next move
app.addFile('a.md', mk(['B00', ...ids(44)]));
p = app.plannedInjection();
assert.same([p.win.label, p.past, md().includes(PAST_LABEL), p.pending.from, p.pending.lastId], ['B20 ~ B39', null, false, 0, 'B39']);
app.addFile('a.md', mk(ids(45)));
assert.strictEqual(app.plannedInjection().past.text, E1, 'the original text back → the record applies again');

// a file without Beat headings: no windows, no labels, nothing to record
await app.switchFile(1, { summarize: false }); await app.switchFile(1, { summarize: false });
p = app.plannedInjection();
assert.same([p.file.name, p.past, p.pending, md().includes(WINDOW_LABEL), md().includes(PAST_LABEL)], ['c.md', null, null, false, false]);
n = calls();
await app.shiftWindow(1);
assert.strictEqual(calls() - n, 0);

// ---- Canon Episode / Chapter / Saga: unchanged, and still the only place the chat is read
await app.switchFile(-1, { summarize: false }); await app.switchFile(-1, { summarize: false });
await app.shiftWindow(1);
chat.push({ is_user: false, name: 'Rin', mes: 'RP전용 둘: 이 파일 구간의 한 턴.', is_system: false, extra: {} });
h.state.reply = '<canon_episode>\ntitle: a편\nkeywords: 코토코\nsummary:\n- a편 진행 기록\n</canon_episode>';
n = calls();
await app.switchFile(1);
const ep = h.sent();
assert.same([calls() - n, cm.timeline.length, cm.timeline[0].tier, cm.timeline[0].sourceFileId === A.id], [1, 1, 'episode', true], 'one Canon Episode for the file, as before');
assert.ok(raw(ep, 'B01') && raw(ep, 'B45'), 'the episode reads the whole script of the file');
assert.includes(ep, 'RP전용 둘', 'the episode still compares the script with the chat');
assert.excludes(ep, PAST_LABEL);
assert.excludes(ep, E1, 'past canon events are not an input of the episode');
assert.same(snaps(cm, A), [[20, 'B20', E1]], 'writing the episode leaves the event record alone');
// now on b.md: the stretch of a.md is in the prompt once (as its episode), not also as past events
assert.includes(mem(), 'a편 진행 기록');
assert.excludes(mem(), PAST_LABEL);
assert.same([app.plannedInjection().file.name, md().includes(E1), md().includes(PAST_LABEL)], ['b.md', false, false]);

// ---- switched off (settings.pastEnabled = false): not injected, not written, and nothing deleted
assert.strictEqual(app.defaultSettings.pastEnabled, true, 'on by default, so an existing install behaves as before');
h.state.chatId = 'P';
h.state.reply = evt;
await app.setOn(true);
const cp = app.getMemory(false);
assert.same([app.plannedInjection().file.name, cp.beatWindowIndex, app.plannedInjection().pending.to], ['a.md', 0, 20], 'on: leaving the first window owes a record');
s.pastEnabled = false;
app.refreshInjection();
p = app.plannedInjection();
assert.same([p.past, p.pending, p.win.label], [null, null, 'B01 ~ B20'], 'off: nothing shown, nothing owed');
n = calls();
h.confirms.length = 0;
await app.shiftWindow(1);
assert.same([calls() - n, h.confirms.length, cp.beatWindowIndex, cp.pastEvents], [0, 0, 1, {}], 'off: [다음 20 Beat] moves at once — no question, no call, no record');
t = md();
assert.excludes(t, PAST_LABEL, 'off: no [PAST CANON EVENTS] section');
assert.ok(t.includes(`\n\n${HEADER_LABEL}\n${HEADER}\n\n${WINDOW_LABEL}\n\n## B21 — `), 'off: [FILE HEADER], then [CURRENT CANON WINDOW]');
assert.ok(ids(20, 21).every(id => raw(t, id)) && !raw(t, 'B20') && !raw(t, 'B41'), 'off: the window itself is the same');
assert.strictEqual(app.plannedInjection().md, t, 'off: the panel still shows the injected string');

// on again in the middle of a file: what was passed while off is caught up by the next move
s.pastEnabled = true;
app.refreshInjection();
p = app.plannedInjection();
assert.same([p.past, p.pending.from, p.pending.to, md().includes(PAST_LABEL)], [null, 0, 40, false], 'on again: no record yet; the next move owes both windows');
await app.shiftWindow(1);
const E12 = '- B01부터 B40까지의 사건';
assert.same([calls() - n, cp.beatWindowIndex, snaps(cp, A)], [1, 2, [[40, 'B40', E12]]], 'one call covers the window passed while off');
assert.ok(md().includes(`${E12}\n\n${WINDOW_LABEL}\n\n## B41 — `));

// off with a record in place: it leaves the prompt but stays stored, and cannot be redone or edited
s.pastEnabled = false;
app.refreshInjection();
t = md();
assert.excludes(t, PAST_LABEL);
assert.excludes(t, E12, 'off: the stored record is not injected');
assert.excludes(t, getPrompt(s, 'pastHeader'), 'off: its explanation is not injected either');
assert.ok(t.includes(`\n\n${HEADER_LABEL}\n${HEADER}\n\n${WINDOW_LABEL}\n\n## B41 — `));
assert.same(snaps(cp, A), [[40, 'B40', E12]], 'off: the record is kept');
n = calls();
await app.redoPast();
assert.ok(h.toasts.at(-1).startsWith('info:지난 원작 사건이 꺼져 있어요'), 'off: redo says why it does nothing');
assert.same([calls() - n, await app.editPast('- x'), snaps(cp, A)], [0, false, [[40, 'B40', E12]]], 'off: nothing to redo or edit');
await app.shiftWindow(-1); await app.shiftWindow(-1); await app.shiftWindow(1); await app.shiftWindow(1);
assert.same([calls() - n, cp.beatWindowIndex, snaps(cp, A), md().includes(PAST_LABEL)], [0, 2, [[40, 'B40', E12]], false], 'off: back and forth without a call, records untouched');
assert.same([mem(), cp.timeline.length], ['', 0], 'off: canon memory is a separate thing and is not affected');
assert.same(snaps(h.metas.F[app.META_KEY], A).map(x => x[0]), [20, 40], 'off: the records of other chats are kept too');

// on once more: the record is back exactly as it was
s.pastEnabled = true;
app.refreshInjection();
assert.ok(md().includes(`${PAST_LABEL}\n${getPrompt(s, 'pastHeader')}\n\n${E12}\n\n${WINDOW_LABEL}\n\n## B41 — `), 'on: the stored record is injected again');
assert.strictEqual(app.plannedInjection().past.count, 40);
console.log('past ok');
