// The one model call this extension makes, through SillyTavern's own APIs: a Connection
// Manager profile when one is chosen, otherwise the connection the chat is using. Plus the
// small parsers for its answers. No retries beyond what the caller asks, no fallback profile.

import { ctx, errorDetail } from './st.js';

const REFUSAL_RE = /^(?:\s*[*_"']*)?(?:i'?m sorry|i am sorry|sorry,|i can(?:'|no)t|i cannot|i won'?t|i'm unable|i am unable|unable to (?:assist|help|comply)|as an ai|i must decline|this (?:request|content) (?:violates|is not)|죄송(?:합니다|하지만)|요청하신 내용은|도와드릴 수 없|申し訳|できません|抱歉|我无法|我不能)/i;

export class RefusedError extends Error {
    constructor(message) {
        super(message);
        this.refused = true;
    }
}

/**
 * The profile the summary calls use, read from the settings at the moment of the call.
 * id '' = no profile: the connection the chat itself is using. `name` and `found` come from the
 * Connection Manager's own list; nothing else of a profile is read here.
 */
export function summaryProfile(settings) {
    const id = settings?.profileId || '';
    const list = ctx().extensionSettings?.connectionManager?.profiles;
    const hit = id && Array.isArray(list) ? list.find(p => p?.id === id) : null;
    return { id, name: hit?.name ? String(hit.name) : '', found: !!hit };
}

/**
 * The options of every summary call (Past Canon Events, Canon Episode, Chapter, Saga) and of the
 * connection test. One place decides the profile, so what is tested is what is used.
 */
export function summaryCall(settings, extra = {}) {
    return { profileId: summaryProfile(settings).id, maxTokens: settings?.maxTokens, retries: settings?.retries, ...extra };
}

/** An error as one short line that is safe to show and to log: keys, tokens and URL queries are masked. */
export function safeError(err) {
    return errorDetail(err)
        .replace(/\bBearer\s+[^\s"',;)]+/gi, 'Bearer ***')
        .replace(/((?:api[-_ ]?key|x-api-key|authorization|access[-_ ]?token|token|secret|password)["']?\s*[:=]\s*["']?)(?!Bearer \*\*\*)[^\s"',;&})]+/gi, '$1***')
        .replace(/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{6,}/g, '***')
        .replace(/\bAIza[0-9A-Za-z_-]{10,}/g, '***')
        .replace(/\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{32,}/g, '***')
        .replace(/(https?:\/\/[^\s"'?#]+)\?[^\s"')]*/gi, '$1?***')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 200);
}

/** Removes reasoning blocks and code fences that different providers add. */
export function cleanOutput(text) {
    let t = String(text ?? '');
    t = t.replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '');
    t = t.replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '');
    const close = t.match(/<\/think(?:ing)?\s*>(?![\s\S]*<\/think(?:ing)?\s*>)/i);
    if (close) t = t.slice(close.index + close[0].length);
    t = t.replace(/^```[a-zA-Z]*\s*$/gm, '');
    return t.trim();
}

export function extractTag(text, tag) {
    const closed = String(text ?? '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'));
    if (closed) return closed[1].trim();
    const open = String(text ?? '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*)$`, 'i'));
    if (open) return open[1].replace(/<\/?[a-z_]+>\s*$/i, '').trim();
    return null;
}

export function looksRefused(text, expectTag) {
    const t = String(text || '').trim();
    if (!t) return false;
    if (expectTag && new RegExp(`<${expectTag}[\\s>]`, 'i').test(t)) return false;
    return t.length < 1200 && REFUSAL_RE.test(t);
}

/** "title: … / keywords: … / summary: …" block → { title, keywords, text }, or null without a summary. */
export function parseNodeBlock(block) {
    if (!block) return null;
    const get = (key) => {
        const m = block.match(new RegExp(`^\\s*\\**${key}\\**\\s*[:：]\\s*(.*)$`, 'im'));
        return m ? m[1].trim() : '';
    };
    const summaryMatch = block.match(/^\s*\**summary\**\s*[:：]\s*([\s\S]*)$/im);
    let summary = summaryMatch ? summaryMatch[1].trim() : '';
    if (!summary) {
        summary = block.split('\n').filter(line => !/^\s*\**(title|keywords)\**\s*[:：]/i.test(line)).join('\n').trim();
    }
    if (!summary) return null;
    const keywords = get('keywords').split(/[,，、;]/).map(k => k.trim()).filter(k => k.length >= 2).slice(0, 16);
    return { title: get('title').slice(0, 120) || summary.slice(0, 40), keywords, text: summary };
}

/**
 * Sends system + user to the model and returns the cleaned text. Throws on an empty reply,
 * a refusal, or a transport error (the caller keeps its records as they were).
 * @param {{ profileId?: string, maxTokens?: number, expectTag?: string, retries?: number }} o
 */
export async function callModel(systemText, userText, { profileId = '', maxTokens = 4096, expectTag = '', retries = 1 } = {}) {
    const c = ctx();
    let lastError = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            let raw;
            if (profileId) {
                if (!c.ConnectionManagerRequestService) throw new Error('Connection Manager를 사용할 수 없습니다.');
                const messages = [{ role: 'system', content: systemText }, { role: 'user', content: userText }];
                const result = await c.ConnectionManagerRequestService.sendRequest(profileId, messages, maxTokens, { stream: false, extractData: true, includePreset: true }, {});
                raw = typeof result === 'string' ? result : (result?.content ?? '');
            } else {
                if (!c.generateRaw) throw new Error('generateRaw를 사용할 수 없습니다.');
                raw = await c.generateRaw({ systemPrompt: systemText, prompt: userText, responseLength: maxTokens, prefill: '' });
            }
            const cleaned = cleanOutput(raw);
            if (!cleaned) throw new Error('빈 응답');
            if (looksRefused(cleaned, expectTag)) throw new RefusedError(`모델이 거절했어요: "${cleaned.slice(0, 80)}"`);
            return cleaned;
        } catch (err) {
            lastError = err;
            if (err?.refused) break;
            if (attempt < retries) await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
    throw lastError ?? new Error('request failed');
}

export { errorDetail };
