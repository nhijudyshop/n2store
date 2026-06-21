# Latest Snapshot — `docs/`

> Snapshot tự động ghi đè sau mỗi commit chạm folder này. **Không edit thủ công.**
> Mục đích: khi session cũ chết (vd lỗi image limit), session mới chỉ cần đọc file này là có đủ context để tiếp tục.

**Latest session**: `RESUME:20260621-232439-261b4fb`
**Session file**: [`./20260621-232439-261b4fb.md`](../20260621-232439-261b4fb.md)
**Commit**: `261b4fb` — docs(web2) live-tv: dev-log Phase5-6 + SSE đa-instance finding + regen codemap
**Last updated**: 2026-06-21 23:24:39 +07
**Summary**: feat(web2) TV Livestream: chiến dịch gắn SP + 2 trang TV/điều khiển + số NCC báo realtime + migrate 2 fork → Web2Campaign

## Files changed in this commit (`docs/`)

- `docs/dev-log.md`
- `docs/web2/WEB2-CODEMAP.md`
- `docs/web2/web2-codemap.json`

## Last 5 commits touching `docs/`

- `261b4fb72` docs(web2) live-tv: dev-log Phase5-6 + SSE đa-instance finding + regen codemap _(2026-06-21)_
- `ade9d1920` feat(web2) live-tv Phase2-4,7: Web2Campaign + Web2VariantGroup shared + 2 trang TV + menu _(2026-06-21)_
- `e3427f4b1` feat(web2) live-tv Phase1: backend web2*campaign_products + route + SSE web2:campaign-products *(2026-06-21)\_
- `66913cc5f` chore(session): RESUME:20260621-212530-f91e1da _(2026-06-21)_
- `f91e1da63` docs(dev-log): hệ KPI verified live đa-user (mask pill + scope 401/403/self) + web2 session tooling _(2026-06-21)_

---

**Để tiếp tục context trong session mới:**

1. Đọc file session ở trên để xem Files Modified + Next Steps đã điền (nếu Claude turn trước fill rồi).
2. Cần lùi xa hơn → `git show <sha>` theo list commit trên.
3. Hoặc paste token `RESUME:20260621-232439-261b4fb` cho Claude walk chain theo CLAUDE.md protocol.
