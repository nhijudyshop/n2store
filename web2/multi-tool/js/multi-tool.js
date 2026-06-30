// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — trang Đa dụng: tab tiện ích nội bộ. Tab "Tăng comment" = reply_comment qua Web2Chat (như Pancake gõ+Enter).
(function () {
    'use strict';

    function $(id) {
        return document.getElementById(id);
    }
    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
        else console.log('[notify]', type, msg);
    }
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }

    // ---------- Tab framework ----------
    function wireTabs() {
        const tabs = document.querySelectorAll('#mtTabs .mt-tab');
        tabs.forEach((t) => {
            t.addEventListener('click', () => {
                const key = t.dataset.tab;
                tabs.forEach((x) => x.classList.toggle('on', x === t));
                document
                    .querySelectorAll('.mt-panel')
                    .forEach((p) => p.classList.toggle('on', p.id === 'panel-' + key));
            });
        });
    }

    // ---------- Tab: Tăng số lượng comment ----------
    // Chờ Web2Chat sẵn sàng (load token async). Retry tối đa ~6s.
    async function waitWeb2Chat(tries = 20) {
        for (let i = 0; i < tries; i++) {
            if (window.Web2Chat && typeof window.Web2Chat.listPages === 'function')
                return window.Web2Chat;
            await sleep(300);
        }
        return null;
    }

    // Sinh text random NGẮN (giống kiểu gõ random). Trộn chữ + số, 5-9 ký tự.
    const _CH = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    function randText() {
        const n = 5 + Math.floor(Math.random() * 5);
        let s = '';
        for (let i = 0; i < n; i++) s += _CH.charAt(Math.floor(Math.random() * _CH.length));
        return s;
    }

    function workerBase() {
        return (
            (window.Web2Chat &&
                window.Web2Chat._internal &&
                window.Web2Chat._internal.WORKER_URL) ||
            ''
        );
    }
    function authHeaders(extra) {
        return window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders(extra) : extra || {};
    }

    let _posts = []; // bài live của page đang chọn (gồm live đã xong)
    let _convs = []; // conversations COMMENT của BÀI LIVE đang chọn
    let _running = false;
    let _stop = false;

    async function loadPages() {
        const sel = $('boostPage');
        const W = await waitWeb2Chat();
        if (!W) {
            sel.innerHTML = '<option value="">Web2Chat chưa sẵn sàng — refresh</option>';
            return;
        }
        const r = await W.listPages();
        if (!r.ok || !Array.isArray(r.pages) || !r.pages.length) {
            sel.innerHTML = `<option value="">Lỗi/không có page (${esc(r.reason || 'cấu hình token ở Cấu hình Pancake')})</option>`;
            return;
        }
        // Bỏ Instagram (igo_) — reply_comment chỉ FB.
        const pages = r.pages.filter((p) => !String(p.id).startsWith('igo_'));
        sel.innerHTML =
            '<option value="">— Chọn page —</option>' +
            pages
                .map((p) => `<option value="${esc(p.id)}">${esc(p.name || p.id)}</option>`)
                .join('');
        sel.onchange = () => loadPosts();
        // Mặc định chọn page "Nhijudy Store" (chuẩn hoá: lowercase + bỏ dấu cách) → tự
        // tải bài live → loadPosts() tự chọn bài MỚI NHẤT (index 0) + hội thoại mới nhất.
        const norm = (s) =>
            String(s || '')
                .toLowerCase()
                .replace(/\s+/g, '');
        const def =
            pages.find((p) => norm(p.name) === 'nhijudystore') ||
            pages.find((p) => norm(p.name).includes('nhijudystore'));
        if (def) {
            sel.value = String(def.id);
            loadPosts();
        }
    }

    // Parse timestamp Pancake — inserted_at là UTC KHÔNG hậu tố Z → phải append Z
    // (CLAUDE.md rule 10). Trả ms. Hiển thị theo GMT+7.
    function parseTs(s) {
        if (!s) return 0;
        const str = String(s);
        const hasTz = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(str);
        const t = new Date(hasTz ? str : str + 'Z').getTime();
        return isNaN(t) ? 0 : t;
    }
    function fmtDate(s) {
        const t = parseTs(s);
        if (!t) return '';
        return new Date(t).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    // Bài live của page — FETCH TRỰC TIẾP Pancake (KHÔNG qua poller server). Đúng
    // endpoint Pancake dùng cho "Quản lý bài viết" (đang/đã livestream):
    // pages/{id}/posts?start_time&end_time. live_status==='LIVE' / is_living = ĐANG
    // live. 14 ngày → gồm cả live đã xong. Ưu tiên ĐANG live lên đầu → mặc định
    // chọn (nếu không có live → bài mới nhất). Realtime push, không polling.
    async function loadPosts() {
        const pageId = $('boostPage').value;
        const psel = $('boostPost');
        _posts = [];
        $('boostConv').innerHTML = '<option value="">Chọn bài live trước…</option>';
        _convs = [];
        if (!pageId) {
            psel.innerHTML = '<option value="">Chọn page trước…</option>';
            return;
        }
        psel.innerHTML = '<option value="">Đang tải bài live…</option>';
        const W = await waitWeb2Chat();
        const jwt = W && W.getJwt && W.getJwt();
        if (!jwt) {
            psel.innerHTML = '<option value="">Thiếu token Pancake (Cấu hình Pancake)</option>';
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const qs = new URLSearchParams({
            access_token: jwt,
            start_time: String(now - 14 * 86400),
            end_time: String(now),
        });
        const url = `${workerBase()}/api/pancake/pages/${encodeURIComponent(pageId)}/posts?${qs}`;
        let raw = [];
        try {
            const data = await fetch(url).then((r) => r.json());
            raw = Array.isArray(data?.posts)
                ? data.posts
                : Array.isArray(data?.data)
                  ? data.data
                  : [];
        } catch (e) {
            psel.innerHTML = `<option value="">Lỗi tải bài: ${esc(e.message)}</option>`;
            return;
        }
        _posts = raw
            .filter((p) => p && (p.type === 'livestream' || p.is_live_video || p.live_video_id))
            .map((p) => ({
                postId: String(p.id),
                title: p.message || p.title || '(livestream)',
                date: p.inserted_at || p.created_time || p.updated_at || null,
                living: p.live_status === 'LIVE' || !!p.is_living,
                commentCount: Number(p.comment_count) || 0, // số comment hiện tại của bài (FB)
            }))
            // ĐANG live trước → MỚI NHẤT trước.
            .sort(
                (a, b) =>
                    (b.living ? 1 : 0) - (a.living ? 1 : 0) || parseTs(b.date) - parseTs(a.date)
            );
        if (!_posts.length) {
            psel.innerHTML = '<option value="">Page này không có bài live (14 ngày)</option>';
            return;
        }
        const optHtml = (p, i) =>
            `<option value="${i}">${esc(fmtDate(p.date))} — ${esc((p.title || '(livestream)').slice(0, 50))}</option>`;
        const living = [];
        const ended = [];
        _posts.forEach((p, i) => (p.living ? living : ended).push(optHtml(p, i)));
        let html = '';
        if (living.length)
            html += `<optgroup label="🔴 Đang Livestream">${living.join('')}</optgroup>`;
        if (ended.length) html += `<optgroup label="Đã Livestream">${ended.join('')}</optgroup>`;
        psel.innerHTML = html;
        psel.value = '0'; // index 0 = ĐANG live (nếu có) else bài mới nhất
        psel.onchange = () => loadConvs();
        loadConvs();
    }

    // Hội thoại COMMENT của BÀI LIVE đang chọn — fetch trực tiếp Pancake
    // (type=COMMENT&post_id) qua worker. fetchConversationsByPage hardcode INBOX nên
    // KHÔNG dùng được. Auto-chọn hội thoại MỚI NHẤT (updated_at desc).
    // Hiện số comment HIỆN TẠI của bài đang chọn (FB comment_count) — baseline cho job nền.
    function updatePostCount(post) {
        const el = $('boostPostCount');
        if (!el) return;
        if (!post) {
            el.textContent = '';
            return;
        }
        const c = Number(post.commentCount) || 0;
        el.innerHTML = `Bài đang chọn hiện có <strong>${c.toLocaleString('vi-VN')}</strong> comment. Chạy nền → mục tiêu = ${c.toLocaleString('vi-VN')} + số bạn nhập.`;
    }

    async function loadConvs() {
        const pageId = $('boostPage').value;
        const pidx = $('boostPost').value;
        const post = pidx !== '' ? _posts[Number(pidx)] : null;
        updatePostCount(post);
        const csel = $('boostConv');
        _convs = [];
        if (!pageId || !post) {
            csel.innerHTML = '<option value="">Chọn bài live trước…</option>';
            return;
        }
        csel.innerHTML = '<option value="">Đang tải hội thoại…</option>';
        const W = await waitWeb2Chat();
        const jwt = W && W.getJwt && W.getJwt();
        if (!jwt) {
            csel.innerHTML = '<option value="">Thiếu token Pancake (Cấu hình Pancake)</option>';
            return;
        }
        const now = Math.floor(Date.now() / 1000);
        const qs = new URLSearchParams({
            access_token: jwt,
            page_id: pageId,
            type: 'COMMENT',
            post_id: String(post.postId),
            since: String(now - 30 * 86400),
            until: String(now),
        });
        const url = `${workerBase()}/api/pancake/pages/${encodeURIComponent(pageId)}/conversations?${qs}`;
        let convs = [];
        try {
            const data = await fetch(url).then((r) => r.json());
            convs = Array.isArray(data?.conversations) ? data.conversations : [];
        } catch (e) {
            csel.innerHTML = `<option value="">Lỗi tải hội thoại: ${esc(e.message)}</option>`;
            return;
        }
        // ⚠ Pancake trả conversations của post_id lọc KHÔNG chặt — gồm cả conv của
        // bài KHÁC (vd bài photo updated_at mới hơn). PHẢI lọc đúng post_id của BÀI
        // đang chọn, nếu không comment tăng đổ vào sai bài (re-check count sai bài).
        const isComment = (c) => String(c.type || '').toUpperCase() === 'COMMENT';
        const samePost = (c) => String(c.post_id || '') === String(post.postId);
        let filtered = convs.filter((c) => isComment(c) && samePost(c));
        if (!filtered.length) filtered = convs.filter(isComment); // fallback nếu post_id format khác
        _convs = filtered.sort(
            (a, b) => (Date.parse(b.updated_at || 0) || 0) - (Date.parse(a.updated_at || 0) || 0)
        );
        if (!_convs.length) {
            csel.innerHTML =
                '<option value="">Bài này chưa có hội thoại comment (cần có người đã comment)</option>';
            return;
        }
        csel.innerHTML = _convs
            .map((c, i) => {
                const nm =
                    (c.customers && c.customers[0] && c.customers[0].name) || c.from?.name || 'KH';
                const snip = (c.snippet || '').slice(0, 24);
                return `<option value="${i}">${esc(nm)} — ${esc(snip)}</option>`;
            })
            .join('');
        csel.value = '0'; // mặc định chọn MỚI NHẤT
    }

    // Báo backend conv đang "tăng comment" → (1) ingest BỎ QUA event mới (TTL 20'),
    // (2) XOÁ comment đã ingest của conv đó + SSE → live-chat tự bỏ. Trả {purged}.
    async function markBoost(convId) {
        if (!convId) return { ok: false, purged: 0 };
        try {
            const r = await fetch(`${workerBase()}/api/web2-live-comments/boost-mark`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ convId: String(convId) }),
            });
            const j = await r.json().catch(() => ({}));
            return { ok: !!j.success, purged: j.purged || 0 };
        } catch (_) {
            return { ok: false, purged: 0 };
        }
    }

    // Mark NHIỀU conv.id cùng lúc — dùng cho conv.id THẬT của từng comment boost vừa
    // tạo (`<post_id>_<comment_id>`). Mỗi reply_comment sinh comment MỚI có conv.id
    // RIÊNG ≠ conv.id hội thoại gốc → mark conv.id gốc KHÔNG đủ (comment boost vẫn lọt
    // vào live-chat/comments-mobile). Mark đúng conv.id thật → ingest bỏ qua + purge.
    async function markBoostIds(ids) {
        const arr = [...new Set((ids || []).map((x) => String(x || '').trim()).filter(Boolean))];
        if (!arr.length) return { ok: false, purged: 0 };
        try {
            const r = await fetch(`${workerBase()}/api/web2-live-comments/boost-mark`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ convIds: arr }),
            });
            const j = await r.json().catch(() => ({}));
            return { ok: !!j.success, purged: j.purged || 0 };
        } catch (_) {
            return { ok: false, purged: 0 };
        }
    }

    // Nút "Dọn comment đã tăng" — xoá + ẩn các comment boost của hội thoại đang chọn
    // KHÔNG cần spam. Dùng để dọn spam thủ công (gõ tay trên Pancake) đã lọt vào.
    async function cleanConv() {
        const idx = $('boostConv').value;
        const conv = idx !== '' ? _convs[Number(idx)] : null;
        if (!conv) {
            notify('Chọn hội thoại trước', 'warning');
            return;
        }
        const btn = $('boostClean');
        if (btn) btn.disabled = true;
        const res = await markBoost(conv.id);
        if (btn) btn.disabled = false;
        if (res.ok) notify(`Đã ẩn & xoá ${res.purged} comment tăng khỏi live-chat`, 'success');
        else notify('Dọn thất bại (kiểm tra đăng nhập)', 'error');
    }

    function logLine(msg) {
        const el = $('boostLog');
        el.textContent += msg + '\n';
        el.scrollTop = el.scrollHeight;
    }

    async function run() {
        if (_running) return;
        const pageId = $('boostPage').value;
        const idx = $('boostConv').value;
        const conv = idx !== '' ? _convs[Number(idx)] : null;
        if (!pageId || !conv) {
            notify('Chọn page + bài live + hội thoại comment trước', 'warning');
            return;
        }
        const total = Math.max(1, Math.min(500, parseInt($('boostCount').value, 10) || 0));
        // Ô nhập đơn vị GIÂY (thập phân) → ms. Tối thiểu 1s (1000ms).
        const delay = Math.round(Math.max(1, parseFloat($('boostDelay').value) || 1) * 1000);
        const tpl = ($('boostText').value || '').trim();
        const W = await waitWeb2Chat();
        if (!W) return;
        // post_id để dựng conv.id THẬT của comment boost (`<post_id>_<comment_id>`).
        const postId = conv.post_id || String(conv.id || '').split('_')[0] || null;

        // reply_comment message_id = comment GỐC (top-level) của hội thoại = conv.id
        // (format <post_id>_<comment_id> của comment KH gốc — luôn là target hợp lệ).
        //
        // ⚠ KHÔNG fetch "comment MỚI NHẤT" của hội thoại làm target (bug 2026-06-19):
        // sau LẦN TĂNG ĐẦU, message mới nhất của hội thoại chính là COMMENT BOOST do
        // page tự tạo (nested reply, page-authored, text random — verified browser-test:
        // msgs xếp cũ→mới nên .pop() = mới nhất = boost reply). Reply vào một nested-reply
        // KHÔNG cộng vào số đếm bình luận của BÀI VIẾT trên Facebook như reply vào comment
        // top-level → từ lần tăng thứ 2 trở đi "số lượng bình luận không tăng" dù gửi OK.
        // Reply vào comment GỐC top-level thì mỗi reply = +1 (đúng như lần tăng đầu).
        const messageId = conv.id;

        _running = true;
        _stop = false;
        $('boostRun').disabled = true;
        $('boostStop').disabled = false;
        $('boostProg').style.display = 'block';
        $('boostLog').textContent = '';
        $('boostTotal').textContent = `/ ${total}`;
        let ok = 0,
            err = 0;
        const setStat = () => {
            $('boostOk').textContent = ok;
            $('boostErr').textContent = err;
            $('boostBar').style.width = (((ok + err) / total) * 100).toFixed(1) + '%';
        };
        // Ẩn + dọn các comment này khỏi live-chat NGAY trước khi spam (+ re-mark mỗi 100 tin).
        const mb = await markBoost(conv.id);

        // ĐA NHIỆM: 1 worker / ACCOUNT — mỗi account dùng JWT riêng làm access_token
        // (đúng cách Pancake gửi tay: POST /api/pancake/.../messages?access_token=JWT).
        // Account phải admin page (acc.pages). Không có → fallback JWT active (1 worker).
        let accs = [];
        try {
            accs = W.getPageAccountJwts(pageId) || [];
        } catch (_) {
            /* fallback */
        }
        if (!accs.length) accs = [{ accountId: 'active', name: 'active', jwt: null }];
        const workers = accs.length;

        logLine(`▶ Bắt đầu: ${total} comment, giãn ${delay}ms, hội thoại ${conv.id}`);
        logLine(`· Đã báo live-chat ẩn comment tăng${mb.purged ? ` (dọn ${mb.purged} cũ)` : ''}.`);
        logLine(`· Đa nhiệm: ${workers} tài khoản Pancake song song (gửi y hệt Pancake).`);

        let claimed = 0; // chỉ số kế tiếp (JS 1 luồng → claimed++ giữa await là atomic)
        let lastMark = 0;
        const nextIdx = () => (!_stop && claimed < total ? claimed++ : -1);
        // conv.id THẬT của từng comment boost vừa tạo → mark/purge chính xác (không
        // để lọt vào live-chat/comments-mobile như conv.id gốc bỏ sót).
        const boostedConvIds = new Set();
        let pendingMark = [];
        const flushMarks = (force) => {
            if (!postId) return;
            if (force || pendingMark.length >= 5) {
                const batch = pendingMark;
                pendingMark = [];
                if (batch.length) markBoostIds(batch); // fire-and-forget (chặn ingest sớm)
            }
        };

        async function worker(jwt, label) {
            while (true) {
                const i = nextIdx();
                if (i < 0) break;
                if (claimed - lastMark >= 100) {
                    lastMark = claimed; // re-mark boost định kỳ (1 worker lo, không await)
                    markBoost(conv.id);
                }
                const text = tpl || randText();
                try {
                    // Gửi GIỐNG 100% Pancake: reply_comment + message_id/parent_id/
                    // post_id/send_by_platform, access_token = JWT account (không PAT).
                    const res = await W.sendLiveComment(pageId, conv, text, {
                        jwt: jwt || undefined,
                        messageId,
                    });
                    if (res && res.ok) {
                        ok++;
                        // conv.id THẬT của comment vừa tạo = `<post_id>_<id>` → mark để
                        // ingest bỏ qua + purge (chống lọt vào live-chat như hình lỗi).
                        if (res.id && postId) {
                            const bid = `${postId}_${res.id}`;
                            if (!boostedConvIds.has(bid)) {
                                boostedConvIds.add(bid);
                                pendingMark.push(bid);
                                flushMarks(false);
                            }
                        }
                        logLine(`✓ [${label}] #${i + 1} "${text}"`);
                    } else {
                        err++;
                        const reason = (res && res.reason) || 'unknown';
                        logLine(`✗ [${label}] #${i + 1} ${reason}`);
                        // Rate-limit / policy FB → DỪNG TẤT CẢ worker (tránh khoá page).
                        if (
                            res &&
                            (res.e_subcode === 3252001 ||
                                res.e_code === 368 ||
                                /rate|limit|spam|chặn|policy/i.test(reason))
                        ) {
                            _stop = true;
                            logLine(`⛔ [${label}] FB giới hạn → dừng để an toàn.`);
                            notify('FB giới hạn (rate-limit) → đã dừng', 'error');
                            break;
                        }
                    }
                } catch (e) {
                    err++;
                    logLine(`✗ [${label}] #${i + 1} ${e.message}`);
                }
                setStat();
                if (!_stop && claimed < total) await sleep(delay);
            }
        }

        await Promise.all(
            accs.map((a, k) => worker(a.jwt, a.name ? `${a.name.slice(0, 8)}` : `T${k + 1}`))
        );
        if (_stop) logLine('⏹ Đã dừng.');
        // DỌN DỨT ĐIỂM: flush ids còn lại + đợi relay ingest batch cuối rồi purge TOÀN
        // BỘ conv.id comment boost (xoá những cái ingest sau lần mark trước) → KHÔNG lọt
        // vào live-chat/comments-mobile.
        flushMarks(true);
        if (boostedConvIds.size && postId) {
            logLine(`· Dọn ${boostedConvIds.size} comment tăng khỏi live-chat…`);
            await sleep(1800);
            const fin = await markBoostIds([...boostedConvIds]);
            logLine(`· Đã dọn (purged ${fin.purged}).`);
        }
        setStat();
        _running = false;
        $('boostRun').disabled = false;
        $('boostStop').disabled = true;
        logLine(`■ Xong: ${ok} gửi, ${err} lỗi.`);
        notify(`Tăng comment xong: ${ok} gửi, ${err} lỗi`, ok ? 'success' : 'warning');
    }

    // ============ Job chạy NỀN trên server (đóng tab vẫn chạy) ============
    const BOOST_API = () => `${workerBase()}/api/web2-comment-boost`;
    const JOB_STATE = {
        pending: { txt: 'Đang chờ', cls: 'pending' },
        running: { txt: 'Đang chạy', cls: 'running' },
        done: { txt: 'Hoàn tất ✓', cls: 'done' },
        stopped: { txt: 'Đã dừng', cls: 'stopped' },
        error: { txt: 'Chưa đạt', cls: 'error' },
    };
    const STOP_REASON = {
        rate_limit: 'FB giới hạn (rate-limit)',
        safety_cap: 'chạm giới hạn an toàn',
        max_rounds: 'đạt số vòng tối đa',
        count_unreadable: 'không đọc được số comment',
        no_account_jwt: 'không có tài khoản Pancake',
        not_reached: 'chưa đạt mục tiêu',
    };

    async function loadJobs() {
        const pageId = $('boostPage').value;
        const jobsEl = $('boostJobs');
        if (jobsEl && !jobsEl.innerHTML.trim() && window.Web2Skeleton) {
            window.Web2Skeleton.list(jobsEl, { count: 5 });
        }
        try {
            const qs = `limit=20${pageId ? `&pageId=${encodeURIComponent(pageId)}` : ''}`;
            const r = await fetch(`${BOOST_API()}/jobs?${qs}`, { headers: authHeaders() });
            const j = await r.json();
            renderJobs(Array.isArray(j.jobs) ? j.jobs : []);
        } catch (_) {
            renderJobs([]); // dọn skeleton khi lỗi → empty-state, tránh kẹt loading
        }
    }

    function renderJobs(jobs) {
        const el = $('boostJobs');
        if (!el) return;
        if (!jobs.length) {
            el.innerHTML =
                '<div style="color:var(--mt-muted);font-size:12.5px">Chưa có job nền nào cho page này.</div>';
            return;
        }
        el.innerHTML = jobs
            .map((j) => {
                const st = JOB_STATE[j.state] || JOB_STATE.error;
                const base = Number(j.baseline_count) || 0;
                const tgt = Number(j.target_count) || 0;
                const cur = j.last_count != null ? Number(j.last_count) : base;
                const span = Math.max(1, tgt - base);
                const pct = Math.max(0, Math.min(100, ((cur - base) / span) * 100));
                const reason =
                    j.state === 'error' && j.error
                        ? ` · ${esc(STOP_REASON[j.error] || j.error)}`
                        : '';
                const active = j.state === 'pending' || j.state === 'running';
                return `
                <div class="mt-job">
                    <div class="mt-job-top">
                        <span class="mt-job-title">${esc((j.post_title || '(livestream)').slice(0, 46))}</span>
                        <span class="mt-job-badge ${st.cls}">${st.txt}${reason}</span>
                    </div>
                    <div class="mt-job-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
                    <div class="mt-job-meta">
                        <span><strong>${cur.toLocaleString('vi-VN')}</strong> / ${tgt.toLocaleString('vi-VN')} comment</span>
                        <span>+${Number(j.add_target) || 0} (gốc ${base.toLocaleString('vi-VN')})</span>
                        <span>gửi ${Number(j.sent_ok) || 0}${Number(j.sent_err) ? ` · lỗi ${j.sent_err}` : ''} · ${Number(j.rounds) || 0} vòng</span>
                        ${active ? `<button class="mt-btn danger mt-job-stop" data-id="${esc(j.id)}" style="padding:4px 11px;font-size:12px">Dừng</button>` : ''}
                    </div>
                </div>`;
            })
            .join('');
        el.querySelectorAll('.mt-job-stop').forEach((b) =>
            b.addEventListener('click', () => stopJob(b.dataset.id))
        );
    }

    async function stopJob(id) {
        if (!id) return;
        try {
            await fetch(`${BOOST_API()}/job/${encodeURIComponent(id)}/stop`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
            });
            notify('Đã yêu cầu dừng job', 'info');
            loadJobs();
        } catch (_) {
            notify('Dừng thất bại', 'error');
        }
    }

    async function runBackground() {
        const pageId = $('boostPage').value;
        const pidx = $('boostPost').value;
        const post = pidx !== '' ? _posts[Number(pidx)] : null;
        const cidx = $('boostConv').value;
        const conv = cidx !== '' ? _convs[Number(cidx)] : null;
        if (!pageId || !post || !conv) {
            notify('Chọn page + bài live + hội thoại comment trước', 'warning');
            return;
        }
        const addTarget = Math.max(1, Math.min(100000, parseInt($('boostCount').value, 10) || 0));
        const delayMs = Math.round(Math.max(1, parseFloat($('boostDelay').value) || 1) * 1000);
        const tpl = ($('boostText').value || '').trim();
        const postId = conv.post_id || post.postId || String(conv.id || '').split('_')[0] || null;
        const btn = $('boostBg');
        if (btn) btn.disabled = true;
        try {
            const r = await fetch(`${BOOST_API()}/create`, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({
                    pageId,
                    pageName: $('boostPage').selectedOptions[0]?.text || '',
                    postId,
                    convId: conv.id,
                    messageId: conv.id,
                    postTitle: post.title || '',
                    addTarget,
                    currentCount: Number(post.commentCount) || null,
                    tpl,
                    delayMs,
                }),
            });
            const j = await r.json().catch(() => ({}));
            if (j.success) {
                notify(
                    `Đã tạo job nền → mục tiêu ${Number(j.target).toLocaleString('vi-VN')} comment (gốc ${Number(j.baseline).toLocaleString('vi-VN')} + ${addTarget})`,
                    'success'
                );
                loadJobs();
            } else {
                notify('Tạo job thất bại: ' + (j.message || j.error || 'lỗi'), 'error');
            }
        } catch (e) {
            notify('Tạo job lỗi: ' + e.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    let _jobsReloadTimer = null;
    function scheduleJobsReload() {
        clearTimeout(_jobsReloadTimer);
        _jobsReloadTimer = setTimeout(loadJobs, 600);
    }

    function init() {
        if (window.Web2Sidebar?.mount) window.Web2Sidebar.mount('#web2Aside');
        wireTabs();
        $('boostReloadPost').addEventListener('click', loadPosts);
        $('boostReloadConv').addEventListener('click', loadConvs);
        $('boostRun').addEventListener('click', run);
        $('boostClean')?.addEventListener('click', cleanConv);
        $('boostStop').addEventListener('click', () => {
            _stop = true;
            $('boostStop').disabled = true;
        });
        // Gợi ý động: ms → giây (1000 = 1 giây). Tối thiểu 1s.
        const delayEl = $('boostDelay');
        const hintEl = $('boostDelayHint');
        const updateHint = () => {
            const sec = Math.max(1, parseFloat(delayEl.value) || 1);
            hintEl.textContent = `= ${Math.round(sec * 1000)} ms / comment mỗi tài khoản`;
        };
        delayEl.addEventListener('input', updateHint);
        updateHint();
        // Job chạy nền server: nút + reload theo page + SSE realtime (đóng tab vẫn chạy).
        $('boostBg')?.addEventListener('click', runBackground);
        $('boostPage').addEventListener('change', () => setTimeout(loadJobs, 300));
        if (window.Web2SSE?.subscribe)
            window.Web2SSE.subscribe('web2:comment-boost', scheduleJobsReload);
        loadPages();
        loadJobs();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
