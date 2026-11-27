// The Beat window in the running extension: only the current window is injected, the panel's
// text is the injected text, moving, per-chat position, reset on file change, the date reminder.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { normalizeMemory } from '../src/state.js';
import { getPrompt } from '../src/prompts.js';
import { dateNumber } from '../src/files.js';

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const HEADER = '# Canon Timeline\n\n이 파일은 세계의 배경 역사이다.';
const mk = (list, dates = {}) => [HEADER, ...list.map(id => `## ${id} — 제목 ${id}\n\n[TIME]\n${dates[id] ? `date: ${dates[id]}\n` : ''}\n[TARGET]\n- ${id} 내용`)].join('\n\n---\n\n');
const has = (text, id) => text.includes(`## ${id} — `);

const chat = makeChat(6, (i) => (i === 3 ? '<date>1990-06-17</date> 전날.' : `Line ${i}`));
const h = load({ chat });
const s = app.getSettings();
s.files.length = 0; s.retries = 0; s.beatWindowSize = 20;
app.addFile('고등학교편.md', mk(ids(71), { B20: '1990/06/18', B40: '1990/07/09~1990/07/11' }) + '\n\n---\nNEXT_FILE_HINT: 1991-03-01\n---');
app.addFile('b.md', mk(ids(5), { B05: '1990/06/18' }));
app.addFile('c.md', '# 일반 문서\n\nBeat 제목이 없는 원작 줄거리.');
const md = () => h.prompts[app.PROMPT_KEY_MD].text;
const push = (mes) => chat.push({ is_user: false, name: 'Rin', mes, is_system: false, extra: {} });
// Moving forward records the window being left ([PAST CANON EVENTS], tests/past.test.js): one call per new window.
h.state.reply = (args) => { const m = args.prompt.match(/<canon_beats beats="([^"~]+)~([^"]+)">/); return `<past_canon_events>\n- ${m[1]}부터 ${m[2]}까지의 사건\n</past_canon_events>`; };
const calls = () => h.state.calls.length;

// off: nothing, and no window to show
app.refreshInjection();
assert.same([md(), app.plannedInjection().win], ['', null], 'off: no injection, no window');

await app.setOn(true);
const cm = app.getMemory(false);
let p = app.plannedInjection();
assert.same([p.win.label, p.win.index, p.win.count, p.win.total, cm.beatWindowIndex], ['B01 ~ B20', 0, 4, 71, 0], 'starts at the first window');
assert.strictEqual(p.md, md(), 'what the panel shows is the injected string');
assert.ok(md().startsWith('<canon_baseline file="고등학교편.md" beats="B01~B20">'), 'wrapper names the window');
assert.ok(md().includes(`${HEADER}\n\n[CURRENT CANON WINDOW]\n\n## B01 — `), 'file header, then the current window');
assert.excludes(md(), '[PAST CANON EVENTS]', 'the first window has no past events');
assert.ok(ids(20).every(id => has(md(), id)) && !ids(51, 21).some(id => has(md(), id)), 'only B01~B20 in the prompt');
assert.excludes(md(), 'NEXT_FILE_HINT');
assert.same([h.prompts[app.PROMPT_KEY_MD].position, h.prompts[app.PROMPT_KEY_MD].depth], [1, 12], 'position and depth unchanged');

