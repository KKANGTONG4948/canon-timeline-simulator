// The quick bar in SillyTavern's input area, and the window it opens.
//
//   [📜]  [←]  21~40 / 71  [→]
//
// A slim row inside #send_form, right above the message box (its own row, so the box keeps its
// width on a phone). 📜 opens a window with the block that is injected right now; the arrows are
// the panel's [← 이전 N Beat] / [다음 N Beat →] — the very same action (app.shiftWindow), with
// the same question and the same summary call when a record is owed. Between them: where the
// injected Beats sit among all Beats of the checked file.
//
// Both are redrawn from the same plan the injection is built from (app.plannedInjection), every
// time the panel is (ui.js calls renderBar), so the bar, the window and the prompt cannot differ.
//
// The window also has [✏️ 이 구간 고치기] / [✏️ 머리말 고치기]: a mistake seen there is fixed there,
// in the stored file itself (app.editSource) — and the window shows the corrected text at once.

import { ctx, hasChat, esc, estTokens, toast } from './st.js';
import { whereLabel } from './inject.js';
import * as app from '../index.js';

const BAR_ID = 'cts_bar';
const POPUP_OPTIONS = { okButton: '닫기', wide: true, large: true, allowVerticalScrolling: true, leftAlign: true };

let bar = null;        // the row in #send_form
let pop = null;        // the content element of the open window; null when it is closed
let busyNow = '';      // what the panel says is running (ui.js)

/**
 * "21~40 / 71": the injected Beats by their position in the file, and how many Beats the file has.
 * Positions, not Beat ids — ids may skip numbers, the count cannot. A file without Beat headings
 * is injected whole.
 */
export function beatCounter(win) {
    if (!win) return '';
    if (!win.total) return '전체';
    const from = win.start + 1;
    return `${from === win.end ? from : `${from}~${win.end}`} / ${win.total}`;
}

/** What both the bar and the window show, from the plan the injection uses. */
function view() {
    const s = app.getSettings();
    const p = app.plannedInjection();
    const w = p.win;
    const active = !!(s.enabled && hasChat() && p.file && w);
    const free = active && !!w.total && !app.isBusy();
    return { s, p, w, active, canPrev: free && w.index > 0, canNext: free && w.index < w.count - 1 };
}

function where(v) {
    const { p, w } = v;
    return `${p.file.name} · ${w.label}${w.total ? ` · 구간 ${w.index + 1}/${w.count}` : ''}`;
}

function arrow(dir, label, on, title) {
    return `<button type="button" class="menu_button cts-btn cts-bar-btn" data-bar="${dir}"${on ? '' : ' disabled'} title="${esc(title)}">${label}</button>`;
}

function barHtml(v) {
    const w = v.w;
    return `<button type="button" class="menu_button cts-btn cts-bar-btn" data-bar="open" title="지금 AI에게 들어가는 원작 대본 보기 (${esc(where(v))})">📜</button>
        ${arrow('prev', '←', v.canPrev, w.total ? `이전 ${w.size} Beat` : 'Beat 구간이 없는 파일이에요')}
        <span class="cts-bar-count" title="지금 넣는 Beat 위치 / 이 파일의 전체 Beat 수 — ${esc(where(v))}">${busyNow ? '⏳ ' : ''}${esc(beatCounter(w))}</span>
        ${arrow('next', '→', v.canNext, w.total ? `다음 ${w.size} Beat` : 'Beat 구간이 없는 파일이에요')}`;
}

