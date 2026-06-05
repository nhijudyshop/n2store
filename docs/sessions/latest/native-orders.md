# Latest Snapshot — `native-orders/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260605-153422-d556ecb`
**Session file**: [`./20260605-153422-d556ecb.md`](../20260605-153422-d556ecb.md)
**Commit**: `d556ecb` — auto: session update
**Last updated**: 2026-06-05 15:34:22 +07
**Summary**: auto: session update

## Files changed in this commit (`native-orders/`)

- `native-orders/index.html`
- `native-orders/js/native-orders-api.js`
- `native-orders/js/native-orders-app.js`
- `native-orders/js/native-orders-packing-slip.js`

## Last 5 commits touching `native-orders/`

- `001b22382` feat(web2 print-count Phase2): ghi so lan in - don (native*orders.print_count) khi in bill/soan hang + SP (web2_products.print_count) khi in tem -> badge 'Da in Nx' tranh in trung. Endpoints /mark-printed (native + products) *(2026-06-05)\_
- `474fba13f` fix(native-orders): In bill don MIX trang thai -> moi don in dung loai: draft=Phieu Soan Hang (tuan tu), confirmed=bill PBH (gop). onClose chain mo soan hang tung don roi in PBH _(2026-06-05)_
- `4a24b562f` auto: session update _(2026-06-05)_
- `3de04fad7` auto: session update _(2026-06-05)_
- `c751cf9fa` fix(web2 bill): tat ca bill in ten nguoi ban = user dang dang nhap (Web2UserInfo.get().userName), fallback NV gan don _(2026-06-05)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260605-153422-d556ecb` cho Claude walk chain theo CLAUDE.md protocol.
