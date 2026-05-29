# Latest Snapshot — `scripts/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260529-150356-c194f52`
**Session file**: [`./20260529-150356-c194f52.md`](../20260529-150356-c194f52.md)
**Commit**: `c194f52` — feat(so-order): test data scripts — 5 NCC × 20 SP × demo images cho 29/05/2026
**Last updated**: 2026-05-29 15:03:56 +07
**Summary**: feat(so-order): test data scripts — 5 NCC × 20 SP × demo images cho 29/05/2026

## Files changed in this commit (`scripts/`)

- `scripts/so-order-test-data-cleanup.js`
- `scripts/so-order-test-data-create.js`
- `scripts/so-order-test-data-load.sh`

## Last 5 commits touching `scripts/`

- `c194f5218` feat(so-order): test data scripts — 5 NCC × 20 SP × demo images cho 29/05/2026 _(2026-05-29)_
- `e617e3a53` feat(inventory-tracking): SSE realtime auto-refresh + grant bobo CP perms _(2026-05-29)_
- `eef32e0fb` feat(n2store-extension): add localhost matches — auto-snap chạy được trên dev _(2026-05-26)_
- `d1d3d7ea9` fix(delivery-report/report): 3 bug merge row - duyet click + sum children + note _(2026-05-26)_
- `ec5e4c149` auto: session update _(2026-05-26)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260529-150356-c194f52` cho Claude walk chain theo CLAUDE.md protocol.
