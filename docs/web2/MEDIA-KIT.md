<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 — KHO ĐA DỤNG media/AI. -->

# 🧰 KHO ĐA DỤNG Web 2.0 — AI · Giọng nói · Hình ảnh · Video

> **Mục đích:** 1 điểm "ĐỌC VÀO ĐÂY" khi cần 1 capability media/AI. Tìm thấy → **TÁI DÙNG, KHÔNG viết lại**.
> Quy tắc gốc (CLAUDE.md #0): cái gì ≥2 nơi cần → làm **shared 1 nguồn** trong `web2/shared/`, trang chỉ điều phối.
>
> **Trạng thái:** ✅ = đã ở `web2/shared/` (dùng chung mọi trang) · ⚠️ = còn feature-local (nên promote lên shared khi tái dùng) · 🛰️ = backend service.
>
> Tự cập nhật khi thêm/đổi module. Index máy đọc: [WEB2-CODEMAP §1](WEB2-CODEMAP.md). Regenerate: `node scripts/gen-web2-codemap.js`.

---

## 🎙️ GIỌNG NÓI (Voice / TTS / Audio)

| Capability                                                             | Module / Service    | File                                                                      | API ngắn                                                                                               | Dùng khi                                                           |
| ---------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| TTS tiếng Việt **on-device** (MMS + Piper, 4 giọng + tông)             | `Web2VideoTTS` ⚠️   | [video-maker/js/video-tts.js](../../web2/video-maker/js/video-tts.js)     | `synthesize(text,{voiceId,pitch,onStatus})`→`{samples,sampleRate}` · `VOICES`/`TONES` · `speakPreview` | Cần giọng đọc Việt miễn phí, chạy thẳng trình duyệt, không server  |
| **Clone giọng** (zero-shot 3–5s) + giọng cao cấp                       | VieNeu-TTS 🛰️       | [vieneu-tts/](../../vieneu-tts/) (Render Web 2.0)                         | `POST /synthesize {text,voice}` · `POST /clone {text,ref_audio}` → WAV                                 | Cần nhái GIỌNG chủ shop / chất lượng cao (model 0.5B, chạy server) |
| Nhạc nền: giải mã + **tách giọng/nhạc** (karaoke) + trộn + trích audio | `Web2VideoAudio` ⚠️ | [video-maker/js/video-audio.js](../../web2/video-maker/js/video-audio.js) | `decodeFile` · `karaokeSplit` · `buildMixGraph` · `bufferToWavBlob` · `extractAudioFromVideo`          | Chèn/ghép/tách nhạc, mux tiếng vào video, trích .wav               |

> ⚠️ `Web2VideoTTS` + `Web2VideoAudio` HIỆN feature-local (video-maker). Khi trang khác cần giọng/audio → **promote lên `web2/shared/`** (vd `web2-voice.js` hợp nhất MMS/Piper/VieNeu) rồi tham chiếu, đừng copy.

## 🎬 VIDEO (render / animation / effect)

| Capability                                                              | Module                                               | File                                                                                    | API ngắn                                                                                       | Dùng khi                                                |
| ----------------------------------------------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Render slideshow SP lên canvas (Ken Burns + chuyển cảnh + chữ + filter) | `Web2VideoRender` ⚠️                                 | [video-maker/js/video-render.js](../../web2/video-maker/js/video-render.js)             | `drawFrame(ctx,W,H,scenes,t,opts)` · `totalDuration` · `MOTIONS/TRANSITIONS/FILTERS`           | Ghép ảnh → video (preview + export dùng chung)          |
| Animation "chất Remotion" (spring/easing/interpolate)                   | `Web2VideoAnim` ⚠️                                   | [video-maker/js/video-anim.js](../../web2/video-maker/js/video-anim.js)                 | `spring({frame,fps,config})` · `interpolate(x,[in],[out],{easing})` · `Easing` · `cubicBezier` | Cần chuyển động mượt/nảy tự nhiên (canvas, không React) |
| Panel chỉnh chi tiết từng cảnh                                          | `Web2VideoSceneEditor` ⚠️                            | [video-maker/js/video-scene-editor.js](../../web2/video-maker/js/video-scene-editor.js) | `detailHtml(scene,esc)` · `OPTIONS`                                                            | UI chọn motion/transition/filter/vị trí chữ             |
| Làm đẹp VIDEO (lọc màu + mịn da + warp mặt theo khung)                  | `Web2VideoBeautyRender` / `Web2VideoBeautyExport` ⚠️ | [video-beauty/js/](../../web2/video-beauty/)                                            | `applyFrame` · `exportRealtime` / `exportRenderPass` (WebCodecs+mp4-muxer)                     | Beauty cho video clip                                   |
| Lottie animation (empty-state, burst success/error)                     | `Web2Lottie` ✅                                      | [shared/web2-lottie.js](../../web2/shared/web2-lottie.js)                               | auto-enhance `.empty-state-icon` · `success()/error()`                                         | Animation Lottie bất kỳ trang Web 2.0                   |
| Engine animation (motion.dev)                                           | `Web2Motion` ✅                                      | [shared/web2-motion.js](../../web2/shared/web2-motion.js)                               | ESM animate                                                                                    | Animation DOM tái dùng                                  |
| Hiệu ứng / transition UI                                                | `Web2Effects` ✅                                     | [shared/web2-effects.js](../../web2/shared/web2-effects.js)                             | effects library                                                                                | Hiệu ứng nhỏ UI                                         |

## 🖼️ HÌNH ẢNH (Image)

| Capability                                                  | Module                                                         | File                                                                  | API ngắn                                                                                    | Dùng khi                    |
| ----------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | --------------------------- |
| Làm đẹp ảnh: warp/mịn da/màu da/mắt/mũi/V-line/môi/kéo chân | `Web2BeautyFilters` · `Web2BeautyFace` · `Web2BeautyStudio` ✅ | [shared/beauty/](../../web2/shared/beauty/)                           | `Studio.open(src,{tool})` · `Filters.beautify/warp/stretchBand` · `Face.detect` (MediaPipe) | Beauty / chỉnh nhanh ảnh SP |
| Xoá logo/vùng chọn                                          | `Web2LogoEraser` ✅                                            | [shared/web2-logo-eraser.js](../../web2/shared/web2-logo-eraser.js)   | erase vùng chọn                                                                             | Gỡ watermark/logo trên ảnh  |
| Editor ảnh + lightbox                                       | `Web2ImageEditor` · `Web2ImageLightbox` ✅                     | [shared/web2-image-editor.js](../../web2/shared/web2-image-editor.js) | crop/rotate/zoom · xem ảnh                                                                  | Sửa/xem ảnh                 |
| Sinh QR "trang trí" (tem SP + PBH)                          | `Web2QR` · `Web2QrModal` ✅                                    | [shared/web2-qr.js](../../web2/shared/web2-qr.js)                     | `toSvg/toDataUrl/card`                                                                      | Cần QR đen trắng styled     |
| Tạo card SP (canvas → PNG)                                  | `Web2ProductCard` ⚠️                                           | [product-card/js/](../../web2/product-card/)                          | render canvas template → export                                                             | Tạo ảnh card SP đăng bán    |
| Canvas / avatar helper                                      | `Web2CanvasUtils` · `Web2AvatarUtils` ✅                       | [shared/web2-canvas-utils.js](../../web2/shared/web2-canvas-utils.js) | tiện ích canvas/avatar                                                                      | Vẽ/đo canvas, avatar        |

## 🤖 AI (thị giác on-device + text)

| Capability                              | Module / Service                  | File                                                                                                                                                                 | API ngắn                                                      | Dùng khi                           |
| --------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------- |
| Quét **barcode/QR** bằng camera         | `Web2BarcodeScanner` ✅           | [shared/web2-barcode-scanner.js](../../web2/shared/web2-barcode-scanner.js)                                                                                          | `open({onScan})` · `mount()`                                  | Quét mã bằng camera điện thoại     |
| **OCR** chữ in trên nhãn                | `Web2LabelOcr` ✅                 | [shared/web2-label-ocr.js](../../web2/shared/web2-label-ocr.js)                                                                                                      | `scan()` (tesseract.js on-device)                             | Đọc chữ nhãn/đơn bằng camera       |
| Đếm **số SP** qua camera (MediaPipe)    | `Web2ProductCounter` ✅           | [shared/web2-product-counter.js](../../web2/shared/web2-product-counter.js)                                                                                          | `mount(target,opts)` · `open(opts)`                           | Đếm vật thể realtime               |
| Đếm **bó/pack** (opencv) + sửa tay      | `Web2PackCounter` ✅              | [shared/web2-pack-counter.js](../../web2/shared/web2-pack-counter.js)                                                                                                | đếm pack                                                      | Đếm bó hàng                        |
| Face landmark 478 điểm                  | `Web2BeautyFace` ✅               | [shared/beauty/web2-beauty-face.js](../../web2/shared/beauty/web2-beauty-face.js)                                                                                    | `detect(srcEl)`                                               | Nhận diện khuôn mặt cho beauty     |
| AI viết **kịch bản video** từ chủ đề    | `Web2VideoAiScript` ⚠️ + route 🛰️ | [video-maker/js/video-ai-script.js](../../web2/video-maker/js/video-ai-script.js) · [render.com/routes/web2-ai-script.js](../../render.com/routes/web2-ai-script.js) | `generate({topic,products})` → Gemini (`WEB2_GEMINI_API_KEY`) | Tạo lời/kịch bản video từ 1 chủ đề |
| AI caption bài FB (offline + Groq free) | (trong fb-posts) 🛰️               | [render.com/routes/web2-fb-posts.js](../../render.com/routes/web2-fb-posts.js)                                                                                       | template + Groq                                               | Viết caption bài đăng              |

> 🛰️ **Backend AI/giọng (Web 2.0 Render)**: `web2-ai-script` (Gemini, key `WEB2_GEMINI_API_KEY`), VieNeu-TTS (clone giọng), fb-posts (Groq). KHÔNG đụng **AI KOL Studio** (Web 1.0).

---

## Cách dùng kho (quy trình)

1. Cần 1 capability media/AI → **tra bảng trên TRƯỚC**. Có (✅) → load script + gọi API, KHÔNG viết lại.
2. Có nhưng đang feature-local (⚠️) mà trang KHÁC cần → **promote lên `web2/shared/`** (đổi tên `web2-<x>.js`, export `Web2X`) rồi cả 2 trang tham chiếu — sửa 1 nơi áp dụng mọi nơi.
3. Chưa có → build ở `web2/shared/` ngay từ đầu nếu ≥2 nơi sẽ cần; thêm vào bảng này + chạy `gen-web2-codemap.js`.

## Lộ trình promote (đang nợ → shared)

- [ ] `Web2VideoTTS` + VieNeu → hợp nhất `web2/shared/web2-voice.js` (`Web2Voice`: MMS/Piper on-device + VieNeu clone server)
- [ ] `Web2VideoAudio` → `web2/shared/web2-audio.js`
- [ ] `Web2VideoRender` / `Web2VideoAnim` / `Web2VideoSceneEditor` → `web2/shared/video/`
- [ ] `Web2VideoBeauty*` → `web2/shared/video/`
- [ ] `Web2ProductCard` → `web2/shared/` nếu trang khác cần tạo card
