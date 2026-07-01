<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 audit doc. -->

# Audit Hệ thống Chiến dịch Livestream — 2026-07-01

> Sinh từ workflow audit đa-agent (7 map + 8 dimension × 2 verifier + critic + synth, 87 agents). 32 phát hiện đã xác nhận (≥1 verifier độc lập), 3 refuted, 8 vùng chưa phủ.

## Trạng thái sửa (2026-07-01)

| #   | Mức  | Phát hiện                                                                                                    | Trạng thái                                                                                                                 |
| --- | ---- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| H1  | HIGH | Session gate join sai cột `live_campaign_id` → `fb_post_id` (web2-campaign-products.js GET / + /cart-detail) | ✅ ĐÃ SỬA — dùng `n.fb_post_id`, khớp native-orders parent filter                                                          |
| H2  | HIGH | TV không hiện lại SP hết-rồi-nhập-lại (state.codes lọc mất event)                                            | ✅ ĐÃ SỬA — thêm `state.allCodes` (tập thành viên đầy đủ) cho relevance SSE                                                |
| H3  | HIGH | Mutation chiến dịch không kiểm quyền theo hành động                                                          | ⏳ CHỜ QUYẾT — `requireWeb2Permission` fail-closed, cần xác nhận role-grant trước khi wire (tránh khóa operator đang live) |
| H4  | HIGH | `campaign_stt` group-key bất đồng giữa from-comment (name-group) vs merge (id)                               | ⏳ CHỜ QUYẾT — chọn semantics số kệ canonical + re-run backfill prod                                                       |

Các mục MEDIUM/LOW: xem mục 3 bên dưới (chưa sửa).

---

# Báo cáo Audit — Hệ thống Chiến dịch Livestream (Web 2.0 N2Store)

## 1. Tổng quan

Hệ thống chiến dịch livestream Web 2.0 xoay quanh **3 định danh (identity) tách rời** cần được ghép lại đúng cách để mọi số liệu trên màn hình bán hàng lên đúng: **(a)** `web2_live_parent_campaigns` (chiến dịch cha do người dùng tạo ở live-chat), **(b)** bài viết FB được gán vào chiến dịch qua `web2_live_post_assign.post_id` (= `Facebook_LiveId`), và **(c)** đơn hàng gắn chiến dịch qua `native_orders.live_campaign_id` / `campaign_stt`. Chất keo nối ba định danh này (session gate scope GIỎ/MỚI, `campaign_stt` shelf-numbering, và các bảng board `web2_campaign_products` / `web2_live_tv_control`) là nơi tập trung **hầu hết lỗi nghiêm trọng**.

Sức khỏe tổng thể: **trung bình, có rủi ro tiềm ẩn cao**. Luồng chính (tạo → gán bài → gán SP → lên board → TV realtime) hoạt động **hôm nay chỉ nhờ một invariant tình cờ** (`campaignObj.Id === Facebook_LiveId` do `_postToCampaign` set cả hai bằng `String(p.id)`), không phải nhờ thiết kế. Ba nhóm vấn đề đè lên nhau và cần fix gốc: **(1)** session gate join sai cột (chỉ đúng nhờ aliasing), **(2)** DELETE chiến dịch không transactional + không cascade → board mồ côi tự lật gate về GLOBAL, **(3)** `campaign_stt` được đánh số theo hai scope khác nhau giữa các insert path → trùng số kệ/KPI dưới concurrency. Cộng thêm một lỗ hổng access-control (mọi tài khoản đăng nhập, kể cả viewer, ghi được `web2_products` bất kỳ mã nào) và một feature (CHO VƯỢT/region) đã chết hoàn toàn nhưng vẫn broadcast.

## 2. Kiến trúc chiến dịch

```
[TẠO]  live-chat: Web2Campaign.createCampaign
         → web2_live_parent_campaigns (id, name)               live-campaign-manager.js:234

[GÁN BÀI]  assignPost(campaignObj.Facebook_LiveId)
             → web2_live_post_assign (post_id = FB post id, campaign_id)   live-comments.js:810-834
             + web2_live_post_titles (title upsert)                        live-comments.js:638-666

[GÁN SP]  POST /  (live-control, sync=1)
             → web2_campaign_products (campaign_id, product_code, sort, removed)
             + autoSyncPending kéo web2_products CHO_MUA & pending>0        campaign-products.js:199-264

[ĐƠN ↔ CHIẾN DỊCH]  order creation
             from-comment / merge → native_orders.live_campaign_id = camp.Id
                                     native_orders.fb_post_id      = camp.Facebook_LiveId
                                     native_orders.campaign_stt    (MAX+1 dưới advisory lock)
             live-comment-list-orders.js:34-35, native-orders.js:1043-1121, 2860-2878

[SESSION GATE]  GET / + /cart-detail: đếm GIỎ/MỚI scope theo bài đã gán
             NOT EXISTS(post_assign campaign_id) → GLOBAL
             OR n.live_campaign_id IN (post_assign.post_id)   ← JOIN SAI CỘT
             campaign-products.js:324-329, 662-669

[TV BOARD + REALTIME]  live-tv (viewer, read-only) + live-control (operator, sync=1)
             render qua Web2LiveTvDisplay (paginate/cardState/khConModel)
             SSE web2:campaign-products / web2:products / web2:native-orders / web2:live-tv-control
             web2/live-tv/js/live-tv.js, web2/live-control/js/live-control.js
```

Điểm mấu chốt cần nhớ: **hai consumer của cùng một tập bài-gán lại join vào hai cột `native_orders` khác nhau** — native-orders parent filter dùng `fb_post_id` (đúng), còn session gate dùng `live_campaign_id` (sai) — chúng chỉ khớp nhau nhờ aliasing tình cờ.

---

## 3. Phát hiện theo mức độ

### CRITICAL

Không có phát hiện nào ở mức CRITICAL trong tập đã xác nhận. Các lỗi HIGH dưới đây đều là latent/silent (không crash, không lỗi hiển thị) nên chưa lên CRITICAL, nhưng D5-no-action-perm và D1-gate-wrong-column có blast radius rộng nhất.

### HIGH

**H1 — Session gate join sai cột `live_campaign_id` thay vì `fb_post_id`**
`render.com/routes/web2-campaign-products.js:324-329` (GET /) và `:662-669` (/cart-detail)
_(gộp D1-gate-wrong-column + D3-gate-glue-relies-on-Id-equals-LiveId — cùng một lỗi gốc)_

