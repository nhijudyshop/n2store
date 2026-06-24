// #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — MODULE worker: nhận diện khuôn mặt NỀN (không đứng UI).
/**
 * Chạy MediaPipe FaceLandmarker trên LUỒNG NỀN (Web Worker kiểu module) → main-thread
 * KHÔNG bị "đứng" ở bước "Đang nhận diện khuôn mặt". Nhận ImageBitmap (transfer) →
 * trả landmarks normalize 0..1. Model load ~13MB lần đầu (cache HTTP) cũng chạy nền.
 *
 * Web Worker = built-in trình duyệt, MIỄN PHÍ. type:'module' để dùng dynamic import().
 * Nhận: { id, bitmap }  → trả: { id, ok, landmarks:[[x,y],...]|null } | { id, ok:false, error }
 */
let _flP = null;
const VER = '0.10.18';
const MODEL =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

async function getFL() {
    if (_flP) return _flP;
    _flP = (async () => {
        const v = await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`);
        const fs = await v.FilesetResolver.forVisionTasks(
            `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}/wasm`
        );
        const mk = (delegate) =>
            v.FaceLandmarker.createFromOptions(fs, {
                runningMode: 'IMAGE',
                numFaces: 1,
                minFaceDetectionConfidence: 0.5,
                minFacePresenceConfidence: 0.5,
                baseOptions: { modelAssetPath: MODEL, delegate },
            });
        // CPU (XNNPACK) ưu tiên: ổn định + nhanh cho ảnh tĩnh; lỗi → GPU.
        try {
            return await mk('CPU');
        } catch (_) {
            return await mk('GPU');
        }
    })();
    _flP.catch(() => {
        _flP = null;
    });
    return _flP;
}

self.onmessage = async (e) => {
    const { id, bitmap } = e.data || {};
    try {
        const fl = await getFL();
        const res = fl.detect(bitmap);
        try {
            bitmap && bitmap.close && bitmap.close();
        } catch (_) {}
        const lm = res && res.faceLandmarks && res.faceLandmarks[0];
        self.postMessage({ id, ok: true, landmarks: lm ? lm.map((p) => [p.x, p.y]) : null });
    } catch (err) {
        self.postMessage({ id, ok: false, error: String((err && err.message) || err) });
    }
};
