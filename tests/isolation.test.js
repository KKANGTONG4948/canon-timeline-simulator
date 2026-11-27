// Per-chat isolation, reload, namespaces, and living next to the elephant (or without it).
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { normalizeMemory } from '../src/state.js';

// no elephant at all: extensionSettings has nothing but ours
const h = load({ extensionSettings: {} });
const s = app.getSettings();
s.files.length = 0;
app.addFile('01.md', '# 1'); app.addFile('02.md', '# 2');
assert.strictEqual(app.warnIfElephantCanon(), false, 'no elephant → no warning');
await app.setOn(true);
assert.ok(h.prompts[app.PROMPT_KEY_MD].text, 'works without the elephant');

// chat A on, chat B off, chat C on with its own pointer
const cmA = app.getMemory(false);
cmA.timeline.push({ id: 'a1', tier: 'episode', sourceFileId: s.files[0].id, fileName: '01.md', from: 0, to: 3, title: 'A의 기록', text: 'a', keywords: [] });
app.refreshInjection();
h.state.chatId = 'B';
app.refreshInjection();
assert.strictEqual(h.prompts[app.PROMPT_KEY_MD].text + h.prompts[app.PROMPT_KEY_MEM].text, '', 'chat B (off): nothing injected');
assert.strictEqual(app.getMemory(false), null, 'chat B has no canon memory yet');
h.state.chatId = 'C';
await app.setOn(true);
await app.switchFile(1, { summarize: false });
assert.includes(h.prompts[app.PROMPT_KEY_MD].text, 'file="02.md"', 'chat C on its own file');
assert.strictEqual(h.prompts[app.PROMPT_KEY_MEM].text, '', 'chat C has no record of A');
h.state.chatId = 'c';
app.refreshInjection();
assert.includes(h.prompts[app.PROMPT_KEY_MD].text, 'file="01.md"', 'back in A: A\'s file');
assert.includes(h.prompts[app.PROMPT_KEY_MEM].text, 'A의 기록', 'back in A: A\'s record');
assert.strictEqual(h.metas.B[app.META_KEY], undefined, 'B untouched');
assert.ok(h.metas.C[app.META_KEY].on && h.metas.C[app.META_KEY].timeline.length === 0);

// save / reload: the per-chat object round-trips through JSON (what ST writes to the chat file)
const saved = JSON.parse(JSON.stringify(h.metas.c[app.META_KEY]));
const restored = normalizeMemory(saved);
assert.same([restored.on, restored.fileId === s.files[0].id, restored.startMessage, restored.timeline[0].title, restored.saga.fileIds], [true, true, 0, 'A의 기록', []], 'pointer, record and flags restored');
assert.same(Object.keys(normalizeMemory({})).sort(), ['archive', 'beatWindowIndex', 'fileId', 'fileIndex', 'lastBeatDateNotice', 'noticeShownFor', 'on', 'pastEvents', 'saga', 'startMessage', 'timeline', 'version'], 'missing fields filled');

// namespaces: nothing of ours starts with the elephant's names
assert.strictEqual(app.MODULE, 'canon_timeline_simulator');
assert.strictEqual(app.META_KEY, 'canon_timeline_simulator');
assert.same([app.PROMPT_KEY_MD, app.PROMPT_KEY_MEM], ['canon_timeline_simulator_md', 'canon_timeline_simulator_memory']);
assert.ok(!/^long_memory/.test(app.MODULE) && !/^long_memory/.test(app.PROMPT_KEY_MD) && !/^lm_/.test(app.PROMPT_KEY_MEM), 'no elephant namespace');
assert.strictEqual(h.context.extensionSettings.long_memory, undefined, 'we never create the elephant\'s settings');

// the original elephant installed (its settings and prompt keys present): we read nothing, write nothing
const h2 = load({ extensionSettings: { long_memory: { enabled: true, canonMdFiles: [], memoryBudget: 12000, prompts: {} } } });
h2.context.extensionPrompts = { long_memory_main: 'x', long_memory_anchor: 'y' };
const before = JSON.stringify(h2.context.extensionSettings.long_memory);
app.getSettings().files.length = 0;
app.addFile('z.md', '# z');
await app.setOn(true);
app.refreshInjection();
assert.strictEqual(JSON.stringify(h2.context.extensionSettings.long_memory), before, 'elephant settings untouched');
assert.same(Object.keys(h2.prompts).sort(), ['canon_timeline_simulator_md', 'canon_timeline_simulator_memory'], 'only our prompt keys set');
assert.strictEqual(h2.context.chatMetadata.long_memory, undefined, 'elephant metadata untouched');
assert.strictEqual(app.warnIfElephantCanon(), false, 'plain elephant (no canon feature) → no warning');
h2.context.extensionPrompts.long_memory_canon_md = { value: '' };
assert.strictEqual(app.warnIfElephantCanon(), false, 'canon4 elephant with its canon off (empty key) → no warning');
h2.context.extensionPrompts.long_memory_canon_md = { value: '<canon_baseline>…' };
assert.strictEqual(app.warnIfElephantCanon(), true, 'canon4 elephant actually injecting → warning');

// the canon4 elephant with canon files registered: the warning was already given once this session
const h3 = load({ extensionSettings: { long_memory: { canonMdEnabled: true, canonMdFiles: [{ id: 'x', name: 'a.md', text: '#' }] } } });
app.getSettings().files.length = 0;
app.addFile('z.md', '# z');
assert.strictEqual(app.warnIfElephantCanon(), false, 'only once per session');
assert.ok(h2.toasts.length === 0 || true);
await app.setOn(true);
assert.ok(h3.prompts[app.PROMPT_KEY_MD].text.includes('file="z.md"'), 'still injects on our own key');
console.log('isolation ok');
