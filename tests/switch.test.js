// [다음 파일] / [이전 파일] / covered files / 다시 요약 / failures.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { coveredFileIds } from '../src/state.js';

const chat = makeChat(30, (i) => (i === 7 ? '<date>1996/05/10</date> 아침이 밝았다.' : `Line ${i}`));
const h = load({ chat });
const s = app.getSettings();
s.files.length = 0; s.retries = 0;
app.addFile('01.md', '# 1\n\n[CANON_BEAT]\nid: B01\n[/CANON_BEAT]\n\nNEXT_FILE_HINT: 1996-05-12');
app.addFile('02.md', '# 2\n\nB06 집 붕괴.');
app.addFile('03.md', '# 3');
await app.setOn(true);
const cm = app.getMemory(false);
const idx = () => s.files.findIndex(f => f.id === cm.fileId);

// next: one call, episode stored, pointer moved, start reset
h.state.reply = '<canon_episode>\ntitle: 고백과 거절\nkeywords: 코토코, 나오키\nsummary:\n- 고백과 거절은 원작대로 일어났다.\n- 마코의 개입으로 코토코는 혼자 울지 않았다.\n</canon_episode>';
await app.switchFile(1);
assert.strictEqual(h.state.calls.length, 1, 'one model call');
const sent = h.sent();
assert.includes(sent, '<canon_script file="01.md">', 'md sent as script');
assert.includes(sent, '[CANON_BEAT]');
assert.excludes(sent, 'NEXT_FILE_HINT', 'hint not sent');
assert.includes(sent, '<transcript messages="#0-#29">', 'the whole stretch');
assert.includes(sent, '[#29] Rin: Line 29');
assert.includes(sent, '[#7] Rin: (date: 1996/05/10) 아침이 밝았다.', 'date tag kept as text');
assert.excludes(sent, 'story_memory', 'no story memory of any kind');
assert.includes(sent, '<canon_episode>', 'format block');
assert.strictEqual(idx(), 1, 'pointer moved');
assert.strictEqual(cm.startMessage, 30, 'next stretch starts after the last message');
assert.strictEqual(cm.timeline.length, 1);
const ep = cm.timeline[0];
assert.same([ep.tier, ep.title, ep.fileName, ep.from, ep.to, ep.when, ep.sourceFileId === s.files[0].id], ['episode', '고백과 거절', '01.md', 0, 29, '1996-05-10', true]);
assert.includes(h.prompts[app.PROMPT_KEY_MD].text, 'B06 집 붕괴', 'second file injected now');
assert.includes(h.prompts[app.PROMPT_KEY_MEM].text, '고백과 거절', 'canon memory injected');
assert.ok(h.confirms.at(-1).includes('API 1회'), 'confirm names the call');

// prev: no call, no episode, pointer back
await app.switchFile(-1);
assert.strictEqual(h.state.calls.length, 1, 'prev makes no call');
assert.strictEqual(idx(), 0);
assert.strictEqual(cm.timeline.length, 1, 'no episode on prev');
await app.switchFile(-1);
assert.strictEqual(idx(), 0, 'first file stays');
assert.ok(h.toasts.some(t => t === 'info:첫 파일이에요.'));

// covered file: next again moves without a call and without a second episode
h.state.reply = '<canon_episode>\ntitle: 두 번째면 안 됨\nkeywords: x\nsummary:\n- no\n</canon_episode>';
chat.push({ is_user: false, name: 'Rin', mes: '01 구간에서 한 턴 더.', is_system: false, extra: {} });
await app.switchFile(1);
assert.strictEqual(h.state.calls.length, 1, 'covered file: no model call');
assert.strictEqual(cm.timeline.length, 1, 'covered file: no duplicate');
assert.strictEqual(idx(), 1, 'pointer moved anyway');
assert.ok(h.confirms.at(-1).includes('이미 있어서 다시 쓰지 않아요'), 'confirm says so');
assert.ok(coveredFileIds(cm).has(s.files[0].id) && !coveredFileIds(cm).has(s.files[1].id));

// failure: garbage reply → pointer unchanged, nothing stored, error shown
cm.startMessage = 20;
h.state.reply = 'garbage without a block';
await app.switchFile(1);
assert.strictEqual(idx(), 1, 'parse failure: pointer unchanged');
assert.strictEqual(cm.timeline.length, 1, 'parse failure: nothing stored');
assert.ok(h.toasts.some(t => t.startsWith('err:')), 'error shown');
h.state.reply = '';
h.state.fail = new Error('boom');
await app.switchFile(1);
assert.strictEqual(idx(), 1, 'transport failure: pointer unchanged');
h.state.fail = null;
// refusal
h.state.reply = 'I\'m sorry, I cannot help with that.';
await app.switchFile(1);
assert.strictEqual(idx(), 1, 'refusal: pointer unchanged');
assert.ok(h.toasts.at(-1).includes('거절'));

// user cancels the confirm → nothing
h.state.confirm = false;
h.state.reply = '<canon_episode>\ntitle: t\nkeywords: k\nsummary:\n- s\n</canon_episode>';
const calls = h.state.calls.length;
await app.switchFile(1);
assert.same([h.state.calls.length, idx(), cm.timeline.length], [calls, 1, 1], 'cancelled: no call, no move');
h.state.confirm = true;

// 다시 요약: rewrites in place; failure keeps the old text; unknown id → nothing
h.state.reply = '<canon_episode>\ntitle: 다시 쓴 제목\nkeywords: k\nsummary:\n- 다시 쓴 내용\n</canon_episode>';
const n0 = h.state.calls.length;
await app.resummarize(ep.id);
assert.strictEqual(h.state.calls.length, n0 + 1, 'resummarize: one call');
assert.includes(h.sent(), '<transcript messages="#0-#29">', 'same message range');
assert.includes(h.sent(), '<canon_script file="01.md">', 'its own file');
assert.same([ep.title, ep.text, cm.timeline.length], ['다시 쓴 제목', '- 다시 쓴 내용', 1], 'rewritten in place');
h.state.reply = 'nonsense';
await app.resummarize(ep.id);
assert.strictEqual(ep.text, '- 다시 쓴 내용', 'failed rewrite keeps the old text');
await app.resummarize('no-such-id');
assert.strictEqual(h.state.calls.length, n0 + 3, 'unknown id: no call');
h.state.reply = '<canon_episode>\ntitle: x\nkeywords: k\nsummary:\n- x\n</canon_episode>';
s.files.splice(0, 1);   // its file is gone
await app.resummarize(ep.id);
assert.strictEqual(h.state.calls.length, n0 + 3, 'file gone: no call');
assert.ok(h.toasts.at(-1).includes('목록에 없어요'));

// reorder/delete keep the checked file by id
app.addFile('01.md', '# 1 again');
assert.same(s.files.map(f => f.name), ['02.md', '03.md', '01.md']);
assert.strictEqual(s.files[idx()].name, '02.md', 'checked file follows its id');
app.moveFile(s.files[0].id, 1);
assert.strictEqual(s.files[idx()].name, '02.md', 'still checked after reorder');
assert.strictEqual(idx(), 1);
app.removeFile(s.files[0].id);
assert.strictEqual(s.files[idx()].name, '02.md', 'still checked after deleting the file before it');

// delete / edit a record
await app.deleteNode(ep.id);
assert.strictEqual(cm.timeline.length, 0, 'deleted');
assert.strictEqual(h.prompts[app.PROMPT_KEY_MEM].text, '', 'memory block gone');
console.log('switch ok');
