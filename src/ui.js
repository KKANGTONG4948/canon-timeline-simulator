// The settings-drawer panel. Re-rendered from state after every action; clicks go through one
// delegated handler keyed by data-act. Classes are cts-* only.

import { ctx, hasChat, chatLength, esc, inputBox, confirmBox, estTokens, toast } from './st.js';
import { parseHint } from './files.js';
import { currentIndex, currentFile, coveredFileIds } from './state.js';
import { PROMPT_DEFS, savedPrompts, activePrompt, LANGUAGES } from './prompts.js';
import { rangeLabel } from './memory.js';
import { whereLabel } from './inject.js';
import { parseCached } from './beats.js';
import { eventLines } from './past.js';
import { summaryProfile } from './model.js';
import { renderBar } from './bar.js';
import * as app from '../index.js';

let root = null;
let busyText = '';

function btn(act, label, { id = '', primary = false, disabled = false, title = '', cls = '' } = {}) {
    return `<button type="button" class="menu_button cts-btn${primary ? ' cts-primary' : ''}${cls ? ` ${cls}` : ''}" data-act="${act}"${id ? ` data-id="${esc(id)}"` : ''}${disabled ? ' disabled' : ''}${title ? ` title="${esc(title)}"` : ''}>${label}</button>`;
}

function numberRow(key, label, min, max, hint = '') {
    const s = app.getSettings();
    return `<div class="cts-field"><div class="cts-field-text"><span class="cts-label">${esc(label)}</span>${hint ? `<span class="cts-hint">${esc(hint)}</span>` : ''}</div><input type="number" class="text_pole cts-num" data-setting="${key}" min="${min}" max="${max}" value="${esc(s[key])}"></div>`;
}

