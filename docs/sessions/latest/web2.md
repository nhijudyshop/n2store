# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260613-183758-29bb868`
**Session file**: [`./20260613-183758-29bb868.md`](../20260613-183758-29bb868.md)
**Commit**: `29bb868` — polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất
**Last updated**: 2026-06-13 18:37:58 +07
**Summary**: polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất

## Files changed in this commit (`web2/`)

- `web2/shared/web2-theme.css`

## Last 5 commits touching `web2/`

- `29bb8688f` polish(web2): ẩn source-pill (tên bảng DB kỹ thuật) khỏi UI sản xuất _(2026-06-13)_
- `54a3c545c` auto: session update _(2026-06-13)_
- `13feb96f8` docs(web2-zalo): dev-log full-chat feature + build spec _(2026-06-13)_
- `58f6281f1` fix(web2-zalo): review fixes — atomic reactions JSONB (no lost update), unread gating, sendSeen idTo, composite keyset pagination, scoped global SSE, composer conv-switch guard, drop redundant conv sub + emoji search box _(2026-06-13)_
- `8ab8a90be` feat(web2-zalo): full Zalo-like chat UI — composer (ảnh/file/emoji/sticker/reply/quick), bubbles (gom nhóm/vạch ngày/reaction/recall/lưới ảnh/ticks), lightbox, realtime typing/seen, load-older _(2026-06-13)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260613-183758-29bb868` cho Claude walk chain theo CLAUDE.md protocol.
