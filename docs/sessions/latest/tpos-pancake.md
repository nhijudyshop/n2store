# Latest Snapshot — `tpos-pancake/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-185926-b1b5d7c`
**Session file**: [`./20260601-185926-b1b5d7c.md`](../20260601-185926-b1b5d7c.md)
**Commit**: `b1b5d7c` — feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS
**Last updated**: 2026-06-01 18:59:26 +07
**Summary**: feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix n...

## Files changed in this commit (`tpos-pancake/`)

- `tpos-pancake/index.html`
- `tpos-pancake/js/pancake/inventory-panel.js`

## Last 5 commits touching `tpos-pancake/`

- `b1b5d7c15` feat(tpos-pancake+native-orders): tạo đơn từ tpos-pancake → SĐT+địa chỉ từ TPOS partner cache + fix nút Lấy TPOS _(2026-06-01)_
- `242275958` fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict _(2026-06-01)_
- `206b6289a` feat(web2): decouple Web 2.0 ↔ Web 1.0/TPOS per user decisions (Phase 11 follow-up) _(2026-06-01)_
- `c4cb3e2f7` feat(web2): rollout Web2Optimistic helper toàn bộ menu — UI-first cho mọi page _(2026-06-01)_
- `77aec531a` feat(tpos-pancake): UI-first cho cart ops — toast/badge instant, backend background, rollback nếu lỗi _(2026-06-01)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-185926-b1b5d7c` cho Claude walk chain theo CLAUDE.md protocol.
