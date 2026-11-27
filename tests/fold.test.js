// Canon Episode → Chapter → Saga, with file coverage surviving each fold.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { coveredFileIds } from '../src/state.js';
import { stepChapter, stepSaga, compact, transcript } from '../src/memory.js';

const h = load();
const s = app.getSettings();
s.files.length = 0; s.retries = 0;
s.maxEpisodes = 2; s.chapterSize = 2; s.maxChapters = 1;
app.addFile('01.md', '# 1'); app.addFile('02.md', '# 2');
await app.setOn(true);
const cm = app.getMemory(false);
for (let i = 0; i < 3; i++) cm.timeline.push({ id: `e${i}`, tier: 'episode', sourceFileId: `file${i}`, fileName: `f${i}`, from: i * 10, to: i * 10 + 9, title: `E${i}`, text: `event ${i}`, keywords: [] });

h.state.reply = '<canon_chapter>\ntitle: 초반부\nkeywords: a, b\nsummary:\n초반 원작 진행.\n</canon_chapter>';
assert.strictEqual(await stepChapter(s, cm), true, 'over the limit → chapter');
assert.same(cm.timeline.map(n => n.tier), ['chapter', 'episode']);
assert.same([cm.timeline[0].from, cm.timeline[0].to, cm.timeline[0].title], [0, 19, '초반부']);
assert.same(cm.timeline[0].sourceFileIds, ['file0', 'file1'], 'chapter keeps its files');
assert.strictEqual(cm.archive.length, 2, 'merged episodes archived');
assert.ok(h.sent().includes('<canon_episode file="f0" messages="#0-#9" title="E0">') && h.sent().includes('event 1'), 'both episodes sent');
assert.strictEqual(await stepChapter(s, cm), false, 'within the limit → nothing');
assert.same([...coveredFileIds(cm)].sort(), ['file0', 'file1', 'file2'], 'coverage survives the chapter fold');

cm.timeline.unshift({ id: 'c0', tier: 'chapter', sourceFileIds: ['fileX'], from: -5, to: -1, title: 'C0', text: 'older', keywords: [] });
h.state.reply = '<canon_saga>\n원작 진행 전체.\n</canon_saga>';
assert.strictEqual(await stepSaga(s, cm), true, 'chapters over the limit → saga');
assert.strictEqual(cm.saga.text, '원작 진행 전체.');
assert.same(cm.timeline.map(n => n.tier), ['episode'], 'chapters folded into the saga');
assert.same([...coveredFileIds(cm)].sort(), ['file0', 'file1', 'file2', 'fileX'], 'coverage survives the saga fold');
assert.ok(h.sent().includes('<original_so_far>\n(empty)') && h.sent().includes('<canon_chapter messages="#0-#19" title="초반부">'), 'saga input');
app.refreshInjection();
const mem = h.prompts[app.PROMPT_KEY_MEM].text;
assert.includes(mem, '[The original so far]\n원작 진행 전체.');
assert.includes(mem, 'Canon Episode: E2');

// compact runs both steps until the limits hold
for (let i = 3; i < 7; i++) cm.timeline.push({ id: `e${i}`, tier: 'episode', sourceFileId: `file${i}`, fileName: `f${i}`, from: i * 10, to: i * 10 + 9, title: `E${i}`, text: `event ${i}`, keywords: [] });
h.state.reply = (a) => (/<canon_chapter>|canon progress notes below into one chapter/.test(`${a.systemPrompt}`) ? '<canon_chapter>\ntitle: ch\nkeywords: k\nsummary:\nc\n</canon_chapter>' : '<canon_saga>\nsaga2\n</canon_saga>');
assert.strictEqual(await compact(s, cm), true);
assert.ok(cm.timeline.filter(n => n.tier === 'episode').length <= s.maxEpisodes, 'episodes within limit');
assert.ok(cm.timeline.filter(n => n.tier === 'chapter').length <= s.maxChapters, 'chapters within limit');
assert.same([...coveredFileIds(cm)].sort(), ['file0', 'file1', 'file2', 'file3', 'file4', 'file5', 'file6', 'fileX'], 'nothing lost across compact');
assert.strictEqual(await compact(s, cm), false, 'nothing more to fold');
assert.strictEqual(await compact(s, cm, { force: true }), false, 'force with a single episode: nothing to merge');
cm.timeline.push({ id: 'e7', tier: 'episode', sourceFileId: 'file7', fileName: 'f7', from: 70, to: 79, title: 'E7', text: 'y', keywords: [] });
assert.strictEqual(await compact(s, cm, { force: true }), true, 'force folds two episodes within the limits');
assert.ok(coveredFileIds(cm).has('file7'), 'coverage kept through the forced fold');

// manual 정리 through the app (confirm → compact)
cm.timeline.push({ id: 'e9', tier: 'episode', sourceFileId: 'file9', fileName: 'f9', from: 90, to: 99, title: 'E9', text: 'x', keywords: [] });
await app.runCompact();
assert.ok(h.toasts.some(t => t.startsWith('ok:원작 기록을 정리했어요')), 'manual compact ran');

// transcript cap keeps the newest lines and reports the drop
const big = makeChat(400, (i) => `Line ${i} ` + 'x'.repeat(40));
const tr = transcript(big, 0, 399, 1000);
assert.ok(tr.dropped > 0 && tr.lines[tr.lines.length - 1].includes('Line 399'), 'oldest dropped, newest kept');
assert.strictEqual(tr.lines.length + tr.dropped, 400);
const sys = makeChat(4);
sys[1].is_system = true; sys[2].is_system = true; sys[2].extra = { type: 'narrator' }; sys[3].is_system = true; sys[3].extra = { lm_hidden: true };
assert.same(transcript(sys, 0, 3, 24000).indices, [0, 2, 3], 'system messages skipped, narrator and hidden-by-summary kept');
console.log('fold ok');
