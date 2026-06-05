# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-120724-397deda`
**Session file**: [`./20260605-120724-397deda.md`](../20260605-120724-397deda.md)
**Commit**: `397deda` — feat(web2 bill): don ban tai shop ghi tieu de 'PBH SHOP' (thay 'Phieu Ban Hang (SHOP)') + sub 'BAN TAI SHOP'
**Last updated**: 2026-06-05 12:07:24 +07
**Summary**: feat(web2 bill): don ban tai shop ghi tieu de 'PBH SHOP' (thay 'Phieu Ban Hang (SHOP)') + sub 'BAN TAI SHOP'

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `397deda52` feat(web2 bill): don ban tai shop ghi tieu de 'PBH SHOP' (thay 'Phieu Ban Hang (SHOP)') + sub 'BAN TAI SHOP' _(2026-06-05)_
- `e48a7e7cf` fix(web2-msg-send): mount /api/web2/msg-send (CF worker forward /api/web2/\*) thay /api/web2-msg-send (chua trong allowlist -> roi ve TPOS 404) _(2026-06-05)_
- `a6f0e3e7d` feat(native-orders): gửi tin nhắn template qua JOB server-side đa-account Pancake + extension fallback (refresh-safe, SSE progress) _(2026-06-05)_
- `b6c9360b3` auto: session update _(2026-06-05)_
- `17f8f4cf0` feat(web2 bill): SP hang 1 = ten day du, hang 2 = SL/DON GIA/T.TIEN canh cot duoi header _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-120724-397deda` cho Claude walk chain theo CLAUDE.md protocol.
