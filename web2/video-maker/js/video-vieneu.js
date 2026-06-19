// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2VideoVieneuUI — UI nối VieNeu (server máy shop) vào video-maker:
 *   • cấu hình + lưu URL server (nhiều máy → dán URL máy đang bật), tự kết nối.
 *   • kết nối → nạp giọng preset vào danh sách giọng (Web2VideoTTS.registerVieneuVoices).
 *   • CLONE giọng: thu mic 5s HOẶC tải file mẫu → convert WAV → thêm giọng "⭐ của tôi".
 * Dùng client chung Web2Vieneu (web2-vieneu.js) + engine 'vieneu' trong Web2VideoTTS.
 *
 *   Web2VideoVieneuUI.init({ state, onChange })   // onChange = renderVoices()
 */
(function (global) {
    'use strict';

    const $ = (s) => document.querySelector(s);
    const notify = (m, t) =>
        global.notificationManager?.show?.(m, t || 'info') || console.log('[vieneu]', m);

    function init(ctx) {
        const V = global.Web2Vieneu;
        const TTS = global.Web2VideoTTS;
        if (!V || !TTS || !ctx || !ctx.state) return;
        const st = ctx.state;
        const onChange = ctx.onChange || function () {};
        const urlIn = $('#vmVnUrl');
        const stat = $('#vmVnStat');
        const cloneRow = $('#vmVnCloneRow');
        const clearBtn = $('#vmVnCloneClear');
        const setStat = (m) => stat && (stat.textContent = m);
        if (urlIn) urlIn.value = V.getUrl() || '';

        async function connect() {
            const url = (urlIn?.value || '').trim();
            if (!url) return notify('Nhập URL server giọng VieNeu (xem run_local.sh)', 'warning');
            V.setUrl(url);
            setStat('Đang kết nối server giọng…');
            try {
                await V.health(8000);
                const voices = await V.listVoices();
                st.vieneuVoices = voices;
                TTS.registerVieneuVoices(voices, st.vieneuRef);
                onChange();
                if (cloneRow) cloneRow.hidden = false;
                setStat(
                    `✅ Kết nối OK — ${voices.length} giọng VieNeu. Chọn giọng 🎙️/⭐ ở mục "Giọng đọc".`
                );
                notify('Đã kết nối server giọng VieNeu', 'success');
            } catch (e) {
                setStat(
                    '❌ Không kết nối được: ' + (e.message || e) + ' — máy shop đã bật server chưa?'
                );
            }
        }
        $('#vmVnConnect')?.addEventListener('click', connect);

        // --- tự dò máy shop đang online (registry) → bấm chọn, không cần dán URL ---
        const serversBox = $('#vmVnServers');
        function renderServers(list) {
            if (!serversBox) return;
            if (!list || !list.length) {
                serversBox.innerHTML =
                    '<span class="vm-hint2">Chưa thấy máy shop nào online. Bật server trên máy shop (install-windows.bat / run-mac.command).</span>';
                return;
            }
            const cur = V.getUrl();
            serversBox.innerHTML = list
                .map(function (s) {
                    const on = s.url === cur ? ' on' : '';
                    const age =
                        s.ageSec < 60 ? 'online' : '~' + Math.round(s.ageSec / 60) + 'p trước';
                    return (
                        '<button type="button" class="vm-vn-server' +
                        on +
                        '" data-url="' +
                        encodeURIComponent(s.url) +
                        '"><i data-lucide="monitor-smartphone"></i> ' +
                        (s.name || 'Máy shop') +
                        ' <span class="vm-vn-age">' +
                        age +
                        '</span></button>'
                    );
                })
                .join('');
            serversBox.querySelectorAll('.vm-vn-server').forEach(function (b) {
                b.addEventListener('click', function () {
                    if (urlIn) urlIn.value = decodeURIComponent(b.dataset.url);
                    connect();
                });
            });
            if (global.lucide) global.lucide.createIcons();
        }
        async function refreshServers() {
            try {
                renderServers(await V.listServers());
            } catch (e) {
                /* im lặng */
            }
        }
        $('#vmVnRefresh')?.addEventListener('click', refreshServers);
        $('#vmVnInstaller')?.addEventListener('click', () => {
            if (global.Web2PosInstaller) {
                global.Web2PosInstaller.downloadInstaller();
                notify('Đã tải bộ cài — bấm đúp chạy trên máy shop (Windows)', 'success');
            } else notify('Chưa tải module cài đặt', 'warning');
        });
        refreshServers();
        setInterval(refreshServers, 20000);

        if (V.getUrl()) connect(); // tự kết nối nếu đã lưu URL

        // nạp giọng mẫu (mic/upload) → đảm bảo WAV (libsndfile không đọc webm/mp3) → clone
        async function applyRef(blob, name) {
            setStat('Đang xử lý giọng mẫu…');
            let wav = blob;
            try {
                if (!/wav/i.test(blob.type || '') && global.Web2VideoAudio) {
                    const buf = await global.Web2VideoAudio.decodeFile(blob);
                    wav = global.Web2VideoAudio.bufferToWavBlob(buf);
                }
            } catch (e) {
                /* để nguyên blob nếu convert lỗi */
            }
            st.vieneuRef = wav;
            TTS.registerVieneuVoices(st.vieneuVoices || [], wav);
            st.voiceId = 'vieneu-clone';
            onChange();
            if (clearBtn) clearBtn.hidden = false;
            setStat(`✅ Đã có giọng mẫu (${name || 'thu'}). Đã chọn "⭐ Giọng của tôi (clone)".`);
            notify('Đã nạp giọng mẫu để clone', 'success');
        }

        let rec = null;
        let chunks = [];
        $('#vmVnRec')?.addEventListener('click', async () => {
            if (rec && rec.state === 'recording') return;
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                chunks = [];
                rec = new MediaRecorder(stream);
                rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
                rec.onstop = () => {
                    stream.getTracks().forEach((t) => t.stop());
                    applyRef(new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), 'thu 5s');
                };
                rec.start();
                setStat('🔴 Đang thu 5 giây… đọc rõ 1 câu mẫu của bạn.');
                setTimeout(() => {
                    if (rec && rec.state === 'recording') rec.stop();
                }, 5000);
            } catch (e) {
                setStat('❌ Không mở được micro.');
                notify('Không truy cập được micro', 'error');
            }
        });
        $('#vmVnRefFile')?.addEventListener('change', (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) applyRef(f, f.name);
        });
        $('#vmVnCloneClear')?.addEventListener('click', () => {
            st.vieneuRef = null;
            TTS.registerVieneuVoices(st.vieneuVoices || [], null);
            onChange();
            if (clearBtn) clearBtn.hidden = true;
            setStat('Đã bỏ giọng mẫu.');
        });
    }

    global.Web2VideoVieneuUI = { init };
})(window);
