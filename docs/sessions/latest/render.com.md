# Latest Snapshot — `render.com/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-162328-66f79ae`
**Session file**: [`./20260626-162328-66f79ae.md`](../20260626-162328-66f79ae.md)
**Commit**: `66f79ae` — docs: flow audit 12/12 FIXED + dev-log (money/stock fixes verified integration test)
**Last updated**: 2026-06-26 16:23:28 +07
**Summary**: Fix toàn bộ 12 bug audit luồng web2: report merge/refunds KPI, nhận hàng NCC, KNH/native restock, ví NCC cap qty/cost/returned_row_ids — verify integration test Postgres thật (24 assertions)

## Files changed in this commit (`render.com/`)

- `render.com/lib/web2-so-order-qty.js`
- `render.com/routes/purchase-refund.js`
- `render.com/routes/web2-returns.js`

## Last 5 commits touching `render.com/`

- `198e5305d` fix(purchase-refund): cap trả NCC theo SL nhận + cost + ghi returned*row_ids (#3/#4/#5) *(2026-06-26)\_
- `6b14a5faa` fix(web2-returns): KNH net-restock (#2/#7) + native partial returned*line_qty (#6) *(2026-06-26)\_
- `52f5e4b5a` fix(web2 flow): nhận hàng đúng NCC (#1/#8) + hủy PBH restock per-code (#9) + audit doc _(2026-06-26)_
- `5cd56593b` fix(web2 reports): warehouse buy↔sell merge theo mã + revenue refunds KPI đọc web2*returns *(2026-06-26)\_
- `9b51f2d72` chore(web2): SUP*SEP dùng escape '\u0000' thay NUL byte (file binary → text, grep/diff lại được) *(2026-06-26)\_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-162328-66f79ae` cho Claude walk chain theo CLAUDE.md protocol.
