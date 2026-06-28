# Latest Snapshot — `web2/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260628-124650-20c99cb`
**Session file**: [`./20260628-124650-20c99cb.md`](../20260628-124650-20c99cb.md)
**Commit**: `20c99cb` — feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn
**Last updated**: 2026-06-28 12:46:50 +07
**Summary**: feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn

## Files changed in this commit (`web2/`)

- `web2/system/index.html`
- `web2/system/js/system-services.js`

## Last 5 commits touching `web2/`

- `20c99cbbd` feat(sepay-invoices): push snapshot từ máy IP nhà + link trực tiếp khi Cloudflare chặn _(2026-06-28)_
- `267709da5` feat(web2/system): theo dõi hóa đơn SePay + QR thanh toán (creds Render env) _(2026-06-28)_
- `41a7afca0` fix(web2/system): DB disk limit 1GB→15GB (Render API diskSizeGB=15) _(2026-06-28)_
- `d81cac8d7` feat(ai-widget/live-chat): bỏ nút comment DB + 'SP nhiều giỏ nhất' dùng số liệu giỏ Web 2.0 _(2026-06-28)_
- `c4da6cce1` fix(web2): HET*HANG review-fixes — preserve manual pause + parent badge + refund paths *(2026-06-28)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260628-124650-20c99cb` cho Claude walk chain theo CLAUDE.md protocol.
