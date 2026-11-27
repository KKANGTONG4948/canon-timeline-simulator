// What the model is told: off-screen baseline kept, established history wins, nothing invented.
// (The judgement itself is the model's; these check the instructions it receives.)
import { load, assert, makeChat } from './harness.js';
import * as app from '../index.js';
import { getPrompt, PROMPT_DEFS } from '../src/prompts.js';
import { stepChapter, stepSaga } from '../src/memory.js';

const chat = makeChat(6, (i) => (i === 3 ? '마코는 그날 카페에서 친구와 수다를 떨었다.' : `Line ${i}`));
const h = load({ chat });
const s = app.getSettings();
s.files.length = 0; s.retries = 0;
app.addFile('c1.md', '# 구간\n코토코의 새집이 붕괴한다.\n코토코가 이리에 집으로 들어간다.');
app.addFile('c2.md', '# 다음');
await app.setOn(true);
h.state.reply = '<canon_episode>\ntitle: 붕괴 구간\nkeywords: 코토코\nsummary:\n- 코토코네 새집은 원작대로 붕괴했고 부녀는 거처를 잃었다. 확립된 역사상 이를 막거나 바꾼 사건은 없다.\n</canon_episode>';
await app.switchFile(1);
const sent = h.sent();
const sys = h.state.calls[0].args.systemPrompt;
const user = h.state.calls[0].args.prompt;

// A. off-screen baseline is kept AND written down
assert.includes(sys, 'baseline world line', 'A: script framed as the baseline world line');
assert.includes(sys, 'Absence from the visible chat is not evidence', 'A: silence is not evidence of non-occurrence');
assert.includes(sys, 'it is not a reason to leave the event out', 'A: absence is not a reason to omit');
assert.includes(sys, 'time and opportunity have now passed', 'A: the stretch has passed in the world');
assert.includes(sys, 'these notes are the only place it survives once this script is retired', 'A: why the baseline result must be written');
assert.includes(sys, 'record that the house collapsed as in the original and that the family lost their home', 'A: example writes the baseline result');
assert.includes(sys, 'Do not record it as "did not happen", and do not drop it', 'A: neither "did not happen" nor omitted');
assert.ok(/2\. Important original events of this stretch that the chat does not show but that established history did not contradict[^\n]*record their important result as having proceeded per the original baseline/.test(sys), 'A: item 2 records uncontradicted off-screen events');
assert.includes(sys, 'preserve their important results as the default world progression', 'A: uncontradicted events keep the baseline');
assert.ok(!/did not happen here|counts as having happened unless|unless the transcript shows it|probably happened|say nothing/.test(sys + user), 'A: no "not shown → did not happen" or "say nothing" rule');
assert.includes(user, 'where they are silent it stands', 'A: script tag says silence → baseline');
assert.includes(user, 'where they are silent, the original progression stands', 'A: closing instruction too');
assert.strictEqual(app.getMemory(false).timeline[0].text, '- 코토코네 새집은 원작대로 붕괴했고 부녀는 거처를 잃었다. 확립된 역사상 이를 막거나 바꾼 사건은 없다.', 'A: the model\'s judgement is stored as given');

// B. established history wins over the script
assert.includes(sys, 'changed, prevented, replaced or redirected an original event, that established history overrides the original route', 'B: conflict → history wins');
assert.includes(sys, 'Never restore an original route that established history has made impossible', 'B: no forced restoration');
assert.includes(sys, 'Irie house', 'B: move-in example');
assert.includes(sys, 'another long-term home', 'B: replacement recorded');
assert.includes(sys, 'A higher source wins only where it CONFLICTS', 'B/C: priority means conflict, not silence');

// C. simple non-exposure vs explicit non-occurrence; no invented detail
assert.includes(sys, 'only with positive evidence', 'C: not-occurred needs positive evidence');
assert.includes(sys, '"The user\'s character was not there" or "the chat has no such scene" is never such evidence; such an event belongs under 2', 'C: absence goes to the baseline item');
assert.includes(sys, 'the sources clearly say it did not happen', 'C: explicit statement counts');
assert.includes(sys, 'Do not invent details beyond the script to fill gaps', 'C: no invented detail');
assert.includes(sys, 'do not infer extra events that are in neither the script nor the established history', 'C: no inferred events');

// standalone authority order: chat > earlier canon notes > script — no story memory anywhere
assert.ok(sys.indexOf('1. The transcript') < sys.indexOf('2. The earlier canon progress notes') && sys.indexOf('2. The earlier canon progress notes') < sys.indexOf('3. The original\'s script'), 'order: chat > canon memory > md');
assert.excludes(sys + user, 'story memory', 'no story memory in the standalone prompt');
assert.excludes(sys + user, 'story_memory');
assert.includes(user, '<canon_script file="c1.md">');
assert.includes(user, '코토코의 새집이 붕괴한다.');
assert.includes(user, '<transcript messages="#0-#5">');
assert.includes(user, '카페에서');
assert.includes(sent, 'Write in the same language the story transcript', 'language rule filled');

