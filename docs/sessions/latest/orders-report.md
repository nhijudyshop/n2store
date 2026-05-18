# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-113835-6f055e4`
**Session file**: [`./20260518-113835-6f055e4.md`](../20260518-113835-6f055e4.md)
**Commit**: `6f055e4` — fix(web2): broken paths sau khi move web2-products/web2-variants vào web2/
**Last updated**: 2026-05-18 11:38:35 +07
**Summary**: fix(web2): broken paths sau khi move web2-products/web2-variants vào web2/

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab1/tab1-kpi-stats-strip.js`

## Last 5 commits touching `orders-report/`

- `60b49340` fix(tab1): KPI strip divergence — always-on poll 60s + cache:no-store _(2026-05-18)_
- `f9b9bf44` fix(chat): sync toggle Tin nhắn/Bình luận với conv thực tế load _(2026-05-17)_
- `932cb47d` feat(kpi-inbox): drill-down chi tiết đơn theo NV (STT, số phiếu, SL món, KPI, trạng thái) _(2026-05-17)_
- `020fe9a8` refactor(tab1): KPI strip dùng SSE kpi*base thay polling 30s *(2026-05-17)\_
- `ff149df6` feat(tab1): toast realtime cho KPI strip — sale + TOP SALE _(2026-05-17)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-113835-6f055e4` cho Claude walk chain theo CLAUDE.md protocol.