Gate scope GIỎ/MỚI join `native_orders.live_campaign_id IN (SELECT post_id FROM web2_live_post_assign WHERE campaign_id=$2)`. Nhưng `post_assign.post_id` lưu **FB post id** (`Facebook_LiveId`), còn `live_campaign_id` lưu **Pancake campaign Id** (`camp.Id`) — hai field khác nhau của cùng object (order creation: `liveCampaignId = camp.Id`, `fbPostId = camp.Facebook_LiveId` tại `live-comment-list-orders.js:34-35`, `pancake/inventory-panel-state.js:250-251`). Hôm nay khớp **chỉ vì** `_postToCampaign` set cả `Id` lẫn `Facebook_LiveId` = `String(p.id)` (`live-source.js:162,165`). Cột đúng là `native_orders.fb_post_id` — chính là cột native-orders tự dùng (`fb_post_id = ANY(...)`, `native-orders.js:1868`). Comment tại `:311` khẳng định `live_campaign_id = FB post id` là **sai** — đã verify tại chỗ: comment ghi vậy nhưng query dùng `live_campaign_id`.

- **Impact:** Bất kỳ campaign object nào tới order-creation mà `Id ≠ Facebook_LiveId` (nguồn fetch khác, campaign nguồn TPOS, hoặc migration) → gate `live_campaign_id IN (Facebook_LiveIds)` trả **0 match** ngay khi đã gán bài → mọi tile board và cart popup của chiến dịch đó hiện GIỎ/MỚI = 0, **không lỗi**. Con số người bán dựa vào khi live biến mất không dấu vết.
- **Đề xuất:** Đổi cả hai chỗ (GET / aggregate và /cart-detail gate) sang match `n.fb_post_id IN (SELECT post_id FROM web2_live_post_assign WHERE campaign_id=$2)`, giống hệt `native-orders.js:1868`, để hai consumer dùng chung một cột join đúng. Sửa comment sai tại `:311`. Thêm log/assert khi một `live_campaign_id` có 0 bài-gán khớp cho campaign đã assign.

**H2 — TV không hiện lại SP đã hết-rồi-nhập-lại: event `web2:products` bị `state.codes` lọc mất**
`web2/live-tv/js/live-tv.js:191-198, 266-271`

Đã verify: `state.codes` được build từ danh sách **đã lọc** (`items.filter(it => !it.missing && it.isActive !== false)` tại `:191-193`, TRƯỚC khi populate `state.codes` tại `:194-198`). Handler `web2:products` (`:266-271`) chỉ reload khi mã bị chạm nằm trong `state.codes`: `if (!touched.length || touched.some((c) => state.codes.has(c))) scheduleReload();`. Hệ quả: SP bán hết trong live (`isActive=false` → ẩn trên TV → **không** vào `state.codes`) rồi nhập lại kho (`web2-products` fire `_notify('update', code)`) → `state.codes.has(code)` = false → **không** `scheduleReload()` → SP đã có hàng vẫn vô hình trên TV cho tới khi có event khác hoặc refresh tay. `live-control` **không** dính (handler `web2:products` là `scheduleBoard()` vô điều kiện, `live-control.js:870-872`) → board operator tự lành nhưng TV người xem thì không.

- **Impact:** Trên màn TV phát sóng, SP hết-rồi-nhập-lại (chính là luồng bán live cốt lõi: bán hết → hàng về → lên kệ lại) vẫn bị ẩn realtime → mất đơn / hiển thị sai tồn.
- **Đề xuất:** Giữ tập **đầy đủ** mã SP của campaign (trước filter `isActive/missing`) trong một set riêng chỉ dùng cho relevance check, HOẶC bỏ hẳn code filter và luôn `scheduleReload()` trên `web2:products` (debounce 500ms đã chặn cost). Set quyết định "có nên reload" phải bao gồm cả item đang ẩn.

**H3 — Mutation chiến dịch chỉ chặn đăng-nhập, không kiểm quyền theo hành động (OWASP A01)**
`web2-campaign-products.js:271,359,417,442,474,502,596`; `web2-live-comments.js:695,714,811,838`

Mọi mutation (POST/DELETE/PATCH reorder|pin|pending|control, create/delete campaign, assign/unassign) chỉ gác bằng `requireWeb2AuthSoft` (login-level: 401 anonymous dưới `WEB2_AUTH_ENFORCE=1` — đang ON prod từ 2026-06-13, nhưng gắn `req.web2User` cho **mọi** account bất kể role). Project **có sẵn** gate theo hành động — `requireWeb2Permission(slug,action)` tại `web2-users.js:573` — nhưng grep xác nhận nó **chỉ** dùng trong `web2-users.js`; không route chiến dịch nào import. `ROLE_DEFAULTS.viewer` (`web2-users.js:525`) chỉ view, nhưng token viewer/staff vẫn qua được, add/remove SP, reorder, xóa campaign cha, và (nặng nhất) `PATCH /pending` **ghi `web2_products.pending_qty+status` cho BẤT KỲ mã nào** — write cross-table vào Kho SP dùng chung, không scope theo campaign (`:514-521 UPDATE web2_products ... WHERE code=$1`, không filter `campaign_id`).

- **Impact:** Tài khoản quyền thấp nhất ghi đè được tồn/pending của SKU tùy ý trong Kho SP chung, xóa campaign cha, xáo board TV — vượt qua role model mà UI quảng cáo. Privilege escalation; số tồn sai hiển thị cho người mua trên TV.
- **Đề xuất:** Wire `requireWeb2Permission('live-control'|'campaigns', <action>)` sau `requireWeb2AuthSoft` trên mỗi route mutation. Tối thiểu gate `PATCH /pending` và `DELETE /campaigns/:id`. Scope UPDATE của `PATCH /pending` chỉ tới mã là thành viên campaign (JOIN `web2_campaign_products`) để không chạm SKU tùy ý.

**H4 — `campaign_stt`: advisory lock và MAX+1 scope bất đồng giữa các insert path → trùng số kệ dưới concurrency**
`native-orders.js:1043-1121` (from-comment) vs `:2860-2878` (merge)
_(gộp D7-cross-path-lock-scope-mismatch + D2-campaign-stt-scope-key-inconsistent + D7-merge-fromcomment-different-partitions)_

