// Saved instructions: several titled versions of each instruction, one in use, switched by hand.
// The title names a version for the person choosing — the model is only ever given the text.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { PROMPT_DEFS, getPrompt, promptTemplate, savedPrompts, activePrompt, migratePrompts } from '../src/prompts.js';
import { stepChapter, stepSaga } from '../src/memory.js';

const KEYS = Object.keys(PROMPT_DEFS);
const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const mk = (list) => ['# Canon Timeline', ...list.map(id => `## ${id} — 제목 ${id}\n\n[TARGET]\n- ${id} 내용`)].join('\n\n---\n\n');
const DEFAULT_MARK = 'is background world continuity';   // a sentence of the built-in mdHeader

const chat = makeChat(6);
const h = load({ chat });
const s = app.getSettings();
s.files.length = 0; s.retries = 0; s.beatWindowSize = 20;
app.addFile('a.md', mk(ids(25)));
app.addFile('b.md', mk(ids(3)));
await app.setOn(true);
const cm = app.getMemory(false);
const md = () => h.prompts[app.PROMPT_KEY_MD].text;
const mem = () => h.prompts[app.PROMPT_KEY_MEM].text;
const titles = (key) => savedPrompts(s, key).items.map(it => it.title);

// ---- nothing saved: every instruction is its built-in default
assert.same(KEYS, ['mdHeader', 'pastHeader', 'pastEvents', 'memHeader', 'episode', 'chapter', 'saga']);
for (const key of KEYS) {
    assert.same(savedPrompts(s, key), { active: '', items: [] });
    assert.same([activePrompt(s, key), promptTemplate(s, key) === PROMPT_DEFS[key].text], [null, true]);
}
assert.same([s.savedPrompts, Object.hasOwn(s, 'prompts')], [{}, false], 'kept in the settings under savedPrompts');
assert.includes(md(), DEFAULT_MARK);

// ---- save two versions of one instruction and switch between them
const au = app.addPrompt('mdHeader', 'Canon AU 버전', 'AU-TEXT for {{file}}: nothing here is a scene to show.');
assert.same([au.title, au.text, typeof au.id, savedPrompts(s, 'mdHeader').active === au.id], ['Canon AU 버전', 'AU-TEXT for {{file}}: nothing here is a scene to show.', 'string', true], 'a new version is put in use');
assert.ok(md().includes('AU-TEXT for a.md: nothing here is a scene to show.') && !md().includes(DEFAULT_MARK), 'the saved text replaces the default in the injected block; {{file}} still filled');
const bg = app.addPrompt('mdHeader', '배경 세계 버전', 'BG-TEXT ({{file}})');
assert.same([titles('mdHeader'), activePrompt(s, 'mdHeader').id === bg.id], [['Canon AU 버전', '배경 세계 버전'], true]);
assert.ok(md().includes('BG-TEXT (a.md)') && !md().includes('AU-TEXT'), 'only the version in use is sent');
assert.strictEqual(app.selectPrompt('mdHeader', au.id), true);
assert.ok(md().includes('AU-TEXT for a.md') && !md().includes('BG-TEXT'), 'switched');
assert.strictEqual(app.plannedInjection().md, md(), 'the panel shows what is injected');
app.selectPrompt('mdHeader', '');
assert.ok(md().includes(DEFAULT_MARK) && !md().includes('AU-TEXT') && titles('mdHeader').length === 2, 'back to the built-in default; the saved versions stay');
app.selectPrompt('mdHeader', bg.id);
app.selectPrompt('mdHeader', 'no-such-id');
assert.same([savedPrompts(s, 'mdHeader').active, md().includes(DEFAULT_MARK)], ['', true], 'an unknown id is the default');
for (const key of KEYS.filter(k => k !== 'mdHeader')) assert.same(savedPrompts(s, key), { active: '', items: [] }, 'each instruction has its own list');
for (const t of ['Canon AU 버전', '배경 세계 버전']) assert.excludes(md() + mem(), t, 'titles are not injected');

