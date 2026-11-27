// The quick bar above the message box — [📜] [←] 21~40 / 71 [→] — and the window 📜 opens.
// The arrows are the panel's [이전 N Beat] / [다음 N Beat]: the same action, the same rules.
// The counter and the setting are checked everywhere; the parts that need a page (the bar itself,
// the window) run only where there is a document — the browser runner. node tests/run.js skips them.
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { beatCounter, renderBar, openWindow, isWindowOpen } from '../src/bar.js';
import { renderPanel } from '../src/ui.js';
import { parseBeats, beatWindow } from '../src/beats.js';
import { PAST_LABEL } from '../src/inject.js';

const ids = (n, from = 1) => Array.from({ length: n }, (_, i) => `B${String(from + i).padStart(2, '0')}`);
const mk = (list) => ['# Canon Timeline\n\n배경 역사.', ...list.map(id => `## ${id} — 제목 ${id}\n\n[TARGET]\n- ${id} 내용`)].join('\n\n---\n\n');
const evt = (args) => {
    const m = args.prompt.match(/<canon_beats beats="([^"~]+)~([^"]+)">/);
    return `<past_canon_events>\n- ${m[1]}부터 ${m[2]}까지의 사건\n</past_canon_events>`;
};

const h = load({ chat: makeChat(6), reply: evt });
const s = app.getSettings();
s.files.length = 0; s.retries = 0; s.beatWindowSize = 20;
app.addFile('a.md', mk(ids(45)));
app.addFile('c.md', '# 일반 문서\n\nBeat 제목이 없는 원작 줄거리.');
const md = () => h.prompts[app.PROMPT_KEY_MD].text;
const calls = () => h.state.calls.length;
const counter = () => beatCounter(app.plannedInjection().win);

// ---- the number between the arrows: position of the injected Beats / Beats in the file
assert.strictEqual(app.defaultSettings.inputBar, true, 'the bar is on by default');
assert.same([beatCounter(null), beatCounter(undefined)], ['', '']);
assert.same(
    [{ total: 71, start: 0, end: 20 }, { total: 71, start: 20, end: 40 }, { total: 71, start: 60, end: 71 }, { total: 71, start: 70, end: 71 }, { total: 0, start: 0, end: 0 }].map(beatCounter),
    ['1~20 / 71', '21~40 / 71', '61~71 / 71', '71 / 71', '전체'],
    'range / total; one Beat shows one number; a file without Beats is injected whole');
const skip = parseBeats(mk(['B01', 'B05', 'B09']));
assert.same([beatCounter(beatWindow(skip, 0, 2)), beatCounter(beatWindow(skip, 1, 2))], ['1~2 / 3', '3 / 3'], 'counted by position, so skipped Beat numbers do not matter');

await app.setOn(true);
s.pastEnabled = false;
app.refreshInjection();
assert.strictEqual(counter(), '1~20 / 45');
await app.shiftWindow(1);
assert.strictEqual(counter(), '21~40 / 45');
await app.shiftWindow(1);
assert.strictEqual(counter(), '41~45 / 45');
s.beatWindowSize = 10;
assert.strictEqual(beatCounter(app.plannedInjection().win), '21~30 / 45', 'follows the window size setting');
s.beatWindowSize = 20;

// without a page nothing is drawn and nothing breaks
renderBar();
renderBar('작업 중');
assert.strictEqual(isWindowOpen(), false);