// next window: B21~B40 only; the window left behind is recorded first (one call), no canon episode
await app.shiftWindow(1);
p = app.plannedInjection();
assert.same([cm.beatWindowIndex, p.win.label, calls(), cm.timeline.length], [1, 'B21 ~ B40', 1, 0]);
assert.ok(ids(20, 21).every(id => has(md(), id)) && !ids(20).some(id => has(md(), id)) && !ids(31, 41).some(id => has(md(), id)), 'only B21~B40 in the prompt');
assert.ok(md().includes(HEADER) && md().includes('beats="B21~B40"'));
assert.ok(md().includes('- B01부터 B20까지의 사건') && md().includes('[CURRENT CANON WINDOW]\n\n## B21 — '), 'the window left behind stays as its event record');
assert.strictEqual(p.md, md(), 'panel text follows the injection');
await app.shiftWindow(1); await app.shiftWindow(1);
assert.same([cm.beatWindowIndex, app.plannedInjection().win.label, calls()], [3, 'B61 ~ B71', 3], 'last window holds the remaining Beats');
assert.ok(has(md(), 'B71') && !has(md(), 'B60'));
await app.shiftWindow(1);
assert.same([cm.beatWindowIndex, h.toasts.at(-1), calls()], [3, 'info:마지막 Beat 구간이에요.', 3], 'cannot go past the last window');
await app.shiftWindow(-1); await app.shiftWindow(-1); await app.shiftWindow(-1);
assert.same([cm.beatWindowIndex, calls()], [0, 3], 'going back never calls the model');
await app.shiftWindow(-1);
assert.same([cm.beatWindowIndex, h.toasts.at(-1)], [0, 'info:첫 Beat 구간이에요.'], 'cannot go before the first window');

// window size is a setting; the position is clamped when the count shrinks
await app.shiftWindow(1); await app.shiftWindow(1);
assert.same([cm.beatWindowIndex, calls()], [2, 3], 'windows already recorded are passed without a call');
s.beatWindowSize = 50; app.refreshInjection();
assert.same([app.plannedInjection().win.label, app.plannedInjection().win.count], ['B51 ~ B71', 2], 'index 2 clamped to the last of two windows');
s.beatWindowSize = 20; app.refreshInjection();

// per chat: A stays where it is, a new chat B starts at the first window
h.state.chatId = 'B';
await app.setOn(true);
assert.same([app.getMemory(false).beatWindowIndex, app.plannedInjection().win.label], [0, 'B01 ~ B20'], 'chat B starts at B01~B20');
assert.ok(has(md(), 'B01') && !has(md(), 'B41'));
h.state.chatId = 'c';
app.refreshInjection();
assert.same([app.getMemory(false).beatWindowIndex, app.plannedInjection().win.label], [2, 'B41 ~ B60'], 'chat A still at B41~B60');
assert.ok(has(md(), 'B41') && !has(md(), 'B01'));
assert.same([h.metas.c[app.META_KEY].beatWindowIndex, h.metas.B[app.META_KEY].beatWindowIndex, s.beatWindowIndex], [2, 0, undefined], 'stored in chat metadata, not in the settings');
assert.strictEqual(normalizeMemory(JSON.parse(JSON.stringify(h.metas.c[app.META_KEY]))).beatWindowIndex, 2, 'survives save and reload');
assert.strictEqual(normalizeMemory({ beatWindowIndex: -4 }).beatWindowIndex, 0, 'bad stored value → first window');

// changing the file resets the window; small and heading-less files are one window
await app.switchFile(1, { summarize: false });
p = app.plannedInjection();
assert.same([cm.beatWindowIndex, p.file.name, p.win.label, p.win.count], [0, 'b.md', 'B01 ~ B05', 1], 'next file starts at its first window');
assert.ok(ids(5).every(id => has(md(), id)));
await app.shiftWindow(1);
assert.strictEqual(cm.beatWindowIndex, 0, 'a one-window file has nowhere to go');
await app.switchFile(1, { summarize: false });
p = app.plannedInjection();
assert.same([p.file.name, p.win.total, p.win.count, p.win.label], ['c.md', 0, 1, '파일 전체']);
assert.strictEqual(md(), '<canon_baseline file="c.md">\n' + getPrompt(s, 'mdHeader', { file: 'c.md' }) + '\n\n# 일반 문서\n\nBeat 제목이 없는 원작 줄거리.\n</canon_baseline>', 'no Beat headings: the whole file, as before');
await app.switchFile(-1, { summarize: false }); await app.switchFile(-1, { summarize: false });
assert.same([app.plannedInjection().file.name, cm.beatWindowIndex], ['고등학교편.md', 0], 'coming back to a file starts at its first window again');