`campaign_stt` gán bằng `(SELECT COALESCE(MAX(campaign_stt),0)+1 ... WHERE <group>)` dưới `pg_advisory_xact_lock`, nhưng **group expression VÀ lock key khác nhau theo path**: (a) from-comment lock+scope theo `_campaignGroupKey` = tên đã strip `STORE|HOUSE` (fallback id); (b) merge (`:2860`) lock theo `base.live_campaign_id`, scope theo `COALESCE(live_campaign_id,'NO_CAMPAIGN')`; (c) backfill migration 080 (`:485-494`) theo id partition. Với đơn cùng `live_campaign_id=X` mà live có tên non-empty: merge subquery đếm cả row from-comment (chúng mang `live_campaign_id=X`) nhưng hai path giữ **NAME-lock vs ID-lock** — không loại trừ nhau → cả hai đọc cùng MAX và cùng ghi một `campaign_stt`. Vì `shelfStt = campaign_stt ?? display_stt` (`lib/web2-shelf-stt.js:17-24`) là nguồn duy nhất cho ô kệ vật lý, order_stt tem, và KPI STT range → trùng `campaign_stt` gửi hai đơn vào **cùng ô kệ** và **cùng bucket KPI**.

- **Impact:** Hai đơn cùng live nhận `campaign_stt` giống nhau khi merge và from-comment chạy đồng thời → trùng số ô put-wall (đặt sai đơn vị, NV quét nhầm tem) + trùng KPI STT (hai đơn credit cùng NV). Silent. Ngoài ra dù không concurrency, đơn merge/backfill (id-partition) và from-comment (name-partition) trong cùng một live spanning STORE+HOUSE vẫn trùng/nhảy số.
- **Đề xuất:** Chọn **MỘT** group key canonical dùng **giống hệt** cho lock hash, MAX+1 subquery, và backfill trong mọi path (from-comment, merge, create-manual). Đơn giản nhất theo ponytail: luôn lock+scope theo `COALESCE(live_campaign_id,'NO_CAMPAIGN')` (một expression chung, không biến thể per-path). Re-run backfill dưới key đã sửa.

### MEDIUM

**M1 — DELETE campaign để lại `web2_campaign_products` + `web2_live_tv_control` mồ côi và âm thầm lật session gate của board mồ côi về GLOBAL**
`render.com/routes/web2-live-comments.js:714-733`
_(gộp D1-delete-cascade-orphans + D2-delete-orphans-cp-tvcontrol)_

Đã verify: DELETE chạy 3 statement rời (null `post_assign.campaign_id`, null `comments.campaign_id`, delete parent) — **không đụng** `web2_campaign_products` hay `web2_live_tv_control` (cùng key `campaign_id`, không FK/cascade). Grep toàn repo xác nhận không nơi nào xóa hai bảng này khi remove campaign. Hệ quả: (1) `GET /?campaignId=N` (`campaign-products.js:291-301`) không check parent tồn tại → vẫn phục vụ board mồ côi; (2) guard của `autoSyncPending` (`:199-203`) return sớm `{added:0,purged:0}` vì parent mất → 'chờ hàng' + ghost-purge âm thầm dừng; (3) **nghiêm trọng nhất:** DELETE đã null `post_assign.campaign_id` → clause gate `NOT EXISTS(... campaign_id=$2)` giờ TRUE (không row nào khớp id đã xóa) → gate **lật từ post-scoped về GLOBAL** → board mồ côi đột nhiên đếm **toàn bộ** draft order project-wide cho mỗi mã.

- **Impact:** Sau delete, board mồ côi (còn với tới bằng `?campaign=N`) hiện GIỎ/MỚI phồng lên toàn cục thay vì rỗng; TV layout row tồn tại mãi; crash giữa 3 statement để state không nhất quán, không rollback.
- **Đề xuất:** Bọc 3 statement trong BEGIN/COMMIT trên một client; trong cùng transaction, **DELETE** (không null) `web2_live_post_assign`, và `DELETE FROM web2_campaign_products WHERE campaign_id=$1` + `DELETE FROM web2_live_tv_control WHERE campaign_id=$1`. DELETE thay vì null loại bỏ luôn state nhập nhằng "board mồ côi = global". Hoặc thêm FK `ON DELETE CASCADE`.

**M2 — GIỎ/MỚI tile (SQL no-trim) vs cart-detail popup (JS trim) dùng định nghĩa newCust khác nhau → lệch số với address chỉ-toàn-khoảng-trắng**
`render.com/routes/web2-campaign-products.js:319-320` vs `:685-687`
_(gộp D3-newcust-trim-divergence + D3-address-not-trimmed-at-insert)_

Tile MỚI (GET /) phân loại KH mới bằng SQL `COALESCE(n.phone,'')='' AND COALESCE(n.address,'')=''` — **không trim**. Popup (/cart-detail) phân loại **cùng đơn** bằng JS `String(row.phone||'').trim()` / `.trim()`. Với draft có address là chuỗi toàn khoảng trắng (`' '`): GET / thấy `COALESCE(' ','')=' '` ≠ '' → **không** mới (loại khỏi tile); cart-detail trim `' '` → `''` → `isNewCust=true` (hiện trong popup). Hai số cho cùng SP lệch nhau. Gốc rễ: path from-comment (chính là path board aggregate) lưu address **không trim** (`enrichedAddress = b.address || null`, `native-orders.js:994/1139`; enrichment copy `web2_customers.address` raw `:1023`), trong khi create-manual **có** trim (`:1293`). phone an toàn (luôn `^0\d{9}$` hoặc NULL qua `_normVnPhone`), address thì không.

- **Impact:** Badge MỚI trên board và số row popup KH-MỚI bất đồng cho mọi KH có address/phone toàn khoảng trắng → operator mất tin vào board live.
- **Đề xuất:** Hai fix, nên làm cả hai. (a) Root-cause: from-comment INSERT lưu `(enrichedAddress || '').trim() || null` khớp create-manual → sạch từ boundary. (b) Trích **một** predicate newCust SQL dùng chung cho cả hai query (`COALESCE(TRIM(n.phone),'')='' AND COALESCE(TRIM(n.address),'')=''`) để không drift lại.

