// The number box between the arrows: app.goToBeat(n) goes to the window that holds the Beat at
// position n of the checked file — by the same rule as the arrows (tests/window.test.js,
// tests/past.test.js): immediate going back or with past events off, and going forward only after
// the record of everything before the target window is stored.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { PAST_LABEL } from '../src/inject.js';

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const mk = (list) => ['# Canon Timeline\n\n배경 역사.', ...list.map(id => `## ${id} — 제목 ${id}\n\n[TARGET]\n- ${id} 내용`)].join('\n\n---\n\n');
const evt = (args) => {
    const m = args.prompt.match(/<canon_beats beats="([^"~]+)~([^"]+)">/);
    return `<past_canon_events>\n- ${m[1]}부터 ${m[2]}까지의 사건\n</past_canon_events>`;
};

const h = load({ chat: makeChat(6), reply: evt });
const s = app.getSettings();
s.files.length = 0; s.retries = 0; s.beatWindowSize = 20; s.pastEnabled = false;
app.addFile('a.md', mk(ids(71)));
app.addFile('skip.md', mk(['B01', 'B05', 'B09', 'B13', 'B17']));
app.addFile('c.md', '# 일반 문서\n\nBeat 제목이 없는 원작 줄거리.');
const md = () => h.prompts[app.PROMPT_KEY_MD].text;
const calls = () => h.state.calls.length;
const at = () => [app.getMemory(false).beatWindowIndex, app.plannedInjection().win.label];
const last = () => h.toasts.at(-1);

// canon not on for this chat: nothing to move
assert.same([await app.goToBeat(30), last()], [false, 'info:이 채팅에서 원작 진행을 먼저 켜 주세요.']);
await app.setOn(true);
assert.same(at(), [0, 'B01 ~ B20']);

// ---- past events off: every move is immediate
h.toasts.length = 0;
assert.same([await app.goToBeat('45'), at(), calls(), h.confirms.length], [true, [2, 'B41 ~ B60'], 0, 0], 'a number from the middle of a window shows that window');
assert.same(h.toasts, ['info:45번째 Beat가 들어 있는 41~60 구간으로 옮겼어요.'], 'and says which one');
assert.ok(md().startsWith('<canon_baseline file="a.md" beats="B41~B60">'), 'the prompt follows');
h.toasts.length = 0;
assert.same([await app.goToBeat(41), await app.goToBeat(' 41 '), h.toasts], [false, false, []], 'the number already shown: nothing to do, nothing to say');
assert.same([await app.goToBeat('50'), at(), h.toasts], [false, [2, 'B41 ~ B60'], ['info:50번째 Beat는 지금 넣고 있는 구간(41~60)에 있어요.']], 'a Beat of the window shown: said, not moved');
h.toasts.length = 0;
assert.same([await app.goToBeat('1'), at(), await app.goToBeat(61), at(), h.toasts], [true, [0, 'B01 ~ B20'], true, [3, 'B61 ~ B71'], []], 'the first number of a window: there, without a word — back or forward');
assert.same([await app.goToBeat(71), at(), last()], [false, [3, 'B61 ~ B71'], 'info:71번째 Beat는 지금 넣고 있는 구간(61~71)에 있어요.']);
await app.goToBeat(21);
for (const bad of ['0', '72', '', '   ', 'abc', '4.5', '-3', 'B12', null, undefined, 1e9]) {
    h.toasts.length = 0;
    assert.same([await app.goToBeat(bad), at(), h.toasts], [false, [1, 'B21 ~ B40'], ['info:1 ~ 71 사이의 Beat 번호를 적어 주세요.']], `not a Beat number of this file: ${bad}`);
}

// the windows are the ones the size setting cuts
s.beatWindowSize = 10; app.refreshInjection();
assert.same([await app.goToBeat(25), at(), last()], [true, [2, 'B21 ~ B30'], 'info:25번째 Beat가 들어 있는 21~30 구간으로 옮겼어요.']);
s.beatWindowSize = 20; app.refreshInjection();

// by position in the file, like the counter — not by the number written in the Beat id
await app.switchFile(1, { summarize: false });
s.beatWindowSize = 2; app.refreshInjection();
assert.same([await app.goToBeat(4), at(), last()], [true, [1, 'B09 ~ B13'], 'info:4번째 Beat가 들어 있는 3~4 구간으로 옮겼어요.']);
assert.same([await app.goToBeat(5), at()], [true, [2, 'B17']], 'the last window may hold one Beat');
assert.same([await app.goToBeat(6), at(), last()], [false, [2, 'B17'], 'info:1 ~ 5 사이의 Beat 번호를 적어 주세요.']);
s.beatWindowSize = 20; app.refreshInjection();

