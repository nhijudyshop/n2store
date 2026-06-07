# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260607-102541-34d580a`
**Session file**: [`./20260607-102541-34d580a.md`](../20260607-102541-34d580a.md)
**Commit**: `34d580a` — fix(so-order): nhận hàng in tem QR 2-tem theo SL nhận (bump print script version)
**Last updated**: 2026-06-07 10:25:41 +07
**Summary**: fix(so-order): nhận hàng in tem QR 2-tem theo SL nhận (bump print script version)

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`

## Last 5 commits touching `docs/`

- `34d580a1c` fix(so-order): nhận hàng in tem QR 2-tem theo SL nhận (bump print script version) _(2026-06-07)_
- `a336a5281` chore(session): RESUME:20260607-101635-11c39b5 _(2026-06-07)_
- `11c39b555` docs(dev-log): tem QR tự thu nhỏ font mã dài _(2026-06-07)_
- `d335324ff` chore(session): RESUME:20260607-100839-a059d2b _(2026-06-07)_
- `a059d2b82` feat(web2-products-print): tem QR layout QR-trái + tên/mã/giá-phải (mọi con tem) _(2026-06-06)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260607-102541-34d580a` cho Claude walk chain theo CLAUDE.md protocol.
