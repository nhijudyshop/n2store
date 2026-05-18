# Latest Snapshot — `orders-report/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260518-121431-c6e4d31`
**Session file**: [`./20260518-121431-c6e4d31.md`](../20260518-121431-c6e4d31.md)
**Commit**: `c6e4d31` — refactor(web2/supplier-debt): modal → inline row expand giống legacy
**Last updated**: 2026-05-18 12:14:31 +07
**Summary**: refactor(web2/supplier-debt): modal → inline row expand giống legacy

## Files changed in this commit (`orders-report/`)

- `orders-report/js/tab1/tab1-kpi-stats-strip.js`

## Last 5 commits touching `orders-report/`

- `5c72af4f` feat(kpi-strip): SSE-only realtime — push instant trên mọi write kpi-statistics _(2026-05-18)_
- `60b49340` fix(tab1): KPI strip divergence — always-on poll 60s + cache:no-store _(2026-05-18)_
- `f9b9bf44` fix(chat): sync toggle Tin nhắn/Bình luận với conv thực tế load _(2026-05-17)_
- `932cb47d` feat(kpi-inbox): drill-down chi tiết đơn theo NV (STT, số phiếu, SL món, KPI, trạng thái) _(2026-05-17)_
- `020fe9a8` refactor(tab1): KPI strip dùng SSE kpi*base thay polling 30s *(2026-05-17)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260518-121431-c6e4d31` cho Claude walk chain theo CLAUDE.md protocol.
