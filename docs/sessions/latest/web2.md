# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-184025-75690ae`
**Session file**: [`./20260613-184025-75690ae.md`](../20260613-184025-75690ae.md)
**Commit**: `75690ae` — auto: session update
**Last updated**: 2026-06-13 18:40:25 +07
**Summary**: auto: session update

## Files changed in this commit (`web2/`)

- `web2/shared/chat-panel/web2-chat-panel.js`
- `web2/zalo/css/chat-composer.css`
- `web2/zalo/css/web2-zalo.css`
- `web2/zalo/index.html`

## Last 5 commits touching `web2/`

- `75690ae3e` auto: session update _(2026-06-13)_
- `29bb8688f` polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất _(2026-06-13)_
- `54a3c545c` auto: session update _(2026-06-13)_
- `13feb96f8` docs(web2-zalo): dev-log full-chat feature + build spec _(2026-06-13)_
- `58f6281f1` fix(web2-zalo): review fixes — atomic reactions JSONB (no lost update), unread gating, sendSeen idTo, composite keyset pagination, scoped global SSE, composer conv-switch guard, drop redundant conv sub + emoji search box _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-184025-75690ae` cho Claude walk chain theo CLAUDE.md protocol.
