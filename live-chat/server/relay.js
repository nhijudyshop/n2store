// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// REALTIME FORWARD → web2-api (SSE pub/sub Web 2.0). FALLBACK_BASE env trỏ web2-api sau tách 2026-06-14 (tên giữ lịch sử).
// Relay nhận event Pancake WS → forward sang fallback để:
//   • livestream comment → /api/web2-live-comments/ingest (ghi DB + SSE web2:live-comments)
//   • inbox conversation/message → /api/realtime/web2/sse/relay-notify (SSE web2:messages)
// Fire-and-forget; lỗi forward KHÔNG được làm vỡ relay WS.
// =====================================================

// Side-effect-free: factory returns a forwardToFallback closure bound to base+secret.
// The entry constructs this; requiring the module does NOT call fetch.
function createRelay({ base, secret }) {
    function forwardToFallback(path, body) {
        // Node 18+ có global fetch (file đã dùng fetch cho discoverPageIds).
        // 1 retry sau 2s: fallback restart/cold-start làm rớt forward = comment
        // KHÔNG realtime (audit vòng 3 — loss point A1). Vẫn fire-and-forget với
        // relay WS; chỉ thêm 1 nhịp thử lại, không queue dài (poll-now warm-up
        // client bù phần mất lâu hơn).
        const doPost = () =>
            fetch(base + path, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-relay-secret': secret },
                body: JSON.stringify(body),
            }).then((r) => {
                if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
                return r;
            });
        try {
            doPost().catch((e1) => {
                setTimeout(() => {
                    doPost().catch((e2) =>
                        console.warn('[FORWARD] fail (sau retry):', e1.message, '|', e2.message)
                    );
                }, 2000);
            });
        } catch (e) {
            console.warn('[FORWARD] fail:', e.message);
        }
    }

    return { forwardToFallback };
}

module.exports = { createRelay };
