# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-063217-7e1bfdb`
**Session file**: [`./20260626-063217-7e1bfdb.md`](../20260626-063217-7e1bfdb.md)
**Commit**: `7e1bfdb` — feat(chat): nút 📍 thủ công trên tin KH để thêm địa chỉ vào đơn (fallback auto-detect)
**Last updated**: 2026-06-26 06:32:17 +07
**Summary**: Chat: nút thủ công 📍 thêm địa chỉ/SĐT tin KH vào đơn (fallback auto-detect); verify Playwright MCP

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`

## Last 5 commits touching `native-orders/`

- `7e1bfdb5b` feat(chat): nút 📍 thủ công trên tin KH để thêm địa chỉ vào đơn (fallback auto-detect) _(2026-06-26)_
- `a3b88678e` feat(native-orders/chat): tự nhận diện địa chỉ + nút "Thêm vào đơn" (Feature 3) _(2026-06-26)_
- `a75e147fd` feat(web2/customer-chat): realtime như live-chat — subscribe SSE web2:messages _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_
- `eeaa6024a` auto: session update _(2026-06-25)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-063217-7e1bfdb` cho Claude walk chain theo CLAUDE.md protocol.
