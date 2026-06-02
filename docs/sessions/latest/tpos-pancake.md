# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260602-151500-bace7b7`
**Session file**: [`./20260602-151500-bace7b7.md`](../20260602-151500-bace7b7.md)
**Commit**: `bace7b7` — auto: session update
**Last updated**: 2026-06-02 15:15:00 +07
**Summary**: auto: session update

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/pancake/pancake-api.js`
- `tpos-pancake/js/pancake/pancake-token-manager.js`

## Last 5 commits touching `tpos-pancake/`

- `bace7b744` auto: session update _(2026-06-02)_
- `bf05671c2` feat(tpos-pancake): silent snap toasts — bỏ thông báo khi snap/chụp hình _(2026-06-02)_
- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_
- `242275958` fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict _(2026-06-01)_
- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260602-151500-bace7b7` cho Claude walk chain theo CLAUDE.md protocol.
