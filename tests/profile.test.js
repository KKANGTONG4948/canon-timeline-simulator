// [연결 테스트]: the selected summary profile is called through the very path the summaries use,
// with a tiny request and nothing else, and no canon state changes. No real API is called here:
// the fake Connection Manager in harness.js records what it is asked.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { summaryProfile, summaryCall, safeError } from '../src/model.js';
import { stepChapter, stepSaga } from '../src/memory.js';

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const mk = (list) => ['# Canon Timeline', ...list.map(id => `## ${id} — 제목 ${id}\n\n[TARGET]\n- ${id} 내용`)].join('\n\n---\n\n');
const KEY = 'sk-profSECRET1234567890';
const profiles = [
    { id: 'p1', name: 'My Summary Profile', api: 'custom', 'api-url': 'https://llm.example/v1?key=URLSECRET42', 'secret-id': KEY, model: 'm-1' },
    { id: 'p2', name: 'Other Profile', api: 'openai', model: 'm-2' },
];
const chat = makeChat(8, (i) => (i === 5 ? 'RP전용: 실제 채팅 문장.' : `RP줄 ${i}`));
const h = load({ chat, profiles });
const s = app.getSettings();
s.files.length = 0; s.beatWindowSize = 20; s.maxTokens = 3000;
s.retries = 1;              // the summaries retry once; the connection test must not
s.profileId = 'p1';
app.addFile('a.md', mk(ids(45)));
app.addFile('b.md', mk(ids(5)));
await app.setOn(true);
const cm = app.getMemory(false);
const pastReply = (args) => `<past_canon_events>\n- ${args.messages[1].content.match(/beats="([^"]+)"/)[1]} 구간의 사건\n</past_canon_events>`;

// ---- which profile the summaries use: one helper, read at the moment of the call
assert.same(summaryProfile(s), { id: 'p1', name: 'My Summary Profile', found: true });
assert.same(summaryProfile({ profileId: '' }), { id: '', name: '', found: false }, 'no profile = the chat\'s own connection');
assert.same(summaryProfile({}), { id: '', name: '', found: false });
assert.same(summaryProfile({ profileId: 'gone' }), { id: 'gone', name: '', found: false }, 'an id that is not in the Connection Manager list');
assert.same(summaryCall(s, { expectTag: 't' }), { profileId: 'p1', maxTokens: 3000, retries: 1, expectTag: 't' }, 'the options of every summary call');
assert.ok(!JSON.stringify(summaryProfile(s)).includes(KEY) && !JSON.stringify(summaryProfile(s)).includes('URLSECRET42'), 'only the id and the name of a profile are read');

// a real summary call (Past Canon Events) through the profile, and some canon state to protect
h.state.reply = pastReply;
await app.shiftWindow(1);
const real = h.state.calls.at(-1);
assert.same([h.state.calls.length, real.kind, real.profileId, real.max, cm.beatWindowIndex], [1, 'profile', 'p1', 3000, 1], 'the summary went to the selected profile');
cm.timeline.push({ id: 'c1', tier: 'chapter', sourceFileIds: ['y'], fileName: 'y.md', from: -3, to: -1, title: '기존 챕터', text: '- 기존 챕터 내용', keywords: [] });
cm.timeline.push({ id: 'e1', tier: 'episode', sourceFileId: 'x', fileName: 'x.md', from: 0, to: 3, title: '기존 에피소드', text: '- 기존 에피소드 내용', keywords: [] });
cm.saga = { text: '기존 사가', coversTo: -4, fileIds: ['z'] };
cm.lastBeatDateNotice = { fileId: 'q', windowIndex: 0, date: '1990-01-01' };
app.refreshInjection();

// Everything a test could touch: every chat's canon memory, all settings, both prompts, the chat.
const snap = () => JSON.stringify({ metas: h.metas, settings: h.context.extensionSettings, prompts: h.prompts, chat });
const canon = () => JSON.stringify([cm.beatWindowIndex, cm.pastEvents, cm.timeline, cm.saga, cm.archive, cm.fileId, cm.fileIndex, cm.startMessage, cm.lastBeatDateNotice, cm.noticeShownFor]);
const canonBefore = canon();
const run = async () => {
    const before = snap();
    const n = h.state.calls.length;
    h.toasts.length = 0; h.titles.length = 0;
    const r = await app.testConnection();
    return { r, made: h.state.calls.slice(n), same: snap() === before && canon() === canonBefore };
};
const text = (call) => call.messages.map(m => m.content).join('\n');
let t;

