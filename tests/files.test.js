// Canon md files: register several, replace by name, reorder, remove; hint and date parsing.
import { assert } from './harness.js';
import { addFile, removeFile, moveFile, bodyText, keptLines, isHintLine, canonDate, parseHint } from '../src/files.js';

const files = [];
const md1 = '# 1-5화\n\n[CANON_BEAT]\nid: B01\n[/CANON_BEAT]\n\n---\nNEXT_FILE_HINT: 1996-05-12\n---\n';
const md2 = '# 6-10화\n\nB06 집 붕괴.\n\nNEXT_FILE_HINT: 1996-05-20 ~ 1996-05-25';
const md3 = '# 11-15화\n\nB11.';
assert.strictEqual(addFile(files, '01_01-05화.md', md1).replaced, false);
addFile(files, '02_06-10화.md', md2);
addFile(files, '03_11-15화.md', md3);
assert.strictEqual(files.length, 3, 'three files');
assert.strictEqual(addFile(files, '02_06-10화.md', md2 + '\n수정').replaced, true, 'same name replaces');
assert.strictEqual(files.length, 3);
assert.ok(files[1].text.endsWith('수정'));
assert.ok(files.every(f => f.id && f.name && typeof f.text === 'string'), 'id/name/text');
assert.strictEqual(addFile(files, '', 'x').file.name, 'canon_4.md', 'nameless file gets a name');
removeFile(files, files[3].id);

assert.strictEqual(moveFile(files, files[2].id, -1), true);
assert.same(files.map(f => f.name), ['01_01-05화.md', '03_11-15화.md', '02_06-10화.md']);
assert.strictEqual(moveFile(files, files[0].id, -1), false, 'cannot move above the top');
moveFile(files, files[1].id, 1);
assert.same(files.map(f => f.name), ['01_01-05화.md', '02_06-10화.md', '03_11-15화.md']);
assert.strictEqual(removeFile(files, 'nope'), false);
assert.strictEqual(removeFile(files, files[2].id), true);
assert.strictEqual(files.length, 2);

assert.strictEqual(bodyText(md1), '# 1-5화\n\n[CANON_BEAT]\nid: B01\n[/CANON_BEAT]', 'hint footer and --- stripped');
assert.strictEqual(bodyText(md2), '# 6-10화\n\nB06 집 붕괴.');
assert.strictEqual(bodyText(md3), '# 11-15화\n\nB11.');
assert.strictEqual(bodyText('a\r\nb\r\n'), 'a\nb', 'CRLF');

// keptLines: the stored lines and which of them bodyText keeps (bodyText itself is unchanged by it)
const oldBody = (text) => {
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const kept = lines.filter(l => !/^[ \t]*NEXT_FILE_HINT[ \t]*[:：][ \t]*(.+?)[ \t]*$/im.test(l));
    while (kept.length && /^\s*(-{3,}|)\s*$/.test(kept[kept.length - 1])) kept.pop();
    return kept.join('\n').trim();
};
for (const t of [md1, md2, md3, '', '\n\n', '---', '\n \n  # 제목 \n\nNEXT_FILE_HINT: 1996-05-12\n본문\n\n---\n \n', 'NEXT_FILE_HINT: x', 'a\r\n\r\nNEXT_FILE_HINT: 1\r\nb\r\n---\r\n', null, undefined]) {
    assert.strictEqual(bodyText(t), oldBody(t), `bodyText as before: ${JSON.stringify(t)}`);
    const { raw, kept } = keptLines(t);
    const body = bodyText(t);
    assert.same(kept.map(i => raw[i].trim()), body ? body.split('\n').map(l => l.trim()) : [], 'kept lines are the lines of bodyText, by their place in the stored text');
}
assert.same(keptLines(md1).kept, [0, 1, 2, 3, 4], 'the footer (blank, ---, hint, ---) is not kept');
assert.same([isHintLine('NEXT_FILE_HINT: 1996-05-12'), isHintLine('  next_file_hint： 언젠가'), isHintLine('NEXT_FILE_HINT'), isHintLine('- NEXT_FILE_HINT: x')], [true, true, false, false]);

assert.same(parseHint(md1), { raw: '1996-05-12', from: '1996-05-12', to: '1996-05-12' });
assert.same(parseHint(md2), { raw: '1996-05-20 ~ 1996-05-25', from: '1996-05-20', to: '1996-05-25' });
assert.strictEqual(parseHint(md3), null);
assert.same(parseHint('NEXT_FILE_HINT: 언젠가'), { raw: '언젠가', from: null, to: null }, 'unreadable hint keeps raw');
assert.strictEqual(canonDate('1996년 5월 3일'), '1996-05-03');
assert.strictEqual(canonDate('1996.5.3 (금)'), '1996-05-03');
assert.strictEqual(canonDate('1996/05/12 18:00'), '1996-05-12');
assert.strictEqual(canonDate('5월 3일'), null, 'no year → null');
assert.strictEqual(canonDate('1996/02/30'), null);
assert.strictEqual(canonDate('1996/13/01'), null);
console.log('files ok');
