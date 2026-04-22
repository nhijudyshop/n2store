// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// Phone Recording — local MediaRecorder + IndexedDB + auto-upload to Render DB
// Mixes local mic + remote audio via AudioContext → MediaRecorder → Blob → IndexedDB → Cloud
// Always-on: tất cả cuộc gọi đều được thu âm tự động
// Retention: local 30 ngày (IndexedDB cache), cloud vô thời hạn (Render Postgres)

const PhoneRecording = (() => {
    const DB_NAME = 'phoneRecordings';
    const STORE = 'recordings';
    const RETENTION_DAYS = 30;
    const PREFS_KEY = 'phoneMgmt_prefs';
    const CLOUD_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/oncall/call-recordings';

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

    // Always-on: recording luôn bật. Giữ tên isEnabled() để không phá API hiện tại.
    function isEnabled() { return true; }

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
        const duration = currentMeta?.duration || Math.round((Date.now() - startedAt) / 1000);
        const meta = {
            timestamp: currentMeta?.timestamp || Date.now(),
            duration,
            username: currentMeta?.username || '',
            ext: currentMeta?.ext || '',
            phone: currentMeta?.phone || '',
            name: currentMeta?.name || '',
            direction: currentMeta?.direction || 'out',
            orderCode: currentMeta?.orderCode || '',
            mimeType: blob.type,
            size: blob.size
        };
        const localId = await new Promise((resolve, reject) => {
            const tx = d.transaction(STORE, 'readwrite');
            const store = tx.objectStore(STORE);
            const req = store.add({ ...meta, blob });
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
        console.log('[PhoneRecording] saved local', localId, blob.size, 'bytes');
        // Fire-and-forget cloud upload (không block UI nếu mạng chậm/lỗi)
        _uploadToCloud(blob, meta).catch(err => console.warn('[PhoneRecording] cloud upload failed:', err.message));
        return localId;
    }

    async function _uploadToCloud(blob, meta) {
        if (!meta?.phone) return; // không phone → không có gì để match, bỏ qua
        const audio_b64 = await _blobToBase64(blob);
        const body = {
            username: meta.username || '',
            ext: meta.ext || null,
            phone: meta.phone,
            name: meta.name || null,
            direction: meta.direction || 'out',
            order_code: meta.orderCode || null,
            duration: meta.duration || 0,
            mime_type: meta.mimeType || 'audio/webm',
            timestamp: meta.timestamp || Date.now(),
            audio_b64
        };
        const r = await fetch(CLOUD_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (!r.ok) {
            const t = await r.text().catch(() => '');
            throw new Error(`HTTP ${r.status} ${t.substring(0, 120)}`);
        }
        const out = await r.json().catch(() => ({}));
        console.log('[PhoneRecording] cloud upload ok id=' + out.id + ' size=' + (out.size || 0));
    }

    function _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const s = String(reader.result || '');
                const i = s.indexOf(',');
                resolve(i >= 0 ? s.slice(i + 1) : s);
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(blob);
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