**M3 — Gate global đếm chéo cùng một draft order qua nhiều campaign chưa-gán-bài chung mã SP**
`render.com/routes/web2-campaign-products.js:324-329`

`web2_campaign_products` UNIQUE `(campaign_id, product_code)` nhưng **không** unique cross-campaign → cùng mã ở hai board. Với campaign 0 bài-gán, clause đầu `NOT EXISTS(...campaign_id=$2)` = TRUE → aggregate đếm **toàn bộ** draft global cho mã đó, bỏ qua chúng thuộc live nào. Hai campaign đang ở trạng thái pre-assignment (global) chung một mã → mỗi board đếm **đúng cùng tập** draft global → đơn của live A hiện trong GIỎ của live B. Comment thừa nhận global fallback nhưng không nhắc cross-board inflation.

- **Impact:** Hai live đồng thời trước khi gán bài → cả hai board phồng GIỎ/MỚI cho mọi SKU chung → sai nhận thức về cầu giỏ thực.
- **Đề xuất:** Khi live đã chạy, yêu cầu ≥1 bài đã gán mới hiện số giỏ per-code; hoặc fallback chỉ đếm draft tạo sau khi campaign start / khớp bài của chính campaign. Nếu phải giữ global fallback, badge tile là "chưa gán bài (toàn cục)".

**M4 — TV control (layout/page/region) không re-fetch sau SSE reconnect**
`web2/live-tv/js/live-tv.js:241-243, 334, 384-386`; `web2/live-control/js/live-control.js:502-503, 106`

Reconnect (rolling-deploy / network blip) → bridge dispatch resync `data:null` cho mọi subscriber. Trong live-tv, resync `web2:campaign-products/live-comments/products/native-orders` → `scheduleReload()` (products). Nhưng resync `web2:live-tv-control` → `applyControl(null)` bail ngay (`if (!d) return;`), và `loadControl()` chỉ gọi từ `setCampaign` (`:334`), **không** trên resync. Postgres LISTEN/NOTIFY không buffer event cho listener đã ngắt → mọi thay đổi layout/page/region operator làm **trong lúc mất kết nối** bị mất với viewer. live-control có gap y hệt (`applyTvControlSse(null)` return `:502-503`, `loadTvControl()` chỉ trong `selectCampaign :106`).

- **Impact:** Sau mỗi deploy/restart backend hoặc network hiccup, màn TV (và tab operator thứ hai) hiển thị sai grid/page/region tới khi operator đổi control mới — desync nhìn thấy được trên màn bán live.
- **Đề xuất:** Trong nhánh resync của `onSse`, ngoài `reload()` gọi thêm `loadControl()` (live-tv) / `loadTvControl()` (live-control).

**M5 — TV không tự hiện SP 'chờ hàng' mới từ Sổ Order nếu không có tab live-control mở**
`render.com/routes/web2-campaign-products.js:282-290`

`autoSyncPending` (kéo `web2_products` `CHO_MUA` & `pending_qty>0` lên board) chỉ chạy khi GET / nhận `sync=1`, gửi **riêng** bởi live-control (`web2-campaign.js:141`). TV viewer luôn `listProducts` **không** sync (read-only invariant). Không path server-side nào (so-order upsert-pending, web2-products import) trigger `autoSyncPending` — verified không có reference tới `autoSyncPending` trong `web2-products.js` hay code sync so-order. Nên Sổ Order 'Lưu Nháp' đánh mã `CHO_MUA` fire `web2:products`, nhưng handler TV chỉ reload nếu mã đã trong `state.codes` (chưa, vì chưa được add) → setup chỉ-TV (viewer mở, không operator) **không bao giờ** hiện SP pending mới realtime.

- **Impact:** Nếu chỉ chạy màn live-tv (tab control đóng), SP mới flag 'chờ hàng' từ Sổ Order không tự lên board phát sóng — board chỉ đúng khi có tab live-control đang poll `sync=1`.
- **Đề xuất:** Cho mutation pending của so-order/web2-products trigger `autoSyncPending` server-side cho campaign liên quan + broadcast `web2:campaign-products`; hoặc tối thiểu: với action 'pending', TV reload cả mã chưa biết (bỏ gate `state.codes` cho action loại pending).

**M6 — live-control reload cả board (gồm jsonb aggregate nặng) trên MỌI mutation `web2:products` bất kể liên quan**
`web2/live-control/js/live-control.js:870-872`

Handler `web2:products` gọi `scheduleBoard()` **vô điều kiện** (khác live-tv có filter `state.codes`). Mọi sửa SP bất kỳ trong Kho SP chung (từ web2/products, so-order, bulk import) trigger full board re-fetch trên mọi tab live-control. Mỗi `loadBoard()` chạy `GET /?sync=1` → `autoSyncPending` + per-code cart aggregate `FROM native_orders n, jsonb_array_elements(n.products) prod WHERE ... status='draft'` cross-lateral không index, không LIMIT (`campaign-products.js:315-332`). Debounce 600ms chặn tần suất burst nhưng không chặn cost per-reload hay việc mutation không liên quan vẫn trigger.

- **Impact:** Full-board fetch lặp thừa (gồm jsonb lateral nặng) trên mỗi tab live-control mỗi khi bất kỳ SP nào trong catalog đổi — tải DB và công vô ích trong lúc live.
- **Đề xuất:** Filter như live-tv: chỉ `scheduleBoard()` khi mã bị chạm nằm trong `state.addedCodes` (đã maintain `:137`). Tách picker refresh riêng.

**M7 — SSE-driven `loadBoard()` ghi đè vô điều kiện `state.board`, clobber reorder/pin optimistic đang bay**
`web2/live-control/js/live-control.js:116-153, 865-884`

`onBoardOp` làm UI-first reorder/pin/remove (`apply()` set `state.board=nextBoard`, render, rồi PATCH nền). Độc lập, `onSse` cho `web2:campaign-products`/`web2:products`/`web2:native-orders` đều `scheduleBoard()` → 600ms debounce → `loadBoard()`, mà `loadBoard()` ghi đè **vô điều kiện** `state.board = Web2VariantGroup.group(items)` (`:142`) bằng data server. Không có in-flight/generation guard. Trong live, `web2:native-orders` fire liên tục (mỗi thay đổi giỏ). Nếu một `loadBoard()` do SSE hoàn tất khi PATCH reorder còn bay (order server chưa cập nhật) → ghi đè thứ tự optimistic bằng order server cũ → card nảy về; rồi `onSuccess` `loadBoard()` nảy tới lại. Snapshot rollback chụp lúc click có thể restore board trung gian đã clobber.

