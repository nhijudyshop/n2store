# Latest Snapshot — `so-order/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260630-212328-cd16139`
**Session file**: [`./20260630-212328-cd16139.md`](../20260630-212328-cd16139.md)
**Commit**: `cd16139` — fix(web2 audit vòng4): CRITICAL so-order mất data partial_received + nhãn confirm; doc 92-agent audit
**Last updated**: 2026-06-30 21:23:28 +07
**Summary**: Audit sâu 6 trang lõi (92 agent): fix CRITICAL so-order mất data partial_received + nhãn confirm; doc vòng 4 (4 HIGH backend chờ greenlight)

## Files changed in this commit (`so-order/`)

- `so-order/js/so-order-modal-submit.js`

## Last 5 commits touching `so-order/`

- `cd1613916` fix(web2 audit vòng4): CRITICAL so-order mất data partial*received + nhãn confirm; doc 92-agent audit *(2026-06-30)\_
- `85f9fe063` refactor(web2 util): gộp money(11)→Web2Format.vnd + escape(76)→Web2Escape.escapeHtml (delegate-with-fallback); date đã-delegate, phone hoãn _(2026-06-30)_
- `c23125cd9` auto: session update _(2026-06-30)_
- `7d5d7b24e` feat(so-order): surface 'chờ hàng cần đặt' (giỏ nháp > tồn) → nút Cần đặt + thêm vào đơn [#2 follow-up] _(2026-06-30)_
- `5050372a0` feat(unit-scan): GỘP sort-station → "Quét tem" 2 chế độ + sơ đồ kệ vật lý + nhãn ô + fix overlay _(2026-06-29)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260630-212328-cd16139` cho Claude walk chain theo CLAUDE.md protocol.