function selectRow(key, label, options, hint = '') {
    const s = app.getSettings();
    return `<div class="cts-field"><div class="cts-field-text"><span class="cts-label">${esc(label)}</span>${hint ? `<span class="cts-hint">${esc(hint)}</span>` : ''}</div><select class="text_pole cts-select" data-setting="${key}">${Object.entries(options).map(([v, l]) => `<option value="${esc(v)}"${s[key] === v ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
}

function profileOptions(selected) {
    const profiles = ctx().extensionSettings?.connectionManager?.profiles ?? [];
    const opts = { '': '현재 연결 사용' };
    for (const p of [...profiles].sort((a, b) => String(a.name).localeCompare(String(b.name)))) opts[p.id] = p.name;
    if (selected && !opts[selected]) opts[selected] = `(없는 프로필: ${selected})`;
    return opts;
}

const POS = { in_chat: '채팅 안 (깊이 지정)', in_prompt: '캐릭터 설정 뒤', before_prompt: '프롬프트 맨 앞' };

function renderFiles(s, cm) {
    const list = s.files;
    const cur = cm ? currentIndex(cm, list) : -1;
    const on = !!cm?.on;
    if (!list.length) return '<div class="cts-hint">원작 파일이 없어요. [파일 추가]로 .md를 넣어 주세요.</div>';
    return list.map((f, i) => {
        const hint = parseHint(f.text);
        const checked = on && i === cur;
        const beatCount = parseCached(f).beats.length;
        return `<div class="cts-file${checked ? ' on' : ''}" data-file="${esc(f.id)}">
            <span class="cts-check" title="${checked ? '지금 AI에게 넣는 파일' : ''}">${checked ? '✓' : ''}</span>
            <span class="cts-name" title="${esc(f.name)}">${esc(f.name)}</span>
            <span class="cts-hint cts-nowrap">${Math.round(f.text.length / 100) / 10}k자${beatCount ? ` · Beat ${beatCount}개` : ''}${hint ? ` · 전환 힌트 ${esc(hint.raw)}` : ''}</span>
            <span class="cts-file-acts">
                ${btn('fileUp', '▲', { id: f.id, disabled: i === 0, title: '순서 위로' })}
                ${btn('fileDown', '▼', { id: f.id, disabled: i === list.length - 1, title: '순서 아래로' })}
                ${btn('fileDelete', '삭제', { id: f.id, title: '목록에서 빼기' })}
            </span>
        </div>`;
    }).join('');
}

function renderStatus(s, cm, p) {
    if (!hasChat()) return '<div class="cts-hint">채팅을 열면 이 채팅의 원작 진행을 보여줄게요.</div>';
    const on = !!cm?.on;
    const list = s.files;
    const file = cm ? currentFile(cm, list) : null;
    const st = app.currentHint();
    const n = chatLength();
    const w = p.win;
    return `
        <label class="cts-toggle"><input type="checkbox" data-act="toggleOn"${on ? ' checked' : ''}> <b>이 채팅에서 원작 진행 사용</b><span class="cts-hint">켜면 체크한 파일의 현재 Beat 구간과 원작 진행 기록을 이 채팅의 답변에 넣어요. 다른 채팅에는 영향이 없어요.</span></label>
        <div class="cts-status">
            <div><b>현재 주입:</b> ${file && on ? `${esc(file.name)} <span class="cts-hint">(${currentIndex(cm, list) + 1}/${list.length})</span>${w?.total ? ` · Beat ${esc(w.label)} <span class="cts-hint">(${w.index + 1}/${w.count})</span>` : ''}` : '<span class="cts-hint">없음</span>'}</div>
            <div><b>이 파일 구간 시작:</b> ${on ? `메시지 #${esc(cm.startMessage)} <span class="cts-hint">(지금 #${n - 1}까지 ${Math.max(0, n - cm.startMessage)}개)</span>` : '<span class="cts-hint">-</span>'}</div>
            <div><b>전환 힌트:</b> ${st?.hint ? `${esc(st.hint.raw)}${st.hint.from ? '' : ' <span class="cts-hint">(날짜를 읽지 못함)</span>'}` : '<span class="cts-hint">없음</span>'}${st?.today ? ` · 작중 날짜 ${esc(st.today.date)} <span class="cts-hint">(#${st.today.at})</span>` : ' · <span class="cts-hint">작중 날짜 없음</span>'}${st?.due ? ' · <b class="cts-due">도달</b>' : ''}</div>
        </div>`;
}

const idRange = (a, b) => (a === b ? a : `${a} ~ ${b}`);

/** One status line: which Beats the injected [PAST CANON EVENTS] covers, and what it is missing — or that it is switched off. */
function pastLine(s, p) {
    const w = p.win;
    if (!w?.total) return '';
    if (s.pastEnabled === false) return '<div><b>지난 원작 사건:</b> <span class="cts-hint">꺼짐 — 넣지 않고, 구간을 넘길 때 정리도 하지 않아요 (고급 설정 › Beat 구간에서 켤 수 있어요)</span></div>';
    if (w.start === 0) return '<div><b>지난 원작 사건:</b> <span class="cts-hint">없음 (첫 구간이라 넣지 않아요)</span></div>';
    const beats = parseCached(p.file).beats;
    const from = p.past ? p.past.count : 0;
    const gap = from < w.start ? `${idRange(beats[from].id, beats[w.start - 1].id)} 구간은 기록 없이 넘겼어요${p.pending ? '. 다음 구간으로 넘길 때 함께 정리해요' : ''}` : '';
    if (!p.past) return `<div><b>지난 원작 사건:</b> <span class="cts-hint">기록 없음 — ${esc(gap)}</span></div>`;
    return `<div><b>지난 원작 사건:</b> ${esc(idRange(beats[0].id, p.past.lastId))} <span class="cts-hint">(${eventLines(p.past.text).length}줄${gap ? ` · ${esc(gap)}` : ''})</span></div>`;
}

/**
 * "현재 주입 Beat": which Beats of the checked file go to the model right now, and — opened —
 * the injected block itself. The text shown is p.md, the same string refreshInjection() sends.
 */
function renderBeatWindow(s, cm, p) {
    if (!hasChat()) return '';
    const w = p.win;
    if (!cm?.on || !p.file || !w) {
        return `<div class="cts-fold cts-beat-off"><span class="cts-label">현재 주입 Beat:</span> <span class="cts-hint">없음 — ${!s.enabled ? '확장이 꺼져 있어요' : (!cm?.on ? '이 채팅에서 원작 진행이 꺼져 있어요' : '원작 파일이 없어요')}</span></div>`;
    }
    const info = [
        `<div><b>현재 파일:</b> ${esc(p.file.name)}</div>`,
        `<div><b>전체 Beat:</b> ${w.total ? w.total : '<span class="cts-hint">Beat 제목(## B01 — …)을 찾지 못해 파일 전체를 한 구간으로 넣어요</span>'}</div>`,
        w.total ? `<div><b>현재 Window:</b> ${w.index + 1} / ${w.count} <span class="cts-hint">(${w.size}개씩)</span></div>` : '',
        `<div><b>현재 주입:</b> ${esc(w.label)}</div>`,
        pastLine(s, p),
        w.total ? `<div><b>마지막 Beat 날짜:</b> ${w.lastDate ? esc(w.lastDate) : `<span class="cts-hint">${esc(w.lastId)}에 date가 없어 날짜 알림은 없어요</span>`}</div>` : '',
    ].join('');
    const pend = p.pending;
    const pastActs = p.past || pend ? `<div class="cts-row">
                    ${p.past ? btn('pastEdit', '지난 사건 고치기', { disabled: !!busyText, title: '지금 넣고 있는 [PAST CANON EVENTS] 내용을 직접 고쳐요' }) : ''}
                    ${p.past ? btn('pastRedo', '지난 사건 다시 정리', { disabled: !!busyText, title: '이 기록이 다루는 원작 Beat로 다시 써요 (API 1회, 채팅 로그는 보내지 않음)' }) : ''}
                    ${pend ? btn('winSkip', '기록 없이 다음 구간', { disabled: !!busyText, title: '사건 정리 없이 구간만 넘겨요. 정리가 계속 실패할 때만 쓰세요' }) : ''}
                </div>` : '';
    const nextTitle = s.pastEnabled === false
        ? '지난 원작 사건을 꺼 두어서 요약 없이 바로 넘어가요'
        : (pend
            ? `${idRange(pend.firstId, pend.lastId)} 구간의 원작 사건을 [PAST CANON EVENTS]에 정리한 뒤 다음 구간으로 (API 1회, 채팅 로그는 보내지 않음)`
            : '이 구간의 사건 기록이 이미 있어서 요약 없이 넘어가요');
    return `<details class="cts-fold" data-fold="beatOpen"${s.ui.beatOpen ? ' open' : ''}>
            <summary>현재 주입 Beat: <b>${esc(w.label)}</b>${w.total ? ` <span class="cts-hint">Window ${w.index + 1} / ${w.count} · 전체 ${w.total}</span>` : ''}</summary>
            <div class="cts-fold-body">
                <div class="cts-status">${info}</div>
                ${pastActs}
                <div class="cts-row">
                    ${btn('srcEdit', w.total ? '이 구간 원문 고치기' : '파일 내용 고치기', { disabled: !!busyText, title: '원작 대본이 잘못 적혀 있으면 여기서 바로 고쳐요. 저장하면 확장에 저장된 md 파일이 바뀌고 주입에 바로 반영돼요 (이 파일을 쓰는 모든 채팅에 적용)' })}
                    ${w.total && w.header ? btn('headEdit', '파일 머리말 고치기', { disabled: !!busyText, title: '[FILE HEADER]로 들어가는, 첫 Beat 앞부분을 고쳐요' }) : ''}
                </div>
                <div class="cts-hint">아래는 지금 AI에게 실제로 들어가는 원작 대본 블록 그대로예요 (${esc(whereLabel(s.mdPosition, s.mdDepth))}, 약 ${estTokens(p.md).toLocaleString()}토큰).</div>
                <pre class="cts-text cts-beat-text" id="cts_beat_text">${esc(p.md)}</pre>
            </div>
        </details>
        ${w.total ? `<div class="cts-row">
            ${btn('winPrev', `← 이전 ${w.size} Beat`, { disabled: w.index <= 0 || !!busyText, title: '이 파일 안에서 앞 구간으로. 요약 호출 없음' })}
            ${btn('winNext', `다음 ${w.size} Beat →`, { disabled: w.index >= w.count - 1 || !!busyText, title: w.index >= w.count - 1 ? '마지막 Beat 구간이에요' : nextTitle })}
        </div>` : ''}`;
}

function renderMemory(cm) {
    if (!hasChat() || !cm) return '';
    const nodes = cm.timeline || [];
    const saga = cm.saga?.text?.trim()
        ? `<details class="cts-node cts-saga"><summary><span class="cts-chip">원작 진행 전체</span> <span class="cts-hint">~#${esc(cm.saga.coversTo)}</span></summary><pre class="cts-text">${esc(cm.saga.text)}</pre></details>`
        : '';
    const items = nodes.map(n => `<details class="cts-node" data-node="${esc(n.id)}">
        <summary><span class="cts-chip">${n.tier === 'chapter' ? '원작 챕터' : '원작 에피소드'}</span> <b>${esc(n.title)}</b> <span class="cts-hint">${esc(n.fileName || '')} · ${esc(rangeLabel(n.from, n.to))}${n.when ? ` · ${esc(n.when)}` : ''}${n.truncated ? ` · 원문 ${esc(n.truncated)}개 생략됨` : ''}</span></summary>
        <pre class="cts-text">${esc(n.text)}</pre>
        <div class="cts-row">${btn('nodeEdit', '고치기', { id: n.id })}${n.tier === 'episode' ? btn('nodeRedo', '다시 요약', { id: n.id, title: '이 파일의 원작 대본과 같은 메시지 구간으로 다시 써요 (API 1회)' }) : ''}${btn('nodeDelete', '지우기', { id: n.id })}</div>
    </details>`).join('');
    return saga + items || '<div class="cts-hint">아직 원작 진행 기록이 없어요. [다음 파일]로 넘길 때 생겨요.</div>';
}

/** The result of the last connection test, as text; '' when there is none for the profile now selected. */
function modelTestText(s) {
    const r = app.getModelTest();
    if (!r || r.profileId !== (s.profileId || '')) return '';
    return r.ok ? `성공${r.profile ? ` (${r.profile})` : ''} · ${new Date(r.at).toLocaleTimeString()}` : `실패 — ${r.reason}`;
}

/** [연결 테스트], right under the profile select. Disabled while a test is running. */
function renderModelTest(s) {
    const running = app.isTesting();
    const last = modelTestText(s);
    return `<div class="cts-row">
            ${btn('testModel', running ? '테스트 중...' : '연결 테스트', { disabled: running, title: '지금 선택된 프로필로 아주 짧은 요청을 한 번 보내, 요약 호출이 실제로 되는지 확인해요. 원작·채팅 내용은 보내지 않고 아무것도 저장하지 않아요' })}
            <span class="cts-hint" id="cts_model_test">${last ? `마지막 테스트: ${esc(last)}` : ''}</span>
        </div>`;
}

function renderAdvanced(s) {
    return `
        <div class="cts-sub">Beat 구간</div>
        ${numberRow('beatWindowSize', '한 번에 넣을 Beat 개수', 1, 500, '체크한 파일의 Beat를 등장 순서대로 이만큼씩 잘라 현재 구간만 넣어요. 어느 구간인지는 채팅마다 따로 기억해요')}
        <label class="cts-toggle"><input type="checkbox" data-setting="pastEnabled"${s.pastEnabled !== false ? ' checked' : ''}> 지난 원작 사건 넣기<span class="cts-hint">켜면 [다음 N Beat]로 넘길 때 떠나는 구간의 원작 사건을 정리해(API 1회) [PAST CANON EVENTS]로 계속 넣어요. 끄면 그 블록을 넣지 않고, 구간도 정리 호출 없이 바로 넘어가요. 이미 만든 기록은 지우지 않아서 다시 켜면 그대로 돌아와요. 모든 채팅에 똑같이 적용돼요.</span></label>
        <label class="cts-toggle"><input type="checkbox" data-setting="inputBar"${s.inputBar !== false ? ' checked' : ''}> 입력창에 빠른 이동 줄 표시<span class="cts-hint">메시지 입력창 바로 위에 [📜] [←] 21~40 / 71 [→] 한 줄을 띄워요. 📜는 지금 AI에게 들어가는 원작 대본 창을 열고, 화살표는 이전·다음 Beat 구간으로 옮겨요(위의 [이전 N Beat]·[다음 N Beat]와 같은 동작). 가운데 숫자는 지금 넣는 Beat 위치 / 이 파일의 전체 Beat 수예요. 원작 진행을 켠 채팅에서만 보여요.</span></label>
        <div class="cts-sub">넣는 위치</div>
        ${selectRow('mdPosition', '원작 대본 위치', POS, '원작 대본은 기준 자료라 최근 대화에서 먼 깊이에 둬도 돼요')}
        ${numberRow('mdDepth', '원작 대본 깊이', 0, 10000, '위치가 채팅 안일 때만')}
        ${selectRow('memPosition', '원작 진행 기록 위치', POS)}
        ${numberRow('memDepth', '원작 진행 기록 깊이', 0, 10000, '위치가 채팅 안일 때만')}
        <div class="cts-sub">압축</div>
        ${numberRow('maxEpisodes', '원작 에피소드 최대 개수', 2, 1000, '넘으면 오래된 것부터 챕터로 합쳐요')}
        ${numberRow('chapterSize', '원작 챕터당 에피소드', 2, 50)}
        ${numberRow('maxChapters', '원작 챕터 최대 개수', 1, 1000, '넘으면 전체 진행 기록으로 합쳐요')}
        ${numberRow('sagaWords', '원작 진행 전체 최대 단어', 100, 20000)}
        ${numberRow('transcriptTokens', '구간 정리에 보낼 대화 상한 (토큰)', 1000, 2000000, '넘으면 오래된 메시지부터 빼요')}
        <div class="cts-sub">요약 모델</div>
        ${selectRow('profileId', '요약 모델 프로필', profileOptions(s.profileId), 'Connection Manager에 저장한 프로필. 비우면 지금 채팅에 쓰는 API를 써요')}
        ${renderModelTest(s)}
        ${numberRow('maxTokens', '응답 최대 토큰', 256, 131072)}
        ${numberRow('retries', '재시도 횟수', 0, 5)}
        ${selectRow('language', '기록 언어', Object.fromEntries(Object.entries(LANGUAGES).map(([k, v]) => [k, v.label])))}
        <div class="cts-sub">알림</div>
        <label class="cts-toggle"><input type="checkbox" data-setting="hintEnabled"${s.hintEnabled ? ' checked' : ''}> 전환 시점 알림<span class="cts-hint">① 작중 날짜(&lt;date&gt; 태그나 상태창)가 현재 Beat 구간의 마지막 Beat 날짜("date: 1990/06/18", 기간이면 끝 날짜)에 이르렀거나 이미 지났으면 구간마다 한 번, ② 파일 끝에 적어 둔 "NEXT_FILE_HINT: 1996-05-12"(또는 "1996-05-10 ~ 1996-05-15") 시점에 이르면 파일마다 한 번 알려줘요. 알림일 뿐, 구간도 파일도 자동으로 넘기지 않아요.</span></label>`;
}

/**
 * Every instruction with its saved versions: a select to switch between them (the first option is
 * the built-in default), buttons to save a new one, rename and delete, and the text of the one in
 * use. Titles are shown here only; the model gets the text.
 */
function renderPrompts(s) {
    const intro = '<div class="cts-hint">지시문마다 여러 개를 제목을 붙여 저장해 두고 골라 쓸 수 있어요. 제목은 고르기 위한 이름일 뿐이라 AI에게는 보이지 않고, 고른 지시문의 내용만 들어가요. 모든 채팅에 똑같이 적용돼요.</div>';
    return intro + Object.entries(PROMPT_DEFS).map(([key, def]) => {
        const { items } = savedPrompts(s, key);
        const active = activePrompt(s, key);
        const text = active ? active.text : def.text;
        return `
        <div class="cts-sub">${esc(def.label)}</div>
        <div class="cts-hint">${esc(def.hint)}</div>
        ${s.pastEnabled === false && (key === 'pastHeader' || key === 'pastEvents') ? '<div class="cts-hint">지난 원작 사건을 꺼 두어서 지금은 쓰이지 않아요.</div>' : ''}
        <div class="cts-row">
            <select class="text_pole cts-prompt-select" data-prompt-select="${esc(key)}" title="쓸 지시문 고르기 (제목은 AI에게 보이지 않아요)">
                <option value=""${active ? '' : ' selected'}>기본값 (내장)</option>
                ${items.map(it => `<option value="${esc(it.id)}"${active?.id === it.id ? ' selected' : ''}>${esc(it.title || '(제목 없음)')}</option>`).join('')}
            </select>
            ${btn('promptNew', '+ 새 지시문', { id: key, title: '지금 보이는 내용을 복사해 새 지시문으로 저장하고, 그것을 써요' })}
            ${btn('promptRename', '제목 바꾸기', { id: key, disabled: !active, title: active ? '고른 지시문의 제목만 바꿔요' : '내장 기본값에는 제목이 없어요' })}
            ${btn('promptDelete', '삭제', { id: key, disabled: !active, title: active ? '고른 지시문을 지워요' : '내장 기본값은 지울 수 없어요' })}
        </div>
        <textarea class="text_pole cts-textarea" data-prompt="${esc(key)}" rows="${Math.min(14, Math.max(3, Math.ceil(text.length / 70)))}" spellcheck="false"${active ? '' : ' readonly'}>${esc(text)}</textarea>
        <div class="cts-hint">${active ? '고친 내용은 바로 저장돼요. 내용을 모두 비우면 내장 기본값이 대신 쓰여요.' : '내장 기본값이라 여기서는 고칠 수 없어요. 고치려면 [+ 새 지시문]으로 복사해서 쓰세요.'}</div>`;
    }).join('');
}

function renderDebug(s, p) {
    const w = p.win;
    const block = (title, where, text) => `<details class="cts-fold-inner"><summary>${esc(title)} <span class="cts-hint">${esc(where)} · ${text ? `약 ${estTokens(text).toLocaleString()}토큰` : '비어 있음'}</span></summary>${text ? `<pre class="cts-text">${esc(text)}</pre>` : '<div class="cts-hint">보내지 않아요.</div>'}</details>`;
    const head = p.file && w
        ? `<div class="cts-status"><div><b>현재 파일:</b> ${esc(p.file.name)}</div><div><b>현재 Beat Window:</b> ${esc(w.label)}${w.total ? ` <span class="cts-hint">(${w.index + 1} / ${w.count}, 전체 Beat ${w.total})</span>` : ''}</div>${pastLine(s, p)}</div>`
        : '';
    const prof = summaryProfile(s);
    const test = modelTestText(s);
    const model = `<div class="cts-status"><div><b>요약 모델 프로필:</b> ${prof.id ? (prof.found ? esc(prof.name) : '<span class="cts-hint">목록에 없는 프로필</span>') : '<span class="cts-hint">없음 (채팅의 현재 연결 사용)</span>'}</div><div><b>연결 테스트:</b> ${test ? esc(test) : '<span class="cts-hint">이 프로필로는 아직 안 했어요</span>'}</div></div>`;
    return head + block(`원작 대본 (현재 Beat 구간${w?.total ? `: ${w.label}` : ''})`, whereLabel(s.mdPosition, s.mdDepth), p.md) + block('원작 진행 기록', whereLabel(s.memPosition, s.memDepth), p.mem) + model
        + `<div class="cts-hint">키: ${esc(app.PROMPT_KEY_MD)}, ${esc(app.PROMPT_KEY_MEM)} · 저장: extensionSettings.${esc(app.MODULE)}, chatMetadata.${esc(app.META_KEY)}</div>`;
}

export function renderPanel() {
    // The quick bar by the message box (and its window) is redrawn with the panel, from the same state.
    renderBar(busyText);
    if (!root) return;
    const s = app.getSettings();
    const cm = app.getMemory(false);
    const fold = (key, title, body) => `<details class="cts-fold" data-fold="${key}"${s.ui[key] ? ' open' : ''}><summary>${title}</summary><div class="cts-fold-body">${body}</div></details>`;
    const covered = coveredFileIds(cm);
    const cur = cm ? currentFile(cm, s.files) : null;
    // One plan for the whole panel: the same object refreshInjection() builds its prompts from.
    const p = app.plannedInjection();
    root.innerHTML = `
        <label class="cts-toggle cts-master"><input type="checkbox" data-setting="enabled"${s.enabled ? ' checked' : ''}> 확장 사용</label>
        ${busyText ? `<div class="cts-busy">⏳ ${esc(busyText)}</div>` : ''}
        <div class="cts-section">${renderStatus(s, cm, p)}</div>
        <div class="cts-sub">시나리오 파일 <span class="cts-hint">체크 = 지금 넣는 파일. ▲▼는 순서만 바꿔요</span></div>
        <div class="cts-files">${renderFiles(s, cm)}</div>
        <div class="cts-row">
            <label class="menu_button cts-btn cts-add">파일 추가<input type="file" id="cts_file_input" accept=".md,.markdown,.txt,text/markdown,text/plain" multiple hidden></label>
            ${btn('prev', '◀ 이전 파일', { disabled: !!busyText })}
            ${btn('next', '다음 파일 ▶', { primary: true, disabled: !!busyText, title: cur && covered.has(cur.id) ? '이 파일의 기록은 이미 있어서 요약 없이 넘어가요' : '이 구간을 원작 에피소드로 기록하고 다음 파일로' })}
        </div>
        ${renderBeatWindow(s, cm, p)}
        ${hasChat() ? fold('open', '원작 진행 기억', renderMemory(cm) + `<div class="cts-row">${btn('compact', '원작 기록 정리', { disabled: !!busyText, title: '오래된 원작 에피소드를 챕터로, 챕터를 전체 기록으로 합쳐요' })}</div>`) : ''}
        ${fold('advancedOpen', '고급 설정', renderAdvanced(s))}
        ${fold('promptsOpen', '지시문', renderPrompts(s))}
        ${fold('debugOpen', '디버그 · AI에게 가는 내용', renderDebug(s, p))}`;
}

export function setBusy(on, text = '') {
    busyText = on ? (text || '작업 중...') : '';
    renderPanel();
}

async function onFiles(input) {
    const list = [...(input.files || [])];
    input.value = '';
    let added = 0;
    for (const f of list) {
        try {
            const text = await f.text();
            const { replaced } = app.addFile(f.name, text);
            added++;
            if (replaced) toast('info', `${f.name}의 내용을 새로 바꿨어요.`);
        } catch (err) {
            toast('error', `${f.name} 읽기 실패: ${err.message}`);
        }
    }
    if (added) toast('success', `원작 파일 ${added}개를 넣었어요.`);
    renderPanel();
}

async function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el) || el.disabled || el.tagName === 'INPUT') return;
    const act = el.dataset.act;
    const id = el.dataset.id;
    const s = app.getSettings();
    switch (act) {
        case 'fileUp': app.moveFile(id, -1); renderPanel(); return;
        case 'fileDown': app.moveFile(id, 1); renderPanel(); return;
        case 'fileDelete': {
            const f = s.files.find(x => x.id === id);
            if (!f) return;
            if (!await confirmBox('원작 파일 빼기', `${f.name}을(를) 목록에서 뺄까요? 이미 쓴 원작 진행 기록은 남아요.`)) return;
            app.removeFile(id);
            renderPanel();
            return;
        }
        case 'prev': return app.switchFile(-1);
        case 'next': return app.switchFile(1);
        case 'winPrev': return app.shiftWindow(-1);
        case 'winNext': return app.shiftWindow(1);
        case 'winSkip': return app.shiftWindow(1, { record: false });
        case 'srcEdit': return app.editSource('beats');
        case 'headEdit': return app.editSource('header');
        case 'pastRedo': return app.redoPast();
        case 'pastEdit': {
            const past = app.plannedInjection().past;
            if (!past) return;
            const text = await inputBox('지난 원작 사건 고치기', `${past.lastId}까지의 원작 사건 기록 (한 줄에 사건 하나). 이 뒤 구간의 기록이 이미 있으면 지워지고, 넘길 때 다시 만들어요.`, past.text, 14);
            if (text === null) return;
            if (!await app.editPast(text)) toast('info', '내용이 비어 있어 바꾸지 않았어요.');
            return;
        }
        case 'testModel': return app.testConnection();
        case 'compact': return app.runCompact();
        case 'nodeDelete': return app.deleteNode(id);
        case 'nodeRedo': return app.resummarize(id);
        case 'nodeEdit': {
            const node = app.getMemory(false)?.timeline.find(n => n.id === id);
            if (!node) return;
            const text = await inputBox('원작 기록 고치기', node.title, node.text, 12);
            if (text === null) return;
            await app.editNode(id, text);
            return;
        }
        case 'promptNew': {
            const def = PROMPT_DEFS[id];
            if (!def) return;
            const current = activePrompt(s, id);
            const title = await inputBox('새 지시문 저장', `"${def.label}"에 저장할 제목을 적어 주세요. 제목은 고르기 위한 이름이고 AI에게는 보이지 않아요. 지금 보이는 내용이 복사돼요.`, `${def.label} ${savedPrompts(s, id).items.length + 1}`, 1);
            if (title === null) return;
            app.addPrompt(id, title, current ? current.text : def.text);
            return;
        }
        case 'promptRename': {
            const item = activePrompt(s, id);
            if (!item) return;
            const title = await inputBox('지시문 제목 바꾸기', '새 제목 (AI에게는 보이지 않아요)', item.title, 1);
            if (title === null) return;
            if (!app.renamePrompt(id, item.id, title)) toast('info', '제목이 비어 있어 바꾸지 않았어요.');
            return;
        }
        case 'promptDelete': {
            const item = activePrompt(s, id);
            if (!item) return;
            if (!await confirmBox('지시문 지우기', `"${item.title}"을(를) 지울까요? 지운 뒤에는 내장 기본값이 쓰여요.`)) return;
            app.removePrompt(id, item.id);
            return;
        }
    }
}