// chapter / saga keep dependency-bearing baseline results
const cm = app.getMemory(false);
cm.timeline.push({ id: 'd1', tier: 'episode', sourceFileId: 'x', fileName: 'x', from: 0, to: 1, title: 'D1', text: 'a', keywords: [] });
h.state.reply = '<canon_chapter>\ntitle: c\nkeywords: k\nsummary:\nx\n</canon_chapter>';
await stepChapter(s, cm, true);
const sysCh = h.state.calls.at(-1).args.systemPrompt;
assert.includes(sysCh, 'keep the original events that proceeded off-screen per the baseline whenever a later original event depends on them', 'chapter keeps dependency-bearing baseline events');
assert.includes(sysCh, 'do not turn an event the notes record as having happened, or leave open, into one that did not happen');
assert.includes(sysCh, 'Do not add events the notes do not contain');
cm.timeline.unshift({ id: 'd0', tier: 'chapter', sourceFileIds: ['y'], from: -3, to: -1, title: 'D0', text: 'b', keywords: [] });
h.state.reply = '<canon_saga>\ns\n</canon_saga>';
await stepSaga(s, cm, true);
const sysSg = h.state.calls.at(-1).args.systemPrompt;
assert.includes(sysSg, 'including those that proceeded off-screen per the baseline');
assert.includes(sysSg, 'any result that a later original event depends on');
assert.includes(sysSg, 'Do not add events the chapters do not contain');
assert.includes(sysSg, 'under 600 words', 'sagaWords filled');

// injected headers carry the same stance
app.refreshInjection();
assert.includes(h.prompts[app.PROMPT_KEY_MD].text, 'never restored to the original');
assert.includes(h.prompts[app.PROMPT_KEY_MEM].text, 'that event is assumed to have run its course as in the original');

// the Canon Timeline header: background world continuity, never a list of scenes to show
const mdh = PROMPT_DEFS.mdHeader.text;
const mdSent = h.prompts[app.PROMPT_KEY_MD].text;
for (const line of [
    // what the timeline is
    'is background world continuity',
    'It is not a storyline this RP is supposed to follow',
    'predefined events, set in advance by the user from the original work, that normally occur in the world as RP time passes',
    'on the same layer as the off-screen lives of all other NPCs',
    // Canon does not control the narrative camera
    'These events do not belong to the narrative camera',
    'not a list of scenes to show, not a queue to run in order, not something {{user}} is meant to witness, and not a destination for the current scene',
    'Do not move, redirect, delay, or restructure the current RP in order to display a Canon event',
    'Do not make {{user}} arrive in time to witness Canon merely because the event appears in the current window',
    'Use Canon to maintain the world behind the RP, not to control the RP camera',
    // temporal overlap does not imply narrative exposure
    'becomes visible only when the established current RP scene naturally intersects with it',
    'The reason is that intersection, never that it is the Beat\'s turn',
    'Otherwise the event may occur entirely off-camera',
    'Temporal overlap does not imply narrative exposure',
    'A Beat matching the current date, or {{user}} being in the same school, house, neighborhood, date, or general time period, does not by itself mean that {{user}} witnesses the event or that it must be depicted',
    // off-camera Canon does not need to be recapped or reenacted
    'there is no need to recap, recall, reconstruct, explain, or reenact it for {{user}}',
    'no flashback, no inner monologue that walks through it, no character suddenly reporting it',
    'Its consequences may simply exist in the world afterward',
    'only what comes up naturally in the current interaction is shown',
    '{{user}} does not automatically know events that occurred outside {{user}}\'s presence',
    'Preserve normal information boundaries',
    // authority, unchanged in meaning
    'takes priority whenever it actually changes, prevents, replaces, redirects, or contradicts the Canon baseline',
    'Absence from the visible chat alone does not cancel Canon',
    // future Canon is not a goal
    'Future Canon is background future history, not a goal for the present scene',
    'Do not foreshadow, prepare, expose, or steer toward a later Canon event merely because it is visible in the supplied timeline',
    // CURRENT CANON WINDOW is a loaded reference range, not scenes due to be depicted
    '"CURRENT CANON WINDOW" means the currently loaded timeline reference range around the present RP time, not events that are due to be depicted in the current response',
    '"PAST CANON EVENTS", when present, is the plain record of what the original says happened before that range',
    'Neither directs the camera',
]) {
    assert.includes(mdh, line, 'mdHeader');
    assert.includes(mdSent, line, 'the injected block carries it');
}
assert.ok(!/unfold naturally|when the story reaches|baseline script of the original work|upcoming events|how these events go in the original/.test(mdh), 'no wording that reads as "the scene should get to these events"');
assert.ok(!mdh.includes('[CURRENT CANON WINDOW]') && !mdh.includes('[PAST CANON EVENTS]') && !mdh.includes('[FILE HEADER]') && !mdh.includes('---'), 'the header names the sections without their bracket labels, so a label in the block is always the section itself');
assert.ok(mdSent.startsWith(`<canon_baseline file="c2.md">\n${getPrompt(s, 'mdHeader', { file: 'c2.md' })}\n\n`), 'the header opens the block, before any Canon text');
assert.ok(mdSent.includes('("c2.md")') && !mdSent.includes('{{file}}') && mdSent.includes('{{user}}'), '{{file}} is filled here; {{user}} is left for SillyTavern\'s macro substitution');

// overrides and language
const mine = app.addPrompt('episode', '내 버전', 'MY {{language}} X');   // a saved instruction in use (tests/saved.test.js)
s.language = 'ko';
assert.strictEqual(getPrompt(s, 'episode'), 'MY Write in Korean (한국어). Keep proper nouns (names, places, titles) in their original spelling. X');
app.removePrompt('episode', mine.id); s.language = 'chat';
assert.strictEqual(getPrompt(s, 'episode'), PROMPT_DEFS.episode.text.replace('{{language}}', 'Write in the same language the story transcript is mostly written in. Keep proper nouns (names, places, titles) in their original spelling.'));
assert.strictEqual(getPrompt(s, 'mdHeader', { file: 'a.md' }).includes('"a.md"'), true);
console.log('prompts ok');
