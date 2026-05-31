# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260531-141234-83f9046`
**Session file**: [`./20260531-141234-83f9046.md`](../20260531-141234-83f9046.md)
**Commit**: `83f9046` — docs(plans): KPI plan v2 — campaign-scoped + beneficiary-based + STT visibility
**Last updated**: 2026-05-31 14:12:34 +07
**Summary**: docs(plans): KPI plan v2 — campaign-scoped + beneficiary-based + STT visibility

## Files changed in this commit (`scripts/`)

- `scripts/backup-inventory-tracking.js`

## Last 5 commits touching `scripts/`

- `bbd9d4315` chore(inventory-tracking): script backup dữ liệu qua API, đặt tên theo ngày-giờ _(2026-05-31)_
- `aa7227a81` feat(scripts): pancake livestream comment-count booster _(2026-05-29)_
- `741ac9218` auto: session update _(2026-05-29)_
- `c194f5218` feat(so-order): test data scripts — 5 NCC × 20 SP × demo images cho 29/05/2026 _(2026-05-29)_
- `e617e3a53` feat(inventory-tracking): SSE realtime auto-refresh + grant bobo CP perms _(2026-05-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260531-141234-83f9046` cho Claude walk chain theo CLAUDE.md protocol.