// deleting the checked file: the file that takes its place starts at its first window
await app.shiftWindow(1);
const keep = s.files[0];
s.files.splice(0, 1);
app.refreshInjection();
assert.same([app.plannedInjection().file.name, cm.beatWindowIndex], ['b.md', 0], 'replacement file from its first window');
s.files.unshift(keep);
await app.switchFile(-1, { summarize: false });
assert.same([app.plannedInjection().file.name, app.plannedInjection().win.label], ['고등학교편.md', 'B01 ~ B20']);

// ---- last-date reminder: once per window, when the story date has reached or already passed the
// window's last Beat date; never moves anything. (The newest dated message is the story's date.)
const callsSoFar = calls();
assert.same([dateNumber('1990/6/18'), dateNumber('1990-06-18'), dateNumber('1990년 6월 18일 (월)'), dateNumber('1990.12.31') < dateNumber('1991/1/1'), dateNumber('1990-10-01') > dateNumber('1990.9.30')], [19900618, 19900618, 19900618, true, true], 'dates are compared as dates, read by the same parser');
assert.ok(Number.isNaN(dateNumber('미정')) && !(dateNumber('미정') >= dateNumber('1990-06-18')) && !(dateNumber('1990-06-18') >= dateNumber('')), 'no readable date → never a match');
assert.strictEqual(app.plannedInjection().win.lastDate, '1990-06-18', 'B20 date');
// 1. before the last date → nothing
assert.strictEqual(app.checkBeatDate(), false, '06-17 < 06-18: no reminder');
// 2. on the last date → once
push('<date>1990/06/18</date> 그날.');
h.toasts.length = 0; h.titles.length = 0;
assert.strictEqual(app.checkBeatDate(), true, 'story date equals the last Beat\'s date → reminder');
assert.same([h.toasts, h.titles], [['ok:현재 Canon Beat 구간의 마지막 날짜에 도달했거나 지났습니다.'], ['Canon Timeline']], 'toastr.success with the Canon Timeline title');
assert.same(cm.lastBeatDateNotice, { fileId: keep.id, windowIndex: 0, date: '1990-06-18' });
assert.same([app.checkBeatDate(), app.checkBeatDate()], [false, false], 'not again for the same window');
push('같은 날 또 한 턴.');
assert.strictEqual(app.checkBeatDate(), false, 'not again on later messages of the same day');
push('<date>1990/06/19</date> 다음 날.');
assert.strictEqual(app.checkBeatDate(), false, '06-19: already shown for this window');
push('<date>1990/06/25</date> 일주일 뒤.');
assert.strictEqual(app.checkBeatDate(), false, '06-25: still not again');
assert.same([cm.beatWindowIndex, calls() - callsSoFar, cm.timeline.length, app.plannedInjection().file.name, h.toasts.length], [0, 0, 0, '고등학교편.md', 1], 'no move, no call, no record, no file switch');
const before = md();
app.refreshInjection();
assert.strictEqual(md(), before, 'the prompt is not changed by the reminder');

// 3–4. the story skipped over the date: 06-17 nothing, 06-21 once, 06-22 nothing
cm.lastBeatDateNotice = null;
push('<date>1990/06/17</date> (다른 진행) 전날.');
assert.strictEqual(app.checkBeatDate(), false, '06-17: not yet');
push('<date>1990/06/21</date> 사흘을 건너뛰었다.');
h.toasts.length = 0;
assert.strictEqual(app.checkBeatDate(), true, '06-21 > 06-18: the last date was passed → reminder');
assert.same([h.toasts, cm.lastBeatDateNotice], [['ok:현재 Canon Beat 구간의 마지막 날짜에 도달했거나 지났습니다.'], { fileId: keep.id, windowIndex: 0, date: '1990-06-18' }]);
push('<date>1990/06/22</date> 그 다음 날.');
assert.strictEqual(app.checkBeatDate(), false, '06-22: once only');
assert.same([cm.beatWindowIndex, calls() - callsSoFar, cm.timeline.length], [0, 0, 0], 'still no move, no call, no record');