- **Impact:** Khi operator sắp xếp board lúc live (đúng lúc SSE traffic cao nhất), reload đồng thời làm card kéo/pin nhảy tới-lui (self-heal qua onSuccess nên không corrupt vĩnh viễn, nhưng gây rối và trông như "reorder không ăn").
- **Đề xuất:** Track flag mutation-in-flight (set trong apply, clear trong onSuccess/rollback) và cho `loadBoard()` skip/requeue (như pattern `NO.load` `_reloadPending`) khi có mutation pending; hoặc skip apply kết quả SSE `loadBoard` nếu đã có generation optimistic mới hơn kể từ khi fetch bắt đầu.

**M8 — "Xóa bộ lọc" không reset parentCampaignId/parentPostIds → parent filter kẹt cứng**
`native-orders/js/native-orders-filters-campaigns.js:193-209`

`clearFilters()` reset search, status, limit, tags, `selectedCampaignIds` — nhưng **không** đụng `NO.STATE.parentCampaignId` / `parentPostIds`. Chọn parent campaign (radio) rồi bấm "Xóa bộ lọc" → parent filter vẫn active, đơn vẫn bị lọc không rõ lý do. Cộng thêm: `renderParentCampaigns()` chỉ render radio campaign, **không có** option "none/Tất cả" (`:331-352`), và radio native không uncheck được bằng click lại. Cách duy nhất clear parent filter là check một dropdown campaign (`:259`) hoặc "Chọn tất cả" (`:267`) — không hiển nhiên → view parent-filtered thành bẫy.

- **Impact:** User chọn parent, thấy ít/0 đơn, bấm "Xóa bộ lọc" mong thấy tất cả — nhưng parent filter tồn tại, đơn vẫn ẩn. Không affordance rõ để clear → kẹt tới khi toggle dropdown campaign hoặc reload.
- **Đề xuất:** Trong `clearFilters()` thêm `NO.STATE.parentCampaignId = null; NO.STATE.parentPostIds = []; NO.renderParentCampaigns();` trước `NO.load()`. Thêm radio "Tất cả (bỏ chọn)" `value=''` đầu `renderParentCampaigns()`.

**M9 — Empty-state `hasFilter` bỏ sót parentCampaignId → kết quả rỗng do parent hiện sai message + không có nút clear**
`native-orders/js/native-orders-render.js:645-660`

Khi 0 đơn, `hasFilter` tính từ search, status, tagFilter, `selectedCampaignIds` — **không** `parentCampaignId`. Nếu parent filter cho 0 đơn (bài gán không có đơn, hoặc `assign.post_id ≠ fb_post_id` — xem H1) → `hasFilter=false` → UI hiện message không-lọc "Chưa có đơn nào / Đơn web mới sẽ hiện ở đây", **không** nút "Xóa bộ lọc". User không biết filter đang ẩn đơn.

- **Impact:** Parent filter khớp 0 đơn không phân biệt được với trang thực sự rỗng → hiện "Chưa có đơn nào" thay vì "Không có đơn khớp bộ lọc" + nút clear → che filter active, ẩn đơn thật.
- **Đề xuất:** Thêm `|| (NO.STATE.parentPostIds && NO.STATE.parentPostIds.length) || NO.STATE.parentCampaignId` vào `hasFilter`, wire nút clear reset luôn parent filter (chung với M8).

**M10 — CHO VƯỢT / region là feature CHẾT hoàn toàn: admin-gate + SSE broadcast + persist region không ảnh hưởng một phép tính hay badge nào**
`web2/shared/web2-live-tv-display.js:128-146`; callers `live-control.js:160` & `live-tv.js:69`; server gate `web2-campaign-products.js:615-624`

Premise FOCUS (region prefix HN/HC quyết `CÒN=max(0,NCC−GIỎ)` / badge VƯỢT) **không còn trong code**. `khConModel(v, selectedRegion)` giữ param `selectedRegion` "for call-compat, KHÔNG còn dùng", tính `choHang=max(0,gio−stock−retQty)`, `con=max(0,stock−gio)` — **không** có region term. Cả **hai** caller gọi `khConModel(v)` không second arg. `cardState` cũng không region/VƯỢT. Nhưng region control vẫn: (1) admin-gate server (`PATCH /control regionAllowed = role==='admin'`), (2) broadcast SSE `web2:live-tv-control`, (3) persist `web2_live_tv_control.region`, (4) confirm dialog + chip selector live-control, (5) dead CSS `.ltv-warn-vuot`/`.lc-region-select`/'VƯỢT +N'. Ba nguồn region vẫn chảy về client, không nguồn nào tới phép tính.

- **Impact:** Admin tin đổi 'Địa danh CHO VƯỢT' ảnh hưởng oversell/cách tính CÒN trên TV (dialog hứa 'áp NGAY cho mọi người đang xem'). Thực tế persist+broadcast nhưng **không đổi gì** trên màn — no-op âm thầm không phân biệt được với bug. ~150 dòng admin-gate + SSE + confirm + CSS thành dead weight gây hiểu lầm.
- **Đề xuất:** Chọn một: (a) **gỡ end-to-end** (selector, dialog, nhánh region trong `PATCH /control`, field SSE, dead CSS, cột region) theo YAGNI; hoặc (b) re-wire `khConModel` thực sự tiêu thụ `control.region` + product region để VƯỢT hoạt động đúng như UI hứa. Không ship control broadcast-mà-không-tính-gì.

### LOW

**L1 — DELETE /campaigns/:id non-transactional**
`web2-live-comments.js:719-728` — 3 `pool.query` không BEGIN/COMMIT; crash giữa chừng để comments/assign nulled trong khi parent còn sống, hoặc children nulled trong khi parent sống. Cùng file đã có sẵn pattern transaction đúng (`pool.connect + BEGIN/COMMIT/ROLLBACK/release` tại `:89-112, :124-143` cho migration) nên đây là bỏ sót không nhất quán. **Fix:** bọc trong một transaction (chung với các DELETE ở M1). _(Cùng gốc M1; gộp D2-delete-non-transactional + D5-delete-campaign-nonatomic.)_

