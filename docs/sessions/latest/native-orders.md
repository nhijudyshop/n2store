# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260629-110513-968eadd`
**Session file**: [`./20260629-110513-968eadd.md`](../20260629-110513-968eadd.md)
**Commit**: `968eadd` — feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens)
**Last updated**: 2026-06-29 11:05:13 +07
**Summary**: feat(goods-weight): rebuild MOBILE-NATIVE theo unit-scan (no sidebar, PWA, safe-area, Zalo tokens)

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `8c1a9c556` feat(goods-weight): trang Cân Nặng Hàng ⚖️ — hàng về kiện cân + ảnh BYTEA + SSE web2:goods-weight _(2026-06-29)_
- `b5afc142f` fix(web2/ai-assistant): lỗi provider chứa "token" bị nhầm là phiên hết hạn → đăng xuất oan _(2026-06-29)_
- `da9564b40` auto: session update _(2026-06-29)_
- `429c09caa` feat(native-orders): badge "⚠ thiếu N tem" khi đơn gán 1 phần (serial < SL) _(2026-06-29)_
- `f789f1642` feat(supplier-debt,native-orders): gate admin TT NCC + hiện mã đơn vị "-xxx" trong đơn _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260629-110513-968eadd` cho Claude walk chain theo CLAUDE.md protocol.