// ---- 1. no profile → no API call, a warning
s.profileId = '';
t = await run();
assert.same([t.made.length, t.r.ok, t.same, h.titles], [0, false, true, ['Canon Timeline']], 'no profile: nothing is called');
assert.ok(h.toasts.length === 1 && h.toasts[0].startsWith('warn:먼저 요약 모델 프로필을 선택하세요.'), 'no profile: a warning');
s.profileId = 'deleted-profile';
t = await run();
assert.same([t.made.length, t.r.ok, t.same, h.titles], [0, false, true, ['Canon Timeline']], 'unknown profile: nothing is called');
assert.ok(h.toasts[0].startsWith('err:요약 모델 연결 실패: 선택한 프로필을 찾을 수 없어요'), 'unknown profile: an error');

// ---- 2. a profile and a normal reply → success
s.profileId = 'p1';
h.state.reply = 'OK';
t = await run();
assert.same([t.made.length, t.r.ok, t.r.profileId, t.r.profile, t.r.reason, t.same], [1, true, 'p1', 'My Summary Profile', '', true]);
assert.same([h.toasts, h.titles], [['ok:요약 모델 연결 성공: My Summary Profile'], ['Canon Timeline']], 'success toast names the profile');
const probe = t.made[0];
// ---- 9. the same path as the real summary call: same service, same profile, same request options
assert.same([probe.kind, probe.profileId, probe.max, probe.custom, probe.messages.map(m => m.role)], [real.kind, real.profileId, real.max, real.custom, real.messages.map(m => m.role)], 'the probe goes where the summary went, the same way');
assert.same(probe.custom, { stream: false, extractData: true, includePreset: true });
// ---- 12. but with none of the real prompts or data
assert.ok(text(probe).includes('Connection test. Reply with exactly: OK') && text(probe).length < 200, 'a tiny request');
for (const no of ['RP전용', 'RP줄', '내용', 'B01', '기존', 'objective events', 'past_canon_events', 'canon_episode', 'canon_chapter', 'canon_saga', 'canon_beats', 'transcript', 'Canon Timeline']) assert.excludes(text(probe), no, 'no canon text, no chat, no summary prompt');
h.state.reply = 'OK. 연결되었습니다!';
t = await run();
assert.same([t.r.ok, t.same], [true, true], 'extra words in the reply are fine: a reply is what counts');
h.state.reply = 'I cannot help with that.';
t = await run();
assert.same([t.r.ok, t.made.length], [true, 1], 'even a refusal-like reply shows the connection works');

// ---- 3. the request is rejected → failure, nothing changed, no retry
h.state.fail = new Error('API request failed: 401 Unauthorized');
const started = Date.now();
t = await run();
assert.same([t.made.length, t.r.ok, t.r.reason, t.same, app.isTesting()], [1, false, 'API request failed: 401 Unauthorized', true, false], 'rejected: one attempt, failure, state untouched');
assert.ok(Date.now() - started < 1000, 'no retry wait');
assert.same([h.toasts, h.titles], [['err:요약 모델 연결 실패: API request failed: 401 Unauthorized'], ['Canon Timeline']]);

// secrets never reach the toast, the stored result or the console
const logged = [];
const keep = { warn: console.warn, error: console.error };
console.warn = (...a) => { logged.push(a.map(String).join(' ')); };
console.error = (...a) => { logged.push(a.map(String).join(' ')); };
h.state.fail = new Error(`401 Incorrect API key provided: ${KEY}. Authorization: Bearer abc.def.ghi (https://llm.example/v1/chat?api_key=URLSECRET42&x=1)`);
t = await run();
console.warn = keep.warn; console.error = keep.error;
const shown = [h.toasts.join('\n'), logged.join('\n'), JSON.stringify(app.getModelTest())].join('\n');
for (const secret of [KEY, 'abc.def.ghi', 'URLSECRET42', 'api_key=URL']) assert.excludes(shown, secret, 'masked');
assert.ok(h.toasts[0].includes('401') && h.toasts[0].includes('https://llm.example/v1/chat?***') && logged.length === 1 && t.same, 'the useful part of the error stays; logged once, masked');
assert.excludes(safeError(new Error('{"error":{"message":"bad","api_key":"ABCDEF123456"}}')), 'ABCDEF123456');
assert.excludes(safeError(new Error('x-api-key: 0123456789abcdef0123456789abcdef0123')), '0123456789abcdef');
assert.excludes(safeError(new Error('key AIzaSyA1234567890abcdefghij rejected')), 'AIzaSyA1234567890');
assert.strictEqual(safeError(new Error('Unexpected token < in JSON; max tokens: 4096 is too large for model m-1')), 'Unexpected token < in JSON; max tokens: 4096 is too large for model m-1', 'ordinary errors are left as they are');
assert.strictEqual(safeError(new Error('x'.repeat(500))).length, 200, 'kept short');
assert.strictEqual(safeError(new Error('outer', { cause: new Error('inner 503') })), 'outer → inner 503');
h.state.fail = null;