**L2 — POST /campaigns không dedup name + không giới hạn độ dài → 500 thô với tên quá dài**
`web2-live-comments.js:695-711` — chỉ validate name non-blank. `web2_live_parent_campaigns` không UNIQUE trên name (`:622-627` PRIMARY KEY id) → trùng tên vô hạn (gây rối picker/filter, và `campaign_stt` group theo `live_campaign_name`). Name >255 ký tự → Postgres length error catch thành 500 chung (`error: e.message`). Frontend chỉ chặn blank (`live-campaign-manager.js:234`). **Fix:** reject `name.length>120` với 400; optional dup-name check case-insensitive per creator/day → 409/warning; tối thiểu clamp về VARCHAR width trước insert.

**L3 — cart-detail trả full phone+address của MỌI người mua theo mặc định (mode≠new)**
`web2-campaign-products.js:658, 685-694` — strip PII **chỉ** khi `mode==='new'`. Popup 'GIỎ' mặc định (`data-cart-mode="all"`, `live-control.js:177` gọi với `mode:undefined` `:624`) trả `n.phone`/`n.address` đầy đủ cho **mọi** draft của SKU. Strip là opt-IN của caller, không phải default an toàn. Dưới hard-auth hiện tại lộ cho mọi account gồm view-only (xem H3). **Fix:** default strip PII, yêu cầu flag opt-in tường minh (`includeContact=1`) tự nó permission-gated; gate endpoint bằng quyền customer-PII.

**L4 — orphan-purge quên tombstone khi SKU bị xóa+tạo-lại**
`web2-campaign-products.js:216-224` — tombstone (`removed=true`) tồn tại để `autoSyncPending` **không** re-add SP operator đã ✕. Nhưng orphan-purge DELETE hard-delete **bất kỳ** cp row có `product_code` vắng khỏi `web2_products`, **bất kể** `removed`. SP `CHO_MUA` bị ✕ (tombstone) → SKU xóa khỏi Kho SP rồi tạo lại cùng mã → tombstone đã bị hard-delete → `autoSyncPending` re-add fresh → removal của operator mất âm thầm. **Fix:** thêm `AND cp.removed = false` vào purge WHERE để tombstone sống sót qua delete/recreate.

**L5 — `campaign_stt` sort-prepend race (autoSync + POST / cùng MIN(sort), không lock)**
`web2-campaign-products.js:246-264, 382-402` — cả auto-sync loop và POST / tính `base = MIN(sort) WHERE removed=false` trên pool trần (không transaction, không advisory lock) rồi gán sort giảm dần. Hai `GET /?sync=1` đồng thời + một POST / đọc cùng MIN, phát overlapping negative sort. Nhờ `ORDER BY ... added_at DESC` tiebreak (`:299`) và `ON CONFLICT`, chỉ gây wobble thứ tự, không mất row. **Fix:** `pg_advisory_xact_lock` keyed theo campaignId (tái dùng pattern native-orders), hoặc `MIN(sort) OVER ()` trong `INSERT ... SELECT` để read+write atomic.

**L6 — `PATCH /pending` status transition lệch model 4-state, có thể kẹt status stale**
`web2-campaign-products.js:513-523` vs canonical `web2-products.js:37-42` — endpoint dùng CASE 2 nhánh (`pending>0→CHO_MUA`, `stock>0→DANG_BAN`, else giữ status), thiếu `HET_HANG`/`MUA_1_PHAN`. `stock<=0 AND pending==0` → giữ status cũ (kẹt 'CHO_MUA' dù thật ra `HET_HANG`). Mitigating: live-control không còn gọi (`savePending` gỡ 2026-06-30, `live-control.js:332`), wrapper `Web2Campaign.setPending` không caller live → latent/dead nhưng vẫn ghi Kho SP cho mọi mã. **Fix:** thay CASE bằng shared `computeProductStatus(stock, pending)`, HOẶC xóa endpoint + wrapper (YAGNI — Sổ Order là writer pending duy nhất).

**L7 — `autoSyncPending` cap 300 SP mới nhất âm thầm, không cảnh báo**
`web2-campaign-products.js:228-237` — `ORDER BY updated_at DESC NULLS LAST, code LIMIT 300`. Live >300 SP `CHO_MUA` & `pending>0` → chỉ 300 mới-cập-nhật-nhất lên board, phần còn lại không bao giờ tới, không warning/count. SP `updated_at` NULL (legacy) sort cuối → rớt đầu tiên. **Fix:** surface cap (`capped:true`/`pendingTotal` → toast khi >300), hoặc nâng/bỏ LIMIT + batch multi-row INSERT bỏ per-row loop `:254-264`.

**L8 — TV `control.page` không được sửa khi số SP co lại dưới trang hiện tại → page stale cross-device**
`live-control.js:388`; render `web2-live-tv-display.js:99` — `paginate()` clamp trang **hiển thị** về `totalPages-1` nhưng chỉ local. `renderTvCtl` tự sửa `tc.page` cục bộ (`:388`) nhưng **không** `saveTvControl` để persist. `web2_live_tv_control.page` server có thể ngoài range → device mới đọc page stale, re-add SP làm TV nhảy trang bất ngờ. **Fix:** khi `renderTvCtl` phát hiện `pg.page !== tc.page` do shrink → `saveTvControl({page: pg.page})` (debounced).

**L9 — saveTvControl bỏ control authoritative server trả về, không rollback khi lỗi**
`live-control.js:471-481` — mutate `state.tvControl` local (`:473`) rồi `Web2Campaign.setTvControl` (trả `j.control` authoritative, `web2-campaign.js:197-203`) nhưng **bỏ** giá trị trả về, on-error chỉ toast không rollback. Cụ thể nhất: region admin-only server-side → non-admin đổi region thấy UI update local nhưng server giữ region cũ, broadcast nothing → TV không đổi. **Fix:** `const ctrl = await ...setTvControl(...); if (ctrl) { state.tvControl = {...state.tvControl, ...ctrl}; renderTvCtl(); }`; on catch restore snapshot pre-patch.

