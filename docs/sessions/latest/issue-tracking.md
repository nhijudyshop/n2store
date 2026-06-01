# Latest Snapshot — `issue-tracking/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260601-184527-2422759`
**Session file**: [`./20260601-184527-2422759.md`](../20260601-184527-2422759.md)
**Commit**: `2422759` — fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict
**Last updated**: 2026-06-01 18:45:27 +07
**Summary**: fix(tpos-pancake): bump partnerCache maxSize 200→2000 — không hiện SĐT/địa chỉ KH do LRU evict

## Files changed in this commit (`issue-tracking/`)

- `issue-tracking/index.html`
- `issue-tracking/js/script.js`

## Last 5 commits touching `issue-tracking/`

- `397da92e5` feat(virtual-credit): hạn cấp công nợ ảo 15 → 30 ngày (chỉ phiếu mới) + finalize refund per-line discount _(2026-06-01)_
- `bac281d4c` feat(issue-tracking): nút Ẩn hiện cột — default ẩn Kênh (BÁN HÀNG) + Kênh & PBH gốc (TRẢ HÀNG) _(2026-05-26)_
- `06828cd7d` auto: session update _(2026-05-26)_
- `b73add055` feat(issue-tracking): bỏ icon ở cột trạng thái BÁN HÀNG + TRẢ HÀNG _(2026-05-26)_
- `2ecd69c9b` feat(issue-tracking): In bill cho BÁN HÀNG + TRẢ HÀNG (TPOS template 80mm) _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260601-184527-2422759` cho Claude walk chain theo CLAUDE.md protocol.
