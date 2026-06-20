# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-064534-a6fa763`
**Session file**: [`./20260621-064534-a6fa763.md`](../20260621-064534-a6fa763.md)
**Commit**: `a6fa763` — docs(dev-log): audit Web 2.0 25 bug fix (r1a-r1f)
**Last updated**: 2026-06-21 06:45:34 +07
**Summary**: audit Web 2.0 full-surface: fix 25/27 bug (auth/sse-leak/anti-lag/click-path/zalo/pancake)

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customer-wallet.js`
- `render.com/routes/web2-generic.js`
- `render.com/routes/web2-live-comments.js`
- `render.com/routes/web2-zalo.js`
- `render.com/services/web2-zalo-zca.js`

## Last 5 commits touching `render.com/`

- `f54f82920` fix(web2) audit-r1b: capture-lock auth + zalo boot expectedUid + zalo conv isolation _(2026-06-20)_
- `341141081` fix(web2) audit-r1a: QR-write auth + live-comments seq/N+1 + relay 401 log + so-order conflict timer _(2026-06-20)_
- `40c30af34` perf: trigram GIN index web2*balance_history.content (ILIKE substring dùng index thay seq scan) *(2026-06-20)\_
- `9af3a0c68` fix(O3): bỏ poller fetch comment -> WS-live nguồn duy nhất (hết dòng trùng postId*mid vs convId_seq) *(2026-06-20)\_
- `f81bac13c` perf(web2-returns): _applyStock batch 1 UPDATE thay N+1 (gom theo code, sign đồng nhất nên kết quả y hệt) _(2026-06-20)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-064534-a6fa763` cho Claude walk chain theo CLAUDE.md protocol.
