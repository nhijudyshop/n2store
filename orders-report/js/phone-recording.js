// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Recording — local MediaRecorder + IndexedDB
// Mixes local mic + remote audio via AudioContext → MediaRecorder → Blob → IndexedDB
// Retention: 30 ngày, auto-cleanup on load
// Phone-management page đọc cùng IndexedDB (same-origin)

const PhoneRecording = (() => {
    const DB_NAME = 'phoneRecordings';
    const STORE = 'recordings';
    const RETENTION_DAYS = 30;
    const PREFS_KEY = 'phoneMgmt_prefs';

    let db = null;
    let recorder = null;
    let chunks = [];
    let audioCtx = null;
    let destStream = null;
    let localStream = null;
    let currentMeta = null;
    let startedAt = 0;

    function _openDb() {
        return new Promise((resolve, reject) => {
            if (db) return resolve(db);
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = (e) => {
                const d = e.target.result;
                if (!d.objectStoreNames.contains(STORE)) {
                    const store = d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('username', 'username', { unique: false });
                    store.createIndex('phone', 'phone', { unique: false });
                }
            };
            req.onsuccess = () => { db = req.result; resolve(db); };
            req.onerror = () => reject(req.error);
        });
    }

    function isEnabled() {
        try {
            const p = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
            return !!p.recordLocal;
        } catch { return false; }
    }

    function _getRemoteTrack() {
        const audioEl = document.getElementById('pwRemoteAudio');
        if (!audioEl?.srcObject) return null;
        const tracks = audioEl.srcObject.getAudioTracks?.() || [];
        return tracks[0] || null;
    }

    async function startRecording(meta) {
        if (!isEnabled()) return false;
        await stopRecording(); // clean any prior

        const remoteTrack = _getRemoteTrack();
        if (!remoteTrack) {
            console.warn('[PhoneRecording] no remote track yet — delay retry');
            setTimeout(() => startRecording(meta), 800);
            return false;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (err) {
            console.warn('[PhoneRecording] mic denied, recording remote only:', err.message);
            localStream = null;
        }

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const dest = audioCtx.createMediaStreamDestination();

        // Remote audio
        try {
            const remoteStream = new MediaStream([remoteTrack]);
            audioCtx.createMediaStreamSource(remoteStream).connect(dest);
        } catch (err) { console.warn('[PhoneRecording] connect remote failed:', err.message); }

        // Local mic
        if (localStream) {
            try { audioCtx.createMediaStreamSource(localStream).connect(dest); }
            catch (err) { console.warn('[PhoneRecording] connect local failed:', err.message); }
        }

        chunks = [];
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';

        try {
            recorder = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
        } catch (err) {
            console.error('[PhoneRecording] MediaRecorder init failed:', err.message);
            return false;
        }
        recorder.ondataavailable = (e) => { if (e.data?.size > 0) chunks.push(e.data); };
        recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: mime || 'audio/webm' });
            try { await _saveRecording(blob); } catch (err) { console.error('[PhoneRecording] save failed:', err.message); }
            chunks = [];
            destStream = null;
            if (localStream) { localStream.getTracks().forEach(t => t.stop()); localStream = null; }
            if (audioCtx) { try { audioCtx.close(); } catch {} audioCtx = null; }
            currentMeta = null;
        };
        try { recorder.start(1000); } catch (err) { console.error('[PhoneRecording] start failed:', err.message); return false; }

        destStream = dest.stream;
        currentMeta = meta || {};
        startedAt = Date.now();
        console.log('[PhoneRecording] started', meta);
        return true;
    }

    async function stopRecording(extraMeta) {
        if (extraMeta) currentMeta = { ...currentMeta, ...extraMeta };
        if (!recorder) return;
        if (recorder.state === 'inactive') { recorder = null; return; }
        return new Promise(resolve => {
            const r = recorder; recorder = null;
            const origOnStop = r.onstop;
            r.onstop = async (ev) => { try { await origOnStop?.(ev); } finally { resolve(); } };
            try { r.stop(); } catch { resolve(); }
        });
    }

    async function _saveRecording(blob) {
        const d = await _openDb();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            const duration = currentMeta?.duration || Math.round((Date.now() - startedAt) / 1000);
            const rec = {
                timestamp: currentMeta?.timestamp || Date.now(),
                duration,
                username: currentMeta?.username || '',
                ext: currentMeta?.ext || '',
                phone: currentMeta?.phone || '',
                name: currentMeta?.name || '',
                direction: currentMeta?.direction || 'out',
                orderCode: currentMeta?.orderCode || '',
                mimeType: blob.type,
                size: blob.size,
                blob
            };
            const req = store.add(rec);
            req.onsuccess = () => { console.log('[PhoneRecording] saved', req.result, blob.size, 'bytes'); resolve(req.result); };
            req.onerror = () => reject(req.error);
        });
    }

    async function listRecordings() {
        const d = await _openDb();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(STORE, 'readonly');
            const store = tx.objectStore(STORE);
            const items = [];
            store.openCursor(null, 'prev').onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const { blob, ...meta } = cursor.value;
                    items.push({ id: cursor.primaryKey, ...meta, hasBlob: !!blob });
                    cursor.continue();
                } else resolve(items);
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getRecordingUrl(id) {
        const d = await _openDb();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(STORE, 'readonly');
            const req = tx.objectStore(STORE).get(id);
            req.onsuccess = () => {
                const r = req.result;
                if (!r?.blob) return resolve(null);
                resolve({ url: URL.createObjectURL(r.blob), filename: `call-${id}-${r.phone || 'unknown'}.webm`, ...r });
            };
            req.onerror = () => reject(req.error);
        });
    }

    async function deleteRecording(id) {
        const d = await _openDb();
        return new Promise((resolve, reject) => {
            const tx = d.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(id).onsuccess = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function cleanupOld() {
        const cutoff = Date.now() - RETENTION_DAYS * 86400000;
        try {
            const d = await _openDb();
            const tx = d.transaction(STORE, 'readwrite');
            const idx = tx.objectStore(STORE).index('timestamp');
            idx.openCursor(IDBKeyRange.upperBound(cutoff)).onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) { cursor.delete(); cursor.continue(); }
            };
        } catch (err) { console.warn('[PhoneRecording] cleanup failed:', err.message); }
    }

    async function getStorageStats() {
        try {
            const recs = await listRecordings();
            const totalBytes = recs.reduce((sum, r) => sum + (r.size || 0), 0);
            return { count: recs.length, bytes: totalBytes };
        } catch { return { count: 0, bytes: 0 }; }
    }

    // Auto-cleanup shortly after load
    if (typeof window !== 'undefined') {
        setTimeout(() => { try { cleanupOld(); } catch {} }, 5000);
    }

    return {
        startRecording, stopRecording,
        listRecordings, getRecordingUrl, deleteRecording,
        isEnabled, getStorageStats
    };
})();

if (typeof window !== 'undefined') window.PhoneRecording = PhoneRecording;
