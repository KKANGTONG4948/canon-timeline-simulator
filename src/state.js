// Per-chat canon memory: the file pointer and the canon progress record.
// Pure: every function takes the memory object and (where needed) the file list.
//
//   on            this chat uses canon at all (nothing is injected while off)
//   fileIndex     the checked file = the one injected now; never "done"
//   fileId        the same file by id, so reordering or deleting files cannot move the check
//   beatWindowIndex  which window of Beats inside the checked file is injected (0 = the first);
//                 back to 0 whenever the checked file changes
//   pastEvents    { [fileId]: [{ count, lastId, text, at }] } — the objective events of the
//                 original in the Beats already passed inside a file (see past.js)
//   lastBeatDateNotice  { fileId, windowIndex, date } of the "last date of this window reached"
//                 notice already shown, so it is shown once per window
//   startMessage  the chat index where the current file was chosen; the next episode covers from here
//   timeline      Canon Episodes and Canon Chapters, oldest first
//   saga          the oldest canon progress, folded down to one text
//   archive       nodes that were folded into a chapter or the saga (kept, never injected)
//   noticeShownFor the file whose NEXT_FILE_HINT notice was already shown

export function emptyMemory() {
    return { version: 1, on: false, fileIndex: 0, fileId: null, beatWindowIndex: 0, pastEvents: {}, startMessage: 0, timeline: [], saga: { text: '', coversTo: -1, fileIds: [] }, archive: [], noticeShownFor: null, lastBeatDateNotice: null };
}

export function normalizeMemory(cm) {
    if (!cm || typeof cm !== 'object') return null;
    const base = emptyMemory();
    for (const key of Object.keys(base)) if (!Object.hasOwn(cm, key)) cm[key] = base[key];
    if (!Array.isArray(cm.timeline)) cm.timeline = [];
    if (!Array.isArray(cm.archive)) cm.archive = [];
    if (!cm.saga || typeof cm.saga !== 'object') cm.saga = base.saga;
    if (!Array.isArray(cm.saga.fileIds)) cm.saga.fileIds = [];
    if (!Number.isInteger(cm.beatWindowIndex) || cm.beatWindowIndex < 0) cm.beatWindowIndex = 0;
    if (!cm.pastEvents || typeof cm.pastEvents !== 'object' || Array.isArray(cm.pastEvents)) cm.pastEvents = {};
    return cm;
}

/**
 * Files that already have a Canon Episode: still in the timeline, folded into a chapter
 * (sourceFileIds) or into the saga (saga.fileIds). "다음 파일" on such a file only moves the
 * pointer. This is all the bookkeeping there is: a record exists, or it does not.
 */
export function coveredFileIds(cm) {
    const ids = new Set();
    if (!cm) return ids;
    for (const n of cm.timeline) {
        if (n.sourceFileId) ids.add(n.sourceFileId);
        for (const id of n.sourceFileIds || []) ids.add(id);
    }
    for (const id of cm.saga?.fileIds || []) ids.add(id);
    return ids;
}

/** The checked file's index, re-found by id when the list was reordered; -1 without files. */
export function currentIndex(cm, files) {
    if (!files?.length || !cm) return -1;
    if (cm.fileId) {
        const byId = files.findIndex(f => f.id === cm.fileId);
        if (byId >= 0) { cm.fileIndex = byId; return byId; }
    }
    const i = Math.min(Math.max(0, Number(cm.fileIndex) || 0), files.length - 1);
    // The checked file is gone (deleted) or was never set: another file takes its place, from its first window.
    if (cm.fileId !== files[i].id) cm.beatWindowIndex = 0;
    cm.fileIndex = i;
    cm.fileId = files[i].id;
    return i;
}

export function currentFile(cm, files) {
    const i = currentIndex(cm, files);
    return i >= 0 ? files[i] : null;
}

/** Checks another file. A different file always starts at its first Beat window. */
export function setIndex(cm, files, i) {
    const idx = Math.min(Math.max(0, i), files.length - 1);
    const id = files[idx]?.id || null;
    if (id !== cm.fileId) cm.beatWindowIndex = 0;
    cm.fileIndex = idx;
    cm.fileId = id;
}
