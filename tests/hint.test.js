// NEXT_FILE_HINT: story date reading, one notice per file, never a switch.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { storyDate } from '../src/date.js';

const chat = makeChat(10, (i) => (i === 7 ? '<date>1996/05/10</date> 아침.' : `Line ${i}`));
const h = load({ chat });
const s = app.getSettings();
s.files.length = 0;
app.addFile('01.md', '# 1\n\n---\nNEXT_FILE_HINT: 1996-05-12\n---');
app.addFile('02.md', '# 2\n\nNEXT_FILE_HINT: 1996-05-20 ~ 1996-05-25');
app.addFile('03.md', '# 3');
await app.setOn(true);
const cm = app.getMemory(false);
const idx = () => s.files.findIndex(f => f.id === cm.fileId);

assert.same(storyDate(chat), { date: '1996-05-10', at: 7, source: 'tag' });
assert.strictEqual(storyDate(makeChat(3)), null, 'no date');
assert.same(storyDate([{ is_user: false, mes: '[ 🌙 오후 8:15 · 1943년 12월 9일 (목) · 호그와트 ]' }]), { date: '1943-12-09', at: 0, source: 'status' }, 'bracketed status bar');
assert.same(storyDate([{ is_user: false, mes: '📅 날짜: 1996-05-11\n📍 장소: 학교' }]), { date: '1996-05-11', at: 0, source: 'status' }, 'label line');
assert.strictEqual(storyDate([{ is_user: false, mes: '그는 1996년 5월 11일을 떠올리며 긴 이야기를 했다, 아주 긴 문장 속에서 날짜가 그냥 언급될 뿐이었다 그리고 계속 이어졌다 끝없이 이어졌다 정말로 길게 이어졌다 그래서 상태창이 아니었다 결코 아니었다 아니었다 아니었다 아니었다 아니었다 아니었다 아니었다 아니었다 아니었다' }]), null, 'prose with a date is not a status bar');
assert.strictEqual(storyDate([{ is_user: true, mes: '<date>1996/05/30</date>' }]), null, 'user messages ignored');
assert.same(storyDate([{ is_user: false, mes: '<date>1996/05/01</date>' }, { is_user: false, mes: '<date>1996/05/02</date> <date>1996/05/03</date>' }]), { date: '1996-05-03', at: 1, source: 'tag' }, 'newest message, last tag');

assert.strictEqual(app.checkHint(), false, '05-10 < 05-12: not due');
chat.push({ is_user: false, name: 'Rin', mes: '<date>1996/05/12</date> 시험 날.', is_system: false, extra: {} });
assert.strictEqual(app.checkHint(), true, 'due → notice');
assert.ok(h.toasts.some(t => t.startsWith('info:') && t.includes('1996-05-12') && t.includes('01.md') && t.includes('02.md')), 'notice names hint, current and next');
assert.strictEqual(app.checkHint(), false, 'not twice for the same file');
assert.strictEqual(idx(), 0, 'notice never moves the pointer');
assert.strictEqual(cm.noticeShownFor, s.files[0].id);
chat.push({ is_user: false, name: 'Rin', mes: '<date>1996/06/01</date> 한참 뒤.', is_system: false, extra: {} });
assert.strictEqual(app.checkHint(), false, 'later dates do not re-notify');
assert.strictEqual(idx(), 0, 'still no automatic switch');

const st = app.currentHint();
assert.same([st.file.name, st.hint.raw, st.today.date, st.due], ['01.md', '1996-05-12', '1996-06-01', true]);

s.hintEnabled = false;
cm.noticeShownFor = null;
assert.strictEqual(app.checkHint(), false, 'disabled: no notice');
s.hintEnabled = true;
await app.setOn(false);
assert.strictEqual(app.checkHint(), false, 'chat off: no notice');
await app.setOn(true);
assert.strictEqual(app.checkHint(), true, 'on again, cleared marker → notice once more');
console.log('hint ok');