// 5. another window is judged on its own last Beat: a last date still ahead → nothing
await app.shiftWindow(1);
assert.strictEqual(app.plannedInjection().win.lastDate, '1990-07-11', 'B40 range → end date');
assert.strictEqual(app.checkBeatDate(), false, '06-22 < 07-11: the new window\'s last date is still ahead');
push('<date>1990-07-09</date> 기간의 첫날.');
assert.strictEqual(app.checkBeatDate(), false, 'the start of the range is not its end');
// 6. past the end of the range → once
push('<date>1990.7.13</date> 기간이 끝난 뒤.');
assert.strictEqual(app.checkBeatDate(), true, '07-13 > 07-11: past the end of the range → reminder for window 2');
assert.same([cm.lastBeatDateNotice.windowIndex, cm.lastBeatDateNotice.date, app.checkBeatDate()], [1, '1990-07-11', false]);
push('<date>1990/07/20</date> 한참 뒤.');
assert.strictEqual(app.checkBeatDate(), false, 'later dates do not remind again');
cm.lastBeatDateNotice = null;
push('<date>1990.7.11</date> (다른 진행) 기간의 끝날.');
assert.strictEqual(app.checkBeatDate(), true, 'the end date itself counts too');
push('<date>1990/07/20</date> 다시 한참 뒤.');
assert.strictEqual(app.checkBeatDate(), false);

// last Beat without a date → no reminder, nothing guessed
await app.shiftWindow(1);
assert.same([app.plannedInjection().win.lastId, app.plannedInjection().win.lastDate, app.checkBeatDate()], ['B60', null, false]);

// back in the window that reminded last: not again. Only the latest reminder is remembered
// (lastBeatDateNotice), so a window revisited after another one reminded says it once more.
await app.shiftWindow(-1);
assert.same([cm.beatWindowIndex, app.checkBeatDate()], [1, false], 'same file, window and date as the stored notice → nothing');
await app.shiftWindow(-1);
assert.same([cm.beatWindowIndex, app.checkBeatDate(), app.checkBeatDate()], [0, true, false], 'another window than the stored notice → once, then quiet');

// another file with the same window index and the same date is not blocked by the first file's record
await app.switchFile(1, { summarize: false });
assert.same([app.plannedInjection().file.name, app.plannedInjection().win.lastDate, cm.lastBeatDateNotice.fileId === keep.id], ['b.md', '1990-06-18', true]);
assert.strictEqual(app.checkBeatDate(), true, 'new file → its own reminder');
assert.same([cm.lastBeatDateNotice.fileId === s.files[1].id, app.checkBeatDate()], [true, false]);

// switches: the notice setting, the chat switch, a heading-less file
cm.lastBeatDateNotice = null;
s.hintEnabled = false;
assert.strictEqual(app.checkBeatDate(), false, 'notices off');
s.hintEnabled = true;
await app.setOn(false);
assert.strictEqual(app.checkBeatDate(), false, 'chat off');
await app.setOn(true);
assert.strictEqual(app.checkBeatDate(), true);
await app.switchFile(1, { summarize: false });
assert.strictEqual(app.checkBeatDate(), false, 'a file without Beats has no last date');

// Canon Memory is untouched by all of this: the episode on [다음 파일] still reads the whole file
await app.switchFile(-1, { summarize: false }); await app.switchFile(-1, { summarize: false });
await app.shiftWindow(1);
push('고등학교편 구간에서 한 턴.');
h.state.reply = '<canon_episode>\ntitle: 고등학교편\nkeywords: 코토코\nsummary:\n- 기록\n</canon_episode>';
await app.switchFile(1);
assert.same([calls() - callsSoFar, cm.timeline.length, cm.timeline[0].sourceFileId === keep.id, cm.beatWindowIndex], [1, 1, true, 0], 'one episode for the file (the only call since the reminders); new file at its first window');
assert.ok(has(h.sent(), 'B01') && has(h.sent(), 'B71'), 'the summary call still gets the whole script of the file');
assert.excludes(h.sent(), '[PAST CANON EVENTS]', 'the episode is written from the script and the chat, as before');
assert.includes(h.prompts[app.PROMPT_KEY_MEM].text, '고등학교편', 'canon memory injected as before');
console.log('window ok');