function windowHtml(v) {
    if (!v.active) return '<div class="cts-hint">지금 넣는 원작 대본이 없어요. 이 채팅에서 원작 진행이 켜져 있고 원작 파일이 있어야 해요.</div>';
    const { s, p, w } = v;
    const nav = w.total ? `<div class="cts-pop-nav">
            ${arrow('prev', '← 이전', v.canPrev, `이전 ${w.size} Beat`)}
            <b class="cts-bar-count" title="지금 넣는 Beat 위치 / 이 파일의 전체 Beat 수">${esc(beatCounter(w))}</b>
            ${arrow('next', '다음 →', v.canNext, `다음 ${w.size} Beat`)}
        </div>` : '';
    // Fixing the file from here: the stored text of what is shown, in SillyTavern's input box (app.editSource).
    const fix = (name, label, title) => `<button type="button" class="menu_button cts-btn" data-bar="${name}"${app.isBusy() ? ' disabled' : ''} title="${esc(title)}">${label}</button>`;
    const edit = `<div class="cts-pop-nav">
            ${fix('edit', w.total ? '✏️ 이 구간 고치기' : '✏️ 내용 고치기', '잘못 적힌 곳을 여기서 바로 고쳐요. 저장하면 확장에 저장된 md 파일이 바뀌고 주입에 바로 반영돼요')}
            ${w.total && w.header ? fix('editHeader', '✏️ 머리말 고치기', '[FILE HEADER]로 들어가는, 첫 Beat 앞부분을 고쳐요') : ''}
        </div>`;
    return `
        <div><b>📜 지금 주입되는 원작 대본</b></div>
        <div class="cts-hint">${esc(where(v))} · ${esc(whereLabel(s.mdPosition, s.mdDepth))} · 약 ${estTokens(p.md).toLocaleString()}토큰</div>
        ${busyNow ? `<div class="cts-busy">⏳ ${esc(busyNow)}</div>` : ''}
        ${nav}
        ${edit}
        <pre class="cts-text cts-pop-text">${esc(p.md)}</pre>
        <details class="cts-fold-inner"><summary>원작 진행 기록 <span class="cts-hint">${esc(whereLabel(s.memPosition, s.memDepth))} · ${p.mem ? `약 ${estTokens(p.mem).toLocaleString()}토큰` : '비어 있음'}</span></summary>${p.mem ? `<pre class="cts-text cts-pop-text">${esc(p.mem)}</pre>` : '<div class="cts-hint">보내지 않아요.</div>'}</details>`;
}

async function run(name) {
    if (name === 'open') return openWindow();
    if (name === 'prev') return app.shiftWindow(-1);
    if (name === 'next') return app.shiftWindow(1);
    if (name === 'edit') return app.editSource('beats');
    if (name === 'editHeader') return app.editSource('header');
    return undefined;
}

function onClick(e) {
    const el = e.target.closest?.('[data-bar]');
    if (!el || el.disabled) return;
    run(el.dataset.bar).catch(err => { console.error('[Canon Timeline Simulator]', err); toast('error', err.message); });
}

function mountBar() {
    const form = document.getElementById('send_form');
    if (!form) return;
    bar = document.getElementById(BAR_ID);
    if (!bar) {
        bar = document.createElement('div');
        bar.id = BAR_ID;
        bar.className = 'cts-bar';
        form.appendChild(bar);
    }
    if (!bar.dataset.ctsBound) {
        bar.dataset.ctsBound = '1';
        bar.addEventListener('click', onClick);
    }
}

/**
 * Redraws the bar and, when it is open, the window. Shown only while this chat injects a canon
 * file (and the bar is not switched off in the settings); hidden otherwise, taking no room.
 * @param {string} [busyText] what is running now ('' = nothing), as the panel shows it
 */
export function renderBar(busyText = '') {
    if (typeof document === 'undefined') return;
    busyNow = busyText || '';
    if (!bar || !bar.isConnected) { bar = null; mountBar(); }
    const v = view();
    if (bar) {
        const show = v.active && v.s.inputBar !== false;
        bar.hidden = !show;
        bar.innerHTML = show ? barHtml(v) : '';
    }
    if (pop) pop.innerHTML = windowHtml(v);
}

export function isWindowOpen() {
    return !!pop;
}

/**
 * Opens the window showing what is injected right now (SillyTavern's own popup). It stays in
 * step while open: moving the Beat window from inside it redraws it.
 */
export async function openWindow() {
    if (pop || typeof document === 'undefined') return;
    const c = ctx();
    const el = document.createElement('div');
    el.className = 'cts-pop';
    el.addEventListener('click', onClick);
    pop = el;
    el.innerHTML = windowHtml(view());
    try {
        if (typeof c.Popup === 'function' && c.POPUP_TYPE) await new c.Popup(el, c.POPUP_TYPE.TEXT, '', POPUP_OPTIONS).show();
        else if (c.callGenericPopup && c.POPUP_TYPE) await c.callGenericPopup(el, c.POPUP_TYPE.TEXT, '', POPUP_OPTIONS);
        else toast('warning', '이 SillyTavern에서는 창을 열 수 없어요. 확장 패널의 「현재 주입 Beat」를 펼쳐 보세요.');
    } finally {
        pop = null;
    }
}