**L10 — native-orders init nạp NO.load() chồng chéo (reconcile auto-pick + First load)**
`native-orders-realtime-init.js:229, 324` — `loadAvailableCampaigns()` (`:229`) chạy `reconcileCampaignSelection()` auto-pick House+Store → gọi `NO.load()`; init cũng gọi `NO.load()` "First load" (`:324`) vô điều kiện. Guard `_reloadPending` (`render.js:975`) coalesce nên state cuối đúng, nhưng dư một round-trip + flash unfiltered→filtered. **Fix:** await `loadAvailableCampaigns()` (đã tự conditional-load) và bỏ trailing `NO.load()`, hoặc gate trailing chỉ fire khi reconcile chưa trigger.

**L11 — "Xem comment" viewer bypass Web2Campaign bằng raw fetch (fork residue)**
`live-chat/js/live/live-campaign-manager.js:72-82, 424` — create/remove/assign/unassign/list đã route qua Web2Campaign, nhưng viewer "Xem comment" dùng `_api()` (raw fetch `${API}/?campaignId=...`) và AI name suggester (`:289`) raw fetch `/api/web2-ai/complete`, hardcode chatomni-proxy fallback (`:13`) — chính drift base-URL/auth mà shared client sinh ra để tránh. Không lỗi correctness. **Fix:** thêm `Web2Campaign.listCampaignComments(campaignId, {limit})`; đưa AI-name call sau shared helper.

**L12 — productCode không cap độ dài trước insert VARCHAR(40)**
`web2-campaign-products.js:372, 421, 478, 506` — POST / cap 500 mã, trim từng mã, nhưng không giới hạn độ dài; `product_code` VARCHAR(40). Mã >40 → Postgres 22001 → `res.status(500).json({error: e.message})`. Parameterized (không injection). **Fix:** `.filter(c => c.length <= 40)` up front, trả 400.

---

## 4. Vùng chưa phủ / cần điều tra thêm

Các vùng sau nằm ngoài phạm vi các phát hiện đã xác nhận nhưng nằm ngay trên đường đi của chúng — **cần mở và trace trước khi coi hệ thống là sạch**:

1. **Comment ingest campaign_id inheritance (WRITE side của gate glue) — `web2-live-comments.js:187-213`, `services/web2-livestream-poller.js:427-429`.** Audit chỉ trace phía READ của session gate, chưa trace comment nhận `campaign_id` thế nào lúc ingest. `upsertComments` kế thừa `campaign_id` từ `web2_live_post_assign` lúc write, **fail-open**: cả block bọc try/catch nuốt lỗi ('bảng chưa tạo / lỗi tra cứu → bỏ qua'). Nếu lookup throw (DB blip, table-not-ready lúc rolling deploy trong khi poller đã ingest) → comment lưu `campaign_id=NULL` **vĩnh viễn**, không bao giờ re-inherit (assign fan-out UPDATE chỉ tag comment tồn tại lúc assign; ingest inherit là path duy nhất cho comment tới **sau** assign). → comment rớt khỏi `comment_count` mãi mãi, cart-detail avatar/enrichment (join theo fb_id) mất chúng. **Verify:** `campaign_id` khi SELECT trên `post_assign` throw vs trả 0 rows; có backfill nào re-tag comment NULL-campaign sau assign sau không.

2. **`web2-returns.js` và `return_qty` → CHỜ HÀNG board math.** Model hiện tại `choHang = max(0, GIỎ − TỒN − returnQty)`, board GET / SELECT `p.return_qty` (`:293`) vào `mapItem.returnQty` (`:133`). `return_qty` do `web2-returns.js` ghi ('Thu về/shipper_gui' → `+= qty`; approve → `→ stock`). Chưa trace: (a) web2-returns có broadcast `web2:products` để board/TV refetch không; (b) approval `return_qty→stock` có fire SSE nào không; (c) filter `state.codes` của TV (xem H2) có nuốt luôn `return_qty` change cho item ẩn/hết-hàng không. Một returns-approval lúc live có thể đổi số board âm thầm không realtime push. **Verify:** grep `_notify`/`notifyClients`/`web2:products` trong `web2-returns.js`, cross-check `live-tv.js:266-271` (gate `state.codes`) vs `live-control.js:870` (unconditional).

3. **`native_orders.products` JSON key-shape drift.** Aggregate dùng `COALESCE(prod->>'productCode', prod->>'code')` và `COALESCE(quantity, qty)` — schema chưa validate. from-comment INSERT spread payload client verbatim (`...p`, `native-orders.js:1237`) → code key là thứ client gửi. Rủi ro: (a) một product có cả `productCode` và `code` khác giá trị → COALESCE chọn `productCode`, board đếm một mã còn đơn vị vật lý quét mã khác; (b) **merge path append line items** → một order có cùng mã hai lần → `jsonb_array_elements` ra hai row → SUM **double-count** qty, không de-dup, không GROUP-within-order guard → over-count GIỎ silent. **Verify:** `native-orders.js:879-961` (merge append hay merge line item?) + `:1104-1150` vs `web2-campaign-products.js:315-332`.

4. **`web2_live_post_titles` lifecycle + ba nguồn tiêu đề bài không reconcile.** Bảng tạo `:638`, upsert on-assign `:662`, LEFT JOIN GET /posts `:752`. DELETE cascade (đã flag) không dọn `post_titles`; chưa check `unassignPost` (`:838`) có clear không. Title row có thể sống lâu hơn bài/campaign → GET /posts COALESCE title từ `post_titles` OR `post_assign.post_title` → title stale mislabel bài đã reassign. Ba nguồn title (live-chat `state.liveCampaigns` Pancake, native-orders `/page-posts` poller, `post_titles`) không reconcile. **Verify:** `web2-live-comments.js:638-666, 745-780, 810-834, 838`.

5. **`web2-order-tags-service.js` KPI attribution qua `campaign_stt` range.** H4 chứng minh `campaign_stt` trùng/lệch được, impact dừng ở "trùng ô kệ + trùng KPI bucket" — chưa mở downstream: khi hai order cùng `campaign_stt`, resolve NV thế nào (cả hai? first-match? undefined)? Khi `campaign_stt=NULL` (fallback `display_stt` qua shelfStt) — KPI range keyed theo `live_campaign_name` có áp cho `display_stt` không, hay hiện '⚠ STT chưa gán NV'? `sanitizeCampaignName` của KPI có khớp regex strip STORE/HOUSE của `_campaignGroupKey` (`native-orders.js:970-973`) không — **trục naming-drift thứ hai** chưa cross-check. **Verify:** `web2-order-tags-service.js` (~§504-511) so với `_campaignGroupKey`.

