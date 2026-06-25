# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260626-061005-a3b8867`
**Session file**: [`./20260626-061005-a3b8867.md`](../20260626-061005-a3b8867.md)
**Commit**: `a3b8867` — feat(native-orders/chat): tự nhận diện địa chỉ + nút "Thêm vào đơn" (Feature 3)
**Last updated**: 2026-06-26 06:10:05 +07
**Summary**: Chat Pancake tự nhận diện địa chỉ (khối FB nhiều dòng) + nút Thêm vào đơn; verify Playwright MCP

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-interactions.js`

## Last 5 commits touching `native-orders/`

- `a3b88678e` feat(native-orders/chat): tự nhận diện địa chỉ + nút "Thêm vào đơn" (Feature 3) _(2026-06-26)_
- `a75e147fd` feat(web2/customer-chat): realtime như live-chat — subscribe SSE web2:messages _(2026-06-25)_
- `28cf5a5f2` fix(web2): quét 107 file — 18 nhãn native-cart sót → Giỏ hàng (audit vòng 4) _(2026-06-25)_
- `eeaa6024a` auto: session update _(2026-06-25)_
- `2ecbdb807` fix(web2): 5 money/stock conservation bugs from adversarial workflow audit _(2026-06-24)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260626-061005-a3b8867` cho Claude walk chain theo CLAUDE.md protocol.
