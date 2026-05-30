# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260530-165621-26defed`
**Session file**: [`./20260530-165621-26defed.md`](../20260530-165621-26defed.md)
**Commit**: `26defed` — feat(web2-customer-wallet): tab QR VietQR — generate + display QR cho từng KH
**Last updated**: 2026-05-30 16:56:21 +07
**Summary**: feat(web2-customer-wallet): tab QR VietQR — generate + display QR cho từng KH

## Files changed in this commit (`render.com/`)

- `render.com/routes/v2/web2-customer-wallet.js`

## Last 5 commits touching `render.com/`

- `26defed21` feat(web2-customer-wallet): tab QR VietQR — generate + display QR cho từng KH _(2026-05-30)_
- `aafd1afa5` feat(web2-balance-history): self-contained matcher + persistent QR registry _(2026-05-30)_
- `2b902700c` fix(web2-balance-history): count legacy*credited là matched trong reprocess stats *(2026-05-30)\_
- `8de100921` fix(web2-balance-history): expand match*method CHECK constraint cho Web 2.0 values *(2026-05-30)\_
- `7eae1a7a4` fix(web2-balance-history): backfill display*name từ TPOS trong legacy migration path *(2026-05-30)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260530-165621-26defed` cho Claude walk chain theo CLAUDE.md protocol.