// ---- titles never reach a model: all seven instructions, every call and both injected blocks
const T = (key) => `제목★${key}`;
const X = { mdHeader: 'MARK-mdHeader {{file}}', pastHeader: 'MARK-pastHeader', pastEvents: 'MARK-pastEvents {{language}}', memHeader: 'MARK-memHeader', episode: 'MARK-episode {{language}}', chapter: 'MARK-chapter {{language}}', saga: 'MARK-saga under {{sagaWords}} words {{language}}' };
const made = {};
for (const key of KEYS) made[key] = app.addPrompt(key, T(key), X[key]);
h.state.reply = '<past_canon_events>\n- 사건 하나\n</past_canon_events>';
await app.shiftWindow(1);                                   // Past Canon Events call; the block now has [PAST CANON EVENTS]
const mdA = md();
chat.push({ is_user: false, name: 'Rin', mes: '한 턴.', is_system: false, extra: {} });
h.state.reply = '<canon_episode>\ntitle: a편\nkeywords: k\nsummary:\n- a편 기록\n</canon_episode>';
await app.switchFile(1);                                    // Canon Episode call; canon_progress is injected
cm.timeline.push({ id: 'e2', tier: 'episode', sourceFileId: 'x', fileName: 'x.md', from: 7, to: 8, title: 'E2', text: '- e2', keywords: [] });
h.state.reply = '<canon_chapter>\ntitle: c\nkeywords: k\nsummary:\nx\n</canon_chapter>';
await stepChapter(s, cm, true);                             // Canon Chapter call
const memA = (app.refreshInjection(), mem());
h.state.reply = '<canon_saga>\ns\n</canon_saga>';
await stepSaga(s, cm, true);                                // Canon Saga call
assert.strictEqual(h.state.calls.length, 4, 'four summary calls');
const sent = h.state.calls.map(c => `${c.args.systemPrompt}\n${c.args.prompt}`);
const everything = [...sent, mdA, memA, md(), JSON.stringify(h.prompts)].join('\n');
assert.ok(mdA.includes('MARK-mdHeader a.md') && mdA.includes('[PAST CANON EVENTS]\nMARK-pastHeader\n'), 'injected headers come from the saved versions');
assert.includes(memA, 'MARK-memHeader');
assert.ok(sent[0].startsWith('MARK-pastEvents Write in the same language the Canon Beats') && sent[1].startsWith('MARK-episode Write in the same language') && sent[2].startsWith('MARK-chapter ') && sent[3].startsWith('MARK-saga under 600 words '), 'each call uses its saved version, placeholders filled');
for (const key of KEYS) {
    assert.includes(everything, `MARK-${key}`, `${key}: the text is used`);
    assert.excludes(everything, T(key), `${key}: the title is not sent`);
}
assert.excludes(everything, '제목★', 'no title anywhere a model can see');
assert.ok(sent.every(x => !x.includes('Canon AU 버전') && !x.includes('배경 세계 버전')));
for (const key of KEYS) app.removePrompt(key, made[key].id);
for (const key of KEYS) assert.strictEqual(promptTemplate(s, key), PROMPT_DEFS[key].text, 'deleting the version in use brings the default back');

// ---- titles: renamed freely, kept distinct, never empty
assert.same([app.renamePrompt('mdHeader', au.id, '  새   이름 '), titles('mdHeader'), savedPrompts(s, 'mdHeader').items[0].id === au.id, savedPrompts(s, 'mdHeader').items[0].text], [true, ['새 이름', '배경 세계 버전'], true, 'AU-TEXT for {{file}}: nothing here is a scene to show.'], 'only the title changes');
assert.same([app.renamePrompt('mdHeader', au.id, '배경 세계 버전'), titles('mdHeader')], [true, ['배경 세계 버전 (2)', '배경 세계 버전']], 'a title already taken gets a number');
assert.same([app.renamePrompt('mdHeader', au.id, '   '), app.renamePrompt('mdHeader', 'nope', 'x'), titles('mdHeader')[0]], [false, false, '배경 세계 버전 (2)'], 'an empty title or an unknown id changes nothing');
const twin = app.addPrompt('mdHeader', '배경 세계 버전', 'TWIN');
const blank = app.addPrompt('mdHeader', '   ', 'BLANK-TITLE');
assert.same([twin.title, blank.title], ['배경 세계 버전 (3)', '새 지시문']);
assert.same([app.addPrompt('nope', 't', 'x'), app.selectPrompt('nope', ''), app.removePrompt('nope', 'x')], [null, false, false], 'only the known instructions');

