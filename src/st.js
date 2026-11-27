// The one place that touches SillyTavern. Everything else gets the context from here, so the
// tests can swap it for a fake.

export function ctx() {
    return globalThis.SillyTavern.getContext();
}

// Mirrors of ST's extension_prompt_types / extension_prompt_roles (public/script.js).
export const POSITIONS = { in_prompt: 0, in_chat: 1, before_prompt: 2 };
export const ROLES = { system: 0, user: 1, assistant: 2 };
export const POSITION_LABELS = { in_prompt: '캐릭터 설정 뒤', before_prompt: '프롬프트 맨 앞', in_chat: '채팅 안' };

export function hasChat() {
    return !!ctx().getCurrentChatId?.();
}

export function chatLength() {
    return ctx().chat?.length ?? 0;
}

export function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[ch]));
}

/** Rough token count (same rule the elephant uses): CJK counts more than Latin. */
export function estTokens(str) {
    const s = String(str ?? '');
    if (!s) return 0;
    const cjk = (s.match(/[぀-ヿ㐀-鿿가-힯]/g) || []).length;
    return Math.ceil((s.length - cjk) / 3.6 + cjk / 1.4);
}

/** SillyTavern's own toast. `opts.title` replaces the default title; the rest goes to toastr. */
export function toast(kind, msg, opts) {
    const { title = 'Canon Timeline Simulator', ...rest } = opts || {};
    if (typeof globalThis.toastr !== 'undefined') globalThis.toastr[kind](msg, title, Object.keys(rest).length ? rest : undefined);
    else console.log(`[${title}] ${kind}: ${msg}`);
}

export async function confirmBox(title, msg) {
    const c = ctx();
    if (c.Popup?.show?.confirm) return !!await c.Popup.show.confirm(title, msg);
    if (c.callGenericPopup && c.POPUP_TYPE) {
        const res = await c.callGenericPopup(`<b>${esc(title)}</b><br><br>${esc(msg).replace(/\n/g, '<br>')}`, c.POPUP_TYPE.CONFIRM);
        return res === c.POPUP_RESULT?.AFFIRMATIVE || res === true || res === 1;
    }
    return globalThis.confirm ? globalThis.confirm(msg) : true;
}

/** A text box to fill in. `opts` are further options of SillyTavern's popup (wide, large, okButton, cancelButton). */
export async function inputBox(title, msg, value = '', rows = 10, opts = {}) {
    const c = ctx();
    if (c.Popup?.show?.input) {
        // SillyTavern puts both into the popup as HTML; they are plain text here.
        const r = await c.Popup.show.input(esc(title), esc(msg), value, { rows, ...opts });
        return typeof r === 'string' ? r : null;
    }
    if (c.callGenericPopup && c.POPUP_TYPE) {
        const r = await c.callGenericPopup(esc(msg), c.POPUP_TYPE.INPUT, value, { rows, ...opts });
        return typeof r === 'string' ? r : null;
    }
    return globalThis.prompt ? globalThis.prompt(msg, value) : null;
}

/** ST's saveMetadata writes the whole chat file; saveChat is the older name. */
export async function persistChat() {
    const c = ctx();
    if (c.saveMetadata) return c.saveMetadata();
    if (c.saveChat) return c.saveChat();
    c.saveMetadataDebounced?.();
    return undefined;
}

export function errorDetail(err) {
    const parts = [];
    let e = err;
    for (let depth = 0; e && depth < 6; depth++) {
        const msg = String(e?.message ?? e).trim();
        if (msg && !parts.includes(msg)) parts.push(msg);
        e = e?.cause;
    }
    return parts.join(' → ') || '알 수 없는 오류';
}
