// Fixing the checked file from the screen — [이 구간 고치기] / [머리말 고치기] (app.editSource):
// the box shows the part now injected as the stored file has it, saving replaces exactly those
// lines and the injection follows; nothing else in the file, no record and no model is touched.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { parseHint } from '../src/files.js';
import { PAST_LABEL, HEADER_LABEL } from '../src/inject.js';

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const HEAD = '# Canon Timeline\n\n배경 역사.';
const mk = (list) => `${[HEAD, ...list.map(id => `## ${id} — 제목 ${id}\n\n[TARGET]\n- ${id} 내용`)].join('\n\n---\n\n')}\n\n---\nNEXT_FILE_HINT: 1996-05-12\n---\n`;
const evt = (args) => {
    const m = args.prompt.match(/<canon_beats beats="([^"~]+)~([^"]+)">/);
    return `<past_canon_events>\n- ${m[1]}부터 ${m[2]}까지의 사건\n</past_canon_events>`;
};

const h = load({ chat: makeChat(6), reply: evt });
const s = app.getSettings();
s.files.length = 0; s.retries = 0; s.beatWindowSize = 20; s.pastEnabled = true;
const ORIGINAL = mk(ids(45));
const { file } = app.addFile('a.md', ORIGINAL);
app.addFile('c.md', '# 일반 문서\n\nBeat 제목이 없는 원작 줄거리.\n\n---\nNEXT_FILE_HINT: 1996-06-01\n');
app.addFile('d.md', '## B01 — a\n\nx\n\n## B02 — b\n\ny');
const md = () => h.prompts[app.PROMPT_KEY_MD].text;
const last = () => h.toasts.at(-1);

// the box: what it showed, and what the user does with it
const boxes = [];
let answer = (shown) => shown;
h.context.Popup.show.input = async (title, msg, value, opts) => { boxes.push({ title, msg, value, opts }); return answer(value); };
const box = () => boxes.at(-1);

// ---- only where a canon file is injected
assert.same([await app.editSource(), boxes.length, last()], [false, 0, 'info:지금 넣고 있는 원작 파일이 없어요. 이 채팅에서 원작 진행을 켜 주세요.']);
await app.setOn(true);

// ---- this window's Beats, as the file has them → saved → injected
answer = (v) => v.replace('- B03 내용', '- B03 고친 내용');
assert.strictEqual(await app.editSource(), true);
assert.ok(box().value.startsWith('## B01 — 제목 B01') && box().value.endsWith('- B20 내용') && !box().value.includes('B21'), 'the box holds this window, as written in the file');
assert.ok(!box().value.includes('Canon Timeline') && !box().value.includes('<canon_baseline'), 'not the header, not the instruction around it');
assert.includes(box().msg, 'a.md의 B01 ~ B20 구간이 md 파일에 적힌 그대로예요');
assert.includes(box().msg, '원본 .md 파일은 바뀌지 않아요');
assert.same([box().opts.rows, box().opts.wide, box().opts.large, box().opts.okButton, box().opts.cancelButton], [18, true, true, '저장', '취소']);
assert.strictEqual(file.text, ORIGINAL.replace('- B03 내용', '- B03 고친 내용'), 'exactly that line changed; the rest of the file, hint footer included, is as it was');
assert.same([md().includes('- B03 고친 내용'), md().includes('- B03 내용'), parseHint(file.text).raw], [true, false, '1996-05-12'], 'injected at once');
assert.strictEqual(last(), 'ok:a.md의 B01 ~ B20 구간을 고쳤어요.');
assert.strictEqual(h.state.calls.length, 0, 'no model call');

// ---- cancelled, unchanged, emptied: nothing is written
const keep = file.text;
const stamp = file.updatedAt;
answer = () => null;
assert.same([await app.editSource(), file.text === keep], [false, true], 'cancelled');
answer = (v) => v;
assert.same([await app.editSource(), file.text === keep, last()], [false, true, 'info:바뀐 내용이 없어요.']);
answer = (v) => `${v}\n\n  \n`;
assert.same([await app.editSource(), file.text === keep, last()], [false, true, 'info:바뀐 내용이 없어요.'], 'blank lines at the end are not a change');
answer = () => '  \n ';
assert.same([await app.editSource(), file.text === keep, file.updatedAt === stamp], [false, true, true]);
assert.ok(last().startsWith('info:내용이 비어 있어 저장하지 않았어요'), 'an emptied box does not delete the Beats');

// ---- the file's header
answer = (v) => v.replace('배경 역사.', '고친 배경 역사.');
assert.strictEqual(await app.editSource('header'), true);
assert.strictEqual(box().value, HEAD);
assert.includes(box().msg, 'a.md의 머리말(첫 Beat 앞부분)이');
assert.includes(md(), `${HEADER_LABEL}\n# Canon Timeline\n\n고친 배경 역사.`);
assert.strictEqual(last(), 'ok:a.md의 머리말(첫 Beat 앞부분)을 고쳤어요.');