if (typeof document === 'undefined') {
    await openWindow();
    assert.strictEqual(isWindowOpen(), false, 'no page → no window');
    console.log('bar ok (page parts skipped: no document)');
} else {
    const tick = (ms = 30) => new Promise(r => setTimeout(r, ms));
    const form = document.createElement('div');
    form.id = 'send_form';
    form.innerHTML = '<div id="nonQRFormItems"><textarea id="send_textarea"></textarea></div>';
    document.body.append(form);
    try {
        // ---- mounted in the input area, drawn from the same plan as the injection
        renderPanel();   // the settings panel is not mounted here; the bar is drawn all the same
        const bar = document.getElementById('cts_bar');
        assert.ok(bar && bar.parentElement === form && !bar.hidden, 'a row inside #send_form');
        const parts = (root = bar) => [...root.children].map(e => e.textContent.trim());
        const b = (name, root = bar) => root.querySelector(`[data-bar="${name}"]`);
        const off = (root = bar) => [b('prev', root).disabled, b('next', root).disabled];
        const tap = async (name, root = bar) => { b(name, root).click(); await tick(); };
        assert.same(parts(), ['📜', '←', '41~45 / 45', '→'], '📜, then ← number →');
        assert.same(off(), [false, true], 'last window: → is off');
        renderPanel();
        assert.strictEqual(document.querySelectorAll('#cts_bar').length, 1, 'drawn again, not added again');

        // ---- the arrows move the Beat window (past events off: at once, no question, no call)
        let n = calls();
        h.confirms.length = 0;
        await tap('prev');
        assert.same([parts()[2], md().startsWith('<canon_baseline file="a.md" beats="B21~B40">'), off()], ['21~40 / 45', true, [false, false]]);
        await tap('prev');
        assert.same([parts()[2], off(), app.getMemory(false).beatWindowIndex], ['1~20 / 45', [true, false], 0], 'first window: ← is off');
        b('prev').click();
        await tick();
        assert.strictEqual(app.getMemory(false).beatWindowIndex, 0, 'a disabled arrow does nothing');
        await tap('next');
        assert.same([parts()[2], calls() - n, h.confirms.length], ['21~40 / 45', 0, 0]);
        await tap('prev');

        // ---- past events on: the same question and the same single call as the panel's button
        s.pastEnabled = true;
        renderPanel();
        n = calls();
        await tap('next');
        assert.same([calls() - n, h.confirms.length, parts()[2], md().includes(PAST_LABEL)], [1, 1, '21~40 / 45', true], '→ records the window being left, then moves');
        assert.includes(h.confirms[0], '채팅 로그는 보내지 않음');
        h.state.fail = new Error('boom');
        await tap('next');
        assert.same([parts()[2], app.getMemory(false).beatWindowIndex, app.isBusy()], ['21~40 / 45', 1, false], 'a failed summary does not move the window');
        assert.ok(h.toasts.at(-1).startsWith('err:지난 원작 사건 정리 실패'));
        h.state.fail = null;
        // while the summary runs: both arrows off, ⏳ by the number
        let release;
        h.state.reply = (args) => new Promise(res => { release = () => res(evt(args)); });
        b('next').click();
        await tick();
        assert.same([app.isBusy(), off(), parts()[2]], [true, [true, true], '⏳ 21~40 / 45'], 'busy: no second move can start');
        release();
        await tick();
        assert.same([app.isBusy(), parts()[2], off()], [false, '41~45 / 45', [false, true]]);
        h.state.reply = evt;

        // ---- 📜 opens the window with exactly what is injected
        const TEXT = 1;
        const show = h.context.Popup.show;
        class FakePopup {
            constructor(content, type, input, options) { FakePopup.all.push(this); Object.assign(this, { content, type, input, options }); }
            show() { document.body.append(this.content); return new Promise(res => { this.close = () => { this.content.remove(); res(1); }; }); }
        }
        FakePopup.all = [];
        FakePopup.show = show;   // Popup.show.confirm / input, as SillyTavern's class has them
        h.context.Popup = FakePopup;
        h.context.POPUP_TYPE = { TEXT, CONFIRM: 2, INPUT: 3 };
        await tap('open');
        const popup = FakePopup.all[0];
        const win = popup.content;
        assert.same([isWindowOpen(), FakePopup.all.length, popup.type, popup.options.large, popup.options.wide, popup.options.allowVerticalScrolling, popup.options.okButton], [true, 1, TEXT, true, true, true, '닫기']);
        const shown = () => win.querySelector('pre.cts-pop-text').textContent;
        assert.strictEqual(shown(), md(), 'the window shows the injected string itself');
        assert.strictEqual(shown(), app.plannedInjection().md);
        assert.includes(win.textContent, 'a.md · B41 ~ B45 · 구간 3/3');
        assert.same([win.querySelector('.cts-pop-nav .cts-bar-count').textContent, off(win)], ['41~45 / 45', [false, true]]);
        await tap('open');
        assert.strictEqual(FakePopup.all.length, 1, 'opening it twice gives one window');
        // moving from inside the window redraws the window, the bar and the prompt together
        n = calls();
        await tap('prev', win);
        assert.same([calls() - n, win.querySelector('.cts-pop-nav .cts-bar-count').textContent, parts()[2], shown() === md(), md().startsWith('<canon_baseline file="a.md" beats="B21~B40">')], [0, '21~40 / 45', '21~40 / 45', true, true]);
        await tap('next', win);
        assert.same([calls() - n, shown() === md(), parts()[2]], [0, true, '41~45 / 45'], 'a window already recorded is passed without a call');
        assert.includes(win.textContent, '원작 진행 기록');
        // ✏️ in the window: the stored text of what is shown goes to the box; saved → the window shows the fix
        assert.same([b('edit', win).textContent, b('editHeader', win).textContent, b('edit', win).disabled], ['✏️ 이 구간 고치기', '✏️ 머리말 고치기', false]);
        const boxed = [];
        show.input = async (t, m, d) => { boxed.push(d); return d.replace('- B41 내용', '- B41 고친 내용'); };
        await tap('edit', win);
        assert.ok(boxed[0].startsWith('## B41 — ') && boxed[0].endsWith('- B45 내용'), 'the box holds the Beats of the window shown');
        assert.same([shown().includes('- B41 고친 내용'), shown() === md(), s.files[0].text.includes('- B41 고친 내용')], [true, true, true], 'fixed from the window: the window, the prompt and the file agree');
        show.input = async (t, m, d) => d.replace('배경 역사.', '고친 배경.');
        await tap('editHeader', win);
        assert.same([shown().includes('고친 배경.'), shown() === md()], [true, true]);
        popup.close();
        await tick();
        assert.same([isWindowOpen(), document.body.contains(win)], [false, false], 'closed');
        await tap('open');
        assert.same([FakePopup.all.length, isWindowOpen()], [2, true], 'and can be opened again');
        FakePopup.all[1].close();
        await tick();

        // ---- a file without Beat headings: injected whole, nowhere to move
        await app.switchFile(1, { summarize: false });
        assert.same([parts(), off()], [['📜', '←', '전체', '→'], [true, true]]);
        await app.switchFile(-1, { summarize: false });

        // ---- shown only while this chat injects a canon file
        assert.same([bar.hidden, parts()[2]], [false, '1~20 / 45'], 'back on a.md, from its first window');
        s.inputBar = false;
        renderPanel();
        assert.same([bar.hidden, bar.innerHTML], [true, ''], 'switched off in the settings');
        s.inputBar = true;
        renderPanel();
        assert.strictEqual(bar.hidden, false);
        await app.setOn(false);
        assert.strictEqual(bar.hidden, true, 'canon off for this chat');
        await app.setOn(true);
        s.enabled = false;
        renderPanel();
        assert.strictEqual(bar.hidden, true, 'extension off');
        s.enabled = true;
        h.state.chatId = 'other';
        renderPanel();
        assert.strictEqual(bar.hidden, true, 'a chat that does not use canon');
        h.state.chatId = 'c';
        renderPanel();
        assert.same([bar.hidden, parts()[2]], [false, '1~20 / 45']);
    } finally {
        form.remove();
    }
    console.log('bar ok');
}
