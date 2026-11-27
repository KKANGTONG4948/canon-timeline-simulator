// Only the checked file is injected; nothing while the chat is off; two keys at their own depths.
import { load, assert } from './harness.js';
import * as app from '../index.js';

const h = load();
const s = app.getSettings();
s.files.length = 0;
app.addFile('01.md', '# 1\n\nB01 내용\n\n---\nNEXT_FILE_HINT: 1996-05-12\n---');
app.addFile('02.md', '# 2\n\nB06 집 붕괴.');
app.refreshInjection();
assert.strictEqual(h.prompts[app.PROMPT_KEY_MD].text, '', 'off by default: no md');
assert.strictEqual(h.prompts[app.PROMPT_KEY_MEM].text, '', 'off by default: no memory');

await app.setOn(true);
const md = h.prompts[app.PROMPT_KEY_MD];
assert.ok(md.text.startsWith('<canon_baseline file="01.md">'), 'current file as canon_baseline');
assert.includes(md.text, 'B01 내용');
assert.excludes(md.text, 'B06', 'only the current file');
assert.excludes(md.text, 'NEXT_FILE_HINT', 'hint line stripped');
assert.excludes(md.text, '---', 'separator stripped');
assert.includes(md.text, 'is background world continuity', 'md header');
assert.same([md.position, md.depth, md.role], [1, 12, 0], 'md: in_chat depth 12 system');
assert.strictEqual(h.prompts[app.PROMPT_KEY_MEM].text, '', 'no canon memory yet');

const cm = app.getMemory(false);
cm.timeline.push({ id: 'e1', tier: 'episode', sourceFileId: s.files[0].id, fileName: '01.md', from: 0, to: 9, title: '첫 구간', text: '- 고백과 거절은 원작대로.', keywords: [], when: '1996-05-10' });
app.refreshInjection();
const mem = h.prompts[app.PROMPT_KEY_MEM];
assert.ok(mem.text.startsWith('<canon_progress>'), 'canon memory block');
assert.includes(mem.text, 'Canon Episode: 첫 구간 (01.md; messages #0-#9; in-story: 1996-05-10)');
assert.includes(mem.text, '- 고백과 거절은 원작대로.');
assert.same([mem.position, mem.depth, mem.role], [1, 8, 0], 'memory: in_chat depth 8 system');

s.mdPosition = 'in_prompt'; s.memDepth = 3;
app.refreshInjection();
assert.same([h.prompts[app.PROMPT_KEY_MD].position, h.prompts[app.PROMPT_KEY_MEM].depth], [0, 3], 'positions/depths are independent settings');
s.mdPosition = 'in_chat'; s.memDepth = 8;

s.enabled = false; app.refreshInjection();
assert.strictEqual(h.prompts[app.PROMPT_KEY_MD].text + h.prompts[app.PROMPT_KEY_MEM].text, '', 'master switch off clears both');
s.enabled = true;
await app.setOn(false);
assert.strictEqual(h.prompts[app.PROMPT_KEY_MD].text + h.prompts[app.PROMPT_KEY_MEM].text, '', 'chat off clears both');
await app.setOn(true);
assert.ok(h.prompts[app.PROMPT_KEY_MD].text && h.prompts[app.PROMPT_KEY_MEM].text, 'back on');

// the planned view the panel shows is the same text
const p = app.plannedInjection();
assert.strictEqual(p.md, h.prompts[app.PROMPT_KEY_MD].text);
assert.strictEqual(p.mem, h.prompts[app.PROMPT_KEY_MEM].text);
assert.strictEqual(p.file.name, '01.md');
console.log('inject ok');
