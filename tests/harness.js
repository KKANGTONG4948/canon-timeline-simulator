// A fake SillyTavern context for the tests. Works in Node (node tests/run.js) and in a browser
// page that imports the same test modules. Import this before ../index.js so the default
// context exists when the extension's init runs.

export const assert = {
    ok(c, m) { if (!c) throw new Error(m || 'assert.ok'); },
    strictEqual(a, b, m) { if (a !== b) throw new Error(`${m || 'strictEqual'}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); },
    same(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m || 'same'}: got ${x} want ${y}`); },
    includes(s, sub, m) { if (!String(s).includes(sub)) throw new Error(`${m || 'includes'}: missing ${JSON.stringify(sub)}`); },
    excludes(s, sub, m) { if (String(s).includes(sub)) throw new Error(`${m || 'excludes'}: found ${JSON.stringify(sub)}`); },
};

export function makeChat(n, text = (i) => `Line ${i}`) {
    const chat = [];
    for (let i = 0; i < n; i++) chat.push({ is_user: i % 2 === 0, name: i % 2 ? 'Rin' : 'Me', mes: text(i), is_system: false, extra: {} });
    return chat;
}

let current = null;
const toasts = [];   // "kind:message"
const titles = [];   // the toast title given with each message, same index

export function load({ chat = makeChat(30), reply = '', profiles = [], chatId = 'c', extensionSettings = {} } = {}) {
    const state = { reply, fail: null, calls: [], chatId, confirm: true, input: undefined };
    const prompts = {};
    const confirms = [];
    const metas = {};
    const context = {
        extensionSettings: { connectionManager: { profiles }, ...extensionSettings },
        extensionPrompts: {},
        get chatMetadata() { return (metas[state.chatId] ||= {}); },
        get chat() { return chat; },
        name1: 'Me', name2: 'Rin',
        getCurrentChatId: () => state.chatId,
        setExtensionPrompt(key, text, position, depth, scan, role) { prompts[key] = { text, position, depth, role }; },
        saveSettingsDebounced() {}, saveMetadataDebounced() {}, async saveMetadata() {}, async saveChat() {},
        eventSource: { on() {}, async emit() {} },
        eventTypes: { APP_READY: 'app_ready', CHAT_CHANGED: 'chat_id_changed', MESSAGE_RECEIVED: 'message_received', MESSAGE_SENT: 'message_sent', MESSAGE_DELETED: 'message_deleted', GENERATION_AFTER_COMMANDS: 'generation_after_commands' },
        async generateRaw(args) {
            state.calls.push({ kind: 'raw', args });
            if (state.fail) throw state.fail;
            return typeof state.reply === 'function' ? state.reply(args) : state.reply;
        },
        ConnectionManagerRequestService: {
            async sendRequest(profileId, messages, max, custom, override) {
                state.calls.push({ kind: 'profile', profileId, messages, max, custom });
                if (state.fail) throw state.fail;
                return { content: typeof state.reply === 'function' ? state.reply({ messages }) : state.reply };
            },
        },
        Popup: { show: { confirm: async (t, m) => { confirms.push(m); return state.confirm; }, input: async (t, m, d) => (state.input === undefined ? d : state.input) } },
    };
    current = context;
    toasts.length = 0;
    titles.length = 0;
    return { context, state, prompts, toasts, titles, confirms, metas, sent: (i = -1) => { const c = state.calls.at(i); return c.args ? `${c.args.systemPrompt}\n${c.args.prompt}` : c.messages.map(m => m.content).join('\n'); } };
}

if (!globalThis.SillyTavern) {
    load();
    globalThis.SillyTavern = { getContext: () => current };
}
const note = (kind) => (m, title) => { toasts.push(`${kind}:${m}`); titles.push(title); };
globalThis.toastr = { success: note('ok'), info: note('info'), warning: note('warn'), error: note('err'), clear() {} };
