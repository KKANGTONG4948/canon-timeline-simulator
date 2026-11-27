// Beat parsing and windows: sections by heading, windows by order of appearance, header kept,
// files without Beat headings untouched, the last Beat's date.
import { assert } from './harness.js';
import { parseBeats, beatWindow, beatsText, beatDate, beatsSource, headerSource, replaceSource, DEFAULT_WINDOW } from '../src/beats.js';
import { bodyText, parseHint } from '../src/files.js';

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const HEADER = '# Canon Timeline\n\n이 파일은 세계의 배경 역사이다.';
const beat = (id, extra = '') => `## ${id} — 제목 ${id}\n\n[TIME]\n${extra}\n[TARGET]\n- ${id} 내용`;
const mk = (list, { header = HEADER, dates = {} } = {}) => [header, ...list.map(id => beat(id, dates[id] ? `date: ${dates[id]}\n` : ''))].join('\n\n---\n\n');
const has = (text, id) => text.includes(`## ${id} — `) && text.includes(`- ${id} 내용`);

assert.strictEqual(DEFAULT_WINDOW, 20);

// 1–5. B01~B71 → four windows of 20, 20, 20, 11; only the window's Beats plus the header
const p71 = parseBeats(mk(ids(71)));
assert.strictEqual(p71.beats.length, 71);
assert.strictEqual(p71.header, HEADER, 'header = everything before the first Beat');
const w = [0, 1, 2, 3].map(i => beatWindow(p71, i));
assert.same(w.map(x => x.label), ['B01 ~ B20', 'B21 ~ B40', 'B41 ~ B60', 'B61 ~ B71']);
assert.same(w.map(x => [x.index, x.count, x.total, x.size]), [[0, 4, 71, 20], [1, 4, 71, 20], [2, 4, 71, 20], [3, 4, 71, 20]]);
assert.same(w.map(x => [x.start, x.end]), [[0, 20], [20, 40], [40, 60], [60, 71]], 'Beats [start, end) of the file');
assert.ok(ids(20).every(id => has(w[0].body, id)), 'window 1 holds B01~B20');
assert.ok(!has(w[0].body, 'B21'), 'window 1 has nothing after B20');
assert.ok(ids(20, 21).every(id => has(w[1].body, id)), 'window 2 holds B21~B40');
assert.ok(!ids(20).some(id => has(w[1].body, id)) && !ids(31, 41).some(id => has(w[1].body, id)), 'window 2 has no Beat outside B21~B40');
assert.ok(ids(11, 61).every(id => has(w[3].body, id)) && !has(w[3].body, 'B60'), 'last window holds the remaining 11');
assert.ok(w.every(x => x.header === HEADER && x.body.startsWith('## B') && !x.body.includes(HEADER)), 'every window carries the file header, apart from its Beats');
assert.strictEqual((w[1].body.match(/^## B\d+ — /gm) || []).length, 20, 'exactly 20 Beat headings in a full window');
assert.strictEqual(beatsText(p71, 20, 40), w[1].body, 'a window\'s body is the original text of its Beats');
assert.strictEqual((beatsText(p71, 0, 40).match(/^## B\d+ — /gm) || []).length, 40, 'any range of Beats can be read');
assert.same([beatWindow(p71, -3).index, beatWindow(p71, 99).index, beatWindow(p71, 'x').index, beatWindow(p71, 1.9).index], [0, 3, 0, 1], 'index is clamped');
assert.same([beatWindow(p71, 0, 10).count, beatWindow(p71, 7, 10).label, beatWindow(p71, 0, 0).size, beatWindow(p71, 0, 100).count], [8, 'B71', 20, 1], 'other window sizes');

// fewer than 20 Beats → the whole file is one window
const p5 = parseBeats(mk(ids(5)));
const w5 = beatWindow(p5, 0);
assert.same([w5.count, w5.total, w5.label], [1, 5, 'B01 ~ B05']);
assert.ok(ids(5).every(id => has(w5.body, id)));
assert.strictEqual(beatWindow(parseBeats(mk(['B07'])), 0).label, 'B07', 'a single Beat labels itself');

// no Beat heading → one window with the whole file, as before
const plain = '# 그냥 문서\n\n원작 줄거리가 문장으로 적혀 있다.\n\n## 배경\n\n- B급 감성\n\n---\nNEXT_FILE_HINT: 1996-05-12\n---\n';
const pp = parseBeats(plain);
assert.same([pp.beats.length, pp.header], [0, bodyText(plain)]);
const wp = beatWindow(pp, 3);
assert.same([wp.index, wp.count, wp.total, wp.label, wp.header, wp.body, wp.lastDate], [0, 1, 0, '파일 전체', '', bodyText(plain), null]);
assert.same(beatWindow(parseBeats(''), 0).body, '', 'empty file');

// numbers are not used to cut: 25 Beats with gaps → first 20 as they appear
const gaps = ['B01', 'B02', 'B05', 'B08', ...ids(21, 30)];
const pg = parseBeats(mk(gaps));
assert.same([beatWindow(pg, 0).label, beatWindow(pg, 1).label, beatWindow(pg, 0).count], ['B01 ~ B45', 'B46 ~ B50', 2]);
assert.ok(has(beatWindow(pg, 0).body, 'B08') && !has(beatWindow(pg, 0).body, 'B46'));
const shuffled = parseBeats(mk(['B03', 'B01', 'B02']));
assert.same(shuffled.beats.map(b => b.id), ['B03', 'B01', 'B02'], 'file order, not numeric order');

// heading forms
const forms = parseBeats('# 제목\n\n## B01: 콜론\n\na\n\n### B02 - 하이픈\n\nb\n\n## B03\n\nc\n\n# B04 — 한 단계 위\n\nd\n\n## B12a — 접미사\n\ne\n\n## Background\n\nf\n\n## B급 영화\n\ng');
assert.same(forms.beats.map(b => b.id), ['B01', 'B02', 'B03', 'B04', 'B12a'], 'recognised Beat headings');
assert.ok(forms.beats[4].body.includes('## Background') && forms.beats[4].body.includes('## B급 영화'), 'other headings are not Beat starts');

// the real file shape: title + note, "# 1화" before B01, "# 2화" between B10 and B11, --- between Beats
const real = ['# 『장난스런 키스』 Canon Beat — 1~5화', '', '> 상태: 작성 중', '> 용도: 시뮬레이터용', '', '---', '', '# 1화', '',
    ...ids(10).flatMap(id => [beat(id), '', '---', '']), '# 2화', '', ...ids(10, 11).flatMap(id => [beat(id), '', '---', '']), 'NEXT_FILE_HINT: 1990-07-01', '---', ''].join('\n');
const pr = parseBeats(real);
assert.strictEqual(pr.header, '# 『장난스런 키스』 Canon Beat — 1~5화\n\n> 상태: 작성 중\n> 용도: 시뮬레이터용', 'title and note are the header; the episode marker is not');
assert.same([pr.beats.length, pr.beats[0].lead, pr.beats[9].lead, pr.beats[10].lead, pr.beats[10].section, pr.beats[19].section], [20, '# 1화', '', '# 2화', '# 2화', '# 2화']);
assert.ok(!pr.beats[9].body.includes('2화') && !pr.beats[9].body.trim().endsWith('---'), 'B10 does not drag the next episode marker or the rule along');
const r10 = [0, 1].map(i => beatWindow(pr, i, 10));
assert.ok(r10[0].body.startsWith('# 1화\n\n## B01 — ') && !r10[0].body.includes('# 2화'), 'window 1 (size 10): 1화 only');
assert.ok(r10[1].body.startsWith('# 2화\n\n## B11 — ') && !r10[1].body.includes('# 1화'), 'window 2 (size 10) opens with its own episode marker');
assert.ok(r10.every(x => x.header.startsWith('# 『장난스런 키스』')), 'header in both');
const r5 = beatWindow(pr, 1, 5);
assert.ok(r5.label === 'B06 ~ B10' && r5.body.startsWith('# 1화\n\n## B06 — '), 'a window that starts mid-episode shows which episode it is in');
assert.strictEqual((beatWindow(pr, 0).body.match(/^# \d화$/gm) || []).length, 2, 'one window of 20: each marker once, in place');
assert.ok(!(beatWindow(pr, 0).header + beatWindow(pr, 0).body).includes('NEXT_FILE_HINT'), 'hint line never injected');
assert.ok(beatWindow(pr, 0).body.endsWith('- B20 내용'), 'no dangling rule at the end');
const mid = beatsText(pr, 5, 12);
assert.ok(mid.startsWith('# 1화\n\n## B06 — ') && mid.includes('# 2화\n\n## B11 — ') && mid.endsWith('- B12 내용'), 'a range across episodes keeps each marker in place');
const titleOnly = parseBeats('# Canon Timeline\n\n# 1화\n\n## B01 — a\n\nx');
assert.same([titleOnly.header, titleOnly.beats[0].lead], ['# Canon Timeline', '# 1화'], 'a header that is only headings keeps its title');
const empty = parseBeats('## B01 — 내용 없음\n\n# 2화\n\n## B02 — 다음\n\nx');
assert.same([empty.beats[0].body, empty.beats[1].lead], ['## B01 — 내용 없음', '# 2화'], 'an empty Beat keeps its own heading');

// blocks without headings are Beats too
const blocks = ['# 1화', ...ids(3).map(id => `[CANON_BEAT]\n[META]\nid: ${id}\ntitle: t\n[TARGET]\n- ${id} 내용\n[/CANON_BEAT]`)].join('\n\n');
const pb = parseBeats(blocks);
assert.same([pb.beats.map(b => b.id), pb.header, beatWindow(pb, 1, 2).label], [['B01', 'B02', 'B03'], '# 1화', 'B03']);

// dates: the Beat's "date:" line; a range gives its end; none → null
assert.strictEqual(beatDate('## B40 — x\n\n[TIME]\ndate: 1990/06/18\n'), '1990-06-18');
assert.strictEqual(beatDate('## B40 — x\n\n[SCHEDULE]\ndate: 1990-06-18\nperiod: 여름'), '1990-06-18');
assert.strictEqual(beatDate('[TIME]\ndate: 1990/07/09~1990/07/11'), '1990-07-11', 'range → end date');
assert.strictEqual(beatDate('[TIME]\ndate: 1990.7.9 ~ 1990.7.11 (수)'), '1990-07-11');
assert.strictEqual(beatDate('[TIME]\nDate： 1990년 7월 9일'), '1990-07-09');
assert.strictEqual(beatDate('[TIME]\ndate: 미정'), null);
assert.strictEqual(beatDate('[TIME]\nperiod: 1990/06/18 무렵'), null, 'only a date: line counts');
assert.strictEqual(beatDate('[TARGET]\n- 1990/06/18에 만난다'), null);
const pd = parseBeats(mk(ids(41), { dates: { B19: '1990/06/01', B20: '1990/06/18', B39: '1990/07/08', B40: '1990/07/09~1990/07/11' } }));
assert.same([0, 1, 2].map(i => beatWindow(pd, i).lastDate), ['1990-06-18', '1990-07-11', null], 'the window\'s date is its LAST Beat\'s date, or none');
const pe = parseBeats(mk(ids(20), { dates: { B19: '1990/06/01' } }));
assert.strictEqual(beatWindow(pe, 0).lastDate, null, 'an earlier Beat\'s date is not borrowed');

// ---- the same parts as the stored file has them, for fixing the file from the screen
const realLines = real.split('\n');
const s1 = beatsSource(real, 0, 10);
const s2 = beatsSource(real, 10, 20);
assert.same([s1.from, s1.to], [realLines.indexOf('# 1화'), realLines.indexOf('- B10 내용') + 1], 'stored lines [from, to): from the heading that introduces the window to its last line');
assert.same([s1.text, s2.text], [r10[0].body, r10[1].body], 'in a file written with --- between Beats, the stored text of a window is what the window injects');
assert.ok(s2.text.startsWith('# 2화\n\n## B11 — ') && s2.text.endsWith('- B20 내용') && !s2.text.includes('NEXT_FILE_HINT'), 'the last window stops before the closing rule and the hint line');
const s5 = beatsSource(real, 5, 10);
assert.ok(s5.text.startsWith('## B06 — ') && s5.text.endsWith('- B10 내용'), 'no episode marker where the file has none (only the injected window adds it)');
assert.strictEqual(headerSource(real).text, pr.header, 'the header as the file has it');
assert.same([[0, 0], [3, 3], [5, 3], [10, 21], [-1, 5], [0.5, 5], [0, '10']].map(([a, z]) => beatsSource(real, a, z)), [null, null, null, null, null, null, null], 'a range that is not in the file');

// the stored text of any window holds exactly that window's Beats
for (const [text, size] of [[real, 1], [real, 3], [real, 7], [real, 20], [mk(ids(45)), 20], [mk(gaps), 4], [blocks, 2]]) {
    const p = parseBeats(text);
    for (let i = 0; i < Math.ceil(p.beats.length / size); i++) {
        const win = beatWindow(p, i, size);
        const got = parseBeats(beatsSource(text, win.start, win.end).text);
        assert.same(got.beats.map(b => [b.id, b.body]), p.beats.slice(win.start, win.end).map(b => [b.id, b.body]), `window ${i} of size ${size}`);
    }
}

// replacing: exactly those lines change
assert.strictEqual(replaceSource(real, s2, s2.text), real, 'saving the text as it was leaves the file as it was');
const fixed = replaceSource(real, s2, s2.text.replace('- B12 내용', '- B12 고친 내용'));
const pf = parseBeats(fixed);
assert.strictEqual(fixed, real.replace('- B12 내용', '- B12 고친 내용'), 'nothing else in the file is reformatted');
assert.same([pf.beats.length, pf.header === pr.header, pf.beats[11].body.endsWith('- B12 고친 내용')], [20, true, true]);
assert.ok(pf.beats.every((b, i) => i === 11 || (b.body === pr.beats[i].body && b.lead === pr.beats[i].lead)), 'every other Beat is as it was');
assert.same(parseHint(fixed), parseHint(real), 'the hint line stays');
assert.strictEqual(replaceSource(real, s2, `${s2.text}\n\n  \n`), real, 'blank lines typed at the end are dropped');
const more = parseBeats(replaceSource(real, s1, `${s1.text}\n\n---\n\n## B10a — 끼워 넣은 Beat\n\n- 새 내용`));
assert.same([more.beats.length, more.beats[10].id, more.beats[10].lead, more.beats[11].id, more.beats[11].lead], [21, 'B10a', '', 'B11', '# 2화'], 'a Beat added in the window is a Beat of the file');
const fewer = parseBeats(replaceSource(real, s1, s1.text.replace('## B03 — 제목 B03', '(제목을 지움)')));
assert.same([fewer.beats.length, fewer.beats[1].id, fewer.beats[1].body.includes('- B03 내용'), fewer.beats[2].id], [19, 'B02', true, 'B04'], 'a Beat heading taken out: its text joins the Beat before it');

// the header
const newHead = parseBeats(replaceSource(real, headerSource(real), '# 새 제목\n\n> 고친 머리말'));
assert.same([newHead.header, newHead.beats.length, newHead.beats[0].lead, newHead.beats[0].body === pr.beats[0].body], ['# 새 제목\n\n> 고친 머리말', 20, '# 1화', true]);
assert.strictEqual(headerSource('# Canon Timeline\n\n# 1화\n\n## B01 — a\n\nx').text, '# Canon Timeline', 'a header that is only its title');
assert.strictEqual(headerSource(blocks).text, '# 1화');
assert.same([headerSource('## B01 — a\n\nx'), headerSource(plain), headerSource('')], [null, null, null], 'no header to fix: a file that opens with a Beat, a file without Beats');

// a file without Beats: the whole file, without its hint footer
const ps = beatsSource(plain, 0, 0);
assert.strictEqual(ps.text, bodyText(plain));
const plain2 = replaceSource(plain, ps, ps.text.replace('B급 감성', 'A급 감성'));
assert.same([bodyText(plain2), parseHint(plain2).raw], [bodyText(plain).replace('B급 감성', 'A급 감성'), '1996-05-12']);
assert.same([beatsSource('', 0, 0), beatsSource('\n---\nNEXT_FILE_HINT: 1996-05-12\n', 0, 0)], [null, null], 'nothing to fix in an empty file');

// a hint line written between Beats stays where it is; CRLF files read the same
const hinted = '# T\n\n## B01 — a\n\nx\n\nNEXT_FILE_HINT: 1996-05-12\n\n## B02 — b\n\ny';
const h2 = beatsSource(hinted, 1, 2);
assert.same([beatsSource(hinted, 0, 1).text, h2.text, replaceSource(hinted, h2, '## B02 — b\n\n고침')], ['## B01 — a\n\nx', '## B02 — b\n\ny', hinted.replace(/y$/, '고침')]);
const crlf = real.replace(/\n/g, '\r\n');
const sc = beatsSource(crlf, 10, 20);
assert.same([sc.text === s2.text, replaceSource(crlf, sc, sc.text) === real], [true, true], 'CRLF: same text, stored with plain newlines once fixed');
console.log('beats ok');