// ---- the next window: its own Beats; the record injected with it covers earlier Beats
await app.shiftWindow(1);
assert.includes(md(), PAST_LABEL);
const calls = h.state.calls.length;
answer = (v) => v.replace('- B21 내용', '- B21 고친 내용');
assert.strictEqual(await app.editSource(), true);
assert.ok(box().value.startsWith('## B21 — ') && box().value.endsWith('- B40 내용') && !box().value.includes('B20') && !box().value.includes('B41'));
assert.strictEqual(last(), 'ok:a.md의 B21 ~ B40 구간을 고쳤어요.', 'nothing was built from this window yet: nothing more to say');
assert.same([h.state.calls.length - calls, md().includes('- B21 고친 내용'), file.text.includes('- B03 고친 내용')], [0, true, true]);

// ---- a window whose past-events record already exists: the record stays, and the user is told
await app.shiftWindow(-1);
const records = JSON.stringify(app.getMemory(false).pastEvents);
answer = (v) => v.replace('- B05 내용', '- B05 고친 내용');
assert.strictEqual(await app.editSource(), true);
assert.includes(last(), 'ok:a.md의 B01 ~ B20 구간을 고쳤어요. 이 구간으로 이미 만든 지난 사건 기록은 그대로예요.');
assert.includes(last(), '[지난 사건 다시 정리]');
assert.strictEqual(JSON.stringify(app.getMemory(false).pastEvents), records, 'no record is touched');

// ---- a Beat added in the box is a Beat of the file
answer = (v) => `${v}\n\n---\n\n## B20a — 끼운 Beat\n\n- 새 내용`;
assert.strictEqual(await app.editSource(), true);
assert.includes(last(), 'Beat 45개 → 46개.');
assert.same([app.plannedInjection().win.total, app.plannedInjection().win.label, file.text.includes('- 새 내용\n\n---\n\n## B21 — ')], [46, 'B01 ~ B20', true]);

// ---- the file changed while the box was open
answer = (v) => { file.text = file.text.replace('- B07 내용', '- B07 그 사이에 바뀜'); return v.replace('- B08 내용', '- B08 고침'); };
assert.strictEqual(await app.editSource(), false);
assert.ok(last().startsWith('err:그 사이에 이 파일이 바뀌어서 저장하지 않았어요'));
assert.same([file.text.includes('- B07 그 사이에 바뀜'), file.text.includes('- B08 고침')], [true, false], 'the newer text is not overwritten');
answer = (v) => { file.text = file.text.replace('- B44 내용', '- B44 그 사이에 바뀜'); return v.replace('- B08 내용', '- B08 고침'); };
assert.strictEqual(await app.editSource(), true);
assert.same([file.text.includes('- B44 그 사이에 바뀜'), file.text.includes('- B08 고침')], [true, true], 'a change elsewhere in the file is kept alongside');

// ---- not while a summary is running
await app.shiftWindow(1);
let release;
h.state.reply = (args) => new Promise(res => { release = () => res(evt(args)); });
const moving = app.shiftWindow(1);
await new Promise(r => setTimeout(r, 20));
const before = boxes.length;
assert.same([app.isBusy(), await app.editSource(), boxes.length - before, last()], [true, false, 0, 'warn:이미 작업 중입니다.']);
release();
await moving;
h.state.reply = evt;
assert.strictEqual(app.isBusy(), false);

// ---- a file without Beat headings: the whole file, without its hint footer; no separate header
await app.switchFile(1, { summarize: false });
answer = (v) => v.replace('원작 줄거리', '고친 줄거리');
assert.strictEqual(await app.editSource(), true);
assert.same([box().value, parseHint(s.files[1].text).raw, md().includes('Beat 제목이 없는 고친 줄거리.')], ['# 일반 문서\n\nBeat 제목이 없는 원작 줄거리.', '1996-06-01', true]);
assert.includes(box().msg, 'c.md의 전체 내용이');
assert.same([await app.editSource('header'), last()], [false, 'info:이 파일에는 첫 Beat 앞 머리말이 없어요.']);

// ---- every Beat heading taken out: said plainly
await app.switchFile(1, { summarize: false });
assert.same([await app.editSource('header'), last()], [false, 'info:이 파일에는 첫 Beat 앞 머리말이 없어요.'], 'a file that opens with a Beat');
answer = (v) => v.replace(/^## B\d+ — /gm, '### ');
assert.strictEqual(await app.editSource(), true);
assert.includes(last(), 'Beat 2개 → 0개 (Beat 제목이 없어져서 이제 파일 전체를 한 번에 넣어요).');
assert.same([app.plannedInjection().win.total, s.files[2].text], [0, '### a\n\nx\n\n### b\n\ny']);

// ---- the file list is global: another chat that uses the file gets the fix
h.state.chatId = 'other';
await app.setOn(true);
assert.same([md().includes('- B03 고친 내용'), md().includes('고친 배경 역사.')], [true, true]);
h.state.chatId = '';
assert.same([await app.editSource(), last()], [false, 'warn:채팅을 먼저 열어주세요.']);
console.log('edit ok');