// ---- 4. an empty or unusable reply → failure
for (const reply of ['', '   \n ', '<think>생각만 하고 끝</think>', () => undefined]) {
    h.state.reply = reply;
    t = await run();
    assert.same([t.made.length, t.r.ok, t.same, h.toasts[0]], [1, false, true, 'err:요약 모델 연결 실패: 빈 응답'], `empty reply (${JSON.stringify(String(reply))})`);
}
// the Connection Manager service itself is missing → failure without a request
const service = h.context.ConnectionManagerRequestService;
h.context.ConnectionManagerRequestService = undefined;
t = await run();
assert.same([t.made.length, t.r.ok, t.same], [0, false, true]);
assert.includes(h.toasts[0], 'Connection Manager');
h.context.ConnectionManagerRequestService = service;

// ---- 5–7. nothing of the chat's canon state changed through all of the above
assert.strictEqual(canon(), canonBefore, 'beatWindowIndex, pastEvents, episodes/chapters/saga, file pointer and notices are as they were');
assert.same([cm.beatWindowIndex, Object.values(cm.pastEvents)[0].map(x => x.count), cm.timeline.map(n => n.id), cm.saga.text, cm.lastBeatDateNotice.date, chat.length], [1, [20], ['c1', 'e1'], '기존 사가', '1990-01-01', 8]);
assert.strictEqual(h.state.calls.filter(c => c.kind === 'raw').length, 0, 'the chat\'s own connection was never used by the test');

// ---- 8. a second click while a test is running does nothing; the lock always opens again
h.state.reply = 'OK';
let n = h.state.calls.length;
const first = app.testConnection();
assert.strictEqual(app.isTesting(), true, 'running');
const second = app.testConnection();
assert.strictEqual(await second, null, 'second run refused');
const done = await first;
assert.same([done.ok, h.state.calls.length - n, app.isTesting()], [true, 1, false], 'one request for two clicks');
h.state.fail = new Error('down');
await app.testConnection();
assert.strictEqual(app.isTesting(), false, 'free again after a failure');
h.state.fail = null;
assert.strictEqual((await app.testConnection()).ok, true, 'and can be run again');

// ---- 10. the profile was just changed → the new one is tested, and it is the one the summaries use
s.profileId = 'p2';
t = await run();
assert.same([t.made.length, t.made[0].profileId, t.r.profile, h.toasts], [1, 'p2', 'Other Profile', ['ok:요약 모델 연결 성공: Other Profile']], 'tested with the profile selected now');
h.state.reply = pastReply;
await app.shiftWindow(1);
assert.same([h.state.calls.at(-1).kind, h.state.calls.at(-1).profileId, cm.beatWindowIndex], ['profile', 'p2', 2], 'Past Canon Events uses that same profile');
chat.push({ is_user: false, name: 'Rin', mes: '한 턴.', is_system: false, extra: {} });
h.state.reply = '<canon_episode>\ntitle: a편\nkeywords: k\nsummary:\n- a편 기록\n</canon_episode>';
await app.switchFile(1);
assert.same([h.state.calls.at(-1).profileId, h.state.calls.at(-1).custom, cm.timeline.at(-1).title], ['p2', probe.custom, 'a편'], 'Canon Episode too');
h.state.reply = '<canon_chapter>\ntitle: c\nkeywords: k\nsummary:\nx\n</canon_chapter>';
assert.strictEqual(await stepChapter(s, cm, true), true);
assert.strictEqual(h.state.calls.at(-1).profileId, 'p2', 'Canon Chapter too');
h.state.reply = '<canon_saga>\ns\n</canon_saga>';
assert.strictEqual(await stepSaga(s, cm, true), true);
assert.strictEqual(h.state.calls.at(-1).profileId, 'p2', 'Canon Saga too');
assert.ok(h.state.calls.every(c => c.kind === 'profile'), 'with a profile selected, nothing goes anywhere else');

// no profile: the summaries use the chat's connection; the test has no profile to check
s.profileId = '';
n = h.state.calls.length;
h.state.reply = '<canon_saga>\ns2\n</canon_saga>';
cm.timeline.unshift({ id: 'c9', tier: 'chapter', sourceFileIds: ['w'], from: -9, to: -8, title: 'C9', text: 'c9', keywords: [] });
await stepSaga(s, cm, true);
assert.same([h.state.calls.length - n, h.state.calls.at(-1).kind], [1, 'raw'], 'a summary without a profile goes through the chat\'s connection');
t = await run();
assert.same([t.made.length, t.r.ok], [0, false], 'the connection test still makes no call without a profile');
console.log('profile ok');
