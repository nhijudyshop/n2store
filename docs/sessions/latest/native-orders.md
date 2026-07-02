# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260702-092027-441e548`
**Session file**: [`./20260702-092027-441e548.md`](../20260702-092027-441e548.md)
**Commit**: `441e548` — refactor(web2-shared): dedup worker-base — config-first 5 file primary-literal (re-scope group)
**Last updated**: 2026-07-02 09:20:27 +07
**Summary**: refactor(web2-shared): dedup worker-base — config-first 5 file primary-literal (re-scope group)

## Files changed in this commit (`native-orders/`)

- `native-orders/js/native-orders-api.js`

## Last 5 commits touching `native-orders/`

- `4a9b59257` refactor(web2-shared): dedup fetch-json → delegate Web2ApiFetch.json (6 wrapper) _(2026-07-02)_
- `440ad6852` refactor(web2-shared): dedup pagination → Web2Pagination (3 file canonical migrated) _(2026-07-01)_
- `33bc3d7ed` refactor(live-chat): gộp 1 nguồn chiến dịch — live-chat CHỈ XEM, tạo/quản lý ở campaign-manager _(2026-07-01)_
- `f5884aebb` feat(native-orders): gom 2 dropdown chiến dịch → 1 Web2CampaignPicker + fix M8/M9 _(2026-07-01)_
- `c02606bcc` feat(native-orders bill): in KHUNG 'THU LẠI TỪ KHÁCH' cho shipper trên bill PBH _(2026-07-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260702-092027-441e548` cho Claude walk chain theo CLAUDE.md protocol.