6. **`Web2LiveTvDisplay` (paginate/cardState/khConModel) — module render chung chưa đọc.** Untested: (a) `khConModel` giữ param `selectedRegion` chết (M10) — verify không caller nào khác còn truyền region kỳ vọng có tác dụng; (b) `paginate` clamp `totalPages-1`, nhưng với rows×cols (tới 60 cell/page) khi variant GROUP (`Web2VariantGroup` gộp con dưới một card) làm card count ≠ product count → math grid của operator lệch grid thực; (c) `cardState` soldOut/con threshold — nơi thứ ba newCust/GIỎ/stock được so, rủi ro drift với hai SQL site đã flag. **Verify:** `web2/shared/web2-live-tv-display.js` (full 157 dòng) + `web2/shared/web2-variant-group.js:159-219` (SUM con vs per-code tile có khớp không).

7. **Concurrency của endpoint được khen "an toàn" — PATCH /reorder — và retry của `insertWithCodeRetry`.** Audit đối chiếu "reorder là transaction thật duy nhất" nhưng chưa verify nó **đúng** dưới SSE-clobber (M7): reorder txn ghi `sort=index` trong loop, autoSyncPending (non-txn) prepend `base=MIN(sort)`. Nếu COMMIT reorder interleave với INSERT autoSync → sort reorder và negative sort prepend đan xen → thứ tự operator không chọn mà **persist** (không chỉ wobble). Cũng chưa xét: `insertWithCodeRetry` retry cả transaction trên 23505 → `pg_advisory_xact_lock` auto-release lúc ROLLBACK → retry re-compute MAX+1 dưới lock mới; hai order retry-collide trên mã NJ có thể mang `campaign_stt` stale từ attempt đầu. **Verify:** `web2-campaign-products.js:450-471` (reorder txn) vs `:246-264` (autoSync prepend); `native-orders.js insertWithCodeRetry` (~§685) + `:1043-1121` — `campaign_stt` re-SELECT trong **mỗi** attempt hay tính một lần trước loop.

8. **Boundary empty-array trong aggregate + load path.** GET / build aggregate `code=ANY($1::text[])`; board 0 SP non-tombstoned → `codes` rỗng → `ANY('{}')` (vô hại) nhưng chưa confirm `autoSyncPending` `base=MIN(sort)` trên 0 row `removed=false` trả NULL → NaN sort trên insert đầu tiên. Tương tự native-orders /load với campaign có parent assigned mà `listAssignments` momentarily trả `[]` → `fbPostIds=[]` → backend coi là 'match nothing' (`ANY('{}')=false`) hay 'no filter' — khác biệt giữa hiện tất cả vs hiện zero đơn. **Verify:** `web2-campaign-products.js:246` (base NULL→NaN?), `:315` (empty codes); `native-orders.js:1839-1870` (fbPostIds empty → match zero hay có length guard).

---

## 5. Khuyến nghị ưu tiên (theo thứ tự làm)

1. **H1 — Sửa session gate join sang `native_orders.fb_post_id`** (cả GET / và /cart-detail) + sửa comment sai `:311`. Loại bỏ sự phụ thuộc vào invariant tình cờ `Id===Facebook_LiveId`; đây là lỗi keo-ghép-identity trung tâm, blast radius cao nhất, latent-silent.

2. **M1 + L1 — Làm DELETE /campaigns/:id transactional và cascade** (`web2_campaign_products` + `web2_live_tv_control` + DELETE `post_assign` thay vì null). Chặn board mồ côi lật gate về GLOBAL và table bloat vô hạn. Một fix atomic.

3. **H3 — Wire `requireWeb2Permission` cho mọi mutation chiến dịch**, ưu tiên `PATCH /pending` và `DELETE /campaigns/:id`; scope UPDATE của `/pending` chỉ tới mã thành viên campaign. Đóng lỗ privilege-escalation + cross-table write vào Kho SP.

4. **H4 + L5 — Thống nhất MỘT group key canonical cho `campaign_stt`** dùng giống hệt ở lock hash, MAX+1 scope, và backfill trong mọi path (from-comment, merge, create-manual); re-run backfill. Thêm advisory lock keyed campaignId cho sort-prepend của campaign-products. Chặn trùng ô kệ vật lý + trùng KPI.

5. **H2 + M5 — Sửa relevance của SSE `web2:products` trên TV viewer**: track tập mã đầy đủ (trước filter `isActive/missing`) hoặc bỏ code filter. Đồng thời cho pending-mutation từ so-order trigger `autoSyncPending` server-side + broadcast. TV phát sóng mới đúng realtime cho SP nhập-lại và SP chờ-hàng mới.

6. **M2 — Trim address ở from-comment INSERT (root cause) + trích một predicate newCust SQL dùng chung.** Loại drift GIỎ/MỚI tile vs popup từ boundary.

7. **M10 — Quyết định CHO VƯỢT/region: gỡ end-to-end (YAGNI) hoặc re-wire `khConModel`.** Không để control broadcast-mà-không-tính-gì lừa admin + ~150 dòng dead weight.

8. **M8 + M9 — Fix parent-filter UX trong native-orders**: `clearFilters()` reset parent, `hasFilter` gồm parent, thêm radio "Tất cả (bỏ chọn)". Thoát bẫy view parent-filtered.

---

_Đã kiểm tra, KHÔNG phải bug (mention để khỏi điều tra lại):_ **D1-comment-count-orphan-string-campaign-id** (comment_count drop comment có string campaign_id không khớp parent); **D5-autosync-guard-fail-open** (guard parent-existence của autoSyncPending fail-open cho phép orphan write với campaignId rác); **D7-60s-dup-guard-outside-lock** (guard trùng 60s comment-less chạy ngoài lock/transaction → hai POST comment-less gần đồng thời cùng tạo order) — cả ba đã REFUTED trong review.

Các file:line load-bearing đã verify tại chỗ trong lần audit này: `render.com/routes/web2-campaign-products.js:311,324-329`, `render.com/routes/web2-live-comments.js:714-728`, `web2/live-tv/js/live-tv.js:191-198,266-271`.