function onChange(e) {
    const t = e.target;
    const s = app.getSettings();
    if (t.id === 'cts_file_input') { onFiles(t); return; }
    if (t.dataset.act === 'toggleOn') { app.setOn(t.checked); return; }
    if (t.dataset.promptSelect) { app.selectPrompt(t.dataset.promptSelect, t.value); return; }
    const key = t.dataset.setting;
    if (!key) return;
    if (t.type === 'checkbox') s[key] = t.checked;
    else if (t.type === 'number') {
        const v = parseInt(t.value, 10);
        const min = Number(t.min);
        const max = Number(t.max);
        s[key] = Number.isNaN(v) ? app.defaultSettings[key] : Math.min(max, Math.max(min, v));
        t.value = s[key];
    } else s[key] = t.value;
    app.saveSettings();
    app.refreshInjection();
    // Settings that change what the panel shows as injected are re-rendered right away.
    if (['enabled', 'hintEnabled', 'beatWindowSize', 'pastEnabled', 'inputBar', 'mdPosition', 'mdDepth', 'memPosition', 'memDepth', 'profileId'].includes(key)) renderPanel();
}

// The text of the saved instruction in use saves as you type and does not re-render (that would
// steal focus). The built-in default is read-only, so nothing arrives here for it.
function onInput(e) {
    const t = e.target;
    const key = t.dataset.prompt;
    if (!key) return;
    app.setPromptText(key, t.value);
}

function onToggle(e) {
    const d = e.target;
    if (!(d instanceof HTMLDetailsElement) || !d.dataset.fold) return;
    const s = app.getSettings();
    if (s.ui[d.dataset.fold] === d.open) return;
    s.ui[d.dataset.fold] = d.open;
    app.saveSettings();
}

export function mountPanel() {
    if (root || typeof document === 'undefined') return;
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) return;
    const wrap = document.createElement('div');
    wrap.className = 'cts-settings';
    wrap.innerHTML = `<div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>📜 Canon Timeline Simulator</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content"><div id="cts_root" class="cts-root"></div></div>
    </div>`;
    host.appendChild(wrap);
    root = wrap.querySelector('#cts_root');
    root.addEventListener('click', (e) => { onClick(e).catch(err => { console.error('[Canon Timeline Simulator]', err); toast('error', err.message); }); });
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('toggle', onToggle, true);
}
