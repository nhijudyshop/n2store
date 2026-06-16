# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260616-102546-6aaa49f`
**Session file**: [`./20260616-102546-6aaa49f.md`](../20260616-102546-6aaa49f.md)
**Commit**: `6aaa49f` — feat(web2-realtime): proxy-only — bỏ direct WS pancake.vn (hết log đỏ 1006)
**Last updated**: 2026-06-16 10:25:46 +07
**Summary**: feat(web2-realtime): proxy-only — bỏ direct WS pancake.vn (hết log đỏ 1006)

## Files changed in this commit (`web2/`)

- `web2/shared/web2-realtime.js`

## Last 5 commits touching `web2/`

- `6aaa49f8f` feat(web2-realtime): proxy-only — bỏ direct WS pancake.vn (hết log đỏ 1006) _(2026-06-16)_
- `8b0a8cec4` docs(web2-realtime): sửa comment stale n2store-realtime → web2-realtime (broker đã fold) _(2026-06-16)_
- `50ee3cad5` feat(web2-realtime): Stage 2 — repoint Web2Realtime → web2-realtime + unread fetch Pancake trực tiếp (0 Web 1.0) _(2026-06-16)_
- `845fe3649` fix(web2): icon columns-3→columns (Lucide 0.294.0) + revert WS proxy về broker n2store-realtime _(2026-06-16)_
- `debda8b0a` fix(web2): trỏ đúng project Render web2.0n2store — relay → web2-realtime, xóa pbh-realtime dead _(2026-06-15)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260616-102546-6aaa49f` cho Claude walk chain theo CLAUDE.md protocol.