// ---- the text of the version in use is edited in place; the default cannot be edited
app.selectPrompt('mdHeader', au.id);
assert.strictEqual(app.setPromptText('mdHeader', 'EDITED {{file}}'), true);
assert.ok(md().includes('EDITED b.md') && savedPrompts(s, 'mdHeader').items.find(it => it.id === au.id).text === 'EDITED {{file}}', 'used at once');
assert.strictEqual(savedPrompts(s, 'mdHeader').items.find(it => it.id === bg.id).text, 'BG-TEXT ({{file}})', 'the other versions are untouched');
app.setPromptText('mdHeader', '   ');
assert.ok(md().includes(DEFAULT_MARK) && activePrompt(s, 'mdHeader').id === au.id, 'an empty version falls back to the default text while it stays selected');
app.setPromptText('mdHeader', 'EDITED {{file}}');
const defaultText = PROMPT_DEFS.mdHeader.text;
app.selectPrompt('mdHeader', '');
assert.same([app.setPromptText('mdHeader', 'HACKED'), PROMPT_DEFS.mdHeader.text === defaultText, md().includes('HACKED')], [false, true, false], 'the built-in default is read-only');

// ---- delete
app.selectPrompt('mdHeader', bg.id);
assert.same([app.removePrompt('mdHeader', twin.id), activePrompt(s, 'mdHeader').id === bg.id], [true, true], 'deleting another version leaves the one in use');
assert.same([app.removePrompt('mdHeader', bg.id), savedPrompts(s, 'mdHeader').active, md().includes(DEFAULT_MARK)], [true, '', true], 'deleting the one in use → default');
assert.same([app.removePrompt('mdHeader', bg.id), titles('mdHeader')], [false, ['배경 세계 버전 (2)', '새 지시문']]);

// ---- global, not per chat; survives save and reload
assert.ok(!JSON.stringify(h.metas).includes('savedPrompts') && !JSON.stringify(h.metas).includes('배경 세계 버전'), 'nothing of this is in the chat');
app.selectPrompt('mdHeader', au.id);
h.state.chatId = 'other';
await app.setOn(true);
assert.includes(md(), 'EDITED a.md', 'another chat uses the same version');
const reloaded = JSON.parse(JSON.stringify(s));
assert.same([savedPrompts(reloaded, 'mdHeader'), getPrompt(reloaded, 'mdHeader', { file: 'z.md' })], [savedPrompts(s, 'mdHeader'), 'EDITED z.md']);
assert.same(savedPrompts({ savedPrompts: { mdHeader: { active: 'gone', items: [{ id: 'k', title: 't', text: 'x' }, null, { id: '', text: 'y' }, { id: 'n', title: 't2' }] } } }, 'mdHeader'), { active: '', items: [{ id: 'k', title: 't', text: 'x' }] }, 'a dangling choice is the default; broken entries are ignored');
assert.same([savedPrompts({ savedPrompts: { mdHeader: 'x' } }, 'mdHeader'), savedPrompts({}, 'mdHeader'), savedPrompts(null, 'mdHeader'), promptTemplate({ savedPrompts: [] }, 'saga') === PROMPT_DEFS.saga.text], [{ active: '', items: [] }, { active: '', items: [] }, { active: '', items: [] }, true]);

// ---- settings of earlier versions: the single override becomes a saved version that stays in use
const old = { prompts: { mdHeader: 'OLD CUSTOM {{file}}', episode: '   ', saga: PROMPT_DEFS.saga.text, nope: 'x' } };
migratePrompts(old);
assert.same([Object.hasOwn(old, 'prompts'), savedPrompts(old, 'mdHeader').items.map(it => [it.title, it.text]), activePrompt(old, 'mdHeader').text, Object.keys(old.savedPrompts)], [false, [['기존 지시문', 'OLD CUSTOM {{file}}']], 'OLD CUSTOM {{file}}', ['mdHeader']], 'kept, titled, still in use; blanks and unchanged defaults are not turned into versions');
assert.strictEqual(getPrompt(old, 'mdHeader', { file: 'a.md' }), 'OLD CUSTOM a.md', 'the model gets what it got before');
const once = JSON.stringify(old);
migratePrompts(old);
assert.strictEqual(JSON.stringify(old), once, 'migrating again changes nothing');
const h2 = load({ extensionSettings: { [app.MODULE]: { enabled: true, files: [], prompts: { mdHeader: 'LEGACY {{file}}', pastEvents: 'LEGACY PAST {{language}}' } } } });
const s2 = app.getSettings();
assert.same([Object.hasOwn(s2, 'prompts'), savedPrompts(s2, 'mdHeader').items.map(it => it.title), activePrompt(s2, 'pastEvents').text], [false, ['기존 지시문'], 'LEGACY PAST {{language}}'], 'done when the settings are first read');
app.addFile('z.md', '# z');
await app.setOn(true);
assert.ok(h2.prompts[app.PROMPT_KEY_MD].text.includes('LEGACY z.md') && !h2.prompts[app.PROMPT_KEY_MD].text.includes('기존 지시문'));
console.log('saved ok');