// a file without Beat headings is one piece
await app.switchFile(1, { summarize: false });
assert.same([await app.goToBeat(1), last()], [false, 'info:이 파일은 Beat 제목이 없어 통째로 넣어요. 옮길 구간이 없어요.']);
await app.switchFile(-1, { summarize: false }); await app.switchFile(-1, { summarize: false });
assert.same([at(), calls()], [[0, 'B01 ~ B20'], 0], 'back on a.md; no model call in any of this');

// ---- past events on: going forward owes the record of everything before the target window
s.pastEnabled = true; app.refreshInjection();
const cm = app.getMemory(false);
const fileId = s.files[0].id;
const recorded = () => (cm.pastEvents?.[fileId] || []).map(x => [x.count, x.lastId]);
h.confirms.length = 0;
h.state.confirm = false;
assert.same([await app.goToBeat(45), at(), calls(), h.confirms.length], [false, [0, 'B01 ~ B20'], 0, 1], 'asked first; "no" moves nothing and calls nothing');
assert.includes(h.confirms[0], 'B01 ~ B40 구간(Beat 40개)의 원작 사건을 [PAST CANON EVENTS]에 정리한 뒤 B41 ~ B60 구간으로 넘어갈까요?', 'the question names what is read and where it lands');
assert.includes(h.confirms[0], '채팅 로그는 보내지 않음, API 1회');
h.state.confirm = true;
h.state.fail = new Error('boom');
assert.same([await app.goToBeat(45), at(), app.isBusy(), recorded()], [false, [0, 'B01 ~ B20'], false, []], 'a failed summary does not move the window');
assert.ok(last().startsWith('err:지난 원작 사건 정리 실패'));
h.state.fail = null;
let n = calls();
h.toasts.length = 0;
assert.same([await app.goToBeat(45), at(), calls() - n, recorded()], [true, [2, 'B41 ~ B60'], 1, [[40, 'B40']]], 'one call for all the Beats before the target window, then the move');
assert.includes(h.sent(), '<canon_beats beats="B01~B40">');
assert.excludes(h.sent(), 'Line 1', 'the chat is not sent');
assert.ok(md().includes(PAST_LABEL) && md().includes('- B01부터 B40까지의 사건') && md().includes('[CURRENT CANON WINDOW]\n\n## B41 — '), 'the record is injected with the window');
assert.same(h.toasts, ['info:45번째 Beat가 들어 있는 41~60 구간으로 옮겼어요.']);

// back, and forward again to a window whose record exists: no question, no call
n = calls(); h.confirms.length = 0;
assert.same([await app.goToBeat(1), at(), await app.goToBeat(41), at(), calls() - n, h.confirms.length], [true, [0, 'B01 ~ B20'], true, [2, 'B41 ~ B60'], 0, 0]);
// one window forward through the box is [다음 N Beat]: the same question, the record continued
assert.same([await app.goToBeat(61), at(), calls() - n, h.confirms.length, recorded()], [true, [3, 'B61 ~ B71'], 1, 1, [[40, 'B40'], [60, 'B60']]]);
assert.includes(h.confirms[0], 'B41 ~ B60 구간의 원작 사건을 [PAST CANON EVENTS]에 정리한 뒤 다음 구간으로 넘어갈까요?');
assert.includes(h.sent(), '<existing_past_canon_events>\n- B01부터 B40까지의 사건\n</existing_past_canon_events>');

// the arrows are unchanged: [다음] from the first window owes that window alone, with the same question as before
await app.goToBeat(1);
h.confirms.length = 0; n = calls();
await app.shiftWindow(1);
assert.same([at(), calls() - n, recorded().map(r => r[0])], [[1, 'B21 ~ B40'], 1, [20, 40, 60]]);
assert.same(h.confirms, ['B01 ~ B20 구간의 원작 사건을 [PAST CANON EVENTS]에 정리한 뒤 다음 구간으로 넘어갈까요?\n\n원작 Beat 원문만 요약 모델에 보내요 (채팅 로그는 보내지 않음, API 1회). 넘어간 뒤에는 이 구간의 원문 대신 정리된 사건 기록만 넣어요.']);

// while a summary runs, nothing else can start a move
cm.pastEvents[fileId] = cm.pastEvents[fileId].filter(x => x.count !== 60);
let release;
h.state.reply = (args) => new Promise(res => { release = () => res(evt(args)); });
const running = app.goToBeat(61);
await new Promise(r => setTimeout(r, 20));
assert.same([app.isBusy(), await app.goToBeat(1), last(), at()], [true, false, 'warn:이미 작업 중입니다.', [1, 'B21 ~ B40']]);
release();
assert.same([await running, at(), app.isBusy(), recorded().map(r => r[0])], [true, [3, 'B61 ~ B71'], false, [20, 40, 60]]);
h.state.reply = evt;

// no chat open
h.state.chatId = '';
assert.same([await app.goToBeat(1), last()], [false, 'warn:채팅을 먼저 열어주세요.']);
h.state.chatId = 'c';
console.log('jump ok');
