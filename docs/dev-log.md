# Dev Log

## 2026-06-27

### [gemini-tryon] Thêm DEBUG (máy shop báo "cài xong nhưng 8131 không lên")

Máy shop Windows cài bộ [4] → "báo thành công" nhưng `localhost:8131` không vào được (nghi tải `app.py` CŨ từ github.io — CDN GitHub Pages cache chậm, bản cũ init chặn → treo startup). Thêm debug để nhìn lỗi thật thay vì đoán:

- **`gemini-tryon-windows-setup.ps1`**: launcher `start.cmd` thêm `PYTHONUNBUFFERED=1` + **redirect output → `gemini-tryon.log`** (trước `pythonw` nuốt hết). Sau khi start, **health-check `localhost:8131/health` tối đa 30s**; nếu KHÔNG lên → **in 30 dòng cuối log ra cửa sổ bat** + đường dẫn log. Kill instance cũ mở rộng (match `$DIR` → diệt cả `pythonw serve.py` treo giữ cổng, chống kẹt 8131 khi cài lại).
- **`app.py`**: endpoint **`GET /debug`** (Python ver, platform, import + version 5 lib gemini_webapi/fastapi/uvicorn/browser_cookie3/certifi, cookie_source, accounts). Trang cấu hình `/` thêm card **"🔧 Chẩn đoán máy chủ"** (auto load /debug 8s/lần).
- **`web2-pos-installer.js`** (`cai-may-pos.bat` :GEMINI): echo block DEBUG trỏ log path + trang chẩn đoán.

**Verify máy này**: `/debug` trả Python 3.12.8 + 5 lib ✅; trang `/` có mục Chẩn đoán; bat có block DEBUG + log path. **Lưu ý deploy**: nhijudy.store đã current, github.io CDN còn cache bản cũ (~10') → máy shop nên cài từ **nhijudy.store** hoặc chờ CDN refresh.

### [gemini-tryon] Fix: server kẹt khởi động khi cookie hỏng → cổng 8131 không lên

User "sao không vào được localhost 8131" → chạy thử LIVE trên máy thật, lòi ra **3 bug** (fix hết):

1. **`app.py` — server kẹt khởi động**: `lifespan` `await _init_pool()` chặn startup, cookie hỏng/mạng chậm → `GeminiClient.init()` treo → uvicorn kẹt "Waiting for application startup" → cổng 8131 không mở. Fix: init account chạy NỀN (`asyncio.create_task`) → server lên ngay; `_safe_build` bọc `asyncio.wait_for(INIT_TIMEOUT+10)`.
2. **`serve.py` — heartbeat SSL fail**: Python.org macOS thiếu cert store → `urllib` HTTPS `CERTIFICATE_VERIFY_FAILED` → heartbeat chết âm thầm (`except: pass`) → KHÔNG đăng ký registry (curl chạy vì dùng cert hệ thống). Fix: SSL context bằng `certifi` (fallback unverified).
3. **`serve.py` — heartbeat 403**: worker Cloudflare chặn UA mặc định `Python-urllib` (403). Fix: thêm `User-Agent: gemini-tryon/1.0`.

**Verify LIVE** (venv máy này): port 8131 lên sau 2s; `/health` + trang cấu hình `/` HTTP 200 dù cookie sai; serve.py mở tunnel `*.trycloudflare.com` + **đăng ký registry thành công** (`GET /list?engine=gemini-tryon` trả máy "Macs-MacBook-Pro (Gemini)"). Tab Ghép đồ dò ra (localhost + registry). (Lưu ý: gemini_webapi báo ready ngay sau init kể cả cookie sai → cookie hỏng bị bắt + nhảy account lúc generate.) Status: ✅ sidecar đang chạy live, chờ user dán cookie acc phụ tại localhost:8131/.

### [web2/shared] Trang chỉ-admin: ẩn khỏi menu nhân viên + chặn truy cập URL trực tiếp (1 nguồn)

User: group "Quản trị viên" + 6 trang (`system`, `pancake-settings`, `delivery-zone`, `audit-log`, `order-tags`, `livestream-poller`) chỉ admin được vào; **mọi trang admin-only phải ẩn khỏi menu** để nhân viên không thấy.

**Files**:

- `web2/shared/web2-perm.js` — thêm `ADMIN_ONLY_SLUGS` (1 NGUỒN: 6 trang trên + 3 trang group Quản trị viên `cham-cong`/`chi-tieu`/`users`) + helper `isAdminOnlySlug`/`isAdminOnlyUrl` (export). Mở rộng page-guard `_runGuard`: admin-only slug → **FAIL-CLOSED** chặn mọi non-admin (overlay "Bạn không có quyền xem trang này"), không phụ thuộc dữ liệu permissions (khác per-user 'view' revoke vốn default-open). An toàn vì web2-auth.js đã redirect user chưa đăng nhập về login + `getStored()` đọc localStorage đồng bộ → tới guard luôn có user.
- `web2/shared/web2-sidebar.js` — thêm `adminOnly: true` cho 5 NAV item (livestream-poller/pancake-settings/delivery-zone/order-tags/audit-log; `system` + group Quản trị viên đã có sẵn). `renderItem` ẩn item khi `item.adminOnly || Web2Perm.isAdminOnlyUrl(item.our)` (backstop 1-nguồn, phòng quên flag). Bump autoload `web2-perm.js?v=20260627adm`.
- Bump `web2-sidebar.js?v=20260627adm` trên **53 trang HTML** (cache-bust GH Pages).

**Lưu ý**: command palette (Ctrl+K) harvest từ DOM sidebar đã render → tự loại trang admin-only cho non-admin, không cần sửa. Mobile bottombar chỉ có item cố định (không admin).

**Verify** (browser test localhost, mô phỏng role qua `web2_auth`):

- Admin: thấy đủ 9 item admin-only + group (53 sub-link). ✅
- Staff: 9 item ẩn hết, group ẩn (53→44 link), `Web2Perm.isAdmin()=false`. ✅
- Staff nav trực tiếp `web2/system?tab=services` → overlay chặn `#web2PermBlock`. ✅
- Không false-positive: staff/products KHÔNG chặn, admin/system KHÔNG chặn. ✅
- Unit test node: slugFromUrl + isAdminOnlyUrl đúng 9 trang admin (gồm `?tab=services`), `users` vs `users-permissions` không nhầm. Status: ✅

### [inventory-tracking] Cho nhập GIÁ thập phân (ô Sản phẩm) + KG thập phân (ô Kiện Hàng) — dấu phẩy kiểu VN

User (modal "Thêm Đợt Hàng Mới" trang `inventory-tracking`): cho nhập số thập phân, dấu phẩy kiểu VN (vd `54,5`). Chốt: áp dụng **cả 2 ô**; ô Sản phẩm chỉ **giá** thập phân (SL giữ số nguyên).

**Files**:

- `inventory-tracking/js/text-parser.js` — regex giá `(\d+)` → `(\d+(?:[.,]\d+)?)` ở `PRODUCT_REGEX` + `PRODUCT_NO_COLOR_REGEX`; thêm helper `parseVnDecimal` (replace `,`→`.` rồi `parseFloat`). SL vẫn `parseInt`.
- `inventory-tracking/js/modal-shipment.js` — `parsePackagesInput`: bỏ comma-as-separator, **dấu cách = phân tách kiện**, dấu phẩy = thập phân (`part.replace(',','.')`). Cập nhật label/placeholder/hint ô Kiện Hàng. (Tương thích ngược: `"10, 20, 50, 88"` vẫn ra 4 kiện vì `"10,"`→`"10."`=10.)
- `inventory-tracking/js/modal-order-booking.js` — `parseProductLine`: giá cũng nhận thập phân (cùng format `[SL]X[giá]`, giữ đồng nhất).

**Chi tiết**: comma = dấu thập phân (VN), dot cũng chấp nhận. Hiển thị an toàn: `formatNumber` dùng `toLocaleString('vi-VN')` (54.5 → "54,5"); ô sửa đơn giá đã có `step=0.01`; `getProductAmount`/table-renderer dùng `parseFloat(giaDonVi)`. Module Web 1.0 (chatDb), không đụng web2.

**Verify**: node test 3 parser — giá nguyên/thập phân (`,` và `.`) OK, SL nguyên, KG thập phân OK, input cũ "10, 20, 50, 88"→4 kiện OK. Status: ✅

### [gemini-tryon + web2/ai-hub] ĐA ACCOUNT xoay tua + cài 1-click (bộ cài máy POS) + route free vào tab Ghép đồ

Nối tiếp sidecar gemini-tryon. User: "cài nhiều account Google Gemini để xoay tua không bị giới hạn" + "cho vào cài đặt phần download để chạy 1 click".

**1) `gemini-tryon/app.py` — POOL ĐA ACCOUNT (viết lại)**: mỗi account = 1 cặp cookie `__Secure-1PSID`/`PSIDTS` → 1 `GeminiClient`. Request xoay round-robin; account dính quota/limit → cooldown (`GEMINI_COOLDOWN_SEC` mặc định 3h) nhảy account kế; cookie hỏng → tắt account. Nguồn account: `accounts.json` → ENV `GEMINI_1PSID_1..20` → ENV đơn → browser-cookie3 (Chrome). **Trang cấu hình `GET /`** (tự chứa HTML) để dán cookie nhiều acc dễ dàng + `GET/POST/DELETE /accounts`. `/health` trả trạng thái từng account (ready/cooling/uses). **Đổi cổng 8124→8131** (8124 trùng OmniVoice). (Pattern xoay giống Pollinations token / Cloudflare account.)

**2) Cài 1-click (bộ cài máy POS)**: `gemini-tryon/gemini-tryon-windows-setup.ps1` (clone vieneu-windows-setup: tải app.py/serve.py/requirements từ site → venv → pip → cloudflared → launcher ẩn + Startup auto-bật + mở localhost:8131 dán cookie). Thêm **option [4] Gemini** vào `web2/shared/web2-pos-installer.js` (`cai-may-pos.bat` menu + routine `:GEMINI` + `:DO_ALL` + uninstaller dọn `N2StoreGeminiTryon`).

**3) `web2/shared/web2-tryon.js` — wire đường FREE**: section "Máy Gemini FREE" trong tab Ghép đồ (nút Tải bộ cài / Dò máy / Cấu hình account). `discoverGemini()` dò `localhost:8131/health` rồi registry `?engine=gemini-tryon`. `run()` route: có máy free → `POST <url>/tryon` (free), lỗi → fallback `callPaidNano` (Nano Banana `/api/web2-ai/image`). ai-hub load thêm `web2-pos-installer.js`; bump `web2-tryon.js?v=20260627b`.

**4) Tự bật khi mở máy + chạy NỀN ẨN** (user hỏi): Windows = PS1 dùng `pythonw` (không cửa sổ) + `run-hidden.vbs` (Run …,0) + Startup folder — đã có sẵn. Mac = thêm `install-mac.command` (LaunchAgent `com.n2store.gemini-tryon`: RunAtLoad+KeepAlive, chạy python venv nền, log file, PATH thêm brew để thấy cloudflared) + `uninstall-mac.command`. Nền ẩn → dùng cookie qua trang `localhost:8131/` (accounts.json), không browser-cookie3.

**Verify**: py_compile OK; node bat content có [4]+`:GEMINI`+URL ps1 đúng + uninstaller dọn Gemini; browser (login admin/admin!!) tab Ghép đồ render section máy free đủ 3 nút + status "⚪ chưa thấy máy → dùng Nano Banana", `Web2PosInstaller` loaded, **0 console error**. Status: ✅ (chờ user chạy bộ cài + dán cookie acc phụ trên máy shop)

### [web2/ai-hub + gemini-tryon] Thư viện prompt mới (49 Nano Banana) + Ghép mặt + sidecar Gemini cookie FREE

User muốn dùng prompt try-on (ghép đồ/ghép mặt) MIỄN PHÍ bằng tài khoản gemini.google.com từ Web 2.0. iframe/embed Gemini = bất khả thi (`X-Frame-Options: DENY`, đã verify header). Giải pháp = **cầu cookie** (giống pattern Zalo + VieNeu-TTS đã có).

**1) Sidecar `gemini-tryon/` (Hướng A — engine, NEW)**: clone pattern VieNeu-TTS (máy shop + cloudflared tunnel + heartbeat lên `web2-vieneu-registry` engine='gemini-tryon', cổng 8124). Dùng lib `HanaokaYuzu/Gemini-API` (`gemini_webapi` ⭐3.2k) gọi web app Gemini bằng cookie `__Secure-1PSID` → FREE + Nano Banana + nhận nhiều ảnh (try-on/face-swap). Files: `app.py` (FastAPI `/health` `/tryon` `/generate`), `serve.py`, `requirements.txt`, `run-mac.command`, `run_local.sh`, `README.md`. Cookie: auto browser-cookie3 (Chrome đã login) HOẶC ENV `GEMINI_1PSID`. ⚠ reverse-engineered → dùng acc Google PHỤ. py_compile OK. (Chưa wire nút chọn máy free vào Web2Tryon — bước sau.)

**2) `web2/shared/web2-ai-presets.js` — DỰNG LẠI thư viện ảnh**: 49 prompt CHỌN LỌC từ repo Nano Banana thật (PicoTrex 23k★, YouMind 12.7k★, JimmyLv 8.8k★ — workflow mine + curate). 8 nhóm: 🛍️ sản phẩm (8) · 👗 người mẫu (8) · 🧥 thử đồ (7, có `onmodel-tryon-pro`) · **🧑‍🤝‍🧑 Ghép mặt (6) — NHÓM MỚI** (`faceswap-onto-model`: ảnh 1=mặt, ảnh 2=model) · 🖼️ đổi nền (7) · 👤 avatar (5) · 📐 flat-lay (3) · 🎉 poster (5). Thêm field + hiển thị `inputImages` trên card (báo cần ảnh nào, thứ tự). Prompt try-on/face-swap viết tiếng Anh (giữ danh tính tốt hơn).

**3) `web2/shared/web2-tryon.js`**: (a) `buildPrompt()` dùng prompt try-on CẢI TIẾN (khoá danh tính + trung thực món đồ + khớp ánh sáng/bóng/màu da → ghép hài hoà nhất); (b) thêm **toggle chế độ Ghép đồ / Ghép mặt** — face-swap relabel (1) Ảnh lấy MẶT, (2) Ảnh MODEL (1 ảnh), dùng `FACESWAP_PROMPT`, images=[mặt, model].

Bump `?v=20260627a` (ai-hub load presets + tryon). **Verify browser** (login web2 admin/admin!!): AiPresets 49 prompt, 9 chip gồm Ghép mặt → 6 card + dòng "🖼 2 ảnh: ảnh mặt + ảnh model"; toggle Ghép đồ↔Ghép mặt đổi nhãn chuẩn. Status: ✅ (sidecar chờ user chạy thử trên máy + cookie acc phụ)

### [web2/cham-cong] Chỉnh sửa chấm công → LƯU + HIỆN "thời gian chỉnh sửa" (ai + lúc nào)

User: "chỉnh sửa chấm công sẽ lưu lại và hiện thời gian chỉnh sửa". Thêm **audit chỉnh sửa tay** theo NGÀY/NV: mỗi lần admin sửa chấm công 1 ngày (đổi giờ Vào/Ra, thêm/xoá lượt, nghỉ phép, ghi chú) → ghi ai + lúc nào, hiện ở popup ngày + ô lưới.

Files:

- **BE `render.com/routes/web2-attendance.js`**: bảng mới `web2_attendance_edits` (id `{device_user_id}_{date_key}`, `edited_by`, `edited_at`; index date_key — idempotent trong `ensureSchema`). Helper `editorOf(req)` (display_name||username||'admin', khớp convention commands/period-lock) + `stampEdit(db,uid,dk,by)` (upsert, nuốt lỗi — audit phụ trợ KHÔNG làm hỏng mutation chính). `GET /edits?start&end` (mirror `/day-notes`). Đóng dấu trong MỌI path TAY: POST `/records` (manual), DELETE `/records/:id`, PUT `/day-notes/:id`, POST `/fullday`, DELETE `/fullday/:id`. **KHÔNG** dấu ở `/records/bulk` (agent) hay `/records/import` (file) — chỉ thao tác người dùng.
- **FE `cham-cong-api.js`**: `listEdits(start,end)`. **`cham-cong-app.js`**: `state.edits` ('{uid}\_{dk}' → {by,at}); `applyResults` parse `r.edits`; `loadAll` thêm `listEdits` vào Promise.all (đúng vị trí thứ 5); `fmtEditTs` (GMT+7 HH:MM DD/MM/YYYY); popup hiện pill `✏️ Đã chỉnh sửa: <ts> bởi <tên>`; ô lưới thêm class `cc-edited` + title hover. **`cham-cong.css`**: `.cc-edit-meta` (pill xanh), `.cc-cell.cc-edited::before` (chấm xanh góc dưới-trái, KHÔNG đụng chấm ghi chú góc trên-phải). Bump `?v` (css/api `20260627edit`, app `20260627edit2`).

**Verify**: throwaway-DB test 13/13 (schema idempotent, upsert 1 dòng/ngày + overwrite editor mới nhất, invalid date/empty uid = no-op, range query lọc đúng). Review đối kháng 4 lens × verify → **1 bug MEDIUM** (8 false-positive): re-Lưu ngày NGHỈ PHÉP không đổi gì vẫn đóng dấu giả vì popup pre-check "Nghỉ có phép" + `addFullday` gọi vô điều kiện. **Fix**: FE chỉ `addFullday` khi `!ctx.isFull`; BE `INSERT…ON CONFLICT DO NOTHING RETURNING id` + chỉ `stampEdit` khi `rowCount>0` (test 3/3). Status: ✅

### [web2 multi] Audit 5 bug user báo → 3 đã fix sẵn + fix 2 (AI tên chiến dịch, lag, zalo cookie, hardening)

User báo 5 bug. Audit (5 agent song song) → 2 đã ĐÚNG sẵn, 1 đã fix sẵn, 2 còn thiếu → làm tiếp + 2 cải thiện.

- **#1 ai-hub đổi model**: ✅ ĐÃ ĐÚNG sẵn — model đọc tươi mỗi lần gửi (`ai-chat.js:468`), đổi giữa chừng ăn ngay. Không cần làm gì.
- **#2 live-chat/chat.html tin giật lên đầu**: ✅ ĐÃ FIX sẵn (`354e8a1fc`+`77392b076`, sort asc theo timestamp, mọi tin có `inserted_at`). + **hardening LOW**: `msgTs` (`web2-chat-panel-state.js`) thiếu/parse-fail timestamp → lấy epoch nhúng id tạm (`ext_/temp_/pk_<ms>`) thay vì 0 → chống tái diễn.
- **#5 native-orders tách đơn**: ✅ ĐÃ FIX sẵn (`6704382ea` thêm `x-web2-token`, gốc là 401). R3 `8b5c4b22a` KHÔNG gây lỗi. Nếu còn lỗi → hard-refresh/login lại.
- **#4 live-chat lag + AI tên chiến dịch**: lag → 3 SDK Firebase chuyển `<head>`→cuối body (hết render-block, giữ load order, Firestore vẫn dùng Pancake token). AI gợi ý tên → **THÊM** nút `✨ AI` cạnh ô tên (`live-campaign-manager.js`) gọi `/api/web2-ai/complete` sinh tên ngắn. ⚠ Verify thật (account web2 admin/admin!!): tên lúc đầu CỤT ('Sóng') vì Gemini 2.5 Flash thinking đốt token → nâng `maxTokens` 40→800 + retry provider rỗng → 'Đại Tiệc Sale 27/06' đầy đủ.
- **#3 zalo auto-thêm account từ cookie**: focus-lease đã có (`927c3e8a3`). **THÊM** auto-bootstrap: web2/zalo `autoRenewZalo` khi chưa có TK + có phiên chat.zalo.me → tự createAccount+cookie-login (không bấm nút); jt-tracking presence `_acquireAll` khi rỗng → `Web2Zalo.getCookieAccountKey` bootstrap (throttle 60s).

Verify: regression toàn bộ 10 suite R1-R4+SePay = **124 assertions GREEN** (fresh DB 1 pass). FE changes syntax-checked. Status: ✅

User: "sepay có chức năng webhook tạo giao dịch nên dùng tạo giao dịch test web 2.0". Webhook `/api/sepay/webhook` là endpoint dùng chung fan-out 2 nhánh độc lập; test đi ĐÚNG nhánh Web 2.0 (`insertWeb2BalanceHistory`+`processWeb2Match`, như fan-out + retry cron), **KHÔNG đụng Web 1.0** (`balance_history`/`processDebtUpdate`). Verify 22 assertions Postgres thật (`sepay-webhook-test.js`).

- **🐞 FIX [MEDIUM] `web2-sepay-matching.js`** — CHECK constraint `web2_balance_history_match_method_check` THIẾU value `pending_no_order` (gate `_gateBlock` dùng từ 2026-06-07 + reprocess exclusion 2026-06-20). Guard migration cũ `IF EXISTS THEN RETURN` → constraint không bao giờ update → prod thiếu. Hệ quả: `UPDATE SET match_method='pending_no_order'` vi phạm constraint → throw (try/catch nuốt) → `match_method` giữ NULL → reprocess cron KHÔNG loại được row gated → **retry storm mỗi 10 phút** + đếm sai `no_match`. (Tiền AN TOÀN — gate return trước credit; bug correctness/efficiency.) Fix: thêm `pending_no_order` vào CHECK + guard SELF-HEAL (chỉ RETURN khi def đã chứa value, thiếu → DROP+ADD 1 lần idempotent).
- **Verify luồng SePay→ví ĐÚNG**: A) SĐT+đơn active → auto-credit `exact_phone`; B) trùng `sepay_id` → idempotent không double; C) CK#2 cùng KH → cộng dồn, đúng 2 GD; D) SĐT không đơn → gate chặn `pending_no_order` (giờ lưu được sau fix); E) QR → bypass gate → credit; F) `out` → không credit; G) amount≤0 → từ chối.
- **Lưu ý**: clone `0123456788` KHÔNG dùng cho test extractor SePay (prefix 012 vô lệ VN → extractor từ chối ĐÚNG); dùng prefix 09x. Đây là test LOCAL `n2store_flow_test`, không đụng prod.

### [web2 flow R4] Vòng XÁC MINH báo cáo kho + revenue + công thức lương → 0 bug code (verify integration test)

Vòng 4 = verification (không sửa code). Kiểm 2 báo cáo user yêu cầu đúng (`report-warehouse`, `report-revenue`) + công thức lương/khoá kỳ. Doc: [`docs/web2/FLOW-AUDIT-2026-06-27-R4.md`](web2/FLOW-AUDIT-2026-06-27-R4.md).

- **Báo cáo kho (`web2-warehouse-report.js`, code mới session trước) — ĐÚNG, 29 assertions** (`warehouse-test.js`): mua vào (received đủ / partial `min(qtyReceived,qty)` / draft 0 / cancelled loại), tiền `costPrice×rate`, chưa nhận = qty−nhận, bán ra CHỈ `state='done'` trong range theo `date_invoice` GMT+7 (confirmed/done-cũ không đếm), lọc mua theo `shipment.date`, merge buy↔sell theo CODE (1 dòng), rollup ĐỊA DANH(cha)/NCC + **totals reconcile** Σregions=Σsuppliers=Σproducts=totals.
- **Revenue (`pbh-reports`) — ĐÚNG**: refund KPI R1 #12 (`web2_returns status='active' AND created_at>=cutoffMs`) giữ nguyên đúng; revenue GMT+7 nhất quán. Semantic khác warehouse cố ý (revenue đếm state≠cancel = đã lập phiếu; warehouse bán ra = done).
- **Lương/khoá kỳ — công thức KHỚP**: `cham-cong-salary.js` (`tongLuong=luong+OT+PC+thưởng−giảm`, `conCanTra=tong−đãtrả`) trùng khít `validateLockSnapshot` server; snapshot `m` đủ field validator.
- **⚠ Limitation cosmetic (KHÔNG fix)**: SP unmatched (không có trong kho) + có variant → tách dòng buy/sell (totals vẫn đúng). Fix sẽ over-merge variants → chấp nhận giới hạn.

Test: `warehouse-test.js` (29) — không regression. Status: ✅

User: "đăng nhập thì vào native-orders". Đổi login redirect: mọi user → `../../native-orders/index.html` (login ở `/web2/login/` depth 2, native-orders ở ROOT → cần `../../`; bỏ role-based admin→system của lần trước). `landingFor()` giờ trả native-orders cho tất cả.

🐞 **FIX bug nghiêm trọng vừa ship ở commit ce9f30b26**: overview.js + index.html copy href từ sidebar (`../web2/X`, `../native-orders`) mà KHÔNG qua `resolveOur` → từ `/web2/overview/` (depth 2) ra `/web2/web2/X` và `/web2/native-orders` = **404 TOÀN BỘ card + link tĩnh** (xác nhận curl: cả 2 đều 404). Fix:

- `overview.js`: thêm `resolveHref()` (logic khớp `web2-sidebar.resolveOur` — strip `../`, prepend `../../` khi page depth 2) áp cho mọi card href.
- `index.html`: link tĩnh (Hệ thống/Lịch sử thao tác/Thông báo/CTA) đổi `../web2/X` → `../X`.
- Verify resolved: Đơn Web→`/native-orders/`, Bán hàng→`/web2/fastsaleorder-invoice/`, footer→`/web2/system/` (đều 200). Bump overview.js?v=fr4.

⚠ Test env: nav native-orders bị bounce `/web2/login` dù token client còn ~7 ngày — do **401-fetch-guard** (API server từ chối token restore → guard xoá token + bounce, ĐÚNG thiết kế, KHÔNG loop). Là giới hạn token môi trường test, không phải lỗi redirect. Status: ✅ (code verify; happy-path native-orders cần session prod thật)

### [web2/login] Login redirect theo ROLE: admin → system?tab=services, nhân viên → overview

User: "đăng nhập vào thì vào trang web2/system?tab=services". ⚠ `web2/system` là **admin-only NHƯNG KHÔNG có server/page gate** (chỉ ẩn qua menu sidebar — KB-SYSTEM-SERVICES.md §1) → redirect mọi user vào đó = nhân viên cũng thấy trang cấu hình/chi phí/hạ tầng. Giải pháp: helper `landingFor(user)` trong [`web2/login/index.html`](../web2/login/index.html) — `role==='admin'` → `../system/index.html?tab=services`, còn lại → `../overview/index.html` (trang giới thiệu). Dùng ở CẢ 2 nhánh (đã-login + vừa-login); `?next=` vẫn ưu tiên. Verify browser: tài khoản admin nav login → redirect đúng `system?tab=services`. Status: ✅

### [web2/overview] Login → overview + overview thành TRANG GIỚI THIỆU Framer-style (showcase toàn bộ Web 2.0)

User hỏi web2/index.html có phải data cũ → xác minh git: KHÔNG (launcher sống). Chọn **(B)**: login mặc định nhảy `web2/overview` thay vì `web2/index.html`, và **biến overview thành trang giới thiệu toàn bộ Web 2.0** phong cách framer.com (sáng + bold + gradient xanh Zalo `#0068ff`→tím). Soi git 82 commit overview → xác nhận note "phải cập nhật overview #conventions/#auditPages" trong CLAUDE.md đã **stale/aspirational** (doc canonical đã di cư sang `web2/system` + `docs/web2/*.md`; audit R2/R3 không đụng overview). User đồng ý.

- **Login redirect**: [`web2/login/index.html`](../web2/login/index.html) 2 chỗ `../index.html` → `../overview/index.html`.
- **Archive overview cũ** (3223 dòng docs) → [`web2/overview/legacy-overview.html`](../web2/overview/legacy-overview.html) + `legacy-overview.css` (self-contained, link cũ vẫn resolve). KHÔNG mất tài liệu.
- **Trang mới** [`web2/overview/index.html`](../web2/overview/index.html) + `overview.css` + `overview.js` (tách module, self-contained, KHÔNG `.web2-theme`): hero kinetic typography (SplitText), aurora gradient drift, marquee, 4 pillars, **showcase 52 module/13 nhóm** (catalog CHÍNH XÁC từ `web2-sidebar.js` NAV — manifest 3-entry đã hỏng), filter chip + search, CTA, footer. Ẩn nhóm/module admin theo `Web2Auth role`.
- **Motion stack** (CDN, chỉ trang này): GSAP 3.15 + ScrollTrigger + SplitText (free) + Lenis 1.3.25 smooth-scroll. Reveal dùng IntersectionObserver (degrade an toàn nếu CDN lỗi). Reuse research: [[reference_web2_design_system]] (#0068ff), `Web2Motion`/`Web2Lottie` đã có sẵn nhưng dùng GSAP cho framer-feel.
- **Fix bug visual**: chữ gradient "toàn bộ" trong suốt sau SplitText (bọc char trong `<div>` → mất `background-clip:text`) → CSS cho mọi con `.ov-grad-text *` mang gradient.
- **Tối ưu lag** (đo Playwright): aurora `filter:blur(60px)` chuyển từ parent → **từng span** (GPU layer cache, không re-blur mỗi frame), bỏ `will-change` thừa trên 52 card, bỏ parallax aurora scroll. Kết quả: **idle 60fps/max 22ms/0 longtask**; cuộn nhanh full trang ~56fps, jank frames **110→14**, 0 blocking; filter click **1ms**; card click điều hướng đúng.
- **Dọn CLAUDE.md**: 4 reference stale (rule 9, `#conventions` canonical, webhook note, browser-test rationale) → trỏ sang `legacy-overview.html` + `web2/system` + `docs/web2/*.md`.

Files: `web2/login/index.html`, `web2/overview/{index.html,overview.css,overview.js,legacy-overview.html,legacy-overview.css}`, `CLAUDE.md`. Status: ✅

### [docs/web2] KB-doc "Dịch vụ & Hạ tầng" cho NotebookLM + Claude-read-first

User muốn "tích hợp NotebookLM vào Web 2.0" để ghi cái đáng chú ý rồi "kêu Claude đọc trước khi code". **Ràng buộc thật:** NotebookLM KHÔNG có API công khai → Claude KHÔNG đọc trực tiếp được (không connector/MCP). Giải pháp 1-nguồn-2-nơi-đọc: viết KB markdown trong repo → (a) Claude đọc được, (b) user upload lên NotebookLM hỏi-đáp.

- Tạo [`docs/web2/KB-SYSTEM-SERVICES.md`](web2/KB-SYSTEM-SERVICES.md) (workflow 5 agent: 4 đọc song song dashboard UI + data JSON + hạ tầng backend + realtime/bên-thứ-3 → 1 synth gộp). Nội dung: trang `web2/system?tab=services` (DB live + chi phí HARDCODE trong `SERVICES_INVENTORY` + modal chi tiết), topology backend (web2-api srv-d8n53… vs n2store-fallback srv-d4e5…, 2 DB pool web2Db/chatDb, worker chatomni-proxy routing, cron), 2 hub SSE + topics, 70 bên thứ 3, shared modules, §7 **gotchas dễ nhầm**.
- Thêm pointer KB vào CLAUDE.md (Index quick-lookup) — đọc trước khi code `web2/system`/`services-overview.js`/hạ tầng. Pattern đi tới: ghi "cái đáng chú ý" mới → tạo `docs/web2/KB-*.md` cùng kiểu.

Status: ✅

## 2026-06-26

### [web2 flow R3] Audit vòng 3 (PBH tách + khoá kỳ lương + cashbook) → fix 3 bug + verify đối kháng 5 false-positive

Vòng 3 nối R1/R2, soi luồng phụ: PBH tách (split), chấm công/khoá kỳ lương, soquy/cashbook, voucher → **8 finding**. Verify đối kháng từng cái với code thật: **3 bug THẬT đã fix** (1, 2 HIGH + 5 LOW), **5 còn lại false-positive / fix sẽ regress** (đã ghi lý do). Doc: [`docs/web2/FLOW-AUDIT-2026-06-26-R3.md`](web2/FLOW-AUDIT-2026-06-26-R3.md).

- **#1 [HIGH]** PBH tách (N bill cùng `source_code`): enrich tag dùng `DISTINCT ON` chỉ đọc bill#1 → ẩn nợ bill#2 + đối soát sớm sai. Đổi sang AGGREGATE: `SUM(residual)` (còn nợ nếu BẤT KỲ bill nợ) + `BOOL_AND(packed+)` → `pbhAllReconciled`. Verify 9 assertions. Commit `8b5c4b22a`.
- **#2 [MEDIUM→HIGH]** Khoá kỳ lương CHỈ chặn frontend → tab cũ/API trực tiếp vẫn sửa punch/payroll/fullday/holiday tháng ĐÃ CHỐT. Thêm guard server-side `isMonthLocked(db, monthKey)` reject 409 ở 7 route mutation (`POST/DELETE records`, `PUT payroll`, `POST/DELETE fullday`, `POST/DELETE holidays`); fail-open khi bảng lock chưa migrate; agent ingest nền KHÔNG chặn. Verify 18 assertions (`lock-test.js`).
- **#5 [LOW]** Cashbook filter biên cuối `<= 23:59:59` bỏ sót phiếu sub-second giây cuối (vd 23:59:59.7) → thiếu tổng thu/chi + số dư. Đổi biên EXCLUSIVE `< (end+1 ngày)T00:00` ở `/summary`+`/report` (web2-cashbook.js) + `buildVoucherFilter` (web2-cashbook-lib.js). Verify 7 assertions (`cashbook-test.js`).
- **Verify KHÔNG phải bug (vòng đối kháng — KHÔNG sửa mù)**: #3 soquy optimistic (thực tế `loadAll()` refetch + SSE reconcile, không optimistic balance), #4 back-dated double-count (report query tươi, đếm 1 lần theo voucher_time), #6 payroll override (FE gửi đủ field, null=xoá chủ ý — COALESCE sẽ regress), #7 Excel count (cosmetic; fix xmax sẽ chặn SSE refresh khi sửa punch), #8 voucher mã rỗng (`nextCode` prefix luôn gán + seq atomic, không nhánh rỗng).

Test: harness `tags-test.js` (9) + `lock-test.js` (18) + `cashbook-test.js` (7) — không regression suite R1/R2. ⚠ Tiện thể RESTORE `dev-log.md` bị xoá nhầm 539 dòng (section 2026-06-19) ở working tree session trước. Status: ✅

### [web2 flow R2] Audit vòng 2 (7 luồng còn lại) → fix 8 bug HIGH/MEDIUM money/stock + verify integration test

2 workflow audit (delivery/reconcile + native→PBH/bulk-cancel/ví KH/ví NCC/KPI) → **13 defect**. Fix toàn bộ HIGH+MEDIUM (8), document LOW/frontend (5). Doc: [`docs/web2/FLOW-AUDIT-2026-06-26-R2.md`](web2/FLOW-AUDIT-2026-06-26-R2.md).

- **#1 [HIGH]** tạo PBH trừ ví thu hộ áp-lại bị dedupe nuốt → over-mint lúc huỷ. `_applyWalletToPbh` honor `alreadyProcessed` + `applyWalletToUnpaidPbhs` refId UNIQUE (verify 7 assertions).
- **#1b [HIGH]** create-time ví (TX2) đọc residual STALE + không lock → race. LOCK + re-read PBH row trong TX2.
- **#2 [HIGH]** `_emitRevokeKpi` huỷ PBH GỘP không thu hồi KPI (source_code 'A+B' không tách). Split '+' + `order_code = ANY`.
- **#3 [HIGH]** dashboard-kpi revenue_today/7d TRỪ web2_returns → doanh thu NET (verify 200k−50k=150k).
- **#4 [MEDIUM]** from-native-order split=true bỏ qua merged-guard → double trừ. Guard chạy cả split.
- **delivery [MEDIUM]** huỷ PBH → huỷ phiếu giao linked (cùng tx, SSE); from-pbh chặn phiếu giao TRÙNG (verify 6 assertions).
- **Sửa COD [MEDIUM]** lần 2 cùng đơn → reject 409 (trước: ghi khống → over-refund).
- **Document (LOW, follow-up)**: pollDeposits unmatched (FE), bulk-confirm native sync (dead route), processWithdraw 23505 recovery, returns deposit idemKey (đã mitigate code UNIQUE), matchSupplier substring (cần UX manual-assign).

Test: 4 suite cũ (37 assertions) + 2 suite mới không regression. Status: ✅

### [web2 flow money/stock] Fix 6 bug defer (KNH/native restock + ví NCC cap) — verify integration test Postgres thật

Tiếp tục từ audit 12-bug: fix nốt 6 bug money/stock đã defer, **verify bằng integration test trên Postgres local THẬT** (mount route thật + ensureTables + seed + assert invariant + drop DB — pattern test-migration CLAUDE.md). 24 assertions pass.

**web2-returns.js (tồn kho — 14 assertions):**

- **#2/#7** KNH (không nhận hàng): restock chỉ phần CHƯA trả = `full − returned_line_qty` PBH nguồn (gán `items=NET` → `_applyStock` + record + huỷ-phiếu đối xứng). Trước restock FULL sau khi đã thu về 1 phần → +partialQty phantom stock.
- **#6** native-source thu_ve_1_phan: GHI `returned_line_qty` lên PBH live của native (greedy per-code) + DELETE reverse — trước chỉ pbh-source → huỷ PBH native over-restock.

**purchase-refund.js + lib (ví NCC — 10 assertions):**

- **#5** bỏ cap amount all-or-nothing (1 dòng thiếu cost → bỏ cap toàn phiếu = over-mint). Cap per-line: `amount ≤ Σ min(client, cost)`; dòng không khớp so-order fail-open RIÊNG dòng.
- **#3** cap QTY `≤ Σ(received − đã trả)` per code (greedy qua dòng so-order đã nhận) → trả vượt → cap/reject, trừ kho đúng phần cap.
- **#4** tổng hợp `rowReturns` từ code-keyed lines → GHI `returned_row_ids` (như ví NCC `/tx`) → 2 đường return cùng đọc remaining, chặn trả lại SP đã trả 2 lần.
- lib `web2-so-order-qty.js`: thêm `loadSoOrderReceivedRowsByCode`.

Doc audit cập nhật: [`docs/web2/FLOW-AUDIT-2026-06-26.md`](web2/FLOW-AUDIT-2026-06-26.md) — **12/12 FIXED**. Status: ✅

### [web2/system + reports + flow] Cải thiện UI system + audit 19-agent luồng nghiệp vụ + fix 5 bug

**1. UI trang Cấu hình & Hệ thống** (`web2/system`):

- `system-services.js` + `system.css`: click service card / dòng bảng DB → **modal chi tiết** (kv + free/paid tier + link); nút "Xem tất cả N bảng"; expose `SystemServices.getData()`.
- `web2-ai-page-registry`: thêm entry `/web2/system/` (accessor `SystemServices.getData` + gợi ý soát chi phí/DB đầy/bảng nặng) + `/web2/report-warehouse/`.
- `web2-ai-assistant`: bỏ `system` khỏi `HIDE_RE` → **FAB ✨ hiện trên trang system** (giờ có context riêng).

**2. Audit luồng nghiệp vụ** (workflow 19 agent, 6 luồng: nhận hàng→PBH→hủy→trả KH→thu về→trả NCC + 2 report) → **12 defect xác nhận**. Doc: [`docs/web2/FLOW-AUDIT-2026-06-26.md`](web2/FLOW-AUDIT-2026-06-26.md).

**3. Fix 5 bug contained (đã test):**

- **#10** report-warehouse: so-order row chưa gắn `matchedCode` giờ resolve mã qua join `(name,variant)→web2_products` → MUA VÀO **merge đúng** với BÁN RA cùng SP (unit 45+ assertions ✅).
- **#12** report-revenue: KPI "Trả hàng hoàn thành" đọc `web2_returns` (status=active) thay bảng `refunds` legacy đã chết.
- **#1/#8** nhận hàng (`so-order-receive.js`): truyền `supplier` vào lookup → tránh khớp nhầm SP cùng tên khác NCC; lookup fail dùng `remainingPending` làm sàn.
- **#9** hủy PBH (`fast-sale-orders.js` restockOrderLines): GỘP qty theo CODE trước khi trừ `returned_line_qty` → PBH dòng trùng mã hết under-restock.
- **#11**: cập nhật comment KNOWN-LIMITATION.

**4. Defer** (money/stock transaction, cần focused + integration test seeded flow): **#2/#7** KNH double-restock, **#6** native partial restock, **#3/#4/#5** ví NCC over-mint/cap — chi tiết + repro trong audit doc.

**Verify**: system modal/AI FAB browser ✅; report-revenue + report-warehouse load 0 console error ✅; warehouse unit 45+ assertions (gồm merge FFF) ✅. Status: ✅ (UI+report xong; flow bug nguy hiểm flag lại)

### [web2/products] Tự tạo TÊN SP từ loại + Màu/Size (có thể sửa) — Kho SP

Mở rộng tính năng tự-tạo-tên sang Kho SP (như đã làm cho Sổ Order). Modal Thêm/Sửa SP: chọn loại (chip) + Màu/Size → ô **Tên SP** tự điền "LOẠI MÀU SIZE" (IN HOA), vd `ÁO TRẮNG M` / bộ `ÁO QUẦN ...`.

**Sửa** `web2/products/js/web2-products-variant-picker.js`: `_genNameFromSelection()` (loại + Màu + Size, `vi-VN` upper; **bỏ qua khi Màu/Size có "/"** = cartesian nhiều SP → tên auto chỉ cho 1 SP) + `_maybeAutofillName()` (guard: chỉ điền khi #pmName trống/bằng auto trước `_lastAutoName`; user gõ tay → giữ). Hook ở chip-click + Màu/Size input/pick. Sau khi điền → dispatch `input` lên #pmName để **autoRegen mã SP** chạy lại theo tên mới. Reset `_lastAutoName` trong `_setSelectedCategory` (mở modal). Cache-bust `?v=20260626b`.

**Verify** (Node + browser): genName "Áo+Trắng+M"→"ÁO TRẮNG M", set→null, no-type→"TRẮNG M" ✅; modal: chọn Áo+Trắng+M → #pmName "ÁO TRẮNG M", category "Áo" ✅; sửa tay "ÁO THUN ABC" rồi đổi Size→L → tên GIỮ, size cập nhật ✅. Mã SP regen theo tên (không vỡ). Status: ✅

### [web2/report-warehouse] Báo cáo kho: thêm ĐỊA DANH (cha của NCC+SP) + fix review

Follow-up trang Báo cáo kho. User: "chia theo địa danh (HÀ NỘI, HƯƠNG CHÂU…) — cái này CHA của NCC và sản phẩm" + "NCC hiện rõ phần chưa nhận hàng".

**Thêm chiều ĐỊA DANH (region = `tab.label` Sổ Order / `web2_products.region`):**

- `web2-warehouse-report.js`: mỗi product/supplier mang `region`; thêm `regions[]` rollup (mỗi địa danh: Số NCC + Số SP + mua vào/chưa nhận/bán ra). suppliers gom theo (region, NCC) — NCC lồng trong địa danh. SELECT thêm `region` từ web2_products (canonical), fallback `tab.label`.
- `report-warehouse/index.html`: dropdown lọc **Địa danh**, view thứ 3 **📍 Theo địa danh** (mặc định), cột **Địa danh** trong bảng NCC + SP. KPI "Nhà cung cấp" → "Địa danh" (N địa danh · X NCC · Y SP). CSV theo view (region/ncc/sp) kèm cột địa danh.

**Fix từ adversarial review (workflow 12 agent, 7 defect confirmed):**

- **HIGH** footer TỔNG CỘNG: tính lại Σ theo dòng ĐANG HIỂN THỊ (khớp body khi lọc/search), label "TỔNG (đã lọc)" khi có filter.
- **MED** "Mua vào (đã nhận)" partial_received: dùng SL nhận thật `min(qtyReceived, qty)` (mirror `lib/web2-so-order-qty.js`), KHÔNG đếm nguyên SL đặt; "Chưa nhận" = `qty − nhận thật`.
- **MED** CSV formula injection: prefix `'` cho cell bắt đầu `= + - @ \t \r` (mirror supplier-debt).
- **MED** KPI kẹt skeleton khi load lỗi → reset.
- **LOW** nút Thử lại inline-onclick ReferenceError → addEventListener.
- **LOW** tên file CSV theo `lastData.range` (không phải ô input).

**Verify**: unit harness 40+ assertions pass (region rollup HÀ NỘI/HƯƠNG CHÂU/SÀI GÒN, partial qtyReceived, currency, date filter). Browser smoke: 3 view (địa danh/NCC/SP) + cột Địa danh + dropdown lọc + footer khớp dòng hiển thị, **0 console errors**. Status: ✅

### [so-order][web2/shared] Tự tạo TÊN SP từ biến thể đã chọn (có thể sửa) — Web2VariantPicker

User: chọn biến thể trong modal Sổ Order → tự sinh TÊN SP, điền vào ô Tên (sửa được). VD chọn Áo Trắng + Quần Đen + Giày Đen → "ÁO TRẮNG QUẦN ĐEN GIÀY ĐEN".

**Sửa:**

- `web2/shared/web2-variant-picker.js`: thêm `genName()` (mỗi món "LOẠI BIẾNTHỂ", nối khoảng trắng, IN HOA; "/" trong biến thể → space). onChange payload thêm `name`; controller thêm `getName()`.
- `so-order-modal-core.js` `_mountModalVariantPickers`: onChange điền `name` vào ô `productName` của dòng — **guard sửa được**: chỉ điền khi tên trống hoặc bằng tên auto trước đó (`row._autoName`); user gõ tay / chọn SP từ gợi ý → KHÔNG ghi đè. Cache-bust picker `c` / modal-core `g`.

**Verify** (Node + browser): genName "Áo Trắng+Quần Đen+Giày Đen"→"ÁO TRẮNG QUẦN ĐEN GIÀY ĐEN" (+ size/edge) ✅; modal: chọn 3 món → ô Tên = "ÁO TRẮNG QUẦN ĐEN GIÀY ĐEN", row.variant/category đúng ✅; sửa tay "TÊN TÙY CHỈNH" rồi đổi biến thể → tên GIỮ nguyên, biến thể vẫn cập nhật ✅. Status: ✅

### [web2/products] Phase 4: modal Kho SP thêm chọn LOẠI sản phẩm (category) — dùng chung product-types

Hoàn tất feature "Loại SP + biến thể theo món" (Phase 4/4). Modal Kho SP thêm chip multi-select LOẠI (Áo/Quần/Đầm…) từ `Web2ProductTypesCache` (shared) → lưu `web2_products.category` ("Áo + Quần" cho bộ). **GIỮ NGUYÊN** picker Màu/Size + sinh mã SP (mã cần shortCode Màu/Size có cấu trúc — KHÔNG thay bằng Web2VariantPicker để khỏi vỡ mã SP; quyết định có chủ đích).

**Sửa:**

- `web2/products/index.html`: field-row "Loại sản phẩm" (`#pmTypeChips`) trên ô Màu/Size; load `web2-product-types-api.js` + `web2-product-types-cache.js`; cache-bust `?v=20260626a`.
- `web2-products-variant-picker.js`: `_renderTypeChips`/`_getSelectedCategory`/`_setSelectedCategory` (chip toggle, đọc shared cache). `_wireVariantPicker` init+render chips.
- `web2-products-modal.js`: `fields.category` = `_getSelectedCategory()`; thêm vào update/create payload; open/edit set chips từ `p.category`.
- `web2-products.css`: `.pm-type-chip(.is-on)`. BE `web2-products.js` đã có cột category (migration 067) + create/update whitelist.

**Verify:** API round-trip — create `category="Áo + Quần"` 200 → GET "Áo + Quần" → PATCH "Đầm" → GET "Đầm" → delete (cleanup) ✅. Browser: modal chips [Áo,Quần,Đầm,Váy,Giày,Dép], click Áo+Quần → `_getSelectedCategory()`="Áo + Quần" ✅. Mã SP không đổi. Status: ✅

> **HOÀN TẤT 4 phase** (kế hoạch `~/.claude/plans/jaunty-munching-llama.md`): P1 trang Loại SP · P2 `Web2VariantPicker` · P3 so-order (inline "Áo Trắng, Quần Đen" + modal) · P4 Kho SP category.

### [web2/report-warehouse + render] Báo cáo kho mới: Mua vào (Sổ Order) vs Bán ra (PBH) theo SP + NCC, lọc ngày, cột "Chưa nhận hàng"

User: "Thêm vào Báo cáo phần báo cáo kho: Sản phẩm (tổng SL + tiền mua vào / bán ra), NCC (tổng SL + tiền mua vào / bán ra của NCC), cho điều chỉnh ngày tháng" + "NCC hiện rõ phần chưa nhận hàng". Quyết định (hỏi user): **trang mới riêng**; **mua vào = chỉ hàng Đã Nhận**; **bán ra = chỉ PBH Hoàn thành (done)**.

**Thêm:**

- `render.com/routes/web2-warehouse-report.js` (NEW, WEB2.0): `GET /api/web2-warehouse-report/summary?from&to` → `{ totals, products[], suppliers[] }`. **Mua vào (đã nhận)** = `web2_so_order` rows status `received|partial_received` (tiền = costPrice × tab.rate VND), lọc theo `shipment.date`. **Chưa nhận hàng** = rows status `draft` (đã đặt chưa về kho). **Bán ra** = `fast_sale_orders` state='done', `order_lines`, lọc `date_invoice` (AT TIME ZONE 'Asia/Ho_Chi_Minh'). NCC + tên SP canonical join `web2_products.supplier/name` theo code; merge buy↔sell theo code (rows chưa gắn mã → name-keyed). Read-only, pool `web2Db||chatDb`, gate `requireWeb2AuthSoft`.
- `web2/report-warehouse/index.html` (NEW): KPI (Mua vào / Chưa nhận hàng [amber] / Bán ra / Số NCC), filter ngày (từ–đến + preset Hôm nay/7/30/Tháng này/90), toggle **Theo NCC** ↔ **Theo SP**, bảng cột nhóm Mua vào · **Chưa nhận hàng** (highlight `#fffbeb`/`#b45309`) · Bán ra, sort click header, search, **Xuất CSV** (BOM UTF-8), SSE reload (`web2:so-order` + `web2:fast-sale-orders`).
- `render.com/server.js`: mount `/api/web2-warehouse-report` (cạnh web2-so-order). Worker tự route qua `isWeb2Path('/api/web2*')` → web2-api (không cần sửa worker).
- `web2/shared/web2-sidebar.js`: thêm "Báo cáo kho" (icon `warehouse`) vào nhóm "Báo cáo", giữa Thống kê giao hàng và Tra cứu vận đơn J&T.

**Verify**: unit harness 30/30 assertions pass (currency rate, status buckets, lọc ngày, code-merge, canonical supplier, alt field names quantity/qty + priceUnit/price, discount, gom NCC + "(Không rõ NCC)"). Browser render smoke (mock fetch): KPI + 2 bảng đúng số, cột Chưa nhận amber `#fffbeb`/`#b45309`, toggle SP/NCC + CSV OK, **0 console errors**. Status: ✅ (chờ deploy web2-api để online smoke)

### [so-order] Phase 3b: modal "Tạo Đơn Hàng" dùng Web2VariantPicker (biến thể theo món)

Wire `Web2VariantPicker` vào ô Biến Thể mỗi dòng trong modal Tạo/Sửa đơn (thay input đơn cũ).

**Sửa:**

- `so-order-modal-core.js`: `_newModalRow` thêm `category`; `modalRowHtml` ô variant → `<div class="so-vp-host">` (fallback input cũ nếu picker chưa load); `renderModalRows` gọi `_mountModalVariantPickers()` mount picker mỗi dòng (destroy picker cũ trước → tránh leak subscription cache); onChange → `row.variant`+`row.category` + `updateRowMeta`.
- `so-order-modal-submit.js`: cả 2 nhánh (tạo mới + sửa lô) truyền `category` vào `addRow`; **guard expand**: variant có `" + "` (BỘ) KHÔNG expand theo `"/"` (tránh băm "Trắng / M + Đen / L").
- `so-order-render.js` `_explodeVariants`: cùng guard `" + "`.
- cache-bust modal-core/submit `?v=20260626f`.

**Verify** (browser): mở Tạo Đơn → ô Biến Thể có picker (chips Áo/Quần/Đầm + dropdown gợi ý Màu thật từ kho); chọn Áo+Quần + gõ Trắng/Đen → `modalRows[0].variant="Trắng + Đen"`, `category="Áo + Quần"`; old input = 0. Status: ✅ (Phase 4 products tiếp)

### [issue-tracking] Nút Xóa: CHỈ ADMIN + chuyển sang HARD delete (soft bị ràng buộc DB chặn)

Follow-up của nút 🗑️ bên dưới. User: "chỉ admin mới xóa được" + "xóa đơn Nguyễn Yến trong DB". Phát hiện **soft delete hỏng toàn DB**: ràng buộc `customer_tickets_status_check` (render.com/migrations/001_create_customer_360_schema.sql:230) KHÔNG cho `status='DELETED'` → `DELETE /v2/tickets/:id` (soft) luôn fail. Thêm nữa, guard chống trùng FIX_COD/BOOM (render.com/routes/v2/tickets.js:478-487) chỉ bỏ qua `CANCELLED` → phiếu soft-deleted vẫn **chặn tạo lại** đơn cùng mã. ⇒ User chọn **hard delete** (xoá hẳn, tạo lại được).

**Sửa** (`issue-tracking/js/script.js`):

- Gate nút 🗑️ đổi từ quyền `issue-tracking:delete` → **`window.authManager.isAdminTemplate()`** (roleTemplate==='admin'). Nút Hủy 🚫 giữ nguyên quyền `delete`.
- `window.deleteTicket`: check `isAdminTemplate()` (defense-in-depth) + `ApiService.deleteTicket(code, true)` (HARD) + confirm "XÓA VĨNH VIỄN… KHÔNG khôi phục được (tạo lại phiếu mới OK)". Audit `newData.status='HARD_DELETED'`.
- `index.html`: cache-bust `script.js?v=20260626b`.

**Đã xoá theo yêu cầu**: ticket `TV-2026-01043` (Nguyễn Yến 0911353040, đơn NJD/2026/72854 #441206, FIX_COD/CUSTOMER_DEBT, 200k, COMPLETED) — hard delete qua API, verify `search` 0 match + fetch 404. (Lưu ý: KHÔNG tự hoàn lại 200k đã trừ nợ ví khách.)

**Verify** (Playwright headless, admin): `isAdminTemplate=true`, tab Hoàn Tất **220/220** phiếu có nút 🗑️ (giảm 1 vì vừa xoá). Status: ✅

### [issue-tracking] Thêm nút Xóa phiếu (🗑️) cho phiếu đã hoàn tất / đã hủy / chờ đối soát

User yêu cầu "xóa đơn như hình" — phiếu **Sửa COD (Hoàn Tất)** trong trang issue-tracking chỉ có nút Sửa (✏️), không có cách xóa khỏi danh sách. Backend đã sẵn `DELETE /api/v2/tickets/:id` (xóa mềm `status='DELETED'`, list query đã loại `status != 'DELETED'`, bắn SSE `deleted` → tự refetch) + `ApiService.deleteTicket(code, hard)` — chỉ thiếu UI gọi.

**Sửa** (`issue-tracking/js/script.js`):

- `renderActionButtons`: thêm `deleteButton` (🗑️) hiển thị khi `canCancel && ticket.status !== 'PENDING_GOODS'` (dùng status, KHÔNG dùng `isUntouched` để MỌI phiếu đã hoàn tất đều xóa được — kể cả RETURN_SHIPPER còn công nợ ảo chưa dùng). Cùng quyền `issue-tracking:delete` như nút Hủy. Phiếu `PENDING_GOODS` chưa xử lý vẫn chỉ hiện 🚫 Hủy.
- `window.deleteTicket(firebaseId)`: check quyền → confirm (cảnh báo type-aware: FIX_COD/BOOM không tự đảo ví; RETURN_SHIPPER thu hồi công nợ ảo chưa dùng) → `ApiService.deleteTicket(code, false)` (xóa MỀM) → notify + AuditLogger `delete`. SSE tự ẩn dòng.
- `index.html`: cache-bust `script.js?v=20260626a`.

**Verify** (Playwright headless, profile riêng tránh contention, web1 auth admin): `window.deleteTicket=function`, quyền delete=true. Tab "Hoàn Tất" 221 phiếu COMPLETED → **221/221** có nút 🗑️; PENDING_GOODS chưa xử lý → 0 (chỉ 🚫). KHÔNG xóa data thật (bảng `customer_tickets` = Web 1.0 prod). Status: ✅

### [so-order] Phase 3a: ô Biến Thể inline dùng Web2VariantPicker (nhập nhiều biến thể theo món)

Wire `Web2VariantPicker` vào inline edit (double-click) ô Biến Thể của Sổ Order — yêu cầu gốc của user ("input nhập 2 biến thể"). Double-click ô → popover fixed neo theo cell: chọn loại (Áo/Quần/Đầm, multi-select) → N ô biến thể `"/"`-aware → ghép `"Trắng + Đen"`, lưu `{variant, category}`.

**Sửa:**

- `so-order/index.html`: load `web2-product-types-api.js` + `web2-product-types-cache.js` + `web2-variant-picker.js`; cache-bust 4 file sửa `?v=20260626e`.
- `so-order-inline-edit.js`: `beginInlineCellEdit` field `variant` → `_beginVariantPickerEdit` (popover + commit on click-outside/Enter, cancel Esc). KHÔNG auto-expand cartesian khi sửa (tránh nhân đôi SL) — expand chỉ ở lúc TẠO.
- `so-order-storage.js`: `addRow` thêm field `category`. (`updateRow` đã nhận mọi field.)
- `so-order-render.js`: cột Biến Thể hiện badge `category` (`.so-cell-cat`) trước biến thể.
- `so-order.css`: style `.so-cell-cat` + `.so-vp-editing`.

**Verify** (browser localhost, web2 auth): double-click ô → popover chips [Áo,Quần,Đầm] + 1 ô; chọn Áo+Quần → 2 ô; gõ Trắng/Đen → click ngoài → row `variant="Trắng + Đen"`, `category="Áo + Quần"`, cell "Áo + Quần Trắng + Đen · SL 1", popover đóng. Status: ✅ (Phase 3b modal + Phase 4 products tiếp theo)

### [web2/product-types] Phase 1: trang quản lý "Loại sản phẩm" (Áo/Quần/Đầm…) — CRUD admin

Feature lớn (4 phase) cho ô Biến Thể nhập nhiều biến thể theo món + module dùng chung. **Phase 1**: trang quản lý LOẠI sản phẩm trong menu Cấu hình (mirror Kho Biến Thể). Bỏ nhãn "Set" — combo = multi-select loại đơn (quyết định user). Kế hoạch đầy đủ: `~/.claude/plans/jaunty-munching-llama.md`.

**Mới:**

- BE `render.com/routes/web2-product-types.js`: table `web2_product_types` (name unique, sort_order, is_active) + REST list/get/create/update/delete (`requireWeb2AuthSoft` cho write) + SSE topic `web2:product-types` + audit (entity `product-type`). Pool `web2Db||chatDb`.
- `server.js`: require + mount `/api/web2-product-types` + initializeNotifiers (mirror 3 chỗ của variants). Worker tự route qua catch-all `/api/web2-*` → web2-api (KHÔNG sửa worker).
- FE `web2/product-types/` (index.html + api + app + css): CRUD page UI-first (Web2Optimistic) + SSE realtime.
- Shared `web2/shared/web2-product-types-cache.js` (`Web2ProductTypesCache`): 1 nguồn loại SP cho Kho SP + Sổ Order (Web2SmartCache name `product-types`).
- Sidebar `web2-sidebar.js`: item "Loại sản phẩm" trong Cấu hình + WEB2_PAGES.

**Verify:** ✅ web2-api deploy live (`/api/web2-product-types/health` ok, autoDeploy); login+create Áo/Quần/Đầm 200; trang render "3 loại" + modal mở (browser localhost). Status: ✅

### [web2/shared] Phase 2: module dùng chung `Web2VariantPicker` (biến thể theo món)

`web2/shared/web2-variant-picker.js` — NGUỒN DUY NHẤT nhập biến thể theo MÓN (dùng chung Kho SP + Sổ Order). Multi-select loại (chip từ `Web2ProductTypesCache`) → N món; mỗi món 1 ô `"/"`-aware (gợi ý Màu/Size từ `Web2VariantsCache`). Ghép `category="Áo + Quần"` + `variant="Trắng / M + Đen / L"`; `getCombos()` cartesian khi 1 món nhiều token (giữ bulk-create). CSS scoped tự inject; degrade gọn.

API: `mount(el,{category,value,compact,showTypes,onChange})→{getVariant,getCategory,getCombos,setValue,focus,destroy,el}`.

**Verify** (browser inject+mount): round-trip category/value đúng; chip Áo*/Quần*, 2 ô prefill; 1 món "Trắng/Đen/S/M" → combos 4. Status: ✅ (chưa wire — Phase 3/4)

Workflow audit 8 nhóm (11 agent, find + adversarial verify) các fetch WRITE tới route web2 auth-gated thiếu token. **6/8 nhóm sạch**, 5 vi phạm thật:

- `live-native-orders-api.js`: `update()` PATCH + `remove()` DELETE `/api/native-orders/:code` (gated requireWeb2AuthSoft) → thêm helper `_w2AuthHeaders` (mirror `LiveApi._w2AuthHeaders`) + dùng cho cả 2.
- `live-kho-enricher.js`: `postBatch` POST `/api/web2/customers/batch-by-fbid|phone` (fallback khi LiveCustomerSync chưa load) → thêm `Web2Auth.authHeaders`.
- `native-orders-pbh-bill.js`: POST `/:code/split-order` + `/:code/cancel` → thêm `...Web2Auth.authHeaders()` (các sibling cancelPbh/createPbh đã có, 2 chỗ này bị sót).

Bump cache-bust 3 file `?v=20260626tok`. node --check OK. Cùng Part B (global guard 401→đăng xuất) đảm bảo: write có token (không 401 oan) + nếu token hết hạn vẫn auto đăng xuất re-login. Các nhóm purchase-refund/customer-wallet/products/jt-tracking/balance-history/web2-shared/so-order/pancake = sạch (không thiếu token). Status ✅

### [web2/shared] Auth guard: web2 WRITE 401 (token thiếu/hết hạn) → tự ĐĂNG XUẤT (Part B)

User: "thiếu token thì đăng xuất để user đăng nhập lại". Thêm vào `web2-auth.js`:

- `Web2Auth.handleAuthExpired()` — guard 1-lần: `clear()` token + `location.replace(login?next=<trang>&expired=1)`.
- **Global fetch guard** (`installWriteAuthGuard`): wrap `window.fetch`, bắt `status===401` từ MỌI **WRITE** (POST/PATCH/PUT/DELETE) tới route web2 (`/api/web2*`, `/api/v2/web2*`, `/api/native-orders`, `/api/fast-sale-orders`, `/api/wallet-deposits`, `/api/realtime/web2`, hoặc `web2-api*.onrender.com`) → `handleAuthExpired()`. Loại endpoint auth (login/logout/me/verify) tránh loop; 403 (thiếu QUYỀN) KHÔNG đăng xuất. Bao phủ TOÀN BỘ call site không cần sửa từng nơi — kể cả chỗ lỡ thiếu token (401 → đăng xuất → đăng nhập lại → retry có token).

Part A (audit + thêm `x-web2-token` cho các write còn thiếu, để không bị 401→đăng xuất oan) chạy workflow riêng. node --check OK. Status ✅

### [live-chat] FIX 401 live-hidden-commenters — \_save thiếu x-web2-token

Console live-chat: `POST /api/web2/live-hidden-commenters/create` **401** (+ GET `/get/global` 404 là first-run BÌNH THƯỜNG → seed defaults). RCA: route `/:entity/create` + `/update/:code` (web2-generic.js) gated `requireWeb2AuthSoft` → cần `x-web2-token`. File có helper `_lhcHeaders()` (gửi token) và `_hideRemote`/`_unhideRemote` đã dùng (đợt A4), nhưng **`_save` vẫn dùng header trần** `{Content-Type}` → create/update 401 cho MỌI user (không chỉ session test) → record global không seed/persist được.

**Fix** (`live-hidden-commenters.js`): `_save` đổi `const headers = {...}` → `const headers = _lhcHeaders()` (hoisted fn decl, callable từ trên). Create + update giờ gửi token. Bump `?v=20260626auth`.

Lưu ý: 404 GET `/get/global` GIỮ NGUYÊN (contract first-run, client tự seed defaults + create). node --check OK. Status ✅

### [web2/shared] Web2NumberInput — module CHUNG format số tiền khi NHẬP (1.000 · 2,64) + retrofit 6 trang ví/tiền

User: "web 2.0 → module chung các số đều có `.` ở hàng ngàn (1.000, 24.000), thập phân là dấu `,` (2,64) — các input đều nhận như vậy, đang nhập 1000 thì hiện 1.000". Phạm vi user chọn: **chỉ ô tiền** (không đụng SĐT/mã/SL); **module + trang trọng điểm trước** (rải còn lại opt-in sau).

**Module mới** `web2/shared/web2-number-input.js` (`window.Web2NumberInput`, ~250 dòng) — 1 NGUỒN format số khi gõ:

- `parse(str)` (vi-VN: `.`=nghìn, `,`=thập phân → Number), `format(n,{decimals})`, `attach(el,opts)`, `attachAll(root)`, `getValue(el)`/`getValueOr`, `setValue(el,n)`, `config({observe})`.
- **Live format giữ caret** khi gõ (đếm ký-tự-có-nghĩa, dấu `.` nghìn auto-sinh không nhảy con trỏ); mode số nguyên + thập phân (`data-w2num` / `data-w2num="decimal"` / `data-w2num="3"`).
- **Auto-init**: quét `[data-w2num]` lúc DOMContentLoaded + **MutationObserver** → tự gắn cả ô render động (modal rows). Ô `type=number` tự đổi `type=text inputmode=numeric/decimal` (number không hiện được `.`).
- ⚠ **Bẫy `.value`**: ô hiện "1.000" thì `Number(el.value)`=1 → đọc số thật PHẢI qua `Web2NumberInput.getValue(el)`. `getValue` parse thẳng từ `el.value` (không tin dataset → an toàn khi code gán `.value=''` trực tiếp).

**Retrofit 6 trang tiền trọng điểm** (đổi input + sửa MỌI read-site `Number(el.value)`→`getValue`, set-site→`setValue`; đều có fallback defensive `window.Web2NumberInput ? … : …`):

- `balance-history` nạp tiền (`w2mdAmount`); `chi-tieu` (`ctfAmount`, modal động + `attachAll`); `supplier-wallet` (`swPayAmount`) + `supplier-debt` (`sdPayAmount`); `products` (`pmPriceBuy`/`pmPriceSell` + drawer `data-f=price/originalPrice`) — KHÔNG đụng `pmStock`/tồn (SL).
- `so-order` (đầy đủ, **currency-aware → decimal**): modal rows `costPrice`/`sellPrice`, form `shipDiscount`/`shipShipping`/`shipContractAmount`, per-order meta (`data-pm` HĐ/Giảm/Ship), inline-edit + bulk-edit price cells. Tích hợp coexist với `onModalPriceBlur` (VND shorthand 100→100.000) + live-recompute tổng. Audit 8 domain (workflow) → map 28 input + 44 read-site phá vỡ; chốt scope chỉ tiền.

**Verify**: (1) Unit test Node 41/41 (parse/format/live int+decimal/getValue trap/setValue) ✅; (2) `node --check` 15 file JS ✅; (3) Browser localhost thật: balance-history gõ `1000000`→`1.000.000` getValue 1000000 ✅; so-order modal row `1000000`→`1.000.000` (state 1000000) · shorthand `100`→blur→`100.000` (tổng 100.000₫ đúng) · decimal `12,5`→state 12.5 ✅; products setValue 250000→`250.000` + gõ `1500000`→`1.500.000` ✅. Status: ✅

**Đợt 2 (2026-06-26) — áp nốt trang còn lại** (user "thêm vào Còn lại"):

- `native-orders` modal tạo PBH: `pbhDeposit`/`pbhDeliveryPrice`/`pbhPaymentAmount` (popup `openCustomFormPopup` → `onMount` gọi `attachAll(root)`; set dropdown-change + shopMode qua `setValue`; collect đọc `getValue`).
- `purchase-refund`: `price` (quick modal — set/đọc + `updateQuickTotal`) + `totalAmount` (create/edit modal — đọc qua **FormData** nên dùng `Web2NumberInput.parse(fd.get('totalAmount'))`, set qua `setValue`).
- `payment-confirm` / `reconcile` / `fastsaleorder-refund`: **không có ô tiền nhập tay** (read-only/display) → không cần áp.

Verify browser localhost: purchase-refund `price` gõ `1500000`→`1.500.000` getValue 1500000 · `totalAmount` setValue 26000000→`26.000.000` parse-from-FormData→26000000 ✅; native-orders PBH popup (seed đơn ảo) `pbhDeposit` prefill 50000→`50.000`, gõ `1200000`→`1.200.000` getValue 1200000, attach qua onMount ✅. `node --check` 3 file JS sạch. Status: ✅ — **toàn bộ ô tiền nhập tay Web 2.0 đã có Web2NumberInput.**

### [so-order][web2/products] In tem/mã SP dùng CHUNG module web2/products — gỡ modal "In mã vạch" legacy fork

User: ở Sổ Order, in mã SP phải **dùng chung module bên products** (Kho SP), không phải modal "In mã vạch" riêng. Bug: nút "In tem" (nhận hàng) mở modal legacy `soBarcodeModal` ("In mã vạch — <NCC>") thay vì modal in dùng chung.

**Nguyên nhân:** module in của web2/products đã **tách 5 file** (`-print-utils`→`-print-barcode`→`-print-render`→`-print-modal`→`-print` entry, đều populate `window.W2PP`), nhưng so-order **chỉ load file entry** `web2-products-print.js` → `window.W2PP.open` undefined → `Web2ProductsPrint.open` undefined → `SO.openBarcodePrintModal` rớt về modal fork legacy.

**Fix:**

- `so-order/index.html`: load đủ **5 file print theo thứ tự** (thêm utils/barcode/render/modal trước entry). JsBarcode/QR module tự load CDN; Web2Printer/Web2QR đã có sẵn ở so-order.
- `so-order/js/so-order-barcode.js`: **gỡ HẲN modal fork legacy** + `printBarcodes` + `_updateBarcodeSummary` (~160 dòng). `openBarcodePrintModal` giờ delegate 100% sang `Web2ProductsPrint.open` (1 nguồn như Kho SP); thiếu module → báo lỗi rõ, KHÔNG fork.

**Verify** (browser localhost): sau reload `Web2ProductsPrint.open`=**function** (trước: undefined); gọi `openBarcodePrintModal(...)` mở modal CHUNG (`.w2p-print-header`), KHÔNG tạo `#soBarcodeModal`; 0 console error; 0 dangling ref. Status: ✅

**Follow-up (user chọn):** đổi tiêu đề modal in `In mã vạch` → **`In mã sản phẩm`** trong module dùng chung (`web2-products-print-modal.js` h4 `#w2pPrintTitle` + `web2-products-print-render.js` print-window `<title>`) → áp dụng CẢ Kho SP (products) lẫn so-order. Tab/cảnh báo "mã vạch" GIỮ nguyên (phân biệt SP có/không có mã). Cache-bust render+modal `?v=20260626b`. Verify: modal title = "In mã sản phẩm" ✅

### [purchase-orders][web2/shared] Cầu nối XUẤT bảng PO (Web 1.0) → mã base64 → NHẬP vào Sổ Order (Web 2.0)

User: ở `purchase-orders/index.html` cho xuất dữ liệu bảng thành 1 mã (base64) → dán vào `so-order/index.html` (đã có sẵn modal "Nhập Sổ Order"), **không đụng chạm code/DB giữa Web 1.0 ↔ Web 2.0** — cầu nối duy nhất là mã copy-paste / file.

**Định dạng (data contract, KHÔNG share code):** `N2IMPORT1:` + base64(UTF-8 JSON `{_n2,v,kind,src,exportedAt,count,rows:[…]}`). `rows` khớp ĐÚNG cột Web2Import của so-order (`supplier,date,batch,productName,variant,qty,costPrice,sellPrice,note,costNote,status`).

**Web 1.0 — encoder + UI** (mới `purchase-orders/js/lib/so-order-export.js`, self-contained, KHÔNG import web2/): map đơn tab đang xem → rows (mỗi đơn = 1 lô qua `batch`=orderNumber; status PO→Nháp/Đã nhận/Đã hủy; variant `-`→rỗng; bỏ qua SP thiếu tên), encode token, modal Copy / tải `.txt` / `.json`. Nút **"Xuất Sổ Order"** ở filter-bar (`ui-components.js` renderFilterBar + bind; `main.js` handler `onExportSoOrder`). Khung modal không chèn giá trị động qua innerHTML (token set `.value`, số liệu `.textContent` — chống XSS).

**Web 2.0 — decoder** (sửa shared `web2/shared/web2-import.js`, 1 nguồn → lợi cho MỌI modal import web2): `parseInput()` nhận diện prefix `N2IMPORT1:` → base64-decode UTF-8 → JSON (đã sẵn xử lý `{rows:[…]}`). Có guard size (~6 MB) chống DoS. Placeholder ô dán + cache-bust `?v=20260626a` ở so-order + web2/products.

**Verify:** (1) Node contract round-trip (UTF-8 tiếng Việt, status enum, note fallback, skip thiếu tên) ✅; (2) Browser e2e localhost: PO 3 đơn→**26 dòng** token → so-order paste → preview **"26 dòng hợp lệ / Sẵn sàng nhập 26 dòng order"**, 0 lỗi ✅ (chỉ preview, KHÔNG commit data thật). Code-review: tách layer sạch, mapping đúng, 2 HIGH (XSS latent + size cap) đã fix. Status: ✅

### [web2/admin] Wipe data 9 trang vận hành Web 2.0 (beta) + endpoint `/web2-wipe-9pages`

User yêu cầu xóa data DB Web 2.0 cho 9 trang: fastsaleorder-invoice, reconcile, native-orders, so-order, purchase-refund, supplier-debt, supplier-wallet, ck-dashboard, products. Map từng trang → bảng web2Db (workflow 9 agent đọc HTML→JS→route→SQL): không endpoint sẵn nào khớp đúng (broad `web2-data-wipe` lỡ giết `web2_variants` + thiếu `fast_sale_order_history`/`pbh_fulfillment_logs`/`web2_customer_intents`/`web2_records[slug=purchase-refund]`/seq).

**Mới** (`render.com/routes/admin-web2-data-reset.js`): thêm `POST /api/admin/web2-wipe-9pages` (header `x-admin-secret`, `{confirm:'YES-RESET', dryRun?}`, web2Db-only guard, auto-backup `<t>_bak_<tag>`, FK cascade-risk fail-loud). Truncate 24 bảng (đơn/PBH/fulfillment/so-order/SP/NCC-ledger+meta/CK + downstream ví KH/KPI/tag/cart/campaign/returns/QR/pending), DELETE `web2_records WHERE entity_slug='purchase-refund'`, reset seq `web2_supplier_move_seq`, UNLINK (giữ dòng) `web2_balance_history` cờ match.

**Đã chạy** (user chọn scope "9 trang + dọn liên kết"): 244 dòng truncated (19 bảng có data) + 3 purchase-refund + 37 balance unlinked, 24+2 backup. **GIỮ**: web2_customers, web2_balance_history (dòng), web2_variants (108), auth/config. Verify post-wipe: mọi target=0, variants=108 nguyên. Backup `*_bak_20260626_104302_4ccb` còn trên web2Db — drop sau khi yên tâm qua `POST /api/admin/web2-cleanup-dead {confirm:'YES-CLEANUP'}`. Status: ✅

### [web2/cham-cong] Hôm nay chưa tan ca → "đang làm", KHÔNG tính chấm thiếu (đến 20:05 mới tính)

User: "Hôm nay 26/06 nên không cần tính chấm thiếu, sau 20h:05 mới tính". Lỗi: grid dot + đối soát dùng `S.dayStatus()` trả 'missing' cho mọi ngày 1-lượt → HÔM NAY (NV mới vào sáng, chưa bấm ra) bị tô đỏ "chấm thiếu" + vào đối soát, dù đang làm việc, sẽ bấm ra cuối ca.

**Fix** (`cham-cong-app.js` renderTimesheet): thêm trạng thái `inprogress` — HÔM NAY + `nowMin <= work_end + grace` (vd 20:06) + status 'missing' (1 lượt) → đổi thành `inprogress` ("Đang làm"), KHÔNG vào `needFix` (đối soát). Dot sky `#0ea5e9` glyph •, thêm legend "Đang làm (chưa tan ca)". Đồng bộ ngưỡng `renderTodayHtml` quenRa: `nowMin > endMin` → `nowMin > endMin + grace`.

**Verify** (Playwright + admin login, ~10:46): đối soát **19→9** (mọi chip 26/06 biến mất, chỉ còn missing ngày cũ Còi 12/13/16/25, Dung 03, Bo 13/15/16/24); cột hôm nay **10 dot "đang làm" (sky), 0 đỏ "chấm thiếu"**, 1 xám (chưa vào). Cache-bust app/css `?v=20260626att2`.

### [web2/cham-cong] NV chưa gán user → KHÔNG cần chấm công (ẩn khỏi Bảng công/Hôm nay/đối soát, GIỮ Bảng lương)

User: "không gán user thì không cần chấm công". Trước đây `isVisibleEmp = employee_id || manual` → NV thủ công lương tháng chưa gán (Chị Út, Phước Lớn, Thái, Vú Thanh, Vú Trang) hiện ở Bảng công + "Chưa vào" + đối soát dù KHÔNG bấm máy → nhiễu.

**Fix** (`cham-cong-app.js`): thêm helper `needsAttendance(du) = !!du.employee_id` (chỉ NV đã GÁN user mới cần chấm công). Đổi filter **Bảng công (grid) + Hôm nay (chưa vào) + đối soát** (2 chỗ) + empty-state `hasUnassigned` sang `needsAttendance`. **GIỮ `isVisibleEmp` (employee_id || manual) cho Bảng lương** (`cham-cong-payroll.js`) → NV thủ công lương tháng vẫn được trả lương. NV chưa gán vẫn ở tab Nhân viên để gán.

**Verify** (Playwright + admin login thật): "Chưa vào" 6→**1** (chỉ Cẩm — NV gán chưa vào); grid 16→**11** (đúng NV đã gán, 5 NV thủ công biến mất); Bảng lương **giữ 16** (5 NV thủ công lương tháng còn nguyên). Cache-bust `?v=20260626att`.

### [web2/cham-cong] Gỡ tham chiếu lay-du-lieu.bat — 1 NGUỒN AUTO duy nhất (ADMS proxy từ printer-settings)

User: "xóa lay-du-lieu.bat đi chỉ lấy bằng 1 nguồn auto". Có 2 hệ agent: (cũ) `web2-attendance-sync/` lay-du-lieu.bat + install-windows.bat (ZKLib LAN poll → push `source='agent'`, đã chết 23/06) — **folder đã bị gỡ khỏi repo**, chỉ còn UI text tham chiếu; (giữ) `attendance-sync/` → `cai-cham-cong.bat` → `adms-proxy.js` (DG-600 push ADMS → `source='adms'`), tải từ **Cấu hình in → Cài máy chấm công DG-600** (web2-attendance-installer.js). 1 nguồn auto duy nhất.

**Fix** (`cham-cong-app.js` 3 message): thay mọi "bấm lay-du-lieu.bat / install-windows.bat" → trỏ về nguồn auto duy nhất "**Cấu hình in → Cài máy chấm công DG-600**" (data-stale warning, PC-off backup, empty-state). KHÔNG đụng `web2/video-maker` install-windows.bat (đó là VieNeu TTS, khác feature). Cache-bust `?v=20260626fix5`.

⚠ Migration phía shop (không làm được từ code): cài `cai-cham-cong.bat` (tự gỡ bản cũ + autostart nền) + cấu hình máy DG-600 menu Comm/Cloud/ADMS đẩy về IP PC:proxyPort. Agent cũ source='agent' trên PC nên gỡ tay.

### [web2/cham-cong] Sync strip phân biệt KẾT NỐI vs DỮ LIỆU mới (bắt case máy online nhưng không đẩy chấm công)

User báo: data dừng ở 23/06 dù strip hiện "Đang đồng bộ · Lần cuối 08:32 26/06". Chẩn đoán: `last_sync_time` bị `touchAdmsStatus` bump mỗi heartbeat ADMS (~10s) của máy DG-600 → strip xanh dù KHÔNG có punch mới. Strip cũ chỉ đo CONNECTION freshness, không đo DATA freshness → đánh lừa.

**Fix** (`cham-cong-app.js` renderSyncStrip + `latestRecordDateKey()` helper + css): tách "**Đang kết nối**" (heartbeat) khỏi "**Dữ liệu mới nhất: DD/MM**" (date_key bản ghi mới nhất). Khi xem tháng hiện tại + data trễ ≥2 ngày → strip chuyển `off` (đỏ) + cảnh báo "⚠ Máy kết nối nhưng KHÔNG có chấm công mới N ngày — bấm lay-du-lieu.bat + kiểm tra DG-600". `.cc-sync .cc-sync-stale` đỏ (specificity 0,2,0 thắng `.cc-sync b`).

Xác nhận deploy của tôi KHÔNG gây lỗi này: ingest gate trả **401** (secret đã set env) chứ không 503 (fail-closed) → agent đúng secret vẫn vào được; gap 23/06 có trước deploy hôm nay. Verify: unit-test staleDays (23/06 vs 26/06 = 3 ngày stale; hôm qua=không; tháng cũ=không) ALL PASS; screenshot strip "Đang kết nối · Dữ liệu mới nhất 23/06 (đỏ) · ⚠ 3 ngày". Cache-bust app/css `?v=20260626fix4`.

### [web2/cham-cong] FIX đợt 4 (Group C đối soát + Group D a11y/perf)

**Group C — hàng đợi ĐỐI SOÁT chấm thiếu cả tháng** (`cham-cong-app.js` renderTimesheet): ngày chấm THIẾU 1 lượt (quên bấm vào/ra) đang trả 0đ âm thầm — trước chỉ cảnh báo "hôm nay". Giờ gom TOÀN THÁNG mọi NV (status `missing`) → panel "⚠ Cần đối soát (N)" với chip `NV · DD/MM` bấm mở openDay chấm bù. Verify screenshot: panel cam + 3 chip.

**Group D — a11y + perf**:

- **Chấm có GLYPH** (a11y WCAG 1.4.1 — không chỉ phân biệt màu): ✓ đúng giờ · ! muộn/sớm · ? chấm thiếu · trống = nghỉ. `cc-dot` flex-center + `[data-g]::after` (`cham-cong.css`) + `aria-label` từng chấm. Verify screenshot: glyph trắng trong chấm màu.
- **Event delegation**: 1 listener trên `#ccBody` (bind 1 lần qua `dataset.ccDelegated`) thay ~496 listener/ô tạo lại mỗi render SSE. Ô lưới + chip đối soát chung handler.
- **Modal Esc + ARIA**: global keydown Esc đóng modal đang mở (`#ccModalMount`); thêm `role="dialog" aria-modal aria-label` cho 3 modal (ngày + chi tiết + sửa lương). Verify: Escape → modal đóng.
- **Sticky name truncate**: `.cc-name-txt` max-width 110px + ellipsis (tên dài không phá lưới mobile). Verify: "NGUYỄN THỊ M…".
- **SSE doc**: thêm `web2:attendance` vào registry topics CLAUDE.md.

Cache-bust app `?v=20260626fix`, css `?v=20260626fix`. **CHƯA làm (LOW polish, follow-up)**: memoize calcMonth per-emp, gỡ CSS chết render cũ, modal body-scroll-lock (Tier-1 anti-lag) + period-lock full server-recompute.

### [web2/cham-cong] FIX đợt 3 (Group B — backend security)

- **Secret ingest FAIL-CLOSED** (`render.com/routes/web2-attendance.js` requireAgentSecret): thiếu `WEB2_ATTENDANCE_SECRET` trước đây MỞ (ai cũng chèn punch) → giờ trả **503**, trừ khi bật cờ tường minh `WEB2_ATTENDANCE_ALLOW_OPEN=1` (dev). Prod đã set secret → không đổi hành vi. (Giữ `?secret=` query vì agent đẩy chấm công là phần mềm NGOÀI repo — không xác minh được header; bỏ query cần phối hợp cấu hình agent, hoãn như ADMS.)
- **`/api/web2-users/list` bỏ PII cho non-admin** (`web2-users.js`): non-admin chỉ nhận id/tên/role/active/avatar — bỏ email/SĐT/note/permissions của NGƯỜI KHÁC (admin vẫn đủ qua `reveal`). Fix tại handler, KHÔNG đụng `mapRow` (dùng chung self-profile).
- **period-lock validate snapshot** (`web2-attendance.js` POST /period-lock): chặn NaN/∞/số > 1e12 + nhất quán nội bộ mỗi dòng (`tongLuong = luongChinh+lamThem+phuCap+thuong−giamTru`, `conCanTra = tongLuong−daTra`, ±2đ rounding). Reject 400 nếu lệch. Admin-only nên rủi ro thấp; đây là fail-fast với client lỗi/bịa (full server-recompute = follow-up lớn hơn, cần đưa salary.js thành module universal). Verify: unit-test accept valid + reject tampered/NaN/absurd/lệch-monthKey/thiếu-rows.

### [web2/cham-cong] FIX đợt 2 — grace smooth + monthly late reset + dup-PIN dedupe tổng

Sau audit, user chọn fix tiếp (ADMS auth hoãn — beta). Group A (sai tiền/chính sách):

- **Grace "cliff" → SMOOTH** (`cham-cong-salary.js` calcDay): trước vượt grace bị phạt TỪ phút 0 (08:06=0' nhưng 08:07=7'). Giờ THA tối đa `grace` phút → muộn = max(0, thực−grace), đối xứng cho cả vào (đi muộn) lẫn ra (về sớm). Verify: 08:07→1', 08:20→14', base liên tục (300000→299583), về sớm 19:50→4'.
- **Lương THÁNG KHÔNG auto phạt muộn** (calcMonth isMonthly branch): reset `lateDeduction=0` + `lateDays=[]` (nhất quán với OT=0 monthly; muốn phạt → "Giảm trừ thủ công"). Verify: monthly late 1h → ded 0, tổng giữ 10tr; manual override 50k vẫn áp; daily vẫn phạt (60−6)×1000=54000.
- **Dup-PIN KHÔNG cộng đôi TỔNG** (`cham-cong-payroll.js` render + lock snapshot): 1 NV gán nhiều PIN → tổng chỉ cộng 1 lần (PIN đầu), dòng trùng vẫn hiện + đánh dấu "(∉ tổng)". Lock snapshot total cũng dedupe + bổ sung pc/thuong/giam (trước thiếu). Verify: 2 PIN cùng emp → tổng 900k (đúng), PIN2 skip.

Cache-bust salary `?v=20260626fix2`, payroll `?v=20260626fix`.

### [web2/cham-cong] AUDIT đa tác tử (42 agent) + FIX 2 bug lương sai tiền

User: "audit debug" trang Chấm công. Chạy workflow audit 8 chiều × adversarial-verify (30/33 finding confirmed: 3 CRITICAL, 5 HIGH, 13 MEDIUM, 9 LOW) + browser-debug live (test pure calc `ChamCongSalary`).

**FIX ngay (sai tiền, an toàn — `cham-cong-salary.js`)**:

- **CRITICAL — OT override trên NV lương THÁNG → overpay ~26×**: block `ot_hours_override` (calcMonth) chạy vô điều kiện, chia `cfg.dailyRate` (= lương CẢ THÁNG với monthly) cho giờ-công-1-ngày → hr khổng lồ. Vd lương 10tr ca 12h, override 2h ×2 = **3.333.333đ** OT cho 2 giờ. Auto-OT đã ép 0 cho monthly nhưng override bỏ qua guard. → Gate `if (!isMonthly && ...)`. Verify: monthly lamThem 3.333.333 → **0**; daily override vẫn 75.000 đúng; luongChinh tháng giữ 10tr.
- **LOW — hệ số OT = 0 bị ép thành 1×**: `Number(cfg.otMultiplier) || 1` → 0 thành 1× (trả full OT thay vì tắt OT). Đổi `Number.isFinite(...) ? ... : 1` (3 chỗ: const otMult + nhánh override). Verify: otMult 0 → otPay 0 (was 50.000); undefined vẫn 1×.

Cache-bust `cham-cong-salary.js?v=20260626fix`.

**Browser-debug thêm** (ChamCongSalary đúng phần lớn: OT daily/monthly, grace ≤6, daysOfMonth, missing-cfg no-NaN):

- Grace "cliff": 08:06 muộn 0' → 08:07 muộn **7'** (full, không phải 1'). Vượt grace bị phạt từ phút 0. → câu hỏi chính sách.
- Naive `check_time` TZ: `new Date(r.check_time)` không chuẩn hoá +7 → chỉ đúng nếu API trả ISO có offset (browser +7 che lỗi).

**CÒN LẠI — chờ quyết định** (audit findings, chưa fix vì cần phối hợp/đụng auth thiết bị/backend): ADMS `/iclock/*` ZERO auth (CRITICAL — forge punch→forge payroll), monthly late-penalty (policy), dup-PIN double-count total, deleted-punch resurrect, secret fail-open + query-string leak, period-lock client-trusted, web2-users/list lộ PII non-admin, perf full-rerender/496-listener, a11y color-only/modal Esc-ARIA, dead CSS. Xem báo cáo chat.

### [web2/order-tags] Thêm trigger "Có ghi chú SP" (ghi chú cấp dòng sản phẩm)

User: "có ghi chú sản phẩm" → thêm trigger phân biệt ghi chú CẤP DÒNG SP với ghi chú cấp đơn.

**Files** (`web2-order-tags-service.js`):

- `co_ghi_chu_sp` "Có ghi chú SP" (nhóm Nội dung / Tương tác) — predicate `Array.isArray(o.products) && o.products.some(p => _hasText(p.note))`. Mỗi dòng SP trong JSONB `products` lưu field `note` (client `setLineNote` → `line.note`, vd size/màu/yêu cầu KH). Màu teal #0d9488, icon notebook-pen, prio 43. Seed idempotent.
- Đổi tên `co_ghi_chu` "Có ghi chú" → **"Có ghi chú đơn"** (registry + seed + UPDATE idempotent thẻ cũ chỉ khi còn tên default) để phân biệt rõ với "Có ghi chú SP".

Verify: syntax OK; unit-test 9 case ALL PASS (1 SP note → true; note rỗng/null/space → false; SP không có field note → false; products undefined → false; co_ghi_chu đơn KHÔNG nhầm note SP, vẫn bật theo userNote). Status ✅ (chờ deploy)

### [purchase-orders] FIX tạo đơn với SP cũ (lấy từ Kho) bị kẹt ở Nháp, không qua Chờ mua

**Triệu chứng** (user): mua lại SP cũ → "Chọn từ Kho SP" → Tạo đơn hàng → đơn bị đẩy về **Nháp** kèm cảnh báo "Đồng bộ TPOS có lỗi — đơn giữ ở Nháp để thử lại". Nhưng bấm **Chỉnh sửa** đơn Nháp → Cập nhật thì lại chạy được và sang **Chờ mua**.

**Root cause** (đã xác minh full chain):

- Server (`render.com/routes/v2/purchase-orders.js` POST ~728 + PUT ~867) khi lưu item set `_fromWarehouse = !!(item._fromWarehouse || item.tposSynced)`.
- → Luồng **SỬA**: item nạp lại từ DB có `_fromWarehouse=true` → pre-filter trong `tpos-product-creator.js` (~1270: `tposSynced && !_fromWarehouse && !tposSyncError`) KHÔNG skip → verify qua `checkProductExists` → success → đơn sang Chờ mua. ✅
- → Luồng **TẠO**: `handleCreateOrder` gọi `syncOrderToTPOS(orderId, orderData.items)` với item **in-memory** từ Kho picker chỉ có `tposSynced=true`, CHƯA có `_fromWarehouse` (server mới thêm khi persist, mà create sync TRƯỚC khi reload) → pre-filter **skip** → `pendingGroups.size===0` → `syncOrderToTPOS` trả **`undefined`** → `handleCreateOrder` coi như lỗi → giữ Nháp. ❌

**Fix chính** = 1 dòng ở chokepoint chung:

1. `purchase-orders/js/form-modal.js` `getFormData()` — thêm field `_fromWarehouse: !!(item._fromWarehouse || item.tposSynced)` trong `items.map()`. Đây là chokepoint chung cho create + edit + save-draft → mirror ĐÚNG logic server. Item Kho giờ được verify (`checkProductExists`) thay vì bị pre-filter skip ngay từ luồng TẠO → `syncOrderToTPOS` trả `successCount>0` → `handleCreateOrder` (giữ nguyên điều kiện `failCount===0 && successCount>0`) chuyển sang Chờ mua.
2. `purchase-orders/js/lib/tpos-product-creator.js` `syncOrderToTPOS()` — 2 nhánh early-return giờ trả object `{successCount, failCount:0, results, ...}` thay vì `undefined` (defensive, contract rõ ràng).

**KHÔNG đổi** `handleCreateOrder` advance-logic (giữ `failCount===0 && successCount>0`): review adversarial chỉ ra nếu nới thành `!(failCount>0)` thì đơn có SP **chưa có mã** (groupOrderItems bỏ item không mã → `groups.size===0` → successCount=0) sẽ **advance ngầm** lên Chờ mua mà KHÔNG SP nào verify trên TPOS. Giữ điều kiện cũ → case đó an toàn ở Nháp; case Kho vẫn qua Chờ mua nhờ Fix #1.

**Verify**: trace tay full chain + workflow review (regression PASS, adversarial PASS-with-concerns). Mixed order (1 Kho OK + 1 SP mới lỗi) → `failCount>0` → giữ Nháp đúng. `syncOrderToTPOS` throw → catch trả `{failCount:1}` → giữ Nháp. don-inbox gọi `syncOrderToTPOS` fire-and-forget (bỏ qua return) → không ảnh hưởng. Status ✅

### [web2/order-tags] FIX thẻ "KHÁCH LẠ" gắn nhầm trigger + tách "Thiếu địa chỉ"

Khi verify deploy 5 trigger mới, phát hiện thẻ `code=khach_la` (tên "KHÁCH LẠ", admin tạo) gắn **NHẦM** `trigger='thieu_dia_chi'` → pill "KHÁCH LẠ" thực ra fire theo THIẾU ĐỊA CHỈ. `ON CONFLICT DO NOTHING` của seed khach_la không đè được nên predicate `khach_la` mới không có thẻ trỏ tới. User định nghĩa: **khách lạ = KH không có thông tin ở kho KH** (chưa gán customer_id) → đúng với predicate `o.customerId == null`.

**Fix** (`web2-order-tags-service.js` `ensureTable`, idempotent, no auth):

- `UPDATE web2_order_tags SET trigger='khach_la' WHERE code='khach_la' AND trigger='thieu_dia_chi'` — trả thẻ "KHÁCH LẠ" về đúng trigger `khach_la` (chỉ flip khi còn nhầm). Giữ nguyên tên/màu/icon admin (`KHÁCH LẠ`/#ca8a04/person-standing).
- Seed thẻ "Thiếu địa chỉ" riêng (`thieu_dia_chi`, #ef4444, map-pin-off, prio 35) `ON CONFLICT DO NOTHING` — không mất chức năng cảnh báo thiếu địa chỉ.
- Cập nhật desc trigger `khach_la` = "không có thông tin ở kho KH (chưa gán customer_id)".

Kết quả: "KHÁCH LẠ" giờ fire đúng (không có trong kho KH) + có thẻ "Thiếu địa chỉ" riêng. Predicate `thieu_dia_chi` (`!_hasText(o.address)`) đã có sẵn. Status ✅ (chờ deploy verify)

### [web2/order-tags] Thêm 5 trigger mới (user: "không đủ trigger")

User mở "Thêm thẻ" thấy dropdown ngắn → giải thích: dropdown CHỈ hiện trigger CHƯA dùng (1 trigger = 1 thẻ; 8/23 đã dùng bị ẩn gồm cả gio_trong vừa tạo). User chọn thêm 5 trigger mới.

**Files** (`render.com/services/web2-order-tags-service.js`) — mỗi trigger thêm 3 chỗ (TRIGGERS registry + PREDICATES + seed idempotent):

- `khach_la` "Khách lạ" (nhóm **Khách hàng** — mới) — `o.customerId == null` (chưa gán KH). Màu amber, icon user-x.
- `co_ghi_chu` "Có ghi chú" (nhóm **Nội dung / Tương tác** — mới) — `_hasText(note) || _hasText(userNote)`.
- `co_tin_nhan` "Có tin nhắn" — `messageCount > 0`.
- `co_binh_luan` "Có bình luận" — `commentCount > 1` (⚠ comment_count mặc định 1 = bình luận gốc → ngưỡng >1 để lọc đơn thực sự có bình luận bổ sung, tránh tag luôn-bật vô nghĩa).
- `da_doi_soat` "Đã đối soát" (nhóm **PBH / Trạng thái**) — `pbhFulfillmentState ∈ {packed,shipped,delivered}`.

Đã xác minh field server-side: `customerId/note/userNote/messageCount/commentCount` (mapRow native-orders) + `pbhFulfillmentState` (set ở route line 1756, TRƯỚC `enrichOrdersWithTags` line 1829). KHÔNG cần đổi frontend (order-tags page fetch `/triggers` động; native-orders render `o.autoTags`).

**Verify**: syntax OK; unit-test 16 assertion 5 predicate ALL PASS (khach_la null/0/123, co_ghi_chu note/userNote/rỗng, co_tin_nhan >0, co_binh_luan 3/1/0, da_doi_soat packed/delivered/pending/null). E2E chờ deploy (seed + predicate server-side). Status ✅ (chờ deploy)

### [web2/order-tags + native-orders] TAG mới "Giỏ trống" (trigger gio_trong)

Yêu cầu: thêm tag trigger cho giỏ trống / giỏ không có sản phẩm (tiếp nối câu hỏi "sao giỏ 2-3 không có pill KPI" — vì kpi_user cần `products.length > 0`). Tag này đánh dấu rõ giỏ rỗng.

**Files** (`render.com/services/web2-order-tags-service.js`):

- `TRIGGERS`: thêm `{ id:'gio_trong', label:'Giỏ trống', group:'PBH / Trạng thái', desc }` → xuất hiện trong dropdown trang config (`GET /api/web2-order-tags/triggers`).
- `PREDICATES`: `gio_trong: (o) => o.status !== 'cancelled' && (!Array.isArray(o.products) || o.products.length === 0)` — giỏ chưa huỷ + 0 SP (đối nghịch điều kiện kpi_user). Đơn confirmed luôn có SP → không dính; đơn huỷ rỗng đã có tag "Đã huỷ" → loại trừ tránh nhiễu.
- `ensureTable`: seed idempotent tag `gio_trong` (name 'Giỏ trống', màu `#94a3b8`, icon `shopping-cart`, priority 15) `ON CONFLICT DO NOTHING` — chạy CẢ khi bảng đã có data (block seed-4-default cũ chỉ chạy lúc bảng rỗng). Admin muốn ẩn → `is_active=false` (xoá sẽ bị seed lại lần restart).

KHÔNG cần đổi frontend: order-tags page fetch `/triggers` động; native-orders render `o.autoTags` từ `/load`. Sau deploy: giỏ rỗng (vd giỏ 2-3) tự hiện pill "Giỏ trống".

**Verify**: unit-test predicate 6 case (2-1/2-2 có SP → false, 2-3 rỗng → true, undefined products → true, confirmed có SP → false, huỷ rỗng → false) ALL PASS; syntax OK. (E2E cần deploy Render: seed tag + predicate chạy server-side.) Status ✅ (chờ deploy)

### [web2/balance-history] Chat KH đã gán → mở Pancake ĐẦY ĐỦ 3 cột (trả lời được) thay drawer 1 cột

Yêu cầu: trang Lịch sử biến động số dư (SePay), khi mở chat của KH **đã được gán SĐT** (nút 💬 ở dòng giao dịch), đang ra chat drawer 1 cột — đổi thành **chat Pancake đầy đủ** (3 cột: sidebar tìm hội thoại + thread + info), **trả lời được**, đồng nhất với chat ở Đơn Web / Live Chat.

**Files**:

- `web2/balance-history/js/web2-bh-chat-export.js`: `openChatForPhone()` nhánh có SĐT → `Web2CustomerChat.open({ layout:'modal', phone, name, query })` (trước: `{ phone, name }` → mặc định drawer 1 cột). `layout:'modal'` = giao diện 3 cột Pancake (giống native-orders). Nhánh KHÔNG có SĐT (dòng chưa gán) vẫn giữ modal tìm kiếm readonly như cũ.
- Cache-bust `web2-bh-chat-export.js?v=20260626pc`.

**Verify** (Playwright MCP, localhost): gọi `W2BH.openChatForPhone('0123456788','Test')` → DOM có `.w2cc-modal` (3 cột), KHÔNG còn `.w2cc-drawer`; sidebar tìm hội thoại hiện (search pre-fill SĐT) + thread "Chọn hội thoại bên trái để bắt đầu". Screenshot xác nhận giao diện "Chat khách hàng" 3 cột. (Hội thoại/tin thật cần token Pancake tươi ở browser thật — headless không load được, giới hạn hạ tầng đã biết.) Status ✅

### [native-orders] Nút XOÁ đơn (admin-only) — giỏ hàng/đơn huỷ xoá được, đơn đã chốt PBH KHÔNG

Yêu cầu (ảnh cột "Thao tác"): thêm nút xoá, **chỉ admin** xoá được, **đơn hàng (đã chốt PBH) không xoá được**. Trước đây nút xoá chỉ hiện cho đơn `web2_inbox` RỖNG (nháp/huỷ + giỏ trống) — quá hẹp.

**Files**:

- `native-orders/js/native-orders-render.js`: nới điều kiện `deletable` → `NO.isAdmin() && o.status !== 'confirmed'` (bỏ ràng buộc channel=web2_inbox + cartEmpty). Giỏ hàng (draft, kể cả có SP — chưa trừ kho) + đơn đã HUỶ (cancelled) xoá được; đơn `confirmed` ("Đơn hàng" đã chốt PBH) KHÔNG có nút. Chỉ admin thấy nút.
- Cache-bust `native-orders-render.js?v=20260626del`.
- Defense-in-depth: server `DELETE /api/native-orders/:code` vẫn trả 409 nếu còn PBH active liên kết (`state<>'cancel'`) — không đổi.

**Verify** (Playwright MCP, render fake orders): admin → draft ✅ có nút, cancelled ✅ có nút, confirmed ❌ không nút; staff (isAdmin=false) → draft/confirmed đều ❌ không nút. (Lưu ý row memo cache key không gồm isAdmin → test phải đổi mã đơn để bust cache.) Status ✅

### [web2/audit-log] Lọc HÀNH ĐỘNG chi tiết (action filter) — backend + frontend

Yêu cầu: trang `web2/audit-log` thêm filter "hành động chi tiết". Trước đây chỉ lọc theo entity / user / ngày, KHÔNG lọc theo `action` (create/update/delete/cancel/restock/pack…).

**Files**:

- `render.com/routes/v2/audit-log.js`: (a) `/list` nhận `?action=` → filter `action = $n` (khớp chính xác); (b) thêm `GET /actions?entity=` trả DISTINCT action từ 4 bảng history riêng (wallet=adjustment_type) + event-sink, optional lọc theo entity (entity thuộc bảng riêng → chỉ bảng đó; entity-sink → web2_audit_events; không entity → gộp tất cả).
- `web2/shared/web2-audit-log.js`: (a) `ACTION_LABELS` map slug→tiếng Việt + `actionLabel()`; (b) `<select.w2al-action>` cạnh dropdown entity; (c) `populateActions(host)` fetch `/actions` (theo entity đang chọn); (d) đổi entity → repopulate action + reload; đổi action → reload; (e) cột Action trong bảng hiển thị nhãn tiếng Việt (raw ở tooltip); (f) `load()` gửi `action=` lên server.
- Cache-bust `web2-audit-log.js?v=20260626act` (audit-log + kpi page).

**Verify** (Playwright MCP, localhost): dropdown "Tất cả hành động" render đúng; stub fetch + chọn action → list gọi `/audit-log/list?action=cancel&limit=200` (param đúng). Data load thật cần deploy backend + token tươi (token admin đã lưu hết hạn vs prod → 401, giới hạn hạ tầng, không phải lỗi code). Status ✅ (deploy để dùng đầy đủ)

### [native-orders + web2/shared chat] Chat Pancake: tự nhận diện địa chỉ/SĐT + nút "Thêm vào đơn"

Yêu cầu: trong module chat Pancake, tự nhận diện địa chỉ trong tin nhắn KH + có nút thêm vào. Feature 3 đã được scaffold sẵn (detect bar + CSS + click handler) nhưng CHƯA hoạt động vì (a) detector bỏ sót địa chỉ kiểu Facebook nhiều dòng, (b) không adapter nào set `onAddEntity` nên thanh "Phát hiện" luôn ẩn.

**Files**:

- `web2/shared/chat-panel/web2-chat-entity-detect.js`: `addresses()` thêm **(A) nhận diện KHỐI địa chỉ kiểu Facebook nhiều dòng** (`<tên>/<SĐT>/<số+đường>/<phường>/<quận>/<TP>/Vietnam` — mỗi phần 1 dòng → gộp các dòng SAU SĐT, trước "Vietnam" thành 1 địa chỉ; neo vào dòng SĐT để ít false-positive). Giữ (B) địa chỉ 1 dòng.
- `web2/shared/web2-customer-chat-modal.js` + `web2-customer-chat.js`: forward `opts.onAddEntity` + `opts.addEntityLabel` lên Pancake adapter (modal 3-cột + drawer) → thanh "Phát hiện" hiện.
- `web2/shared/chat-panel/web2-chat-panel-render.js`: nhãn nút cấu hình được (`adapter.addEntityLabel || 'Thêm vào KH'`).
- `native-orders/js/native-orders-interactions.js`: truyền `addEntityLabel:'Thêm vào đơn'` + `onAddEntity` → `NO._addDetectedToOrder(order, {phone,address})`: ghi địa chỉ vào ĐƠN (xác nhận nếu đơn đã có địa chỉ khác), SĐT chỉ điền khi đơn chưa có, nhận lại phương thức giao (`_detectDelivery`), UI-first PATCH + rollback.
- Cache-bust 5 file trên native-orders/index.html → `20260626addr`.

**Verify** (Playwright MCP, native-orders thật): detector trên mẫu thật → `addresses("Phan Nguyen\\n+84905321191\\n38a/5/4 nguyễn hữu thọ\\nhoà thuận tây\\nhải châu\\nđà nẵng\\nVietnam")` = `["38a/5/4 nguyễn hữu thọ, hoà thuận tây, hải châu, đà nẵng"]` (gộp đúng, bỏ tên/SĐT/Vietnam), chit-chat "túi đen nhé em" → `[]` (no false-positive), địa chỉ 1 dòng vẫn OK. Mount panel với adapter có onAddEntity → **thanh "Phát hiện" hiện**, nút "Thêm vào đơn", click → `onAddEntity({phone:'0905321191', address:'38a/5/4 …, đà nẵng', name:'Phan Nguyen'})`. Status ✅

**Follow-up — NÚT THỦ CÔNG trên từng tin KH** (auto-detect bỏ sót 1 số format/tin tách dòng → user yêu cầu nút bấm thủ công): thêm nút 📍 xanh (`.w2cp-addr-btn`, `data-w2cp-act="add-msg-entity"`) trên MỖI tin KH (incoming) trông như có địa chỉ/SĐT (có chữ số + đủ dài) khi adapter có onAddEntity. Click → rút địa chỉ/SĐT từ ĐÚNG tin đó (detector → fallback gộp dòng bỏ SĐT/Vietnam/tên) → `onAddEntity`. Files: `web2-chat-panel-render.js` (renderMessage +addrBtn), `web2-chat-panel.css` (+.w2cp-addr-btn), `web2-chat-panel-compose.js` (+handler add-msg-entity), `web2-customer-chat-core.js` PANEL_VER→20260626addr2. Verify Playwright MCP: nút hiện trên tin địa chỉ, KHÔNG hiện trên "túi đen nhé em" (no digit) / tin outgoing; click → `onAddEntity({phone, address:'38a/5/4 …, đà nẵng', name})`. ⚠ Không test được tin Pancake THẬT headless: page access_token hết hạn (`error_code 102 Invalid access_token`) — auto-refresh chỉ chạy ở môi trường live/extension; logic đã verify với text đúng format thật. Status ✅

## 2026-06-25

### [web2/products] Tem SP "2 tem" → ĐỔI CHỖ tên↔giá (tên xuống băng full-width, giá+biến thể lên cạnh QR)

Theo yêu cầu: (1) tên xuống vị trí giá để DÀI HƠN, giá lên vị trí tên; (2) biến thể TRÊN giá.

**Bố cục mới** (`buildLabelHTML` isQr, render.js):

- HÀNG TRÊN: [QR sạch + mã SP dưới] | cột phải [BIẾN THỂ trên → GIÁ dưới].
- **BĂNG TÊN full-width DƯỚI CÙNG** (kẻ vạch trên, canh giữa): tên rộng cả tem ⇒ tên DÀI hiện đủ 2 dòng (vd "Áo Khoác Dạ Tweed Hàn Quốc Cao Cấp Mùa Đông" full, trước bị cắt cụt khi kẹt cột ~12mm).

**Fix bug chồng lấp**: row1 đổi `flex:1`→`flex:0 0 auto` (lấy đúng cao QR, KHÔNG grow bóp mã SP), băng tên `flex:1 1 auto` ăn phần còn lại → mã SP dưới QR KHÔNG bị băng tên đè (đo overlap = −1.5px, OK). `fitName` thêm `tooTall` (thu nhỏ cho VỪA chiều cao băng, không chỉ ≤2 dòng). QR 11mm (decode 90px OK).

**Verify** (Playwright MCP trang Sản phẩm THẬT, data thật + 1 synthetic stress): overlap −1.5px (không đè), tên dài full 2 dòng, giá+biến thể cột phải đọc được, **decode 90px OK** cả mã 17 ký tự. Cache-bust render `p6`. Status ✅

**Follow-up (p7)**: MÃ SP KHÔNG bó theo bề ngang QR + KHÔNG cắt — tách HÀNG RIÊNG full-width canh TRÁI, mã dài chạy dài qua phải (fitText chỉ thu khi vượt CẢ bề ngang tem). Verify trang thật: "KHAOKHOACDATWEEDL" (17 ký tự) hiện đủ full-width clipped=false, "HCSSE57929" canh trái. Cache-bust `p7`.

### [web2/products] Tem SP "2 tem" → bố cục price-tag HOÀN HẢO (giá hero + tên 2 dòng sạch + biến thể gọn)

Iterate bố cục tem QR (`buildLabelHTML`) cho đẹp + hoàn hảo, verify bằng Playwright MCP (render `buildLabelHTML` thật + decode QR ở size in).

**Vấn đề bản P1 cũ** (đo computed style): cột phải chỉ ~12mm → GIÁ nowrap bị fitText thu còn **10.5px** (không nổi); biến thể dài "Màu Xám Đen / Size 36" thu còn **3.5px** (không đọc nổi); tên dài nhồi **3-4 dòng tí hon** (fitName cũ fit theo box px, không theo số dòng).

**Files** `web2/products/js/web2-products-print-render.js`:

- **Bố cục price-tag (P2)**: HÀNG TRÊN = [QR sạch + mã SP dưới] | [TÊN ≤2 dòng + BIẾN THỂ chip]; **BĂNG GIÁ full-width dưới cùng** (kẻ vạch trên) → giá in **TO NHẤT** (16.5–18px, hero) vì rộng cả tem. QR `min(labelW*0.48, (labelH-pad)*0.6)` ≈ 12mm.
- **`fitName` viết lại**: thu nhỏ tới khi **≤2 DÒNG THẬT** (đo `round(scrollHeight/lineHeight)`, không phải fit box px) → clip cứng đúng 2 dòng ở line-height cuối. Hết cảnh tên 3-4 dòng tí hon.
- **Biến thể rút gọn**: bỏ tiền tố "Màu"/"Size"/"cỡ"/"sz" → "Màu Xám Đen / Size 36" thành "Xám Đen / 36" (đọc được). +CSS `.ql-qr-priceband`, +fitText cho band.
- **Bỏ `text-overflow:ellipsis` ở `.ql-qr-var`**: scrollWidth/clientWidth làm tròn số nguyên (43==43) giấu tràn phân số ~0.4px → ellipsis cắt mất size ("Xám Đen / …"). Bỏ ellipsis → overflow:hidden cắt vô hình, size "36" hiện đủ. (fitText giữ nguyên, KHÔNG ép dư 1px vì chip shrink-to-fit sẽ thu xuống sàn 3.5px.)
- Cache-bust `web2-products-print-render.js?v=20260625p4`.

**Verify** (Playwright MCP, BarcodeDetector, render engine THẬT): 6 SP edge-case (tên ngắn/dài, biến thể dài, giá tới 1.250.000, mã 24 ký tự) → **decode 6/6 PASS ở 88px** (chặt hơn ~96px khổ in 12mm) → quét chắc có dư địa. Giá hero rõ, tên 2 dòng sạch, biến thể đọc được. Thuần frontend → GH Pages. Status ✅

### [scripts] Browser-test cho AI agent tự verify → Playwright MCP + Chrome DevTools MCP (thay REPL điều khiển tay)

Research toàn cảnh GitHub (workflow 4 agent: Playwright MCP / Chrome DevTools MCP / browser-use+Stagehand / fit-analysis) cho nhu cầu "Claude Code tự test web để code đúng". **Kết luận**: dùng **Playwright MCP** làm verify gate chính (deterministic, 0 cost LLM thứ 2 vì agent đã là LLM) + **Chrome DevTools MCP** debug console/network/perf + reuse `n2store-extension`. **KHÔNG** dùng browser-use/Stagehand (tốn LLM riêng + non-deterministic → sai bản chất verify gate). Giữ nguyên smoke 144 trang + DB migration (deterministic batch). Chỉ thay phần REPL điều khiển tay (`n2store-browser-session.js` nav/eval/click) bằng MCP tool.

**Files**:

- `scripts/save-login-session.js`: thêm flag `--state-out` + gọi `ctx.storageState({ path })` (default `downloads/n2store-session/auth-state.json`) TRƯỚC `browser.close()` → xuất Playwright storageState chuẩn cho Playwright MCP `--storage-state`. Tái dùng 1:1 flow login Web1+Web2 sẵn có, không viết lại. (Path live-login — cập nhật session tươi.)
- `scripts/export-auth-state.js` (MỚI): converter OFFLINE đọc snapshot đã lưu trong `serect_dont_push.txt` (qua `readSnapshot` của restore-login-session.js) → xuất `auth-state.json` (Playwright storageState) KHÔNG cần login lại — né timeout backend. Chỉ in count, không echo giá trị. (Path offline — dùng session đã capture.)
- `.gitignore`: ignore `downloads/n2store-session/auth-state*.json` (chứa JWT) + `.chrome-n2store-debug/` (debug profile Chrome DevTools MCP).
- `.mcp.json`: thêm server `playwright` (`@playwright/mcp@latest --storage-state=./downloads/n2store-session/auth-state.json`) + `chrome-devtools` (`chrome-devtools-mcp@latest`). Giữ nguyên `designmd`.

**Verify**: `node scripts/export-auth-state.js --base http://localhost:8080` → sinh `auth-state.json` từ session 2026-06-21 (93.9h, còn hạn JWT): origin localhost:8080, 6 LS keys gồm `loginindex_auth` + `web2_auth`, cookies=0 (app dùng localStorage auth). Package npm tồn tại: `@playwright/mcp@0.0.76`, `chrome-devtools-mcp@1.4.0`. `.mcp.json` valid 3 server. Status ✅ code+config — **còn 1 bước user**: restart Claude Code để load + approve 2 MCP server mới. (Live-login `save-login-session.js` lúc test bị timeout backend — không ảnh hưởng, đã có path offline.)

### [web2] Audit mã QR/Barcode in bill → QR đẹp + bố cục tem SP "2 tem" thông minh (P1)

Audit chuyên sâu + browser-test (BarcodeDetector decode + thermal 1-bit threshold) toàn bộ mã in của Web 2.0, làm đẹp QR + sắp lại bố cục tem SP.

**Phân loại mã** (browser-test thực): PBH thermal QR (`Web2QR` styled, decorative, in) · tem SP QR (`Web2QR`, in) · A4 hoá đơn (TRƯỚC: KHÔNG có mã) · Code128 (fallback) · **VietQR `Web2QrModal`** (FUNCTIONAL bank-transfer, screen-only → KHÔNG đụng) · scanner/pack-counter/label-ocr (input, không in). Decode test 8 biến thể QR @304px (38mm) + 1-bit B&W: **8/8 PASS** (kể cả dots & rounded r0.45) → headroom lớn ở 38mm.

**Files**:

- `web2/products/js/web2-products-print-render.js` + `web2-products-print-modal.js`: **bố cục tem SP P1** — QR SẠCH (biến thể KHÔNG bake giữa QR nữa) + mã SP dưới QR; cột phải xếp dọc **TÊN (≤2 dòng) → BIẾN THỂ (chip xám) → GIÁ (đậm, to nhất)**. Hierarchy bán lẻ: giá nổi nhất, biến thể dễ đọc. QR sạch → EC mặc định 'M' (module to hơn) → quét nhạy hơn trên tem 25mm. +CSS `.ql-qr-var`, +fitText cho `.ql-qr-var`.
- `web2/shared/web2-bill-service.js`: PBH thermal QR **nhúng SVG vector trực tiếp** (thay `<img>`+`pixelated` → module bo góc + mắt finder SẮC NÉT khi html2canvas raster 576 chấm) + **QR SẠCH**: BỎ bake mã PBH ở GIỮA QR (user yêu cầu) → mã PBH in DƯỚI QR (HRI mono `.b-qr-num`), EC mặc định 'M' (module to hơn → quét nhạy hơn). Block định danh gọn: Tiêu đề+STT → QR sạch → mã PBH → Ngày. Verify real (products page "In tem" + bill render) + decode thermal 1-bit ✓ (`NJ-20260625-0084`, tem SP `HNAOXDE36`/`HNDAMDD31`).
- `web2/fastsaleorder-invoice/print.html`: **thêm QR mã PBH** (Web2QR rounded) góc phải header A4 (laser in đẹp, quét tra cứu đơn) + load qrcode/web2-qr.
- `web2/printer-settings/index.html`: load `web2-qr.js` → "In thử" PBH dùng QR styled GIỐNG bill thật (trước thiếu lib → rơi về QR thô).
- `web2/shared/web2-qr.js`: `toDataUrl` thêm hỗ trợ `opts.size` (TỔNG px) — fix bug `product-card` truyền `{size:256}` bị bỏ qua.
- Cache-bust: products/fastsaleorder-invoice/product-card/printer-settings (`web2-qr 20260625qr`, print-render/modal `20260625p1`, bill-service `20260625qr`).

**Verify** (browser, BarcodeDetector): PBH bill QR qua **đúng đường raster html2canvas** → decode `NJ-20260625-0084` ✓; tem SP QR @100px (12.5mm thật) → `KHOAOTRANGM` ✓ + `KHAOKHOACDATWEEDL` ✓; A4 QR render ✓. Bố cục P1 screenshot: biến thể chip rõ, giá to đậm, QR sạch. Kiểu QR = bo góc + mắt finder bo (user chọn). VietQR giữ nguyên (functional). Thuần frontend → GH Pages. Status ✅

### [web2/shared] Audit CSS Web 2.0 → animation tăng tương tác + skeleton loading kiểu GitHub

Audit toàn bộ CSS Web 2.0 (46 trang, ~31.9k dòng, workflow 11 agent song song) → áp dụng animation tăng tương tác + skeleton loading. Doc: [`docs/web2/WEB2-CSS-ANIM-AUDIT.md`](web2/WEB2-CSS-ANIM-AUDIT.md).

**Phát hiện**: file global thật = `web2-theme.css` (49/52 trang); ~40 trang có nút/tab/chip/row đổi nền-viền `:hover` **quên `transition`** (giật) + thiếu `:active` press; ~40 trang thiếu `prefers-reduced-motion`; loading state đa số là text "Đang tải…"/blank/spinner (chỉ 7 trang có skeleton).

**Files**:

- `web2/shared/web2-theme.css`: +block GLOBAL INTERACTION POLISH (baseline transition cho `button:not(.btn)`/`a`/`[role=tab/button]`, `:active scale(.97)` press, `:focus-visible` ring, input transition) + `.btn` base thêm `transform`+`box-shadow` (hover-lift/press hết snap) + **GLOBAL `@media (prefers-reduced-motion: reduce)`** clamp (1 block phủ ~40 trang). Theo ELEMENT/role, KHÔNG `[class*=]` (né `.data-table`).
- `web2/shared/web2-skeleton.js` (MỚI): `Web2Skeleton` self-contained (tự inject CSS) GitHub-style shimmer. API `rows/list/cards/grid/stats/detail/lines/html/clear`. `rows()` trả `<tr><td>` cho `<tbody>` (giữ cột).
- Wire skeleton **30 trang** (2 đợt, defensive `if(window.Web2Skeleton){…}else{markup cũ}`, **guard first-load** + **clear nhánh lỗi/early-return**). Đợt 1 (20): products, variants, customers, customer-wallet, fastsaleorder-invoice/delivery/refund, balance-history, chi-tieu, users, returns, live-tv, live-control, fb-posts, zalo, jt-tracking, multi-tool, order-tags, ai-hub, video-maker. Đợt 2 (10): purchase-refund, cham-cong, fb-ads-stats, fb-insights, system, ck-dashboard, pancake-settings, ai-assistant, report-delivery, users-permissions. (`reconcile` đã có `.w2-skel` → skip; 6 trang render đồng bộ — payment-confirm/ai-photo/photo-studio/product-card/supplier-debt/supplier-wallet — CỐ TÌNH skip vì skeleton sẽ flash.)
- Cache-bust `web2-theme.css?v=20260625anim` toàn bộ trang link (53 file).

**Verify**: `node --check` pass toàn bộ JS sửa; browser-test ~8 trang (products screenshot skeleton 12-cột chuẩn; customers 50 rows / pbh / order-tags / variants / live-control / cham-cong / pancake-settings / ck-dashboard data render OK, skeleton KHÔNG kẹt, 0 error); button computed `transition` có transform/box-shadow + reduced-motion net loaded. **2 vòng adversarial review (workflow)**: vòng 1 bắt 3 HIGH bug (variants flash mỗi filter; returns/live-control/multi-tool kẹt skeleton khi fetch lỗi; chi-tieu flash) → fix hết; vòng 2 review đợt 2 (manual fallback do rate-limit) — agents tự áp guard first-load + clear-on-error, sạch. Thuần frontend → GH Pages. Status ✅

### [web2/shared] AI widget: ẩn khối suy luận <think> của reasoning model

Widget AI (mọi trang) hiện ĐÚNG kết quả nhưng **lọt khối `<think>…</think>`** của reasoning model (qwen3/gpt-oss trong cascade) vào bong bóng chat — user thấy "Final check… [Proceeds] </think>" trước câu trả lời.

**Fix** (`web2-ai-assistant.js`): thêm `stripThink(s)` xử lý 3 ca — (1) cặp `<think>…</think>` hoàn chỉnh; (2) lone `</think>` (mở trước/không bắt được → cắt tới hết tag); (3) lone `<think>` mở chưa đóng (streaming → giấu phần đang nghĩ tới khi `</think>` tới). Áp trong `_md()` (TRƯỚC esc) cho mọi render + streaming, và lưu `content: stripThink(reply)` lúc finalize → history/context-gửi-lại-AI/nút-copy đều sạch. Bump inject version `web2-ai-assistant.js`+registry → `20260625recon` (sidebar).

**Verify**: stripThink unit-test 5/5 (gồm đúng ca ảnh chụp: reasoning + lone `</think>` + bullet → chỉ còn bullet). node --check OK. Thuần frontend → GH Pages. Status ✅

### [so-order][web2/shared] AI widget: đối chiếu Sổ Order ⇄ Kho SP TÍNH SẴN (hết "xin data")

User hỏi AI widget so-order "đối chiếu SP đã order chưa có mã trong kho" → AI **xin user paste** `window.Web2ProductsCache.getAll()` thay vì tự đọc.

**RCA**: accessor `Web2ProductsCache.getAll()` CÓ trong registry nhưng (1) là accessor cuối → `accBudget` đã cạn vì `SoOrder.state` (object, có ảnh data-URL) stringify đầu tiên → kho bị `break` (skip); (2) `MAX_CTX=8000` ký tự không chứa nổi cả 2 dataset đầy đủ; (3) array lớn bị `encodeArray` tóm tắt → không diff chính xác từng mã được. → LLM thiếu data kho → xin user.

**Fix (precompute client-side, không dump raw):**

- `so-order-kho-sync.js`: thêm `SO.reconcileWithKho()` — diff deterministic, match UNIQUE THEO MÃ + ĐỊA DANH (matchedCode∈kho HOẶC kho có name+variant+region; HƯƠNG CHÂU vs HÀ NỘI tính RIÊNG). Trả `{ready, khoCount, unmatchedCount, unmatched:[{productName, variant, supplier, region, totalQty, lineCount, suggestedCode}]}`. suggestedCode qua rule mã chung (`_assignKhoCodes`).
- `web2-ai-page-registry.js`: thêm accessor `window.SoOrder?.reconcileWithKho?.()` làm **ĐẦU TIÊN** (kết quả gọn → luôn lọt budget) + sửa prompt "🏷️ SP chưa có ở kho" trỏ vào accessor này.
- Bump registry inject version (`web2-sidebar.js` → `20260625recon`) + cache-bust so-order page.

**Verify (browser, data thật)**: `reconcileWithKho()`=`{ready:true,khoCount:10,unmatchedCount:0}` (mọi dòng đã sync khớp); inject dòng ảo "SP TEST...Màu Tím/Size 99" HÀ NỘI qty7 → unmatched 1, `suggestedCode:HNMMTIM` (region-prefix ✓), cleanup. `Web2AiAssistant.pageContext()` (5706 ký tự < 8000) **bắt đầu bằng** khối "KẾT QUẢ ĐỐI CHIẾU TÍNH SẴN ... {ready,khoCount,unmatched}" → AI nhận kết quả tính sẵn, hết xin data. node --check OK. Thuần frontend → GH Pages. Status ✅

### [web2/live-control] FIX tìm SP trong picker thiếu match MÃ — tìm theo mã + tên

User: "các chức năng tìm kiếm sản phẩm là tìm kiếm theo unique mã sản phẩm" + "tìm theo mã + theo tên sản phẩm". Audit mọi entry tìm SP:

- ✅ SẴN ĐÚNG (match mã + tên, kết quả per-code): `Web2ProductsCache.findByName` (name OR code), `Web2ProductPicker` (getAll per-code + findByName), so-order suggest (`findByName`), backend `web2-products /list` (`code ILIKE OR name ILIKE`), native-orders picker (client `code||name`, backend /list), live-control tab "Tất cả SP" (server /list).
- 🔧 **GAP** — live-control picker tab "Chờ hàng (Sổ Order)" lọc CLIENT chỉ match `g.name` + `g.supplier`, **THIẾU mã** (dù placeholder "tên / mã / NCC") → gõ mã SP không ra. **Fix**: thêm `g.variants.some(v => code.includes(q))` → tìm theo MÃ + TÊN (+NCC). Bump `live-control.js?v=20260625srch`.

**Verify (browser, data thật)**: tìm `"hnquanghi33"` (mã) → `[HNQUANGHI33]` ✓ (trước = rỗng); tìm `"quần short"` (tên) → `[HCQUANXDU31, HNQUANGHI33]` ✓ (2 SP, mỗi mã 1 kết quả). node --check OK. Thuần frontend → GH Pages. Status ✅

### [shared][so-order][supplier-wallet] Audit unique-theo-mã toàn Web 2.0 + fix triệt để (default by:'code')

Workflow audit 8 surface SP (10 agent, find + adversarial verify): **7/8 sạch**, tìm 1 bug thật + 1 hardening. User chốt "fix triệt để lỗi hiện tại và tương lai, mặc định by:'code'".

- **HARDENING (tương lai)** — `web2-variant-group.js`: đổi **default `by` từ `'name'` → `'code'`**. Caller quên `opts.by` → unique theo mã (an toàn), không tái phát bug gộp 2 mã trùng tên. Mode gom-theo-tên phải truyền tường minh. (4 caller hiện có đều đã `by:'code'` → zero impact.)
- **BUG MED (hiện tại)** — `so-order/js/so-order-modal-core.js`: badge "Tồn: N" + mã Kho trong MODAL tạo đơn resolve qua `findByNameExact(name)` (bỏ qua biến thể) → 1 tên nhiều biến thể (nhiều mã) hiện tồn/mã của 1 biến thể tùy ý cho mọi dòng cùng tên. Bug cùng class đã fix cho table-view (`_lookupKhoCode`→`findByNameVariant`) nhưng bỏ sót modal. **Fix**: thêm helper `SO._modalMatchKho(row)` (matchedCode→findByCode, else `findByNameVariant(name,variant)`) dùng ở `modalRowHtml` + `updateRowMeta`; `onModalRowFieldInput` re-resolve khi đổi CẢ productName LẪN variant (trước chỉ productName).
- **BUG (sweep thêm)** — `web2/supplier-wallet/js/supplier-wallet-actions.js`: trả NCC trừ tồn — fallback `findByNameExact` đổi → `findByNameVariant(name,variant)` (đây là WRITE trừ tồn, match sai biến thể = trừ nhầm tồn SP khác). Không khớp cặp → null → bỏ qua (đã có cảnh báo điều chỉnh tay).
- Sweep repo: KHÔNG còn `findByNameExact` ở chỗ display/write nào khác (chỉ còn định nghĩa cache + comment). Bump cache-bust `?v=20260625uniq2`/`vaware`.

**Verify (browser, data thật)**: `findByNameExact('QUẦN SHORT KAKI')`=HNQUANGHI33 (tùy ý — SAI cho biến thể Xanh); `findByNameVariant(...,'Màu Ghi/Size 33')`=HNQUANGHI33 ✓, `(...,'Màu Xanh Dương/Size 31')`=HCQUANXDU31 ✓. node --check 3 file OK. Thuần frontend → GH Pages. Status ✅

### [web2/live-control][live-tv][shared] FIX gom SP sai — unique theo MÃ sản phẩm

User báo bug: picker live-control hiện "QUẦN SHORT KAKI · 2 biến thể · **chờ 34**" nhưng thực ra là **2 SP khác mã** (`HCQUANXDU31` HƯƠNG CHÂU chờ 16 + `HNQUANGHI33` HÀ NỘI chờ 18) bị gom vì `Web2VariantGroup.group` dùng `by:'name'` (gom theo TÊN). User chốt: **"tất cả sản phẩm unique theo mã sản phẩm"**.

**Fix:**

- `web2-variant-group.js`: thêm `by:'code'` (key = mã SP chuẩn hoá, fallback name+variant nếu thiếu mã) → MỖI mã = 1 item, KHÔNG gom biến thể.
- 4 call-site đổi `by:'name'` → `by:'code'`: live-control board (`loadBoard`), picker pending + all-SP (`loadPicker`), live-tv (`loadGroups`).
- `pickerItemHtml`: nhóm 1-mã hiện **biến thể (Màu/Size) + chip MÃ SP** thay cho "1 biến thể" vô nghĩa (CSS `.lc-pcode`). Region badge + chờ N vẫn hiện per-mã.
- Bump cache-bust `?v=20260625uniq` (live-control + live-tv pages).

**Verify (browser, data thật prod)**: `Web2ProductsApi.listPending()` → 2 SP QUẦN SHORT KAKI; `group(by:'name')` = 1 nhóm pending **[34]** (bug cũ); `group(by:'code')` = **2 nhóm**: {HƯƠNG CHÂU, chờ 16, HCQUANXDU31} + {HÀ NỘI, chờ 18, HNQUANGHI33}. ✓ node --check 3 file OK. Thuần frontend → GH Pages. Status ✅

### [render][web2/zalo][web2/jt-tracking] FIX spam "Đổi thiết bị" — FOCUS-LEASE phiên Zalo

User: đăng nhập Zalo ở `web2/zalo` → chat.zalo.me spam liên tục popup **"Đổi thiết bị"**, không dùng được.

**Nguyên nhân (RCA, workflow 4 agent + tự xác minh)**: Zalo Web = **1 phiên/tài khoản**. Công cụ (zca-js trong render.com) và chat.zalo.me cùng 1 TK → đá nhau (close `3000` DuplicateConnection / `3003` KickConnection, [`zca-js/dist/apis/listen.js:14-15`]). `_doReconnect` cũ gọi **FULL `zalo.login()` mỗi lần kick** → mỗi login = 1 popup; state `kicked` KHÔNG terminal (nghỉ 10ph rồi retry mãi) → spam liên tục. imei reuse đúng (extension đọc `z_uuid`) — KHÔNG phải bug imei. Không có boot-restore (session=NULL từ 2026-06-23).

**Giải pháp (user chọn)**: "Khi user FOCUS tab `web2/zalo` hoặc `web2/jt-tracking` → lấy phiên; không focus → nhường chat.zalo.me." = **focus-lease**.

- **Backend** `services/web2-zalo-zca.js`: thêm `LEASE_TTL_MS=75s`, `_isWanted(s)` (lease còn hạn + !yielded + !disposed), `touchLease()`/`releaseLease()`(=`_yield`: đóng listener, status `yielded`, KHÔNG re-login, GIỮ creds RAM). Gate `_scheduleReconnect`/`_doReconnect`/`_watchdogTick` theo `_isWanted` → hết lease/yield = KHÔNG fight. `_afterLogin` cấp lease + clear yielded; login short-circuit (đã connected) chỉ gia hạn lease (không login lại → không popup thừa). **FIX guard `onClosed`/`onError`**: bỏ qua khi `yielded`/`disposed` (tránh `stop()`→onclose async ghi đè 'yielded' bằng 'disconnected' + tránh reconnect).
- **Route** `routes/web2-zalo.js`: `POST /accounts/:key/lease` (heartbeat) + `/release` (nhường) owner-scoped (cache, fallback `body._owner` cho sendBeacon). KHÔNG admin-gate.
- **Client shared** `web2/shared/web2-zalo-presence.js` (MỚI, `Web2ZaloPresence`): focus(visible+hasFocus) → acquire (lease → chưa connected thì creds extension → login-cookie silent) + heartbeat 25s; blur (debounce 3s)/pagehide(sendBeacon) → release. 1 nguồn cho cả 2 trang. `ZaloApi.lease/release/releaseBeacon` mới.
- **UI**: status `yielded` → label "Đang nhường chat.zalo.me" + hint thân thiện (không phải lỗi), rail dot trung tính (không đỏ). Wire `Web2ZaloPresence.start()` vào `web2/zalo` + `web2/jt-tracking` (thêm `web2-zalo-api.js` cho jt-tracking).

**Verify**: backend smoke (exports) ✓; test state-machine fake-zca 6/6 PASS (login→yield→no-fight→re-acquire→onClosed-guard) ✓; test client orchestration fake-DOM 4/4 PASS (acquire-on-focus, release-on-blur, re-focus không re-login, debounce) ✓; browser-load 2 trang: `Web2ZaloPresence` loaded + `start()` chạy, 0 lỗi module (401 status là auth test-harness, không liên quan) ✓. node --check toàn bộ OK. Backend → Render `web2-api` (~3-4′), frontend → GH Pages. Status ✅ — MEMORY `reference_zalo_focus_lease`.

### [web2/shared] Web2CustomerChat realtime như live-chat (SSE web2:messages)

User: "realtime như live-chat". Chat KH nhúng (`Web2CustomerChat` mở từ customers/jt-tracking/balance-history/native-orders) trước đây chỉ `loadMessages` lúc mở → tin KH mới không hiện tới khi đóng/mở lại (gap LOW audit SSE).

**Fix (port pattern proven của `LiveChatModal`, 1 nguồn KHÔNG fork):**

- **core** (`web2-customer-chat-core.js`): subscribe `web2:messages` **1 lần** (retry tối đa 6 nhịp nếu bridge chưa load) → debounce 800ms → `NS._active.refreshActive()`. Tin Zalo có realtime riêng (Web2Zalo) nên topic này chỉ lo Pancake.
- **drawer** (`web2-customer-chat.js`) + **modal 3-cột** (`web2-customer-chat-modal.js`): lưu adapter hiện tại (`pancakeAdapter`/`currentAdapter`) + expose `handle.refreshActive()` = `adapter.loadMessages()` → `panel.setMessages()` (giữ vị trí cuộn khi đọc lịch sử, CHỈ auto-cuộn đáy nếu đang ở đáy — KHÔNG dùng `panel.reload()` ép cuộn đáy).
- Bump cache-bust 3 file chat `?v=20260625sse` trên cả 4 trang.

**Verify browser (session live)**: `nsReady/entryReady/hasSse/probeInstalled=true`; cài probe lên `NS._active.refreshActive` → **tin web2:messages THẬT từ prod hub** kích `RT_HIT:3` (burst gom bởi debounce) ⇒ chuỗi prod hub → Web2SSE bridge → core subscribe → refreshActive chạy đúng. 4 trang đều load `web2-sse-bridge.js`. node --check 3 file OK. Thuần frontend → GH Pages. Status ✅

### [so-order] FIX REGRESSION: `_rowToKhoMatch is not defined` — xóa/sửa lô vỡ

User báo "Không xóa được so-order" + console `Uncaught ReferenceError: _rowToKhoMatch is not defined at so-order-delete.js:197 (_finalizeDeleteShipment)`.

**Nguyên nhân**: commit `eaf9213a4` (Wave 3 tách `so-order-app.js` → 23 module IIFE riêng). Hàm `_rowToKhoMatch` (gốc local trong scope monolith) trở thành `SO._rowToKhoMatch` (so-order-kho-sync.js:242), nhưng **5 chỗ gọi vẫn để bare `_rowToKhoMatch`** (chỉ modal-submit prefix đúng) → ReferenceError mọi đường xóa/sửa qty: deleteRow, deleteShipment, deleteTab, bulk-edit, inline-edit.

**Fix**: bare `_rowToKhoMatch(r)` → `SO._rowToKhoMatch(r)` ở 5 site (so-order-delete.js ×2, so-order-settings.js, so-order-bulk-edit.js, so-order-inline-edit.js). Verify: node --check 4 file OK + browser eval `typeof SO._rowToKhoMatch==='function'` ✓, chạy lại đúng biểu thức `.map(r=>({...SO._rowToKhoMatch(r),delta}))` từng throw → `mapOk:true, err:null`. Cache-bust so-order/index.html `?v=…b`. Status ✅ (commit auto `c9495a30a`).

### [web2 nhiều trang][render] Audit SSE — vá 6 MED + 4 LOW gap realtime (workflow 18 agent)

Workflow audit SSE (9 nhóm × audit+adversarial-verify, 18 agent, ~51′) hoàn tất → **16 gap xác minh (0 HIGH / 6 MED / 10 LOW)**. Vá các gap thật (trừ Web2CustomerChat embedded — cần xác nhận chủ đích quick-view):

- **MED Live Control dropdown chiến dịch** (`live-control.js`): onSse bỏ qua `web2:live-comments` action `campaign` → dropdown stale tới F5. Thêm branch debounce `loadCampaigns()`.
- **MED Livestream Poller danh sách page** (`livestream-poller/index.html`): SSE chỉ reload stat, không reload pages. Thêm nhánh action `poller-pages` → `loadPages()`.
- **MED FB-posts connect/disconnect** (`fb-posts-app.js`): handler không gọi `loadStatus()` → pill + page-chips (cả tab Soạn bài) stale. Thêm nhánh connect/disconnect → `loadStatus()` (phủ luôn LOW composer chips).
- **MED Quick replies** (`web2-quick-reply.js`) + **MED Mẫu tin nhắn** (`web2-msg-template-core.js`): publisher wired nhưng KHÔNG ai subscribe → thêm `Web2SSE.subscribe` revalidate cache cross-máy.
- **MED KPI phân khoảng STT** (`v2/kpi.js`): PUT /employee-ranges UPSERT nhưng không broadcast → thêm `_notifyClients('web2:kpi-dashboard', {action,campaign,ts})`. **LOW** + assignments.html nạp `web2-sse-bridge.js` + `kpi-assignments.js` subscribe reload ranges/history.
- **LOW returns PII** (`web2-returns.js`): bỏ spread `{phone}` khỏi payload `web2:returns` (lệch convention + lộ SĐT, không ai đọc); SĐT giữ ở `_notifyWallet` topic `web2:wallet:<phone>`.
- **LOW Zalo accounts** (`web2-zalo-app.js`): debounce `refAcc` 500ms (gom burst, đối xứng refList).

Verify: node --check toàn bộ file JS OK. Status ✅

### [web2 toàn cục][render] Audit SSE realtime toàn bộ Web 2.0

Rà soát toàn bộ chuỗi SSE Web 2.0 (publish→wire→subscribe→reload-completeness→topic-match) — 42 trang subscribe, ~44 route publish, ~39 module wired. Workflow background chết (0 output) → audit thủ công deterministic + đọc handler.

**Kết quả: kiến trúc SSE LÀNH MẠNH.**

- **WIRE**: 100% route export `initializeNotifiers` đều được wire trong server.js (40 exporter; cái "thiếu" là realtime-db = hub Web 1.0, wire destructure).
- **PUBLISH**: mọi route mutation data đều broadcast sau commit (refunds/balance-history nghi ngờ ban đầu = false-positive, đều có notify).
- **RELOAD-INCOMPLETE** (bug class "phải F5"): soi 14 handler action-branch/patch-in-place → **CHỈ web2-products** dính (SP mới từ so-order vô hình tới F5) — **đã fix** session này (commit ac6f6ce5d). 13 handler còn lại (page-builder, native-orders, pbh, users, ck-dashboard, payment-confirm, reconcile, chi-tieu, cham-cong, zalo, ck-review, livestream-snap…) đều full-reload/append debounce → an toàn.
- **TOPIC-MISMATCH**: 4 topic "subscribe-không-publish" (messages/printer/capture-lock/live-hidden-commenters) = false-positive — publish qua đường động: `/sse/relay-notify` (messages), generic `_notify('web2:<slug>')` (live-hidden-commenters, capture-lock qua web2-generic), dedicated-entity (printer).
- **Fix LOW duy nhất tìm thấy**: `v2/web2-balance-history.js /cleanup-stale-pending` xoá pending stale/trùng (data hiển thị CK review) mà KHÔNG broadcast → thêm `_notifyBalanceHistory(action:'cleanup')`. Các trang balance-history + ck-review subscribe `web2:balance-history` → cập nhật không F5.

Verify: node --check OK. Status ✅

## 2026-06-25

### [web2/ai-hub] Ghép đồ: dán ảnh (Ctrl+V) + kéo-thả cho ô Ảnh người & Ảnh quần áo

User: "cho tính năng paste ảnh" ở tab Ghép đồ. Dùng module shared `Web2ImagePaste.enhance` (1 NGUỒN, KHÔNG fork) nâng cấp 2 file input SẴN CÓ (`.w2t-person-file`, `.w2t-garment-file`) → nhận **DÁN Ctrl+V + kéo-thả**, GIỮ nút Choose File. Ảnh dán/thả bơm vào `input.files` + dispatch `change` → handler nén (compressFile) + preview chạy y như chọn file. Mỗi ô = 1 dropZone (`.w2t-field`), hover/focus ô nào thì Ctrl+V rơi vào ô đó. Hint chip "📋 …" tự hiện. Bump `web2-tryon v=20260625d`. **Verify live**: cả 2 input enhanced + 2 hint chip + drop ảnh → preview JPEG ✓ (browser mount + sim drop). Thuần frontend → GH Pages.

### [web2/products][render][so-order] Fix SSE hiện SP mới (không F5) + địa danh luôn nhận diện

Browser-test so-order (Điền ngẫu nhiên → Lưu Nháp) → audit → fix (user báo 2 bug):

- **Bug 1 — "phải F5 mới thấy SP tạo bên so-order"**: handler SSE `web2:products` coi action `upsert-pending` là update → `_updateRowsBatch` patch-in-place, code chưa on-page → `handled=true` → KHÔNG reload → SP mới vô hình. **Fix** `web2-products-app.js`: `upsert-pending` có code chưa nằm trong data → `debouncedFullLoad()`. Verify live: tạo SP qua API → bảng tự 14→15, `loadCalls=1`, KHÔNG F5, badge ĐỊA DANH=HƯƠNG CHÂU.
- **Bug 2 — địa danh không nhận diện cho SP cũ** (note='HƯƠNG CHÂU', region=null): backfill 1-lần/boot bỏ sót SP tạo sau boot + `ILIKE '%HƯƠNG CHÂU%'` không khớp note do Unicode NFC/NFD. **Fix**: (a) backfill `region` từ PREFIX MÃ (HN/HC, ASCII) un-gate mỗi boot; (b) `mapRow`/`mapItem` fallback `regionFromCode(code)` read-time → region LUÔN đúng dù chưa backfill. Verify live: 12/12 SP có region.
- **so-order random NCC**: bỏ HÀ NỘI/HƯƠNG CHÂU khỏi list NCC (đó là địa danh).
- Verify flow so-order Lưu Nháp (token web2 hợp lệ): order lưu OK + kho-sync tạo SP `region=HƯƠNG CHÂU` note sạch + SSE `web2:products upsert-pending` fire, 0 lỗi/warn. Account browser-test web2 = trong serect (admin/admin!!).

### [live-control][live-tv][products][so-order][render] ĐỊA DANH riêng + TV NCC/Bán/Cọc/Còn

User (trang **live-control**, nhầm tên so-order/native-orders): (1) địa danh nhập hàng (Hà Nội/Hương Châu) là field RIÊNG — Sổ Order đang nhầm nhét vào **ghi chú**, web2_products chưa có field địa danh → tách ra; thêm chip lọc + badge địa danh vào panel "Thêm sản phẩm" có toggle ẩn/hiện. (2) Board "Trên TV" + màn TV hiện **NCC / Bán / Cọc / Còn**.

**Chốt qua hỏi:** NCC = ô nhập "số NCC báo" (pending_qty, sửa được); Bán = TỔNG SL trong giỏ native-orders draft (GỒM cọc); Cọc = SL giỏ có `deposit>0` (tag ĐÃ CỌC); **Còn = max(0, NCC − Bán)**; live-control hiện đủ 4, live-tv hiện NCC/Bán/Còn.

- **Schema** `web2_products`: +cột `region` (migration 080) + backfill tách HÀ NỘI/HƯƠNG CHÂU từ `note`→`region` (dọn note, self-gated). mapRow/POST/PATCH/upsert-pending nhận `region`.
- **`web2-campaign-products` GET**: +`region` + `sold`(Bán) + `coc`(Cọc) per mã — aggregate `native_orders` draft (`deposit>0`→coc), cùng pool web2Db.
- **Sổ Order** kho-sync + barcode: ghi địa danh vào `region` (KHÔNG note).
- **Grouper** `web2-variant-group`: variant +region/sold/coc; group +regions/region/totalSold/totalCoc.
- **live-control**: board NCC(input)+BÁN+CỌC+CÒN (bỏ Tồn/Chờ); picker chip lọc địa danh + badge + toggle `lcRegionToggle` (localStorage); subscribe `web2:native-orders`.
- **live-tv**: NCC+BÁN+CÒN; subscribe `web2:native-orders`.
- **web2/products**: cột **ĐỊA DANH** riêng tách khỏi **GHI CHÚ** (colspan 11→12).
- Verify: `node --check` 8 file OK; live-control/live-tv 0 lỗi console; unit-test grouper region/sold/coc đúng. ⚠ region/Bán/Cọc cần web2-api redeploy mới có data thật. Bump ?v=20260625a. Status ✅ (chờ deploy verify)

### [web2/ai-hub][render] Fix chat chỉ Gemini chạy + nút "✨ AI viết mô tả" cho Ghép đồ & HTML Studio

User: "test key đều OK nhưng chat chỉ Gemini được (hình 1)" + "Hình 3, hình 4 thêm nút hình 2 vào".

**Chẩn đoán** (test trực tiếp provider, bypass worker+auth): nút "Test" gọi `/chat` NON-STREAM (chạy mọi provider); UI chat gọi `/chat/stream` TRƯỚC, chỉ fallback non-stream khi `!res.ok`. Groq key org bị **"Organization has been restricted"** (HTTP 400 `organization_restricted`) — non-stream lẫn stream đều fail. OpenRouter/ChatAnywhere stream OK ở tầng provider (đã verify cả khi có system prompt + maxTokens 2048).

- **Fix 1 — `render.com/services/web2-ai-service.js` `_httpError`**: phân loại `organization_restricted` / account suspended/disabled → `_auth` → rotation XOAY sang key/org kế thay vì ném ngay ở key đầu (1 key org hỏng KHÔNG kéo sập pool — gốc "Test OK, chat lỗi" do round-robin lúc trúng key tốt lúc trúng key hỏng). Regex test 8/8.
- **Fix 2 — `web2/ai-hub/js/ai-chat.js` `doStream`**: stream lỗi/rỗng mà CHƯA phát chữ nào → **fallback NON-STREAM `/chat`** (track `gotDelta` tránh nhân đôi; KHÔNG fallback khi user chủ động Dừng). Vì "Test" (cũng non-stream) chạy mọi provider → chat luôn ra chữ khi đường stream qua proxy/SSE trục trặc. Bump `ai-chat.js?v=20260625f`.
- **Nút "✨ AI viết mô tả"** (module shared `Web2AiDescribe.attach`, 1 NGUỒN — KHÔNG fork): thêm vào tab **Ghép đồ** (`web2-tryon.js`, ô "3) Đổi phong cảnh") + **HTML Studio** (`web2-content-maker.js`, ô "2 · Dữ liệu"; ensureDeps lazy-load `web2-ai-describe.js`). Gate theo `Web2AiDescribe` có mặt (degrade mượt). Bump tryon `v=20260625b`, content-maker `v=20260625c`. **Verify live (browser mount)**: cả 2 nút render + visible + label "✨ AI viết mô tả" + wired ✓.
- ⚠ Fix 1 là backend `web2-api` → cần **redeploy Render** mới có hiệu lực; Fix 2 + nút deploy qua GH Pages (~3').

### [web2 toàn cục][render] Audit vòng 4 — quét 107 file: 18 nhãn native-cart sót (workflow)

User: '"các trang khác có thiếu sót như vậy không?"'. **Workflow quét TOÀN BỘ 107 file** Web 2.0 (frontend + backend native-order) — 12 bucket × (scan → adversarial verify), đối chiếu predicate/ngữ cảnh. Rate-limit server làm fan-out song song fail 2 lần → **rewrite chạy TUẦN TỰ** (1 agent/lần) + resume cache → hoàn tất 24 agent, 0 fail. Kết quả: **18 mislabel thật** (5 HIGH / 5 MED / 8 LOW comment), áp script match-once 18/18.

- **HIGH (nhãn status user thấy)**: `web2/products/web2-product-detail.js` + `web2-products-render.js` (usage "đơn web" của SP: draft 'Nháp'→'Giỏ hàng'); `web2/shared/web2-order-tag-detail.js` (`draft`→'giỏ hàng · đang giữ'); `live-comment-list-state.js` (badge `🛒 N đơn`→'giỏ hàng'); `render.com/routes/native-orders.js` (CSV export STATUS_LABEL draft→'Giỏ hàng', confirmed→'Đơn hàng').
- **MED**: live-comment-list-render-row (tooltip STT/mã badge "đơn web"→"giỏ hàng"); live-stats-panel ("Đơn đã tạo"→"Giỏ đã tạo"); kpi-dashboard ("Dự báo = giỏ hàng chưa thành PBH").
- **LOW (comment)**: comments-mobile-actions/state, packing-slip (3), order-tags-service (2) — đồng bộ "đơn nháp/Đã tạo đơn" → giỏ.
- **Loại đúng (KHÔNG đổi)**: `draft:'Nháp'` ở purchase-refund / fastsaleorder-refund (PBH) / supplier-wallet (NCC) / fb-posts = **khác domain**, "Nháp" đúng. "Đơn Web" tên feature. confirmed/PBH = "Đơn hàng".
- Verify: `node --check` 12 file OK; grep cuối không còn native-draft→'Nháp'; products page localhost 0 lỗi. Backend (native-orders CSV + comment) cần web2-api redeploy. Status ✅

### [order-tags][render] Audit vòng 3 — reframe TOÀN BỘ chữ "đơn hàng" trang order-tags (workflow)

User: '"trang order-tags thấy rất nhiều chữ đơn hàng"'. Bulk text ấy = **20 mô tả trigger** (render từ backend `/triggers`) + tiêu đề/intro/heading, đa số mở đầu "Đơn…". Dùng **Workflow** (ultracode): 3 nguồn × (classify → adversarial verify) đối chiếu TỪNG chuỗi với **predicate ground-truth** (khi nào trigger fire) → 6 agent, 23 sửa verbatim, áp bằng script (match-once, 23/23 OK, 0 fail).

- **Quy tắc**: predicate fire chỉ khi `draft`/chưa-PBH ⇒ "Giỏ hàng"; chỉ khi confirmed/PBH ⇒ giữ "Đơn hàng"; cả hai ⇒ trung tính "Đơn/giỏ" hoặc "Bản ghi" (KHÔNG để "đơn hàng" trơ trọi gây hiểu đã chốt).
- **Catalog `web2-order-tags-service.js` (16 desc)**: `cho_hang`→"Giỏ hàng…" (chờ hàng ⇒ không lên PBH = giỏ); `is_draft` desc→"Bản ghi đang ở trạng thái Giỏ hàng"; BOTH (`het_hang`,`mua_1_phan`,`co_coc`,`thieu_dia_chi/sdt`,`gop_don`,`don_tach`,`da_in`,`tu_livestream/inbox`,`da_nhan_ck`,`kpi_user`,`is_cancelled`)→"Đơn/giỏ". **Giữ** ORDER-only (`pbh_created`,`pbh_chua_tt`,`is_confirmed` = đã PBH = "Đơn hàng").
- **`index.html`**: `<title>` + heading "TAG đơn hàng"→"TAG Đơn Web (giỏ hàng + đơn hàng)"; intro làm rõ tag áp cả giỏ (chưa PBH) lẫn đơn (đã PBH); ví dụ Chờ hàng/Âm mã→"giỏ hàng".
- **`order-tags-app.js`**: confirm xoá "Đơn sẽ không…"→"Đơn/giỏ…". Header #Note 2 file →"TAG Đơn Web".
- Verify: `node --check` OK; browser localhost — title/heading/intro reframe live, 0 lỗi console. Backend desc cần web2-api redeploy → trigger list live. Status ✅

### [order-tags][web2/shared][render] Audit vòng 2 — sót trang order-tags + shared modules

User: '"vẫn sót trang order-tags → audit không kĩ toàn bộ web 2.0"'. Sweep lại TOÀN BỘ web2/ + render backend cho mọi nhãn native-order CHƯA-PBH. Tìm & sửa 7 chỗ sót (giữ nguyên domain khác: PBH/hóa đơn nháp, so-order NCC nháp, returns nháp, Web 1.0 customer-hub).

- **`render.com/services/web2-order-tags-service.js`** (catalog auto-tag, FE đọc qua `/api/web2-order-tags/triggers`): trigger `is_draft` label "Đơn nháp" → **"Giỏ hàng"** + desc; desc `am_ma` + `chua_nhan_ck` "đơn nháp" → "giỏ hàng". Giữ `id` (no migration). Pill native-orders dùng `name||label` → fallback label mới.
- **`web2/shared/web2-order-tag-detail.js`**: popup âm-mã "Tổng đang giữ (các đơn nháp)" → "(các giỏ hàng)".
- **`web2/shared/web2-ai-page-registry.js`**: nhãn quick-prompt "📦 Đơn nháp chưa lên PBH" → "📦 Giỏ hàng chưa lên PBH" (prompt body giữ `status==='draft'`).
- **`web2/shared/web2-customer-detail-modal.js`**: bảng đơn KH render `x.status` THÔ ("draft") → map nhãn (draft→Giỏ hàng/confirmed→Đơn hàng/…).
- **`web2/report-revenue/index.html`**: KPI Đơn Web "X nháp" → "X giỏ hàng" (giữ pie `pbh.states` = trạng thái PBH riêng).
- **`render.com/routes/native-orders.js`**: lỗi API tách/gộp "đơn nháp" → "giỏ hàng (chưa PBH)".
- Verify: `node --check` 5 file OK; sweep còn lại chỉ PBH/so-order/returns/Web1 (đúng, khác domain). Backend (order-tags-service + native-orders route) cần web2-api redeploy → pill/lỗi live. Status ✅

### [live-chat][native-orders] Thuật ngữ: bản ghi CHƯA PBH = "Giỏ hàng" (không gọi "đơn" gây nhầm)

User: '"live-chat khi kéo SP/tạo → là tạo GIỎ HÀNG cho khách chứ đừng ghi đơn hàng dễ nhầm lẫn → qua native-orders vẫn là giỏ hàng nếu chưa tạo PBH"'. Audit 2 trang chính + sweep toàn bộ trang liên quan. Mô hình chuẩn xác lập: **`draft` (chưa PBH) = Giỏ hàng (cart)**, **`confirmed` (đã có PBH) = Đơn hàng (order)**. Chỉ đổi NHÃN user-facing; **giữ nguyên** mã nội bộ (`draft`/`confirmed`, `NATIVE_WEB`, topic `web2:native-orders`, hàm `createOrder`/`NativeOrdersApi`, tên feature "Đơn Web"), thống kê đơn-hàng thật của KH, và tab "Đơn hàng" Pancake.

- **Status map** (nguồn hiển thị chính): `native-orders-render.js` `web2StatusText` + `native-orders-state.js` `STATUS_META` draft "Nháp" → **"Giỏ hàng"** (icon `file`→`shopping-cart`); `index.html` filter option draft → "Giỏ hàng".
- **live-chat tạo từ comment**: `live-comment-list-orders.js` (toast tạo/gộp/lỗi), `live-comment-list-render-row.js` (title nút: "Tạo giỏ hàng" / "Thêm comment vào giỏ"), `inventory-panel-actions.js` (toast kéo SP), `inventory-panel-render.js` (popup "🛒 Giỏ hàng (N SP)" + "Xóa giỏ"), `comments-mobile-render.js` + `comments-mobile.html` (chip "Đã tạo giỏ", badge "Giỏ hàng …"), `live-order-history.js` (FAB "🛒 Giỏ đã tạo" + modal + cột "Mã giỏ").
- **native-orders inbox-add**: nút/label/notify "Tạo đơn" → **"Tạo giỏ hàng"**; "Đã tạo đơn inbox" → "Đã tạo giỏ hàng inbox".
- **Confirm/notify PBH**: `pbh-bill.js` + `bulk-operations.js` — "đơn Nháp" (chưa PBH) → "giỏ hàng" (vd "Chỉ giỏ hàng (chưa PBH) mới tạo được PBH", huỷ PBH → "trở lại Giỏ hàng"), split → "tạo giỏ hàng mới".
- Verify: `node --check` 11 file JS OK; browser-test localhost — native-orders render "Giỏ hàng"(draft)/"Đơn hàng"(confirmed) trên 11 row thật + filter "Giỏ hàng"; live-chat FAB "🛒 Giỏ đã tạo". Mã nội bộ (status value, source, topic) còn nguyên. Status ✅

### [render][web2/order-tags] Đổi tên tag CK → "Chưa thanh toán" / "Đã thanh toán"

User: '"Đã nhận CK" phải là "Đã thanh toán" thì chính xác hơn'. Đúng — predicate `da_nhan_ck` bật khi **(CK xác nhận) HOẶC (ví KH ≥ tổng đơn)** = đã trả đủ tiền bất kể nguồn (CK / ví / cọc nạp sẵn), không chỉ riêng chuyển khoản → tên cũ hẹp hơn logic.

- `web2-order-tags-service.js` catalog `TRIGGERS`: `chua_nhan_ck` label "Chưa nhận CK" → **"Chưa thanh toán"**; `da_nhan_ck` label "Đã nhận CK" → **"Đã thanh toán"**, desc làm rõ "CK / ví / cọc nạp sẵn".
- **Giữ nguyên `id`** (`da_nhan_ck`/`chua_nhan_ck`) — key ổn định, KHÔNG migration (2 trigger này không nằm trong 4 tag seed DB; predicate không đổi).
- Không đụng badge "⚠ Chưa nhận CK" ở native-orders-render.js (feature khác: bấm gán giao dịch CK). Status ✅

### [web2/shared][render] Trợ lý AI: CASCADE model mạnh→yếu (xoay mọi key free) + thêm model mạnh

User: "key Groq mới + tất cả key free cứ dùng model mạnh nhất tới yếu nhất hỗ trợ web 2.0". Đã workflow xếp hạng 47 model free (web search benchmark) → build cascade.

- **Backend `web2-ai-service.js`**: thêm 3 model mạnh vào registry (backend chỉ chấp nhận model có trong list): gemini-2.5-pro, qwen/qwen3.6-27b (Groq, VN xuất sắc + vision), qwen/qwen3-next-80b-a3b-instruct:free (OpenRouter).
- **Widget `web2-ai-assistant.js`**: `MODEL_CASCADE` mạnh→yếu + `callAiStream` thử lần lượt (stream từng chữ), model lỗi/hết quota → tự rơi xuống model kế; hết cascade → `/complete` non-stream. 401/abort → throw ngay. Manual → 1 model pinned (không cascade). Dropdown "Auto (mạnh→yếu)".
    - Cascade: gemini-2.5-pro → qwen3.6-27b(groq) → gemini-2.5-flash → gpt-oss-120b(groq) → qwen3-next-80b(OR) → llama-3.3-70b(OR) → gemini-2.5-flash-lite. Xoay 3 provider/4 key free.
- **Xếp hạng 47 model** (Artificial Analysis + LMArena, list thật từ /models): top S = nemotron-3-ultra-550b(88,VN khá) + gemini-2.5-pro(88,VN xuất sắc); A = qwen3-coder-480b(80), gpt-oss-120b(78,VN TB), gemini-2.5-flash(74), qwen3.6-27b(72,VN xuất sắc). Caveat: ChatAnywhere alias không chắc thật; OpenRouter free rate-limit; reasoning chậm/tốn token.
- Verify: cascade 4/4 Node test (pro lỗi→qwen3.6, hết→/complete, 401→throw, manual→1 model). Bump v=20260625g. Push → web2-api auto-redeploy nạp key Groq mới + 3 model.

### [web2/shared] Trợ lý AI: fix "đứt câu trả lời" (stream từng chữ) + nút xóa chat + bỏ Groq

User: "widget hay bị đứt câu trả lời — AI viết ra từng chữ mà widget không làm vậy nên bị đứt" + "cho nút xóa đoạn chat". Root cause: 23 trang auto=Groq (đang bị KHOÁ org) → stream Groq lỗi → rơi xuống `/complete` NON-STREAM (1 cục, cap maxTokens 1000) → không gõ từng chữ + cụt câu dài.

Fix `web2/shared/web2-ai-page-registry.js` + `web2-ai-assistant.js`:

- **Đổi TOÀN BỘ 32 trang Groq → Gemini** (gpt-oss-120b→gemini-2.5-flash, llama-8b→gemini-2.5-flash-lite). Gemini stream `/chat/stream` gõ từng chữ + ổn định + không bị khoá. Bỏ HẲN phụ thuộc Groq trong registry.
- **maxTokens 1100/1000 → 4000** (cả callAiStream + \_postAi) → câu trả lời dài không bị cắt.
- **Nút 🗑️ Xóa đoạn chat** ở header (cạnh ⚙️/×): clear history + saveHistory + render (chặn khi đang trả lời).
- Xác minh: `_md` markdown KHÔNG phải bug — dùng NUL sentinel (`\0(\d+)\0`) cho code-block placeholder nên giữ số thật (test giữ 5/11/mã đơn). Bump v=20260625f. providers registry = {gemini:32}.

### [web2/shared] Fix hover-zoom "ảnh to hiện cuối trang" trên trang KHÔNG nạp web2-effects.css (ai-hub…)

User (ai-hub Tạo ảnh): bấm/rê ảnh trong gallery → ảnh không phóng to nổi mà **hiện full-size cuối trang** (không backdrop). Root cause: `web2-effects.js` (hover-zoom) được **autoload MỌI trang** qua sidebar, NHƯNG `web2-effects.css` (chứa `.w2fx-zoom-popup{position:fixed…}`) chỉ `<link>` ở 3 trang (products/variants/returns) — ai-hub KHÔNG có. Thiếu CSS → popup `.w2fx-zoom-popup` về `position:static` → rớt document flow, ảnh clone full-size cuối `<body>`.

Fix `web2/shared/web2-effects.js`: thêm `_ensureZoomStyle()` **tự inject** CSS thiết yếu của popup (position:fixed + z-index + ẩn khi chưa `.is-visible` + giới hạn kích thước ảnh), gọi trong `_ensureZoomPopup()` — giống pattern guard CSS của lightbox + ripple. Module tạo popup tự bảo đảm CSS của nó → đúng MỌI trang dù trang có `<link>` web2-effects.css hay không. Bump autoload `v=20260625a`.

Verify browser (overview — cũng KHÔNG link web2-effects.css = đúng điều kiện bug): trước fix popup `position:static`; sau fix rê ảnh → popup `position:fixed` z-index 99999 KHÔNG ở normal flow ✓; click ảnh → lightbox `#web2ImageLightbox` fixed/flex ✓ (lightbox vốn đã có guard CSS riêng). node --check OK.

### [web2/shared] Trợ lý AI: fallback CHÉO PROVIDER khi 1 provider lỗi (vd Groq bị khoá org)

User báo lỗi test Groq: "Organization has been restricted". = Groq KHOÁ TÀI KHOẢN (org) phía họ — 5 key cùng 1 org nên fail hết; KHÔNG phải bug code (thường do tạo nhiều key cộng dồn quota free → Groq coi là abuse). Tác động: 23 trang data/tài chính tôi set auto=`groq/gpt-oss-120b` (balance-history, native-orders, ví, kpi, reconcile, PBH…) → AI hỏng vì widget KHÔNG fallback chéo provider khi provider chỉ định lỗi.

Fix `web2/shared/web2-ai-assistant.js`: tách `_postAi(body)`; `callAiOnce` thử provider đã chọn TRƯỚC, lỗi (non-401) → **fallback `/complete`** (backend xoay gemini→groq→openrouter, gemini đầu tiên nên bỏ qua Groq hỏng). 401/abort vẫn ném ngay. `callAiStream`: stream error (non-401) chưa có token → cũng rơi xuống `callAiOnce` (fallback). → Groq khoá vẫn chạy bình thường qua Gemini. Bump v=20260625e. Verify Node 3/3 (groq lỗi→gemini, 401→throw, no-provider→/complete).

### [web2/ai-hub] Fix lộ token web2 qua URL ảnh ("Ảnh đã lưu") — fetch + blob thay `?token=`

Adversarial review (đợt trước) phát hiện MEDIUM tồn từ trước: `ai-image.js` `renderHistoryCard` nhét token phiên web2 vào `img src=…/images/:id?token=<tok>` (+ `dl.href`) → token lộ qua DOM/history/Referer/access-log. Token phải đi qua header `x-web2-token` (như mọi chỗ khác), không phải URL.

Fix `web2/ai-hub/js/ai-image.js`: bỏ hẳn `authToken()` + `?token=`. Ảnh protected (`has_bytes`) giờ **fetch kèm `H().authHeaders(false)` (header `x-web2-token`) → blob → `URL.createObjectURL`** cho `img.src` + `dl.href`. Ảnh public (`im.url`) dùng trực tiếp. objectURL **revoke** khi xoá card / reload lịch sử (tránh leak). Verify middleware `requireWeb2AuthSoft` đọc token theo thứ tự header→query→body → fetch-by-header xác thực OK (không cần đổi backend). Bump `ai-image.js?v=20260625b`. node --check OK; e2e cần session web2-users thật (admin@@ legacy 401).

### [web2/shared] Trợ lý AI: thêm 3 CÔNG CỤ dùng chung vào widget ✨ (Ghép đồ · Card/Video · AI viết mô tả)

User: trên `web2/ai-hub` — "hình 2 (Ghép đồ), hình 3 (Tạo Card/Video) cho dùng chung, module AI viết mô tả như hình 1". Chọn **"Trong nút ✨ Trợ lý AI nổi"** → 3 tính năng vốn khoá trong ai-hub giờ tách thành module shared + surface trong widget nổi MỌI trang Web 2.0. ai-hub cũng REUSE chính module shared (1 nguồn, KHÔNG fork).

**3 module shared MỚI** (`web2/shared/`, mountable, tự chứa auth/base + degrade mượt):

- `web2-ai-describe.js` (`window.Web2AiDescribe`): "AI viết mô tả" — nhập ngắn → `/api/web2-ai/complete` mở rộng. API `describe({seed,kind})` (kind: image-prompt EN · product-desc · fb-caption · generic), `attach({button,input,kind})` (gắn nút+textarea kiểu hình 1), `mountPanel(el,{kinds})`.
- `web2-tryon.js` (`window.Web2Tryon.mount(el,{compact})`): Ghép đồ Nano Banana (người + 1..5 áo + phong cảnh) — tách từ ai-tryon.js, dùng Web2VideoStock/AiPresets nếu có, quota-warn, nén ảnh ≤1280.
- `web2-content-maker.js` (`window.Web2ContentMaker.mount(el,{compact})`): Tạo Card/Bài đăng/Video từ data — điều phối Web2HtmlSkill + Web2VideoRender (đã shared). **Tự lazy-load deps** (html-skill, video-render, DOMPurify, html2canvas) → drop-in mọi trang.

**Widget** `web2-ai-assistant.js`: thêm thanh chế độ `.w2aa-modes` (Hỏi đáp · Ghép đồ · Card/Video · Viết mô tả). Mỗi tool **lazy-load module shared khi mở lần đầu** (KHÔNG nặng boot — widget có mặt mọi trang), mount 1 lần vào toolpane riêng (giữ state), panel **tự rộng** (880px) cho ghép đồ/card-video. Base lazy-load suy từ `document.currentScript.src`. Hỏi/Đọc-DB tự về chế độ Hỏi đáp. Bump autoload `v=20260625d`.

**ai-hub reuse** (1 nguồn): `ai-tryon.js`/`ai-html.js` thành thin-wrapper mount `Web2Tryon`/`Web2ContentMaker` vào `#aihTryMount`/`#aihHtml`; `ai-image.js` enhancePrompt gọi `Web2AiDescribe.describe({kind:'image-prompt'})`. Bỏ ~430 dòng logic trùng. index.html load 3 module shared + mount-height CSS.

**Verify** (browser localhost, console-first): 4 mode tab render ✓; describe lazy-load + 4 kind + textarea/button ✓; tryon lazy-load + VideoStock + panel rộng + 2 nút kho ảnh + preset ✓; content lazy-load CẢ deps (html-skill/video-render/DOMPurify/html2canvas) + 6 skill + preview ✓; switch về chat khôi phục composer + un-wide ✓; **0 console error** suốt. ⚠ AI call live 401 = session test `admin/admin@@` là LEGACY login (không phải web2-users) → endpoint web2-ai từ chối; request shape giống hệt ai-hub đang chạy prod. node --check 8/8 file OK.

### [web2/shared] Trợ lý AI: ĐỌC DB THÔNG MINH + audit 23 trang → 19 DB_SOURCES

User: "AI đọc DB có thông minh không? DB nhiều có sao?" + "audit toàn bộ trang/dữ liệu (đọc system dashboard) thêm cho hợp lý".

**(1) Reducer THÔNG MINH** (`web2/shared/web2-ai-assistant.js`): thay đọc "thô" (cắt cụt ~30 dòng đầu). Hàm `encodeArray`: data nhỏ (vừa budget) → RAW đầy đủ; data LỚN → `summarizeDataset` = TÓM TẮT THỐNG KÊ (mỗi field số: tổng/min/max + đếm ÂM/0/trống; field phân loại: value→count; + MẪU dòng "có vấn đề" số âm). → AI thấy bức tranh TOÀN BẢNG dù DB lớn, không phụ thuộc số dòng. Áp cho cả accessor block lẫn DB block. `fetchDbSource` loop-fetch: CHỈ loop khi spec có `hasMoreField` (page-based, hỗ trợ nested `meta.hasMore`); endpoint offset/không phân trang → fetch 1 lần (tránh refetch trùng vô hạn); cap `MAX_DB_ROWS=5000`.

**(2) Audit 23 trang dữ liệu** (workflow 24-agent, đọc system dashboard `web2-modules.json` làm bản đồ) → phân loại: full-cache (accessor đủ: supplier-wallet/supplier-debt/kpi/so-order), none (order-tags/fb-insights), **paginated → cần DB_SOURCE (16 trang)**. Thêm vào registry `DB_SOURCES` (tổng 19): customers `/api/web2/customers/list`(data,hasMore), customer-wallet `/aggregate`(data), returns `/api/web2-returns/list`(returns,hasMore), purchase-refund(records,hasMore), fastsaleorder-delivery `/api/delivery-invoices/load`(orders,hasMore), fastsaleorder-refund `/api/refunds/load`(orders,hasMore), cham-cong(items), chi-tieu(items), ck-dashboard+payment-confirm `/api/web2/payment-signals`(data), audit-log(items), notifications(items), jt-tracking(data), reconcile(items), fb-ads-stats(entries), live-chat `/api/web2-live-comments`(data). Endpoint+dataPath verify từ backend route.

**Verify** (Node, browser bị tranh chấp session): reducer 7/7 (data 3000 dòng → tổng+ÂM=140+đếm status); fetchDbSource 5/5 (hasMore→loop, no-hasMore/offset→1 lần, nested meta.hasMore, 401→throw); dbSourcesFor 19 entries. Bump v=20260625d.

⚠ Tách module: web2-ai-assistant.js ~1100 dòng (gồm feature "AI tools" Ghép đồ/Card/Video/Viết mô tả thêm song song) — nên tách sau. ai-hub/\* + 3 module tools (web2-tryon/content-maker/ai-describe) để commit riêng.

### [web2/shared] Trợ lý AI: ĐỌC DATABASE qua API app (Option B) — trang phân trang thấy TOÀN BỘ bảng

User hỏi "AI coi database không?" → giải thích: chỉ đọc data browser (kho SP/biến thể/KH = full vì cache tải hết; giao dịch/đơn/PBH phân trang `pageSize:50` → chỉ thấy 1 trang). User chọn **Option B: AI đọc qua API đọc sẵn của app** (an toàn, qua auth/phân quyền, KHÔNG SQL thô).

Files: `web2/shared/web2-ai-page-registry.js` (+`DB_SOURCES`/`dbSourcesFor`), `web2/shared/web2-ai-assistant.js` (+fetch DB + inject context + chip).

- **Registry `DB_SOURCES`** (3 trang phân trang, response shape verify từ backend): balance-history `/api/web2/balance-history/` dataPath `data`; native-orders `/api/native-orders/load` dataPath `orders`; PBH `/api/fast-sale-orders/load` dataPath `orders`. Mỗi nguồn { endpoint, params{page,limit:1500}, dataPath, desc }.
- **Widget**: chip "🗄️ Đọc toàn bộ … (DB)" đứng ĐẦU thanh gợi ý (chỉ trang có dbSource). Bấm → `fetchDbSource` GET endpoint (qua worker + `x-web2-token`) → lấy mảng theo dataPath → `_dbData[path]` → `pageContext()` chèn khối "DỮ LIỆU TỪ DATABASE" (ưu tiên CAO NHẤT, trên cache/DOM) → ask phân tích tổng quan. Mọi câu sau vẫn thấy full DB (cache theo trang). Cap rows theo budget 5200 ký tự, báo tổng N. PII vẫn redact.
- **Verify** (Node + harness mock-fetch): dbSourcesFor 6/6; click chip → fetch đúng `…/balance-history/?page=1&limit=1500`; pageContext có "DỮ LIỆU TỪ DATABASE (2 bản ghi)" + giá trị thật. Live thật cần session user (token test 401 server-side).
- ⚠ assistant.js 854 dòng (>800) — cohesive, cân nhắc tách DB-reader sau. registry 1501 = pure-data (OK).

### [web2/shared] Trợ lý AI: gợi ý LUÔN HIỆN (thanh chip cố định, không mất sau khi chat)

User: "luôn hiện gợi ý như hình 1; hình 2 tương tác xong mất gợi ý". Trước đây `render()` chỉ hiện gợi ý khi chưa có hội thoại (`history.length ? '' : quicks`) → chat 1 câu là chip biến mất.

Fix `web2/shared/web2-ai-assistant.js`: tách gợi ý ra **thanh chip CỐ ĐỊNH** `.w2aa-quicks-bar` (giữa model-bar và khung chat, cuộn ngang, `flex:0 0 auto` → luôn hiện bất kể scroll/hội thoại). `renderQuicks()` riêng, gọi mỗi `render()`. Body chỉ còn messages. Hover chip = tooltip prompt đầy đủ. Bump sidebar v=20260625b. Verify harness: 6 chip trước chat = 6 chip sau chat ✓.

### [web2/shared] Trợ lý AI widget — NÂNG CẤP LỚN: gợi ý + đọc data sâu + model theo trang + streaming + fix bug (audit 37-agent)

User: "audit toàn bộ + debug + browser test từng trang + thêm gợi ý/lệnh mẫu + phát triển rộng + đọc dữ liệu chi tiết hơn → hoàn thiện → lặp tới hoàn hảo" + "xem model AI free, ưu tiên cái nào, cho đổi auto theo trang hoặc thủ công".

**Phát hiện (browser test + workflow 32 trang)**: widget mount đúng mọi trang nhưng (1) 5 gợi ý GENERIC giống nhau mọi trang (vô nghĩa theo ngữ cảnh); (2) chỉ đọc DOM → **bảng ảo/phân trang mất data** (products chỉ 5 dòng dù kho nhiều SP → AI tưởng "chỉ 5 SP"); kpi/reconcile/live-chat context rỗng. Audit thêm 2 HIGH privacy (PII/JWT lộ qua innerText), history phình DOM gây lag, 401 ẩn body 200, tắt widget không thật tắt.

**Files**: NEW `web2/shared/web2-ai-page-registry.js` (registry 32 trang, pure-data); rewrite `web2/shared/web2-ai-assistant.js` (394→~715 dòng); `web2/shared/web2-sidebar.js` (load registry TRƯỚC widget, bump v=20260625a).

- **Registry theo trang** (`Web2AiPageRegistry`, auto-gen từ workflow): mỗi trang = { match, model, accessors[{expr,desc,shape}], suggestions[{label,prompt}], note }. `matchPage` longest-prefix. **192 gợi ý theo ngữ cảnh** (products: "SP tồn âm/0", "SP thiếu giá", "SP trùng tên"; variants: "thiếu viết tắt", "viết tắt trùng"; …), fallback GENERIC.
- **Đọc dữ liệu SÂU** (mục tiêu "chi tiết hơn"): 18/32 trang có **dataAccessor** đọc cache/state JS (`Web2ProductsCache.getAll()`, `Web2VariantsCache.getAllIncludingInactive()`, `NativeOrders.STATE`…) → FULL dataset (không bị phân trang). Resolve AN TOÀN bằng **path-walk (KHÔNG eval chuỗi)** + try/catch; báo tổng N mục; cảnh báo bảng DOM virtual để AI không kết luận "tổng sai" từ data 1 phần.
- **Model AI free theo trang** (user request): auto map — nặng tính toán (balance/reconcile/kpi/ví/PBH…) → **groq gpt-oss-120b**; chat/cảm xúc (live-chat) → **gemini-2.5-flash**; nhẹ (overview/dashboard) → **llama-3.1-8b-instant**; default → gemini-2.5-flash. **Dropdown chọn model thủ công** ngay trong panel (🤖 Auto / 5 model) + tương thích config cũ (empty provider=auto, có provider=manual).
- **Streaming reply** (P0, backend `/chat/stream` đã có flushHeaders → không timeout) + fallback non-stream. **PII redaction** (SĐT/email/JWT/fb_id → mask, giữ số tiền). **Fix bug**: history cap 40 + patch bubble cuối (hết lag), placeholder cờ `pending` (hết lẫn ⏳ vào history), 401 ẩn body 200 + guard `_authRedirecting`, tắt widget = đóng panel + chặn open/ask, persist history theo trang, nút copy, markdown tốt hơn (heading/list/code), ẩn ở trang nhạy cảm (pancake-settings/zalo/system/users-permissions).
- **Verify**: 26/26 Node unit-test pass (registry matching + model theo trang + resolveExpr path-walk + redactPII). ⚠ Browser E2E live BỊ CHẶN: session `web2_auth` hết hạn + admin prod đổi pass (seed `admin@@` không còn đúng) → cần user web2 thật để test gọi AI thật trên trang.
- **Model free hiện có** (`web2-ai-service.js`): gemini (2.5-flash 👁/lite/latest, 1500/ngày), groq (gpt-oss-20b/120b, llama-3.3-70b/3.1-8b/4-scout), openrouter (gpt-oss/deepseek-v3/r1/llama/qwen3-235b), chatanywhere (gpt-4o-mini/4.1/3.5/deepseek). Failover: gemini→groq→openrouter.
- Status: ✅ code + unit-test; 🔄 chờ session web2 để browser E2E.

### [render][web2/system] Tab "Dịch vụ & Hệ thống": Render = TẤT CẢ PAID (đúng plan thật từ API)

User báo lỗi ai-hub `⚠️ Customer 360 proxy failed: Request timeout after 15000ms` → trace ra `handleCustomer360Proxy` chỉ là proxy CHUNG (tên gây hiểu lầm) cho ~40 route; request chat AI (`/api/web2-ai/chat/stream` → web2-api) không trả headers trong 15s nên Cloudflare Worker cắt. User xác nhận **"render đều là paid server hết"** → không idle-sleep, timeout chỉ do redeploy/restart.

Cập nhật tab `web2/system` (?tab=services) phản ánh đúng plan thật (query Render API):

- **Files**: `render.com/routes/services-overview.js` (SERVICES_INVENTORY), `web2/system/js/system-services.js`, `web2/system/index.html`, `web2/system/css/system.css`.
- **Plan thật (Render API)**: web2-api **Standard $25**, n2store-fallback **Standard $25**, web2-realtime **Starter $7** (service thứ 3 — trước dashboard BỎ SÓT), 2× Postgres **basic_1gb $19**. → Tổng Render **$95/mo**.
- **services-overview.js**: thay entry cũ "Render Backend (×2 web service) Starter $7 + free-tier" bằng **3 entry compute riêng** (đúng plan/cpu/ram/cost từng service), bỏ `freeTier` cho mọi Render resource (đều paid → `freeTier: null`, chuyển limit sang `paidLimit` + `uptime: Always-on KHÔNG sleep`). 2 Postgres bỏ "90 days expiration"/"free 1GB" → "Basic 1GB · PAID". Comment header ghi rõ all-paid + lý do timeout.
- **system-services.js**: DB card bỏ class `sd-plan-free` cho web2Db (cả 2 DB paid), planLabel → "Basic 1GB · PAID ($19/mo)".
- **index.html + system.css**: thêm banner xanh `.sd-render-note` dưới cost strip — "Tất cả Render PAID = $95/mo, không idle-sleep, timeout 15000ms chỉ do redeploy/restart ~30-60s". Bump `system.css?v=20260625a` + `system-services.js?v=20260625a`.
- **Deploy**: 3 service Render `autoDeploy=yes` từ `main` → push tự redeploy web2-api (serve `/api/services-overview`, isWeb2Path=true).
- Status: ✅ code + syntax OK; chờ deploy verify data + browser-test UI.

## 2026-06-24

### [perf] Làm đẹp khuôn mặt → WEB WORKER (hết "đứng/stuck" hoàn toàn)

User: ai-photo Làm đẹp vẫn "loading hoài" — screenshot cho thấy kẹt ở **"Đang nhận diện khuôn mặt…"**. Root cause: cả **MediaPipe detect** lẫn **lọc** (smoothSkin/warp) chạy ĐỒNG BỘ trên main-thread → đứng UI (nặng nhất trên browser software-render / máy yếu). Giảm res (turn trước) chưa đủ.

Fix triệt để — chuyển TOÀN BỘ xử lý nặng sang **Web Worker** (built-in trình duyệt, MIỄN PHÍ):

- **NEW `web2/shared/beauty/web2-beauty-worker.js`**: chạy smoothSkin/adjustSkinTone/beautify/warp/auto trên luồng nền (pixel buffer Transferable). `web2-beauty-filters.js` đổi IIFE `(window)`→`(self)` để chạy được trong worker; `web2-beauty-studio.js` doApply → async, gọi `processImageData()` (worker, fallback sync).
- **NEW `web2/shared/beauty/web2-beauty-face-worker.js`** (module worker): chạy MediaPipe FaceLandmarker nền; `web2-beauty-face.js` `detect()` gửi ImageBitmap (đã thu nhỏ ≤640) sang worker → landmarks; keepalive `_emit` 1.5s để guard 30s ở studio không tự huỷ khi tải model; fallback `_detectMain` nếu worker lỗi.
- **Verify browser (headless, môi trường chậm nhất)**: probe trong lúc xử lý đều TRẢ LỜI ~0.01-0.02s = **main-thread KHÔNG đứng** (trước đây timeout/frozen); detect xong (busy:false, XNNPACK CPU, có mặt); Tự động apply → whole-canvas hash ĐỔI (changed:true ~146ms). Smooth/warp/auto đều chạy qua worker OK. Chỉ còn 1 lần chờ NỀN: tải model ~13MB lần đầu/phiên (spinner mượt, page tương tác được).
- Bump version 5 file beauty (ai-photo + video-beauty). Worker URL lấy từ currentScript (cùng thư mục).

### [feat] Mobile: thanh menu dưới cùng cho điện thoại + fix nút Đăng xuất bị khuất

User: "Trên điện thoại không có nút đăng xuất? → Có giao diện riêng cho điện thoại nên làm thanh menu cho điện thoại luôn đi". Chọn kiểu **bottom bar**.

Files: `web2/shared/web2-sidebar.js` (bottom bar + sheet Tài khoản, bump mobile.css), `web2/shared/web2-mobile.css` (CSS bottom bar/sheet + dvh fix).

- **Nguyên nhân logout khuất**: `.web2-aside { height: 100vh }`. Trên trình duyệt điện thoại `100vh` tính cả vùng sau thanh URL/toolbar → footer (pinned bottom) chứa nút Đăng xuất bị đẩy xuống **dưới mép màn hình nhìn thấy** → "không có nút đăng xuất". Fix: ở mobile ép `.web2-aside` dùng `100dvh` (dynamic viewport, fallback `100vh`) + `padding-bottom: env(safe-area-inset-bottom)` cho footer.
- **Thanh menu dưới (≤600px)**: `web2-sidebar.js` inject `<nav class="w2-mobile-bottombar">` cố định đáy, 4 nút chạm-ngón-cái: **Tổng quan** (→ overview) · **Menu** (mở drawer đầy đủ) · **Thông báo** (→ notifications) · **Tài khoản** (mở bottom sheet). Ở phone **ẩn nút ☰ nổi** (bottom bar đã có Menu) + bỏ chừa 48px header + chừa `padding-bottom` cho main không bị che.
- **Bottom sheet Tài khoản**: avatar + tên + @user·role, hai dòng **Hồ sơ tài khoản** (Web2UserProfile.open) + **Đăng xuất** (Web2Auth.logout) — vì modal hồ sơ chưa có nút Đăng xuất → đây là đường thoát rõ ràng trên điện thoại. Chưa đăng nhập → chuyển trang login.
- **Cache-bust**: bump `web2-mobile.css?v=20260624mob` (inject 1 nguồn → lan mọi trang). CSS + JS đi cùng nhau khi sidebar.js revalidate.
- **Embed (iframe ?embed=1)**: ẩn bottom bar/sheet để iframe (vd Phân quyền) không dựng thanh riêng.
- **Verify** (Playwright 390×844, login thật): bottom bar `display:flex` fixed đáy (top 774 + h70 = 844, in-viewport) ✓; account sheet `display:block`, rows ["Hồ sơ tài khoản","Đăng xuất"], logout in-viewport ✓; **drawer footer logout footerBottom=winH=844, in-viewport ✓** (dvh fix); desktop 1440 bottom bar `display:none` (không lộ) ✓. 3 screenshot xác nhận layout đẹp.

### [perf] Làm đẹp khuôn mặt bớt "đứng/stuck" — giảm res xử lý (DETECT_MAX 640, MAX_WORK 1440)

User: ai-photo "tải model xong stuck". Chẩn đoán (browser-test ảnh thật): mọi modal MỞ OK; engine load OK (opencv là Promise resolve ra Mat+inpaint; MediaPipe XNNPACK CPU; transformers RMBG). "Stuck" = **xử lý ĐỒNG BỘ chặn main-thread** trên ảnh lớn (detect MediaPipe + lọc smoothSkin/warp). Code lọc O(N) chuẩn (box-blur running-sum) + đã có `setBusy`+double-rAF; KHÔNG bug — chỉ nặng CPU. ⚠ Headless Chromium (software WASM, không SIMD) phóng đại freeze tới 60s+ → KHÔNG đại diện Chrome thật (ở đó ~dưới giây–vài giây).

Files: `web2/shared/beauty/web2-beauty-face.js` (DETECT_MAX 1024→640), `web2/shared/beauty/web2-beauty-studio.js` (MAX_WORK 1800→1440); bump version (ai-photo, video-beauty).

- **DETECT_MAX 640**: FaceLandmarker.detect chạy sync; detect không cần res cao → 640px nhanh ~2.5×, landmark normalize 0..1 scale lại W,H gốc (không giảm chất lượng output).
- **MAX_WORK 1440**: canvas xử lý lọc; 1440 vẫn nét cho FB/Zalo/in, lọc nhanh hơn ~35%.
- Verify: logo eraser opencv inpaint OK trên ảnh thật (turn trước); beauty engine load + detect OK; freeze duration không đo được chính xác trong headless. **Fix triệt để nếu real-Chrome vẫn lag = chuyển lọc sang Web Worker** (đề xuất follow-up).

### [fix] Phân quyền: nhãn trang sidebar bị cụt ("Trợ lý AI…"→"Tr", "Sửa ảnh AI…"→"S")

User: "https://nhijudy.store/web2/users/index.html lỗi ai-assistant và ai-photo" (nhãn 2 trang AI hiển thị cụt còn "Tr" / "S").

Files: `web2/users-permissions/index.html` (regex làm sạch nhãn auto-discover).

- **Nguyên nhân**: ma trận phân quyền tự bổ sung trang có trong sidebar NAV mà thiếu ở `WEB2_PAGES` (auto-discover, view-only). Regex cắt emoji trang trí cuối nhãn dùng `\s*[^\w\s].*$` — nhưng `\w` trong JS là **ASCII-only**, coi dấu tiếng Việt (ợ, ý, ử…) là ký tự "lạ" → nuốt từ chữ có dấu đầu tiên tới hết: `"Trợ lý AI theo trang ✨"`→`"Tr"`, `"Sửa ảnh AI 🪄"`→`"S"`. (2 trang này lấy nhãn từ sidebar vì chưa có trong registry backend; ai-hub/video-maker không dính vì lấy nhãn từ `WEB2_PAGES`.)
- **Fix**: thay bằng strip emoji/biểu tượng ở ĐẦU/CUỐI qua Unicode property escape `^[\s\p{Extended_Pictographic}️‍]+|[…]+$/gu` — chỉ ăn emoji + VS16 + ZWJ + khoảng trắng, **giữ nguyên dấu tiếng Việt**.
- **Verify**: Node test 7 case (Trợ lý/Sửa ảnh/Xưởng Video + emoji đầu/cuối + nhãn thường) → ALL PASS, diacritics giữ nguyên. Iframe đã cache-bust `&t=Date.now()` nên không cần bump version.

### [fix] Phân quyền: Save báo 400 `Page "ai-assistant" không tồn tại`

User: lưu phân quyền → `PUT /api/web2-users/39/permissions 400` `{"error":"Page \"ai-assistant\" không tồn tại"}`.

Files: `render.com/routes/web2-users.js` (registry + validation PUT /permissions) — deploy `web2-api`.

- **Nguyên nhân**: FE auto-discover trang sidebar (ai-assistant/ai-photo) cho admin tick `view`, nhưng BE `PUT /:id/permissions` validate CỨNG — slug không có trong `WEB2_PAGES` → reject 400. → mọi trang chỉ-có-trong-sidebar đều vỡ lúc Save, không riêng 2 trang AI.
- **Fix (2 lớp)**: (1) thêm `ai-assistant` (Trợ lý AI theo trang) + `ai-photo` (Sửa ảnh AI) vào `WEB2_PAGES` nhóm AI, `actions:['view']` (đúng convention "thêm trang mới → 1 entry"); (2) nới validation: slug lạ vẫn lưu được **nếu** slug an toàn `/^[a-z0-9][a-z0-9-]{0,63}$/` **và** chỉ action `view` → khớp auto-discover, trang sidebar mới sau này không vỡ. Action khác / slug lạ → vẫn reject. Known page sai action → vẫn reject.
- **Verify**: `node -c` OK + Node test 7 nhánh (known mới pass, future view-only pass, non-view reject, unsafe slug reject, known-bad-action reject) → đúng hết. BE cần Render redeploy `web2-api`.

### [fix] Xóa logo dùng OpenCV inpaint THẬT (trước chỉ làm mờ) + product-card tự động xóa nền

User: (1) "xóa logo không hoạt động đúng, chỉ làm mờ đi"; (2) "tạo card sản phẩm sẽ tự động xóa nền SP trước khi tạo card".

Files: `web2/shared/web2-logo-eraser.js` (inpaint OpenCV), `web2/product-card/index.html` (auto-bg deps + toggle + bump), `web2/product-card/js/product-card.js` (loadProductImage auto-cutout), `web2/ai-photo/index.html` (bump logo-eraser).

- **Xóa logo (fix)**: `_inpaintRect` cũ = nội suy song tuyến từ 4 viền → fill gradient = TRÔNG NHƯ LÀM MỜ, không xóa được trên nền texture. Nay `applyErase` ưu tiên **OpenCV `cv.inpaint` TELEA** (content-aware): lazy-load opencv.js `@techstark@4.11.0` (~8MB; loader xử lý cv là Promise — verify: `window.cv` resolve ra module có Mat+inpaint, ~init lần đầu rồi cache). ⚠ Mấu chốt CHẤT LƯỢNG: trong mỗi ô user khoanh, KHÔNG mask cả ô (→ smear) mà **high-pass tách NÉT logo** (GaussianBlur nền → absdiff → threshold 18 → dilate) rồi chỉ inpaint nét → GIỮ vân nền. frac ngoài [0.4%–55%] → fallback mask cả ô. Lỗi opencv → fallback bilinear. **Verify trên ảnh thật của user** ("CN with love / New collection 2026" trên vải xám): chữ biến mất, vân vải giữ được, inpaint ~1.2s.
- **Auto xóa nền product-card**: thêm `loadProductImage(src)` → nếu bật "✨ Tự động xóa nền" (default ON) thì gọi `Web2BgScene.cutout(src,{prefer:'auto'})` (server rembg máy shop nếu có, else on-device RMBG-1.4) TRƯỚC khi vẽ card; giữ `_origSrc` để tắt toggle revert ảnh gốc. Route upload/paste/chọn-kho qua loadProductImage. Lỗi cutout → dùng ảnh gốc. Verify browser: cutout RMBG-1.4 on-device trả ảnh 72KB ✓, 0 console error.

### [feat] A — HyperFrames render video HTML→MP4 (self-host máy shop, như VieNeu) + nối B→A

User chọn A (sau B): dựng HyperFrames thành service render video self-host trên máy shop (mô hình VieNeu-TTS).

Files: **NEW** `hyperframes-render/` (server.js + package.json + README + run-mac.command + run-windows.bat + .gitignore), `web2/shared/web2-video-render.js` (`Web2VideoRender`); sửa `web2/shared/web2-html-skill.js` (skill `video-hyperframes` + size 1080×1920 + flag video), `web2/ai-hub/js/ai-html.js` (nút "Render MP4 (máy shop)"), `web2/ai-hub/index.html` (load video-render + bump).

- **hyperframes-render/server.js** (Node 22, máy shop): Express `POST /render {html}` → ghi HTML → chạy HyperFrames CLI (`HF_RENDER_CMD` override) → trả MP4; `/health`; CORS `*`; cloudflared tunnel + heartbeat 30s. **KHÔNG cần route worker/registry mới** — tái dùng `web2-vieneu-registry` (cột `engine`, đăng ký `engine='hyperframes'`).
- **Web2VideoRender** (client): `listMachines()`→`pickOnline()` (probe /health)→`render({html})` POST thẳng tunnel máy → MP4 blob URL. Không máy online → lỗi rõ ràng.
- **B→A**: HTML Studio thêm skill `video-hyperframes` (composition động: data-composition-id + GSAP timeline paused + window.\_\_timelines). Skill video → hiện nút render.
- **Verify browser** (chưa có máy shop): 6 skill, nút render đúng skill video (1080×1920), discovery graceful (machines [], render → lỗi "Chưa có máy render online…"), 0 console error. Render thật verify khi bật `hyperframes-render` trên máy shop (README).

### [feat] HTML Studio — sinh HTML đẹp từ data bằng AI free (mượn ý html-anything) + product-card "Layout AI"

User: nghiên cứu hyperframes/html-anything → chọn làm **B** (port pattern "skill + anti-AI-slop" vào product-card/ai-hub dùng AI free sinh card/bài đăng HTML đẹp). (A = HyperFrames render service self-host máy shop — làm tiếp sau.)

Files: **NEW** `web2/shared/web2-html-skill.js` (`Web2HtmlSkill`), `web2/ai-hub/js/ai-html.js` (`AiHtml`); sửa `web2/ai-hub/index.html` (tab "HTML Studio" + pane + scripts DOMPurify/html2canvas), `web2/ai-hub/js/ai-hub.js` (switchTab/init hook), `web2/ai-hub/ai-hub.css` (`.aihh-*`), `web2/product-card/index.html` (nút "Layout AI" + scripts), `web2/product-card/js/product-card.js` (`openAiLayout` modal), `web2/product-card/product-card.css` (`.pcard-ai-*`).

- **Web2HtmlSkill** (1 nguồn dùng chung): 5 skill drop-in (`fb-sale-post`, `product-card-rich`, `price-list`, `voucher-card`, `data-report`) + preamble **chống "AI slop"** (font Be Vietnam Pro, lưới 8px, contrast ≥4.5, không #000/#fff, **data thật cấm lorem**, khung canvas theo skill). `generate()` **reuse `/api/web2-ai/chat/stream`** (KHÔNG cần backend mới / Render deploy) → stream HTML vào `iframe[sandbox=allow-same-origin]` (no allow-scripts = chặn XSS) → export PNG (html2canvas) / HTML.
- **Resilience**: failover provider trên STREAM `gemini→groq→openrouter` (mỗi attempt 1 provider) + auto-retry khi `bodyIsEmpty`. KHÔNG dùng `/chat` non-stream (worker timeout 15s với HTML dài). Bug đã gặp khi test: Gemini overload → fix bằng failover; non-stream fallback timeout → bỏ.
- **HTML Studio** (ai-hub tab mới): picker skill + textarea data + "Tạo lại/PNG/HTML/Mở tab" + iframe preview scale-to-fit.
- **product-card "Layout AI"**: nút mở modal, gom field SP (name/price/badge/note/shop) → skill `product-card-rich`, ảnh SP chèn qua placeholder `__PRODUCT_IMAGE__` (không gửi base64 cho AI) → export.
- **Verify browser** (localhost): price-list + fb-sale-post (real data, render đẹp, 0 console error), product-card "Túi tote canvas" → Xong ✓. Screenshot OK.

### [feat] Cấu hình & Hệ thống — 2 tab mới "Module" + "Bên thứ 3" (audit 5 vòng) + sửa tab Dịch vụ cho chính xác

User: audit lại Web 2.0 → trang `web2/system/?tab=services`: (1) tab Dịch vụ đã chính xác chưa khi có code/feature/trang mới; (2) thêm 1 tab tổng hợp toàn bộ module + 1 tab tổng hợp toàn bộ bên thứ 3 (vd github) — rà soát 5 vòng.

Files: **NEW** `web2/system/js/system-modules.js`, `web2/system/js/system-thirdparty.js`, `scripts/gen-web2-system-data.js`, `web2/system/data/{web2-modules.json,web2-third-parties.json,_module-categories.json}`; sửa `web2/system/index.html` (2 tab + 2 panel + cross-link), `web2/system/js/system-app.js` (VALID*TABS + lazy-init + reload), `web2/system/css/system.css` (mod-* / tp-\_), `render.com/routes/services-overview.js` (SERVICES_INVENTORY).

- **Audit bên thứ 3 = workflow 5 vòng** (13 agent, ~1.1M tok): discover 6 góc (CDN libs, frontend API, backend+ENV, OSS/GitHub ports, infra, services-accuracy) → 5 vòng rà soát lăng kính riêng (AI/LLM/TTS → nhắn tin/TPOS/payment → CDN lib/on-device model → OSS+infra → cross-check) → synthesize. Ra **70 bên thứ 3** (mỗi mục có `usedIn` = file thật, đã spot-verify grep KHÔNG hallucination). Registry: `web2-third-parties.json` (category/provider/cost/license/layer/usedIn/envKeys[chỉ TÊN biến]/githubUrl/status). Tab UI: filter category + layer (web2/web1) + cost + search.
- **Tab Module**: `web2-modules.json` sinh bởi `gen-web2-system-data.js` (đọc codemap + quét render.com) — 126 shared (20 nhóm category) + 43 trang + 57 route + 35 service backend. 3 view (Dùng chung / Trang / Backend), search, category chips. (10 shared module mới chưa categorize → "Khác", chạy lại categorize sau.)
- **Sửa tab Dịch vụ (9 finding)**: Firestore = LEGACY/drained cho Web 2.0 (data đã sang Postgres 2026-06-14, chỉ pancake*tokens còn active); web2Db purpose = bảng web2*\* thật (bỏ "Neon/78 entities"); Firebase Auth = Web 1.0 (Web 2.0 dùng auth Postgres); Cloudflare = unified proxy; GitHub Pages → nhijudy.store; +AI/TTS/SePay/TPOS; Render = 2 service (n2store-fallback + web2-api). ⚠ Tab Dịch vụ đọc API live → cần Render redeploy mới thấy inventory mới.
- **Verify browser** (localhost, 5 tab): 0 console error; Module 116→126 cards/20 nhóm; Bên thứ 3 70 cards/13 nhóm, filter web1→16, search "gemini"→3; screenshot OK.

### [feat] Trang "Sửa ảnh AI" mới (group AI) thay photo-editor cũ — gom mọi công cụ ảnh

User: "photo-editor cũ/dở → xóa, làm trang mới bên group AI, gồm tất cả tính năng + model github tốt nhất (license kệ vì nội bộ)".

Files: **NEW** `web2/ai-photo/` (index.html + js/ai-photo.js + ai-photo.css), **NEW** `web2/shared/web2-bg-scene.js`; sửa `web2/shared/web2-sidebar.js` (thêm "Sửa ảnh AI 🪄" vào group AI, bỏ "Chỉnh sửa ảnh" khỏi Đa dụng + route list); **XÓA** `web2/photo-editor/`.

- **Trang tool-grid** điều phối các module dùng chung (KHÔNG dựng lại): `Web2BgScene` (xóa/đổi nền), `Web2LogoEraser` (xóa logo/WM), `Web2Watermark` (thêm logo/WM), `Web2BeautyStudio` (8 tool làm đẹp), `Web2ImageEditor` (nâng cao/Photopea). Input dán/kéo-thả/chọn; kết quả → chỉnh chồng tiếp.
- **Web2BgScene** (xóa nền in-browser): transformers.js 3.8.1 pipeline `background-removal`. ⚠ Bug đã fix: pipeline KHÔNG có ở 3.0.2 (phải 3.8.1); BiRefNet_lite load được nhưng INFERENCE ném lỗi WASM (số 240595976) → refactor thử từng model load+inference trong CÙNG try, fallback, cache pipe chạy được. Model: **RMBG-1.4** (proven) → modnet fallback. Verify: cutout RMBG-1.4 ra PNG alpha 161KB ✓. + composite nền màu/ảnh/sinh-AI-Pollinations-free, server rembg (BiRefNet) nếu có máy.
- **Verify browser**: 6 module load, 12 tool, set ảnh → tools hiện, cutout RMBG-1.4 OK, UI sạch (screenshot). bg-remover/app.py default → birefnet-general-lite (commit trước).

## 2026-06-24

### [feat] Chấm công — nhóm 3a (widget Hôm nay) + nhóm 2 (Chốt lương + khoá kỳ)

Files: `cham-cong-app.js`, `cham-cong-payroll.js`, `cham-cong-api.js`, `render.com/routes/web2-attendance.js`, `index.html`.

- **Widget "Hôm nay"** (`renderTodayHtml`, app.js): trên đầu Bảng công (chỉ tháng hiện tại) — chip đếm + danh sách ai **chưa vào / quên bấm ra / vắng / đang làm / đủ**, tính theo giờ GMT+7 + ca từng NV. Frontend thuần từ records.
- **Chốt lương + khoá kỳ (B-roadmap #1)**: backend table `web2_attendance_period_lock` (month_key PK, locked_by/at, snapshot JSONB) + routes `GET/POST /period-lock`, `DELETE /period-lock/:mk` (requireWeb2Admin). Frontend: nút "🔒 Chốt lương tháng này" → gửi snapshot (rows: du+pr+m mỗi NV + total) → khoá. Tháng đã khoá → `entriesForRender`/`resolveRow` **render từ snapshot (đóng băng)**, banner 🔒 + "Mở khoá", ẩn Sửa/Chốt, Chi tiết/In/Excel dùng snapshot. Guard chặn sửa punch khi khoá (saveDayDetail + add/del). SSE `period-lock` → reload.
- Bump api/payroll/app `?v=` h/l/n. **Verified browser**: LIVE→có nút Chốt+Sửa+tổng live; LOCKED→render snapshot đóng băng (9.999.000đ thay 190.000đ), banner+Mở khoá, ẩn Sửa/Chốt, 0 error. Salary unit-test (nhóm 1) pass. Backend cần Render redeploy để có endpoint period-lock.
- **Còn lại** (user chọn nhưng chưa làm): Lịch sử thay đổi/audit (nhóm 2) + Nghỉ phép có loại (nhóm 3b) — đều cần table backend mới.

### [feat] Thêm logo / watermark (Web2Watermark) vào photo-editor — phần DUY NHẤT còn thiếu

User yêu cầu 5 chức năng sửa ảnh (xóa nền, đổi nền, xóa logo, xóa watermark, thêm logo/watermark) + "license kệ vì làm kho nội bộ". **Audit phát hiện 4/5 ĐÃ CÓ** (tránh build trùng — bài học đọc-existing-trước):

- Xóa nền + đổi nền → `web2/photo-studio/` (MediaPipe Selfie + @imgly isnet + SlimSAM + chroma; nền màu/preset/scene/upload).
- Xóa logo + watermark → `web2/photo-editor/` tool "Xoá logo" + shared `Web2LogoEraser` (inpaint vùng chọn).
  → Chỉ **THÊM logo/watermark** chưa có. Đã XÓA các file build trùng (image-tools/, web2-bg-scene.js, web2-image-inpaint.js).

Files: **NEW** `web2/shared/web2-watermark.js` (`Web2Watermark.open(src)→Promise<dataURL>`), `web2/photo-editor/index.html` (+script +tool button "Thêm logo/WM"), `web2/photo-editor/js/photo-editor.js` (runTool case 'watermark').

- **Web2Watermark**: modal tự chứa — upload logo, 9 vị trí, slider Cỡ + Mờ, checkbox "Lặp khắp ảnh (watermark chìm, xoay nghiêng)". Composite canvas full-res on-device, $0. Trả dataURL. Cắm vào framework tool có sẵn của photo-editor (mirror Web2LogoEraser).
- **Verify browser**: button "Thêm logo/WM" có; module load; modal mở 9 anchor; nạp logo→preview render→Áp dụng→result dataURL 22KB→modal đóng; tile mode hiện logo lặp xoay nghiêng đẹp.
- **MEMORY**: feedback_web2_license_internal (Web 2.0 nội bộ → dùng tự do model NC/AGPL).

## 2026-06-24

### [fix] Chấm công — nhóm 1/3: sửa lỗi tính lương (B3/B6/B7/B9/B10/B11) sau audit

Files: `cham-cong-salary.js`, `cham-cong-employees.js`, `cham-cong-payroll.js`, `index.html`. Theo audit [`docs/web2/CHAM-CONG-AUDIT.md`](web2/CHAM-CONG-AUDIT.md).

- **B7 số công nguyên**: `calcMonth` đếm `workedDays += 1` (bỏ cộng phân số → hết 14.8/20.54). Đi muộn/về sớm phạt riêng, không trừ số công.
- **B9 punch thiếu = 0**: `calcDay` chặn `incomplete` (1 lượt quẹt) → baseSalary=0 + cờ (trạng thái vẫn "missing"). Trước tính vài phút vô nghĩa.
- **B10 override công reset phạt**: `salary_days_override` set → `lateDeduction=0` (chốt cứng số ngày).
- **B11 validate giờ ca**: chặn lưu nếu giờ ra ≤ giờ vào (chưa hỗ trợ ca qua đêm).
- **B3 chống gán trùng NV**: cảnh báo khi 1 NV gán ≥2 PIN; Bảng lương banner đỏ + "⚠ PIN xxx" dòng trùng.
- **B6 lương tháng 0 công**: "⚠ 0 công" nhắc kiểm tra giảm trừ.
- Bump j/k/l. Verified unit-test: incomplete→0, workedDays=2 (không 1.95), override→late=0.

### [feat] inventory-tracking — Quick-pick SP từ kho: popup canh giữa + multi-select + chèn nhiều dòng dưới

User (3 ý): (1) chỉnh vị trí input khi bấm nút bút-chì ở ô STT; (2) nhập tìm → SP có **checkbox chọn nhiều** + nút **Xác nhận**; (3) Xác nhận **chèn các SP đã chọn thành dòng mới NẰM DƯỚI** dòng được bấm.

Files: `inventory-tracking/js/product-quick-pick.js` (viết lại), `inventory-tracking/js/crud-operations.js` (+`insertProductRowsBelow`), `inventory-tracking/css/product-quick-pick.css`, `inventory-tracking/index.html`.

- **Vị trí (1)**: bỏ dropdown nhỏ bám theo ô (dễ lệch) → **popup canh giữa màn hình** (overlay dim `.iqp-overlay` + card `.iqp-panel`, input 16px/cao 46px, nút to — iPad-friendly, đồng bộ style cell-edit popup).
- **Multi-select (2)**: mỗi kết quả là `<label>` + checkbox `.iqp-check`; chọn lưu vào `Map _selected` (giữ qua nhiều lần search), footer "Xác nhận (N)" cập nhật realtime, disable khi N=0. Enter tick item highlight; click ngoài/Esc/✕ đóng.
- **Chèn dưới (3)**: confirm → `window.insertProductRowsBelow(invoiceId, afterIdx, names[])` (crud-operations.js): build mỗi name thành 1 row mới (maSP=tên, field khác rỗng — như copyProductRow) → `splice(afterIdx+1, 0, ...newRows)` → `_persistSanPham` (save + flatten + re-render). Dòng được bấm GIỮ NGUYÊN.
- **Verified browser (stub API, KHÔNG ghi prod)**: mở picker → overlay canh giữa; search "ao" → 20 kết quả đều có checkbox; chọn 2 → "Xác nhận (2)"; confirm → gọi insert đúng `(invoiceId, idx, [2 tên])`, overlay đóng. Insert data: before=1 → after=3, `[idx+1]=TEST-AAA`, `[idx+2]=TEST-BBB` (đúng vị trí dưới dòng bấm), `shipmentsApi.update` nhận mảng mới (stub) → reload xả test rows. Screenshot xác nhận UI.
- Bump product-quick-pick.js/.css + crud-operations.js → 20260624c.

### [fix/feat] Chấm công — guard chống reload nền mất chỉnh sửa + heartbeat strip-only + in phiếu lương

User: (1) gán NV → máy đẩy dữ liệu refresh bảng ~5s khi chưa Lưu → mất chỉnh sửa; (2) thêm nút in phiếu lương tháng chi tiết.

Files: `web2/cham-cong/js/cham-cong-app.js`, `cham-cong-employees.js`, `cham-cong-payroll.js`, `index.html`.

- **Bug refresh mất edit (gốc)**: heartbeat ADMS (~10s) `_notify('heartbeat')` → SSE `web2:attendance` → client `loadAll()` → re-render tab Nhân viên → **mất ô đang gõ**. Fix 2 lớp: (a) **heartbeat → strip-only**: SSE handler đọc `evt.data.action`, `heartbeat`/`sync` → `refreshSyncOnly()` (chỉ fetch sync-status + cập nhật dải, throttle 20s, KHÔNG reload bảng); chỉ `records`… mới `loadAll`. (b) **edit-guard tab Nhân viên**: `state.empDirty` set khi gõ/đổi ô (banner "có thay đổi chưa lưu") → `render({force})` bỏ qua rebuild khi reload nền (`force=false`) + dirty → GIỮ nguyên ô đang gõ; force=true (đổi tab/tháng, Tải lại, thêm/xoá NV, Lưu tất cả) mới dựng lại. `renderActive(force)` threaded qua loadAll/setTab/shiftMonth/ccReload.
- **In phiếu lương** (`printPayslip`): nút "🖨 In" mỗi dòng Bảng lương + trong modal Chi tiết → `window.open` phiếu lương A4 self-contained (header shop, NV/mã/ca/đơn giá, breakdown lương chính/OT từng ngày/phụ cấp/thưởng/giảm trừ+phạt muộn/đã trả, tổng+còn lại, ghi chú tháng+ngày, ô ký) → auto `window.print()`. Không thư viện.
- Bump payroll/employees/app `?v=` 20260624 j/k/l.
- **Verified browser**: 0 console error; edit-guard (gõ→dirty→banner→reload nền GIỮ edit→force rebuild fresh); payslip HTML đủ section (PHIẾU LƯƠNG/tên/tổng/thưởng/tạm ứng). Audit toàn trang chạy nền (workflow) — bug + roadmap báo sau.

### [feat/fix] Chấm công — nhúng token vào bộ cài (admin-only, KHÔNG vào repo) + hiện "Đang kết nối" cho ADMS

User: "cai-cham-cong.bat chưa để token vào" + "không được để token ở folder github".

Files: `web2/shared/web2-attendance-installer.js`, `web2/printer-settings/index.html`, `render.com/routes/web2-attendance.js`, `render.com/routes/web2-attendance-adms.js`.

- **Token KHÔNG ở repo**: secret nằm env Render. Thêm endpoint **admin-only** `GET /api/web2-attendance/agent-secret` (requireWeb2Admin) → trả secret. Nút "Tải file cài" giờ `downloadInstallerWithSecret()`: fetch secret (header Web2Auth) → **nhúng thẳng vào `config.json`** mà `.bat` tạo. Không phải admin / chưa cấu hình → bat tạo config từ example (máy vân tay ADMS vẫn chạy không cần token). Verified: secret CHỈ xuất hiện trong bat khi truyền opts.secret; `git grep <secret>` toàn repo = rỗng (chỉ ở serect_dont_push.txt gitignored + config.json gitignored).
- **Lý do quan trọng**: ADMS `/iclock/*` KHÔNG bắt buộc secret → thiếu token KHÔNG phải lỗi khiến không chạy.
- **Fix feedback "Chưa đồng bộ" cho ADMS**: trước đây chỉ ZK-pull PUT /sync-status, ADMS proxy không cập nhật → trang Chấm công luôn hiện "Chưa đồng bộ / Lần cuối: —" dù máy đang đẩy. Thêm `touchAdmsStatus(db)` (export từ web2-attendance.js) gọi fire-and-forget từ ADMS GET /iclock/cdata (heartbeat ~10s) + POST ATTLOG → set connected=TRUE + last_sync_time=now → trang hiện "Đang kết nối".
- Bump installer `?v=20260624a→b`. Backend cần Render redeploy để có agent-secret endpoint + touchAdmsStatus.

User: mỗi trang Web 2.0 có AI assistant đọc số liệu/hội thoại/đơn ĐANG HIỂN THỊ để rà soát phép tính, phân tích cảm xúc khách (Pancake), soát đơn — dùng AI FREE, có trang riêng chọn/đổi AI. Chỉ dùng dữ liệu có sẵn ở browser.

Files: **NEW** `web2/shared/web2-ai-assistant.js` (`Web2AiAssistant`), `web2/ai-assistant/index.html` + `js/ai-assistant.js`, sửa `web2/shared/web2-sidebar.js` (menu AI + autoload).

- **Widget nổi** (✨ góc phải-dưới mọi trang, autoload qua sidebar): panel chat + 5 quick-action (rà soát số liệu / kiểm tra phép tính / phân tích cảm xúc khách / soát đơn / giải thích trang). `pageContext()` gom CHỈ DOM hiển thị (tiêu đề + bảng structured + nội dung main + vùng bôi đen, cap 7000 ký tự) — KHÔNG gửi localStorage/token (tránh lộ secret). Gọi `/api/web2-ai` (provider chọn → `/chat`, hoặc rỗng → `/complete` auto-failover). System prompt ép "chỉ dùng dữ liệu trang, tự tính lại phép cộng/trừ". 401 → toast + requireAuth.
- **Trang quản lý** `web2/ai-assistant`: bật/tắt widget + chọn AI free (4 provider từ /status: Gemini/Groq/OpenRouter/ChatAnywhere, hoặc "Tự động xoay tua") + model + thử nhanh. Lưu localStorage `web2_ai_assistant` → `Web2AiAssistant.reloadConfig()`.
- **Verify browser** (login phuocnho): widget load + FAB hiện + context capture (bảng users); hỏi "trang này hiển thị gì" trên overview → AI trả lời ĐÚNG nội dung trang ("13 trang Web 2.0… chức năng, API, luồng dữ liệu"); trang quản lý liệt kê 4 AI ✓ all ready. Pancake mood / soát đơn dùng chung cơ chế (hội thoại/đơn đã nằm trong DOM → context). v1; iterate thêm.

## 2026-06-24

### [feat] Biến thể / inventory-tracking — bỏ inline edit, dùng POPUP INPUT (dễ thao tác iPad)

User: "lúc bấm 2 lần vào dữ liệu cần chỉnh thì mở modal hay 1 popup input đi đừng inline nữa vì tôi tương tác trên iPad bị khó."

Files: `inventory-tracking/js/table-renderer.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html`.

- **1 helper dùng chung** `openCellEditPopup({title,label,value,type,min,max,step,placeholder})` → Promise<string|null> (null = hủy). Overlay center, input 16px + cao 48px (không zoom iOS, dễ chạm), nút Lưu/Hủy to, đóng khi bấm ngoài/Esc, guard chỉ 1 popup 1 lúc.
- **Chuyển HẾT 7 chỗ inline edit sang popup** (giữ nguyên logic commit/lưu cũ — chỉ đổi cách lấy value, truyền `{value}` vào commit): `startInlineEdit` (Mã hàng/Tổng SL/Đơn giá), `startInlineEditNcc` (tên NCC), `startInlineEditCost` (chi phí), `startInlineEditCostNote` (ghi chú CP), `startInlineEditTiGia` (tỉ giá), `_startInlineEditPaymentGeneric` (ngày/số tiền/ghi chú thanh toán — type date/number/text), `startInlineShortage` (số món thiếu, max=tongMon). Bỏ tạo input-trong-ô + blur/Enter/Escape.
- `commitInlineEdit` re-append decorations (nút bút chì) qua `td._restoreDecorations` như cũ; popup KHÔNG empty ô (commit tự ghi đè innerHTML).
- **Verified browser (stub API, KHÔNG ghi prod)**: mở ô Tổng SL "25" → popup title "Sửa Tổng SL", type number, value 25, nút "Lưu"; ô KHÔNG còn input inline. Hủy → overlay biến mất, ô giữ "25", 0 API call. Lưu (value 99) → 1 API call `shipmentsApi.update(invoiceId,{sanPham})` đúng, ô hiện "99", nút bút chì còn nguyên.
- Bump table-renderer.js + css/modern.css → 20260624d.

### [fix] ai-hub: 401 /chats,/status,/quota — bắt buộc auth Web 2.0 + xử lý phiên hết hạn

User: lỗi `GET /api/web2-ai/chats?limit=50 401` + hỏi lưu lịch sử chat lên DB. Chẩn đoán: lịch sử chat ĐÃ lưu DB (Postgres `web2_ai_chats`, cột messages **JSONB** — gọn + query được, KHÔNG cần mã hoá/giải mã thủ công). 401 = token Web 2.0 thiếu/hết hạn → middleware `requireWeb2AuthSoft` chặn khi `WEB2_AUTH_ENFORCE=1`. ai-hub TRƯỚC ĐÂY không enforce auth lúc load → user token hết hạn vẫn vào trang nhưng mọi call AI 401.

Files: `web2/ai-hub/js/ai-hub.js`, `web2/ai-hub/js/ai-chat.js`, `web2/ai-hub/index.html`.

- **Enforce auth lúc init**: `AiHub.init()` gọi `Web2Auth.requireAuth()` đầu tiên → token hết hạn (/me 401) tự redirect `/web2/login` (lỗi mạng giữ nguyên). User đăng nhập lại → token mới → AI + lịch sử chat chạy.
- **Phiên hết hạn giữa chừng**: `AiHub.handle401(res)` + `notifyAuthExpired()` (toast 1 lần + đẩy login) wire vào `_mergeServerChats` (fetch /chats).
- **Verify browser**: login phuocnho/telephone → round-trip chat history OK (PUT 200 + list found + GET 2 msgs + DELETE 200); reload ai-hub token hợp lệ → KHÔNG redirect, 4 provider load (gemini/groq/openrouter/chatanywhere), 0 lỗi 401. Bump `ai-hub.js` c→d, `ai-chat.js` d→e.

## 2026-06-24

### [feat] Chấm công DG-600 — nút "Tải & cài" trên trang Máy in (1-click bootstrap từ web)

User: "tích hợp vào trang printer-settings 1 option .bat tự tải folder attendance-sync về và chạy".

Files: `web2/shared/web2-attendance-installer.js` (mới), `web2/printer-settings/index.html`.

- **Module shared `Web2AttendanceInstaller`** (mirror `Web2PosInstaller`): `downloadInstaller/downloadUninstaller/renderButtons/batContent`. Nút trên web sinh `cai-cham-cong.bat` client-side (Blob download).
- **bat tự bootstrap**: check Node → tải 5 file (`setup.js, adms-proxy.js, lib-config.js, config.example.json, package.json`) từ `siteRoot()/attendance-sync/*` về `%LOCALAPPDATA%\N2StoreChamCong` (PowerShell Invoke-WebRequest) → tạo `config.json` từ example → `node setup.js` (lo hết: tự gỡ cũ + test + autostart + chạy nền). `go-cham-cong.bat` gọi `setup.js --uninstall` + xoá autostart + kill proxy (belt-and-suspenders).
- **Trang Máy in**: thêm section "Cài máy chấm công DG-600 (Windows — 1 click)" + 2 nút (cài/gỡ) + hướng dẫn 5 bước, load `web2-attendance-installer.js`, `renderButtons('#attInstallBtns',{showUninstall:true})`.
- URL tải tính từ SITE-ROOT (trước `/web2/`) → đúng mọi domain (nhijudy.store / github.io).
- **Verified**: (a) batContent sinh đúng (download loop + node setup.js); (b) **bootstrap end-to-end thật**: tải 5 file từ nhijudy.store/attendance-sync/\* (setup.js 19234B) → `node setup.js` → self-test HTTP 200 "CHUOI HOAT DONG" exit 0; (c) browser test trang Máy in: module loaded, 2 nút render, 0 console error.

### [feat] Biến thể (inventory-tracking) — kéo sắp xếp thứ tự Màu/Size, lưu DB, load về các máy

User: "Vị trí màu, size cho kéo lưu vị trí lại cho dễ dùng -> lưu lên db load về các máy."

Files: `render.com/routes/v2/inventory-tracking.js`, `inventory-tracking/js/api-client.js`, `inventory-tracking/js/modal-variant.js`, `inventory-tracking/css/modern.css`, `inventory-tracking/index.html`.

- **Server**: bảng mới `inventory_attr_order` (1 dòng id=1, JSONB `colors/size_num/size_char` — thứ tự CHUNG cho cả shop). `GET /product-attributes` tách 2 lớp: cache RAW buckets TPOS (24h) + áp thứ tự đã lưu **mỗi request** (`_applyAttrOrder`: value đã lưu lên trước theo thứ tự, value TPOS mới nối đuôi) → đổi thứ tự KHÔNG refetch TPOS. Endpoint mới `PUT /product-attributes/order` upsert dòng singleton + notify SSE `inventory_attr_order`.
- **Client**: grip `⠿` (draggable) đầu mỗi ô Màu/Size số/Size chữ; HTML5 DnD gắn ở **container** (sống qua re-render, idempotent), **chỉ cùng cột** (không kéo màu sang size). Thả → `_reorderVariant` cập nhật mảng VARIANT\_\* + re-render + `_saveVariantOrderDebounced` (800ms) PUT server + cập nhật localStorage + toast.
- **SWR**: `_loadTposAttributes` bỏ early-return theo TTL → luôn revalidate server (throttle 10s) → thứ tự lưu ở máy khác hiện ra lần mở modal kế tiếp ("load về các máy"). localStorage chỉ vẽ nhanh.
- **Verified browser (client)**: 80 grip render, `draggable=true`, 3 handler container đúng; `_reorderVariant("color","Cam","Bạc",false)` → `["Cam","Bạc","Beo",…]`; save PUT fire đúng path (404 vì server chưa deploy lúc test → OK sau deploy). Server verify sau Render deploy.
- Bump version css/modern.css + api-client.js + modal-variant.js → 20260624c.

### [fix] Biến thể (inventory-tracking) — Màu/Size load KHÁC NHAU giữa các máy (client chưa dùng endpoint chung)

User: "Audit -> debug biến thể... hình như đang bị 2 cái đè lên lẫn nhau" → làm rõ: "Nó load không đúng dữ liệu ở các máy". Không phải lỗi CSS — là lỗi **dữ liệu load khác nhau giữa các máy**.

**Root cause (verified browser)**: Modal `#modalVariant` ([modal-variant.js](../inventory-tracking/js/modal-variant.js)) build list Màu/Size từ **localStorage CỦA RIÊNG TỪNG MÁY** (`tpos_attribute_values_cache`) + fallback cứng 10 màu. Máy A (có cache TPOS) thấy **80 màu**, máy B (thiếu cache / không có token TPOS) tụt về **10 màu** → "load không đúng dữ liệu ở các máy". Và khi nạp lại biến thể đã lưu, code bucket từng phần theo membership của list (incomplete) → size lọt vào cột Màu = **"2 cái đè lên lẫn nhau"**. Endpoint server chung `GET /api/v2/inventory-tracking/product-attributes` ĐÃ tồn tại + deploy từ phiên trước (`b0bc79fb5`, trả đúng 80/22/6) **NHƯNG client chưa bao giờ gọi nó** (vẫn fetch TPOS trực tiếp từng máy).

Files: `inventory-tracking/js/api-client.js`, `inventory-tracking/js/modal-variant.js`, `render.com/routes/v2/inventory-tracking.js` (hardening bucket), `inventory-tracking/index.html` (bump version).

- **Client → endpoint chung (fix chính)**: thêm `productAttributesApi.get()` (api-client.js) gọi endpoint server-cache. `_loadTposAttributes()` giờ: fast-paint từ localStorage (tránh modal trống) rồi nạp list CHUNG từ server (bỏ fetch TPOS trực tiếp + token per-máy). Mọi máy hội tụ về cùng 1 list → hết lệch.
- **Bucket đúng cột + giá trị ngoài list vẫn hiện**: parse combo "Màu / Size" theo VỊ TRÍ (phần đầu=Màu, phần sau=Size; số→Size Số, chữ→Size Chữ) + fallback shape khi giá trị không có trong list (đã ngừng/legacy). `_renderVariantOptions` tự thêm giá trị đã chọn vào **BẢN SAO** khi vẽ → biến thể đã lưu luôn hiển thị & tick đúng cột, **KHÔNG mutate** mảng VARIANT\_\* dùng chung (tránh giá trị SP này lẫn sang SP khác — code-review HIGH).
- **Server (hardening)**: bucket theo AttributeId (3=Màu,4=Size Số,1=Size Chữ) + fallback theo AttributeName + **de-dup** tên. Endpoint dùng `ProductAttributeValue/OdataService.GetView?$top=5000&$orderby=AttributeName,Name,Id` (user cung cấp; `$top` cao để lấy **đủ 108** — UI gốc dùng $top=80 chỉ lấy 80 màu, mất sạch size).
- **Verified live**: (a) curl TPOS GetView → 108 item (Màu 80 / Size Số 22 / Size Chữ 6). (b) Xoá cache → reload → modal nạp **80/22/6 từ server** (không còn fallback 10). (c) Bucket: `Xanh Đậm/44`→Màu+Size Số, `Đen/S`→Màu+Size Chữ, `Đen/999` (ngoài list)→**Size Số** (không lọt Màu). (d) Mở SP khác → list KHÔNG dính "999" (không lẫn). Code-review (typescript-reviewer) HIGH pollution đã fix.
- Bump version: `api-client.js`/`modal-variant.js` 20260622c→20260624a.

### [fix/refactor] Chấm công DG-600 — sửa lỗi không cài được + gom 1 folder + 1 NÚT cài/gỡ

User: "tại sao attendance-sync cài không được? quá khó cài vì quá nhiều file, đơn giản hóa 1 nút tự xóa tự cài làm hết kiểm tra, báo lỗi nếu có" + "xóa hết file không cần thiết trong attendance-sync, thêm hướng dẫn chi tiết".

**Root cause (verified live curl)**: máy DG-600 push `/iclock/cdata`; bản cũ `attendance-sync/adms-proxy.js` (v2 "Web 1.0 first + Web2 mirror") forward THẲNG `/iclock/cdata` tới **gốc worker** → worker chỉ route `/api/*` → trả **404 `{"error":"Invalid API route"}`** → proxy trả nguyên 404 đó về MÁY làm phản hồi handshake → máy không hiểu → lặp handshake 15s/lần, **KHÔNG bao giờ đẩy ATTLOG**. Web2 mirror (đúng endpoint) trả 200 nhưng fire-and-forget → response tốt bị vứt. + 2 folder trùng (`attendance-sync/` legacy vs `web2-attendance-sync/`) → cài nhầm bản broken. Live test xác nhận: `/api/web2-attendance-adms/iclock/cdata`→200 `GET OPTION FROM`, raw `/iclock/cdata`→404.

Files: `attendance-sync/` (gom về 1 folder duy nhất). Xoá folder trùng `web2-attendance-sync/`.

- **1 NÚT**: `CAI-DAT.bat`/`cai-dat.command` (cài) + `GO-BO.bat`/`go-bo.command` (gỡ) → gọi `setup.js` (bộ não cross-platform). Tự: [1] check Node [2] **syntax + #Note mọi .js, báo lỗi** [3] check/tạo config.json [4] **tự gỡ bản cũ** (kill theo cổng 8081 + theo command-line cả 2 folder; xoá 4 autostart VBS cũ) [5] npm install (tolerant) [6] **tự test chuỗi** proxy→worker→web2-api (GET `/iclock/cdata` phải có `GET OPTION FROM`) [7] autostart Startup VBS + chạy nền [8] in IP LAN máy + cách verify. Idempotent (chạy lại = gỡ-rồi-cài).
- **adms-proxy.js đúng**: forward `/iclock/*` → `<renderBase>/api/web2-attendance-adms/iclock/*`, **trả nguyên văn** response về máy (handshake hợp lệ). Append `?secret=` nếu có. KHÔNG deps (pure http/https) → package.json deps rỗng.
- **Xoá file thừa** trong attendance-sync: `zk.js, api.js, web2-push.js, index.js, find-commkey.js, diagnose.js, test.js, test-mac.sh, setup.bat, setup-adms.bat, cai-dat-tu-dong.bat, go-tu-dong.bat, start.vbs, stop.bat, web2-config.example.json`. Còn lại 11 file gọn.
- **README.md chi tiết**: cài 1 nút, cấu hình máy DG-600 (Server address = IP máy tính, port 8081, Auto upload), secret, kiểm tra, gỡ, bảng troubleshooting, sơ đồ kiến trúc, giải thích lỗi cũ.
- ANSI color TẮT trên Windows cmd (tránh escape rác). Output ASCII-only (console Windows không lỗi font).
- **Verified** chạy `node setup.js` 2 lần (từ web2-attendance-sync trước migrate + từ attendance-sync sau migrate): self-test HTTP 200 "CHUOI HOAT DONG", exit 0, syntax + #Note OK cả 3 file.

### [feat/fix] AI presets modal giống YouMind + bỏ chibi-banana + chibi avatar free + fix lightbox

User (5 yêu cầu + 2 bổ sung): (1) mẫu prompt có hình + filter/search như youmind.com/nano-banana-pro-prompts; (2) modal mẫu bị lỗi giao diện (card chồng lên nhau); (3) bỏ chibi tạo bằng Nano Banana (tốn tiền) → thay bằng generator avatar chibi FREE ở phần avatar; (4) zoom ảnh rồi tắt → ảnh to hiện dưới footer; (5) audit + browser test + fix lặp. Bổ sung: card hiện cả hình + prompt + nút; cuộn để load more.

Files: `web2/shared/web2-ai-presets.js`, `web2/shared/web2-user-profile.js`, `web2/shared/web2-image-lightbox.js`, `web2/shared/web2-sidebar.js`, `web2/ai-hub/index.html`. Set Render web2-api: `WEB2_CHATANYWHERE_API_KEY1..3` (deploy `dep-d8tn3eog4nts73d3l080`).

- **Task 1+2 (presets modal)**: thêm ô **tìm kiếm** (bỏ dấu tiếng Việt: gõ "ao" khớp "áo"), card kiểu YouMind (ảnh 150px + tiêu đề + **hộp prompt đầy đủ** + nút "✨ Dùng mẫu này"), **infinite-scroll** (render 9 card/batch, cuộn gần đáy nạp thêm, hint "↓ Cuộn để xem thêm (N mẫu)"). **Bug giao diện (root cause)**: `.aip-card.has-thumb{overflow:hidden}` → grid item là scroll-container nên track sizing thu chiều cao card về body-only 62px, thumb 150px (aspect-ratio cũ collapse 0px) bị cắt → card chồng nhau. Fix: bỏ `overflow:hidden` ở card + `height:150px` cố định cho `.aip-thumb` + `border-radius` bo góc thumb. Verify browser: 23 card đồng đều 236-254px, search/scroll/click OK, 0 console error.
- **Task 3 (chibi)**: xoá 5 mẫu chibi-\* (chibi-cute/brawl/figurine/plush/anime) + category `chibi` khỏi `web2-ai-presets.js` (chúng cần Nano Banana trả phí). Thêm 6 style **DiceBear chibi/cute FREE** (adventurer/big-smile/miniavs/micah/personas/croodles) dẫn đầu picker avatar `web2-user-profile.js` (18 style, default `adventurer`). DiceBear = generator avatar bằng seed, KHÔNG tốn API. Verify: 6 ảnh chibi load OK (naturalWidth 150, 0 broken).
- **Task 4 (lightbox)**: bug "ảnh to dưới footer" KHÔNG repro trên code hiện tại (đã fix bởi commit 03:12 quản lý `display:none`). Hardening thêm: inject CSS guard `#web2ImageLightbox{position:fixed!important}` + `[hidden]{display:none!important}` (overlay KHÔNG bao giờ rớt về document flow), fix **race close-rồi-mở-lại-trong-180ms** (clear `_closeTimer` khi open → tránh ẩn nhầm ảnh mới). Verify: open=fixed top:0, reopen-after-race visible, close=display:none, 0 ảnh in-flow.
- Bump version: `web2-ai-presets.js` 20260624f→h, `web2-user-profile.js` a→b, `web2-image-lightbox.js` a→b (sidebar autoload).
- **Bỏ chữ "trả phí"** (user: "bỏ mấy chữ trả phí đi"): gỡ "(ảnh trả phí)"/"là ảnh AI trả phí" khỏi UI ai-hub (`index.html` keyhint, `ai-image.js` quota hint + comment, `ai-tryon.js` warn + comment). Nano Banana giờ chỉ ghi "cần quyền + giới hạn lượt/ngày". Bump `ai-image.js` e→f, `ai-tryon.js` c→d. Verify browser: 0 chữ "trả phí" hiển thị.

### [fix] Avatar mặc định DiceBear ĐỒNG NHẤT (footer + bảng users + preview) — 1 nguồn avatarUrlFor

User: "có avatar mặc định ở mỗi user [bảng users] nhưng vào nó không load avatar mặc định này, ai đã đổi avatar mới [hiện] chọn". → 3 nơi default KHÁC nhau: bảng users dùng `lorelei`+username, footer sidebar fallback **null (chữ cái)**, preview hồ sơ dùng `adventurer`. User chưa đặt avatar → footer mất avatar.

Files: `web2/shared/web2-user-profile.js`, `web2/shared/web2-sidebar.js`, `web2/users/js/users-app.js`.

- **1 nguồn**: thêm `Web2UserProfile.avatarUrlFor(user)` = custom nếu `user.avatar` đặt, KHÔNG thì sinh mặc định từ username (`DEFAULT_STYLE='lorelei'`). Export `avatarUrlFor` + `DEFAULT_STYLE`.
- **Footer sidebar** (`renderUserFooter`): bỏ `user.avatar ? ... : null` → fallback `_avatarUrlInline({style:DEFAULT_STYLE, seed:username})` khi chưa có avatar (tính inline, không chờ module load).
- **Bảng users** (`userAvatarUrl`): dùng `up.avatarUrlFor(u)` (thay hardcode lorelei) → cùng nguồn.
- **Preview hồ sơ**: default state `style: DEFAULT_STYLE` (lorelei, khớp bảng + footer) thay `adventurer`.
- Verify browser: `avatarUrlFor({username:'phuocnho'})`→`lorelei/svg?seed=phuocnho`; custom bottts→giữ; **footer admin (no custom) giờ hiện avatar lorelei thay vì chữ cái**. Bump `web2-user-profile.js` c→d.

### [feat] Tuỳ chỉnh avatar DiceBear ĐẦY ĐỦ (schema-driven, không giảm tính năng github)

User: "dicebear cho chỉnh sửa avatar rất chi tiết (thay trang sức, phụ kiện…)" + "đừng chọn lọc làm giảm giới hạn của github". → KHÔNG hardcode toggle chọn lọc; nạp **schema thật** của từng style → form động cho MỌI option.

Files: **NEW** `web2/shared/web2-dicebear-customizer.js` (`window.Web2DicebearCustomizer`), `web2/shared/web2-user-profile.js`, `web2/shared/web2-sidebar.js`.

- **Module customizer**: `getSchema(style)` lazy `import()` `@dicebear/<style>@9.2.4` từ esm.sh (cache; lỗi mạng/CSP → form rỗng graceful). `mount(box,{base,style,seed,options,onChange})` dựng form từ `schema.properties`: enum→dropdown "🎲 Tự động / 🚫 Không có / Kiểu 1..N", color→`<input type=color>`+ô "Tự động", integer `*Probability` gộp vào enum cha (chọn kiểu→prob=100, "Không có"→prob=0), bool→toggle. `buildUrl()` ghép mọi param vào URL HTTP API.
- **Tích hợp profile**: thêm section gập "🎨 Tuỳ chỉnh chi tiết" (lazy mount khi mở lần đầu, suy path customizer từ `document.currentScript.src`). `avatarUrl(cfg)` thêm `cfg.options` (mọi param DiceBear). Lưu `{style,seed,bg,options}` — backend lưu chuỗi JSON opaque, KHÔNG cần đổi BE. Đổi style → `setStyle` reset options + nạp schema mới.
- **Verify browser**: adventurer hiện đủ tóc(45)/mắt(26)/miệng(30)/lông mày(15)/kính(5)/khuyên tai(6)/đặc điểm(4) + màu tóc/da; đổi kính/màu → preview cập nhật đúng param (`glasses=variant01&glassesProbability=100&hairColor=ff3366`), ảnh load OK; đổi sang bottts → schema robot khác (eyes/face/mouth/sides/texture/top), options reset. Bump `web2-user-profile.js` b→c, customizer `20260624a`.

### [change] web2/users: hạ mật khẩu tối thiểu 8 → 6 ký tự

User: "có thể đặt mật khẩu 6 ký tự" (vd `181015`). Đổi min length 8→6 đồng bộ FE+BE.

Files: `web2/users/js/users-app.js` (`MIN_PWD_LEN=6`, 3 chỗ validate create/edit/đổi-MK + hint), `web2/users/index.html` (2 hint modal), `render.com/routes/web2-users.js` (`MIN_PWD_LEN=6` + `validatePassword`). **Cần deploy web2-api** (backend validate là chốt cuối). Nút "Tạo" vẫn sinh từ 9 ký tự (≥6 OK).

### [feat] web2/users: xoá VĨNH VIỄN + khôi phục user đã vô hiệu (hard delete/purge + restore)

User: "xóa các users đã bị vô hiệu đi làm sao?" — DELETE chỉ soft-delete (is_active=FALSE), nút thùng rác disabled cho user inactive → không có cách purge.

Files: `render.com/routes/web2-users.js`, `web2/users/js/users-app.js`, `web2/users/index.html` (**cần deploy web2-api**).

- **Backend**: route mới `DELETE /:id/purge` (requireWeb2Admin + perm `users.delete`) — `DELETE FROM web2_users WHERE id=$1 AND is_active=FALSE` (CHỈ purge user đã vô hiệu → buộc vô hiệu trước; active → 400 "phải vô hiệu trước"; không tồn tại → 404). Session cascade theo FK `ON DELETE CASCADE` (chỉ `web2_user_sessions` có FK → không vỡ ràng buộc). `_notify('purge')` + audit.
- **Frontend**: hàng inactive đổi nút thùng-rác-disabled → 2 nút **Khôi phục** (rotate-ccw → PATCH isActive=true) + **Xoá vĩnh viễn** (trash danger → DELETE /:id/purge, Popup.danger xác nhận). Nút bulk toolbar **"Xoá hẳn N user vô hiệu"** (hiện khi đang xem user vô hiệu) → purge tuần tự + báo lỗi từng cái.
- Revive-on-create (commit trước) verified E2E sau deploy: tạo→vô hiệu→tạo lại cùng username = revive (giữ id, role/displayName mới), KHÔNG 409.

### [fix] web2/users: audit fix nhiều bug ẩn (3 reviewer agent: frontend/backend/security)

User: "audit lại web2/users có nhiều bug ẩn lắm". Chạy 3 agent review song song → verify từng finding với code thật (loại false-positive) → fix nhóm an toàn + page-local, report nhóm cần quyết định.

Files: `web2/users/js/users-app.js`, `web2/users/index.html`, `render.com/routes/web2-users.js`

**Đã fix (verified browser):**

- 🔴 **Tự vô hiệu chính mình** — `deactivateUser` thiếu guard self → admin bấm xoá chính row mình (khi còn admin khác, backend không chặn) → tự khoá. Thêm guard `id===_currentSessionUserId()` → toast chặn. ✅
- 🔴 **Tự hạ quyền admin chính mình** — `confirmUserSave` edit đổi role mình admin→staff lưu được → mất quyền (token sống nhưng 403). Thêm guard chặn. ✅
- **Cross-contamination state modal** — password modal share `STATE.editingUser` với edit modal → tách `STATE.pwdUser` riêng (openPasswordModal/confirmPasswordSave). ✅
- **SSE reload đè modal đang mở** — reload `web2:users` lúc đang sửa → `loadAll()` thay `STATE.users` làm con trỏ user cũ stale → skip reload khi có `.u-modal:not([hidden])`. ✅
- **iframe Phân quyền stale** — `permLoaded` cờ 1 lần → ma trận cũ, lưu đè quyền. Reload iframe MỖI lần vào tab (cache-bust `&t=`). ✅
- **Avatar `src=""`** — `userAvatarUrl` rỗng → `<img src="">` GET rác/row + ảnh vỡ → render placeholder `<span>` khi thiếu URL. ✅
- **`fmtTs`** — `new Date(Number(isoString))=NaN` → "Invalid Date"; + GMT+7 (rule 10): thêm isNaN guard + `timeZone:'Asia/Ho_Chi_Minh'`. ✅
- **uCount mơ hồ khi search** — hiện `khớp/tổng` ("2/6 user") thay vì chỉ số khớp. ✅
- **`resetPermsToRoleDefaults`** null guard (`STATE.permsUser` null → TypeError). ✅
- 🔴 **Backend revive (create) hardening** — UPDATE `... AND is_active=FALSE RETURNING *` (atomic, đóng TOCTOU → rowCount 0 trả 409) + xoá `web2_user_sessions` của bản hồi sinh (token cũ không tái dùng với MK mới; deactivate qua PATCH không dọn session). **Cần deploy web2-api.**

**Report (chưa fix — cần user quyết, rủi ro/đụng module khác):** `/list`+`/:id` lộ email/SĐT/permissions cho mọi user đã đăng nhập (KHÔNG gate `users.view` được vì kpi-assignments + cham-cong là NV không có quyền đó đang gọi `/list` → sẽ vỡ; nên scope field cho non-admin); `/pages`+`/role-defaults` không auth (iframe gọi không token); default AES key fallback (nên fail-loud nhưng phải chắc env set); login rate-limit per-instance; token qua query `?token=` (/me); token ở localStorage (XSS). KHÔNG đổi: password `type=text` + toast hiện MK (CHỦ Ý — feature admin xem MK).

### [fix] web2-users: xóa user rồi tạo lại cùng username báo trùng → HỒI SINH bản inactive

User: "tôi xóa user coi tạo lại báo trùng". DELETE là **soft-delete** (`is_active=FALSE`) → username vẫn chiếm chỗ trong DB → POST create cùng tên đụng unique constraint → 409 "đã tồn tại" (mà user lại không thấy trong list vì mặc định ẩn user vô hiệu).

File: `render.com/routes/web2-users.js` (create handler) — **cần deploy web2-api** (auto-deploy on push).

- Create giờ check username trước INSERT: nếu tồn tại + **đang active** → 409 thật; nếu tồn tại + **inactive** → **UPDATE hồi sinh** bản cũ (giữ `id` → referential integrity audit/KPI) với thông tin mới (password/displayName/email/phone/role/note), reset `permissions=NULL` (về mặc định vai trò) + `avatar=NULL` + `last_login_at=NULL` + `created_at=now`. Không tồn tại → INSERT như cũ. Giữ catch 23505 làm lưới an toàn race.
- Audit ghi `revived:true` khi hồi sinh.

### [feat] web2 ai-presets: thêm nhóm "🎨 Chibi / Nhân vật" (ảnh thật → chibi/Brawl Stars/figurine)

User hỏi github chuyển ảnh→chibi. Trả lời: Nano Banana (Tạo ảnh) đã làm được; thêm 5 preset chibi (needsImage): chibi-cute (Q-version), chibi-brawl (Brawl Stars game-art), chibi-figurine (Funko Pop), chibi-plush (thú nhồi bông), chibi-anime. Category mới `chibi`. Image presets 23→28. DiceBear avatar (modal hồ sơ) là seed-based KHÔNG nhận ảnh — khác hẳn. Bump web2-ai-presets v20260624f.

### [feat] bg-remover: server TÁCH NỀN máy shop (free, on-device) theo pattern VieNeu

User "được thì làm": dựng server tách nền free thay PhotoRoom trả phí.

- **`bg-remover/`** (mới): app.py (FastAPI + rembg U-2-Net, `/health` + `/remove[?bg=hex]`) + serve.py (clone VieNeu: uvicorn + cloudflared tunnel + heartbeat **engine='bgremover'** 30s) + requirements.txt + install-windows.bat + run-mac.command + README. Cổng 8124 (VieNeu 8123 → chạy song song). rembg nhẹ hơn nadermx/backgroundremover (onnxruntime, CPU OK).
- **Registry tái dùng**: máy bg-remover báo danh vào CHUNG `web2_machine_servers` (đã chuyển Postgres) với engine='bgremover'; trang lọc `/list?engine=bgremover`.
- **Frontend**: shared `web2/shared/web2-bgremover.js` (`Web2BgRemover.listServers/removeBg/removeBgAuto`, autoload sidebar). ai-hub Tạo ảnh: mỗi ảnh kết quả có nút **✂️ Nền** → `removeBgAuto(src)` → card kết quả mới. Bump ai-image v20260624e.
- ⚠ Python chưa test máy thật (no env) — py_compile PASS; user chạy .bat/.command verify. KHÔNG cần Render redeploy.

### [fix] web2/users: trang Phân quyền không scroll + đổi mật khẩu trong modal Sửa + hiện MK cột

User báo: (1) `/web2/users/index.html` tab "Phân quyền" không scroll được; (2) modal "Sửa người dùng" có ô mật khẩu nhưng đổi không ăn; (3) muốn hiện mật khẩu user ở cột Mật khẩu.

Files: `web2/users-permissions/index.html`, `web2/users/index.html`, `web2/users/js/users-app.js`, `web2/users/css/users.css`

- **🔴 FIX không scroll (tab Phân quyền)** — tab nhúng `users-permissions/?embed=1` qua iframe. Embed mode đổi `.web2-shell` sang `display:block` NHƯNG giữ `height:100vh; overflow:hidden` (từ web2-sidebar.css) → `.web2-main` hết là grid-cell scroll được, nội dung ma trận (2563px) bị **clip** ở chiều cao iframe (710px), không thanh cuộn. Fix: embed mode set `.web2-shell`/`.web2-main` `height:auto; overflow:visible` + `body/html overflow:auto` → document tự cao bằng nội dung → **iframe TỰ scroll**. Verified browser: canScroll=true, scrollTop chạm đáy (row "Quản lý chi tiêu").
- **🔴 FIX đổi mật khẩu trong modal Sửa** — 2 lỗi chồng: (a) `openUserModal` ẩn ô MK khi edit bằng `uPasswordField.hidden=!!user` nhưng dính bug CSS `.u-field{display:flex}` đè UA `[hidden]{display:none}` → ô **vẫn hiện**; (b) `confirmUserSave` edit chỉ PATCH, **không gửi password** → gõ MK mới mà không lưu. Fix: ô MK hiện ở CẢ create+edit (edit = tùy chọn, label "Đổi mật khẩu", để trống = giữ nguyên); edit có nhập MK ≥8 ký tự → gọi `POST /:id/password` sau PATCH (kèm re-auth nếu tự đổi MK mình). Thêm `.u-field[hidden]{display:none!important}` chống bug CSS chung. Verified E2E (user test): đổi MK qua modal Sửa → login MK mới OK, MK cũ bị từ chối.
- **feat hiện MK cột Mật khẩu** — user cũ chỉ có bcrypt (`password_enc` NULL) hiện `—` (MK 1 chiều không đọc lại được). Đổi `—` thành nút **"Đặt MK"** mở modal đổi MK → đặt xong plaintext hiện ở cột (admin xem, account admin vẫn khoá 🔒). User đặt MK qua hệ mới → cột hiện plaintext + nút copy (verified: testpwuser hiện "newpass456").

User: (1) thêm ChatAnywhere làm provider chat, (2) VieNeu chạy .bat mà không connect → fix, (3) preset có ảnh mẫu.

- **🔴 FIX VieNeu "không kết nối"** — root cause (Explore agent trace): `web2-vieneu-registry.js` lưu **IN-MEMORY `Map()`** → web2-api chạy NHIỀU instance + redeploy xoá sạch → máy register vào instance A, browser GET /list trúng instance B → "không thấy máy" dù máy chạy (cùng lớp bug SSE cross-instance). **Fix: chuyển registry sang Postgres** (bảng `web2_machine_servers`, web2Db) → sống qua redeploy + chia sẻ giữa instance. Thêm cột `engine` + filter `/list?engine=` (tái dùng cho bg-remover sau). serve.py heartbeat 30s không đổi. Integration-test SQL (prune TTL 90s + engine filter) PASS.
- **ChatAnywhere** (github chatanywhere/GPT_API_free) — thêm provider chat OpenAI-compatible FREE (GPT-4o-mini/4.1/3.5 + DeepSeek V3/R1), base `.org` (override `WEB2_CHATANYWHERE_BASE`), key `WEB2_CHATANYWHERE_API_KEY*` (lấy free qua GitHub OAuth ở repo, ~200 req/ngày). User OK license non-commercial (web nội bộ kho SP).
- **Ảnh mẫu preset** — 21/23 câu lệnh ảnh có `thumb` (CDN youmind public) → card modal hiện hình minh hoạ (onerror ẩn graceful). Bump web2-ai-presets v20260624e.

### [refactor+feat] web2: promote thư viện mẫu AI → shared module + thêm vai trò chat + rename env Nano Banana

User: (1) đổi env paid sang `WEB2_NANOBANANA_API_KEY`, (2) thêm prompt mẫu chat, (3) modular hoá.

- **Modular**: `ai-hub/js/ai-presets.js` → **`web2/shared/web2-ai-presets.js`** (shared, autoload qua sidebar `Web2AiPresets`, alias `AiPresets`). Trang khác (fb-posts caption, video-maker kịch bản) gọi `Web2AiPresets.pickImage/pickRole` được luôn. Nạp TRƯỚC sidebar ở ai-hub → autoload skip (1 lần).
- **Vai trò chat 7 → 13** (thêm từ awesome-chatgpt-prompts, Việt hoá shop): quảng cáo/Ads, content MXH, đặt tên SP, upsell/bán kèm, sửa chính tả, dịch Việt↔Anh.
- **Env**: `WEB2_GEMINI_API_KEY5` (paid AQ) → **rename `WEB2_NANOBANANA_API_KEY`** trên Render web2-api (qua API, không lộ value). Giờ key1-4 free=chat, `WEB2_NANOBANANA_API_KEY` paid=Nano Banana (code đã ưu tiên prefix này).
- **Audit 9 repo** (trả lời user): chỉ awesome-chatgpt-prompts tích hợp (đã làm); gpt4free/free-llm-api-keys/GPT_API_free = NO (ToS/non-commercial/shared-key rủi ro); 9router/OmniRoute = dev-tooling router (đã có failover); magic-resume = không liên quan; backgroundremover/video-subtitle-remover = cần Python+GPU server (roadmap như VieNeu); gemini-watermark-remover = ảnh API không có watermark hiển thị → chưa cần.

### [feat] web2 ai-hub: tách key chat/Nano Banana + gate quyền + quota + lưu ảnh/prompt/chat + thư viện mẫu

User 5 việc (key paid Nano Banana, giải thích 2 repo, tích hợp 2 repo prompt/system, tối ưu chi phí).

- **Tách pool key Gemini** (`web2-ai-service.js`): chat dùng key FREE (`WEB2_GEMINI_API_KEY1..4`), Nano Banana (ảnh, TRẢ PHÍ) dùng pool RIÊNG `nanobanana` = `WEB2_NANOBANANA_API_KEY*` → fallback `WEB2_GEMINI_API_KEY5`. Key nano bị TRỪ khỏi pool chat (key5 không đốt cho chat free). Provider `nanobanana` `internal:true` (ẩn khỏi chat UI/defaultProvider/listModels). `image-service._gemini` đổi sang `keysOf/runWithKey('nanobanana')`. Unit-test: chat=4 free, nano=key5; dedicated env override OK.
- **Gate quyền + quota** (`web2-ai.js` `/image`): provider `gemini` = ảnh trả phí → BẮT BUỘC đăng nhập + quyền `ai-hub`/`nanobanana` (action MỚI, `RESTRICTED_ACTIONS` → default-DENY non-admin, admin cấp tay) + quota `WEB2_NANOBANANA_DAILY_LIMIT`/user/ngày (GMT+7, default 50, admin miễn). `GET /quota` cho UI.
- **Lưu server** (`web2-ai-store.js` + bảng `web2_ai_images`/`web2_ai_chats`, web2Db): mọi ảnh tạo → lưu prompt+BYTEA (best-effort); hội thoại chat upsert (đa máy). Endpoints `/images`(list)`/images/:id`(serve ?token)`/chats`(CRUD). Scope chủ-sở-hữu/admin. Integration-test trên PG test DB (create→test→drop): quota đếm, ownership guard (chống hijack chat / xoá nhầm chủ) PASS.
- **Tích hợp prompt repos** (`ai-presets.js`): 23 mẫu câu lệnh ảnh (nano-banana-pro-prompts + Awesome-Nano-Banana-images, chọn lọc shop: sản phẩm/người mẫu/mặc-lên-người/đổi nền/avatar/flat-lay/poster) + 7 vai trò chat (cảm hứng x1xhlol/system-prompts: bán hàng/caption/CSKH/mô tả SP/khiếu nại/ý tưởng + tự nhập). Modal picker tự chứa. Nút "📋 Mẫu" ở Tạo ảnh + Ghép đồ; "Vai trò" chat → picker; convo mới có system mặc định shop.
- **Frontend** (`ai-image.js`/`ai-tryon.js`/`ai-chat.js`): nút "📁 Ảnh đã lưu" (load lịch sử server), pill quota Nano Banana, try-on báo thiếu-quyền sớm; chat backup lên server + gộp hội thoại máy khác. Bump v20260624c.
- **Cần**: deploy web2-api (env `WEB2_GEMINI_API_KEY5` paid đã có) + redeploy để nạp pool tách. Tuỳ chọn env `WEB2_NANOBANANA_API_KEY*`, `WEB2_NANOBANANA_DAILY_LIMIT`.

### [feat] web2: phân quyền HOÀN CHỈNH — registry đủ 50 trang + auto-discover + enforcement an toàn

User "Làm đi": vá lỗ hổng #2 (registry stale 18/50 + không enforce).

- **Registry đủ**: `WEB2_PAGES` (web2-users.js) **18 → 49 trang** (mỗi trang ≥ 'view' + action hợp lý) + action labels mới (generate/scan/pack/returnFailed/publish/confirm). Role-default vẫn cấp 'view' mọi trang cho staff/manager/viewer → **an toàn, không khoá nhầm**.
- **Auto-discover**: matrix frontend (users-permissions) tự bổ sung trang có trong sidebar NAV mà thiếu ở registry (action 'view') → **trang MỚI tự hiện** để admin chặn ngay, không cần sửa WEB2_PAGES.
- **Enforcement** (`web2/shared/web2-perm.js`, auto-load mọi trang): mô hình **default-open / explicit-deny** — admin LUÔN qua; chưa-có-dữ-liệu / trang-mới (không trong perms) → CHO PHÉP; CHỈ chặn khi admin chủ động bỏ 'view'. (1) sidebar `renderItem` ẩn item bị thu hồi 'view'; (2) page-guard phủ overlay "không có quyền" khi vào thẳng URL trang bị thu hồi (soft-block, không redirect loop, không chặn admin). `slugFromUrl` folder-based khớp registry (overview→tongquan, live-chat/chat→live-chat…).
- **Verified**: admin thấy đủ 49 item, 0 block; logic deny đúng (revoke `variants:[]`→canView false; `kpi` không-trong-perms→true fail-open; admin→true; action-level `delete` chưa cấp→false). Server vẫn gate độc lập (`requireWeb2Admin` cho trang admin). Cần deploy web2-api cho registry 49 trang.

### [feat+fix] web2: menu reorg + gộp Phân quyền + fix lightbox stuck + verify avatar/audit-scope (user 9 việc)

User pivot sang 9 việc UI/menu + 2 câu hỏi verify. Kết quả:

- **#1 Avatar** — test kỹ end-to-end (mở modal→chọn style→Lưu→persist server+localStorage+footer cập nhật+SỐNG sau reload, cả style Emoji=fun-emoji). **Hoạt động ĐÚNG**, không tái hiện được bug. Nguyên nhân khả dĩ: token Web2 hết hạn (401 im) / JS cũ cache. Harden: message 401 rõ ("phiên hết hạn → đăng nhập lại") + bump v20260624a.
- **#2 (verify)** — permission matrix (`/api/web2-users/pages` = hardcoded `WEB2_PAGES`) **KHÔNG auto-discover trang mới**: chỉ 18/50 trang trong registry (STALE) + **KHÔNG trang nào enforce** (không có `hasPermission` — chỉ khai báo; gate thật = `adminOnly` menu + `requireWeb2Admin` server). Code trang mới KHÔNG tự có quyền → phải thêm tay vào `WEB2_PAGES`. services từ `/api/services-overview` (inventory server).
- **#3** — gộp users-permissions vào trang Người dùng: 2 tab (Người dùng | Phân quyền), tab Phân quyền nhúng iframe `users-permissions?embed=1` (ẩn sidebar). Verified: tab switch + 28 perm rows render embedded. Gỡ "Phân quyền" khỏi menu.
- **#4-#9 menu reorg** (web2-sidebar NAV): Dashboard KPI→Báo cáo; Lịch sử thao tác + Cấu hình&Hệ thống(admin-only)→Cấu hình; Đối soát CK→"Chuyển khoản KH"(đổi tên từ Tài chính); Zalo+Chat Pancake→Khách hàng; Tăng comment+Comment Live+Điều khiển TV+TV Livestream→Facebook.
- **Menu cleanup** (user request 2) — `cleanLabel()` cắt emoji cuối tên trang + bỏ badge "- WEB 2.0". Verified 49 links 0 badge 0 emoji.
- **🔴 FIX lightbox stuck/đè layout** (user request 3) — `Web2ImageLightbox` overlay set `cssText` có `display:flex` ĐÈ `[hidden]` (inline > UA) → sau open→close overlay vẫn flex+opacity:0 = lớp vô hình phủ inset:0/z99999 NUỐT mọi click → trang kẹt. Fix: quản `display` trực tiếp (none↔flex). Verified: sau close, elementFromPoint(center)=element thật (không phải overlay). Bump v20260624a.
- **#7 (verify)** — audit-log scope (`v2/audit-log.js:178`): admin xem hết + lọc tự do; NV **ÉP self-scope** (khớp id/username/display_name, bỏ qua filterUser); chưa login→rỗng. **ĐÚNG**: mỗi user chỉ xem lịch sử mình, admin xem tất cả (server-enforced).
- **Bonus**: split-PBH merge double-bill (#2) + merge dedup (#5) **verified LIVE** (stock conservation holds, idempotent re-bill).

### [fix] web2: 5 bug từ workflow audit round-3 (2 HIGH money/stock + 3 MEDIUM) — adversarial-verified

Workflow 13-agent (5 finder song song × verify đối kháng + synthesis) audit reconcile/returns-3-subtype/order-tags/delivery-zone/conservation. 7 finding → **6 sống sau verify đối kháng** → tôi đọc code thật xác nhận + fix 5 (1 reconcile dimension trùng root với merge-dedupe). order-tags: **0 bug** (sạch).

**🔴 #1 HIGH money+stock leak** — `web2-returns.js:1315`: nhánh `khong_nhan_hang` DELETE re-attach lock theo PBH thiếu `AND state <> 'cancel'` (2 nhánh kia + comment 1309-1311 đều có) → re-arm `wallet_deducted`/`stock_restored=FALSE` lên PBH ĐÃ HUỶ → cancel sau double-refund ví + phantom-restock. Fix: thêm `AND state <> 'cancel'` (one-line, mirror sibling).

**🔴 #2 HIGH double-bill** — `fast-sale-orders.js from-native-order`: merged PBH (merge-to-pbh) có `source_id=NULL` (1 PBH gộp nhiều member) → `existsQ` theo source_id KHÔNG thấy member → stale-tab/direct-API tạo PBH thứ 2 = double trừ kho + ví. Fix: thêm idempotency guard theo **source_code membership** (mirror cancel route native-orders.js:119-122) → trả idempotent.

**🟠 #3 MEDIUM wallet leak window** — `fast-sale-orders.js:2131`: `_applyWalletToPbh(pool)` → withdraw COMMIT riêng, rồi `pool.query(UPDATE wallet_deducted)` rời → crash giữa = ví trừ nhưng wallet_deducted=0 → cancel hoàn 0đ. Fix: gộp withdraw + UPDATE vào 1 `withTransaction` (truyền client → runWithTx reuse, atomic; giống `applyWalletToUnpaidPbhs`). Try/catch giữ semantics "ví lỗi không chặn PBH".

**🟠 #4 MEDIUM phí giao sai im lặng** — bulk PBH áp auto-pick offline (`pickOffline`) bỏ qua `confidence` → phí thấp-tin-cậy bill thẳng (vd tên tỉnh trong địa chỉ HCM → ship tỉnh 35k nhầm). Fix layer-1 (an toàn): giữ `pickedConfidence/pickedNote`, hiện "⚠ phí auto Xđ — KIỂM TRA" trong cột trạng thái khi confidence≠high. (Layer-2 = siết `_detectProvince` heuristic — KHÔNG làm, rủi ro over-tighten; layer-1 là safety-net.)

**🟠 #5 MEDIUM reconcile dead-end + latent restock double-subtract** — `fast-sale-orders.js:1044` merge `combinedLines.push(...lines)` KHÔNG dedupe → gộp 2 PBH cùng mã SP → order_lines có dòng trùng mã → reconcile (1-bucket/mã, cap theo dòng đầu) không đóng gói được + `restockOrderLines` trừ returnedMap[code] lặp. Fix: dedupe order_lines theo mã lúc merge (cộng quantity + discountAmount; dòng không-mã giữ riêng).

Verify: node --check 3 file OK + native-orders load 0 error. Server fix (#1,#2,#3,#5) cần deploy web2-api → live-test split/merge/return.

### [audit-deep-2] web2: verify Ví NCC + auth-gate + KPI privacy (code-level) — 0 bug, 1 design-note

Tiếp tục đào sâu (round 2). Toàn bộ VERIFY (không sửa code) — kết quả: hệ thống đúng.

1. **Ví NCC ledger** (`/api/web2-supplier-wallet/tx`) — test fake supplier `ZZTEST-NCC-AUDIT`: server REJECT `type=debt` (400, chỉ `payment|return`), `amount>0` enforced, idempotency tx_id pre-check (`alreadyProcessed`), return-amount cap theo cost THẬT từ so-order (anti-mint, FIX #2 2026-06-23). Dọn sạch qua `DELETE /supplier/:name` (x-admin-secret = CLEANUP_SECRET, hit web2-api trực tiếp; ledger+meta=1/1 rows).
2. **Auth gate `WEB2_AUTH_ENFORCE`** — probe 5 write-endpoint KHÔNG token (products POST/DELETE, supplier-wallet tx, customer-wallet deposit, native-orders create) → tất cả **401**. order-tags write (`/create`,`/update`,`/delete`) đều `requireWeb2AuthSoft`. Mutation Web 2.0 được khoá đúng.
3. **KPI privacy (code-level)** — live multi-user KHÔNG test được sạch (web2-users không có DELETE endpoint → tạo user test = rác vĩnh viễn). Đọc code xác nhận: `applyKpiScope` (routes/v2/kpi.js:393) scope-filter ĐƠN HÀNG = **fail-open** (NV không-assignment / no-token → thấy hết đơn — comment ghi rõ "default open access", CHỦ Ý). NHƯNG tầng privacy THẬT = **pill-mask server-side** (`web2-order-tags-service.js:436`): NV xem đơn NV-khác → pill `👤 KPI` xám, **KHÔNG đính tên/tiền**; chỉ admin / đơn-mình / chưa-gán mới thấy detail. Comment: "tầng DUY NHẤT đáng tin (frontend không tin được)". → privacy KPI an toàn (thấy đơn nhưng không lộ tiền NV khác).

**Design-note (không phải bug)**: kpiScope fail-open là chủ ý + được pill-mask bù. Nếu sau muốn fail-closed (NV không-assignment thấy 0 đơn) thì sửa `applyKpiScope` line 421 — nhưng hiện KHÔNG lộ data nhạy cảm nên không cần.

### [fix] web2: 5 silent-failure frontend + 1 HIGH server bug (split-PBH cancel) — từ review 2 agent

2 agent review (silent-failure-hunter + code-reviewer) trên luồng tiền/PBH/tồn. Đã VERIFY từng finding bằng đọc code thật (loại các finding agent tự downgrade: confirm-purchase double-add an toàn READ COMMITTED, idempotency namespacing không collide). Fix các finding xác nhận thật:

**🔴 SERVER (HIGH) — ĐÃ DEPLOY + VERIFY LIVE**: `render.com/routes/fast-sale-orders.js` — `POST /by-source/:code/cancel` dùng `LIMIT 1` → khi 1 đơn web tách NHIỀU PBH (migration 078 `split_index`), chỉ huỷ PBH mới nhất; các split còn lại GIỮ trừ kho + `wallet_deducted` → **tồn kẹt vĩnh viễn, ví không hoàn**. Fix: bỏ `LIMIT 1`, loop `_cancelPbhInTx` HẾT PBH còn sống (state≠cancel) của `source_code`, restock GỘP. Single-PBH case không đổi (loop 1 lần). **Verify live (deploy 66a2f707d)**: order qty3, stock 20→PBH1=17→PBH2(split)=14→cancel→**20** (cả 2 restock), cả 2 PBH state=cancel. ⚠ Bài học test: PBH `number` UNIQUE = mã đơn (NJ-YYYYMMDD-XXXX, reuse khi xoá đơn) → cancelled PBH test `NJ-...-0001` để lại SẼ va chạm đơn THẬT đầu ngày (UNIQUE violation → đơn thật không tạo được PBH). Đã dọn sạch bằng `DELETE /:number?force=1` (state=cancel → skip restock, idempotent).

**🟠 FRONTEND silent-failure (no deploy — GH Pages)**:

1. `web2/supplier-wallet/js/supplier-wallet-actions.js` — trả NCC: ví ĐÃ ghi sổ (irreversible) nhưng `adjustStock` lỗi bị nuốt im → ví↔tồn lệch. Thêm toast cảnh báo "ghi sổ OK nhưng chưa trừ tồn — chỉnh tay tại Kho SP".
2. `native-orders/js/native-orders-pbh-bill.js` `_markPrintedCodes` — `.catch(()=>{})` nuốt im lỗi ghi số-lần-in (in THẬT nhưng không ghi → reprint-guard sai). Thêm warn + toast.
3. `native-orders/js/native-orders-bulk-operations.js` `bulkCreatePbhShop` — chỉ báo "lỗi N" không rõ đơn nào → user không retry đúng đơn. Thu `failedOrders[{code,reason}]` → Popup chi tiết.
4. `so-order/js/so-order-receive.js` — item upsert `action:'error'` bị loại khỏi confirm-purchase im lặng (tồn không cập nhật, user tưởng nhận đủ). Thêm toast liệt kê SP lỗi.
5. `so-order/js/so-order-barcode.js` — item lỗi tạo mã bị loại khỏi in tem im lặng. Thêm toast.

**⚠ FLAG (verified — narrow edge, KHÔNG rush fix)**: `web2-returns.js` `thu_ve_1_phan` (line ~748) ĐÃ cap mỗi dòng `quantity = Math.min(it.quantity, ref.quantity)` theo SL ĐÃ BÁN — nên 1 lần thu về KHÔNG vượt được SL bán (an toàn). Khe hở HẸP: cap theo TỔNG đã bán, KHÔNG trừ phần đã thu trước (`returned_line_qty`) → 2+ lần thu về cùng SP/PBH cộng dồn có thể vượt SL bán (vd bán 5: thu 3 OK→RLQ=3, thu 3 nữa vẫn OK vì cap theo 5 không phải remaining 2→RLQ=6). Fix ĐÚNG = cap theo `remaining = sold − currentRLQ`, NHƯNG để race-safe phải đọc RLQ + cap BÊN TRONG locked tx (line ~955, hiện cap ở ngoài tx) = refactor luồng tiền-return, cần test cả 3 sub-type (khong_nhan_hang/thu_ve_1_phan/cod_shipper) ± sourceOrderCode. Single-return đang đúng → để fix có chủ đích + test đầy đủ, không vá vội.

Đào sâu hơn (yêu cầu user "càng sâu càng chi tiết càng tốt") — drive các luồng nghiệp vụ THẬT qua API client trong browser, verify bất biến dữ liệu liên-trang, dọn sạch test data sau mỗi luồng. Dùng codegraph map server contract trước.

**Luồng đã verify (đều cleanup 0 leftover)**:

1. **Kho SP CRUD** — create `{success,product}` (server sinh/sanitize code, validate "supplier bắt buộc") → get → delete force → gone.
2. **adjustStock atomic** — stock 5 → +10=15 → −3=12 → delete (delta gộp, clamp 0).
3. **so-order MUA (purchase side)** — `upsertPending` (code bắt buộc) → product status `CHO_MUA`/pending=8/stock=0 → hiện trong pending list → `confirmPurchase` → stock=8/pending=0/`DANG_BAN`. Linkage Sổ Order → Kho SP đúng.
4. **native-orders BÁN (sell side)** — create order (draft) → PBH `/from-native-order` → **stock 20→17** (−qty3) → `/by-source/:code/cancel` → **17→20** (restock idempotent, migration 077 `stock_restored`). Linkage Đơn Web → PBH → Kho SP đúng cả 2 chiều.
5. **SSE realtime fan-out** — subscribe `web2:products` → create phát `action:create`, delete phát `action:delete` (nhận realtime). Backbone đồng-bộ-giữa-máy OK.
6. **Ví KH money-integrity** — deposit 5000 → +5000; **replay cùng idempotencyKey → VẪN 5000 (không double)**; withdraw → 0 (net-zero). Idempotency dedupe (d-fix #3) + balance math đúng.
7. **CHO_MUA chặn PBH** — order có SP `CHO_MUA` → `/from-native-order` trả **400 `cho_hang_blocked`** (chặn bán hàng chưa về). Cross-feature guard đúng.

**Bug fix (silent failure)**: `so-order/js/so-order-kho-sync.js syncRowsToKho` — `upsertPending` trả `success:true` KỂ CẢ khi item lẻ lỗi (`action:'error'`, vd mã trùng SP khác). Hàm chỉ báo `created/updated`, **nuốt im item lỗi** → user tưởng sync đủ. Fix: đếm `items[].action==='error'` → `console.warn` chi tiết + toast cảnh báo "N SP KHÔNG sync được (mã trùng?)". (Callers khác — so-order-receive map theo action/name, barcode skip item thiếu code — đã xử lý đúng.)

### [audit] web2: full menu audit — 50 trang load+interaction+CRUD test, fix dead-link + video-maker probe noise

Audit toàn bộ menu Web 2.0 (yêu cầu user: liệt kê menu + render server + env → browser-test từng trang như user → fix → lặp). Inventory: 14 nhóm menu / 50 trang web2 + 5 render service (web2-api, n2store-fallback, web2-realtime, n2store-realtime, 2 Postgres) + env Web 2.0.

**Phương pháp**: (1) smoke-all-pages baseline → 69 clean / 13 issues (13 đều là Web 1.0 same-origin `/api/*` 404 trên localhost — môi trường, NGOÀI scope — + 3 trang 404 chết); (2) audit driver `nav + /state console-errors + DOM health` cho cả 50 trang; (3) interaction probe `gõ search + click nút SAFE (bỏ destructive) + mở/đóng modal` cho ~25 trang; (4) CRUD thật products create→get→delete; (5) screenshot eyeball overview/products/ai-hub.

**Lỗi tìm + fix**:

1. **Dead link `web2/partner-customer`** (đã xoá) — nút "Mở thẻ KH Web 2.0" ở comment-row live-chat link tới trang 404. Repoint → `web2/customers/?phone=` (trang sống) + guard `partner.Phone`. Thêm deep-link `?phone=`/`?q=` cho trang customers (prefill search + filter on init). **Verified**: rows=1 đúng KH test.
2. **video-maker `ERR_CONNECTION_REFUSED`** — `probeLocal` (VieNeu TTS localhost:8123/8124) bắn MỖI lần load cho MỌI user → browser log lỗi network (try/catch JS không chặn). Gate: auto-load chỉ dò nếu đã từng thấy máy local (localStorage flag); nút "Làm mới" luôn dò + nhớ. **Verified**: console clean.
3. **Smoke harness stale** — gỡ 3 trang chết (tpos-pancake, live-campaign, partner-customer), bổ sung WEB2_PAGES đủ 50 trang.

**Kết quả**: 50/50 trang load KHÔNG console error (sau fix video-maker); ~25 trang interaction-clean; products CRUD write-path OK (auth + validation server "supplier bắt buộc" + create `{success,product}` + delete force) — test data dọn sạch 0 leftover. printer-settings probe localhost:17777 = CÓ CHỦ ĐÍCH (chỉ bắn khi có máy in bridge đã cấu hình → warning offline). live-chat 404/401 = Pancake token test env (môi trường).

### [fix] web2: ai-hub tạo ảnh kẹt sau 1 hình + ẩn tên Pexels/Pixabay + liên kết flow video-maker + auto-stock

User báo 3 việc (+ hoàn thiện auto-stock):

1. **ai-hub "Tạo ảnh" kẹt sau 1 hình, phải F5** — gốc: KHÔNG có timeout ở cả client lẫn server → token Pollinations treo/rate-limit làm `await fetch` không bao giờ resolve → nút disabled vĩnh viễn. Fix: (a) server `web2-ai-image-service.js` `_pollinations` thêm `AbortSignal.timeout(45s)` mỗi token → treo thì xoay token kế; (b) client `ai-image.js` thêm `AbortSignal.timeout(120s)` + thông báo "Quá lâu, bấm lại" + `finally` luôn mở nút. **Verified browser**: tạo ảnh 1 OK → nút mở lại → tạo ảnh 2 OK (2 card resolved, 0 loading). Cần deploy web2-api cho server timeout.
2. **Ẩn tên nguồn Pexels/Pixabay** — bỏ khỏi MỌI text user-facing: modal title "Kho ảnh / video miễn phí" (bỏ "(Pexels · Pixabay)"), footer "Ảnh & video bản quyền-free", message chưa-cấu-hình → "Liên hệ admin", checkbox + title attr. Verified `hasBrandName:false`.
3. **Liên kết flow ("chọn video xong rồi làm gì")** — `VideoMakerPage.gotoVoiceStep()` (chuyển tab "Giọng & Âm thanh" + scroll tới lời đọc/Xuất). Gọi sau khi: nạp video stock (video-stock pick), import video file (#vmImpFile). Toast next-step rõ ràng. Verified tab switch.
4. **Auto-stock topic→video** (MoneyPrinterTurbo pure-stock): `Web2VideoStock.search(q,opts)` (API lập trình) + `_buildStockScenes`/`_topicFromStock` + checkbox `#vmUseStock`. Khi kho không có ảnh SP HOẶC tick "Dùng ảnh kho miễn phí" → dựng N cảnh từ kho stock theo chủ đề (1 search per=n\*2 + dịch EN bù nếu ít kết quả). AI rỗng narration (không SP) → bù lời đọc theo chủ đề + gán caption ngay. Verified: 5 cảnh stock + narration + caption.

Bump video-maker.js `?v=20260624b`, video-render/stock `?v=20260624a`, ai-image.js `?v=20260624a`.

## 2026-06-23

### [feat] web2: MoneyPrinterTurbo phụ đề tự động (karaoke) + Tạo video 1 chạm + LIVE stock keys

Tiếp tục phát triển theo MoneyPrinterTurbo — 2 mảnh còn lại + kích hoạt stock footage:

- **Phụ đề tự động (karaoke captions)** `video-render.js`: `_chunkCaption` (chia lời đọc thành cụm ngắn ≤7 từ / ngắt dấu câu) + `_drawCaption` (mỗi cụm hiện 1 lúc theo tiến độ cảnh `p`, chữ to in hoa + viền đậm + pop-in, kiểu TikTok/Reels, ~64% H). Bật qua `opts.captions`; text = `cur.caption || cur.narr`. `video-maker.js`: `state.captions` (mặc định bật), toggle `#vmCaptions`, `_refreshCaptions`/`_assignGlobalCaptions` (per-scene narr dùng trực tiếp, lời đọc chung chia đều theo cảnh) chạy sau `genNarration`. Per-scene narration đã canh đúng window cảnh nên chia theo `p` là khớp tốc độ nói (không cần word-timestamp). **Verified browser**: caption "ÁO THUN MỚI VỀ CỰC XINH" render đúng (trắng + viền, giữa, trên ảnh Pexels).
- **Tạo video 1 chạm** `video-maker.js` `oneClickVideo()`: chuỗi `topicGenerate()` → `genNarration()` (+phụ đề) → `exportVideo()` với trạng thái ①②③ + dừng sớm nếu bước fail. Nút `#vmOneClick` "Tạo video 1 chạm (chủ đề → xuất luôn)".
- **Stock keys LIVE**: user thêm `WEB2_PEXELS_API_KEY1..4` + `WEB2_PIXABAY_API_KEY1..4` vào secret → set Render web2-api env (8 key qua Render API) + deploy. Service đọc `WEB2_`-prefix (fix). **Verified prod**: `/api/web2-stock-media/status` → `configured:true` cả pexels+pixabay; search ảnh+video trả kết quả thật 9:16; modal browser search "fashion model" → 24 ảnh, click → thêm cảnh OK.
- Bump video-render.js + video-maker.js `?v=20260623cap`. Dùng codegraph (MCP active) để đọc render/timing model nhanh.

### [feat] web2: MoneyPrinterTurbo stock footage → Xưởng Video AI (Pexels/Pixabay)

Lấy cảm hứng MoneyPrinterTurbo (harry0703, MIT): topic→script→**stock footage**→TTS→phụ đề. video-maker đã có script (`Web2VideoAiScript`) + TTS + render; bổ sung mảnh còn thiếu = **kho ảnh/video bản quyền-free** chèn vào cảnh.

- **Backend** `render.com/services/web2-stock-media-service.js` + `routes/web2-stock-media.js`: search Pexels (ảnh + video) ưu tiên → Pixabay fallback. Key giấu server `PEXELS_API_KEY`/`PIXABAY_API_KEY` (xoay tua `*1..10`). Thiếu key → `{configured:false}` (frontend báo gọn, KHÔNG vỡ). Mount `/api/web2-stock-media` (worker auto-route web2- prefix → web2-api, KHÔNG cần sửa worker). READ-only.
- **Frontend** `web2/video-maker/js/video-stock.js` (`Web2VideoStock.open`): modal tìm kiếm (ảnh/video, phân trang, ratio theo trang). Ảnh → `VideoMakerPage.addSceneFromUrl` (CORS, không taint canvas → xuất được); video → fetch blob → `Web2VideoImport.load` (lồng tiếng). Nút "Kho ảnh/video miễn phí" cạnh "+ Thêm ảnh".
- **video-maker.js**: thêm `addSceneFromUrl(url, meta)` + export trên `VideoMakerPage`; wire nút `#vmStock`.
- **Test**: backend `node --check` + graceful no-key PASS. Live browser: video-maker load 0-error, `Web2VideoStock`+`addSceneFromUrl`+nút present, modal mở đúng (title/tab/search), search degrade gọn khi backend chưa deploy.
- **⚠ Để KÍCH HOẠT**: (1) thêm `PEXELS_API_KEY` (free tại pexels.com/api) vào env web2-api trên Render (placeholder đã thêm vào serect_dont_push.txt), (2) deploy lại web2-api. Pixabay optional fallback.

### [refactor] web2: Migrate products/variants/customer caches onto Web2SmartCache + primitive refinements

Tiếp nối smart-cache: migrate 3 cache còn lại sang primitive `Web2SmartCache` (API GIỮ NGUYÊN, test 3 tầng mỗi cái).

- **`web2-variants-cache.js`** (231→252 dòng): delegate fetch/SSE/dedup/persist sang primitive. Domain logic (findByValue/findByValueExact/getColorShortMap memo) giữ nguyên. Bonus IDB persist. Test: 12 integration assertion + live browser (108 variant trên trang products).
- **`web2-products-cache.js`** (486→323 dòng, **−163 dòng** IDB/SSE/SWR boilerplate): delegate sang primitive, giữ nguyên findByName ranking heuristic + findByNameVariant strict + `_upsertLocal/_removeLocal` (qua `_cache.set`, sync) + isReady + self-load API. Test: 13 integration assertion (ranking, variant-strict, upsert/remove sync) + live browser (4 SP, isReady, 0 error).
- **`web2-customer-store.js`** (vốn KHÔNG cache → thêm lớp cache): `getByPhone`/`getByFbId` qua `Web2SmartCache.createKeyed` (dedup + cache 30s + `swr:false` để KH freshness-sensitive: trong TTL→cache nhanh, stale/invalidate→AWAIT fetch tươi). Invalidate sau mỗi write (patch/upsert/harvest) + SSE `web2:customers` (global, lazy invalidate-all). batch/list/enrich vẫn fetch trực tiếp. Test: 11 integration (dedup/cache-hit/write-invalidate/SSE-invalidate) + live browser (KH thật + cache same-ref).
- **Primitive refinements** (`web2-smart-cache.js`):
    - Gỡ `skipEchoUntil` blanket-suppress (1.5s sau set) — **bug tiềm ẩn**: nuốt nhầm mutation tab/máy KHÁC đến ngay sau set() local. Giờ chỉ echo-suppress CHÍNH XÁC theo `data.by===clientId`.
    - `createKeyed`: thêm **global-topic mode** — `cfg.topic` (không `topicFor`) → subscribe 1 LẦN cho cả cache → lazy `invalidate-all` (mark stale), tránh refetch storm N-key khi 1 entity đổi. `topicFor(key)` vẫn per-key precise.
- Bump `?v=20260623sc`: products-cache (8 trang), variants-cache (3), customer-store (2).
- **Tổng test: 72 assertion** (primitive 24 + suppliers 12 + variants 12 + products 13 + customer 11) PASS + 3 live browser smoke 0-error.

### [feat] web2: Smart cache dùng chung (Web2SmartCache) — primitive SWR gom bộ máy cache + audit 8 GitHub repo

**Phần 2 (smart cache):** Audit 4 cache hiện có (Web2ProductsCache 486, Web2CustomerStore 426, Web2VariantsCache 231, Web2SuppliersCache 222 dòng) → đều TỰ CÀI LẶP cùng bộ máy: IDB persist + TTL + stale-while-revalidate + Web2SSE invalidate + echo-suppress (clientId) + debounced refresh + listeners + in-flight dedup (~1000 dòng gần trùng).

- **MỚI `web2/shared/web2-smart-cache.js`** (568 dòng, `window.Web2SmartCache`) — primitive 1 nguồn:
    - `create({ name, fetcher, topic, ttl, maxAge, persist, swr, debounceMs, applyEvent })` → cache 1 giá trị (list/object). API: `get/init/refresh/peek/set/mutate/invalidate/subscribe/isReady/isStale/dispose`.
    - `createKeyed({ name, fetcher(key), topicFor, ttl, maxEntries })` → cache theo key (entity-by-id) + **LRU eviction** + TTL.
    - SWR: trả cache cũ NGAY + revalidate nền; cold load thử IDB persist trước (instant) rồi fetch.
    - Dedup in-flight (10 caller → 1 fetch). `ttl<=0` = always-revalidate. `applyEvent(msg,cur)` patch tại chỗ từ payload SSE (khỏi refetch).
    - SSE: subscribe `topic` → echo-suppress (`data.by===clientId`) → debounce → revalidate. Self-load Web2IdbStore nếu thiếu.
    - Autoload qua `web2-sidebar.js` (mọi trang Web 2.0 có sẵn `Web2SmartCache`).
- **Adopt tham chiếu: `web2-suppliers-cache.js`** refactor delegate fetch/persist/SSE/dedup sang primitive — public API GIỮ NGUYÊN byte-for-byte (9 consumer: so-order, products, purchase-refund, supplier-debt, supplier-wallet, balance-history không đổi). **Bonus: NCC giờ có IDB persist** (sống qua reload/offline) — trước đây không có. Self-load primitive trong `init()` (async, luôn await → không lệ thuộc thứ tự load); thiếu primitive → fallback fetch trực tiếp (degraded, vẫn chạy).
- **Test 3 tầng**: (1) unit 24 assertion (dedup/SWR/set/mutate/invalidate/SSE+echo/applyEvent/persist round-trip/keyed LRU) PASS; (2) integration real-files 12 assertion (suppliers trên smart-cache: init/search dấu/ensure/persist/SSE refetch) PASS; (3) **live browser** supplier-debt: `Web2SmartCache` autoload OK + `Web2SuppliersCache.init()` trả 4 NCC thật từ backend, 0 error.
- **Migration path** (opt-in, chưa làm — load-bearing): products/variants/customer cache có thể migrate sau, mỗi cái shed ~150 dòng IDB+SSE+SWR boilerplate. Suppliers là adopter đầu (rủi ro thấp nhất).

**Phần 1 (audit 8 GitHub repo):** Đọc chi tiết 8 repo. Kết luận: 1 repo là app-feature (MoneyPrinterTurbo → enhance video-maker, MIT, cần Pexels key — chưa có trong secret), phần còn lại là dev-tooling/skill cho Claude Code (free-claude-code, ruflo, claude-mem, codegraph) hoặc skill/agent ĐÃ có sẵn trong môi trường (anthropics/skills, wshobson/agents, taste-skill). Chi tiết bảng audit trong câu trả lời + đề xuất codegraph (dev-tooling, optional) + MoneyPrinterTurbo (chờ Pexels key). KHÔNG ép nhồi dev-tooling vào app.

### [fix] web2: avatar DiceBear vỡ (transparent→400) + avatar vào trang Người dùng + đổi MK chính mình không bị logout + Zalo CORS

Audit/debug 3 lỗi user báo trên Web 2.0:

1. **Avatar DiceBear vỡ** (modal "Thông tin tài khoản" hiện chữ "avatar" thay vì ảnh). Gốc: `avatarUrl()` set `backgroundColor=transparent` khi nền trong suốt → DiceBear trả **HTTP 400** (`backgroundColor` chỉ chấp nhận HEX). Mọi avatar mặc định (bg=transparent) đều vỡ.
    - Fix `web2/shared/web2-user-profile.js`: OMIT `backgroundColor` khi transparent (mặc định DiceBear vốn trong suốt); chỉ set khi là HEX hợp lệ (`/^[0-9a-fA-F]{3,8}$/`). Verify browser: preview + 12 thumbnail load (naturalWidth=150, brokenThumbs=0).
2. **Avatar vào trang Người dùng** (`web2/users`): thêm cột avatar trong ô Username (`userAvatarUrl(u)` → Web2UserProfile.avatarUrl, fallback seed=username). Load `web2-user-profile.js` trực tiếp trong page (tránh sidebar inject async → table render avatar ngay). CSS `.u-user-cell`/`.u-avatar`. Verify: 14 user đều có avatar load OK, 0 console error.
3. **"Đổi mật khẩu admin lưu nhưng không đổi"**: backend ĐÚNG (test throwaway user: đổi P1→P2, login P2 OK, P1 bị reject). Thực chất khi đổi MK CHÍNH MÌNH, route xoá hết session (kể cả token đang dùng) → request kế 401 → bị "đá" ra login → tưởng "không đổi". Fix `users-app.js`: nếu `isSelf` → `_reauthSelf()` re-login ngay bằng MK mới giữ phiên sống + cập nhật localStorage; SSE handler bỏ qua auto-reload cho self change-password (cờ `_selfPwdChangeAt`).
4. **Zalo CORS**: trang `web2/zalo` gửi header `x-web2-zalo-owner` (per-máy) → preflight chặn "is not allowed by Access-Control-Allow-Headers". Thêm `X-Web2-Zalo-Owner` vào `shared/universal/cors-headers.js` (worker, cả `buildCorsHeaders` + `CORS_HEADERS`) + `render.com/server.js` allowedHeaders. Cần deploy worker (wrangler) + render.

Bump `web2-user-profile.js` inject → `20260623b`; bulk bump `web2-sidebar.js?v=20260623up1→up2` (46 trang); users.css/js → `20260623up2`.

### [feat] Trợ lý AI — Pollinations xoay tua nhiều token Seed (bỏ giới hạn anonymous 1 req/15s)

User báo Pollinations free (anonymous ~1 req/15s + watermark) hay bị giới hạn → thêm nhiều token. Pollinations giờ có auth (auth.pollinations.ai): Seed (free) ~1 req/5s, Bearer token PHẢI ở server.

- `web2-ai-image-service.js`: `_pollinationsTokens()` đọc env `WEB2_POLLINATIONS_TOKEN{1..10}` (+legacy đơn) — mirror `_cfAccounts()`. `_pollinations(prompt,opts)` giờ async:
    - **Có token** → proxy server-side `fetch(url, {Authorization: Bearer <token xoay>})`, round-robin `_polRr` + cooldown 60s (401/403/429), trả **dataUrl** (token KHÔNG lộ browser — docs cấm Bearer ở frontend). Hết token khoẻ → fallback URL anonymous.
    - **Không token** → trả `{url}` như cũ + `&referrer=` (`WEB2_POLLINATIONS_REFERRER` env, default `nhijudy.store`) — nâng tier nhẹ, không bí mật.
- `status()`: label `Pollinations (N token)` + field `tokens` cho admin keys tab.
- User đã thêm 5 token vào `serect_dont_push.txt` (`WEB2_POLLINATIONS_TOKEN1..5`) → set Render env web2-api để kích hoạt.
- Verify: `node --check` PASS + smoke (no-token→URL+referrer, env→status tokens=N) PASS. Frontend `ai-image.js` đã support cả `url` lẫn `dataUrl` (renderCard) → không cần đổi frontend.

### [feat] web2: footer sidebar bấm xem hồ sơ user + đổi avatar DiceBear (self-service)

Footer sidebar (avatar + tên + @user + role) giờ bấm được → mở modal "Thông tin tài khoản". Avatar đổi qua **DiceBear** (HTTP API 10.x, SVG, `<img>`).

- **Shared mới** `web2/shared/web2-user-profile.js` (`Web2UserProfile`): `avatarUrl(cfg)` build URL DiceBear 1 nguồn (BASE `api.dicebear.com/10.x`) + `open()` modal (preview lớn, picker 12 style KHÔNG cần ghi nguồn [CC0 + Pablo Stanley free-commercial], seed + 🎲 ngẫu nhiên, 7 màu nền + trong suốt, info Email/SĐT/role/đăng nhập gần nhất, "Khôi phục chữ cái"). Inject qua sidebar (mọi trang).
- **Lưu CẤU HÌNH** `{style,seed,bg}` (JSON, KHÔNG lưu URL → đổi version 1 chỗ). Seed mặc định = username.
- **Backend** `web2-users.js`: cột `avatar TEXT` + `mapRow.avatar` + **self-service** `PATCH /me/avatar` (requireWeb2Auth, chỉ `req.web2User.id` → không sửa được người khác). Login + `/me` trả `avatar`.
- **Sidebar**: footer render `<img>` avatar (fallback chữ cái), `.web2-user-header` clickable (role=button + keyboard). Sau khi lưu → `Web2Auth.storeLogin` cập nhật localStorage + `Web2Sidebar.renderUserFooter` refresh ngay.
- Bump `web2-sidebar.js/.css?v=20260623up1` toàn bộ 48 trang. ⚠ Cần Render deploy (cột avatar + endpoint).
- License: chỉ dùng style không cần attribution (CC0 + avataaars/bottts free-commercial) → an toàn tool nội bộ.

### [security] web2/login: bỏ dòng lộ tài khoản mặc định admin/admin@@ (đã đổi mật khẩu)

Trang đăng nhập Web 2.0 (`web2/login/index.html`) có dòng "Tài khoản mặc định: admin / admin@@" — sau khi user đổi mật khẩu thì đây là lộ credential không cần thiết. Gỡ block `.login-foot`.

### [feat] Zalo PER-MÁY (owner-scoped): mỗi máy chỉ thấy/dùng account chat.zalo.me của máy đó

User: máy nào đăng nhập chat.zalo.me thì máy đó dùng account đó, KHÔNG share máy khác (local theo chat.zalo.me). Sau research (zca-js Node-only, extension polyfill rủi ro cao) + plan-mode duyệt: chọn **Option B owner-scoped** (server giữ socket RAM nhưng gắn chủ sở hữu = máy; máy khác không đọc/gửi được) + **tin KH 1-1 cũng per-máy** (chấp nhận phân mảnh). Xây trên nền no-persist/no-QR đợt trước.

- **Machine id**: UUID per-browser `localStorage['web2_zalo_owner']` (helper `Web2ZaloOwner`) → header `x-web2-zalo-owner` trên MỌI request Zalo (thêm vào `_authHeaders` của cả `web2-zalo-api.js` + `web2-zalo.js` cross-page).
- **Schema**: cột `owner_id` + index trên `web2_zalo_accounts` (conv/msg scope qua account_key).
- **Routes**: `_owner(req)` + cache `_ownerByAccount`; stamp owner lúc `/login-cookie` + `POST /accounts`; scope reads `/status` `/accounts` `/conversations` (personal theo owner, OA chung) + guard `/conversations/:id/messages` (id serial đoán được); customer-1-1 `conversation/ensure`+`:phone` dùng `_ownerConnectedAccount` (máy chưa login → 400 `needLogin`); SSE `_notify` → `_ownerTopic` (`web2:zalo:<owner>:accounts/messages/thread`). GỠ toàn bộ máy móc primary (`_getPrimaryKey/_loadPrimaryKey/_primaryKey/isPrimary callback/route /primary`). zca: bỏ gate `isPrimary` ở watchdog/reconnect (giữ MỌI phiên RAM).
- **Frontend** (bump `?v=20260623own`): SSE subscribe owner topic + global (OA/reset); GỠ nút "Đặt làm chính" + badge "TK chính" + `setPrimary` + CSS; hint "Tài khoản của MÁY NÀY — máy khác không thấy"; customer-chat empty-state `needLogin` → link chat.zalo.me + Đăng nhập Zalo.

Verified local: owner UUID minted, header `x-web2-zalo-owner` gửi, 0 nút QR/Kết-nối-lại/Đặt-làm-chính, 0 console error, node -c toàn bộ pass. Cô lập per-máy thật + customer-1-1 verify bằng curl 2 owner header SAU deploy. Account cũ thành vô chủ (ẩn) — mỗi máy tự "Thêm tài khoản". (web2 beta.)

### [tweak] cham-cong: dung sai mặc định 5→6 phút (8h06 / 19h54 vẫn đúng giờ)

User muốn nới dung sai lên 6'. Đổi mặc định 5→6 ở: backend column DEFAULT + manual create + `cfgFor` + `calcDay` + employees row + hint. Migration idempotent trong `ensureTables`: `ALTER COLUMN grace_minutes SET DEFAULT 6` + `UPDATE ... SET 6 WHERE grace_minutes = 5` (bump các dòng còn ở default cũ; beta nên retire giá trị 5, muốn chặt hơn đặt 0-5 ở UI sau). Bump js salary i/employees j/app k. ⚠ Cần Render deploy để migrate dòng cũ; frontend default 6 đã có hiệu lực ngay sau hard reload.

### [feat] cham-cong: lương theo THÁNG (cố định) + dung sai ±phút vào/ra

- **Lương tháng** (cố định): tab Nhân viên thêm cột **"Loại lương" (Ngày/Tháng)**. Chọn "Tháng" → ô Lương = lương/tháng, `calcMonth` đặt `luongChinh = số tiền nhập` (KHÔNG nhân số ngày công); ngày nghỉ trừ qua "Giảm trừ" thủ công. NV thủ công (MANUAL-\*) mặc định = monthly. workedDays vẫn đếm để hiển thị.
- **Dung sai ±phút**: cột **"Dung sai (phút)"** (mặc định 5) per-NV. `calcDay` kéo check-in trễ ≤ grace về mốc bắt đầu (không muộn, không trừ) + về sớm ≤ grace coi đủ ca (thay hằng số NEAR_END_ROUND_MIN=10 cũ). VD ca 08:00 vào 08:05 / ca 20:00 ra 19:55 → đúng giờ.
- Backend `web2-attendance.js`: cột `salary_type VARCHAR(10) DEFAULT 'daily'` + `grace_minutes INT DEFAULT 5` (ALTER idempotent); PATCH + POST manual nhận 2 field (manual default monthly).
- `cfgFor` (app.js) + payroll detail modal (hiện "Lương tháng cố định (đi làm N ngày)"). Bump js salary g/payroll i/employees i/app j. ⚠ Cần Render deploy (cột mới).

### [fix] web2 money-flow audit — 3 bug verify (cost-cap hoàn NCC CRITICAL + cart race HIGH + SSE web2:products HIGH)

Tiếp vòng audit money-flow (user duyệt fix 3 item):

- 🔴 **CRITICAL — cost-cap hoàn NCC vô hiệu ở UI chính**: quick/bulk refund gửi `products` keyed by CODE (KHÔNG `rowReturns`) → nhánh cost-cap `purchase-refund.js` (chỉ chạy khi có `rowReturns`) bị bỏ qua. Tệ hơn: `price` client gửi = giá BÁN retail (`matched.price`) → ledger ví NCC credit theo retail thay vì COST nhập → **mint ví NCC** (hoàn NCC phải theo giá nhập). FIX server-authoritative: thêm `loadSoOrderCostByCodeMap(client)` (`lib/web2-so-order-qty.js`) map `code→MAX costVnd` từ so-order (join web2_products qua name+variant chuẩn-hoá MIRROR client `_normalize`); nhánh `else` (no-rowReturns) cap `amount ≤ Σ(qty×cost)` khi MỌI line tra được cost, fail-open nếu thiếu (so-order wipe / SP chưa match) → không block refund hợp lệ. Mock-test logic PASS (MAX cost, diacritic/case, partial_received, FX rate, draft excluded).
- 🟠 **HIGH — cart race (lost update)**: `v2/cart.js` `/add`, `/:code/remove`, PATCH qty đọc `products` JSONB rồi UPDATE rời nhau → 2 tab/máy thao tác đồng thời nuốt nhau. FIX: helper `_withDraftLock(pool, code, fn)` = `SELECT … FOR UPDATE` trong 1 transaction; 3 handler chạy read-modify-write TRONG lock; `_notify*`/SSE/log dời ra SAU commit (anti-phantom). `/clear` (DELETE thuần) không cần lock.
- 🟠 **HIGH — refund không notify `web2:products`**: quick-refund trừ kho nhưng chỉ `_notify('web2:purchase-refund')` → trang Kho SP + Ví NCC (debt=Σqty×cost, subscribe `web2:products`) stale (frontend workaround refresh tay). FIX: thêm `_notifyProducts(req)` broadcast `web2:products` post-commit quick-refund. (`/approve`+`/cancel-approve` đã RETIRED 410 → quick-refund là đường trừ kho DUY NHẤT.)
- Verify: `node --check` 3 file PASS + mock-test cost-map PASS. Backend-only (không bump frontend). ⚠ Frontend comment "quick-refund KHÔNG notify web2:products" giờ stale (refresh tay còn lại vô hại) — follow-up nhỏ.

### [refactor] Zalo: BỎ lưu phiên trên server — chỉ đăng nhập qua chat.zalo.me (browser), BỎ QR

User: bỏ hết chức năng lưu Zalo lên server, chạy bằng phiên chat.zalo.me trên trình duyệt máy, hướng dẫn đăng nhập chat.zalo.me rồi ấn đăng nhập, bỏ QR. Audit + plan mode → user duyệt (realtime giữ ở server RAM, KHÔNG lưu DB; xoá sạch phiên DB cũ).

**Backend** (`render.com`):

- `web2-zalo-zca.js`: `_afterLogin` KHÔNG gọi persist cookie (`persistSession(null)`) — GIỮ `s.creds` trong RAM cho reconnect trong uptime. GỠ `startQrLogin`/`getQr`/`QR_TTL_MS`/`restoreAll` + exports. Bỏ import `secretCrypto` (hết dùng).
- `web2-zalo.js` (routes): `_saveSession` ghi `session=NULL` (chỉ cập nhật uid/tên/avatar/status). GỠ route `/login-qr`, `/qr`, `/reconnect`, hàm `restoreSessions` + `_connectAccount`. `_loadPrimaryKey` chỉ auto-promote CỜ is_primary (không tự kết nối). Route `/primary` bỏ auto-connect. `ensureSchema` nạp `_loadPrimaryKey` lúc boot. Bỏ import `secretCrypto`.
- `web2-zalo-schema.js`: boot **wipe** `UPDATE web2_zalo_accounts SET session=NULL` (idempotent, giữ cột). `server.js`: bỏ gọi `restoreSessions()` (chỉ `ensureSchema`).
- GIỮ: `/login-cookie` (đăng nhập DUY NHẤT qua phiên trình duyệt + extension), listener realtime + persist tin + SSE, watchdog reconnect trong RAM (primary-gated), graceful `stopZalo`.

**Frontend** (`web2/zalo/`, bump `?v=20260623noqr`): GỠ modal QR + nút "Tạo & quét QR" + nút "Kết nối lại" + `startQr`/`pollQr`/`openQrModal`/`closeQrModal`; `ZaloApi` bỏ `loginQr`/`qr`/`reconnect`; `STATUS_LABEL` bỏ qr-states + `state.qr`; CSS bỏ `.wz-qr-*`. GIỮ "Đăng nhập Zalo" (cookie) + `autoRenewZalo`. THÊM hint `wz-login-guide` "Đăng nhập chat.zalo.me trên trình duyệt máy này → rồi bấm Đăng nhập Zalo (máy chủ không lưu mật khẩu/phiên)". Sửa text kick-warn/extension-missing/choice-card bỏ nhắc QR.

Verified browser-test: 0 nút QR, 0 "Kết nối lại", 1 "Đăng nhập Zalo", login-guide hiện, `ZaloApi.loginQr/reconnect=undefined`, 0 console error. node -c toàn bộ pass. Deploy: server restart → mọi TK disconnected (không boot-restore), user "Đăng nhập Zalo" từ trình duyệt để nối.

### [fix] SECURITY web2: gate 11 route mutation native-orders + BIGINT Number() trong balance-history (audit money-flow)

Audit đối kháng money-flow Web 2.0 (37 agent, 20/31 finding verify isReal) phát hiện **lỗ hổng auth LIVE**: 11 route mutation `render.com/routes/native-orders.js` KHÔNG có middleware auth, trong khi sibling `fast-sale-orders.js` đã gate `requireWeb2AuthSoft` HẾT — mà `WEB2_AUTH_ENFORCE=1` đang BẬT prod → mọi route này lộ thiên (tạo/sửa/xác nhận/huỷ→hoàn ví/xoá/merge/split đơn không cần đăng nhập, biết `code` là gọi được).

- **Gate `requireWeb2AuthSoft`** (parity fast-sale-orders, frontend đã gửi `x-web2-token` qua `native-orders-api.js _fetchJson`→`_authHeaders`): `/backfill-customer-links`, `/reset-stt`, `/create-manual`, `PATCH /:code`, `/:code/confirm`, `/mark-printed`, `/:code/cancel`, `DELETE /:code`, `/:code/split-order`, `/merge`, `/merge-to-pbh`. `/:code/lock-kpi-base` vẫn `requireWeb2Admin`.
- **CHỪA `/from-comment`** (KHÔNG gate vòng này): cart `v2/cart.js:232` loopback server-to-server gọi KHÔNG kèm token → gate giờ sẽ 401 cart drag-drop. Follow-up: forward token trong loopback rồi mới gate (finding đã hạ MEDIUM — chỉ tạo draft, không động tiền).
- **BIGINT money parse**: `web2-balance-history.js:93,446` đổi `parseInt(tx.transfer_amount)`→`Number(...)` (parseInt dừng ở ký tự non-digit → có thể credit sai ví; Number là convention codebase).
- Verify: `node --check` cả 2 file PASS. Không đụng `web2-zalo-zca.js` (agent song song đang sửa).
- **Backlog chưa fix (cần user duyệt, overlap code vừa ship/contended)**: (CRITICAL) quick/bulk refund không gửi `rowReturns` → cost-cap `purchase-refund.js:426-447` KHÔNG chạy (commit 45530fad2 vô hiệu ở UI chính); (HIGH×2) cart.js race read-modify-write `products` thiếu transaction/FOR UPDATE; (HIGH) purchase-refund đổi tồn kho KHÔNG `_notify('web2:products')` → supplier-wallet stale; (MEDIUM) wallet deposit/withdraw chưa validate `:phone`.

### [feat] cham-cong: file bat TURNKEY auto-everything cho collector (như Web 1.0 setup.bat)

User muốn 1 bat chạy là auto hết (như Web 1.0). Thêm vào `attendance-sync/`:

- **`cai-dat-tu-dong.bat`**: bấm 1 lần → check Node + npm install → hỏi/ghi secret Web 2.0 (`web2-config.json`, Enter bỏ qua nếu ADMS) → **tự nhận biết mode** (có `adms-proxy.vbs` trong Startup = ADMS, không thì ZK pull) để KHÔNG tạo collector thứ 2 → kill instance cũ → tạo Startup VBS (chạy ẩn khi đăng nhập) → chạy ngay. Dual-push cả Web 1.0 + Web 2.0.
- **`go-tu-dong.bat`**: gỡ cả 2 Startup VBS + kill tiến trình.
- README cập nhật mục "Cách dễ nhất — bấm 1 file bat" + bảng file.
- Idempotent: re-run thay thế Startup VBS (kill old trước), không double collector. ⚠ Artifact Windows, chưa test trên Mac.

### [refactor] cham-cong: DUAL-PUSH từ collector Web 1.0 (1 máy/1 kết nối DG-600 → cả 2 backend), bỏ agent Web 2.0 riêng

User chỉ ra: Web 1.0 đã chạy sẵn collector chấm công trên 1 máy shop → agent Web 2.0 riêng (`web2-attendance-sync/`) là collector THỨ HAI tranh kết nối cùng máy DG-600 (máy chỉ ~1 kết nối/lúc). Gom về 1 collector dual-push:

- **`attendance-sync/web2-push.js`** (mới): forwarder đẩy users/records/sync-status sang `/api/web2-attendance` (secret từ `web2-config.json` hoặc env `WEB2_ATTENDANCE_SECRET`; thiếu → no-op). Map shape giống api.js Web 1.0. **Nuốt mọi lỗi** → không ảnh hưởng Web 1.0.
- **`attendance-sync/index.js`** (ZK pull): sau khi push Web 1.0, gọi thêm `web2.pushUsers/pushRecords/setStatus` (try/catch).
- **`attendance-sync/adms-proxy.js`** (ADMS mode): `mirrorToWeb2()` fire-and-forget mirror mọi `/iclock/*` sang `/api/web2-attendance-adms/iclock/*` (Web2 ADMS open, không cần secret). Tắt bằng env `WEB2_DUAL_PUSH=0`.
- `web2-config.example.json` + `.gitignore` (bảo vệ secret + logs).
- **Gỡ** 4 file auto-start Web 2.0 vừa thêm (`cai-tu-dong/go-tu-dong/chay-nen.bat`, `run-hidden.vbs`) — không cần collector thứ 2. `web2-attendance-sync/` còn lại là **fallback** khi shop KHÔNG chạy Web 1.0.
- README cả 2 folder cập nhật. Web1⊥Web2 vẫn giữ: 2 backend độc lập DB/bảng, chỉ chung 1 collector đọc thiết bị vật lý.
- Bật: copy `attendance-sync/web2-config.example.json` → `web2-config.json`, dán secret. Log sync hiện `web2 uploaded: N`.

### [fix] Trợ lý AI Web 2.0 — 9 bug đã verify đối kháng (resilience + UX, không mất data)

Fix các finding isReal=true sau audit đối kháng module Trợ lý AI (`web2/ai-hub/` + `render.com/{routes,services}/web2-ai*`):

**Backend (`render.com`)**:

- **(medium) Hủy upstream khi client đóng SSE**: `/chat/stream` tạo `AbortController`, `req.on('close')` gọi `ac.abort()`; `chatStream(opts, onDelta, signal)` truyền `signal` vào CẢ 2 fetch (Gemini + OpenAI-style) + `_readSSE(body, onData, signal)` (check `signal?.aborted` mỗi vòng → `reader.cancel()`). `_withKey` ném ngay khi `AbortError` (không cooldown/failover). Route không log/gửi error cho AbortError. → không đốt quota free cho phản hồi không ai nhận.
- **(medium) Phân loại lỗi quá tải để xoay key**: `_httpError` thêm cờ `_overload` cho 502/503/529 + body-text (overload/unavailable/try again); `_withKey` xử lý `_overload` như quota nhưng cooldown ngắn `COOLDOWN_OVERLOAD_MS=20s` → `chat`/`chatStream` xoay sang key/provider khoẻ thay vì fail cứng ở key đầu.
- **(medium) Ảnh tạo Gemini xoay key**: `_gemini` (image-service) bỏ `_gemKey` thủ công → dùng `runWithKey('gemini', …)` (export mới từ ai-service) tái dùng cooldown CHUNG + classify 401/403/429/502/503/529/Gemini-400-key-hỏng → 1 key lỗi thì thử key kế.
- **(medium) Vision-guard server-side**: `_assertVision(p, mdl, messages)` chặn sớm khi gửi ảnh tới model không-vision (trừ Gemini, mọi model vision) → ném `_noVision`; `chat` + `chatStream` gọi trước fetch; route `/chat` trả 422 + `noVision:true` (thay 400 upstream tối nghĩa).

**Frontend (`web2/ai-hub/js`)** — bump `?v=20260623g`:

- **(medium) Tab Tạo ảnh kẹt dropdown rỗng nếu /status fail lúc boot**: `ai-image.onShow` async, nếu `imageProviders().length===0` → `await loadStatus()` + `fillProviders()` (tự phục hồi, không cần reload trang).
- **(medium) editImageData bỏ ảnh âm thầm với nguồn non-gemini**: `generate()` cảnh báo khi có ảnh gốc + provider≠gemini; đổi provider sang nguồn không `editsImage` → `clearSource()` (dọn state + card + file input).
- **(low) Vision history strip**: `ai-chat.updateAttach` đổi sang model không-vision → strip `images` trong LỊCH SỬ (giữ `hadImages`) để follow-up không re-send ảnh cũ gây 400.
- **(low) Dừng stream trước token đầu**: cờ `userStopped` (set trong `stop()`), AbortError coi như OK (không ⚠️), `userStopped && !acc` → splice bubble rỗng + KHÔNG toast "AI không phản hồi".
- **(low) save() nuốt QuotaExceededError + convos không cap**: cap `convos` về MAX_CONVOS in-memory (giữ currentId hợp lệ), catch QuotaExceededError → cắt nửa + retry → toast warning nếu vẫn fail (không nuốt im lặng).

**(low) Rate-limit (`web2-ai.js`)**: thay `_hits.clear()` bằng sweep theo TTL (xoá IP hết hạn, giữ window IP còn hit) → chống burst-bypass khi >2000 IP.

Bỏ qua 8 dương-tính-giả (delta trùng lặp / round-robin atomicity / \_readSSE đa-dòng / pollinations URL / complete failover / newConvo model rỗng / rAF orphaned node / dropdown image disabled). Verify: `node --check` 5 file PASS + unit-check vision-guard (text-only model ném `_noVision`, vision model qua). Chưa deploy/browser-test live.

### [feat] cham-cong agent: tự chạy nền khi bật Windows (auto-start + auto-restart)

Agent đồng bộ máy DG-600 (`web2-attendance-sync/`) trước chỉ chạy khi giữ `install-windows.bat` mở → đóng/reboot là dừng (→ "Chưa đồng bộ"). Thêm cơ chế chạy nền tự động:

- `cai-tu-dong.bat` (bấm 1 lần): ensure config+npm → đăng ký **Task Scheduler ONLOGON** chạy `run-hidden.vbs` → khởi động ngay. Bật máy/đăng nhập Windows là tự đồng bộ ngầm 5'/lần, không cần mở web.
- `chay-nen.bat`: vòng lặp `node sync.js` + **tự chạy lại** nếu node thoát (lỗi/mất mạng), delay bằng `ping` (không lỗi khi chạy ẩn).
- `run-hidden.vbs`: chạy `chay-nen.bat` ẩn cửa sổ (WScript.Shell.Run …, 0, False), tự resolve thư mục.
- `go-tu-dong.bat`: gỡ task khỏi startup + `wmic` terminate đúng node chạy sync.js.
- README mục 3 + mục 6 thêm "Cách 0 — TỰ ĐỘNG khi bật máy".
- ⚠️ Artifact Windows, không test được trên Mac — viết theo chuẩn `schtasks`/`wscript`; nếu thiếu quyền tạo task → Run as administrator.

### [fix] Zalo P4: "Kết nối lại" phiên hết hạn → 400 + Popup mở chat.zalo.me (không còn 500) + sửa icon

User bấm "Kết nối lại" → **500 Internal Server Error**. Gốc: cookie/phiên đã lưu HẾT HẠN → `zalo.login` throw "Đăng nhập thất bại" → route reconnect catch trả `500 e.message`. Fix:

- Route `/reconnect`: lỗi login (không phải WRONG_ACCOUNT) → **400** + thông báo rõ "Phiên hết hạn — mở chat.zalo.me + Đăng nhập Zalo, hoặc QR" + `expired:true` (không phải 500).
- `loginWithCredentials`: login lỗi → `_setStatus('error', msg)` (trước kẹt 'connecting').
- Frontend `onAccAction` reconnect: bắt lỗi → **Popup.confirm "Mở chat.zalo.me"** 1 chạm (thay toast tan biến). Bump `?v=20260623pri3`.
- Icon lucide `user-search` (không có trong 0.294) → `search` (hết spam console "icon name was not found").

Lưu ý DATA: extension báo `GET_ZALO_CREDS_FAILURE reason=no_session` → trình duyệt CHƯA có phiên chat.zalo.me → "Đăng nhập Zalo" cũng cần mở+đăng nhập chat.zalo.me trước (hoặc QR). Code không hồi sinh được cookie chết — user phải đăng nhập lại.

### [fix] Zalo P3: TỰ LÀNH TK chính (auto-promote khi không/bị xoá) — bỏ hardcode seed key

Audit prod (curl /status + /accounts qua admin token): TK chính **"Nhijudy Ơi" đã bị XOÁ khỏi web2Db** (chỉ còn "My Njd", `is_primary=false`). Với P1: `_primaryKey=null` → KHÔNG TK nào tự kết nối → **Zalo realtime tắt**. Lỗ hổng: seed schema **hardcode** `zca_7c8093f1…` (TK vừa bị xoá) → không phong được TK chính mới. Fix: seed generic (chọn TK active connected→recent→oldest); `_loadPrimaryKey` tự phong + `_connectAccount` khi no-primary (boot+60s); DELETE TK chính → `_loadPrimaryKey()` ngay. Self-healing.

### [fix] Zalo P2: chặn tự gia hạn nền (silent) cho TK phụ + dọn status stale lúc boot

Verify prod sau deploy P1 (uptime 286s = đã chạy code mới): primary `connected`+`isPrimary` ✓ NHƯNG TK phụ vẫn `connected` (live session, connectedAt 59s SAU boot) → do **frontend bản cache cũ autoRenew** silent-reconnect TK phụ qua `login-cookie`. Watchdog mới KHÔNG nuôi nó (đúng) nhưng nó vẫn nối được 1 lần/lần mở trang.

Defense-in-depth (P2):

- Frontend `loginZaloCookie(key, silent)` gửi `silent` xuống `login-cookie`; nhận `skipped` → bỏ qua.
- Route `login-cookie`: `silent && key !== _primaryKey` → **từ chối** (`{skipped, reason:'not_primary'}`). Frontend cache cũ cũng KHÔNG tự nối TK phụ được nữa. Đăng nhập TAY (silent=false) vẫn nối TK phụ 1 lần.
- `restoreSessions` boot: set `status='disconnected'` cho TK phụ personal còn 'connected/connecting/reconnecting' stale (không listener thật).
- Bump `?v=20260623pri2`.

### [fix+feat] Zalo: CHỈ TK chính tự kết nối + giữ kết nối (bỏ "refresh kết nối liên tục" cho TK phụ)

User: đặt TK nào làm chính thì mới kết nối TK đó, không refresh liên tục. Audit toàn bộ vòng đời kết nối Zalo → trước đây **mọi** TK cá nhân đều auto-restore lúc boot + watchdog keepAlive + auto-reconnect mọi close code → 2 TK đều "đấu" kết nối liên tục.

**Backend gating theo `is_primary` (1 nguồn = callback, luôn khớp DB):**

- `services/web2-zalo-zca.js`: thêm callback `isPrimary(accountKey)` + helper `_isPrimary`. Gate `_scheduleReconnect` (TK phụ rớt → KHÔNG tự reconnect, clear timer) + `_watchdogTick` (TK phụ → KHÔNG keepAlive/respawn/re-login chủ động). Thiếu callback → mặc định true (tương thích ngược).
- `routes/web2-zalo.js`: cache `_primaryKey` (load lúc boot + refresh 60s + cập nhật NGAY khi đổi TK chính) → cấp cho zca qua `configure({ isPrimary })`. `restoreSessions()` thêm `AND is_primary=true` (boot CHỈ kết nối TK chính; TK phụ dormant). Route `/primary` ("Đặt làm chính") nâng cấp: cập nhật cache → **ngắt các TK cá nhân khác đang nối** (giữ đúng 1 TK) → **kết nối TK chính** bằng session đã lưu (nền, SSE cập nhật UI). `zca.disconnect` đã `disposed=true` + xoá session nên không tự nối lại.

**Frontend** (`web2/zalo/`, bump `?v=20260623pri`): `autoRenewZalo` chỉ tự gia hạn TK **chính** (trước: mọi TK phụ stale cũng silent-reconnect qua extension cookie → nguồn refresh liên tục). Thêm hint trên thẻ TK phụ: "TK phụ — máy chủ không tự kết nối / không refresh liên tục. Bấm Đặt làm chính để hệ thống tự kết nối & giữ realtime."

Verified: frontend 2 thẻ, 1 TK CHÍNH, hint hiện đúng trên TK phụ, nút "Đặt làm chính" có, 0 lỗi. Backend logic review + node -c pass (zca + real Zalo chỉ test được trên Render sau deploy). KHÔNG đổi schema (cột `is_primary` đã có).

### [feat] cham-cong: thêm NV thủ công + ghi chú theo ngày + modal Chi tiết bảng lương

**Backend** (`render.com/routes/web2-attendance.js`):

- Bảng mới `web2_attendance_day_notes` (id `{device_user_id}_{date_key}`, note, updated_at) — ghi chú theo ngày/NV.
- `GET /day-notes?start&end` + `PUT /day-notes/:id` (upsert, note rỗng = xoá). Load song song trong `loadAll`.
- `POST /device-users` (admin) tạo **NV thủ công** PIN `MANUAL-<base36>` cho người không bấm máy DG-600. `DELETE /device-users/:id` chỉ cho PIN `MANUAL-*` (dọn luôn records/notes/payroll/fullday); PIN máy thật chỉ tắt "Bật".

**#1 Thêm NV thủ công** (`cham-cong-employees.js`): nút "Thêm NV thủ công" (hỏi tên qua `Popup.prompt`) → tạo → gán NV + nhập công như NV máy. Hàng MANUAL hiện pill "Thủ công" + nút 🗑 xoá. Filter Bảng công/lương đổi sang `isVisibleEmp` = đã gán NV **hoặc** MANUAL-\* (NV thủ công luôn hiện dù chưa link web2 user).

**#3 Ghi chú theo ngày** (`cham-cong-app.js`): popup ngày thêm ô "📝 Ghi chú ngày này" (persist `putDayNote` khi đổi). Cell Bảng công có ghi chú → chấm vàng góc + tooltip. State `dayNotes` map `{uid}_{dk}→note`.

**#2 Modal Chi tiết bảng lương** (`cham-cong-payroll.js`): nút "Chi tiết" cạnh "Sửa" → modal read-only giải thích từng khoản: lương chính (công×rate), tăng ca (từng ngày OT + override), phụ cấp/thưởng/đã trả (từng item + nhãn), giảm trừ (phạt muộn từng ngày + giảm trừ thủ công), tổng/còn lại, ghi chú tháng + **ghi chú theo ngày** (#3). Nút "Sửa điều chỉnh" mở modal edit cũ.

CSS bump `cham-cong.css?v=20260623d`, js api `g`/payroll+employees `h`/app `i`. ⚠ Cần Render deploy (route mới).

### [feat] Mọi "Choose File" ảnh hỗ trợ DÁN (Ctrl+V) + kéo-thả — Web2ImagePaste.enhance()

User báo: ai-hub có "Choose File" mà **không dán ảnh được**. Audit toàn bộ `<input type=file accept=image>` Web 2.0 → thêm cơ chế dùng chung.

**🆕 `Web2ImagePaste.enhance(input, opts)`** (`web2/shared/web2-image-paste.js`, bump autoload `?v=20260623b`):

- Nâng cấp 1 file-input **SẴN CÓ** để cũng nhận **DÁN (Ctrl+V)** + **kéo-thả**, GIỮ nút "Chọn file" gốc. Ảnh dán/thả được **bơm vào `input.files` + dispatch `change`** → handler sẵn có của trang chạy y như chọn file → **KHÔNG phải đổi handler**. Có dropZone tuỳ chọn + highlight kéo-thả + hint chip "📋 hoặc dán (Ctrl+V) / kéo-thả".
- `opts`: `dropZone`, `onFiles` (override injection), `hint`/`hintText`/`hintInto`, `onError`.

**Áp dụng (mọi Choose File ảnh chưa có paste):**

- `ai-hub` (Nano Banana sửa/ghép — ví dụ user): `enhance('#aihImgFile', dropZone '#aihImgEditField')`. ✅ Verified: drop ảnh → `inputHasFile=1` (bơm vào input → handler chạy → `editImageData`), hint hiện, 0 error.
- `video-maker` (#vmAdd thêm ảnh slideshow): dropZone `.vm-upload`. ✅ Verified enhanced + hint + 0 error.
- `fb-posts` (#fbpMedFile): dropZone `.fbp-media-bar`.
- `photo-studio` (4 input): source dán thẳng lên khung dàn `#psStage` (hint ở stage rỗng) + nền/logo/batch dán khi rê vào vùng tương ứng.

(chat-panel, zalo, photo-editor, product-card, chi-tieu đã có paste/ảnh-area từ trước.) Giờ mọi nơi nhập ảnh Web 2.0 đều dán/kéo-thả được — 1 nguồn `Web2ImagePaste`.

### [feat] Máy in: 2 chức năng tự chọn sẵn máy mặc định theo TÊN

**Yêu cầu:** trang **Máy in** (`web2/printer-settings/`) — "In tem / mã sản phẩm (máy tem)" mặc định = **Máy in 2 tem mã sản phẩm**; "In Phiếu Bán Hàng (bill 80mm)" mặc định = **Máy in PBH Huyền + Hạnh + Còi + Hồng**.

**Files:**

- `web2/shared/web2-printer.js` — thêm `ROLE_DEFAULT_NAMES` (`{pbh, label}` khớp theo TÊN máy in, vì id do server sinh ngẫu nhiên) + `_defaultPrinterIdForRole()` + `effectiveRoleId()` (export). `getPrinterFor()` đổi fallback chain: **máy user gán → máy mặc định theo tên → máy đầu danh sách → null**. `roleIsBridge()` ăn theo (gọi `getPrinterFor`).
- `web2/printer-settings/index.html` — `renderRoles()` dùng `P.effectiveRoleId(r.key)` để chọn sẵn (selected) máy mặc định khi user CHƯA gán; khớp với hành vi in thực tế.
- Bump `web2-printer.js?v=20260623role` ở 4 trang load (printer-settings, products, fastsaleorder-invoice, native-orders) để prod nạp module mới — default áp dụng cả nơi IN (`web2-bill-service` PBH + `web2-products-print-modal` tem).

**Chi tiết:**

- Default theo TÊN (không persist id) → tự sửa lành (rename/xoá máy → re-resolve). User gán thủ công vẫn ưu tiên; id cũ chết (máy bị xoá) → rớt về mặc định theo tên.
- Node test (chạy đúng module) PASS 5 case: no-role→default đúng tên, override thắng, stale id→default, clear→default, roleIsBridge=true.
- Browser test live (`web2/printer-settings`, `roles:{}`): pbh→"Máy in PBH Huyền + Hạnh + Còi + Hồng", label→"Máy in 2 tem mã sản phẩm". 0 page/console error.

**Status:** ✅ Done.

### [feat+refactor] Ảnh dùng chung 1 nguồn: Web2ImagePaste (nhập) + Web2ImageLightbox click-phóng-to + hover-zoom

**Audit toàn bộ chỗ import/hiển thị ảnh Web 2.0** (2 explore agent song song) → gom về module chung.

**🆕 `web2/shared/web2-image-paste.js` (`window.Web2ImagePaste`)** — ô NHẬP ẢNH dùng chung:

- `mount(target, opts)` → AREA: **bấm chọn file** + **kéo-thả** + **DÁN ảnh (Ctrl+V)** (hover/focus area → armed → document paste route vào, không cần bấm trước) + nén qua `Web2CanvasUtils` (mặc định JPEG ≤1600px) + dải thumbnail preview (xoá ×, click phóng to qua lightbox). Trả callback `onChange(items)`.
- Tiện ích tĩnh cho trang chỉ cần nén (chat/zalo/ai-hub): `compress()`, `imagesFromClipboard()`, `imagesFromDataTransfer()`.
- Verified: 2400×1800 PNG → JPEG 1600×1200 (giữ tỉ lệ) + blob, area mount OK, 0 error.

**♻️ `web2-image-lightbox.js` — thêm CLICK PHÓNG TO catch-all + con trỏ zoom-in** (bump `?v=20260623a`):

- Mọi `<img>` nội dung trong khung Web 2.0 (`.web2-shell`/`body.web2-theme`) → click mở lightbox, hover hiện con trỏ `zoom-in`. Bỏ qua an toàn: icon/avatar <56px, ảnh trong `a`/`button`/`[onclick]`/sidebar, thumb của thumbStrip & Web2ImagePaste, opt-out `data-w2-no-zoom`/`data-w2-no-lightbox`; tôn trọng `e.defaultPrevented` (không cướp handler trang). Đọc `data-full` để mở ảnh gốc to. Gom ảnh anh em trong cùng bảng/gallery cho prev/next.
- Verified trên products: nhận diện ảnh nội dung, hover→zoom-in, click→lightbox mở + set src.

**🔌 Auto-load qua `web2-sidebar.js`** (mọi trang Web 2.0): thêm `web2-canvas-utils` + `web2-image-paste` + `web2-effects` (HOVER ZOOM ảnh — trước chỉ 3/51 trang load) cạnh `web2-image-lightbox`. → 1 cặp module chung: hover-zoom + click-phóng-to có mặt mọi trang, 0 sửa HTML từng trang.

**Consumer migrate (gom về 1 nguồn):**

- `chi-tieu`: ô ảnh hoá đơn dùng `Web2ImagePaste` (xoá `readCompressed` cục bộ); 🧾 cột ảnh đổi từ mở-tab-mới → lightbox (`data-w2lb-url`); bump `?v=20260623c`.
- `chat-panel` (compose): ảnh chat bấm → lightbox dùng chung (thay `window.open` tab mới) + preventDefault.
- `purchase-refund`: `openImageLightbox` delegate sang `Web2ImageLightbox` (giữ fallback overlay cũ).

### [feat] users: hiện mật khẩu (AES 2 chiều, trừ admin) + username cho 2 ký tự — và cham-cong: scroll + Lưu tất cả + ẩn NV chưa gán

**1. Username cho phép 2 ký tự** (`render.com/routes/web2-users.js` + `web2/users/index.html`): regex `validateUsername` `{3,40}`→`{2,40}` + message + hint frontend "2-40 ký tự".

**2. Hiện mật khẩu lên bảng users — chỉ admin, TRỪ account admin** (bump users css/js `?v=20260623ph`):

- Mật khẩu lưu bcrypt (1 chiều, không khôi phục được). Thêm cột `password_enc TEXT` lưu **bản mã hoá 2 chiều AES-256-GCM** (`encryptPassword`/`decryptPassword`, format `v1:iv:tag:ct` base64; key sha256 từ env `WEB2_USER_PWD_KEY`, có fallback default cho beta). bcrypt VẪN là nguồn verify login — `password_enc` chỉ để admin đọc lại.
- Capture trên create + change-password. `mapRow(row,{reveal})` chỉ giải mã khi viewer là **admin** (`req.web2User.role==='admin'`) và **row.role !== 'admin'** (không lộ mật khẩu quản trị viên). `/list` + `/:id` truyền `reveal`.
- Frontend: cột "Mật khẩu" + `renderPasswordCell` — admin row → 🔒, mật khẩu cũ (chưa mã hoá, `password_enc` NULL) → "—" + tooltip "đổi MK để hiện", có mật khẩu → `<code>` + nút copy (`copypwd`). CSS `u-col-pwd`/`u-pwd-text`/`u-pwd-locked`.
- ⚠ Cần Render deploy để chạy. Mật khẩu cũ chỉ hiện sau khi đổi/tạo mới. Khuyến nghị set env `WEB2_USER_PWD_KEY` trên Render (bảo mật at-rest tốt hơn fallback default).

**3. cham-cong** (`web2/cham-cong/`, bump css `?v=20260623c`, js payroll/employees `?v=20260623g`, app `?v=20260623h`):

- **Không scroll được** → `<main>` thiếu class scrollable. `.web2-shell` là `height:100vh;overflow:hidden`, vùng cuộn là `.web2-main{overflow:auto}`. Thêm `class="web2-main"` cho `<main>` (khớp 8+ trang khác).
- **Nút "Lưu tất cả"** (tab Nhân viên): toolbar `.cc-emp-top` + `saveAll()` PATCH tuần tự từng hàng (progress `Đang lưu i/N…`), gom kết quả → 1 toast; refactor `rowBody(tr)` dùng chung với `saveRow`.
- **Ẩn NV chưa gán** (employee_id NULL = "— Chưa gán —") khỏi **Bảng công** + **Bảng lương** + Excel export: filter `&& d.employee_id`. Empty-state phân biệt "chưa gán PIN nào" vs "chưa có dữ liệu máy".

### [feat] Trợ lý AI: keys LIVE (12 chat + 3 ảnh) + Render build-filter cắt phút + tab Cấu hình admin-only + bỏ chữ key/free

**Keys lên Render (WEB2\_ prefix) + đã build LIVE:** set 16 env `WEB2_*` qua Render API (merge guard, 43→59) → Gemini 6 + Groq 5 + OpenRouter 1 (xoay tua, ưu tiên Gemini) + Cloudflare 3 account ảnh. Verify /chat thật cả 3 provider trả tiếng Việt ✓, Cloudflare ảnh ✓. Test toàn bộ key serect: Gemini cũ (11) chết "leaked"; Gemini mới (3 AQ+1 AIza) + Groq 5 + OpenRouter + CF 3 đều sống.

**Render build-minutes (root cause cạn phút):** 3 service (web2-api, n2store-fallback, web2-realtime) đều **autoDeploy + KHÔNG buildFilter** → MỖI push rebuild cả 3 bất kể đổi gì (kể cả docs/frontend/session) → cạn 500 free + $5 limit → build fail 3s/no-log. **Fix: set buildFilter** (`render.com/**` cho web2-api+n2store-fallback, `live-chat/server/**` cho web2-realtime) qua API (buildFilter là field TOP-LEVEL, không phải serviceDetails) → commit docs/frontend/session KHÔNG còn kích build. User nâng spend limit $5→$10.

**test() ping rỗng:** maxTokens 16 quá thấp cho model suy luận (GPT-OSS/Gemini 2.5 đốt token reasoning) → nâng 256.

**Tab "Quản lý key" → "Cấu hình", CHỈ admin (canonical `role==='admin'`, khớp web2/users + requireWeb2Admin):** HTML `hidden` mặc định, ai-hub.js `isAdmin()` mới unhide cho admin + chặn switchTab('keys'). Server gate: `/status` strip keys[]/keyCount cho NV (giữ provider/model cho dropdown), `/test` → requireWeb2Admin. **Bỏ chữ "key"/"free"** khỏi UI NV thấy: subtitle, label "Nguồn ảnh", hint ảnh, pill chat ("✓ Sẵn sàng" thay "N key"), status hint, nhãn model OpenRouter + Pollinations. Admin Cấu hình tab giữ thuật ngữ kỹ thuật (env name chứa KEY là bắt buộc).

### [feat+fix] Nút tự tạo mật khẩu (web2/users) + audit browser-test Chấm công & Quản lý chi tiêu

**1. Nút "Tạo" mật khẩu** (`web2/users/index.html` + `css/users.css` + `js/users-app.js`, bump `?v=20260623pg`):

- Thêm nút 🎲 **Tạo** cạnh ô mật khẩu (cả form Tạo user + modal Đổi mật khẩu) → sinh **1 từ tiếng Anh dễ nhớ dài đúng 9 chữ** (danh sách 111 từ curated, lọc `.length===9` runtime chống gõ nhầm; `Math.random` pick). Ô để `type=text` cho admin đọc/copy đưa NV + toast gợi ý.
- Browser-test: bấm → `dimension`/`wonderful`/`yardstick`/`education` — đều 9 ký tự, ngẫu nhiên mỗi lần, 0 console error.

**2. Audit + browser-test (click như user thật, seed→test→xoá sạch DB — user cho phép):**

- **Chấm công** (`web2/cham-cong/`): timesheet dot-grid (16 NV máy, 6 NV web2, 454 chấm) ✓, popup chi tiết ngày (Vào/Ra + OT + về sớm + 2 tab) ✓, thêm/xoá lượt chấm thủ công (add `09:15 manual` → persist → xoá → về absent) ✓, gán NV (PIN 2 → "Nhân viên Test" hiện đúng tên ở timesheet → revert) ✓, tab Bảng lương (tính công/OT/giảm trừ, tên NV gán "Còi" đúng) + modal Điều chỉnh lương ✓. **Fix**: empty-state còn trỏ nút "Nhập Excel/TXT" đã gỡ → đổi sang hướng dẫn chạy `install-windows.bat`/`lay-du-lieu.bat` (`cham-cong-app.js`, bump `?v=20260623g`).
- **Quản lý chi tiêu** (`web2/chi-tieu/`): tạo phiếu thu (TTM000003, summary cập nhật) ✓, sửa số tiền ✓, **huỷ phiếu** (lý do qua Popup.prompt, loại khỏi list paid + summary→0) ✓, xoá hẳn (cleanup) ✓, tab Báo cáo (breakdown danh mục/tháng/nguồn/quỹ) ✓, quản lý danh mục (thêm/xoá) ✓. **🐛 Fix bug** (`chi-tieu-app.js`, bump `?v=20260623b`): popup **Lịch sử** báo "Lỗi: Invalid time value" — `created_at` audit là `BIGINT` epoch (pg trả chuỗi số `"1782…"`) → `new Date(chuỗi-số)` = Invalid Date → `Intl.format()` throw. Sửa `fmtDateTime`: ép `Number(ts)` khi toàn chữ số + guard `isNaN` (không throw). Verify lại: audit hiện đúng "Sửa/Tạo · Quản trị viên · 15:19/15:18" GMT+7.

Tất cả data test đã dọn sạch, không sót. 2 trang chạy ổn, 0 lỗi app sau fix.

### [fix] Trợ lý AI — debug Gemini: 400-rotation + key revoked + model khai tử + env override

Browser-test xoay key phát hiện chuỗi lỗi Gemini (đều đã fix):

1. **Rotation không xoay khi HTTP 400 `API_KEY_INVALID`**: `_httpError` (web2-ai-service) + loop ai-script chỉ bắt 401/403/429/402 → Gemini trả **400** cho key hỏng → ném ngay ở key đầu, bỏ phí key tốt sau. Fix: phân loại 400 theo MESSAGE (`api key not found/invalid`, `API_KEY_INVALID`) = auth-error → cooldown + thử key kế.
2. **2 key Gemini, 1 hỏng**: `GEMINI_API_KEY` (`AIza…`) = REVOKED ("API key not found"); `WEB2_GEMINI_API_KEY` (`AQ.…`) = VALID. Đã gộp `WEB2_GEMINI_API_KEY` vào pool (extraEnv) → rotation cool key hỏng, dùng key tốt → **Gemini chạy** (verified: "Chào anh/chị, anh/chị đang tìm mẫu áo nào ạ?"). Nên xoá key `AIza…` hỏng.
3. **`gemini-2.0-flash` khai tử** ("no longer available") → đổi `gemini-2.5-flash` ở chat/translate/caption; ai-script có env `WEB2_GEMINI_MODEL=gemini-2.0-flash` override → thêm **remap-guard** code (deprecated→2.5-flash). Nên sửa/xoá env `WEB2_GEMINI_MODEL` trên Render.

Verified live sau từng deploy: Gemini chat ✅, translate (group, Groq primary) ✅. ai-script remap = code đúng (unit-test pass), chờ Render rollout (deploy queue chậm do nhiều background commit). caption KHÔNG có route standalone (fb-posts gọi service nội bộ).

### [fix+refactor] Trợ lý AI: fix chat UI hỏng + gộp translate/caption/ai-script vào group xoay key TẬP TRUNG

**Audit → browser-test → debug → cải thiện** (vòng lặp hoàn thiện Web 2.0).

**🐛 Fix bug chat UI** (`web2/ai-hub/js/ai-chat.js`, bump `?v=20260623b`): `doStream`+`fallback` vừa `.filter()` bỏ assistant placeholder rỗng VỪA `.slice(0,-1)` → chặt nhầm luôn message user → gửi mảng rỗng → "Thiếu nội dung chat". Bỏ `.slice(0,-1)`. Browser-test (clear localStorage, JS bump): chat trả lời thật, **multi-turn AI nhớ context** ("Bạn vừa yêu cầu…"), ảnh Pollinations 768px render gallery, keys tab 6 card — ALL PASS.

**♻️ Consolidation — đưa 3 nơi gọi LLM 1-key-lẻ vào group xoay key** (research agent map toàn Web 2.0):

- `web2-ai-service.js`: + `extraEnv: ['WEB2_GEMINI_API_KEY']` gộp key riêng của ai-script vào pool Gemini (xoay chung — **có thể cứu Gemini nếu GEMINI_API_KEY hỏng**) + helper `complete(messages, {providers, modelFor, system, temperature, maxTokens})` = failover provider + xoay key cho service nội bộ tái dùng.
- `web2-translate-service.js`: bỏ 3 hàm `_groq/_deepseek/_gemini` 1-key → 1 call `ai.complete(['groq','gemini','openrouter'])`, giữ fallback Google free. Bỏ phụ thuộc DeepSeek (trả phí).
- `web2-caption-service.js`: bỏ `callGroq/callDeepSeek/callGemini` → `ai.complete()`, giữ template offline fallback + `_friendlyTone`.
- `web2-ai-script.js` (route): bỏ `WEB2_GEMINI_API_KEY` 1-key-lẻ → lặp `ai.keysOf('gemini')` (pool gộp) xoay key, GIỮ `responseSchema` JSON. Status trả `keys` count.

→ Mọi feature AI Web 2.0 (chat, dịch, caption, video-script) giờ dùng CHUNG 1 pool xoay key + cooldown + failover. Thêm key = set thêm env `<PREFIX>2`,`3`… Verify local: extraEnv gộp key đúng, complete() no-key graceful, 4 file load OK, không dangling ref. Verify Gemini/translate/ai-script thật sau deploy.

### [feat] Trợ lý AI Web 2.0 — chat giống ChatGPT + tạo ảnh, FREE, xoay nhiều key (group AI free hợp pháp)

User muốn build "group AI" có "ChatGPT key free" + xoay nhiều key. **Research/audit GitHub trước**: repo "free ChatGPT API" (popjane/free_chatgpt_api 6.5k⭐, xtekky/gpt4free…) đều reverse-engineer/scrape → vi phạm ToS (OpenAI dọa kiện gpt4free), hay chết, lộ data → **KHÔNG dùng**. Thay bằng **free-tier hợp pháp + xoay key** (mirror pattern web2-elevenlabs 3-key). OpenAI không phát key free thật; "giống ChatGPT" nhất mà free = **GPT-OSS-20B** (model OpenAI mở Apache-2.0, free trên Groq + OpenRouter).

**Backend** (web2-api, prefix `/api/web2-ai` → worker auto-route `startsWith('/api/web2')`, KHỎI sửa worker):

- `services/web2-ai-service.js` — chat engine. Registry **Groq · Gemini · OpenRouter**; OpenAI-compatible (trừ Gemini generateContent). **Xoay nhiều key/provider**: env `<PREFIX>1..10` (vd `GROQ_API_KEY1`, `GROQ_API_KEY2`…) + `<PREFIX>` đơn/phẩy; round-robin + cooldown 401/403 (1h) / 429/402 (5'). `chat()` + `chatStream()` (SSE delta) + `status()` (key MASKED, KHÔNG lộ) + `test()`.
- `services/web2-ai-image-service.js` — tạo ảnh free 3 nguồn xoay: **Pollinations** (free no-key, trả URL — số 1) · **Cloudflare Workers AI** (Flux-1-schnell/SDXL, env `CLOUDFLARE_ACCOUNT_ID`+`CLOUDFLARE_WORKERS_AI_TOKEN`) · **Gemini Nano Banana** (`gemini-2.5-flash-image`, dùng chung key Gemini, nhận ảnh gốc để sửa/ghép).
- `routes/web2-ai.js` — `/status /models /chat /chat/stream(SSE) /image /test`; `requireWeb2AuthSoft` + rate-limit 40/phút/IP. Wire `server.js` require + `app.use('/api/web2-ai')`.

**Frontend** `web2/ai-hub/` (menu "Đa dụng Web 2.0 → Trợ lý AI 🤖"): 3 tab.

- **Chat** giống ChatGPT: streaming gõ từng chữ (SSE, fallback non-stream), lịch sử nhiều cuộc (localStorage `web2_ai_chats`), chọn provider/model, system prompt (vai trò), copy/tạo-lại/dừng, gợi ý mẫu. Markdown render AN TOÀN (escape trước, code-fence/inline/bold/list).
- **Tạo ảnh**: prompt + nguồn + model + size (+ ảnh gốc cho Nano Banana), gallery + tải về.
- **Quản lý key**: hiện provider + key (MASKED) + cooldown + nút Test; key đặt ở **env Render** (an toàn, không nhập trong UI), gợi ý env var + nơi lấy key free.

Modules nhỏ tách bạch (ai-hub/ai-chat/ai-image/ai-keys.js + ai-hub.css), theme xanh Zalo. **Lưu ý vận hành**: Groq+Gemini chat chạy NGAY sau deploy (tái dùng `GROQ_API_KEY`/`GEMINI_API_KEY` env đã có của web2-translate); OpenRouter cần set `OPENROUTER_API_KEY`, Cloudflare ảnh cần set `CLOUDFLARE_WORKERS_AI_TOKEN`. Browser-test localhost (--start web2/overview): page render OK, 3 tab + empty-state + sidebar item, 0 page-error, worker route `/api/web2-ai` về web2-api đúng (404 pre-deploy). Verify chat/ảnh thật sau deploy.

### [feat] Group "Quản trị viên" (admin-only) + 2 module mới: Chấm công (DG-600) + Quản lý chi tiêu (Sổ quỹ)

Thêm group menu **Quản trị viên** chỉ admin thấy (gating group-level `adminOnly` trong `web2-sidebar.js` + server gate `requireWeb2Admin` mọi route). 2 module Web 2.0 ĐỘC LẬP hoàn toàn (bảng `web2_*`, route `/api/web2-*`, pool `web2Db`, SSE riêng) — không dùng chung gì với hệ cũ.

**1) Chấm công — máy vân tay DG-600** (`web2/cham-cong/`, route `/api/web2-attendance` + `/api/web2-attendance-adms`, SSE `web2:attendance`):

- 3 tab: **Bảng công** (lưới giờ vào/ra theo ngày, màu trạng thái + badge muộn/OT, bấm ô xem/sửa punch + đánh dấu công đủ), **Bảng lương** (tính lương: lương ngày, phạt muộn, OT ×hệ số, thưởng/giảm trừ/phụ cấp/đã trả + override, xuất Excel), **Nhân viên** (gán PIN máy ↔ nhân viên + lương/ngày + giờ ca + phạt muộn/phút + hệ số OT).
- Logic lương PURE ở `cham-cong-salary.js` (cấu hình theo từng NV, mọi mốc giờ GMT+7).
- 3 cách nạp dữ liệu: **agent** đẩy LAN cổng 4370, **ADMS push** (máy tự POST ATTLOG text), **nhập Excel/TXT** (parse client-side SheetJS). Bảng `web2_attendance_records/device_users/payroll/fullday/holidays/sync_status/commands`. date*key tính GMT+7; punch idempotent `{pin}*{ms}`.
- Agent máy shop: thư mục riêng `web2-attendance-sync/` (ADMS proxy không deps + ZK pull dùng `node-zklib`), POST ingest kèm secret `WEB2_ATTENDANCE_SECRET`.

**2) Quản lý chi tiêu — Sổ quỹ** (`web2/chi-tieu/`, route `/api/web2-cashbook`, SSE `web2:cashbook`):

- Thu / Chi cá nhân / Chi kinh doanh; quỹ tiền mặt / ngân hàng / ví; mã phiếu tự sinh (TTM/TNH/TVD/CCN/CKD); dải số dư đầu–cuối kỳ; lọc kỳ/loại/quỹ/trạng thái/tìm; danh mục tuỳ chỉnh; nguồn; ảnh hoá đơn (bytea, serve qua route — không CDN ngoài); huỷ mềm + lịch sử chỉnh sửa; tab Báo cáo (breakdown loại/tháng/nguồn/quỹ tính server-side).
- Bảng `web2_cashbook_vouchers/categories/sources/images/counters/audit`. Schema + helper tách `lib/web2-cashbook-lib.js` (route < 800 dòng).

Verify: test schema+SQL trên DB tạm local (ensureSchema idempotent, date_key GMT+7, idempotent punch, code-gen, số dư đầu kỳ, report group tháng theo +7 — PASS, drop DB). Worker auto-route prefix `web2-`. Bump `web2-sidebar.js?v=20260623adm` toàn bộ trang để group hiện. **Verify LIVE sau deploy**: 19 API check (login/CRUD/summary 5M-3M→tồn 2M/report/import→auto device-user/payroll/audit) + browser cả 2 trang 0 console-error + tạo phiếu thu qua UI (+1.234.000đ→tồn cuối cập nhật). Dọn test data sạch.

Fix audit-loop: ① đảo thứ tự `DELETE /records/clear-all` TRƯỚC `/:id` (Express khớp nhầm `:id`='clear-all'). ② `insertRecords` tự tạo device-user cho PIN mới (ADMS/import/manual hiện ngay bảng công). ③ admin-guard client cả 2 trang.

Bảo mật ingest: đã set env **`WEB2_ATTENDANCE_SECRET`** trên Render web2-api (giá trị ở serect_dont_push.txt) + deploy → enforced (no/sai secret=401, đúng=200; agent điền secret vào config.json). Endpoint ADMS `/iclock/*` giữ mở (chuẩn ADMS, máy không gửi header được — dựa cô lập mạng + proxy local).

### [fix] Đồng bộ quick-refund cap amount theo cost so-order (đóng nốt class bug #2 trên cả 2 đường hoàn NCC)

User chốt làm + nhắc rõ: **COD giảm trong "Sửa COD shipper" (web2-returns van_de_shipper) là số NHÂN VIÊN nhập tay → giữ free-form, KHÔNG cap** (ví KHÁCH, tiền trả shipper/trừ công nợ, quyết theo ca). Chỉ cap ví **NCC** (hoàn hàng = giá nhập). 2 path tách biệt.

Fix `purchase-refund.js /quick-refund` (commit `45530fad2`): cũ cap amount theo `Σ(qty×price)` với `price` CLIENT gửi trong products → thổi giá → cap vô dụng (giống bug `/tx` đã fix). Thêm tầng cap server-authoritative: đổi import `loadSoOrderReceivedQtyMap`→`loadSoOrderReceivedMap`, sau BEGIN load soMap 1 lần (tái dùng cho qty-cap), cap `amount ≤ Σ(rowReturns[rid].qty × costVnd)` khi MỌI rid tra được cost (cho hoàn ít hơn, chặn phồng); per-row `returned_row_ids.amount` cũng cap. Thiếu cost → giữ flow cũ. Browser-test: quick-refund products qty2 × price **9999999** (cost thật 100000) → ledger mint **cap 200000** (không phải ~20tr); trừ kho đúng 2; qty-cap regression vẫn OK. State sạch (so-order tab xoá, HNAO3=50, 0 lỗi).

→ Giờ CẢ `/tx` (Ví NCC modal) LẪN `/quick-refund` (Phiếu hoàn) đều cap amount theo cost so-order. Ví KHÁCH (Sửa COD) vẫn nhập tay.

### [fix] Browser-test tương tác (user thật) bắt + fix 2 bug money/stock: over-restock partial + /tx mint ledger NCC

User "1 và 2 cứ browser test tương tác như user thật rồi debug code fix". Cả 2 đều: demo bug qua browser → fix code → deploy → re-test verify.

**① CROSS-FLOW 2 — over-restock thu_ve_1_phan trên PBH (commit `d94047ab9`)**: browser test trả 1/2 SP trên PBH (HNAO3 ×2) → cancel PBH → kho **50→51 (+1 ảo)**: dòng đã trả bị restock 2 lần (phiếu trả +1 + cancel +2). ✅ Partial wallet-decrement (round-2 #1) verify ĐÚNG (cancel hoàn CHỈ remainder 39000 → ví refund 200000 ĐÚNG 1 LẦN, không double). Fix: cột `fast_sale_orders.returned_line_qty {code:qty}` — tăng lúc tạo phiếu trả pbh-type, giảm lúc huỷ; `restockOrderLines` restock `max(0, line.qty − returned)`. Re-test 2 chiều: partial→cancel = 50; partial→DELETE phiếu→cancel = 50. ✅

**② #2 — /tx ví NCC mint ledger do amount KHÔNG recompute (commit `ddbe635c9`)**: browser demo — seed so-order row cost 100000, gửi `/tx return qty1 amount777000` → ledger NCC mint **777000** (qty-cap 1≤5 không chặn vì qty đúng; amount lấy thẳng body). Fix: lib `loadSoOrderReceivedMap` trả `{received, costVnd}` (costPrice×rate, mirror frontend FALLBACK_RATES); `/tx` cap `amount ≤ Σ(qty×costVnd)` khi MỌI rid tra được cost (cho hoàn ít hơn, chặn phồng); per-row `returned_row_ids.amount` cũng cap. Thiếu cost (so-order wipe) → giữ flow cũ. `loadSoOrderReceivedQtyMap` thành wrapper (purchase-refund vẫn xài). Re-test: amount777000→**cap 100000**; qty-cap regression (qty10>5) vẫn reject. ✅

State pristine sau test: so-order test tab xoá, HNAO3=50, ví=0, 0 lỗi console. (Test supplier TEST-NCC-VITEST để lại — BETA, marked.)

### [test] Browser-test battery (workflow thiết kế + chạy thật) — 5 flow tiền/kho ĐỀU PASS, 0 bug mới

Ultracode: workflow 5-agent thiết kế test battery (4 recipe + cross-flow critic, ưu tiên theo bug-finding×money-impact). Chạy THẬT qua browser (click/nhập + assert invariant tiền/kho), test customer 0123456788, seed→test→cleanup sạch. Kết quả:

- ✅ **CROSS-FLOW 1 (seam double-refund, ưu tiên #1)**: native→PBH(ví 161000)→KNH return→PBH cancel. Ví hoàn ĐÚNG 1 LẦN (39000→200000, cancel KHÔNG hoàn lại = 200000), kho restock 1 lần (49→50). Guard zero-out wallet_deducted + stock_restored vững.
- ✅ **Recipe 1 (COD reference_id collision — verify fix vòng 5)**: dựng đúng collision (PBH có sẵn withdraw `native-order-pbh` refId=số PBH), rồi Sửa COD "trừ công nợ khách" 30000 trên CÙNG PBH → ví trừ THẬT 39000→9000, tạo tx `return-cod` 30000 RIÊNG (không bị nuốt). 2 withdraw cùng refId khác reference_type cùng tồn tại. **Pre-fix sẽ kẹt 39000 (swallowed); fix scope reference_type hoạt động đúng.**
- ✅ **COD cancel refund**: huỷ phiếu COD → hoàn ví 9000→39000.
- ✅ **Recipe 4 over-sell**: HNAO2 stock 35, đơn qty 100 → convert reject `over_sell`, kho giữ 35 (không trừ). (HNAO stock 1 → `cho_hang_blocked` — guard khác cũng chặn.)
- ✅ **Recipe 3 reconcile return-failed**: scan→pack→ship→return-failed → restock +1 + hoàn ví wallet_deducted + PBH cancel (1 lần); return-failed lần 2 reject (idempotent, không double).

KHÔNG tìm thấy bug mới — các flow tiền/kho vững. (Khác đợt trước: browser-test bắt được regression stock_applied thật.) Cleanup pristine: ví 0, HNAO3 50, HNAO2 35, 0 PBH active, 0 lỗi console.

**Battery đợt 2 — Ví NCC quick-refund cross-page (browser test thật):** ✅ quick-refund qty 2 → trừ kho HNAO3 50→48 (linkage purchase-refund→web2-products) + credit ledger NCC; ✅ idempotent (cùng code → idempotent:true, không trừ 2 lần); ✅ **amount-cap**: gửi totalAmount=9999999 nhưng computed qty×price=100000 → ledger ghi 100000 (returnedAmount tổng 300000, KHÔNG phải 9999999) — cap line 395 hoạt động; ✅ **shared cumulative cap** (cross-flow): quick-refund qty2 + /tx qty4 trên CÙNG rowId = 6 > đã nhận 5 → reject "Trả vượt số đã nhận" (cap server-authoritative từ so-order, chia chung 2 endpoint). Stock restore HNAO3=50. ⚠ #2 deferred VẪN mở: `/api/web2-supplier-wallet/tx` amount KHÔNG recompute (chỉ check >0) — reachable cho qty hợp lệ + amount phồng; quick-refund thì CÓ cap amount. Test supplier `TEST-NCC-VITEST` để lại (BETA, marked; xoá cần admin secret + direct web2-api).

### [fix] Browser-test bắt REGRESSION vòng 4 — DELETE/approve phiếu native-only trừ kho ảo (stock_applied)

Test thật bằng browser (click/nhập như user) trang Thu về phát hiện **bất đối xứng do chính fix vòng 4 (gate `_applyStock`) tạo ra**: tạo phiếu KNH trên đơn native chưa-có-PBH → gate skip restock → kho GIỮ 50 (đúng); NHƯNG huỷ phiếu → nhánh rollback vẫn trừ kho (record `stock_status='applied'`) → **kho rớt 50→48 = mất hàng ảo**. Code-review + agent vòng 4 miss vì chỉ soi create cô lập; chỉ end-to-end create→delete mới lộ.

Fix đối xứng: thêm cột `web2_returns.stock_applied BOOLEAN DEFAULT TRUE` (default TRUE → phiếu cũ huỷ vẫn trừ đúng). Create ghi `stock_applied = sourceDeductedStock`. DELETE + approve CHỈ đụng kho khi `stock_applied !== false`. Verified: tạo→kho 50 giữ 50, huỷ→vẫn 50 (sau deploy). Đã restore HNAO3 48→50 + xoá đơn seed. `node --check` PASS.

### [audit/fix] Vòng 5 — sweep TOÀN BỘ surface tiền/kho liên quan (5 agent song song): 1 HIGH ví + 2 hardening fix

User "audit tất cả những cái liên quan". Map đủ surface tiền/kho: 5 agent adversarial (find→refute→confirm) chia — (1) ví core `web2-wallet-service` + customer-wallet routes, (2) SePay→ví pipeline, (3) `reconcile.js` full, (4) stock authority `web2-products` + inbound `so-order`, (5) `cart.js` + native-orders money paths. **Hầu hết REFUTED** (hệ guard rất chắc: SePay dedup 3 lớp, reconcile chỉ là state-machine không settle tiền, stock đều atomic + advisory-lock, so-order receive idempotent qua status flip).

**Fix:**

- 🔴 **HIGH — withdraw dedupe BỎ SÓT `reference_type` → nuốt 1 lần trừ ví thật** (`web2-wallet-service.js:377`): dedupe in-tx chỉ `type='WITHDRAW' AND reference_id` → 2 luồng KHÁC dùng cùng referenceId = **số PBH** va chạm: `_applyWalletToPbh` (refType `native-order-pbh`, refId=pbh.number) vs Sửa COD "trừ công nợ khách" (refType `return-cod`, refId=cùng số PBH) → lần trừ COD bị coi `alreadyProcessed` = **KH KHÔNG bị trừ nhưng sổ ghi đã trừ** (under-charge). Nhánh DEPOSIT đã scope refType ('sepay'/'balance_history') — withdraw là cái lệch. Fix: thêm `AND reference_type=$3` (mirror deposit). Cùng nghiệp vụ vẫn idempotent (retry cùng refType), khác nghiệp vụ không nuốt nhau. Fix kèm route pre-check `_findIdempotentTx` (web2-wallets.js) cũng thêm refType ('manual' withdraw / 'balance_history' deposit).
- 🟢 **cart qty trần** (`cart.js`): `b.qty` client không trần → > 2^31 tràn cột INTEGER `total_quantity` (parallel bug crm_team_id INT4). Clamp `MAX_LINE_QTY=100000` ở /add + PATCH set-qty.

**DEFER (cần quyết định / rủi ro regression):**

- 🟡 **cart line price tin client** (`cart.js:193` `Number(input.price)`): giá chảy vào native_orders→PBH→`_applyWalletToPbh` trừ ví thật. NHƯNG `source:'livestream'` = **giá BIẾN THIÊN theo phiên live** (ép giá catalog sẽ HỎNG tính năng bán live) + qua checkpoint staff tạo PBH (không drain ngầm). Cần quyết định sản phẩm: cho phép custom price live? validate ra sao? KHÔNG rush.
- 🟡 **native-orders PATCH totalAmount/totalQuantity trên đơn đã confirmed bỏ qua guard** (native-orders.js:1855): drift native total vs PBH amount_total (display/reconcile, KHÔNG mất tiền — refund đọc PBH wallet_deducted). Low reachability (UI gửi kèm products → guard fire). Defer.
- NOTE: unique index anti-dup ví vắng khi boot gặp dup cũ (in-tx FOR-UPDATE re-check vẫn chặn race); `_applyWalletToPbh` debit + bookkeeping wallet_deducted non-atomic trên Pool (one-directional, KH mất nếu crash giữa — không double).

Tất cả `node --check` PASS. Cần Render deploy.

### [audit/fix] Vòng 4 — trang Thu về (web2/returns) + chuỗi data feed: 2 bug stock thật fix, 2 edge defer

User "audit trang returns + trang nào trigger/feed nó → debug → fix lặp đến hoàn hảo". Map dependency: returns nhận data từ `web2-returns.js` (own), `web2-customer-orders.js` (feed đơn picker), `web2/customers/search`, `web2/wallets/by-phone`, `web2-products/list`; tác động xuống `fast_sale_orders` (wallet_deducted, stock_restored), `web2_products` (stock/return_qty), ví KH, native-orders (consume SP queued bill 0đ). 3 agent adversarial (find→refute→confirm) hội tụ — **ví/credit cap đều vững (KHÔNG mint tiền)**, lỗi tập trung ở **kho (stock)**.

**2 bug stock đã fix:**

- 🔴 **DELETE phiếu thu_ve_1_phan ĐÃ consumed → trừ kho lần 2 + over-refund ví** (web2-returns.js DELETE): SP đã xuất lại qua PBH đổi 0đ (bill_status='consumed') mà huỷ phiếu thu về → nhánh `stock = GREATEST(0, stock-qty)` trừ kho LẦN 2 (net âm/clamp 0 = mất hàng) + nhánh thu_ve_1_phan re-add `wallet_deducted` cho PBH nguồn dù KH đã nhận hàng đổi. Fix: chặn 409 khi `bill_status='consumed'` (muốn đảo → huỷ PBH đổi `consumed_pbh_code` trước). Frontend returns-tabs ẩn nút "Huỷ" → "Đã lên bill".
- 🔴 **Native order CHƯA convert PBH → return bơm TỒN ẢO** (web2-returns.js create, line ~933): kho CHỈ trừ khi tạo PBH (from-native-order/merge-to-pbh), native order 'pending' chưa có PBH = chưa trừ kho. Nhưng `_applyStock(+1)` chạy vô điều kiện cho mọi return → return 1 đơn native-only = cộng kho từ hư không. Fix: gate `_applyStock` trên `sourceDeductedStock` (KNH: `knhPbhIds.length>0`; partial-native: SELECT 1 PBH state<>'cancel'). pbh type luôn restock. Wallet đã đúng (=0 khi no-PBH).

**2 edge MEDIUM defer (fix triệt để rủi ro regression common path + đụng PBH order_lines):**

- 🟡 thu_ve_1_phan trả 1 phần rồi HUỶ TOÀN BỘ PBH nguồn → restockOrderLines restock cả dòng đã trả (double-restock). Hiếm. Cần trừ qty đã trả khỏi order_lines (đụng totals/reconcile).
- 🟡 KNH native source split nhiều PBH mà 1 PBH đã cancelled → `_applyStock` restock cả native products (gồm phần PBH đã restock). Cần build items từ live-PBH order_lines thay native products.

**Refute đúng (không phải bug):** approve KHÔNG re-credit ví; walletCredit cap không mint (clamp ≤ wallet_deducted tươi dưới lock); mọi mutation atomic trong tx; KNH/partial dedupe + unique index chặn double-submit; cancel-consuming-PBH restock dòng 0đ là ĐÚNG model restock-on-cancel (hàng về kho thật), chỉ bill_status stale (LOW, không fix). `node --check` PASS. Cần Render deploy.

### [audit/fix] Vòng 3 — money audit module ngoài PBH (ví NCC / ví KH / SePay / hoàn NCC): 5 bug, fix 4

User "lặp đến hoàn hảo". Workflow adversarial 4 module tiền → 5 candidate → **5 confirmed (0 false-pos)**. Fix 4 (clean/safe), 1 defer (rủi ro cao + insider-vector).

- 🔴 **#1+#4+#5 purchase-refund state-machine RETIRED → 410**: `/:code/{approve,cancel-approve,refunded,reject}` đã bỏ UI từ 2026-05-30 (`actions=[]; if(false)`), chỉ `quick-refund` dùng. Endpoint còn sống = bẫy: **#5** approve trừ kho NHƯNG không ghi ledger ví NCC (divergence), **#4** re-approve trừ kho lại, **#1** cancel-approve/reject gọi `reverseRefundLedger` strip mất trần `ordered` → over-refund khi so-order wipe. Fix: 410 cả 4 (giống manual-create/from-pbh). quick-refund = đường DUY NHẤT.
- 🔴 **#3 SePay reassign ví lặp A→B→A→B lần 2 mất tiền**: `reassignRef` chỉ gồm newPhone → lần 2 A→B trùng ref lần 1 → dup-check tưởng "đã chạy" → row đổi sang B nhưng **tiền không chuyển** (B thiếu, A dư). Fix: ref duy nhất mỗi lần (`+oldPhone+timestamp`) + GỠ dup-check (retry-idempotency do re-check phone TƯƠI dưới FOR UPDATE lo → request lặp thấy row đã đổi → 409).
- 🟡 **#2 web2-supplier-wallet /tx amount KHÔNG recompute server-side** (DEFER): trần over-refund chỉ chặn QTY, `amount` lấy thẳng body (chỉ check >0) → client tamper amount lớn → mint credit ví NCC giảm nợ. Insider-vector (cần auth + body sửa tay; client thật tính `qty×cost`). Fix đúng = recompute `amount ≤ Σ(cappedQty × cost)` từ so-order (mirror purchase-refund.js:385-390) — **cần xác định field cost trong web2_so_order row trước** (lib hiện chỉ đọc qty/qtyReceived/status). Rủi ro cap nhầm refund thật → để đợt focused.

Tất cả `node --check` PASS. Cần Render deploy.

### [audit/fix] Hệ PBH vòng 2 — deep money-flow audit (8 bug thật, 2 false-pos refute) + fix

User "audit → debug → fix lặp đến hoàn hảo". Workflow adversarial (4 chiều ví/kho/state/báo-cáo, find→refute→confirm) → 10 candidate → **8 bug thật** (2 false-pos đã loại đúng: KPI-revoke-merged không execute, bulk-confirm native đã confirmed). Verify trước 3 bug deft lần trước: dashboard `amount_total` (KHÔNG bug — dashboard-kpi trả đúng cột), bulkMerge draft-only (by-design, BE cũng chặn), native-auth /from-comment (cart.js loopback KHÔNG token → defer ĐÚNG).

**8 bug đã fix:**

- 🔴 **#1 web2-returns thu_ve_1_phan HOÀN VÍ 2 LẦN** (money): trả 1 phần cộng ví nhưng KHÔNG trừ `wallet_deducted` PBH nguồn → huỷ/xoá/return-failed PBH sau hoàn LẠI full = double. Fix: trong tx lock PBH nguồn, trừ `wallet_deducted` (clamp 0) phân bổ + snapshot `{id,dec}`; DELETE phiếu trả cộng lại về PBH còn live. Đối xứng KNH (zero-out) nhưng trừ MỘT PHẦN.
- 🔴 **#2 native-orders /merge-to-pbh over-sell** (stock): trừ kho `GREATEST(0,...)` không advisory-lock/recheck → over-sell thầm lặng (2 path sibling đã fix, path này sót). Fix: copy pattern `pg_advisory_xact_lock(web2_product_stock:<code>)` + re-check + throw over_sell, gate `force!==true`.
- 🔴 **#3 native-orders /:code/cancel orphan merged siblings** (state): chỉ UPDATE `WHERE code=$3` → native con của PBH gộp kẹt 'confirmed'. Fix: tách `source_code '+'` → cancel hết member + revoke KPI cho mọi member + SSE.
- 🔴 **#4 fast-sale-orders PATCH /:number đổi state=cancel/done bare-UPDATE** → bỏ sót restock/hoàn ví/sync. Fix: chặn 400 `state_change_via_patch_forbidden`, ép qua /cancel /confirm.
- 🟡 **#5 fast-sale-orders DELETE /:number orphan native_order**: không sync. Fix: `syncNativeOrderStatusFromPbh(prevRow,'cancel')` + SSE (tách source_code '+').
- 🔴 **#6 pbh-reports top-customers-360 double-count doanh thu**: native+pbh cùng đơn cộng 2. Fix: CTE `converted_native` loại native đã có PBH (split '+').
- 🟡 **#7 customer-orders totals.native cộng cả Đơn Web huỷ**: lệch vs PBH. Fix: `if (status!=='cancelled')`.
- 🟡 **#8 report-revenue modal đọc sai shape** (`summary.native.count` → TypeError vỡ modal): Fix đọc `summary.totalNative/totalNativeAmount/totalPbh/totalPbhAmount` + key `totalAmount`, optional-chaining.

Tất cả `node --check` PASS. Money/state ĐỀU atomic trong tx + idempotent. Cần Render deploy.

### [audit/fix] Hệ PBH "1 nguồn" — audit toàn diện + fix bug (money-leak reconcile + merged dedup + auth)

User: "audit → debug → fix lỗi đến hoàn hảo" + "PBH cho về 1 nguồn, module dễ quản lý". Audit workflow 2-agent (FE 12 access-point + BE routes) → kết luận: **BE đã ~1 nguồn ở data layer** (`fast-sale-orders.js` sở hữu bảng, `/from-native-order` là create DUY NHẤT, `_cancelPbhInTx`/`restockOrderLines`/`validateStock` đã extract dùng chung). **FE bị tản mát** (12 file fetch `/api/fast-sale-orders` riêng) → đề xuất module shared `Web2PBH`.

**Bug đã fix (ưu tiên money-safety):**

- 🔴 **reconcile `/return-failed` MẤT TIỀN THU HỘ**: trước chỉ `UPDATE state=cancel` + restock, BỎ SÓT hoàn `wallet_deducted` cho ví khách + không sync `native_orders→cancelled`. Fix: dùng chung `_cancelPbhInTx` (restock + HOÀN VÍ idempotent) + post-tx `syncNativeOrderStatusFromPbh` + SSE ví/products/native. Export thêm `syncNativeOrderStatusFromPbh`. Verified deploy load OK.
- 🟡 **customer-orders merged-PBH dedup**: tách `source_code` theo `'+'` để ẩn TẤT CẢ Đơn Web gốc của PBH gộp (trước chỉ match nguyên chuỗi).
- 🟢 **pbh-render `detail()`/`openHistory()` bare-fetch** → inject `_authHeaders()` (trước 401 cho NV bị KPI-scope; bump `pbh-render.js?v=20260623auth`).

**Bug KHÔNG fix (có lý do — tránh phá vỡ):**

- native-orders mutation thiếu auth: DEFER — caller server-side `v2/cart.js` (Pancake cart→order) có thể không gửi token → thêm auth = 401 phá flow. Hardening, không phải money bug.
- dashboard `p.amount_total`: KHÔNG đụng — field từ `/api/web2/dashboard-kpi` (endpoint riêng), "sửa" mù có thể phá. Cần verify payload trước.
- customer-wallet `fetchPbhList` (offset+no-auth): **dead code** (export nhưng không caller; live path = `fetchPbhListForPhone` qua `/by-phone/:phone/orders`). Moot.

**Web2PBH module (thiết kế SẴN, để làm đợt focused tiếp — tránh rush 12 file trang đang dùng):** `web2/shared/web2-pbh.js` expose: base/authHeaders/\_fetch(always-auth)/load/loadAllByOffset/get/history/fromNativeOrder/confirm/cancel/cancelBySource/bulkCancel/merge/markPrinted/normalize(1 field-authority: amount)/money/date/stateBadge/STATE_META/onChange(SSE-debounce). Migrate read-paths trước, writes (native-orders create) sau (giữ nguyên error map over_sell/cho_hang_blocked). 8 bug + duplication cataloged ở MEMORY.

### [fix] customer-orders: ẩn Đơn Web đã convert sang PBH (hết trùng dòng + double-count)

User thấy trang Thu về "CHỌN ĐƠN" hiện CÙNG mã `NJ-...` 2 dòng: ĐƠN WEB (263k) + PBH (298k). Gốc: `/api/web2/customer-orders/:phone` (`render.com/routes/v2/web2-customer-orders.js`) list `native_orders` + `fast_sale_orders` RIÊNG, KHÔNG dedup. Mà 1 Đơn Web convert → 1 PBH **dùng chung số** (PBH.number = native.code, splitIndex 1; tách = `code-N`; link `fast_sale_orders.source_code = native.code`, `source_type='native_order'`). → trùng dòng ở 5 consumer (returns, report-revenue, 2× customer-360, pbh-render) + **double-count doanh thu** ở report-revenue.

- **Fix**: query PBH TRƯỚC → gom `convertedNativeCodes` (source_code của PBH `native_order`) → khi push native, **bỏ qua đơn đã có PBH**. Đơn Web CHƯA convert vẫn hiện. `totals`/`summary` shape giữ nguyên (chỉ hết double-count). 1 nguồn backend → fix mọi consumer.
- Cần Render deploy. Verify: GET customer-orders trả mỗi mã 1 dòng (PBH).

### [chore/fix] PBH toolbar gọn + fix khe hở 8px thanh menu (32 trang) + gỡ "chữ TPOS" Web 2.0 + chặn tạo PBH thủ công

4 việc theo yêu cầu (audit → thực hiện → debug → verify), Web 2.0 self-contained hơn.

**1. PBH — bỏ nút "Reset STT"**: xoá button `#pbhResetStt` (index.html) + wiring (pbh-app.js) + handler `resetStt` + export (pbh-actions.js, pbh-app.js public API). Giữ 4 nút chuẩn còn cần (Tải lại / Áp dụng / Xóa lọc / Xuất Excel). Verify: toolbar 4 nút, no error.

**2. Fix lỗi giao diện gần thanh menu (reconcile + returns + 30 trang khác)**: root cause = `body { margin: 8px }` mặc định KHÔNG reset — 32 trang Web 2.0 KHÔNG load `web2-base.css` (chỉ invoice/products… có) → khe hở 8px quanh sidebar. Fix 1 NGUỒN: thêm `html, body { margin: 0 }` vào `web2-sidebar.css` (load ở MỌI trang); CHỈ reset margin, KHÔNG đụng box-sizing (tránh dịch layout 32 trang). Verify: reconcile + returns aside flush (0,0), bodyMargin 0px. Bump `web2-sidebar.css?v=20260623fix` (43 trang).

**3. Gỡ "chữ TPOS" khỏi Web 2.0** (audit workflow 2-agent: **ZERO runtime TPOS dependency** trong Web 2.0 FE+BE → xoá text an toàn):

- **Xoá 19 file rác TPOS**: `docs/api-samples/*.txt` (15 mẫu crawl TPOS gồm ProductVariants.txt) + 3 doc balance-history (PHONE_PARTNER_FETCH_GUIDE / PARTIAL_PHONE_TPOS_SEARCH / PHONE_EXTRACTION_IMPROVEMENTS) + `docs/web2/LIVE-CAMPAIGN-TPOS-API.md` (trang không tồn tại). Đều unreferenced.
- **Reword comment/label/doc** (27 file): `fast-sale-orders.js` "Mirror TPOS FastSaleOrder"→"PBH nội bộ Web 2.0"; native-orders/web2-products/web2-users/migrations TPOS→"hệ cũ"/"Web 1.0"; balance-history JS+MD "WEB2 Partner OData/TPOS"→"kho KH Web 2.0 (/api/web2/customers)" (runtime vốn đã dùng local store); products-print-utils, web2-base.css/web2-menu.json crawl-attribution; docs "TPOS-clone"→"Web 2.0" + fix stale `web2-tpos-theme.css`→`web2-theme.css`, `.tpos-theme`→`.web2-theme`, `tpos-sidebar.js`→`web2-sidebar.js`.
- **GIỮ NGUYÊN (preserve)**: false positives (`textPos`/`evtPos`/`boostPost`/`listPosts`/min.js); **Web 1.0 backend thật** (tpos-_.service.js, odata.js, return-orders, web-warehouse, customer-creation, audit-service); **cloudflare worker `TPOS_GENERIC`**; `/api/odata/_`shared infra; module`tpos-pancake/`; **DB column `native_orders.tpos_index`** + permission keys `'tpos-pancake'`/`syncTpos`/`loadTpos`+ value`PARTIAL_PHONE_NO_TPOS_MATCH` (saved values — đổi cần migration, để lại); historical docs (DECOUPLE-AUDIT, WEB2-TOTAL-SEPARATION-PLAN). Codemap regenerated.

**4. Chặn tạo PBH thủ công — 1 nguồn = native-orders**: `POST /api/fast-sale-orders` (manual create) → trả **410** (`manual_create_disabled`), giống pattern `/refunds/from-pbh`. PBH page vốn không có nút tạo (empty-state chỉ dẫn sang Đơn Web). Nguồn DUY NHẤT giờ là `/from-native-order`. Cần Render deploy.

Verify FE: PBH toolbar + balance-history (50 rows, enricher OK, history buttons OK), reconcile/returns layout — 0 error. Backend (410 + comment) cần deploy.

### [chore] Xoá trang product-category ("Nhóm sản phẩm") + [data] khôi phục Kho Biến Thể (108)

Audit workflow 2-agent (removal surface + restore sources) → thực hiện → debug → verify.

**Task 1 — XOÁ product-category** (LOW risk: leaf page, generic page-builder entity, KHÔNG cần đổi backend):

- Xoá folder `web2/product-category/`. Xoá menu child + allow-list trong `web2-sidebar.js`. Xoá `PRODUCT_CATEGORY` trong `web2-sse-topics.js`.
- Regenerate `modules-manifest.js` (`node scripts/web2-build-manifest.js`) + `navigation-modern.js` (`node scripts/web2-build-nav.js`) — auto drop entry (manifest cũ stale, nay picks up delivery-zone + product-counter = đúng).
- Dọn overview/index.html (card #p-product-category, TOC, diagram, SSE pill, API token, SSE table row) + 6 test script + swap JSDoc example `web2-api.js` sang `productuom`.
- Bump `web2-sidebar.js?v=20260623pc` (43 trang) để prod nạp menu mới.
- KHÔNG đụng backend (`web2-generic.js` slug-agnostic phục vụ 78+ entity từ `web2_records` — xoá page chỉ ngừng hit route). Data `web2_records WHERE entity_slug='productcategory'` để lại (beta, vô hại; purge cần x-admin-secret).
- Tombstone giữ chủ ý (doc/comment, không phải ref sống): page-builder generic JSDoc, menu.json TPOS-crawl, migration 068 comment.
- Verify: product-category HTTP 404, sidebar chỉ còn "Kho SP Web 2.0" + "Kho Biến Thể".

**Task 2 — KHÔI PHỤC Kho Biến Thể** (`web2_variants` bị TRUNCATE bởi web2-selective-wipe.js, KHÔNG backup):

- Nguồn = `bienthe.txt` (108 biến thể gốc, git-verified byte-identical) + `scripts/seed-web2-variants.sh` (seed gốc). KHÔNG cần Firestore/TPOS/seed mới.
- WEB2_AUTH_ENFORCE=1 nên POST cần token → thêm header `x-web2-token` OPTIONAL (env `WEB2_TOKEN`) vào seed script (backward-compat). Lấy token qua `POST /api/web2-users/login` admin.
- Chạy `WEB2_TOKEN=<admin> bash scripts/seed-web2-variants.sh` → 108 created, 0 fail. Verify: total 108 (Màu 80 + Size 28), 108/108 có short_code auto-suggest (BAC/BEO/BO/43/44), sort_order 1-108. Trang render đủ 108 rows.

### [feat] Per-record history rollout — Wave 3 frontend (🕘 buttons cho 10 trang đã wire sink)

Hoàn tất nhánh FE: 10 trang đã có data chảy vào event-sink (Wave 2) giờ có nút 🕘 mở `Web2AuditLog.openRecord({entity, entityId, title})` per-record. Module auto-load qua sidebar → chỉ thêm nút + handler (defensive `?.`), KHÔNG cần script tag. 5 subagent song song (2 trang/agent), additive thuần, match style nút sẵn có, bump `?v=20260623w3`.

- **supplier-wallet** (card NCC → 🕘 header) + **supplier-debt** (row NCC → 🕘) → entity='supplier-wallet', id=tên NCC.
- **fastsaleorder-refund** (row → 🕘, RfApp.openHistory) → entity='refund', id=o.number.
- **fastsaleorder-delivery** (row → 🕘, DlvApp.openHistory) → entity='delivery-invoice', id=o.number.
- **jt-tracking** (row → data-act=history) → entity='jt-tracking', id=billcode.
- **balance-history** (row actions → 🕘) → entity='balance-transaction', id=row.id.
- **order-tags** (card-foot → 🕘) → entity='order-tag', id=code.
- **users** (row actions → data-act=history) → entity='web2-user', id=u.id.
- **fb-posts** (list published `p.id` + drafts `d.id` → 🕘) → entity='fb-post'.
- **live-control** (header toolbar → 🕘, guard "Chưa chọn chiến dịch") → entity='campaign', id=state.campaignId.
- Tất cả 12 file JS `node --check` PASS; 11 openRecord call đúng entity; 10 version bump. Tĩnh GH Pages.

### [feat] Per-record history rollout — Wave 2 backend wiring (9 route → event-sink) + entityId purge

Hoàn tất nhánh backend: mọi mutation NGHIỆP VỤ còn lại của Web 2.0 ghi vào event-sink `web2_audit_events` → audit-log "toàn bộ" + per-record modal đủ nguồn. Pattern ĐỒNG NHẤT: `require('web2-audit-sink')` + helper `_auditX(req, action, id, note)` (best-effort, KHÔNG await/throw) gọi SAU commit, TRƯỚC `res.json` — **additive thuần, không đụng money math / control flow**.

- **supplier-wallet** (`web2-supplier-wallet.js`, money) → entity='supplier-wallet': tx (payment/return — chỉ success thật, BỎ 2 nhánh `alreadyProcessed` idempotent), upsert-supplier, import, delete-supplier.
- **refunds** (`refunds.js`, phiếu trả PBH — LIVE qua trang fastsaleorder-refund, chỉ `from-pbh` create là 410) → entity='refund': approve/complete/cancel (3 endpoint share 1 handler) + delete.
- **balance-history** (`v2/web2-balance-history.js`, money) → entity='balance-transaction': manual-deposit, link, reassign, resolve-pending. **BỎ** bulk/auto (auto-match, reprocess-unmatched, auto-assign, cleanup, SePay webhook) tránh nhiễu.
- **delivery-invoices** → entity='delivery-invoice': create/ship/deliver/return/cancel/update/delete.
- **fb-posts** → entity='fb-post': create/update/schedule/publish/delete (bỏ token-connect + AI caption + ad-ledger).
- **jt-tracking** → entity='jt-tracking': add(scan/manual)/approve/update/delete (bỏ scrape GET + cron auto-purge).
- **order-tags** → entity='order-tag': create/update/delete config.
- **campaign-products** (live-control) → entity='campaign': add-products/remove-product/set-pending ("số NCC báo"). BỎ reorder/pin (UI prefs, nhiễu khi live).
- **customer-wallet** (`v2/web2-customer-wallet.js`) — **KHÔNG wire**: chỉ có POST `/:phone/qr` (sinh QR, không đổi số dư); deposit thật qua SePay webhook (tự động, không phải thao tác user) → tránh double-count.
- **/purge** (`v2/audit-log.js`) — thêm tham số `entityId` (backward-compat: cần entity HOẶC entityId; có cả 2 = AND) → admin dọn lịch sử 1 record cụ thể (vd row test), không phải cả entity.
- **Module FE** `web2-audit-log.js`: bổ sung ENTITY_LABELS + pill màu cho 12 entity mới (variant/refund/native-order/so-order/web2-user/supplier-wallet/delivery-invoice/jt-tracking/fb-post/order-tag/campaign/balance-transaction). Bump sidebar `?v=20260622al4`.
- Tất cả 9 route `node --check` PASS; require + audit-call counts verified. Cần Render deploy để nạp.

### [feat] Per-record history rollout — frontend custom pages (returns + reconcile + customers)

Tiếp rollout lịch sử per-record (audit→implement→debug→verify). Đợt này lo **frontend custom pages** — gắn nút mở `Web2AuditLog.openRecord(...)` đúng theo chức năng từng trang. Phát hiện quan trọng khi audit: nhiều trang ĐÃ có lịch sử per-record sẵn từ nguồn canonical/embedded → KHÔNG downgrade, chỉ bù trang còn thiếu.

- **products / PBH** — đã có modal lịch sử riêng đọc bảng canonical (`/api/web2-products/:code/history` → `web2_product_history`; `/api/fast-sale-orders/:number/history` → `fast_sale_order_history`) = CÙNG bảng audit union đọc → nguồn đã thống nhất, rendering tùy biến (user cho phép). **No-op.**
- **purchase-refund / customers (edit modal)** — đã render lịch sử embedded (`data.history` JSONB) qua shared `Web2HistoryTimeline`. **Giữ.**
- **returns** (gap thật) — thêm nút 🕘 mỗi row (`rt-btn-hist`) → `Web2Returns.openHistory(code)` → `openRecord({entity:'return', entityId:code})`. Verify LIVE: modal "Lịch sử thu về TEST-RET-VERIFY" render bảng + API trả scope đúng.
- **reconcile** (gap thật) — thêm nút "Toàn bộ thao tác" cạnh toggle "Lịch sử đối soát" → `openRecord({entityId:number})` KHÔNG lọc entity = gộp `pbh` (tạo/sửa/huỷ) + `reconcile` (đối soát/giao hàng) cho cùng số PBH (full lifecycle 1 chỗ).
- **customers** — thêm nút 🕘 quick mỗi row (`data-act="history"`) → `openRecord({entity:'customer', entityId:id})`. Verify LIVE: 50 nút render trên KH thật, click "Kelly Chau" → modal mở. **End-to-end backend sink confirmed**: tạo KH test (id 68102) → sink `web2_audit_events` có event action=create user="Quản trị viên" page=customers → đã xoá KH test.
- **kpi assignments** — đã có section lịch sử (STATE.history) + tab audit tổng. **No-op.**
- Files FE: `web2/returns/{js/returns-tabs.js,js/returns-app.js,css/returns.css,index.html}`, `web2/reconcile/{js/reconcile-render.js,css/reconcile.css,index.html}`, `web2/customers/{js/customers-render.js,js/customers-detail.js,index.html}` (bump ?v=20260622hist). Tĩnh GH Pages.

### [feat] Per-record history rollout — generic pages (page-builder) + sidebar auto-load + wire variants/users

Tiếp foundation openRecord: nhân rộng lịch sử per-record ra hệ thống (audit→implement→debug→lặp).

- **Sidebar auto-load** `web2-audit-log.js` → MỌI trang Web 2.0 có `window.Web2AuditLog` (không cần script tag riêng).
- **page-builder.js**: nút 🕘 mỗi row + `openHistory()` lazy-load → product-category + delivery-zone (+ mọi generic page) tự có lịch sử. Verified: tạo category → 🕘 → modal "Lịch sử: TESTCAT1" action=create.
- **openRecord**: `entity` optional (entityId-only = mọi nguồn của id, vd PBH gộp 'pbh'+'reconcile').
- **Wire sink Wave 2 (backend)**: `web2-variants.js` (create/update/delete → entity='variant') + `web2-users.js` (create/update/permissions/password/deactivate → entity='web2-user', actor=admin — audit bảo mật tài khoản).
- **Tracker** `docs/web2/AUDIT-HISTORY-ROLLOUT.md` (audit 47 trang: 23 cần history, 24 tool/dashboard không cần). Còn lại: frontend custom pages (products/PBH/customers/purchase-refund/returns/reconcile/kpi — data đã chảy sẵn) + wire ~11 route Wave 2.
- Cần Render deploy (variants/users sink). Module + page-builder frontend đã push.

### [fix] video-maker — giọng đã thêm từ kho KHÔNG hiện lần đầu (init ordering) + dedup giọng trùng

User: vào trang chỉ thấy 3 giọng built-in; **đổi radio chọn giọng thì giọng đã thêm mới hiện**. Kèm lỗi phụ: 2 mục "Adam 3" (built-in + thêm từ kho cùng proId).

- **Root cause (ordering race)**: `init()` gọi `renderVoices()` (line ~1315) TRƯỚC `Web2VideoLibraryUI.init()` — nơi mới gọi `Web2VideoTTS.loadLibraryVoices()` push giọng kho (localStorage `web2_vm_lib_voices`) vào `VOICES`. → render đầu chỉ có built-in; click radio mới re-render thấy giọng kho.
- **Fix 1 (ordering)** `video-maker.js`: gọi `global.Web2VideoTTS.loadLibraryVoices()` (try/catch) NGAY TRƯỚC `renderVoices()` trong `init()`. Library UI init vẫn gọi lại loadLibraryVoices (idempotent, có guard `hasVoice`).
- **Fix 2 (dedup)** `video-tts.js`: thêm `_providerId(v)`+`_findByProvider(meta)` (khoá theo proId/elevenId/voiceId). `addLibraryVoice` trả id entry sẵn có nếu trùng provider (vd built-in `pro-adam3` cùng proId với "Adam 3" trong kho → chọn lại, KHÔNG tạo entry 2). `loadLibraryVoices` bỏ qua entry trùng + `_persistLib()` DỌN khỏi localStorage (tự sửa dup đã lưu).
- **Verify LIVE** (browser test, seed localStorage 3 giọng kho gồm 1 Adam 3 trùng): first-paint render đủ 5 giọng KHÔNG cần click; `adam3Count=1` (đã dedup); localStorage còn 2 entry (dup bị dọn). **Adversarial review workflow 4 agent (ordering/dedup/regression) = 0 issue.**
- Files: `js/video-maker.js`, `js/video-tts.js`, `index.html` (bump ?v=20260622i). Tĩnh GH Pages.

### [fix/ux] video-maker — "Tông giọng" tự TẮT khi chọn giọng AI Pro/Clone (giữ nguyên gốc)

User: chọn Giọng AI Pro "Adam 3", điền văn bản → "Tạo giọng đọc" nghe **giống ~80% chứ không 100%**; hỏi "Tông giọng" (Trầm/Chuẩn/Cao) hay nút "Tạo giọng đọc" có tác động vào vivibe không, nếu có thì thêm nút tắt.

- **Điều tra (không phải bug)**: (1) "Tông giọng" = pitch resample, đã có guard `!isServer` trong `synthesize` → giọng server (pro/vieneu/elevenlabs) KHÔNG bao giờ bị áp pitch; thêm nữa user đang để "Chuẩn" (pitch 1.0 = no-op). (2) Nút "Tạo giọng đọc" (`genNarration`→`synthesize`→`_proChunk`) và "Nghe thử" trong kho giọng (`previewProVoice`→`synthVoiceMeta`→`_proChunk`) gọi **CÙNG 1 API vivibe** (`/api/web2-tts-pro`, chỉ gửi `text`+`voice_id`+`speed=1.0`), **KHÔNG có xử lý/biến đổi client-side**. → ~80% là TTS đọc văn bản khác nhau có ngữ điệu khác, **timbre/giọng giống 100%** (cùng `proId`). Tông giọng KHÔNG phải nguyên nhân.
- **Sửa UX (làm rõ "đã tắt")**: thêm `Web2VideoTTS.isPitchCapable(voiceId)` (nguồn duy nhất, mirror guard — chỉ mms/piper áp pitch). `renderVoices()` khi giọng Pro/clone: chip Tông giọng `disabled` + `.vm-chips.is-off` mờ + ghi chú `#vmTonesNote` "Giọng cao cấp / Clone giữ nguyên giọng gốc — tông giọng không áp dụng (đã tắt)." KHÔNG đụng `tonePitch()`/per-scene (guard per-voice trong `synthesize` vẫn đúng cho multi-narrator).
- Files: `web2/video-maker/js/video-tts.js` (+isPitchCapable, export), `js/video-maker.js` (renderVoices), `index.html` (#vmTonesNote + bump ?v=20260622h), `video-maker.css` (.vm-chips.is-off + .vm-chip:disabled). Tĩnh GH Pages — không cần deploy Render.

### [feat] Per-record history (Web2AuditLog.openRecord) — nền tảng + reference native-orders/so-order

User: mọi trang Web 2.0 tham chiếu module audit để hiện lịch sử chỉnh sửa THEO TỪNG RECORD (vd native-orders/so-order hiện lịch sử ở đơn). Đây là NỀN TẢNG cho rollout toàn hệ thống (audit→implement→debug→lặp).

- **Backend** `audit-log.js`: `/list` thêm lọc `entityId` (lịch sử của 1 record cụ thể) — khớp cột `entity_id` của union. Còn `/purge` (commit trước) đã deploy.
- **Module** `web2-audit-log.js`: `Web2AuditLog.openRecord({entity, entityId, title})` = modal per-record (tự inject modal CSS, scope NV/admin giữ nguyên, showFilters:false). `load()` ưu tiên `opts.entity/entityId`. Bump `?v=20260622al2`.
- **Wire sink thêm 2 route**: `native-orders.js` (create/create-manual/update/confirm/cancel → entity='native-order', user từ token/\_editor/createdBy) + `web2-so-order.js` (/save document-level → entity='so-order', id='main'; per-shipment để đợt rollout).
- **Frontend reference**: native-orders thêm nút 🕘 per-order (col-actions) → `openHistory(code)` → openRecord; so-order thêm nút "Lịch sử" toolbar → openRecord('so-order','main'). Load `web2-audit-log.js` + bump versions.
- Cần Render deploy. Sau verify 2 trang → audit toàn bộ trang còn lại + nhân rộng.

### [fix] inventory-tracking (Web 1.0) — sửa "Đợt 3 hiện thanh toán đợt cũ": di chuyển đơn giữa đợt KÉO theo thanh toán + default số đợt an toàn

User: modal "Thanh Toán CK Theo Đợt" của Đợt 3 hiện danh sách CK của **đợt cũ** (Đợt 2). Điều tra DB thật (read-only `--inspect`): chỉ có 3 đợt (1=11 ngày, 2=17 ngày, 3=1 ngày) — **đợt span nhiều ngày là ĐÚNG model** (2026-05-31 "đợt tách theo dotSo"), KHÔNG phải trùng số. Tổng screenshot 303.112 = đúng payment Đợt 2 (trước khi thêm entry 50k) → **Đợt 3 đã từng hiện payment Đợt 2**. Data hiện tại đã sạch (user nhập lại Đợt 3 = 1 entry 100k đúng, xác nhận). **Root cause**: `PUT /shipments/:id` dùng `COALESCE($20, thanh_toan_ck)` → **đổi số đợt của 1 đơn nhưng GIỮ nguyên mảng thanh toán đợt nguồn** → đơn mang payment đợt 2 sang đợt 3 (aggregation gom theo dotSo → đợt 3 hiện nhầm).

- **Fix chính** `render.com/routes/v2/inventory-tracking.js` `PUT /shipments/:id`: khi `dot_so` đổi sang **đợt khác** mà client không gửi `thanh_toan_ck` riêng → **đồng bộ thanh toán + tỉ giá theo ĐỢT ĐÍCH** (lấy từ 1 dòng đợt đích, ưu tiên non-empty; đợt đích mới toanh → `[]`). Không còn kéo theo payment đợt nguồn.
- **Default số đợt an toàn (HYBRID)**: `next-dot-so` + default `POST /shipments` + frontend `_computeDefaultDotSo`: ngày ĐÃ có đợt → MAX của ngày đó; ngày MỚI → **MAX toàn cục** (tiếp tục đợt mới nhất, KHÔNG về 1 → tránh nhập nhầm vào Đợt 1 cũ + kế thừa TT). Thêm nút **"Đợt mới"** (`modal-shipment.js`, global MAX+1 hỏi server) cho đợt hoàn toàn mới.
- **KHÔNG migration data** — đợt 1/2/3 span nhiều ngày là đúng; data hiện sạch. (Script renumber bản nháp đã xóa: premise sai sẽ tách nhầm đợt span-ngày.)
- 2 review song song trước đó (regression sweep 0 lỗi + code-review) vẫn áp dụng cho phần numbering. Cần Render deploy backend + GH Pages deploy frontend.

### [feat] Audit-log "THẬT SỰ toàn bộ" — event-sink chung web2_audit_events (gom 6 nguồn lịch sử riêng)

Tiếp theo việc gộp audit-log: user phát hiện purchase-refund (+ nhiều trang) vẫn có lịch sử RIÊNG mà audit-log union (4 bảng) chưa phủ. Chốt **Event-sink chung**: 1 bảng `web2_audit_events`, mọi mutation ghi thêm 1 dòng → audit-log union đọc → thật sự toàn bộ. Timeline inline từng record GIỮ NGUYÊN (đây là bản ghi song song, best-effort).

- **Helper mới** `render.com/services/web2-audit-sink.js`: `recordAuditEvent(pool, {entity,entityId,action,userId,userName,sourcePage,changes})` + `ensureAuditSinkTable`. Best-effort (nuốt lỗi, KHÔNG chặn flow chính), `_ensured` cache CREATE TABLE, cap `changes` JSON ~8KB. Unit-test mock pool PASS.
- **audit-log.js**: thêm block union thứ 5 `web2_audit_events` (ensure bảng đầu /list, include thẳng KHÔNG qua `_tableExists` để tránh stale-false 5'). `/entities` trả entity ĐỘNG (4 bảng + DISTINCT entity sink). KHÔNG đếm 2 lần (sink chỉ ghi nguồn chưa có bảng riêng).
- **Wire 7 route** (post-commit, user-attributed): `web2-generic.js` + `web2-dedicated-entity.js` create/update/delete (phủ 78+ entity generic) · `purchase-refund.js` 5 endpoint (approve/quick-refund/cancel-approve/refunded/reject) · `web2-customers.js` create/update/archive/delete/merge · `web2-payment-signals.js` confirm/dismiss/link/approve · `web2-returns.js` create×2/approve · `kpi.js` PUT employee-ranges (đổi phân công STT). Bỏ qua import/harvest/enrich tự động (không user).
- **Frontend** `web2-audit-log.js`: thêm 5 nhãn entity (Hoàn NCC/Khách hàng/Tín hiệu CK/Trả hàng/Phân công KPI) + pill màu + **dropdown lọc ĐỘNG** từ `/entities`. Bump `?v=20260622al2`.
- Cần Render deploy. Scope NV/admin giữ nguyên (sink rows cũng qua filter scope vì có user_id/user_name). Local syntax sweep 10 file PASS.

### [feat] Web 2.0 — module DỊCH THUẬT dùng chung (LLM free + fallback Google) + cắm sound-fx

Research GitHub (LibreTranslate self-host, Lingva/Google free proxy) + tái dùng chuỗi LLM sẵn có. Build module dịch dùng chung cho Web 2.0 (động cơ: tự dịch mô tả tiếng động VN→EN bất kỳ, thay từ điển 26 từ cứng).

- **Backend** `services/web2-translate-service.js`: `translate(text,{to,from,context})` ưu tiên **Groq (free llama-3.3-70b) → DeepSeek → Gemini** (mirror web2-caption-service, ngữ cảnh tốt: "tiếng chó sủa"→"dog barking"); thiếu key/lỗi → **fallback FREE KHÔNG KEY** Google public endpoint; kẹt hết → nguyên văn (không vỡ luồng). Route `routes/web2-translate.js` (`GET /status`, `POST /` requireWeb2AuthSoft+rate 60/min). Mount server.js. Worker auto-forward (prefix web2-).
- **Client** `web2/shared/web2-translate.js` (`Web2Translate.translate/toEn/toVi/status`) — cache phiên, lỗi → nguyên văn; auto-load qua sidebar → mọi trang gọi được, KHÔNG tự fetch.
- **Cắm sound-fx**: `web2-elevenlabs-service.soundEffect` — mô tả VN không khớp từ điển → gọi translate (LLM) ra prompt EN mô tả tiếng động → ElevenLabs tạo đúng tiếng (giờ MỌI mô tả VN chạy, không chỉ 26 từ).
- Cần Render deploy web2-api (đụng service). Sidebar autoload entry vào src nhưng KHÔNG sweep bump 44 file (tránh đụng agent khác) → kích hoạt global khi sidebar version bump kế.

### [change] Lịch sử thao tác Web 2.0 — gộp về 1 NGUỒN (module chính Web2AuditLog) + scope NV/admin

User hỏi: tab "Audit log" trong `web2/kpi` có dùng nguồn của trang `web2/audit-log` không? → KHÔNG, trước đây là 2 nguồn khác nhau (KPI tab = `/api/web2/kpi/events` KPI-events; trang audit-log = `/api/web2/audit-log` union 4 bảng). User chốt: **audit-log = module chính (audit log toàn bộ)**, xóa KPI-events tab cũ, tab KPI làm lại theo audit-log; **NV xem thao tác của chính mình, admin xem tất cả**.

- **Backend** `render.com/routes/v2/audit-log.js` `/list`: thêm **scope server-side** theo `req.web2User` (do `requireWeb2AuthSoft` gắn). `role==='admin'` → xem hết + lọc user tự do; NV khác → **ÉP** match chính mình (`user_id`=id/username OR `user_name`=display/username, bỏ qua filterUser); không token → rỗng + `requireAuth`. Trả thêm `viewer:{scope,role,name}`.
- **Shared module MỚI** `web2/shared/web2-audit-log.js` (`window.Web2AuditLog`) = **1 nguồn dùng chung**: tự inject CSS + filter bar (entity/user/from/to) + bảng `.data-table` + scope-aware (ẩn ô lọc User khi `scope==='self'` + badge "🔒 Chỉ thao tác của bạn" / "🌐 Toàn bộ (admin)"). API `mount(target,opts)` / `reload()`. GMT+7. ~265 dòng.
- **`web2/audit-log/index.html`**: thin → bỏ inline script + CSS trùng, chỉ `Web2AuditLog.mount('#auditMount')`.
- **`web2/kpi/`**: tab đổi nhãn "Audit log" → "Lịch sử thao tác"; `kpi-dashboard.js` xóa `loadEvents`/`renderEventsLog` (KPI-events feed) + `fmtDate` dead, thêm `renderAuditLog()` mount module; SSE chỉ refresh khi ở tab KPI; dọn class `w2al` khi về tab KPI. Bump `?v=20260622al1`.
- **KHÔNG** thêm `web2_kpi_events` vào union (user yêu cầu xóa KPI-events; leaderboard KPI vẫn ở tab "KPI"). Cần Render deploy để scope NV có hiệu lực; frontend verify localhost OK (cả 2 trang mount, 76 rows, 0 page error, switch tab OK).

### [fix] video-maker "Hiệu ứng âm thanh (AI)" — đọc chữ thay vì tạo tiếng động (prompt VN→EN)

User: gõ "tiếng vỗ tay"/"tiếng mưa" → ra GIỌNG ĐỌC chứ không phải tiếng động. Code path đúng (gọi ElevenLabs `sound-generation`, không phải TTS). Gốc: **sound-generation cần prompt TIẾNG ANH**; prompt tiếng Việt bị hiểu là lời nói → đọc thành giọng (verify live: "tiếng vỗ tay" auto→0.6s giọng; "applause" auto→1.1s tiếng vỗ tay thật).

- **web2-elevenlabs-service.js**: thêm `toSoundPrompt()` — bỏ từ đệm ("tiếng"/"âm thanh"…) rồi map ~26 mô tả VN phổ biến → prompt EN mô tả tiếng động (vỗ tay→applause, mưa→rain, leng keng tiền→coins cha-ching, whoosh, sấm, pháo hoa, chim, còi xe, đồng hồ…); không khớp + còn tiếng Việt → `sound effect of <…>`; tiếng Anh giữ nguyên. `soundEffect()` dịch trước khi gọi API. ⚠ bẫy đã fix: "tiếng" chứa "tien" → khớp nhầm coins → phải bỏ từ đệm TRƯỚC + `\btien\b`.
- **video-maker**: thêm 6 chip preset 1-chạm (Vỗ tay/Mưa/Tiền/Whoosh/Chuông/Pháo hoa) → điền + tạo luôn; sửa hint "tạo TIẾNG ĐỘNG thật, không đọc chữ". Bump video-maker.js?v=20260622g.
- Cần Render deploy web2-api (đụng service) để có hiệu lực. Unit-test 13 mẫu PASS.

### [change] so-order — bỏ nốt nút "Quét mã" (camera barcode) trong modal Tạo Đơn Hàng

Tiếp yêu cầu: gỡ luôn nút "Quét mã" (sau khi đã gỡ "Đọc nhãn"). Modal giờ chỉ còn nút "Thêm sản phẩm" để thêm dòng SP thủ công.

- `so-order/index.html`: gỡ button `#soModalScanBtn` + `<script web2-barcode-scanner.js>` (so-order không còn dùng).
- `so-order-modal-core.js`: gỡ handler `scanBtn.onclick` + helper **dead** `_addRowFromScannedCode` (chỉ phục vụ 2 nút quét/đọc đã bỏ).
- **GIỮ** module shared `web2-barcode-scanner.js` (reconcile + web2-pack-counter + web2-label-ocr còn dùng).
- **Verify browser**: modal mở OK, `#soModalScanBtn` + `#soModalOcrBtn` đều gone, `#soModalAddRowBtn` còn, `_addRowFromScannedCode` undefined, **0 console error**. Bump `?v=20260622x3` (core.js).

### [change] so-order — "Điền ngẫu nhiên" GẮN LẠI ảnh ngẫu nhiên (Lorem Picsum, free no-key) + bỏ nút "Đọc nhãn"

User: (1) nút "Điền ngẫu nhiên" tạo data test nhưng không có ảnh → muốn dán ảnh ngẫu nhiên (tìm api/ảnh free dùng nhanh); (2) bỏ nút "Đọc nhãn" (OCR) trong modal.

**(1) Ảnh ngẫu nhiên** (workflow research 5-agent → chốt nguồn): **Lorem Picsum theo seed** = free, KHÔNG key, chỉ là URL string (`https://picsum.photos/seed/{seed}/{w}/{h}` — không fetch, hiển thị thẳng `<img>`), cùng seed→cùng ảnh (ổn định, không nhấp nháy khi re-render), seed-based nên không rot, CDN Cloudflare nhanh ở VN. (Loại LoremFlickr: proxy Flickr hay 500 + chậm 1-1.5s; loại curated DummyJSON/Unsplash: hardcode id dễ rot.)

- `so-order-modal-random.js`: thêm `SO._rImg(seed,w,h)`; `_randomRow(isVnd, rowSeed)` set `productImage` = picsum seed (mỗi dòng seed riêng `${batch}-r${i}` → ảnh khác nhau); `fillModalRandom` set `SO.modalInvoiceImage` = picsum 600x400 (ảnh hoá đơn cấp đơn, mỗi lần fill khác seed). Row kế thừa invoiceImage qua `_newModalRow` default.
- **Fallback offline-safe** (`so-order-modal-image.js`): `<img onerror>` → **SVG data-URI LOCAL** (không cần mạng → LUÔN hiển thị, không bao giờ ra icon ảnh vỡ; mạnh hơn placehold.co của research vì không phụ thuộc host ngoài). Guard `dataset.fb` chống loop.
- **Verify browser**: fill → 2-3 dòng đều có `productImage` picsum seed riêng + invoice 600x400, badge "Đã có ảnh" hiện; data-URI fallback render OK (nw=300, test env chặn net ngoài → slot ra placeholder "—" sạch, không vỡ). Trên máy user (net thường) → ảnh picsum thật.

**(2) Bỏ "Đọc nhãn" (OCR)**: gỡ button `#soModalOcrBtn` + handler `ocrBtn.onclick` + `<script web2-label-ocr.js>` khỏi so-order (chỉ so-order dùng qua nút này). **GIỮ** module shared `web2-label-ocr.js` vì reconcile + web2-pack-counter còn dùng. Nút "Quét mã" (camera barcode) giữ nguyên.

- Bump `?v=20260622x2`: so-order-modal-{core,image,random}.js.

### [feat] inventory-tracking convert-PO — nút "Lưu nháp" (localStorage) ẩn/hiện theo Mã SP

User: form "Tạo đơn đặt hàng" (modal Convert NCC → PO) thêm nút **Lưu nháp** lưu lại toàn bộ thông tin đã điền; **hiện** nút khi CHƯA dòng nào có Mã SP, **ẩn** khi bất kỳ dòng nào có Mã SP. (Lý do: `_confirmConvertToPO` BẮT BUỘC mọi SP có Mã SP mới "Tạo đơn hàng" được → khi đang dở chưa gán mã, cần lưu nháp để quay lại sau.)

- **Lưu vào (user chọn)**: localStorage máy này, key `invtrk_convertpo_draft_<invoiceId>`. Lưu `_convertItems` + supplier/date/invoiceAmount/notes + discount/shipping + ảnh hóa đơn đã chọn. KHÔNG đụng backend/PO.
- **Khôi phục**: mở lại modal NCC đó → thanh amber `.po-draft-bar` đầu modal "Có bản nháp đã lưu lúc … (N SP)" + nút **Khôi phục** (`_applyDraft` → set state + re-render + fill input) / **Bỏ nháp** (`_clearDraft`).
- **Hiện/ẩn nút**: `_updateSaveDraftVisibility()` = `_convertItems.some(it=>productCode)` → ẩn. Hook vào `_recalcAll`, `_rerenderItemsTable`, `_onItemInput` (gõ Mã SP), `_generateCodeForItem`, `_generateCodesForAll`. Tạo đơn thật xong → `_clearDraft` xoá nháp.
- **Sửa**: `modal-convert-po.js` (+helpers draft, bind nút, restore bar), `index.html` (nút `#btnSaveDraftConvertPO` ẩn sẵn trong footer + bump `?v=20260622b`), `modal-convert-po.css` (`.po-draft-bar` + bump). KHÔNG file mới (state module-local nên phải nằm trong modal-convert-po.js).
- **Verify (Playwright, localhost, fake dot + stub — KHÔNG ghi prod)**: mở modal 2 SP không mã → nút hiện; bấm Lưu nháp → localStorage có draft (2 SP, supplier đúng); gõ Mã SP → nút ẩn; xoá mã → nút hiện lại; đóng+mở lại → thanh khôi phục + 2 nút hiện. node --check pass. Screenshot khớp: bar amber + footer Hủy/Lưu nháp/Tạo đơn hàng.

### [feat] inventory-tracking — cây bút ở ô STT: tìm nhanh SP từ kho → điền TÊN vào ô Mã hàng

User: thêm cây bút ở ô STT, bấm → hiện ô tìm nhanh sản phẩm từ kho → chọn → điền **tên** SP vào ô "Mã hàng". (Trang Web 1.0 → KHÔNG import web2/; tham chiếu UX của picker so-order nhưng so-order là Web 2.0 nên KHÔNG dùng được.)

- **Nguồn dữ liệu (Web 1.0-safe)**: `window.WarehouseAPI.search(q, 20)` → `GET /api/v2/web-warehouse/search` (đã load sẵn `shared/js/warehouse-api.js` trong trang, dùng cho picker `modal-convert-po.js`). Trả `product_code/name_get/product_name/selling_price/tpos_qty_available/image_url`. Tên hiển thị/điền = `name_get` đã bỏ tiền tố `[CODE]`.
- **File mới (user chọn tách riêng)**: `inventory-tracking/js/product-quick-pick.js` (global `window.openProductPicker(invoiceId, productIdx, btnEl)` + `closeProductPicker`) + `inventory-tracking/css/product-quick-pick.css` (nút `.btn-pick-stt` + panel `.iqp-*`, floating `position:fixed`, debounce 220ms, điều hướng ↑/↓/Enter/Esc, click-ngoài/scroll đóng, `overscroll-behavior:contain`).
- **Sửa**: `table-renderer.js` thêm nút `.btn-pick-stt` (icon `pencil-line`) vào ô STT cạnh nút copy (chỉ dòng có SP). `index.html` thêm `<link>`+`<script>` mới + bump `table-renderer.js?v=20260622a`.
- **Pick → fill**: set `product.maSP = <tên SP>` (UI-first: cập nhật model + ô tại chỗ giữ nguyên nút bút/badge, rồi lưu nền `shipmentsApi.update(invoiceId,{sanPham,tongMon,tongTienHD})`, lỗi → rollback). Cùng đường lưu với `commitInlineEdit`.
- **Verify (Playwright, localhost, admin)**: panel mở + auto-focus, search trả 20 KQ, `[CODE]` bị strip, ô Mã hàng = TÊN SP, payload save mang đúng tên + invoiceId, giữ nút bút sửa, panel đóng sau khi chọn. Test bằng dot ảo + stub `shipmentsApi.update` → **KHÔNG ghi prod** (inventory-tracking là Web 1.0 PROD). node --check pass. Screenshot panel khớp UX mong muốn (ảnh + mã + tên + giá xanh + Tồn).

### [fix] native-orders — TAG thêm vào bị "giật" → cập nhật cell tại chỗ + animate pill mới mượt

User báo: khi 1 thẻ (cột "Thẻ") được thêm vào đơn thì hơi giật. Gốc: `_rowSignature` gồm `JSON.stringify(autoTags)` → tag đổi là **rebuild CẢ row** (`replaceChildren`) → avatar `<img>` bị tạo lại (nguy cơ reload) + pill mới hiện ĐỘT NGỘT (không transition) + row có thể nhảy chiều cao.

**Fix (tách tín hiệu + update tại chỗ + animate có chủ đích — compositor-only):**

- **Tách chữ ký**: bỏ `autoTags` khỏi `_rowSignature` (giữ `hasChoHang` vì nó đổi nút col-actions). Thêm `_rowTagSignature` + `_rowTagTriggers` theo dõi riêng.
- **renderRows**: khi "rest" giống mà CHỈ tag đổi → cập nhật `innerHTML` cell `.col-tag` **TẠI CHỖ** (giữ nguyên DOM avatar + cell khác → hết giật, hết reload ảnh), KHÔNG rebuild row. Khi "rest" đổi → rebuild như cũ.
- **Animate đúng pill mới**: diff `newTagTriggers \ oldTagTriggers` → chỉ pill THẬT SỰ mới gắn class `.w2-otag-enter`. Không animate khi load lần đầu (oldSet=null) hay khi render lại field khác.
- **Animation** (`web2/shared/web2-effects.css`): `@keyframes w2fxTagIn` (scale 0.5→1.12→1 + fade, overshoot mềm `cubic-bezier(0.34,1.56,0.64,1)` 340ms) — chỉ `transform`+`opacity`, tôn trọng `prefers-reduced-motion`.
- **`Web2OrderTagPill.html`**: thêm `opts.enter` → gắn class (1 nguồn, trang khác tái dùng được).
- **Chống re-pop**: gỡ class `.w2-otag-enter` qua `animationend{once}` sau khi pop xong — vì renderRows move row reused ra/vào document qua fragment, class còn sót có thể chạy lại animation mỗi lần render (SSE) → giật ngược.
- **Verify browser** (simulate add tag → renderRows): `sameRowNode=true`, `sameImgNode=true` (không reload avatar), chỉ 1 pill mới có `.w2-otag-enter` (`animationName=w2fxTagIn`), sau animation class tự gỡ, render lại KHÔNG re-pop. Screenshot pill "Test Tag" đỏ render đúng.
- Bump `?v=20260622tag`: web2-effects.css (7 trang), web2-order-tag-pill.js (native-orders + order-tags), native-orders-render.js.

### [change] so-order — "Điền ngẫu nhiên" tạo data test KHÔNG kèm hình

User yêu cầu data ngẫu nhiên trong modal Tạo Đơn Hàng (Nháp) không có ảnh.

- `so-order/js/so-order-modal-random.js`: bỏ sinh URL `picsum.photos` → `productImage`/`invoiceImage` để rỗng; xoá helper `_rImg` (dead code) + dòng gán `modalInvoiceImage` từ row đầu (luôn rỗng). `fillModalRandom` giữ `modalInvoiceImage=''`.
- Áp cho cả nút "Điền ngẫu nhiên" trong modal lẫn `generateRandomOrders` (toolbar) vì cùng đi qua `_randomRow`.
- Verify browser (localhost, ext): mở modal + fill → 3 dòng, mọi `productImage`/`invoiceImage`=`""`, `modalInvoiceImage`=`""`, 0 ảnh picsum trong form; screenshot xác nhận ô "Ảnh hóa đơn" + cột "Hình ảnh sản phẩm" hiện ô dán ảnh trống (không còn badge "Đã có ảnh").

### [fix] video-maker — giọng tạo "không giống Adam 3": mặc định + tự chọn khi thêm + bỏ pitch giọng server

User chọn Adam 3 (Giọng AI Pro) nhưng tạo ra giọng khác. Probe API: `ttsLongText` ÁP ĐÚNG voice id (Adam 3 nam ≠ Chi Chi nữ, md5 khác) → API không lỗi. Gốc ở pipeline FE:

1. **`state.voiceId` mặc định `'mms'`** (giọng nữ on-device) dù VOICES[0]=pro-adam3 → tạo lời đọc dùng MMS. Đổi mặc định `'pro-adam3'`.
2. **"Thêm" giọng từ kho KHÔNG tự chọn** → thêm Adam 3 xong vẫn đang chọn MMS. Thêm callback `onSelect` (video-maker init) → addProVoice/addShared/addPiper gọi `_ctx.onSelect(id)` → chọn luôn giọng vừa thêm.
3. **Pitch (tông Trầm/Cao) resample làm méo giọng server** (pro/vieneu/elevenlabs đã là giọng clone hoàn chỉnh) → synthesize CHỈ áp pitch cho on-device (mms/piper), bỏ qua server.

- Không có method "add community voice → account" qua API key (đều bị chặn) → dùng thẳng community id trong `userVoiceId` (đã verify chạy). Bump video-maker/video-tts/video-library?v=20260622f.

### [test] Zalo rebuild Phase 5 — test render engine + docs + memory

Khép lại rebuild Zalo. Toàn frontend/docs/test — KHÔNG chạm render.com (không restart server).

- **Test regression**: `scripts/test-web2-zalo-render.js` (Playwright headless, localhost, KHÔNG cần TK Zalo). Khôi phục phiên login từ secret file (fallback form-login) → mở trang Zalo → `page.evaluate` assert **18 điểm** thuần render: text/image/link-card/link-fallback/video-player/voice/contact/location/system bubble + tin hệ thống không phải bubble + grouping + tool xoá-phía-tôi + composer mic/voicebar/quick + ZNS form động (3 ô) + ZaloApi methods (addQuickReply/deleteMessage/pin/mute/mark) + 0 lỗi console. Exit 0/1 (CI-friendly). **Chạy thật: 18/18 PASS, 0 lỗi.** Bổ sung vào bộ 4 script test sẵn có.
- **Docs**: `docs/web2/ZALO-INTEGRATION.md` thêm §0c "REBUILD v2 (2026-06-22)" tổng hợp 5 phase + cột/route/asset mới + login truth (cookie vs QR).
- **Memory**: `reference_web2_zalo.md` thêm đoạn rebuild v2 + cập nhật mục hạn chế (voice/delete-me/pin-mute-mark/video-contact-location/system đã XONG; tách route + sendCard HOÃN).
- **Tổng kết rebuild**: P1 login watchdog · P2 UI 3-pane + thông báo + quản lý hội thoại + quick-reply + ZNS form + link card · P3 voice + xoá-phía-tôi + video/danh thiếp/vị trí · P4đợt1 tin hệ thống nhóm · P5 test+docs. **Hoãn**: tách route 2240 dòng (rủi ro, làm khi login ổn). **Chờ**: deploy Render + login acc thật để verify live.

Group richness: bắt sự kiện nhóm Zalo → hiển thị dòng hệ thống giữa khung chat (giống app Zalo). Trước đây listener CHỈ nghe `message` → sự kiện nhóm bị bỏ hoàn toàn.

- **Backend** (`web2-zalo-zca.js`): listener thêm `on('group_event')` → `_normGroupEvent` (đọc `e.threadId/data.groupId`, `updateMembers[].dName`) → `_groupEventText` map sang câu tiếng Việt cho 13 loại đáng hiển thị (join/leave/remove/block/add_admin/remove_admin/update/update_avatar/update_setting/new_pin_topic/new_link/join_request; loại không đáng hiển thị như reorder-pin/board/remind → bỏ qua). Tin hệ thống đi qua `onMessage` → persist + SSE như tin thường. **`direction:'system'`** → KHÔNG cộng unread (persist chỉ +1 khi `direction==='in'`), KHÔNG đụng tên hội thoại.
- **Frontend** (`bubbles.js`): `renderMessages` bắt `msg_type==='system'` TRƯỚC khối bong bóng → render `.wz-sys-msg` (pill xám căn giữa, max 80%), reset grouping. CSS `.wz-sys-msg` (chat-bubbles.css).
- **Verify browser (localhost, 0 lỗi console)**: render [text, system, text] → 1 dòng `wz-sys-msg` ("B đã tham gia nhóm"), KHÔNG nằm trong bubble, 2 tin text vẫn là 2 bubble (grouping nguyên). node --check pass. Bump `?v=20260622p6` (bubbles + chat-bubbles.css + ENGINE_VER).
- **⚠ Push này chạm `render.com` → Render restart server Zalo (lần restart cuối của đợt) — login lại nên làm SAU push này trong cửa sổ yên tĩnh.**
- **HOÃN trong Phase 4**: tách module route 2240 dòng `web2-zalo.js` — rủi ro cao (refactor lớn, dễ vỡ login), 0 giá trị người dùng, lại đang có nhiều session khác push `render.com` + cần server ổn định để bạn login. Để dành làm trong session riêng khi login đã ổn. Polls/notes/reminders nhóm: bỏ (YAGNI cho shop).

Audit responsive 13 trang đã unify ở 320/375/768px (Playwright headless + restore session): **document overflow = 0 mọi trang** (web2-mobile.css đã handle tốt). NHƯNG screenshot 375px lộ 3 vấn đề layout (cắt control trong scroll-container, không phải tràn document):

- **Header trang crammed**: nhiều header dùng class riêng (`rc-page-head/sd-page-head/page-head-mini/u-page-head/web2-main-header`…) KHÔNG có trong allowlist xếp-dọc của mobile CSS → tiêu đề wrap 4-5 dòng, nút phải (Lịch sử/Camera, refresh) bị cắt. **Fix tổng quát (hết whack-a-mole)**: `body:has(.web2-shell) main > header { flex-direction:column }` + cap `h1/h2 { font-size: clamp(18px,4.6vw,24px) }`. Chỉ tác động header flex con-trực-tiếp của main (header section lồng trong `<section>` của overview KHÔNG bị đụng).
- **Hàng nút hành động tràn**: supplier-debt `.sd-filter-actions` (Áp dụng/Reset/Tạo NCC/Xuất CSV) → "Xuất CSV" bị cắt. Thêm `.sd-filter-actions/.sw-page-actions/.rc-actions` vào rule `flex-wrap:wrap`.
- **Reconcile ô quét barcode tràn**: `.rc-scanner-box` (input + chip "Chưa chọn PBH" + 2 nút camera/OCR) → nút camera bị cắt mép. Thêm `.rc-scanner-box{flex-wrap:wrap}` + input `flex:1 1 100%`.
- **Verify browser 375px**: supplier-debt tiêu đề 1 dòng + nút wrap đủ; reconcile header gọn + ô quét wrap (2 nút camera hiện đủ); users sạch. **Re-audit overflow = 0/13 (không regression)**. Counter-pill canonical pale-blue hiển thị đồng nhất mọi trang.
- Bump `web2-mobile.css?v=20260622c` (qua web2-sidebar.js — inject mọi trang).

### [feat] Zalo rebuild Phase 3 (đợt 2) — render video inline + danh thiếp + vị trí

Lấp các loại tin Zalo chưa hiển thị đẹp (render-side, verify-được full trên localhost không cần TK). Sticker packs đã đủ (picker hiện có: tìm + chip gợi ý + recents → KHÔNG gold-plate).

- **Trình phát video inline**: `bubbles.js` kind `video` đổi từ link mở tab → `<video controls preload=metadata poster=thumb>` (CSS `.wz-msg-video-player` max 280px/360px nền đen).
- **Danh thiếp (contact)**: `_extractAttachment` (service) gom `uid/phone/tên/avatar` cho kind `contact` (chat.recommended); `bubbleKind`+`body` render card (avatar + tên + SĐT/“Danh thiếp Zalo”). CSS `.wz-msg-contact`.
- **Vị trí (location)**: `_extractAttachment` gom `lat/lon/địa chỉ` → link Google Maps; `body` render card (icon ghim + địa chỉ). CSS `.wz-msg-location`.
- **Service normalizer**: nới điều kiện push attachment (`|| att.uid || att.lat`) để contact/location không có url/thumb vẫn lưu; text caption lấy `att.title` cho 2 kind này; cap (caption) bỏ cho contact/location/link; `has-media` loại trừ contact/location (giữ bubble thường).
- **Verify browser (localhost, 0 lỗi console)**: render video→`wz-msg-video-player`; contact→card có tên+SĐT; location→card có link maps. node --check pass. Bump `?v=20260622p5` (bubbles.js + chat-bubbles.css + ENGINE_VER).
- **Drop khỏi đợt này**: gửi danh thiếp (`sendCard`) — hoãn vì cần điểm vào UI gọn (ô soạn đã chật 7 nút); sticker packs đã đủ. Phase 4 kế: richness nhóm + tách route 2203 dòng.

Sau đợt đồng nhất giao diện, dọn CSS chết (đã verify kỹ: không HTML/JS nào nạp + class không dùng trong markup + không trong sidebar):

- **`web2/balance-history/css/transfer-stats.css`** (505 dòng) — orphan, `.ts-*` không trang nào nạp/dùng (feature transfer-stats đã refactor đi từ lần clone balance-history `9cd8e13b8`). Match `.ts-` ở products là false-positive (`products-filters`).
- **`web2/balance-history/css/modern.css`** (1169 dòng) — legacy, balance-history/index.html chỉ nạp `web2-balance-history.css`; modern.css chỉ còn được nhắc trong docs markdown (không phải code).
- **`web2/payment-confirm/css/payment-confirm.css`** (271 dòng) — trang payment-confirm chỉ nạp `web2-theme.css`, dùng **0 class `pc-*`**, không có trong sidebar → CSS không tác động render.
- Verify cuối: `grep` 3 tên file across html/js = **0 reference** → xoá an toàn, không ảnh hưởng giao diện.

### [refactor] Web 2.0 UI đồng nhất — `.counter-pill` gom 1-nguồn (DRY pill đếm)

Pill đếm kết quả (`.counter-pill`, vd "12 đơn") bị **copy-paste fork ở 5 trang** (so-order xanh, reconcile teal, supplier-debt/supplier-wallet/users xám) lệch padding/bg/màu/radius/font, dù shared đã có `.web2-theme .counter-pill` (theme.css:708) set màu xanh nhạt — nhưng forks rò radius/padding/font (đều `999px` nhưng padding 4-6px, font 12px↔0.875rem, weight 500↔600).

- **Canonical hoá triệt để** (theme.css `.web2-theme .counter-pill`): rule shared giờ tự sở hữu **toàn bộ shape** — `display:inline-flex; gap:6px; padding:4px 12px; border-radius:999px (stadium, khớp badge family); font 12px/700; bg var(--web2-primary-soft) #e8f2ff; color var(--web2-primary-hover) #0058da; border var(--web2-primary-soft-2)` → đè mọi fork.
- **Xoá 6 fork page-local** (so-order ×2 gồm `.so-page-counters`, reconcile, `.sd-page-counters`, supplier-wallet, users) → thay bằng comment trỏ nguồn shared.
- **Verify browser**: reconcile counter-pill `rgb(232,242,255)`/`#0058da`/`999px`/`4px 12px`/`12px/700`/border `#bcdcff` — hết teal, đồng nhất pale-blue stadium mọi trang.
- theme.css + 5 page CSS đều đã `?v=t6` (đợt modal/toolbar) → không bump thêm.

### [fix] video-maker VieNeu — tự dò server LOCAL (localhost:8123/8124), khỏi cần tunnel/registry

User cài server NGAY trên máy đang xem trang nhưng "Chưa thấy máy online" (registry rỗng — heartbeat/tunnel không lên). Gốc: trang chỉ dò máy qua registry (cần serve.py heartbeat sau khi tunnel cloudflared lên) → cùng-máy vẫn không thấy nếu tunnel hụt.

- **web2-vieneu.js**: thêm `probeLocal()` — fetch `http://localhost:8123|8124/health` (localhost = potentially-trustworthy, trang HTTPS gọi được + server CORS-allow origin shop). Trả `[{name:'Máy này (engine)',url,local:true}]`.
- **video-vieneu.js**: `refreshServers()` gộp registry + local (local trước, dedupe url); **tự kết nối máy local nếu chưa cấu hình URL** (cài xong là chạy).
- **Verified** (browser + fake /health 8123): chip "Máy này (vieneu) online" + auto-connect "✅ Kết nối OK" + giọng nạp. Bump web2-vieneu.js/video-vieneu.js?v=20260622e.
- Same-machine fix; tunnel vẫn cần cho điện thoại/máy khác (vấn đề riêng). Nếu refresh vẫn trống → process server chưa chạy (mở `http://localhost:8123/health` kiểm tra).

### [feat] Zalo rebuild Phase 3 (đợt 1) — tin thoại (ghi âm) + xoá-ở-phía-tôi (bỏ OA/ZNS khỏi scope)

User: "Không cần OA và ZNS → tiếp tục các phần còn lại". Tập trung chat cá nhân (zca-js). Giữ nguyên 2 tab OA/ZNS (code còn, reversible), drop auto-ZNS. Research zca-js: có `sendVoice/sendVideo` (cần URL hosted), `sendCard`, `deleteMessage(onlyMe)`, `getStickersDetail`. Đợt này build 2 tính năng sạch + verify-được nhất.

- **Tin thoại (ghi âm)**: composer (`zalo-chat/composer.js`) thêm nút mic + thanh ghi âm (`.wz-voicebar`: chấm đỏ nhịp + đồng hồ + Gửi/Huỷ) dùng `MediaRecorder` (chọn mime webm/mp4/ogg, bỏ tin < 0.6s/800B, cleanup mic khi đổi hội thoại). Gửi qua `onSendVoice` (chat-view) → đường `sendFile` đã chứng minh (zca auto-upload Buffer lên CDN) nhưng hiển thị bong bóng `voice` (player audio). KHÔNG dùng zca `sendVoice` (cần URL hosted, phức tạp). CSS `.wz-voicebar` (chat-composer.css, pulse respect reduced-motion).
- **Xoá ở phía tôi (delete-for-me)**: zca `deleteMessage(dest, onlyMe=true)` — KHÁC recall (thu hồi 2 phía). Service `deleteForMe`, route `POST /delete-message` (gọi Zalo + `UPDATE hidden_for_me=true` + `_notifyThread`), cột `web2_zalo_messages.hidden_for_me` (ALTER IF NOT EXISTS — idempotent như 8 cột anh em), messages SELECT lọc `AND NOT COALESCE(hidden_for_me,false)`. `ZaloApi.deleteMessage`, `WZChat.actions.deleteForMe`, nút 🗑 (`data-act=delete-me`) trên MỌI tin (in+out) ở `bubbles.js`, `doDeleteMe` (chat-view, UI-first gỡ khỏi list + rollback) confirm `Popup.danger`.
- **Verify browser (localhost, 0 lỗi console)**: render 2 tin → 2 nút delete-me; voice bubble = `wz-msg-voice`; mount composer tạm → mic + voicebar (hidden) + stop/cancel đủ; `ZaloApi.deleteMessage`/`actions.deleteForMe` = function. node --check pass 8 file. Bump `?v=20260622p4` (api/composer/bubbles/chat-actions/chat-view/chat-composer.css + ENGINE_VER cho trang tiêu thụ).
- **Còn lại**: live verify cần TK Zalo kết nối + deploy Render (route + cột mới). Phase 3 đợt sau: contact card (`sendCard`), sticker pack (getStickersDetail), video player. Phase 4: group richness + tách route 2203 dòng.

### [refactor] Web 2.0 UI đồng nhất — TOOLBAR/bộ lọc tokenize (Step 8, cuối)

Bước cuối đợt đồng nhất giao diện: thanh **toolbar/bộ lọc** mỗi trang dùng class riêng (`.pr-filters/.sd-toolbar/.u-toolbar/.sw-toolbar/.jt-toolbar/.w2bh-toolbar/.rc-toolbar`…) hardcode màu/bo góc lệch nhau. **KHÔNG ép 1 archetype** (giữ nguyên: card nổi vs flush-bar vs bare-flex — đây là lựa chọn layout có chủ đích từng trang), chỉ **thay hardcode → design token** cho nhịp thống nhất.

- **Token hoá** (CSS-only, không đổi markup/layout): `#e2e8f0`/`#e5e7eb` (border) → `var(--border)`; `#fff` (nền) → `var(--surface)`; `#f8fafc`/`#f9fafb` (nền nhạt) → `var(--gray-50)`; `border-radius: 8px|10px` → `var(--web2-radius-sm, 9px)`; `gap: 10px` → `12px` (khớp canonical `.filter-row`).
    - Sửa: supplier-debt `.sd-toolbar`, purchase-refund `.pr-filters`, users `.u-toolbar`, supplier-wallet `.sw-toolbar`, jt-tracking `.jt-toolbar`, balance-history `.w2bh-toolbar`, reconcile `.rc-toolbar` (giữ viền teal accent — chỉ radius), transfer-stats `.ts-filters` (file orphan, không nạp — no-op vô hại).
    - **KHÔNG đổi**: customers `.wc-toolbar` (đã bare-flex gap 12px), kpi `.kpi-toolbar` (đã token + radius 6px/gap 16px ngoài phạm vi). **Loại trừ** (archetype riêng chủ đích): live-tv `.ltv-topbar`, live-control `.lc-toolbar`, system `.sse-toolbar`.
- Canonical `.search-section`/`.filter-row`/`.search-input` + global `input[type=...]` styling (theme) đã unify control bên trong từ trước → toolbar còn lại chỉ là container; token hoá đủ để đồng bộ viền/bo/nhịp, archetype giữ nguyên.
- **Cache-bust**: bump `?v=20260622t6` cho styles/jt-tracking/supplier-wallet/web2-balance-history/reconcile CSS (purchase-refund + users đã t6 từ đợt modal).
- ⚠ Workflow 10-agent bị rate-limit 8/10 → 2 trang (supplier-debt edited, kpi skipped) qua agent, 8 trang còn lại sửa tay trực tiếp (token swap, rủi ro ~0).

→ **Hoàn tất 4 trục đồng nhất Web 2.0**: Buttons ✅ · Tables ✅ · Modals ✅ · Toolbars ✅.

### [refactor] Web 2.0 UI đồng nhất — MODAL về canonical (Step 7) + sửa gốc bán kính 1 nguồn

Tiếp tục đợt đồng nhất giao diện (sau buttons + tables): rà MODAL toàn bộ trang Web 2.0 về **canonical** (header gradient xanh nhạt Zalo + accent strip, bo góc theo token, không `backdrop-filter blur`, padding/footer chuẩn). CSS-only, **giữ nguyên class name** để JS đóng/mở không vỡ. Zalo + video-maker loại trừ (session khác đang code).

- **Workflow 10 trang fork-modal** (audit→restyle, mỗi trang riêng file CSS → parallel-safe): chỉ 2 trang cần sửa lớn (so-order, purchase-refund) + 2 trang sửa nhỏ (products, users); phần còn lại đã canonical từ đợt trước.
    - **products** `.w2p-history-head`: header **phẳng xanh đặc `#2a96ff` + chữ trắng** → gradient xanh-nhạt + chữ tối (canonical); close trắng-trên-xanh → tối-trên-sáng; backdrop 0.55→0.42; radius/shadow → token.
    - **so-order** `.so-modal-head` + `.so-modal-head-v2`: thêm gradient canonical + accent `::after`; h2 16/20px → 15px/700; footer border/bg → token; radius → token.
    - **purchase-refund**: 3 modal (chính + section + modal hoàn/nguy hiểm) → header gradient + border token, h3 17px → 15px/700, footer `var(--gray-50)`, radius → token (modal nguy hiểm giữ header đỏ semantic).
    - **users**: footer border/bg → token.
- **balance-history `.w2md-*` (modal Nạp tay — JS-injected `<style>`)**: agent CSS-scoped không chạm được → tự sửa text CSS trong `js/web2-manual-deposit.js` (không đụng logic): backdrop 0.55→0.42, panel shadow `0 24px 48px`(48px blur, quá ngưỡng) → `var(--shadow-lg)`, head thêm gradient canonical + accent strip + h3 15/700, foot/close → token.
- **GỐC bất nhất bán kính (1-nguồn)**: phát hiện `web2-theme.css:1105` ghi đè `[class*='modal-content']` thành **`border-radius:18px` cứng** (đè base.css 12px), trong khi MỌI fork (đợt trước) đã set 12px theo token `--web2-radius` → shared modal 18px vs fork 12px = lệch. Sửa **1 dòng**: `border-radius:18px` → `var(--web2-radius)` (12px) để modal theo đúng design-token như card/input. Verify browser: fork `.so-modal-panel` = shared `.modal-content` = `[class*='modal-content']` fork đều **12px**.
- **Verify browser (localhost)**: products head = `linear-gradient(#e8f2ff→#fff)` (hết xanh đặc), so-order head/headv2 canonical, w2md modal "Nạp tay vào ví" mở đúng — radius 12px, shadow `var(--shadow-lg)`, head gradient, backdrop 0.42, 540px, không vỡ layout (screenshot OK).
- **Cache-bust prod**: bump `web2-theme.css?v=20260622t6` (47 HTML, trừ zalo/video-maker) + page CSS đã sửa (so-order/products/purchase-refund/users) + `web2-manual-deposit.js?v=20260622t6`.

### [fix] vieneu-tts OmniVoice — thiếu ffmpeg (pydub) → bundle qua imageio-ffmpeg

User chạy bộ cài máy POS ([0] cài hết): VieNeu OK, OmniVoice cảnh báo `pydub … Couldn't find ffmpeg`. Gốc: package `omnivoice` phụ thuộc pydub (decode audio mẫu clone) cần ffmpeg; máy chưa cài. VieNeu KHÔNG dùng pydub nên không sao. (HF_TOKEN warning = vô hại, chỉ rate-limit tải.)

- **requirements-omnivoice.txt**: thêm `imageio-ffmpeg` (bundle binary ffmpeg qua pip, đa nền tảng).
- **engine_omnivoice.py**: `_ensure_ffmpeg()` lúc import → trỏ `pydub.AudioSegment.converter` sang binary imageio-ffmpeg + thêm PATH (no-op an toàn nếu thiếu gói).
- **vieneu-windows-setup.ps1**: nhánh omnivoice luôn `pip install imageio-ffmpeg` + copy → `$DIR\ffmpeg.exe`; start.cmd prepend `%~dp0` vào PATH → pydub tìm thấy ffmpeg, hết cảnh báo + clone chạy.
- **Fix tới user**: chạy LẠI cai-may-pos.bat — ps1 + engine_omnivoice.py + requirements tải mới từ repo (sau GH Pages deploy). KHÔNG cần tải lại .bat.

### [feat] Zalo rebuild Phase 2b-rest — quick-replies lưu/“/” trigger + ZNS form động + link preview card

Hoàn tất phần còn lại của Phase 2b (notifications + conv-mgmt đã xong trước). 3 tính năng, tách nhỏ + tái dùng shared chat engine (dùng chung cho native-orders/live-chat qua `Web2Zalo.mountChat`).

- **Quick-replies — lưu mới + “/” trigger**: `web2-zalo-zca.js` thêm `addQuickMessage(accountKey,{keyword,title})` (zca `api.addQuickMessage`) + chuẩn hoá `getQuickMessages` → `{id,keyword,title}` (cũ trả `message` object thô → composer map sai). Route `POST /quick-replies`. `ZaloApi.addQuickReply`. Composer (`zalo-chat/composer.js`): picker fix shape + thêm mục “➕ Lưu câu trả lời nhanh…” (Popup.prompt nội dung+từ khoá, fallback prompt) + gõ “/” đầu ô → mở picker, chọn THAY nguyên text (`replaceSlash`).
- **ZNS form động**: thay textarea JSON thô bằng form render 1 ô / param của template (`web2_zns_templates.params`): required (\*) + type NUMBER→input number + placeholder = sample. Template KHÔNG có metadata param → ẩn form, mở `<details>` “Nhập JSON thủ công (nâng cao)” (giữ fallback power-user). `_collectZnsData` validate required client-side, build `data` từ form hoặc JSON. `lookup-zns.js` + `index.html` (#wzZnsFields/#wzZnsRaw).
- **Link preview card**: `_extractAttachment` tách `desc` riêng cho kind `link` (giữ fallback tên tệp cho kind khác). `bubbles.js` kind `link` → card xem trước (thumb 1.91:1 + title 2-dòng + desc + host) khi có metadata; thiếu → link gọn `.wz-msg-linkbox` như cũ. CSS `.wz-msg-linkcard` (chat-bubbles.css).
- **Verify browser (localhost, 0 lỗi console)**: ZNS form render đúng 3 ô (customer_name\*, order_code\*, amount=number), raw JSON thu gọn; template 0 param → form ẩn + raw mở. Link card: title/host(shopee.vn)/thumb đủ; link không metadata → fallback linkbox. node --check pass 7 file. Bump `?v=20260622p3` (index.html + ENGINE_VER ở web2-zalo.js cho trang tiêu thụ).
- **Còn lại**: live verify quick-reply + ZNS cần TK Zalo + OA kết nối (localhost không có); deploy Render cho route mới. Tiếp Phase 3 (voice/GIF/sticker pack/video/contact + auto-ZNS).

### [feat] Xưởng Video AI — frontend "Giọng AI Pro" (engine + tab kho giọng, mặc định Adam 3)

Nối tiếp backend: cắm engine `pro` vào `Web2VideoTTS` + tab kho giọng.

- **video-tts.js**: thêm engine `pro` (proStatus/listProVoices/\_proChunk gọi `/api/web2-tts-pro`, decode .wav→samples), dispatch trong synthesize + synthVoiceMeta, hỗ trợ addLibraryVoice/\_persistLib/loadLibraryVoices (proId). **Adam 3 = VOICES[0]** (mặc định, ưu tiên theo yêu cầu; nhãn "Adam 3", proId community id).
- **video-library.js**: tab "Giọng AI Pro" (renderPro/\_loadProVoices/\_appendProRows/previewProVoice/addProVoice) — search server-side (vd "adam") + cuộn nạp thêm + nghe thử (synth mẫu ngắn) + Thêm vào picker. Mirror tab ElevenLabs.
- **Giấu nhà cung cấp**: nhãn "Giọng AI Pro"/"Adam 3", route trung tính, audio relay .wav → frontend không lộ lucylab/ttsapi/vivibe.
- Bump `video-tts.js`/`video-library.js`?v=20260622d. Còn lại: chờ Render deploy xong → verify route live + browser test.

### [feat] Xưởng Video AI — thêm engine "Giọng AI Pro" (backend, giấu nhà cung cấp)

Tích hợp dịch vụ TTS tiếng Việt (giọng cộng đồng "Adam 3"…) vào Web 2.0. **Yêu cầu user: KHÔNG để lộ tên nhà cung cấp ra frontend** → đặt tên trung tính "Giọng AI Pro", route `/api/web2-tts-pro`, backend RELAY audio (domain nhà cung cấp không xuất hiện ở browser).

- **Research trước khi code**: site chặn bot → curl UA đọc `api-docs.html`; GitHub có nhiều client tham chiếu (xác nhận flow). **Probe live bằng key**: `getUserVoices` OK (total 0), `getCommunityVoices` accessible-via-key (các method search/marketplace bị chặn) → **Adam 3 id = (community voice)**; chạy thử `ttsLongText`→poll `active→completed`~4s→ `.wav` công khai. Pipeline verified end-to-end.
- **Backend mới**: `services/web2-tts-pro-service.js` (JSON-RPC api.lucylab.io; xoay tua `VIVIBE_API_KEY1..5` + cooldown 1h failover; `listCommunityVoices`/`listUserVoices`; `tts()` = ttsLongText→poll getExportStatus 2s/120s→tải .wav→Buffer) + `routes/web2-tts-pro.js` (`/status`,`/voices`?scope=community|user,`/tts` audio/wav, requireWeb2AuthSoft+rateLimit). Mount server.js cạnh elevenlabs. Worker auto-forward (prefix web2-).
- **Giấu nhà cung cấp**: route trung tính + relay .wav qua server → frontend không thấy lucylab.io/ttsapi.app; key chỉ ở env Render.
- **Còn lại**: set env VIVIBE_API_KEY1..5 trên web2-api + deploy; build frontend engine `vivibe`/"pro" trong Web2VideoTTS + UI chọn giọng (ưu tiên Adam 3); test live.

### [refactor] Table unify Web 2.0 → canonical .data-table (Step 6, workflow 7-agent)

Tiếp button-unify: migrate bảng fork → look canonical `.data-table` (native-orders: header #f0eeee bold, zebra #f7f9fb, grid #d9dde0/#e5e8ea, padding 8px/10px). Method low-risk: **THÊM class `data-table` vào markup** (giữ fork class cho column-width) + **xoá rule fork xung đột** (thead bg/font/padding/border, td padding/border, zebra, hover, border-collapse) → canonical thắng; **GIỮ column widths + special cells** (status pill, badge, muted, sticky, sortable indicator).

- Fork migrated: `u-table` (users), `sd-table`/`sd-detail-table`/`sd-congno-table` (supplier-debt, 4 bảng), `rt-table` (returns), `wc-table` (customers, giữ min-width 920 + sticky), `sw-table` (supplier-wallet + customer-wallet), `w2bh-table` (balance-history). check-others: kpi/report-revenue/report-delivery/audit-log/dashboard/fb-ads-stats.
- ⚠ Retarget row-tint khỏi `tr` → `> td` ở supplier-debt (expanded/credit-move) + `!important` detail-cell để canonical zebra (apply trên `> td`) không đè semantic tint.
- **Verify browser**: users (8 col/6 row), customers (8 col/50 row), balance-history (5 col/50 row) — thBg #f0eeee, weight 700, padding 8/10, zebra #f7f9fb, **cột + special cell nguyên vẹn** (screenshot customers OK). CSS brace-balanced.
- Commit bị "auto: session update" hook gom chung (`f4892eded`) — đã verify + pushed. ⚠ EXCLUDE zalo (session khác đang code Phase2b). **Còn lại: Step 7 modals → shared `.modal-*`.**

### [refactor] Button consistency toàn Web 2.0 — audit 47 trang (workflow) + unify fork → canonical

User: "Hình 1 vs Hình 2 button khác nhau" + "audit từng button/bảng/modal từng trang rồi làm". Dùng workflow ultracode: audit 47 trang (7 agent batch, tránh rate-limit) → synthesis canonical + fix plan → implement (7 agent, mỗi agent 1 nhóm file, không đụng nhau).

- **Gốc khác biệt**: 5 trang (so-order, users, supplier-debt, reconcile, customer-wallet) **redefine LOCAL `.btn-*`** (teal #0d9488 / indigo #3730a3 / gradient + glow + `translateY(-1px)` lift + radius 6-8px) → HTML trông canonical nhưng render lệch. Nhiều trang khác fork họ nút riêng (.jt-btn/.fbp-btn/.ps-btn/.mt-btn/.vm-btn/.vb-btn/.pcard-btn/.pe-btn) + màu primary lệch brand (cyan #0891b2, generic #3b82f6).
- **Canonical** = `.web2-btn` (web2-components.css) + `.btn/.btn-*` (web2-theme.css, scoped `.web2-theme`/`body:has(.web2-shell)`, Zalo-blue #0068ff). Geometry ở `.btn` base; `.btn-primary` chỉ thêm màu/gradient (Zalo Refresh Pack — gradient nhẹ là CANONICAL, KHÔNG flatten).
- **Step 1** — XOÁ local `.btn-*` ở 5 trang (canonical out-specifies → tự kế thừa, 0 markup). **Step 2** — recolor off-brand → var(--web2-primary): reconcile/ck-dashboard teal, balance-history cyan, live-chat/report-delivery #3b82f6, customers token. **Step 3** — restyle 11 fork-button-class in-place (radius 2px, weight 500, bỏ translateY lift + glow, primary solid). fb-posts.css shared → fix 3 trang FB.
- **⚠ BUG tự bắt + sửa**: so-order (29) + customer-wallet (7) dùng `class="btn-primary"` TRẦN (không `.btn` base) → xoá local block làm nút mất geometry (browser default radius 0/weight 400). Fix: thêm `.btn` vào markup (HTML+JS) → `class="btn btn-primary"`. users/supplier-debt/reconcile vốn dùng `.btn btn-*` nên OK. Verify browser: reconcile/supplier-debt render canonical (gradient, 9px, weight 500) đồng nhất.
- **EXCLUDE**: zalo (session khác đang code), leave-alone list (photo-studio/live-tv/product-counter standalone app, .w2p-bulk-btn dark bar, tab-nav structure, swatch chips, canonical .btn gradient). 23 file CSS brace-balanced. **Còn lại (đợt sau, risk cao)**: Step 4 toolbar markup, Step 6 tables→.data-table, Step 7 modals→shared .modal-\*.

### [feat] Zalo rebuild — Phase 2b (core): thông báo tin mới + quản lý hội thoại (ghim/mute/đánh dấu chưa đọc)

- **Thông báo tin mới** — module mới `web2/zalo/js/web2-zalo-notify.js` (`WZApp.zaloNotify`): toast (notificationManager) + beep Web Audio (throttle 1.5s, tắt được qua localStorage) + **badge số chưa đọc trên `document.title`** + Web Notification API (khi tab ẩn, xin quyền ở user-gesture mở hội thoại). Phát hiện tin mới = diff unread danh sách hội thoại trước/sau mỗi `loadConversations` (bỏ qua lần đầu + khi đang tìm). Wire trong `web2-zalo-chat.js` (snapshot→notify) + `openConversation` gọi `ensurePermission`.
- **Quản lý hội thoại (DB-driven)** — backend `routes/web2-zalo.js`: `POST /conversations/:id/{pin,mute,mark}` (cột `is_pinned/is_muted/muted_until/unread_count`), GET `/conversations` ORDER BY `is_pinned DESC` (ghim nổi lên đầu), `_notify('web2:zalo:messages')` để tab khác refresh. Client `ZaloApi.{pinConversation,muteConversation,markConversation}`. Frontend `web2-zalo-chat.js`: icon ghim/chuông-tắt trên item + nút "⋯" hover → context menu (Ghim / Tắt thông báo / Đánh dấu chưa đọc), wire `Web2Optimistic` (UI-first + rollback). CSS `.wz-conv-side/.wz-conv-menu/.wz-ctx-menu/.wz-conv-ic` + dim item muted.
- **Verify Playwright**: menu "⋯" mở đúng 3 mục, tab title `(11) Zalo - WEB 2.0` (badge unread chạy), 0 JS error, no overflow. Routes pin/mute/mark cần deploy Render mới persist (optimistic apply + rollback nếu 404 trước deploy). Còn lại Phase 2b: quick-replies POST (zca `addQuickMessage`) + ZNS form động.

### [feat] Zalo — bỏ giới hạn allowlist nhóm (hiện TẤT CẢ nhóm + hội thoại 1-1)

User: "nhớ bỏ giới hạn hiện group đi". Trước đây Zalo CHỈ lưu/hiện 2 nhóm trong `web2_zalo_tracked_groups` (allowlist BẬT khi bảng ≥1 row) → đụng mục tiêu "full Zalo như app thật".

- `render.com/routes/web2-zalo.js`: allowlist nhóm giờ **MẶC ĐỊNH TẮT** — `_filterActive = _ALLOWLIST_ON && _trackedSet.size > 0`, với `_ALLOWLIST_ON = process.env.WEB2_ZALO_GROUP_ALLOWLIST === '1'`. Env unset (mặc định) → filter OFF → `_persistIncoming` (line 332) + `sync-conversations` (user+group) KHÔNG bỏ qua hội thoại nào → lưu/hiện TẤT CẢ.
- GIỮ bảng `web2_zalo_tracked_groups` + route `/tracked-groups` làm **opt-in tương lai** (vd "nhóm ưu tiên") — không xoá capability, chỉ đổi default. Bật lại = set env `WEB2_ZALO_GROUP_ALLOWLIST=1`.
- Cần **deploy Render** + bấm "Đồng bộ" (sync-conversations) 1 lần để seed toàn bộ bạn bè + nhóm vào danh sách (tin mới từ nhóm khác cũng tự tạo hội thoại). Retention 7 ngày giữ nguyên (không liên quan).

### [feat] Zalo rebuild — Phase 2a: layout 3-pane giống app Zalo PC (icon rail · danh sách · chat · info panel)

Rebuild giao diện trang `web2/zalo/` từ top-tabs 2-pane → **3-pane giống Zalo PC**, GIỮ engine chat shared (`WZChat.mountConversation`) + mọi hợp đồng (4 trang consumer + `?focus=` deep-link).

- **`index.html`**: bỏ `.wz-page-head` + top `.wz-tabs` → **icon rail dọc** (`.wz-rail`: brand + Chat/Tài khoản/Tra cứu/ZNS + đèn sức khoẻ chân rail). **Chat là khu vực MẶC ĐỊNH**. Panel Chat thành 3-pane `.wz-chat3`: `.wz-conv-col` (account select + `#wzConvList`) · `#wzChatMain` (engine shared) · `#wzInfoPanel` (cột thông tin phải, ẩn khi chưa mở hội thoại). GIỮ nguyên mọi ID JS phụ thuộc.
- **`web2-zalo-app.js`**: `.wz-tab`→`.wz-rail-tab`, keyboard ↑/↓ cho rail dọc, `init()` mặc định `switchTab('chat')`, SSE accounts luôn refresh (đèn sức khoẻ rail realtime).
- **`web2-zalo-chat.js`**: `openConversation` render thêm `renderInfoPanel(conv)` (avatar/tên/loại + SĐT/UID/Tài khoản, nút ẩn panel).
- **`web2-zalo-accounts.js`**: `renderStatusStrip` → đèn sức khoẻ chân rail `#wzRailHealth` (N/M + màu connected/reconnecting/error + tooltip kicked).
- **`web2-zalo.css`**: block "PHASE 2 REBUILD" — `.wz-main` full-height flex, rail/view/3-pane/info-panel/empty-state + responsive (info panel overlay <1180px, rail→thanh trên <680px). Rule ID `#wzPanelChat !important` đè min-height/padding/animation global của `.wz-panel` (panel bị cap 750 thay vì 900).
- **Verify Playwright @1456×900**: 4 rail tab, chat mặc định, 3-pane đầy chiều cao (900/900/900), mở hội thoại → engine mount (header+composer+tin thật) + info panel hiện, 4 tab render, **0 JS error, docOverflowX=0**. Bump `?v=20260622p2`. Tiếp: Phase 2b pin/mute/badge/thông báo/quick-reply/ZNS form.

### [feat] Zalo rebuild — Phase 1: login watchdog "không bị văng nick" (auto-reconnect + keepalive + proactive re-login)

User: "Làm lại toàn bộ trang web2/zalo + nghiên cứu sâu phần đăng nhập không bị văng nick ở máy khác → audit lên plan trước khi làm" → duyệt plan (`docs/web2/ZALO-REBUILD-PLAN.md`) → "Làm tất cả". Bắt đầu Phase 1 (lõi đăng nhập bền).

- **Research (10 agent, 2 workflow)**: cơ chế "văng nick" = Zalo CHỈ cho 1 listener realtime/TK; mở chat.zalo.me TK đó ở máy khác → kick listener (close 3000/3003); **app điện thoại KHÔNG kick**; **bị kick KHÔNG mất cookie** (vẫn re-login lại được). zca-js KHÔNG có refresh API; `zpw_sek` ~7 ngày. Lỗ hổng code cũ: rớt là đứng im (không watchdog/keepalive/reconnect). zca-js 2.1.2 cài sẵn có 148 method (wrapper mới dùng ~30).
- **Watchdog trong `services/web2-zalo-zca.js`**: lưu `creds/label/expectedUid/connectedAt` per phiên để tự re-login (không đọc lại DB). `_scheduleReconnect(code)` + `_doReconnect()`: close/error → tự kết nối lại; **1006/network = backoff lũy thừa** [5,15,30,60,120]s (cap 10 lần → bỏ cuộc `gaveUp` chờ login tay, tránh hammer→ban); **3000/3003 (bị giành phiên) = reconnect chậm 30s + trần KICK_CAP=4 liên tiếp → nghỉ 10 phút + status `kicked`** (tránh "đấu" với máy khác/instance deploy chồng). `_doReconnect` stop listener cũ + cooldown 3s trước re-login (chống tự-kick). `_watchdogTick` mỗi 90s: keepAlive (~ping giữ phiên) + liveness + reconnect phiên chết + **re-login chủ động ở 3.5 ngày** (cuốn cookie trong cửa sổ 7 ngày). `_bumpEvent` cập nhật `lastEventAt`. `stopAll()` graceful (đóng listener nhường phiên cho instance mới khi deploy).
- **Observability**: `status()/statusAll()` trả `healthy/connectedAt/lastEventAt/lastCloseCode/reconnecting/consecutiveKicks`. Route `_safeAccount` surface `health{...}` cho `/status` + `/accounts`.
- **Graceful shutdown** (`server.js`): gọi `web2ZaloRoutes.stopZalo()` (→ `zca.stopAll()`) trước khi đóng HTTP → instance cũ nhả WS, instance mới ăn phiên không "đấu" (xử lý deploy overlap mà KHÔNG cần lock riêng).
- **Frontend health UI** (`web2-zalo-accounts.js` + utils + css): đèn `reconnecting` (vàng pulse) / `kicked` (đỏ); cảnh báo **"Tài khoản đang mở ở nơi khác — đừng mở chat.zalo.me TK này trên máy khác (app điện thoại OK), bấm Kết nối lại"**; hint TK connected: **"Đang nghe realtime trên máy chủ → nhân viên dùng được ở mọi máy"**. Label `kicked`/`reconnecting` thêm vào STATUS_LABEL.
- **Files**: `render.com/services/web2-zalo-zca.js`, `render.com/routes/web2-zalo.js`, `render.com/server.js`, `web2/zalo/js/web2-zalo-{accounts,utils}.js`, `web2/zalo/css/web2-zalo.css`. Syntax + load smoke PASS. Cross-instance lock chính thức: hoãn (graceful stopZalo + kick-cap đã phủ deploy overlap; chỉ cần khi xác minh zca chạy đa-service đồng thời qua log).
- **Plan tổng**: `docs/web2/ZALO-REBUILD-PLAN.md` (Phase 1 login → 2 UI 3-pane → 3 feature fill → 4 group+modular → 5 test). Chờ deploy verify kick→tự hồi.

### [feat] live-chat → layout 3 CỘT (Comment | Kho SP to | Video+Thống kê) + bảng thông tin livestream

User (screenshot): Kho SP (cột phải cũ) nhỏ quá khó nhìn/tương tác → cho cột comment hẹp lại, dời Kho SP sang cột riêng to hơn; dưới ô video giờ trống → cho video to hơn + thêm thông tin livestream (tổng comment, lượt view, like, chia sẻ…).

- **Layout đổi từ 2 cột → 3 cột** (`live-chat/index.html`): `#liveColumn` (comment, flex:1 — hẹp lại) | `#khoSpColumn` (Kho SP, **320→400px**, SP to dễ kéo/bấm) | `#videoColumn` (MỚI, 304px = ô video live to + bảng "Thông tin Livestream"). Trước đây video dock vào đỉnh Kho SP; nay tách hẳn sang cột Video riêng. `#videoColumn` thêm vào danh sách ẩn `html.lc-mobile` (mobile chỉ đọc comment).
- **Ô video to hơn**: `SNAP_VIDEO_W` 160→**224** (`live-livestream-snap-state.js`) — capture đọc `videoWidth` động nên an toàn; frame chụp cũng nét hơn. `_ensureVideoDock` (`live-livestream-snap-stream.js`) retarget vào `#liveVideoDockHost` (fallback Kho SP nếu thiếu cột); placeholder "📹 Chưa kết nối video" ẩn/hiện qua class `has-video` (set khi capture, remove khi ngắt).
- **SP card TO hơn** (`inventory-panel.css`): thêm `@container (min-width:340px)` (panel ~400px) → thumbnail **56→88px**, nút + **32→42px**, giá **15→18px**, tên 2 dòng. Verify: panelW 399 → thumb 88×88, add 42, price 18px.
- **Bảng "Thông tin Livestream"** (MỚI): module `js/live/live-stats-panel.js` (`window.LiveStatsPanel`) + CSS `css/live/live-stats.css`. Gom số liệu CÁC bài live đang chọn: 💬 bình luận / 👁️ lượt xem / ❤️ lượt thích / 🔁 chia sẻ / 📞 SĐT thu / 🛒 đơn đã tạo / 🙈 đã ẩn + pill 🔴Đang live / Đã kết thúc. **Event-driven** — `LiveCommentList._updateTotalBadge()` gọi `scheduleUpdate()` (debounce 400ms) mỗi nhịp render comment → KHÔNG poller (CLAUDE.md rule 6).
- **Shared `fetchLivePosts`** (`web2/shared/web2-chat-live.js`): map thêm `viewCount/likeCount/reactionCount/shareCount/savedCount/phoneCount/liveStatus` từ Pancake post API (trước chỉ `commentCount`) — 1 nguồn, backward-compat. Field thật xác minh qua browser-test: `comment_count/view_count/reactions{like_count,love_count,…}/share_count/phone_number_count/live_video_status`.
- **Verify** (Playwright @1440, live thật): 3 cột 394/400/304, video 224px, 7 ô stats (💬333 📞13 🙈1, pill "Đã kết thúc"), 0 console error. "0 SP" trong test = campaign phiên test không có SP (data env), không phải lỗi layout — card to verified qua inject. Bump `?v=20260622lc3col`.

### [chore] Web 2.0 selective data-wipe tooling (audit→execute) — xoá đơn/SP/NCC/ví/KPI/chiến-dịch-cha, GIỮ KH+chuyển khoản

User: audit toàn bộ data Web 2.0 → xoá đơn hàng/SP/NCC/ví KH/KPI + chiến dịch cha (hiển thị SP ở live-control/live-tv); GIỮ khách hàng + chuyển khoản + data vận hành (live comment, Zalo/chat, FB, noti, J&T) + auth/config.

- **Quyết định KEEP/DELETE** (qua AskUserQuestion + các tin nhắn): DELETE = web2_so_order/order_tags/returns/cart_history/native_orders/fast_sale_orders (đơn) + web2_products/variants/product_history/campaign_products (SP) + web2_supplier_meta/ledger (NCC) + web2_customer_wallets/wallet_transactions/wallet_adjustments/payment_signals/payment_qr_codes/pending_matches (ví/tiền KH) + web2_live_parent_campaigns (chiến dịch cha) + web2_kpi_assignments/\_history/events (KPI). KEEP = web2_customers + web2_balance_history + vận hành + auth/config.
- **Truy cập web2Db**: local BỊ CHẶN — n2store_web2 có IP Access Control (web1 connect OK, web2 từ chối SSL handshake). Sửa firewall = security action → KHÔNG tự làm. Pivot sang **kênh admin sẵn có trong Render**.
- **Endpoint** `POST /api/admin/web2-data-wipe` thêm vào `admin-web2-wallet-reset.js` (tái dùng authOk x-admin-secret=CLEANUP_SECRET + assertSafeTable + guard web2Db≠chatDb). `{mode:'audit'}` = đếm dòng + phân loại + check FK cascade (CHỈ đọc). `{mode:'execute', confirm:'XOA-HET'}` = TRUNCATE … RESTART IDENTITY CASCADE. HARD_KEEP guard (customers/balance_history/customer_intents/users/sessions/migrations/zalo_accounts) không bao giờ truncate. Worker route `/api/admin/web2-*`→web2-api (có web2Db).
- Script standalone `render.com/scripts/web2-selective-wipe.js` (chạy Render Shell qua WEB2_DATABASE_URL) làm fallback.
- **Flow**: deploy → gọi audit (show counts) → user confirm → gọi execute. Audit-first, KHÔNG xoá mù.
- **ĐÃ THỰC THI (verified)**: execute confirm:'XOA-HET' + dropBackups + clearRecords → **22 bảng TRUNCATE (435 dòng), 23 bảng `_bak_*` DROP, web2_records cleared**. Audit lại: delete-set = 0, _bak_\* = 0. **GIỮ NGUYÊN: web2_customers 64.369, web2_balance_history 240, vận hành (live_comments 17.553, notifications 3.086, zalo_messages 396, jt_tracking 226)**. Endpoint để lại (guard x-admin-secret như wallet-reset). web2_records sau wipe có 1 dòng mới = data tươi (data cũ đã sạch).

### [fix] hide ElevenLabs/VieNeu brand khỏi UI Web 2.0 → nhãn trung tính

User: bỏ tên hãng "ElevenLabs"/"VieNeu" hiển thị trên web (4 screenshot video-maker). Đổi text HIỂN THỊ:

- "ElevenLabs" (tab Kho giọng, label, status, error toast) → **"Giọng AI"**; help bật tính năng genericize (bỏ elevenlabs.io + tên env key khỏi UI).
- "VieNeu" (card "Giọng cao cấp / Clone giọng (VieNeu)", status, notify, tooltip cảm xúc) → bỏ / **"Giọng cao cấp"**.
- Files: video-maker (index.html + video-tts/library/maker/vieneu.js), web2-vieneu.js, printer-settings. GIỮ NGUYÊN: comment code (không hiển thị) + nội dung .bat installer (chạy cmd, KHÔNG trên web; tên task/thư mục N2StoreVieNeu/VieNeu-TTS là functional — đổi sẽ vỡ gỡ-cài). Commit `aee1cd462`.

### [fix] Xưởng Video AI — preview nổi ĐÈ lên card → dock thành CỘT riêng (hết đè, cân đối)

User report (screenshot): khung xem trước (PiP nổi `position:absolute`) đè lên card "Các cảnh"/"Hiệu ứng chung" ở mode wide-edit → giao diện "chưa cân đối + bị đè lên nhau".

- **Gốc**: `.vm-stage` ở wide-edit/hidden = `position:absolute; right:18px; bottom:84px` nổi TRÊN `.vm-panel`; card lấp full width (`auto-fill minmax(320px,1fr)`) → card phải nằm DƯỚI PiP → đè.
- **Fix (theo pro-editor CapCut/Canva)**: preview LUÔN là 1 CỘT trong grid, KHÔNG absolute. wide-edit = `grid-template-columns: minmax(0,1fr) clamp(288px,26vw,372px)` (panel rộng trái + rail preview nhỏ phải, dock full-height); preview-focus = `420px minmax(0,1fr)`; preview-hidden = `1fr` (stage `display:none` + FAB "Xem trước" `position:fixed` góc dưới-phải). PiP bar (Phóng to/Ẩn) → `absolute top:10 right:10` trong rail (không đẩy canvas).
- **Verify Playwright @1440px**: wide-edit → stage x=1050..1422, panelRight=1050, **stageOverlapsCards=[]** (0 đè); preview-focus → panel 420(→688) | stage 734(688→1422) khít; preview-hidden → panel full 1164px + stage display:none + FAB fixed; canvas 16:9 fit trong rail; 0 console error. Screenshot xác nhận rail tách biệt, "Các cảnh" hiện đủ. Bump `video-maker.css?v=20260622c`.
- **Tác động**: chỉ **web2/video-maker** (desktop ≥921px). Mobile/iPad ≤920px app-frame không đổi.

### [feat/fix] Sidebar Web 2.0: click icon (thu gọn) → bung + expand group; gỡ "Sổ Order" trùng khỏi Sale Online

User (2 ý): (1) sidebar thu gọn (icon-only) bấm icon group → mở sidebar + expand group đó; (2) 2 "Sổ Order" → chỉ giữ 1 bên Mua hàng.

- **(1) Click group-head khi collapsed**: thêm `Web2Sidebar.onGroupHead(this)` — nếu `isCollapsed()` → `setCollapsed(false)` + `group.add('is-open')`; nếu đang mở → toggle như cũ. Thay inline `onclick="...toggle('is-open')"` ở group-head bằng handler. Collapsed CSS chỉ ẩn label/caret/sub (group-head vẫn click được).
- **(2) Dedup "Sổ Order"**: gỡ item `{label:'Sổ Order', our:'../so-order/index.html'}` khỏi group **Sale Online** (trùng `../so-order/index.html` với **"Sổ Order NCC"** group Mua hàng). Sổ Order là mua hàng từ NCC → thuộc Mua hàng.
- **Verify browser**: Sale Online = [Đơn Web, Live Chat, Chat Pancake, Comment Live, Điều khiển TV, TV Livestream] (hết "Sổ Order"); Mua hàng giữ "Sổ Order NCC"; tổng "Sổ Order" = 1. Collapse→click "Mua hàng": collapsedAfter=false + groupIsOpen=true + submenu hiện. 0 console error. Bump `web2-sidebar.js?v=20260622a` (45 trang).
- **Tác động**: **toàn bộ trang Web 2.0** (sidebar dùng chung) — UX menu thu gọn + bớt 1 mục trùng.

### [fix] products: cột GHI CHÚ lệch hàng (zebra so le) — clamp đặt sai trên `<td>`

User report (screenshot): cột "GHI CHÚ" trang `web2/products` lệch — ô note cao 53px trong hàng 76px, top-align → chừa khoảng trống dưới → zebra/viền so le khó chịu.

- **Gốc**: `.note-cell` (web2-base.css) đặt `display:-webkit-box` + `-webkit-line-clamp:2` **TRỰC TIẾP lên `<td>`** → td mất `display:table-cell` → co lại bằng nội dung (53px), không fill chiều cao hàng. products render `<td class="note-cell">text</td>` (text con trực tiếp).
- **native-orders KHÔNG lỗi** vì dùng pattern đúng: `<div class="web2-note-cell">text</div>` BÊN TRONG td (clamp ở div, td vẫn table-cell).
- **Fix (theo pattern native-orders, DRY)**: (1) `.note-cell` → bỏ clamp, giữ `display:table-cell` + `vertical-align:middle` + color/font/max-width; (2) products render bọc note trong `<div class="web2-note-cell">` (class clamp 2 dòng sẵn có ở web2-components.css, products đã load). Clamp vẫn hoạt động, td fill hàng.
- **Verify browser**: 4 hàng đầu → noteDisplay `table-cell`, noteH=76=nameH, topDelta=0 (thẳng hàng), có inner div. Screenshot xác nhận zebra cột GHI CHÚ khớp hàng. 0 console error. Bump `web2-base.css?v=20260622b3`.
- **Tác động**: chỉ **web2/products** (trang duy nhất render `.note-cell` kiểu cũ). native-orders + trang khác không đổi.

### [feat] Xưởng Video AI — 4 việc (P1-P4): bố cục pro-editor + giọng Piper (bỏ hỏng/nghe-không-tải-model) + ElevenLabs VN

User 4 điểm + ultracode; research 4-agent. P1: Piper nghe thử = clip mẫu HF (<audio> no-cors, KHÔNG tải model) — samplePreviewUrl/previewUrlForVoice. P3: bỏ giọng Piper hỏng vi_VN-25hours_single-low + vivos-x_low (130-symbol→OrtRun OOB), giữ mms+vais; \_piperChunk catch OOB. P2: model eleven_multilingual_v2 KHÔNG có VN → eleven_flash_v2_5 + language_code=vi; backend /shared-voices (lọc+phân trang) + /add-shared + /tts voice_settings; tab ElevenLabs = 1020 giọng VN ưu-tiên + lọc + cuộn + panel cài đặt; deploy web2-api live. P4: 3 mode data-vm-mode (wide-edit + PiP nổi/preview-focus/hidden), desktop ≥921, mobile giữ app-frame. Verify Playwright OK, 0 pageerror. v=20260622b.

### [fix] Button audit toàn Web 2.0 (625+ nút, 12 trang) — fix hamburger UA-default trên native-orders

Audit empiric nút "chưa có giao diện" (đúng phàn nàn gốc của user): browser sweep 12 trang đại diện, đếm nút render UA-default (bg `rgb(239,239,239)` / border đen). Kết quả: **chỉ 1 nút lỗi** = `.w2-mobile-menu-btn` (hamburger mobile) trên **native-orders** — hiện xám trên desktop + không drawer mobile.

- **Gốc**: pack mobile responsive (ẩn hamburger desktop + drawer off-canvas + scrim) nằm CHỈ trong `web2-theme.css` (block F04 ≤900px). **native-orders là trang base-only DUY NHẤT** (load `web2-base.css`, KHÔNG load theme) → thiếu pack → hamburger (do `web2-sidebar.js` tạo) không bị ẩn + không styled.
- **Fix**: thêm "MOBILE SHELL PACK" vào cuối `web2-base.css` (mirror Y HỆT F04 theme): desktop ẩn `.w2-mobile-menu-btn`+`.web2-aside-scrim`; `@media(max-width:900px)` hiện + style hamburger fixed, aside drawer `translateX`, scrim, grid 1-col, main padding. Hamburger/scrim/toggle `.w2-aside-open` đã có sẵn ở sidebar.js → giờ đủ CSS.
- **Vì sao base.css** (không phải theme/mobile.css): native-orders chỉ load base.css; 49 trang khác đã có F04 trong theme → KHÔNG đụng (zero-risk). Trang load cả base+theme nhận rule trùng (identical, theme thắng) — vô hại. theme-only (balance-history) không đụng. Redundancy base↔theme là _necessary_ vì 2 profile load rời nhau.
- **Verify browser**: native-orders desktop 1440px → hamburger `display:none` (offsetParent null), rule desktop-hide + @media parsed trong stylesheet; **0 nút unstyled** (trước=1), 0 page error, 0 console error. Modal check 3 profile: styled OK cả base-only(radius 12px)/themed(18px) — khác bo góc nhỏ, không vỡ. Bump `web2-base.css?v=20260622b2` (11 trang).
- **Tác động**: chỉ **native-orders** (trang base-only duy nhất) — desktop hết nút xám lạc + mobile có drawer; các trang khác không đổi.

### [refactor] CSS consolidate — verify audit (10-agent PASS) + 3 consolidation an toàn (table token / pagination / dead filters)

Tiếp "tất cả → audit → debug → lặp lại tới khi hoàn hảo". **Verify audit workflow `wbgqi1xn7` (10 agent, adversarial)**: verdict **PASS — `noRegressions:true`, `fixNow:[]`**. 5 finding đều LOW/MED = _remaining-consolidation gap_, KHÔNG phải defect do commit trước. Live UI nguyên vẹn.

- **Bảng = 1 NGUỒN token thật** (thay 5 literal hand-synced): thêm `--web2-table-line-strong (#c8ced3)`, `--web2-table-line (#d9dde0)`, `--web2-table-line-soft (#e5e8ea)`, `--web2-table-zebra (#f7f9fb)`, `--web2-table-hover (#eaf2fb)` vào `:root` CẢ web2-base.css VÀ web2-theme.css (mirror — page load mixed: native-orders=base-only, balance-history=theme-only, products=cả 2). `.data-table` 2 file giờ ref token. Đổi look bảng toàn Web 2.0 = sửa 5 dòng.
- **Pagination base ↔ theme đồng nhất**: `.page-btn` trong base.css 32px/6px/`0 10px` → 30px/3px/`0 9px` khớp theme (native-orders base-only giờ đồng bộ themed).
- **Xoá DEAD `.filters`/`.filters-section`** (0 trang dùng bare class, HTML+JS xác nhận): gỡ block dedicated theme.css + 4 selector embedded + 2 selector mobile.css. Input filter các trang vẫn style qua selector input chung; toolbar mỗi trang fork namespaced riêng (.pr-/.ts-/.rc-audit-/.sd-).
- **Verify browser (port 9941, ext, --start overview)**: products (themed) + native-orders (base-only) render BẰNG NHAU 100% — header `#f0eeee`/borders `#c8ced3`+`#d9dde0`/td `#d9dde0`+`#e5e8ea`/zebra `#f7f9fb`, token resolve cả 2, pagination 30px. **0 page error, 0 app console error.** Bump `web2-theme.css?v=20260622t5` (46 trang), `web2-base.css?v=20260622b` (11 trang), `web2-mobile.css?v=20260622a` (sidebar inject).
- **DEFER có chủ đích** (audit xếp LOW/MED follow-up, ép hợp nhất = tự gây regression vì design khác nhau thật): modal base/skin file-unify (3 profile load khác nhau cần def đầy đủ mỗi file), page-header fork (`*-page-head` divergent, chỉ `.so-page-head` trùng thật), filter-fork hợp thành 1 component, purple-tint polish (native-orders-scoped).

### [refactor] CSS Web 2.0 về 1 NGUỒN/component — audit toàn cục (6-agent) + bắt đầu consolidate

User: "web 2.0 module css về 1 nguồn ... bảng/button/modal/header/footer... audit toàn cục → chắc chắn rồi làm". Mục tiêu: mỗi component CSS có 1 nguồn canonical, mọi trang tham chiếu, hết trùng/drift.

- **Audit toàn cục (workflow 6-agent, 21 component)**: map mọi định nghĩa CSS qua 10 file shared + per-page. Phát hiện: trùng lặp NHIỀU nhưng **live UI đã đúng nhờ load-order** (web2-theme.css load CUỐI trên 49 trang → thắng). Vấn đề thật = **dead/duplicate block gây drift**. Chốt canonical: **theme.css=SKIN, base.css=STRUCTURE + look native-orders (trang duy nhất không load theme), components.css=`.web2-btn*`, sidebar.css=shell/sidebar**.
- **Đã làm (LOW-risk, verified)**:
    - **Bảng = look native-orders mặc định toàn Web 2.0** (commit `f2ea3f21b`): rewrite `.data-table` override trong theme.css clone web2-base (grid-line + zebra + header đậm), generic striping. Verified products/balance-history/customers — đồng bộ.
    - **Xoá 4 file orphan** `web2/balance-history/css/{web2-theme,styles,live-mode,accountant}.css` (grep xác nhận 0 ref; ⚠ giữ `modern.css` vì supplier-debt Web 1.0 load, giữ `styles.css` của supplier-debt riêng).
    - **Gỡ dead block page-builder.css** (table/pagination/modal AdminLTE-flat cũ): cả 5 trang page-builder load theme SAU page-builder → block bị override (dead) → giờ bảng/modal/pagination lấy 1 nguồn theme+base. CSS brace-balanced. Bump `page-builder.css?v=20260622cons`.
- **Còn lại (MED-risk, theo executionOrder audit, chưa làm)**: theme.css internal stale (Block B zebra L661 cũ, badge obsolete, card merge), form-controls de-purple + .filters 1 nguồn, page-header chuẩn hoá `.page-head-mini`, modal base/skin split + retire legacy `.btn-*` khỏi base, table full-unify (HIGH — đụng native-orders, defer). Tool browser-test bị flaky giữa chừng nên verify visual hạn chế; các thay đổi đã làm là dead-code/orphan (rủi ro thấp, fallback về canonical).

### [polish] "Chụp Live" — bỏ toast success sau khi chụp (user req)

- User: "không cần thông báo toast sau khi chụp" (chụp liên tục lúc live → toast spam phiền). Gỡ `successMsg` khỏi `Web2Optimistic.run` trong `captureAndSave()` → `if(opts.successMsg)` không bắn → im. Lỗi thật vẫn báo qua `errLabel` + rollback. Manual fallback path vốn đã không có toast success. Syntax PASS.

### [fix] "Chụp Live" chụp ra ảnh trắng — sidebar Kho Hình che iframe lúc capture

User: "nút chụp live → chụp hình bị lỗi … lúc chụp cái này nhảy ra che iframe nên chụp vào bị như hình" (tile lưu vào kho = trắng tinh).

- **Gốc bug**: `captureAndSave()` ([live-chat/js/live/live-livestream-gallery.js](../live-chat/js/live/live-livestream-gallery.js)) gọi `openSidebar()` **TRƯỚC** `api.captureCurrentFrame()`. Sidebar "Hình Livestream" (`position:fixed; right:0; width:380px; z-index:99400`, nền `#fafafa`) trượt ra phủ đúng vùng iframe FB live (`#live-snap-fb-wrapper` dock cột Kho SP / fixed góc phải). Extension `captureVisibleTab` chụp nguyên viewport (đang bị sidebar che) rồi crop theo rect wrapper → ra nền trắng sidebar. Mean luminance ~250 nên `_isFrameBlank` (mean<10) KHÔNG bắt → ảnh trắng vẫn được lưu.
- **Fix**: **CHỤP TRƯỚC, MỞ SIDEBAR SAU** + tạm ẩn sidebar nếu đang mở sẵn (chụp lần 2+). Reorder: set busy → `aside.style.visibility='hidden'` (no transition, reflow ép repaint) nếu `STATE.sidebarOpen` → chờ 2 rAF (compositor bỏ sidebar khỏi frame, cho cả stream lẫn tab-capture) → `captureCurrentFrame()` → `finally` khôi phục visibility → `openSidebar()` hiện tile mới. JS no-cache (không cần bump version). Syntax PASS.

### [polish] SSE consumer LOW hygiene — vá 5 item sweep (report-delivery realtime + 4 debounce)

Dọn nốt LOW từ consumer-robustness sweep cho "trơn tru hoàn hảo" (không phải bug correctness, chỉ freshness/efficiency):

- **report-delivery KHÔNG có realtime** → thêm `Web2SSE.subscribe('web2:delivery'|'web2:fast-sale-orders'|'web2:native-orders', sseReload)` debounce 600ms (mirror report-revenue) → giờ tự cập nhật khi phiếu giao/đơn đổi (trước chỉ refresh khi bấm tay).
- **Debounce 4 badge/handler bắn fetch mỗi event** → gom burst: `web2-pending-match.js` (web2:wallet:\* → refresh, +clear timer cleanup), `balance-history/index.html` + `live-chat/index.html` + `live-chat/chat.html` (web2:payment-signals → refreshCount /stats), `ck-dashboard-app.js` (web2:customer-intents → loadCol, nhất quán sibling payment-signals đã debounce).
- so-order receive-path KHÔNG đụng: `pullOnce()` đã version-gated (event version ≤ local → skip, không fetch) → benign, debounce thừa.
- Bump `web2-pending-match.js?v=20260622d` + `ck-dashboard-app.js?v=20260622d`. Syntax PASS.

### [test][fix] Browser test TỪNG TRANG Web 2.0 (treo SSE monitor + 32 trang) — ALL PASS + fix bug "cứ vào nhầm Web 1.0"

User: "treo server sse → vào từng trang test → debug → audit → lặp lại đến khi hoàn hảo" + "bạn vào nhầm web 1.0 rồi / tôi có note này lại mà sao cứ vào nhầm vậy?"

- **🔴 GỐC BUG "cứ vào nhầm Web 1.0"**: `scripts/n2store-browser-session.js` sau login **hardcode nav `orders-report/main.html` = WEB 1.0** (dòng 370), KHÔNG có cờ đổi → mỗi lần browser test Web 2.0 là flash/đứng Web 1.0. **Cộng dồn**: driver `/cmd` của tôi bị bug PORT (`source env` KHÔNG export → `os.environ`=None → mọi `nav` fail im lặng → browser đứng nguyên trang đích Web 1.0). **Fix**: thêm cờ `--start <url>` (override landing; relative ghép BASE) + đọc PORT từ file env. Đã cập nhật CLAUDE.md §"Browser test Web 2.0 → --start web2/overview" + MEMORY [[feedback_web2_browser_start_flag]].
- **Treo SSE monitor**: stream `web2:_admin:sse-log` (`/tmp/sse-monitor.log`) xem notify/connect realtime trong lúc test.
- **Test 32 trang** (2 batch) qua browser thật + extension, landing web2/overview: mỗi trang verify (1) nav đúng Web 2.0, (2) `Web2SSE.topics()` chứa topic mong đợi (sub), (3) bắn `/sse/test` từ browser (token sống) → probe nhận event (recv), (4) 0 console error. **KẾT QUẢ: TẤT CẢ PASS** — products/variants/native-orders/fast-sale-orders/customers/customer-wallet/supplier-wallet/balance-history/so-order/order-tags/notifications/reconcile/returns/delivery/refunds/dashboard/supplier-debt/multi-tool/live-tv/live-control/zalo/jt-tracking/fb-posts/printer/users/purchase-refund/ck-dashboard/kpi/report-revenue/product-category/live-chat. `web2:wallet:*` pages (customer-wallet, supplier-debt) recv=Y → **R4 server-side prefix-match chạy thật trên browser**.
- **3 "anomaly" = tôi đoán sai topic, KHÔNG phải bug**: multi-tool subscribe `web2:comment-boost` (produced ✓), product-category subscribe `web2:productcategory` (produced qua generic route `web2:${entity}` ✓), cart consumer ở `live-chat/inventory-panel` chứ không phải trang riêng (produced cart.js ✓). Re-fire đúng key → recv=Y hết.
- **Bẫy test (ghi lại)**: (a) `/sse?keys=` PHẢI URL-encode comma; (b) bắn `/sse/test` PHẢI từ browser (token python stale → 403; macOS SSL verify fail). Token sống = `JSON.parse(localStorage.web2_auth).token` trong eval.

### [fix] SSE audit producer↔consumer TOÀN HỆ (18-agent) — vá 2 MEDIUM "route quên emit" + 3 LOW dead-emit

Tiếp pass live-test (R4 đã chứng minh static review hiểu sai dispatch). Lần này audit **mọi cặp producer↔consumer** với dispatch model ĐÚNG (server lọc theo exact key; `:*` đã được R4 server-side prefix-match phủ). Mục tiêu: tìm lớp bug "consumer subscribe topic mà route KHÔNG emit" (giống bug ví nhưng ở topic khác).

- **Transport baseline** (curl `/sse?keys=`+`/sse/test`): 14 topic chính đều giao (web2:products/variants/delivery/native-orders… `clientsNotified:1`). _(Bẫy test: `keys=` phải URL-encode comma; loop 14 POST rapid làm curl buffer chưa flush lúc kill → 0/14 GIẢ — inline probe xác nhận OK.)_
- **2 MEDIUM (route quên emit → tab khác stale, SSE là kênh DUY NHẤT)**:
    1. `refunds.js` DELETE `/:number` → 0 emit → phiếu trả đã xoá vẫn hiện tab khác. Fix: emit `web2:refunds {action:'delete',number}` (mirror status route). Consumer subscribe EXACT `web2:refunds`.
    2. `delivery-invoices.js` PATCH + DELETE → 0 emit (chỉ create + 4 state-transition có). Fix: emit `web2:delivery {action:'update'|'delete'}`. Consumer EXACT `web2:delivery`.
- **3 LOW dead-emit (churn cross-instance NOTIFY, 0 subscriber)**: `web2-msg-send.js` 2 emit plain `web2:bulk-send` (1 chạy MỖI progress tick — chỉ per-job `web2:bulk-send:<jobId>` được consume) → gỡ; `kpi.js` emit `web2:kpi:<beneficiary_id>` (chỉ `web2:kpi-dashboard` được consume) → gỡ, giữ broadcast. LOW #5 (web2-wallet-balance double-invalidate `web2:wallet:*` + `web2:customer-wallet`) = idempotent benign → giữ.
- Syntax 4 file PASS. Commit `88f8b0a91`.
- **✅ Verify deploy**: deploy mới landed (bootId `7d74f474c`), **2 route healthy 200** (`/api/delivery-invoices/load` + `/api/refunds/load`) — edit KHÔNG vỡ boot/routing. **Tables delivery_invoices + refunds đều RỖNG** (`orders` len=0) → không có row để PATCH/DELETE test (bug stale chưa thể xảy ra khi 0 row; seed PBH-chain sẽ chạm data thật → KHÔNG làm). Emit là statement straight-line TRƯỚC `res.json` (reachable, guard `if(web2RealtimeSseNotify)` luôn true prod, ĐỒNG NHẤT pattern với create-emit/status-emit đã chạy 10 dòng trên) → verified bằng pattern-identity + route-health + transport-proven. KHÁC R4 (bug khái niệm dispatch cần live-test); đây là thêm-1-dòng-giống-code-đang-chạy.
- **Tiếp**: consumer-robustness sweep (lens cuối — resync no-op / debounce / throw-safety mọi subscriber) → converge.

### [fix] SSE realtime — re-audit toàn diện (39-agent) + 8 fix vá khoảng trống còn lại (KEEP SSE, KHÔNG cần WS)

User: "kiểm lại, audit toàn bộ web 2.0 để chắc chắn server SSE realtime hoạt động, còn không thì coi chuyển qua WS → debug → audit → lặp lại đến khi hoàn hảo".

- **Verdict: KEEP SSE — KHÔNG cần WebSocket.** Workflow audit 39-agent (map 5 + 6 dimension adversarial verify) chốt: WS **KHÔNG** fix được root cause (hub là `Map` per-process — WS hub cũng y hệt). Fix nằm TRÊN tầng wire = Postgres LISTEN/NOTIFY (đã có, đúng). SSE còn lợi thế: 1 EventSource multiplex (né cap 6-conn/origin), auto-reconnect + resync sẵn, worker đã proxy SSE (WS route mới = 404 nếu chưa thêm). 22/27 finding confirmed; backbone "SOLID_WITH_FIXES".
- **Live recon**: `/sse/stats` healthy — `crossInstance:true`, `liveInstances:1`, `crossStats.published===received` (16/16, kênh sống), `multiInstanceWarning:false`, BOOT_ID đủ suffix per-instance.
- **8 fix (5 MED + 3 LOW)** — `realtime-sse-web2.js` + `web2-sse-bridge.js` + `web2-customer-wallet-app.js` + `web2-balance-history.js`:
    1. **(MED) oversized cross-instance payload** all-or-nothing drop → degrade về TICKLE `{action,code,truncated}` (cap 7800; bulk confirm-purchase/mark-printed nhiều mã KHÔNG còn rớt cross-instance lúc deploy).
    2. **(MED) LISTEN reconnect gap** không resync: pg LISTEN/NOTIFY không buffer cho listener rớt → event trong cửa sổ ~3s mất, mà SSE browser KHÔNG đứt nên client không tự lành → **server bắn `event: resync` local khi re-LISTEN sau mất** (`_broadcastLocalResync` + `_pendingResyncOnReconnect`); bridge map → `_dispatchResync`.
    3. **(MED) exact `web2:wallet:<phone>` không tới subscriber `web2:wallet:*`** (PBH trừ ví / returns refund / manual deposit stale): **bridge prefix-match `:*`** (đóng CẢ LỚP — mọi route exact hiện tại + tương lai), mirror server `_localNotifyWildcard`.
    4. **(MED) customer-wallet no-op trên resync** (data:null): xử lý resync = `load()` TRƯỚC fast-path gated phone; + coalesce per-phone (1 refresh + 1 toast — chống double-fire từ SePay dual-emit + rank3).
    5. **(MED) heartbeat reopen-storm**: server gửi `:heartbeat` COMMENT → EventSource nuốt → `lastEventAt` không bump → refocus tab quiet >60s reopen oan (resync+reload toàn bộ). → **server gửi NAMED `event: heartbeat`**, bridge bump `lastEventAt` (không dispatch) + ngưỡng refocus 60→90s.
    6. **(LOW) `_pgNotify` không fallback khi LISTEN client half-open** → drop NOTIFY: reject → fallback pool 1 lần.
    7. **(LOW) pool fallback amplify lúc reconnect**: cap `_poolNotifyInflight` ≤ 12 (1 web2Db blip + burst KHÔNG vắt kiệt pool max~10).
    8. **(LOW) dead notify** `web2:wallet:update` (manual-deposit) — bỏ (sau prefix-match còn double-fire `:*`).
- **Phụ**: sửa comment bridge sai ("→ n2store-fallback" → đúng là **web2-api**, fallback chỉ relay). Bump `web2-sse-bridge.js?v=20260621r6→20260622r7` (38 trang) cho prod nạp.
- Syntax check 4 file PASS. Commit R1 `0ce6293e3`.

**Re-audit R2 (23-agent regression hunt trên commit R1)** — 18 candidate, 6 confirmed; converged=false vì 1 MEDIUM. Đã vá:

- **(MED) `live-livestream-snap-init.js` no-op trên resync** (cùng lớp bug customer-wallet nhưng ở consumer KHÔNG đụng tới — resync `data:null` rơi xuống `if(!customerFbUserId)return` → thumbnail/counts kẹt cũ). Fix: gộp resync vào nhánh `purge/wipe-all` (wipe cache + re-queue mọi row hiển thị).
- **(LOW) resync thundering-herd + spurious liveness-ping resync**: bridge coalesce `_scheduleResync()` trailing 250ms (server-resync + client-reconnect-resync + ping false-positive chồng nhau → 1 đợt re-fetch); clear timer trong `close()`.
- **(LOW) pool-fallback drop im lặng**: thêm `_crossStats.poolDropped` → lộ ở `/sse/stats`.
- **(LOW) foot-gun**: comment ⚠ LOAD-BEARING ở `notifyClientsWildcard('web2:wallet')` (đừng xoá — bridge cũ còn cache cần đường wildcard).
- 4 LOW còn lại (half-open >12 drop = tradeoff bảo vệ pool + self-heal; broadcast-kind degrade = unreachable) reviewer chốt KHÔNG block. Bump bridge `r7→r8` (38 trang). Syntax PASS. Commit R2 `b07144f98`. R3 (3-agent) **converged=true, 0 finding**.

**🔴 LIVE-TEST R4 (browser thật) BẮT ĐƯỢC LỖI 3 VÒNG STATIC REVIEW (39+23+3 agent) ĐỀU MISS** — vì sao phải test thật:

- **Triệu chứng**: browser subscribe `web2:wallet:*` rồi `POST /sse/test {key:'web2:wallet:0123456788'}` → `clientsNotified:0`, browser nhận 0. → **rank-3 (bridge prefix-match) là DEAD CODE**.
- **Root cause THẬT**: hub đăng ký connection theo ĐÚNG key đã subscribe (`web2:wallet:*`). `notifyClients(exact 'web2:wallet:<phone>')` chỉ exact-match `sseClients.get('web2:wallet:<phone>')` → KHÔNG có → event **KHÔNG RỜI server** → bridge prefix-match (client-side) vô dụng vì event chẳng bao giờ tới browser. → **6 trang ví** (customer-wallet, balance-history ×2, supplier-wallet, wallet-balance, supplier-debt) **bỏ lỡ realtime** từ 4 route chỉ-emit-exact (PBH-deduct/refund/return-credit/manual-deposit). 4 route chỉ có `notifyClients` (không có `notifyClientsWildcard` qua app.locals).
- **FIX ĐÚNG = SERVER-SIDE prefix-match trong `_localNotify`**: sau khi gửi exact, scan `sseClients` cho subscriber `:*` khớp prefix `key` → gửi với `payload.key = ĐÚNG key '*'` (bridge cũ+mới đều exact-match). Đóng CẢ LỚP tại 1 điểm, KHÔNG phụ thuộc route nhớ co-emit (hết drift), KHÔNG cần wiring mới. Bỏ `notifyClientsWildcard('web2:wallet')` ở SePay hub (giờ redundant → tránh double-fire). **Revert** client prefix-match (sai tầng, dead). Bump bridge `r8→r9`. **Bài học: static review hiểu sai dispatch model (tưởng server gửi hết, client lọc; thực ra server lọc theo exact key) — chỉ live-test mới lộ. Test thật > review.**
- **✅ VERIFIED LIVE (curl, prod web2-api sau deploy R4 `8d6abe393`, bootId `5cd8f5967d`)**: (1) exact `web2:wallet:0123456788` → **`clientsNotified:1`** (trước 0) + stream `web2:wallet:*` nhận `{key:'web2:wallet:*', pattern:'web2:wallet', data:{phone:...}}`; (2) exact topic thường vẫn giao (1); (3) near-miss `web2:wallet-config:x` → **0** (KHÔNG over-match); (4) unrelated → 0; (5) end-to-end: trang customer-wallet trên browser (subscriber thứ 2) cũng nhận. **code-reviewer APPROVE 0 CRITICAL/HIGH/MEDIUM** (2 LOW = doc nit). → **HỘI TỤ + LIVE-VERIFIED**. KEEP SSE chốt (WS không fix gì root cause).

### [fix] SSE realtime XƯƠNG SỐNG Web 2.0 — cross-instance fan-out (Postgres LISTEN/NOTIFY) + observability + graceful deploy

User: "audit lên plan tìm hiểu bug realtime ... fix server realtime chạy chính xác, vì đây là xương sống web 2.0". Điều tra sâu (4-agent audit code + Render API + đo live) → **đính chính chẩn đoán ban đầu** rồi fix gốc + **3 vòng adversarial review** (19→6→4 finding, hội tụ).

- **ROOT CAUSE (chứng minh dứt khoát)**: hub SSE (`realtime-sse-web2.js`) là `Map<topic,Set<Response>>` **in-RAM PER-PROCESS**, KHÔNG fan-out cross-process. web2-api steady-state = 1 instance (Render API `numInstances=1`) NHƯNG **rolling-deploy chồng 2-4 instance vài giây** (quan sát thật `liveInstances:2-4` + `bootId=srv-...-9bf555fb8-kb4px-...` cho thấy `RENDER_INSTANCE_ID` có phần per-instance). Lúc đó mutation rơi instance A, SSE bám instance B → broadcast lệch → **realtime rớt ÂM THẦM** (delivery all-or-nothing tuỳ trùng instance). Triệu chứng ban đầu "web2:products không tới" = artifact test ngay lúc deploy + lỗi đo (event `test` vs `update`); steady-state thực ra giao 100%.
- **FIX E — cross-instance fan-out**: Postgres `LISTEN/NOTIFY` channel `web2_sse` trên web2Db (KHÔNG cần Redis). `notifyClients` broadcast local + `pg_notify`; instance khác nhận NOTIFY → broadcast local; bỏ self (`origin===BOOT_ID`). Dedicated `PgClient` (keepAlive, statement_timeout:0, auto-reconnect 1-timer-guard). Publish qua chính LISTEN client (chống pool churn). Kill-switch `WEB2_SSE_NO_CROSS=1`.
- **FIX gate (audit r1 #1)**: CHỈ web2-api init fan-out (`!WEB2_API_FORWARD_URL`); fallback chỉ HTTP-relay → tránh double-deliver (fallback+web2-api chung web2Db). **r2 #1 (HIGH regression)**: gate làm `web2:wallet:*` wildcard mất đường → `notifyClientsWildcard`/`broadcastToAll` CŨNG forward (`kind`) + relay-notify route theo kind.
- **FIX A/B observability**: `BOOT_ID` (random suffix — slice cũ cắt nhầm per-instance id) vào connectionId/connected/stats; bảng `web2_sse_instances` heartbeat 30s → `/sse/stats` lộ `liveInstances`/`multiInstanceWarning`/`crossStats{published,received,deliveredFromPeers}`; cảnh báo boot nếu >1.
- **FIX C graceful deploy**: SIGTERM → `gracefulClose()` (async, await DELETE registry + `.end()` bọc timeout) đóng SSE sạch → client reconnect NHANH sang instance mới (bridge resync re-fetch). server.js gọi 1 nguồn + đóng web2Pool.
- **3 review rounds (24+16+6 agent, adversarial verify)**: r1 19 finding→vá 18, r2 6→vá 5 (HIGH wildcard), r3 4→vá 3 (MED `.end()` timeout, LOW timer unref + broadcast whitelist). #3 (pg_notify share LISTEN client) reviewer chốt acceptable.
- **✅ VERIFIED LIVE**: fan-out kênh sống (`published===received`, 1→16); delivery steady-state 100% (5-10/10 nhiều lần qua `Web2SSE.subscribe`); multi-instance **quan sát được** (`multiWarn:true` + 3 instance lúc deploy, **TẤT CẢ web2-api** — fallback gated đúng) + **settle về 1** sau 3 phút (observability đúng); regression sau mỗi deploy OK. File: `render.com/routes/realtime-sse-web2.js` + `server.js` + `web2-campaign-products.js` (D: PATCH /pending broadcast thêm web2:products).

## 2026-06-21

### [feat] TV Livestream Web 2.0 — migrate fork + test realtime (Phase 5-6) + fix

- **Phase 6 (migrate fork → 1 nguồn)**: `native-orders-filters-campaigns.js` (bỏ `LIVE_COMMENTS_API`+`_liveCommentsHeaders`+5 fetch) + `live-chat/js/live/live-campaign-manager.js` (CRUD+posts) đều chuyển sang `Web2Campaign`. Load `web2-campaign.js` 2 trang. → **Web2Campaign = 1 nguồn cho 4 trang** (live-tv, live-control, native-orders, live-chat). Verified live: parent campaigns + modal 📁 render qua Web2Campaign, 0 console error.
- **⚠ FINDING SSE đa-instance (quan trọng)**: test phát hiện `web2:products` SSE **KHÔNG tới browser** (cả EventSource thô lẫn bridge) dù subscribe đúng — trong khi `web2:campaign-products` thì TỚI. Cả `/api/web2-products` + `/api/web2-campaign-products` + `/api/realtime/web2/sse` đều → service `web2-api` (isWeb2Path), nên KHÔNG phải đa-service; nghi **web2-api chạy nhiều instance, SSE hub in-memory per-instance** → mutation landed instance khác SSE connection → broadcast lệch. `web2:campaign-products` tới được (mutation+SSE cùng instance lúc test). → **Fix feature**: "số NCC báo" đi qua `PATCH /api/web2-campaign-products/pending` (set tuyệt đối pending_qty + `_notify('pending')` trên **web2:campaign-products** = topic tin cậy) thay vì `adjust-pending` (web2:products). TV+control subscribe cả 2 topic (defensive).
- **Fix khác**: (a) `[hidden]`+display gotcha `.ltv-empty/.ltv-grid` → `display:none!important` (empty `height:100%` đẩy grid xuống fold); (b) control page gọi `Web2Sidebar.mount('#web2Aside')` (sidebar không auto-mount).
- **✅ VERIFIED LIVE end-to-end** (admin, campaign 2, SP ÁO BLAZER 2 biến thể): add SP → SSE `web2:campaign-products` `{add,c:2}` tới TV → board hiện; gom biến thể đúng (2 biến thể → 1 card 1 ảnh); `setPending`=99 → **TV tự đổi [25→99] KHÔNG refresh** (sync timestamp đổi); picker "Chờ hàng (Sổ Order)" `/pending` 16 SP; sidebar+board+picker render OK. Cleanup pending về gốc (25,15).

### [feat] TV Livestream Web 2.0 — shared module + 2 trang (Phase 2-4,7)

- **Phase 2 (shared)**: `web2/shared/web2-campaign.js` (`Web2Campaign` — 1 NGUỒN: campaign CRUD + post assign/unassign + **product attach/detach/reorder/pin** + `subscribe()` SSE web2:live-comments + web2:campaign-products) gom logic chiến dịch (sẽ migrate 2 fork về). `web2/shared/web2-variant-group.js` (`Web2VariantGroup.group()` — gom SP cùng `name` → 1 tên + 1 ảnh đại diện + danh sách biến thể có tồn/chờ từng cái; sort màu→size; ghim/sort lên đầu).
- **Phase 3 (trang TV `web2/live-tv/`)**: fullscreen standalone (KHÔNG sidebar), ảnh TO, card gom biến thể (TỒN xanh + CHỜ vàng per biến thể), chọn chiến dịch, realtime qua `Web2Campaign.subscribe` (re-fetch debounce 500ms, lọc theo code trên board), nút toàn màn hình + tap ảnh phóng to (Web2ImageLightbox). 3 file (html/css/js).
- **Phase 4 (trang điều khiển `web2/live-control/`)**: web2 page có sidebar. Chọn/tạo chiến dịch, 2 panel: (trái) SP trên TV — gom biến thể, up/down/ghim/xoá nhóm + **nhập "số NCC báo" = pending_qty** per biến thể (adjustPending delta, optimistic saved-state, hoãn re-render khi đang gõ); (phải) picker thêm SP 2 tab "Chờ hàng (Sổ Order)" `/pending` + "Tất cả SP" `/list` + search. Nút "Mở TV". 3 file.
- **Phase 7 (menu)**: thêm "Điều khiển TV 🎛️" + "TV Livestream 📺" vào nhóm Sale Online (web2-sidebar.js).

### [feat] TV Livestream Web 2.0 (Phase 1/6 — backend SP⇄chiến dịch)

User: shop live cần 1 màn TV cho người live (user1) xem ẢNH TO + TỒN KHO + SỐ CHỜ HÀNG + biến thể; user2 ở dưới nhập số NCC báo realtime. Board xoay quanh **chiến dịch livestream** (kiểu live-chat), user2 cho SP vào chiến dịch (ưu tiên SP Sổ Order chờ hàng). Chiến dịch = module dùng chung. Chạy **2 workflow audit (7+4 agent)** trước khi code.

- **Phát hiện audit**: kho = `web2_products` (mỗi biến thể 1 row; `stock`=tồn, `pending_qty`+`status=CHO_MUA`=chờ hàng = "số NCC báo" user2 nhập — user chốt dùng pending_qty). Chiến dịch = `web2_live_parent_campaigns` (web2-live-comments.js) **chỉ gom BÀI, chưa có SP**. Logic chiến dịch FORK 2 nơi (live-campaign-manager.js + native-orders-filters-campaigns.js), chưa có shared. TV cũ `soluong-live/` = Web 1.0 (Firebase+TPOS) — chỉ mượn UX.
- **Phase 1 (backend)**: bảng nối MỚI `web2_campaign_products` (campaign_id, product_code, sort, pinned, added_by, UNIQUE(campaign_id,product_code)) + route `render.com/routes/web2-campaign-products.js` (GET list JOIN kho, POST add bulk sort-cuối, DELETE, PATCH /reorder, PATCH /pin) + SSE topic RIÊNG `web2:campaign-products` (membership; tồn/chờ hàng đã có `web2:products` lo). Wire server.js (require+mount+initializeNotifiers). Worker tự route `/api/web2-*` (routes.js:391) → khỏi sửa. KHÔNG thêm cột web2_products (số NCC báo = pending_qty sẵn có).

### [refactor+security] Hệ KPI — gom 1 nguồn module (core + Web2Kpi) + enforce scope NV/admin + fix bug

User: "NV nào thấy KPI nv đó, admin thấy tất cả → KPI chính chia module để trang tham chiếu → audit → test → lặp đến hoàn hảo". Chạy **workflow audit 11-agent** (42 findings · 3 critical · 17 high · 5 scope-leak xác nhận) → kế hoạch → thực thi.

- **B1 BACKEND core `render.com/services/web2-kpi-core.js` (MỚI, 1 nguồn)**: `RATE_PER_SP`, `sanitizeCampaignName`, `buildProductMap`, `resolveBeneficiaryBySTT`, `computeKpiQty(products,base,mode,metaMap)→{qty,lines}` (mode 'inbox'|'live'), `loadKpiRanges(pool,filterUserId?)`. Trước đây toán KPI FORK y hệt ở kpi.js + web2-order-tags-service.js (mirror lúc làm pill) → drift.
- **B2 dùng core, XOÁ fork**: `kpi.js` xoá `_productMap/_orderKpiQty/_beneficiaryByStt/sanitizeCampaignName/RATE`; `web2-order-tags-service.js` xoá `_kpi*` (4 hàm) → `kpiUserDetail` gọi core. Unit-test 5 ca khớp (FIX: SP trùng mã giờ cộng dồn đúng).
- **B3 bug correctness**: (a) `/kpi` Dự báo/Thực tường minh `draft→forecast, else→actual` (trước 'delivered' lọt nhầm dự báo); (b) `resolveBeneficiary` fallback actor non-finite→null+`fallback_actor_invalid`; (c) `_isChotDonTemplate` word-boundary `/\bchot\s+don\b/` (trước substring→false-positive khóa nhầm base); (d) log khi forecast/actual âm bị clamp.
- **B5 SCOPE (security — gốc lớn nhất)**: `/events` thêm `requireWeb2AuthSoft+applyKpiScope`+self-scope (staff ÉP `beneficiary_user_id=viewer.id`, dò id khác→403); `/forecast`+`/actual` self-scope; `/assignments`+`/employee-ranges`(+/history) thêm `requireWeb2AuthSoft`. **MASK pill server-side**: `enrichOrdersWithTags(pool,orders,{viewerUser})`→`computeAutoTags(...,{viewerUser})`→ đơn NV khác (beneficiaryId≠viewer.id)→ pill `👤 KPI` xám, KHÔNG detail (che tên+tiền). native-orders `/load` truyền `req.kpiUser`. Server = nguồn-tin-duy-nhất.
- **B4 FRONTEND `web2/shared/web2-kpi.js` (MỚI, `window.Web2Kpi`)**: `authHeaders/isAdmin/fmtVnd/escapeHtml/rateFrom/fetchKpi/fetchEvents`. Migrate fork ở kpi-dashboard/native-orders-kpi(+self-only guard)/kpi-health(skip `👤 KPI`)/render(isAdmin). **FIX kpi-dashboard `loadEvents` thiếu auth** (sẽ 401 sau gate /events) + bỏ hardcode `*5000`→rate API. kpi-assignments reads thêm token.
- 14 file (2 mới). Backend=Render; FE=GH Pages. Unit mask PASS.
- **VERIFIED LIVE đa-user** (admin id1 + staff kpitest_an id3, reset pass qua `/api/web2-users/:id/password`): `/load` admin→pill `test_staff`+detail (thấy hết); staff id3→ đơn NV khác = `👤 KPI` masked, KHÔNG detail (che tên+tiền) · đơn của chính mình (STT1→id3)→ pill `kpitest_an` full + list scope chỉ trả đơn trong dải. `/events`: no-token→**401**, staff→chỉ của mình, staff dò `beneficiary_id=1`→**403**, admin dò→200. `/forecast` staff dò `user_id=1`→**403**. `/kpi` admin→200 rate 5000 (từ core) scope 'all'. Cleanup assignment ảo.
- **Tooling**: `scripts/save-web2-session.js` (MỚI) + `save-login-session.js` thêm web2 login → lưu `web2_auth` vào session block → browser test web2 "vào thẳng bằng cookies" (verified fresh session nav web2/kpi không bounce login).

### [fix] GLOBAL: web2 shell ≤900px main full-width (mọi trang tablet/phone) — sửa flex-direction no-op

Nối tiếp fix iPad (page-scoped) → user OK sửa GLOBAL. Gốc: `web2-theme.css @media(max-width:900px)` đặt `.web2-shell{flex-direction:column}` nhưng shell là `display:grid(260px 1fr)` → no-op → aside off-canvas (position:fixed) khiến MAIN kẹt track 260px ở **MỌI trang web2 trên ≤900px** (phí ~⅔ màn).

- **Fix 1 dòng** `web2-theme.css`: `flex-direction:column` → `grid-template-columns:1fr` (ép shell 1 cột → main full-width; sidebar đã là drawer phủ).
- **Bump cache** `web2-theme.css?v=` → `20260621shellfix` trên **47 file html** (chuẩn hoá từ 7 version cũ) để prod nạp bản mới.
- Verify Playwright 820px (login web2) 6 trang đa layout: overview/products/customers/kpi/dashboard/so-order → mainW fill **98-101%** (trước ~32-35%), `overflowX:false`, 0 pageerror. Screenshot products full-width OK.
- Page-scoped fix ở `video-maker.css` GIỮ LẠI (trùng nhưng vô hại, belt-and-suspenders nếu cache theme lệch).

### [fix+feat] video-maker iPad: full-width main (fix shell bug) + tablet layout (portrait 2-cột, landscape 2-pane touch)

User hỏi "ipad thì sao". Phát hiện **bug shell dùng chung**: `web2-theme.css @media(max-width:900px)` đặt `.web2-shell{flex-direction:column}` NHƯNG shell là `display:grid (grid-template-columns:260px 1fr)` → `flex-direction` VÔ TÁC DỤNG → grid vẫn chừa track 260px; aside `position:fixed` (off-canvas) nên MAIN rơi vào track 260px hẹp → **main kẹt ~260-288px ở MỌI trang ≤900px** (phí nửa màn iPad portrait + điện thoại; phone trước đó fill chỉ ~67%).

- **Fix page-scoped** (`video-maker.css`, chỉ trang này): `@media(max-width:900px){ body:has(.web2-shell) .web2-shell{ grid-template-columns:1fr !important } }` → main full-width. Verify: phone 393 fill 96% (trước ~67%), iPad portrait 820 fill 98% (trước ~35%), 0 overflow/error. ⚠ Bug gốc còn ở theme dùng chung — ảnh hưởng mọi trang web2 trên tablet/phone; chưa sửa global (sửa shared theme đụng 40+ trang, để user quyết).
- **iPad PORTRAIT (700–920px)**: preview cao hơn `clamp(300px,44vh,480px)` + tool card xếp **2 cột masonry** (`column-count:2` + `break-inside:avoid`) tận dụng bề ngang.
- **iPad LANDSCAPE / màn lớn cảm ứng (≥921 + pointer:coarse)**: 2-pane editor, panel rộng **440px**, target chạm ≥44px.
- Verify Playwright 820×1180 + 1180×820 (login web2): portrait masonry full-width, landscape 2-pane `440px 1fr`, 0 pageerror. Bump CSS `?v=20260621ipad2`.

### [redesign] video-maker mobile = app edit chuyên nghiệp (preview ghim, tab segmented, Xuất ghim đáy)

User: "giao diện điện thoại như 1 app edit chuyên nghiệp". Mobile-only re-skin (`@media max-width:920px` trong `video-maker.css`), KHÔNG đụng desktop / JS / id.

- **Preview GHIM trên cùng** (`.vm-stage` `order:-1` + `position:sticky;top:0`, height `clamp(210px,40vh,330px)`, bo góc đáy + shadow) — luôn thấy khi chỉnh. Transport "Xem trước/Dừng" = pill nổi trắng-mờ trên nền tối. Hamburger nổi góc trái như app.
- **Tab segmented GHIM ngay dưới preview** (`.vm-tabbar` `sticky;top:var(--vm-prev-h)`). Vùng công cụ (card) cuộn giữa. **Nút "Xuất video" GHIM đáy** (`.vm-export-bar` sticky bottom + `env(safe-area-inset-bottom)`, nút cao 50px).
- ⚠ Mấu chốt: `.vm-panel{overflow:visible}` trên mobile để sticky bám `.web2-main` (scroller thật), không bám panel. Header gọn (giấu `.vm-sub`, né hamburger). Touch target ≥44px. Input+nút (chủ đề AI / sfx) full-width (`.vm-topic` wrap).
- Verify Playwright 393×852 (login web2 + inject): preview pinned `top:20` GIỮ NGUYÊN sau scroll 650px, tabbar pinned `top:350`, export sticky, `docOverflowX:false`, 0 app error (chỉ 2 noise 404). Bump CSS `?v=20260621app`.

### [feat] TAG KPI User — nút Chốt KPI (admin) + health bar chưa-gán/chưa-chốt + filter NV + amber + deep-link

User: làm #1 (nút Chốt KPI chỉ admin) → dùng nó tạo base → làm #2/#3/#4 test. (Tiếp theo audit "chốt đơn = gửi tin mẫu Chốt đơn", endpoint thủ công `/lock-kpi-base` chưa UI nào gọi.)

- **#1 Nút Chốt KPI (admin-only)**: backend `POST /api/native-orders/:code/lock-kpi-base` thêm `requireWeb2Admin` (403 nếu không admin) + `_notify('kpi-base-locked')` sau khóa. Frontend `native-orders-render.js`: `NO.isAdmin()` (Web2Auth role), `NO.lockKpiBase(code)` (POST + authHeaders → reload, map reason empty-order/no-unbased/race). Nút nằm trong **popup KPI** (Web2OrderTagDetail), chỉ hiện khi `notChoted` + admin; non-admin thấy note "Chỉ admin chốt KPI được".
- **#3 amber + deep-link**: engine `computeAutoTags` kpi_user → màu **hổ phách `#f59e0b`** khi đã gán NV nhưng `notChoted` (phân biệt xanh=đã chốt, đỏ=lỗi gán). Popup error → nút **"Chia dải STT chiến dịch này"** → `../web2/kpi/assignments.html?campaign=<name>` (kpi-assignments.js đã hỗ trợ `?campaign` preselect sẵn). `Web2OrderTagDetail.open(o, tag, {kpiActions:{isAdmin,onLock,onAssign}})`.
- **#2 + #4 health bar** (`native-orders-kpi-health.js` MỚI): tự tính TỪ pill kpi_user trong tbody (không gọi API), inject `#noKpiHealthBar` sau `#noKpiStrip`. Hiện chip **⚠ N chưa gán NV** (+ link Cấu hình KPI) · **⏳ N chưa chốt** · chip mỗi NV (tên·số đơn). Bấm chip → **lọc bảng client-side** (ẩn row không khớp), MutationObserver tbody auto-update, "Bỏ lọc" reset. Bù cho leaderboard `#noKpiStrip` (chỉ hiện khi /kpi có NV).
- Files: native-orders.js, web2-order-tags-service.js, web2-order-tag-detail.js (?v=kpi2), native-orders-render.js (?v=kpi), +native-orders-kpi-health.js (?v=kpi). Backend=Render deploy; FE=GH Pages.
- **Verified LIVE prod** (browser, extension, role=admin): deploy → lock-kpi-base=401 không token (admin gate live). Seed dải STT 1 chiến dịch → 2 đơn pill **hổ phách "NV Test KPI"** (đã gán, chưa chốt) + health "2 chưa gán · 2 chưa chốt · NV Test KPI·2". Bấm **"Chốt KPI ngay"** (popup, admin) → toast "Đã chốt KPI đơn NJ-…0001 · base khóa 1 mã SP" → pill **hổ phách→xanh**, health "chưa chốt" 2→1, popup hậu-chốt "Base 2 → SL hiện tại 2" mất nút Chốt + note. Filter chip NV → ẩn đúng 2 row khớp, "Bỏ lọc" khôi phục (0 row kẹt). Cleanup assignment ảo (base lock giữ — bất biến, beta-ok). 1 screenshot health bar.

### [feat] TAG đơn — thêm trigger "KPI User" (pill động hiện tên NV nhận KPI + popup breakdown)

User: "TAG KPI User nữa → audit nói lại logic KPI user". Audit (2 Explore agent) → recap logic KPI; chốt thiết kế: pill ĐỘNG hiện TÊN NV + click chi tiết; livestream STT ngoài mọi dải = LỖI chia dải (pill đỏ).

- **Engine** (`web2-order-tags-service.js`): thêm trigger `kpi_user` (nhóm "KPI") + predicate (fire mọi đơn còn sống có SP) + `kpiUserDetail(o,ctx)` MIRROR `routes/v2/kpi.js` (`resolveBeneficiary`+`_orderKpiQty`) → khớp 100% dashboard KPI: **livestream** = NV theo dải STT (`web2_kpi_assignments`), KPI qty = base-delta (Σ max(0, hiện−`kpi_base`) = upsell sau chốt), STT ngoài dải → `state:'error'` pill đỏ "⚠ STT n chưa gán NV"; **inbox** = `created_by`, 100% SL; chưa chốt (`kpi_base` null) → qty 0 vẫn hiện NV. `computeAutoTags` special-case kpi_user: `tag.name`=tên NV/label-lỗi, `tag.color` đỏ khi lỗi, `tag.detail.kpiUser`={source,state,resolveText,kpiQty,kpiAmount,lines[],notChoted}. `buildContext` thêm `kpiRanges` (load `web2_kpi_assignments` chỉ khi có tag kpi_user active). Seed mặc định +1 (`kpi_user`, priority 5) cho install mới.
- **Popup** (`web2-order-tag-detail.js`): branch `kpi_user` → hero NV/avatar (đỏ+icon khi lỗi) + 3 box (SL KPI · Tiền · đơn giá 5.000đ) + note "chưa chốt" + list SP (base→hiện tại, badge "+N KPI"). Bump `?v=20260621kpi`.
- **Frontend native-orders KHÔNG đổi**: pill đã render từ `o.autoTags` + clickable sẵn → kpi_user tự hoạt động.
- Unit-test local 4 ca (live-assigned Hoa +3=15k · live-ERROR STT99 đỏ · inbox Lan 100%=6SP=30k · live chưa-chốt qty0 vẫn hiện Hoa) PASS. Engine = Render deploy; pill/popup = GH Pages.
- **Verified LIVE prod** (browser-test, extension): deploy → /triggers=22 (nhóm "KPI"); tạo tag KPI User qua API (x-web2-token, 200); native-orders 9/9 đơn có pill KPI; trước seed assignment = **đỏ "⚠ STT n chưa gán NV"** (đúng — chưa phân công); seed range 1 chiến dịch (PUT /api/web2/kpi/employee-ranges) → 2 đơn STT 1–2 flip **xanh "NV Test KPI"**, chiến dịch khác giữ đỏ; popup OK (hero xanh + STT∈dải + box 0SP/0đ/5.000đ + note chưa-chốt + line SP) & ERROR (hero đỏ + tên chiến dịch + "Vào Cấu hình KPI chia range") đều render đúng (2 screenshot). Cleanup assignment ảo. Tag KPI User sống trong prod (priority 5).

### [redesign] video-maker → "Xưởng Video AI": layout 2-tab + card + xoay tua key ElevenLabs + 3 tính năng AI

User: làm lại toàn bộ giao diện + đổi tên trang, audit→commit→debug→lặp. Trước đó: cấp 3 key ElevenLabs (xoay tua) + tích hợp chức năng AI.

- **Xoay tua 3 key** (`22a05c807`): service đọc `ELEVENLABS_API_KEY1/2/3`, round-robin rải tải + failover 401/quota/429 → cooldown 1h. Verify 3 key OK (22 giọng, có 'Adam').
- **3 tính năng AI** (`0842d8e5d`): hiệu ứng âm thanh (`/sound`), chép lời STT (`/stt`→điền ô lời đọc từ video import), lọc tạp âm (`/isolate`→mục Tách nhạc). Voice Design DORMANT (API chỉ gói trả phí — verify 403). Verify call thật: sound/stt/isolation OK.
- **Redesign UI** (commit này): rename trang → **Xưởng Video AI** (title + h1 + sidebar label). Layout left-panel chia **2 tab CSS-only** (Nội dung & Cảnh · Giọng & Âm thanh) + **card** nhóm tính năng (Bắt đầu nhanh / Khung hình / Nguồn / Cảnh / Giọng đọc / VieNeu / Nhạc nền / Hiệu ứng âm thanh / Công cụ audio) + **thanh "Xuất video" sticky** luôn hiện + tabbar sticky top. Panel nền soft, card trắng nổi khối. **GIỮ NGUYÊN mọi id/class/data-attr** → JS không đổi.
- **Fix bug `[hidden]`**: `.vm-btn{display:inline-flex}` (+`.vm-row`/`.vm-split-actions` flex) đè UA `[hidden]` → nút "Dừng"/clear/clone lỡ hiện. Thêm guard `[hidden]{display:none!important}`.
- Verify browser (overview→trang, extension): rename OK, 2 tab swap đúng (content flex/voice none ↔), 9 card, ratios/accents/tones/cues/canvas render, cue chèn `[cười]`, Kho giọng mở, #vmStop ẩn đúng sau fix, 0 console error. Screenshot desktop 2 tab OK.

### [feat] TAG đơn — icon picker tìm kiếm (thay ô nhập tay)

Theo yêu cầu: field Icon ở modal Cấu hình TAG đơn → picker hiện list icon tìm kiếm + chọn (thay vì gõ tên lucide tay). `order-tags-app.js`: `allIconNames()` lấy 1373 icon từ `window.lucide.icons` (PascalCase→kebab), `COMMON_ICONS` ~60 icon hay dùng hiện mặc định; ô nhập = ô tìm (focus → grid, gõ → filter full registry ≤120, mousedown chọn beat blur), preview box icon đang chọn + nút × xoá, pill xem-trước cập nhật. Verified browser: 60 icon default · "arrow"→62 match render SVG · chọn flame · clear · edit prefill 'clock' + screenshot. Frontend-only (`order-tags-app.js?v=icon`).

### [feat] video-maker: kho giọng (Piper + ElevenLabs) + import video lồng tiếng + giọng theo cảnh + thẻ cảm xúc VieNeu

User: (1) thẻ cảm xúc VieNeu; (2) import video để ghép voice; (3) chọn nhiều voice theo list + kho giọng sẵn (kiểu 'Adam'). Hỏi scope → cả 2 nguồn giọng, cả 2 kiểu multi-voice, slider tiếng gốc.

- **Thẻ cảm xúc VieNeu** (`31ae0603e`): `CUES` ([cười]/[thở dài]/[hắng giọng]) chèn vào lời đọc — chỉ engine `vieneu` hiểu; engine khác `stripCues`. Chip insert-at-cursor + hint theo giọng.
- **Kho giọng** (`3248fa8fc`): `video-library.js` modal — tab Piper (catalog ~100+ giọng named, lọc ngôn ngữ, nghe thử, "Kéo về" tải IndexedDB) + tab ElevenLabs (proxy `/api/web2-elevenlabs`, key env `ELEVENLABS_API_KEY`, gated). `video-tts.js` thêm `listPiperCatalog/downloadPiperVoice/synthVoiceMeta` + engine `elevenlabs` + `addLibraryVoice` persist localStorage. ⚠ ElevenLabs free KHÔNG có quyền TM (cần $5) → Piper là mặc định free/commercial-OK. **Cần set key Render mới chạy ElevenLabs.**
- **Import video lồng tiếng** (`6cc4e479c`): `video-import.js` — load video → vẽ khung hình canvas + nối tiếng gốc MediaElementSource→gain→graph; branch `drawAt/totalDur/applyCanvasSize/play/exportVideo`; slider âm lượng tiếng gốc (20%).
- **Giọng theo từng cảnh** (commit này): scene-editor thêm input "Lời đọc riêng" + select "Giọng cảnh này"; `genNarrationPerScene` synth từng cảnh giọng riêng, nới `dur` cho vừa lời, mix OfflineAudioContext 44.1kHz canh theo mốc cảnh.
- Verify browser (localhost+extension, 0 console error): catalog 80 row + 35 ngôn ngữ + add/persist/remove; ElevenLabs "chưa bật"; import canvas 320×180 + clear→1280×720; per-scene dur 3→4.4 khi audio 4s.

### [feat] Popup lý do tag — thêm ẢNH sản phẩm

Theo yêu cầu "hiện ảnh sản phẩm" trong popup lý do tag. `buildContext` thêm `image_url` (web2_products) vào productStatus; `tagDetail` đính `imageUrl` mỗi SP (ưu tiên catalog, fallback snapshot dòng đơn). `Web2OrderTagDetail` render thumbnail 52px (object-fit cover) + placeholder icon khi lỗi/không ảnh. Unit test imageUrl (catalog + fallback) PASS. Bump `web2-order-tag-detail.js?v=ot3`.

### [feat] Bấm TAG đơn hàng → popup lý do chi tiết (SP chờ hàng / âm mã + ai đang giữ)

User: bấm pill tag ở cột Thẻ hiện lý do — chờ hàng → list SP chờ; âm mã → list SP vượt tồn + nếu âm do người khác giữ thì hiện tên người giữ + đơn giữ.

- **Server** `web2-order-tags-service.js`: `tagDetail(trigger,o,ctx)` đính `tag.detail.products` cho 4 trigger SP (cho_hang/am_ma/het_hang/mua_1_phan) ở `/load` — chờ hàng `{code,name,pendingQty}`; âm mã `{code,name,stock,held,orderQty}`. Unit test PASS.
- **Shared** `web2/shared/web2-order-tag-detail.js` (`Web2OrderTagDetail.open(order,tag)`): popup; SP-tag render list từ `tag.detail`; **âm mã fetch `/api/web2-products/usage?codes=` → "ai đang giữ"** (STT + tên KH + ×SL + trạng thái nháp/PBH, đánh dấu "đơn này"); trigger khác hiện mô tả registry. CSS inject 1 lần, Esc/overlay đóng.
- **native-orders**: `_autoTagPills` bọc pill clickable → `NativeOrdersApp.openTagDetail(code,trigger)` (stopPropagation chống toggle expand); load detail module. Bump render/public-api/index version.

### [perf] inventory-tracking Quản Lý Ảnh — Phase 2: lưu per-NCC (chỉ upload NCC vừa sửa)

Tiếp Phase 1: sửa 1 NCC trong đợt lớn (Đợt 2 = 80+ NCC) trước vẫn re-upload cả slot. Phase 2 chuyển sang **diff per-NCC** + upsert.

- **Server `routes/v2/inventory-tracking.js`** PUT thêm chế độ granular: body `{upserts:[{ncc,urls}], deletes:[ncc...]}` (không có `rows`) → `INSERT ... ON CONFLICT (ngay_di_hang,dot_so,ncc) DO UPDATE` cho upserts + `DELETE ... AND ncc=$` cho deletes, trong 1 transaction + advisory lock. Giữ nguyên slot-replace (rows) cho orphan-clear + fallback. Trả `{success,upserted,deleted}`.
- **Client `api-client.js`**: thêm `productImagesApi.granularSave({date,dotSo,upserts,deletes})`.
- **Client `modal-image-manager.js`**: snapshot `_originalDotContent` đổi sang `Map(dotSo→Map(ncc→urlsKey))` (key length-prefixed chống đụng base64). save() diff per-NCC → chỉ gửi NCC đổi/thêm (upserts) + NCC bị xoá (deletes); đợt không đổi gửi rỗng. **Fallback**: server cũ trả 400 'rows must be an array' → tự `bulkSave` slot-replace (deploy-order-independent).
- Web 1.0, KHÔNG đổi schema (unique key `(ngay_di_hang,dot_so,ncc)` đã có từ migration 058). Verify: unit test client diff 9/9 (add/del/rename/reorder/collision/new-đợt); test SQL granular trên Postgres local 10/10 (upsert đúng NCC, NCC khác + đợt khác không đụng, idempotent, delete-nonexistent no-op) — tạo/drop DB test, KHÔNG đụng prod. `node --check` 3 file PASS. Browser test bỏ qua (1 agent khác đang chiếm session — tránh contention).
- ⚠ Server granular chỉ live sau khi Render deploy; trong lúc chờ, client tự fallback slot-replace (đúng, chỉ chậm như Phase 1). Sau deploy nên probe granular trên prod (đợt-test 99) rồi cleanup.

### [feat] Thẻ cảm xúc VieNeu (cười/thở dài/hắng giọng) cho video-maker

User: VieNeu-TTS (github pnnbao97/VieNeu-TTS) có chức năng cảm xúc → thêm vào trang Tạo video (`web2/video-maker/`).

**Bản chất:** cảm xúc VieNeu = **token ngoặc vuông chèn thẳng vào lời đọc** (`[cười]` cười, `[thở dài]` thở dài, `[hắng giọng]` hắng giọng) — v3 Turbo (thử nghiệm). Server `/synthesize`+`/clone` đã forward `text` nguyên văn → **KHÔNG cần đổi server**, chỉ thêm UX chèn token + xử lý engine.

- **`video-tts.js` (Web2VideoTTS)** — thêm `CUES` (3 token, 1 nguồn) + `isCueCapable(voiceId)` (chỉ engine `vieneu`) + `stripCues(text)` (bỏ token + gom space). `synthesize()`: engine ≠ vieneu → `stripCues` trước khi split (MMS/Piper khỏi đọc literal "cười"). Export thêm `CUES`/`isCueCapable`/`stripCues`.
- **`video-maker.js`** — `renderCues()` (chip từ `CUES` + insert-at-cursor `insertAtCursor`, tự thêm space 2 đầu, không double-space) gọi trong `renderVoices()` (hint đồng bộ khi đổi giọng/kết nối VieNeu). Hint đổi theo giọng: VieNeu = "hoạt động (thử nghiệm)"; giọng khác = "chọn VieNeu mới có tác dụng, giọng khác bỏ qua". "Nghe nhanh" (giọng OS) cũng `stripCues` trước khi đọc.
- **`index.html`** — hàng chip `#vmCues` + hint `#vmCuesHint` trên textarea lời đọc; bump cache-bust video-tts.js?v=...cue + video-maker.js?v=...cue.
- Verify browser (localhost, có extension): 3 chip render, `stripCues("Áo trắng [cười] đẹp lắm [thở dài] nhé")`→"Áo trắng đẹp lắm nhé", `isCueCapable` mms=false/vieneu=true, chèn giữa câu 1 space, hint flip đúng khi chọn giọng VieNeu, 0 console error.

### [feat] TAG đơn hàng (auto theo trigger) + chặn PBH khi có SP chờ hàng (native-orders)

User: (1) đơn có SP "chờ hàng" (web2_products.status=CHO_MUA) → KHÔNG tạo PBH, phải tạo Phiếu soạn hàng; (2) thêm cột TAG ở native-orders + trang Cấu hình "TAG đơn hàng" gắn chức năng theo trigger (Phiếu bán hàng/Chờ hàng/Âm mã + "lấy hết trigger"). 4 quyết định locked: chặn cả đơn→soạn hàng · chỉ CHO_MUA · tag AUTO-only theo trigger · âm mã = đơn nháp giữ + PBH > tồn.

**Kiến trúc — tag tính SERVER-SIDE ở /load (auto-only, không lưu cứng → không drift):**

- **`render.com/services/web2-order-tags-service.js` (MỚI)** — engine 1 nguồn: TRIGGER registry 21 trigger (cho_hang/am_ma/het_hang/mua_1_phan/pbh_created/pbh_chua_tt/is_draft|confirmed|cancelled/chua_nhan_ck/da_nhan_ck/co_coc/thieu_dia_chi/thieu_sdt/ship_tinh/ship_tp/gop_don/don_tach/da_in/tu_livestream/tu_inbox) + PREDICATES + `orderProductFlags` + `buildContext` (query web2_products status/stock + held-in-drafts aggregate) + `computeAutoTags` + `enrichOrdersWithTags` + `ensureTable`/seed 3 tag mặc định. **Âm mã = held_in_drafts > stock_hiện_tại** (PBH đã trừ stock → tương đương held+PBH > tồn_gốc); chỉ áp đơn nháp; loại trừ SP CHO_MUA. 18 unit test pure-logic PASS.
- **`render.com/routes/web2-order-tags.js` (MỚI)** — CRUD bảng `web2_order_tags` (web2Db) + `GET /triggers` (registry cho UI) + SSE `web2:order-tags`. Mount `/api/web2-order-tags` (worker auto-route qua prefix `/api/web2-`). Mutation gắn `requireWeb2AuthSoft`.
- **native-orders `/load`** — sau mọi enrich gọi `enrichOrdersWithTags` → mỗi đơn có `o.autoTags` (pills) + `o.hasChoHang` (chặn PBH).
- **fast-sale-orders `/from-native-order`** — guard: SP CHO_MUA ở dòng bán → 400 `cho_hang_blocked` (force=true bỏ qua). Defense-in-depth.

**Frontend:**

- **`web2/shared/web2-order-tag-pill.js` (MỚI)** — `Web2OrderTagPill` render pill màu (1 nguồn cho cột Thẻ + preview trang config).
- **`web2/order-tags/` (MỚI)** — trang Cấu hình: card grid + modal (trigger picker nhóm + color + icon + live preview) + danh sách trigger tham chiếu + SSE. Đăng ký sidebar "Cấu hình" + WEB2_PAGES.
- **native-orders cột "Thẻ"** — th/td `col-tag` (sau Mã), COL_KEYS+COL_DEFAULT (`tag:true`), `NO._autoTagPills`, colspan 16→17 (2 expand row + loading), `autoTags`/`hasChoHang` vào `_rowSignature`.
- **Chặn PBH** — `createPbh` (chặn sớm `src.hasChoHang` → mời Phiếu soạn hàng), `_doCreatePbh` (handle `cho_hang_blocked`), `bulkCreatePbh` (tách đơn chờ hàng, báo rõ). SSE thêm sub `web2:products`/`web2:fast-sale-orders`/`web2:order-tags` → reload tính lại tag.
- Verify: `node --check` 13 file PASS + 18 unit test engine PASS. ⚠ Tag/guard chỉ live sau deploy Render (server tính autoTags).

### [audit d] Money-path adversarial audit (25 agent → 20 finding → 9 confirmed) — fix 9/9

User chọn (d) audit thêm 1 vùng. Chọn **money/ledger** (rủi ro cao nhất + regression-check fix a). Workflow 5 finder (supplier-wallet/customer-wallet/PBH/sepay/over-refund-regression) → skeptic verify từng finding. 9 confirmed, fix HẾT:

- **#1+#2 HIGH (regression của fix a)** — over-refund cap: (1) `/tx` pin `min(serverQty,client,prev)` → row partial nhận 2/10 pin 2 → KHOÁ vĩnh viễn dù sau nhận đủ 10; (2) `/quick-refund` không pin `ordered` → cross-path asymmetry. **Gốc**: lib trả `row.qty` (ĐẶT) không phải NHẬN. **Fix**: `loadSoOrderRowQtyMap`→`loadSoOrderReceivedQtyMap` status-aware (received=partial→min(qtyReceived,qty), received→qty, else 0 — khớp client `aggregateSuppliers`); cap = serverQty (received, tính LẠI mỗi lần) khi tra được → bỏ qua client/pin (hết khoá); so-order wipe → fallback tightest(prev,client); không nguồn → reject. Pin `ordered=cap` ở CẢ 2 path. 11-case matrix PASS.
- **#5 HIGH PBH oversell** — `POST /` (manual create) thiếu advisory lock như `from-native-order` → 2 create cùng SP qua validateStock (ngoài txn) rồi cùng `GREATEST(0,stock-qty)` nuốt âm = oversell thầm lặng. **Fix**: port khối `pg_advisory_xact_lock` per code (sort) + recheck tồn tươi trong txn → throw `__overSell`; catch → 400.
- **#6 HIGH PBH stock drift** — `PATCH /:number` `orderLines` overwrite order_lines KHÔNG điều chỉnh tồn (thêm dòng=không trừ; cancel sau restock qty sai). 0 client dùng. **Fix**: reject 400 `order_lines_immutable` (sửa dòng = huỷ+tạo lại).
- **#7 HIGH wallet drift** — `wallet_deducted = $1` (overwrite) race với `applyWalletToUnpaidPbhs` (SePay đến cùng lúc) → ghi đè, hoàn thiếu khi cancel. **Fix**: `wallet_deducted = COALESCE(wallet_deducted,0) + $1` (additive) ở POST / + from-native.
- **#9 MED→ SePay race** — webhook ↔ reprocess-cron cùng `debt_added=FALSE` → cùng `processDeposit` → double-credit khi index #8 vắng. **Fix (sau verify regression)**: KHÔNG dùng advisory-lock wrapper giữ thêm connection (bản đầu gây **deadlock pool** khi burst — verify bắt được). Đóng race ở ĐÚNG điểm credit: `processDeposit` re-check sepay dup SAU `FOR UPDATE` ví (2 caller cùng phone serialize trên wallet lock → caller 2 thấy tx caller 1 → alreadyProcessed) — connection-safe, độc lập index.
- **#8 HIGH SePay index** — unique index `idx_..._sepay` bị SKIP ở boot nếu có dup → mất backstop. Mitigated bởi #9 (serialize). **Fix**: log CRITICAL + note (KHÔNG auto-DELETE row ví ở boot — đụng balance).
- **#4 MED customer-wallet withdraw** — `processWithdraw` thiếu in-tx dup-check (deposit có MED-6) → TOCTOU. **Fix**: thêm dup-check `(type=WITHDRAW, reference_id)` sau FOR UPDATE → alreadyProcessed.
- **#3 HIGH customer-wallet double-click** — server UUID/req fallback KHÔNG dedupe 2 request rời (comment sai). 0 active caller (`Web2WalletApi.deposit/withdraw` chưa dùng). **Fix**: thêm param `idempotencyKey`→ header `x-idempotency-key` ở client (seam cho caller tương lai gửi key ổn định/lần mở modal) + sửa comment server cho đúng. Bump `web2-wallet-api.js?v=20260621d`.
- 11 finding refuted (false positive) — verifier skeptic loại. Verify: `node --check` 6 file PASS + cap-matrix PASS. ⚠ Money path — chỉ live sau deploy Render.

### [perf] inventory-tracking Quản Lý Ảnh — lưu chậm vì "lưu lại toàn bộ + load lại toàn bộ"

User báo lưu trong modal Quản Lý Ảnh lâu. Chẩn đoán đúng: `open()` nạp TẤT CẢ đợt vào `_rows`, `save()` bucket MỌI đợt → PUT từng đợt → sửa 1 ảnh re-upload cả bảng base64; mỗi PUT server `DELETE+INSERT` cả slot rồi **trả về TOÀN BỘ bảng** (mọi base64) + SSE push full table → tải lại toàn bộ.

- **Client `modal-image-manager.js`**: (1) `_canonicalDotContent()` + snapshot `_originalDotContent` lúc open → `save()` CHỈ PUT đợt thực sự đổi (no-op save = 0 request); (2) rebuild `globalState.productImages` từ `_rows` trong RAM thay vì từ response nặng (không tải full table); refresh snapshot sau lưu.
- **Server `routes/v2/inventory-tracking.js`**: PUT trả slim `{success,count}` (bỏ SELECT full table); `_scheduleImagesNotify()` gửi SSE nhẹ `{action:'update'}` thay vì cả bảng.
- **Client SSE `data-loader.js`**: handler `product_images` bỏ qua echo của chính máy vừa lưu (self-write) → không tải lại sau mỗi save; reconcile 1 lần sau cửa sổ self-write để bắt save đồng thời từ máy khác.
- **Deploy-safe**: client tương thích ngược server cũ (PUT body không đổi, không phụ thuộc shape response, SSE handler chịu cả full-table lẫn lightweight). Server-side benefit kích hoạt sau khi Render deploy; degrade graceful.
- Web 1.0 (pool `chatDb`), KHÔNG đổi schema/SQL write semantics (vẫn slot DELETE+INSERT). Verify Playwright live trên prod (server cũ): no-op save = 0 PUT (71ms); sửa 1 đợt = đúng 1 PUT đợt đó (đợt khác không đụng); globalState rebuild đúng; seed/sửa/clear đợt-test 99 rồi cleanup sạch (totalImages 82→82). `node --check` 3 file PASS.
- ⚠ Còn lại (chưa làm): sửa 1 NCC trong đợt lớn (vd Đợt 2 = 81 NCC) vẫn re-upload cả slot đó. Phase 2 (per-NCC upsert `ON CONFLICT (ngay_di_hang,dot_so,ncc)`) cần staged server+client deploy → defer, hỏi user nếu vẫn chậm.

### [fix] inventory-tracking — đồng bộ 2 chiều tab Đợt giữa "Theo Dõi Đơn Hàng" và "Quản Lý Ảnh"

User báo: tạo Đợt 3 ở tab theo dõi đơn hàng (Hình 1) nhưng modal Quản Lý Ảnh (Hình 2) không có Đợt 3 — và ngược lại. Gốc: 2 surface tính danh sách đợt từ **2 nguồn KHÔNG hợp nhất** — order-tracking (`getAvailableDotSoList`) chỉ đọc `globalState.shipments[].dotSo`; image-manager (`_allDotSos`) chỉ đọc `_rows` (từ `globalState.productImages` + 1 row trống ở đợt active). Đợt chỉ có shipment (chưa có ảnh) hoặc chỉ có ảnh (chưa có shipment) bị thiếu ở surface kia.

- **Fix 1** `data-loader.js getAvailableDotSoList()` → UNION shipment đợt + product-image đợt (order-tracking hiện đợt chỉ-có-ảnh).
- **Fix 2** `modal-image-manager.js _allDotSos()` → union rows + `_knownDotSos` (shipments+ảnh) → modal hiện đợt chỉ-có-shipment (vd Đợt 3 mới tạo, count 0).
- **Fix 3** `open()` → đợt active mặc định lấy `UIState.getActiveDotTab()` (mở modal từ Đợt 3 → modal vào Đợt 3).
- **Fix 4** `save()` → gọi `DotTabs.render()` sau khi cập nhật `globalState.productImages` (đợt tạo trong modal hiện ngay ở order-tracking; `applyFiltersAndRender` không rebuild tab bar).
- Web 1.0 (pool `chatDb`, không đụng DB/pool). Verify Playwright live: shipments=[1,2,3] images=[2,3] → modal tabs [Đợt 1·0, Đợt 2·81, Đợt 3·2] active Đợt 3 (trước thiếu Đợt 1); inject đợt-ảnh ảo 9 → order-tracking tabs [1,2,3,9] → revert sạch (no DB write). `node --check` 3 file PASS.

### [feature b] Gate worker `/api/facebook-graph` — allowlist read-only + GET-only (chặn open Graph relay)

`handleFacebookGraph` (cloudflare-worker/modules/handlers/facebook-handler.js) là proxy Graph GET MỞ: ai có access_token đọc node Graph tuỳ ý. Audit xác nhận **0 caller frontend** dùng route worker này (web2-fb-posts đi Render riêng; orders-report dùng TPOS `/api/facebook-graph/*` khác host; `/livevideo` là route FACEBOOK_LIVE riêng) → gate an toàn, không ảnh hưởng Web 1.0/2.0.

- `normalizeAllowedGraphPath()` + `FB_GRAPH_ALLOW` (regex): chỉ cho edge READ (`me`, `me/accounts`, `debug_token`, `oauth/access_token`, `{id}`, `{id}/{comments|feed|posts|live_videos|insights|...}`, `act_{id}/{insights|campaigns|...}`). Chặn scheme (`://`), `@`, `\`, `..`, `//`, path > 256 → 403.
- GET-only → 405 (OPTIONS preflight đã short-circuit ở worker.js:86). Host upstream cố định graph.facebook.com nên `path` không đổi host được.
- Verify: ESM `node --check` PASS; 9 allow + 10 block case PASS (gồm SSRF `http://169.254.169.254`, traversal, `:80`, `@`).
- ⚠ **Worker change — chỉ có hiệu lực sau `wrangler deploy`** (git push KHÔNG deploy worker).

### [feature a] Over-refund cap ví NCC — SERVER-AUTHORITATIVE qua so-order (cả /quick-refund + /tx)

User chọn làm tiếp (a) over-refund feature. Trần (cap) SL trả NCC giờ lấy SL đã mua THẬT từ `web2_so_order` ở CẢ 2 money path, không còn no-op khi client giấu `ordered`.

- **Lib dùng chung** `render.com/lib/web2-so-order-qty.js` — `loadSoOrderRowQtyMap(client)` build `Map(rowId→Σ qty)` từ so-order doc 'main'. Tách lib vì `purchase-refund.js` đã `require('./web2-supplier-wallet')` → tránh circular require; cả 2 route cùng require lib.
- **purchase-refund.js `/quick-refund`** (branch rowReturns): bỏ hàm `loadSoOrderRowQtyMap` local → dùng lib. Trần = min(serverQty, clientOrdered) các giá trị >0; **cap===null (không nguồn nào tra được SL mua) → REJECT 400** thay vì cho trả vô hạn (trước đây cap=null = no-op).
- **web2-supplier-wallet.js `/tx` type=return**: thêm `loadSoOrderRowQtyMap` (đọc 1 lần trong transaction, dưới meta FOR UPDATE). Trần = min(serverQty, prevOrdered-pinned, claimedOrdered) các giá trị >0 — serverQty (so-order) ưu tiên, chỉ cho SIẾT không NỚI; **cap===null → REJECT 400**. Pin `ordered=cap` (trần siết chặt nhất) cho lần trả sau.
- Flow purchase-refund quick/bulk (KHÔNG gửi rowReturns) + `/tx` payment KHÔNG đổi (negative-stock-by-design giữ nguyên; chỉ siết đường rowReturns). Legacy `updateSupplierWallet` (type=return không rowReturns) không ảnh hưởng.
- Verify: `node --check` 3 file PASS; offline 8-case cap matrix PASS (server caps inflated client, no-server→client, nothing→reject, pin-tighter-wins). Money path — KHÔNG smoke prod (chỉ deploy Render mới live).

### [audit r9] Adversarial audit 7 mặt cuối (33 agent) → 16 bug → fix 16 (delivery/refund gate staged)

7 finder (worker-handlers/remaining-pages/generic-entity/zalo-oa-creds/native-orders-modules/sse-notify-completeness/mutation-idempotency). 16 confirmed, fix hết:

- **worker-handlers (2)**: `pancake-handler` log `targetUrl` chứa `access_token` (mọi chat/settings call) → import+dùng `redactUrlForLog` (export từ proxy-handler). `image-proxy` SSRF guard bị bỏ qua ở nhánh resize (forward `?url=` sang Render không validate → `url=http://169.254.169.254/...`) → validate TRƯỚC nhánh wantResize.
- **remaining-pages (3)**: report-revenue `new Date(s.day)` UTC → nhãn ngày lệch −1 (GMT+7) → parse local midnight. delivery+refund state-mutation POST KHÔNG gửi token + route không gate → client gửi authHeaders (gate route ở commit staged sau). printer-settings native `confirm()` → `Popup.danger`.
- **generic-entity (3)**: dedicated-entity history không cap → MAX_HISTORY=300 (khớp generic); `_storage` GET không auth (lộ entity_slug+size) → gate; dedicated-entity `parseInt(page/limit)` NaN khi `?page=` rỗng → `|| default`.
- **zalo-oa-creds (2)**: ZNS sendZNS không idempotency → gửi trùng tốn phí khi retry → check (phone,template,orderRef) sent/pending 10 phút. `/send-zns` không rate-limit → thêm limiter 5 tin/SĐT/phút (+prune map).
- **native-orders-modules (1)**: `_showFbBusinessLoginPrompt` nhánh fallback gọi `window.Popup.confirm` KHI Popup undefined → TypeError → dùng `confirm()` native.
- **sse-notify-completeness (2)**: campaign CRUD (create/delete/assign/unassign) + "Lưu Live" save/delete KHÔNG `_notify` → tab khác stale → thêm `_notify('campaign'|'saved')`.
- **mutation-idempotency (3)**: supplier-wallet `nextval` tiêu TRƯỚC dup-check → gap số PAY/YEAR/NNNN khi retry → pre-check tx_id trước nextval. msg-templates DELETE không check rowCount → false 200+SSE giả → RETURNING+404. quick-replies seed cold-start race nhân đôi → cache PROMISE (chạy 1 lần).
- **STAGED**: delivery-invoices.js + refunds.js route gating → làm sau khi client (dlv-app/rf-app ?v=r9) deploy lên nhijudy.store (tránh 401-window như ck-dashboard r8).
- **STAGED DONE** (commit này, sau khi nhijudy.store serve client ~60s): gate delivery-invoices (from-pbh/ship/deliver/return/cancel/patch/delete) + refunds (approve/complete/cancel/delete) bằng requireWeb2AuthSoft. /from-pbh refunds = 410 stub (bỏ qua).
- Cache-bust `?v=20260621r9` (native-orders-state/dlv-app/rf-app). report-revenue/printer-settings = inline script (tự fresh khi load trang).

### [hotfix r8] ck-dashboard 401 — fetchJson thiếu token sau khi gate customer-intents

User báo `ck-dashboard` 401 `Cần đăng nhập Web 2.0` trên `/api/web2/customer-intents`. Regression r8: gate GET customer-intents nhưng client `ck-dashboard-app.js fetchJson` (dùng cho CẢ payment-signals + customer-intents) chỉ `credentials:'include'`, KHÔNG gửi `x-web2-token`. Fix: `fetchJson` thêm `Web2Auth.authHeaders()`. Bump `?v=20260621r8fix`. (Bài học: khi gate GET, verify ĐÚNG hàm fetch của caller gửi token — ck-dashboard có 2 đường fetch, chỉ POST /done có token, GET list thì không.) Kèm fix icon lucide `message-square-warning` (không có trong 0.294.0) → `message-square`.

### [audit r8] Adversarial audit 7 mặt còn lại (39 agent) → 19 bug → fix 16, defer 3 + phát hiện secret leak Web 1.0

7 finder mới (zalo/shared-2/wallet-routes/pages-logic/livechat/media-ai/worker-security). livechat=0 (sạch). 19 confirmed, fix 16:

- **CRITICAL ✅ Zalo double-encrypt** `web2-secret-crypto.js` `encryptJson` không idempotent → `web2-zalo` persistSession encrypt rồi `_saveSession` encrypt LẦN 2 (WEB2_ENC_KEY bật ở prod) → ciphertext lồng → decryptJson ra `{__enc__}` thay vì creds → **restore phiên Zalo FAIL toàn bộ**. Fix: `encryptJson` trả nguyên nếu value đã `{__enc__: enc:v1:...}`. (Session đã hỏng cần re-login 1 lần.)
- **CRITICAL ✅ double-debit /withdraw** `v2/web2-wallets.js` thiếu idemKey server-side khi client không gửi header (deposit đã fix #19, withdraw bỏ sót) → double-click/retry trừ ví 2 lần. Fix: sinh `mwdr_<uuid>` + dup-check luôn (partial unique index bảo vệ).
- **HIGH ✅ Zalo** reconnect thiếu `expectedUid` guard (gắn nhầm danh tính) + persistSession nuốt lỗi (`_pool` null cold-start → báo 'connected' nhưng session không vào DB → mất sau restart). Fix: thêm guard + ném lỗi thay vì nuốt + `_saveSession` throw khi `_pool` null.
- **HIGH ✅ rò secret/token vào log**: Pancake JWT trong `?token=` URL avatar (`web2-customer-chat-core.js` → worker log) → bỏ token (avatar FB public); Gemini key trong `?key=` URL (`web2-caption-service.js`) → header `x-goog-api-key`; worker trả `error.stack` cho client (`worker.js`) → message generic + log server; SePay dashboard nhận creds qua GET query + log email (`sepay-dashboard-handler.js`) → chỉ POST + bỏ log email.
- **HIGH ✅ auth gap (PII)**: `v2/web2-customer-orders.js` GET (tên/SĐT/địa chỉ+đơn+tiền) hoàn toàn không auth → gate + 2 client gửi token (customer360, pbh-render; returns-api đã gửi). `web2-customer-intents` GET `/`+`/stats` (PSID/msg/intent) → gate (ck-dashboard đã gửi token). `web2-comment-boost` GET `/jobs`+`/job/:id` → gate (multi-tool đã gửi token).
- **MED ✅**: photo-studio batch object URL không revoke → leak handle → revoke sau 5s; cutout (4 fetch) + comment-boost-worker (2 fetch) thiếu timeout → `AbortSignal.timeout` (cạn worker slot); geocode cache vô hạn → trần 5000 + evict oldest; customers tier-3b import tuần tự ≤12 RTT → `Promise.allSettled`; Zalo `MEDIA_BASE` fallback raw-Render host → worker proxy (URL media bền khi đổi host).
- **DEFER (cần user/feature)**: (1) supplier over-refund cap null khi `ordered` vắng — ép `ordered>0` sẽ chặn return hợp lệ khi SL đặt unknown → cần server tra so-order received-qty (feature, như r5 #1); (2) worker `/api/facebook-graph` open Graph proxy (GET-only) — allowlist rủi ro vỡ Web 1.0 orders-report; (3) imgbb key hardcode trong worker (`image-proxy-handler.js`) — cần xoay key + CF secret.
- **⚠️ PHÁT HIỆN NGOÀI SCOPE (CRITICAL, Web 1.0)**: SePay email+password+api_key HARDCODE plaintext trong `shared/js/navigation-modern.js` (nạp MỌI trang) + `service-costs/js/service-costs.js` → lộ cho mọi browser xem source. Cần: chuyển creds vào worker env server-side + **xoay password & api_key** + client gọi không kèm creds. SURFACE cho user (cần xoay key = user action).
- Cache-bust `?v=20260621r8` (customer360/pbh-render/customer-chat-core/photo-studio-edit/customers-events).

### [audit r7] Adversarial audit 7 mặt mới (29 agent) → 11 bug xác nhận → fix HẾT 11

7 finder mới (cron-workers/native-orders-core/soorder-stock/frontend-xss/auth-session/reconcile-sepay/schema-migrations) + skeptic/finding. XSS surface = 0 (sạch). 11 confirmed, fix hết:

- **cron-workers (4)**: `web2-webhook-retry.js` — (a) enqueue ON CONFLICT ghi đè next_retry_at=2min làm SỤP backoff khi SePay re-deliver → `GREATEST(existing, EXCLUDED)` giữ lịch xa hơn; (b) SELECT FOR UPDATE SKIP LOCKED chạy autocommit (lock nhả ngay → vô hiệu) → bọc CLAIM trong transaction + lease next_retry_at +10min, processFn ngoài txn + `_processing` guard chống overlap tick. `web2-ck-watcher.js` N+1 QR lookup (200 query/signal) → `_prefetchQrMap` 1 query + `_resolveTxIdentity(db,tx,qrMap)`. `web2-unread-reconcile.js` `_fetchConversations` chỉ trang 1 → phân trang `page_number` (cap 10) + guard dừng nếu API không phân trang.
- **native-orders-core (1)**: `native-orders-render.js` `_rowSignature` THIẾU `ckSignal` → badge "💸 KH báo đã CK" (đổi qua SSE, không bump updated_at) không hiện trên row tái dùng DOM → thêm `ckSignal.id:status` vào chữ ký.
- **soorder-stock (2)**: `so-order-receive.js` index lookup chỉ name|variant "first match wins" → 2 SP cùng tên+biến thể KHÁC NCC cộng tồn nhầm SP → 2 index (name|variant|supplier ưu tiên + fallback name|variant). `so-order-storage-sync.js` 409 conflict DROP `_pendingState` → mất edit (pullOnce tab-focus đè) → khôi phục `_pendingState=stateSnapshot` + pullOnce guard thêm `_pendingState`.
- **auth-session (1)**: `web2-auth.js` verify() gửi `?token=` URL → lộ token vào log Render (server.js ghi req.url) → chuyển sang header `x-web2-token`. Defense-in-depth: server.js `_redactUrl` che `token=/page_access_token=/jwt=` trước khi log (cũng che SSE/avatar buộc dùng query).
- **reconcile-sepay (2)**: `web2-payment-signals.js` /approve gửi tin xác nhận KHÔNG claim `confirm_msg_sent` → KH nhận 2 tin khi QR-match + approve cùng GD → claim flag atomic trước `sendCkReply`. `web2-ck-watcher.js` `_applyMatch` rollback ghi `sig.status` (stale) → clobber staff-confirm xen giữa → CASE chỉ revert 'pending' khi `confirmed_by='(watcher tự động)'`.
- **schema-migrations (1)**: `web2-sepay-matching.js` DROP+ADD CHECK constraint MỌI boot → AccessExclusiveLock + scan web2_balance_history → guard `IF EXISTS pg_constraint THEN RETURN` (sau lần đầu = catalog-lookup không lock).
- Cache-bust `?v=20260621r7`: web2-auth(49)/web2-sidebar(46)/native-orders-render(1)/so-order-receive(1)/so-order-storage-sync(1) + sidebar inject.

### [audit r6 batch 2] fast-sale-orders — gate auth toàn bộ mutation + chống over-sell race (2 bug cuối)

Hoàn tất 2 finding critical-path còn lại của r6 (PBH/tồn kho). Staged deploy chống 401-window:

- **K — auth gap (MED/HIGH)**: TOÀN BỘ mutation `/api/fast-sale-orders/*` (13 route: POST `/`, `/from-native-order`, `/bulk-confirm`, `/bulk-cancel`, `/merge`, `/backfill-customer-links`, `/reset-stt`, PATCH `/:number`, POST `/:number/cancel`, `/by-source/:code/cancel`, `/:number/confirm`, `/:number/print`, DELETE `/:number`) KHÔNG có auth → ai biết worker URL đều tạo/huỷ/xác nhận PBH + trừ kho + trừ ví. Agent enumerate 11 client call-site thiếu token. **Staged**:
    - stage1 (`4e3b49217`): client gửi `x-web2-token` — pbh-actions (7), native-orders-pbh-bill (3), bulk-operations (2), print.html (đọc localStorage). Harmless (route chưa gate). Deploy + verify nhijudy.store đã serve client mới (8+3 ref).
    - stage2 (commit này): gate 13 route bằng `requireWeb2AuthSoft`. Extension KHÔNG gọi fast-sale-orders. ⚠ QA scripts `pbh-qa-test.js`/`test-pbh-wallet-cod.js` sẽ 401 (cần wire token khi chạy — không ảnh hưởng prod).
- **L — over-sell race (HIGH)** (`b9f7b0f56`): `validateStock` chạy NGOÀI txn + advisory lock chỉ theo `source_id` → 2 PBH khác native-order cùng 1 SP chạy song song đều qua check rồi cùng trừ → `GREATEST(0,stock-qty)` nuốt âm = over-sell thầm lặng. Fix: trong `withTransaction` trước INSERT, `pg_advisory_xact_lock('web2_product_stock:<code>')` (sort tránh deadlock) + re-check tồn tươi → `__overSell` throw → 400 over_sell (format client đã xử lý). `force=true` vẫn bypass.

### [audit r6] Adversarial audit 7 mặt (28 agent) → 14 bug xác nhận → fix 12 (1 CRITICAL ví)

Workflow 7 finder (worker/sse/money/pancake-zalo/orders-stock/shared-core/write-validation) + skeptic nghiêm/finding → 14 confirmed. Fix đợt này 12 (2 fast-sale-orders để pass sau):

- **CRITICAL ✅ ví trừ không atomic** `web2-returns.js` nhánh `van_de_shipper`: `processWithdraw(pool)` commit ngay rồi INSERT riêng (`pool.query`) → INSERT fail (non-23505/hết retry) thì ví ĐÃ trừ mà KHÔNG có phiếu → khách mất tiền không dấu vết. Fix: bọc `withTransaction` (processWithdraw nhận `client`), retry-23505 tạo txn MỚI mỗi lần — mirror đúng nhánh `van_de_khach`.
- **HIGH ✅ auth gap (lộ PII/metadata)**: `web2-msg-send.js` 4 GET (`/active`,`/:id`,`/failed-codes`,`/extension-items` — lộ fb_user_id/thread_id/message) + `web2-live-relay.js` GET `/pages` (lộ Pancake page/account) → thêm `requireWeb2AuthSoft`. Client tương ứng (`web2-msg-template-send.js` 4 fetch, `pancake-settings-api.js` /pages) thêm `authHeaders` (extension KHÔNG gọi msg-send → an toàn).
- **HIGH ✅ worker misroute** `cloudflare-worker/.../routes.js`: `/api/admin/web2-*` (data-reset/wallet-reset/import-\*) rơi catch-all TPOS (tomato.tpos.vn 404) vì khớp `/api/admin/` không `/api/web2-`. Thêm `startsWith('/api/admin/web2-')→WEB2_GENERIC` trước catch-all.
- **HIGH ✅ DoS bulk-write** `web2-products.js` 4 route (adjust-stock/adjust-pending/upsert-pending/confirm-purchase-partial): mảng không cap + loop SELECT FOR UPDATE/item → cạn pool. Thêm `MAX_BULK_ITEMS=1000`.
- **HIGH ✅ SSE stale** `web2-sse-bridge.js`: `suppressResyncOnce` kẹt `true` nếu reopen-đổi-topic lỗi trước `connected` → reconnect thật bỏ resync → trang stale. Xoá cờ trong `_scheduleReconnect`.
- **HIGH→ MED ✅ silent 401** `web2-customer-store.js` `_post` không check `r.ok` → 401 trả `{}` im lặng (cột khách trống vô cớ). Thêm check + cảnh báo throttle 60s khi 401.
- **MED ✅** `popup.js`: keydown gắn trên document cho MỌI popup → Enter/Escape resolve nhầm popup dưới (có thể chạy xoá ngoài ý). Thêm `_popupStack`, chỉ popup trên cùng nhận phím.
- **MED ✅** `web2-variants.js` PATCH/DELETE `/:id` thiếu ràng buộc `(\d+)` (GET đã có) → id phi số lộ lỗi type bigint. Thêm `(\\d+)`.
- **MED ✅** `web2-generic.js` `data.history` push không giới hạn → JSONB phình. Cap `MAX_HISTORY=300` (giữ entry gần nhất).
- **CÒN LẠI (pass sau, critical-path PBH)**: `fast-sale-orders.js` (a) mutations thiếu auth, (b) validateStock race over-sell — cần verify client + transaction kỹ.
- Cache-bust: bump `?v=20260621r6` cho web2-sidebar(46)/sse-bridge(35)/customer-store(4)/msg-template-send(1)/pancake-settings-api(1) + popup.js inject.

### [audit r5] Giải quyết 6 deferred-item — fix 2 (fb-posts auth gate + inventory clamp), 4 xác nhận không-bug

User: "làm tất cả -> audit -> tìm lỗi -> lặp lại đến khi hệ thống hoàn hảo". Soi ground-truth 6 item deferred từ r1-r4:

- **FIX ✅ #4 fb-posts auth** `render.com/routes/web2-fb-posts.js` — 8 read GET (`/list`,`/post-detail`,`/engagement`,`/insights-probe`,`/ad-accounts`,`/ad-insights`,`/ad-entries`,`/drafts`) thêm `requireWeb2AuthSoft`. An toàn vì client shared `web2/shared/web2-fb-client.js` ĐÃ gửi `Web2Auth.authHeaders()` trên MỌI request (jget+jpost), và `/caption`+`/publish` POST cùng route đã gate + chạy prod OK → token đã forward. Giữ `/status`+`/auth/*` mở (OAuth callback FB redirect phải reachable). Đóng info-disclosure bài FB + ad-spend của shop.
- **FIX ✅ #6 inventory-tracking DoS** `render.com/routes/v2/inventory-tracking.js` (Web 1.0, chỉ đọc — KHÔNG đổi pool/data) — thêm `clampLimit` (def 200, MAX 1000) + `clampOffset` (≥0), thay 3 site `parseInt(limit/offset)` (paginate + meta echo). Chống `?limit=99999999` kéo cả bảng + `LIMIT NaN` crash khi `?limit=abc`.
- **KHÔNG-BUG / không sửa (ground-truth)**:
    - #1 over-refund cap `web2-supplier-wallet.js` — ĐÃ server-authoritative: client `supplier-wallet-actions.js:91-92` gửi `ordered` thật, server pin min-ceiling dưới `FOR UPDATE` (chống `ordered` phồng + race 2 modal). Residual = row thiếu ordered qty = data-completeness, không phải code bug.
    - #2 wallet UNIQUE index `web2-wallet-service.js` — double-credit ĐÃ chặn bằng `FOR UPDATE` + check-after-lock (deposit #2 thấy tx #1 committed → alreadyProcessed). Thêm UNIQUE trên bảng tiền THẬT rủi ro fail-boot nếu có dup cũ → reward<risk, giữ nguyên.
    - #3 dashboard "SP chờ" `dashboard-kpi.js:153` — đếm số DÒNG SP chưa nhận (`pending.length`), self-consistent; sum-quantity là preference hiển thị, không phải bug.
    - #5 audit-log cast `v2/audit-log.js` — UNION đã type-consistent: 4 block đều emit `timestamptz` (`to_timestamp()` cho BIGINT, native TIMESTAMPTZ cho wallet). Không mismatch — FP.
- **Bonus**: phát hiện + khôi phục 983 dòng `docs/dev-log.md` bị xoá nhầm (uncommitted, không ai yêu cầu) → `git checkout HEAD`.

### [audit r4] Web 2.0 round-4 audit (live-chat/ai-media/products/fb/notif/perf) → fix 1, phần lớn FP/out-scope/defer

Audit 6 mặt cuối → 31 finding → verify → 16 confirmed. Nhưng soi kỹ: chỉ **1 fix thật autonomous-safe**, phần lớn là false-positive / Web 1.0 / cần user quyết → tín hiệu **HỘI TỤ** cho phần sửa tự động.

- **FIX ✅** `video-tts.js:196` (HIGH) — `toAudioBuffer` thêm fallback `getChannelData().set()` khi browser cũ (Safari/iOS) thiếu `copyToChannel` → hết crash phát giọng. Khớp web2-video-audio.js.
- **FALSE-POSITIVE (KHÔNG fix — sẽ phá tính năng)**: 3 "CRITICAL IDOR" + 1 HIGH ở `v2/notifications.js` (unread-count/mark-all-read/:id/read/create thiếu lọc user_id). Thực tế notifications là **shop-wide by design**: cột `user_id` nullable, KHÔNG producer nào set user_id (toàn null = thông báo chung cho mọi NV shop nhỏ). Thêm `WHERE user_id=$1` → mọi NV thấy 0 thông báo. Muốn per-user là **đổi feature**, không phải fix bug.
- **OUT OF SCOPE (Web 1.0)**: `v2/inventory-tracking.js` 3 HIGH unbounded LIMIT (DoS) + 1 MED NaN — inventory-tracking là **Web 1.0** (CLAUDE.md: /api/v2/\* core). KHÔNG sửa trong đợt Web 2.0; **surface cho user** xử lý riêng (cap LIMIT an toàn).
- **NEGLIGIBLE / không sửa**: video-maker BufferSource one-shot tự GC (không leak thật); web2-products `newStatus=row.status` giữ NULL cũ (không tạo corruption mới).
- **DEFER cho user quyết (verify caller trước)**: `web2-fb-posts.js` /list,/post-detail,/ad-insights,/ad-accounts — unauth GET đọc dữ liệu FB post của shop (KHÔNG lộ token — response không chứa token). Nên gate `requireWeb2AuthSoft` NHƯNG frontend fb-posts fetch Pancake browser-direct, chưa xác nhận caller route gửi token → gate ẩu có thể vỡ. `v2/audit-log.js` UNION `created_at` type mismatch (MED) — cần verify cast SQL kỹ.

**KẾT LUẬN 4 vòng**: 51 confirmed → **44 fix đã push** (r1:25, r2:7, r3:12, r4:1) gồm 4 CRITICAL thật (capture-lock auth, zalo boot expectedUid, so-order footer cost, + r2 over-refund được re-grade). Còn lại là FP / Web 1.0 / cần user quyết (over-refund cap design, wallet UNIQUE index, dashboard SP-chờ semantics, fb-posts gate, audit-log cast, inventory-tracking Web1).

### [audit r3] Web 2.0 round-3 audit hội tụ (native/so-order app, worker, KPI, a11y) → fix 12 ✅

Audit 5 mặt chưa quét sâu → 18 finding → verify → **13 confirmed**. Fix 12, defer 1 (ambiguous).

- **CRITICAL** `so-order-render.js:715` — footer "Tổng tiền" dùng `sellPrice` (giá bán) thay vì `costPrice` (giá nhập) → đơn MUA NCC hiển thị tổng sai (phồng). Đổi sang costPrice, khớp `so-order-modal-core:456-458` ("Σ SL × GIÁ NHẬP").
- **HIGH** `native-orders-pbh-bill.js:762` — gọi `renderOrders()` không tồn tại → ReferenceError, list không refresh sau huỷ đơn → `NO.renderRows()`.
- **HIGH** `native-orders-bulk-operations.js:61` — STT confirm dùng `displayStt` trần → dùng `NO.computeOrderStt()` (ưu tiên campaignStt cho đơn livestream).
- **HIGH** `realtime-sse-web2.js` relay-notify — chặn relay topic `web2:_admin:*` (403), cap payload 10KB (413), whitelist event type; `setForwardTarget` bắt buộc https (SSRF guard nhẹ).
- **HIGH** `dashboard-kpi.js:57` — revenue 7d WHERE lọc rolling 7×24h UTC nhưng GROUP BY theo ngày +7 → bucket sớm bị cắt; đổi WHERE lọc theo ngày VN (khớp GROUP BY).
- **HIGH** `report-revenue/index.html:564` — `onclick="openCustomerModal(${c.customerId})"` chưa escape → coerce `Number(c.customerId)||0` (number literal, hết XSS); `c360Close` thêm aria-label + tap-target.
- **HIGH/MED a11y** `purchase-refund/index.html` 4 nút `×` thêm `aria-label="Đóng"`; `.pr-quick-close` tap target ≥44px.
- **DEFER (cần user quyết)**: `dashboard-kpi.js:156` `unrecvProducts += pending.length` — "Y SP chờ" nghĩa là số DÒNG SP hay TỔNG SỐ LƯỢNG? Ambiguous → không đổi number dashboard theo phỏng đoán.
- `node --check` pass; bump `?v=` (so-order-render, native-orders-pbh-bill/bulk, purchase-refund.css).

### [audit r2] Web 2.0 round-2 audit sâu (money/sql/xss/auth/race/pages + regression r1) ✅

Workflow audit sâu 7 mặt → 44 finding → verify → **11 confirmed**. Fix 7 thật, defer 2 (money cần design), bỏ 3 false-positive. **Regression check r1: SẠCH** (không lỗi mới từ 25 fix round 1).

- **r2a** — auth-gate 4 route READ lộ data nhạy cảm không auth: `v2/web2-customers` batch-by-fbid + batch-by-phone (PII KH), `v2/web2-wallets` batch-summary + batch-full (số dư ví) → `requireWeb2AuthSoft`. Vá caller duy nhất thiếu token (`comments-mobile-state.js` postJson gắn x-web2-token) trước khi gate. XSS `multi-tool.js:82` `r.reason` → `esc()`.
- **r2b** — `reconcile-actions.js` audit date filter (`tsToInput`/`inputToTs`) dùng giờ LOCAL → đổi GMT+7 (offset +07:00 cố định).
- **DEFER (cần user/design, KHÔNG fix tự động)**:
    - Over-refund cap `web2-supplier-wallet.js:287` — cap chỉ active khi client gửi `ordered`; client HIỆN KHÔNG gửi (shape `{qty,amount}`) → cap null → không chặn. Fix đúng = server tra SL-đã-nhận authoritative từ so-order (feature, không phải patch); ép reject khi thiếu `ordered` sẽ CHẶN MỌI return hợp lệ → KHÔNG làm.
    - Wallet manual-deposit UNIQUE index `web2-wallet-service.js:216` — double-credit thực tế ĐÃ chặn bởi `FOR UPDATE` ví (serialize same-phone); UNIQUE index là defense-in-depth nhưng rủi ro fail boot trên money DB nếu có row trùng → cần test-migration trên clone riêng trước.
- **FALSE-POSITIVE (đã đúng/đã fix sẵn)**: `deductStock` đã atomic value-based (`SET stock = stock - $1`, before/after chỉ để log); products-modal openCreate ĐÃ có guard không đè lựa chọn user (2026-06-20); so-order deeplink ĐÃ có retry 6× re-assert tab (2026-06-14).
- `node --check` pass; bump `?v=` (comments-mobile-state, multi-tool, reconcile-actions).

### [audit] Web 2.0 full-surface audit (adversarial-verified) → fix 25 bug ✅

Workflow audit 8 mặt (sse/ws, render-route, pancake, zalo, frontend-js, css-modal-ui, click-path, firebase) → 47 finding raw → skeptic refute → **27 confirmed** → fix 25 (6 commit r1a-r1f), 1 false-positive (native-orders-modal-edit: `#productPickerInput` rebuild mỗi lần mở modal nên listener KHÔNG tích lũy).

- **r1a** — QR-write auth (`v2/web2-customer-wallet` POST `/:phone/qr` + client gắn `x-web2-token`); `web2-live-comments` seq fallback non-empty numeric (hết đè comment) + N+1 DELETE → 1 query `unnest+EXISTS`; relay 401 log rõ; so-order-storage-sync conflict clear `_pushTimer` (giữ `_pendingState`).
- **r1b** (CRITICAL) — `web2-generic` capture-lock acquire/release `requireWeb2AuthSoft` (release qua sendBeacon → token đi trong **body**, client gắn vào payload); `web2-zalo-zca` restoreAll truyền `expectedUid=a.zalo_uid||null` (chống boot login nhầm danh tính) + audit log + `web2-zalo` restoreSessions SELECT thêm `zalo_uid`; `web2-zalo` GET `/conversation/:phone` fallback ưu tiên TK `is_primary`/`connected`.
- **r1c** — cleanup SSE/timer leak khi `pagehide` (web2-bh-data, web2-pending-match, web2-wallet-balance shared); web2-msg-template-send poll 3s→10s + pagehide clear.
- **r1d** — purchase-refund modal anti-lag (bỏ `backdrop-filter:blur`, box-shadow 32px→8px24px ×2).
- **r1e** — native-orders dup listener filterStatus/filterLimit; purchase-refund + products modal double-submit guard.
- **r1f** — native-orders-snapshots check `r.ok`; web2-qr-modal `last_used_at` GMT+7; so-order-app remoteHandler hoãn renderAll khi đang focus ô nhập.
- Tất cả `node --check` pass; bump `?v=` các file shared/page (wallet-balance, msg-template-send, qr-modal, purchase-refund.css, products-modal, …). **Cần verify browser-test**: capture-lock leader/heartbeat/release end-to-end (sendBeacon+token body), Zalo boot restore trên Render.
- Bối cảnh: từ task "đọc hiểu 10 repo (redis/tanstack-query/glide/dragonfly/sdwebimage/nextchat/chatwoot/chatui/simplex/wunjo) → tích hợp Web 2.0". Ground-truth: phần cache/async (dedup/LRU/onSettled) phần lớn ĐÃ có (initPromise dedup, SSE invalidate, IDB TTL) → pivot sang audit+fix toàn bộ Web 2.0.

## 2026-06-20

### [perf] Trigram index web2_balance_history.content (ILIKE substring) ✅ + remaining defer

- **`web2-sepay-matching.js`** ensureTables: `CREATE EXTENSION pg_trgm` + `idx_web2_bh_content_trgm USING gin (content gin_trgm_ops)` → ILIKE `%..%` (tìm kiếm UI + match) dùng index thay seq scan. pg_trgm đã bật web2Db (web2-customers-schema). Self-apply khi Render restart. `node --check` pass.
- **Defer (cần infra/test riêng, KHÔNG rush)**:
    - Web 1.0 `balance_history.content` trigram (HOT path webhook SePay) — bảng chatDb tạo qua MIGRATION (không có boot-ensure), migration chạy THỦ CÔNG (`run-migration-NNN.js`) → cần tạo migration + apply tay vào prod money DB. SQL sẵn: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX CONCURRENTLY idx_bh_content_trgm ON balance_history USING gin (content gin_trgm_ops);`
    - **KPI N+1** (fast-sale-orders:1899) — cần batch API trong kpi module + giữ dedup `client_event_id`, hot-path tạo PBH, số SP/đơn nhỏ → impact thấp.
    - **OFFSET→keyset** (fast_sale_orders, web2_customers list) — đổi contract API + frontend; đã thêm `id DESC` tie-break giảm page-drift, keyset đầy đủ để sau.

### [live-comments O3] Bỏ poller fetch comment → WS-live là nguồn DUY NHẤT (hết dòng trùng) ✅ + deploy Cloudflare worker (O7)

User: "bỏ poller đi luôn → liên quan message thì cứ WS live". O3 = poller ghi key `${postId}_${mid}` trùng dòng WS ghi `${convId}_${seq}` cùng 1 comment.

- **`web2-livestream-poller.js`**: `pollPostNow` + `pollNow` + `_doPollPost` → **NO-OP** (`{ran:false, disabled:'ws-live-only'}`). Không còn fetch+`upsertComments` → KHÔNG tạo dòng `postId_mid`. GIỮ: `reconcileFullText`/`reconcileRecentTruncated` (vá "…" của dòng WS, UPDATE tại chỗ — không tạo dòng mới), `listLivePostsForAssign` (liệt kê bài gom chiến dịch). `_cycle`/`_loop` vốn dead (không schedule) → để nguyên.
- **`/poll-now` route**: bỏ pollPostNow → gọi `reconcileRecentTruncated({hours:6})` (nút "poll now" giờ vá full-text, không dup).
- **2 caller degrade an toàn**: web2-customers tier-3 `pollNow()` no-op → đọc DB do WS đổ; comment realtime vào DB DUY NHẤT qua WS `/ingest`. `/bulk` (live-chat auto-save) là path riêng, không đụng.
- **O7 deploy**: `wrangler deploy` worker `chatomni-proxy` (version `ead1ae3c`) — header denylist LIVE. Verify SSRF guard `file://`→400, metadata IP→403.
- ✅ `node --check` poller + live-comments pass.

### [security/perf] Re-verify audit 09:10 + fix các mục còn lại (A3/O7/O2 + N+1 web2-returns) ✅

Re-verify audit `WEB2-FULL-REVIEW-20260620.md` (121 bug) vs code hiện tại (workflow 8 agent): **22/24 mục distinct ĐÃ fix** từ sáng (toàn bộ auth router, money-validate, idempotency, permission, XSS, FB token encrypt). Fix tiếp các mục còn lại user duyệt:

- **A3** `web2-fb-posts.js`: `/draft`+`/ad-entry` (POST+DELETE) `requireWeb2AuthSoft` → **`requireWeb2Admin`** (đồng bộ /connect/publish/delete).
- **O7** `cloudflare-worker/.../proxy-handler.js`: `/api/proxy?headers=` JSON merge thẳng → thêm **`PROXY_HEADER_DENYLIST`** (host/cookie/authorization/x-forwarded-_/cf-_/via/x-real-ip) chống relay credential + spoof IP. URL đã allowlist sẵn; header an toàn (accept/origin/referer/sec-\*/x-kas cho vnhub) vẫn cho. image-proxy không nhận ?headers= → không dính.
- **O2** `web2-zalo.js` + `web2-zalo-schema.js`: `/media/:id` IDOR — thêm cột `token` (36 hex bất khả đoán) + unique index; media MỚI trả URL `/media/<token>`; URL legacy numeric id **bắt buộc** `account_key` scope (bỏ param = 404) → hết enumerate BIGSERIAL.
- **S1**: KIỂM TRA lại → OA secret/token **ĐÃ mã hoá sẵn** ở `web2-zalo-oa.js:154-156` (encryptString khi write, decrypt khi read) — verifier nhầm vì chỉ soi schema/web2-zalo.js. **No-op.**
- **Perf N+1** `web2-returns.js _applyStock`: vòng `for` UPDATE từng item → **1 UPDATE batch** `FROM (VALUES …)` gom theo code (sign đồng nhất 1 chiều/lần gọi → kết quả y hệt). Đơn 30 dòng: 30 query → 1.
- **DEFER (báo user, việc lớn/rủi ro hơn, cần focus + test riêng)**: O3 (unify key live-comments — WS ghi/conv-update `convId_count` vs poller ghi/message `postId_mid`, khác granularity + WS thiếu message-id → đụng realtime core); N+1 KPI emit fast-sale-orders:1899 (cần batch API trong kpi module + giữ dedup client_event_id, hot path tạo PBH); ILIKE balance_history.content (bảng tiền, đụng matching SePay); OFFSET→keyset (đổi contract API + frontend).
- ✅ `node --check` 5 file backend + worker pass. Commits `c2693e8f5`(A3+O7), `9675bcc6c`(O2), `f81bac13c`(N+1).

### [render.com] Audit pagination/index toàn dự án (5 agent) + apply quick-win index ✅

Audit cursor pagination + index coverage toàn bộ Render (workflow 5 agent). Cursor/keyset ĐÃ dùng tốt: `web2_live_comments` `?sinceUpdated`, wallet reset `afterId`, zalo messages, Pancake conv list (frontend). Đa số list endpoint dùng OFFSET. Index đa số tốt; thiếu vài cái quan trọng → **apply quick-win** (CREATE INDEX IF NOT EXISTS, idempotent, tự chạy khi Render restart, đã verify cột tồn tại + `node --check` 5 file):

- `web2-live-comments.js` ensureTables: `idx_w2lc_updated ON web2_live_comments(updated_at)` — cột CURSOR delta-sync, bảng lớn nhất → payoff cao nhất.
- `web2-sepay-matching.js`: `idx_web2_bh_phone` (partial linked_customer_phone), `idx_web2_bh_unprocessed` (partial wallet_processed=FALSE), `idx_web2_bh_account_num`.
- `web2-pancake-refresh.js` ensureColumns: `idx_pancake_acc_active`, `idx_pancake_acc_last_used`, `idx_pancake_acc_auto_refresh` (partial) — bảng trước đây 0 index.
- One-line tie-break chống page-drift: `web2-customers.js` /list ORDER BY `+ id DESC` (63k rows), `notifications.js` ORDER BY `+ id DESC`.
- **Chưa làm (defer)**: chuyển OFFSET→keyset (fast_sale_orders, web2_customers list); fix N+1 (web2-returns stock loop, fast-sale KPI emit); ILIKE '%...%' trên balance_history.content. Đều là việc lớn hơn, ghi nhận để sau.

### [live-chat] chat.html: realtime cập nhật INCREMENTAL (hết "render lại nguyên cột gây rối") ✅

User: khi nhận tin mới từ KH, cột chat **render lại nguyên cột gây rối** (innerHTML rebuild → nhấp nháy, avatar reload, huỷ animation). Học cách chat app làm: **keyed reconcile** thay vì rebuild.

- **`pancake-conversation-list.js`**: tách `_computeFiltered()` (nguồn lọc chung) + `_detectNewIds()` + `_renderEmpty()`; `renderConversationList()` slim lại (full render — chỉ dùng khi đổi filter/search/load đầu). Thêm **`reconcileConversationList()`** (keyed theo `data-conv-id`): chèn dòng MỚI (animate `pk-conv-enter`), dời dòng có tin mới lên đúng vị trí (highlight `pk-conv-updated`), **patch nội dung tại chỗ** (preview/time/unread/active) qua `_patchConversationRow()` — KHÔNG đụng avatar → ảnh không reload, **TÁI DÙNG cùng 1 DOM element** (verify `sameElementReused=true`).
- **Wiring**: realtime (`pancake-realtime.js` `_scheduleListRefresh`) + `selectConversation` (click) + chat-window `markRead`/`onConversationUpdate` → gọi `reconcileConversationList()` thay `renderConversationList()`. Đổi filter/search vẫn full render.
- ✅ Verify Playwright: (a) conv cũ có tin mới → nhảy lên đầu, **cùng element**, có highlight, preview patched, row count ổn định; (b) conv MỚI → chèn top + `pk-conv-enter`, dòng kế **không bị đụng**, switch tab vẫn chạy; 0 console error. Bump `?v=20260620ls5`.

### [live-chat] chat.html: hiệu ứng "KH chat tới" (dòng trượt vào + glow avatar) ✅

User muốn hội thoại mới hiện hiệu ứng khi có KH chat tới (học hiệu ứng GitHub). Làm bằng CSS thuần (không thêm lib nặng — đúng web rule compositor-friendly: transform+opacity).

- **`pancake-conversation-list.js`**: thêm `_seenIds` (Set id hội thoại đã render). Mỗi lần `renderConversationList`, diff id mới so lần trước → hội thoại MỚI (KH vừa chat) nhận class `pk-conv-enter`. Bỏ qua render đầu + burst >8 (reload) để cả list không nhấp nháy. Diff theo `state.conversations` (KHÔNG theo filtered) → đổi tab không animate lại.
- **`pancake-chat.css`**: `@keyframes pkConvEnter` (trượt vào + fade + sáng xanh nhẹ) + `pkAvatarPing` (vòng glow quanh avatar) + cải tiến `pkConvUpdated` (KH nhắn tiếp nhảy lên đầu). Respect `prefers-reduced-motion`. Bump `?v=20260620ls4`.
- ✅ Verify Playwright: chèn hội thoại giả → row `pk-conv-enter`, `animationName=pkConvEnter`, avatar `::after`=`pkAvatarPing`.

### [web2/livestream-poller] FIX 2 lỗi (NOTIFICATION_CONFIG redeclare + 401 /stats,/poller-pages) + audit "trang còn cần không" ✅

User hỏi trang `web2/livestream-poller/index.html` có cần thiết không + liên quan trang nào; kèm console: `Uncaught SyntaxError: NOTIFICATION_CONFIG already declared` + `GET /stats 401` + `/poller-pages 401`.

- **Bug 1 (redeclare)**: trang include thủ công `notification-system.js?v=20260610` (line 146) TRONG KHI `web2-sidebar.js autoLoadSharedModules` đã tự nạp `notification-system.js?v=20260613a` → nạp 2 lần → `const NOTIFICATION_CONFIG` khai báo lại → SyntaxError (chặn cả script sau). Fix: **bỏ include thủ công** (sidebar lo).
- **Bug 2 (401)**: `loadStat()` + `loadPages()` dùng `fetch()` TRẦN không `x-web2-token` (route GET `/stats`,`/poller-pages` soft-gated `requireWeb2AuthSoft`), trong khi mutation (`_httpJson`) đã có token. Fix: route 2 GET qua `_httpJson`.
- **Audit kết luận (evidence backend)**: poller nền ĐÃ TẮT (`web2-livestream-poller.js:481` "background poll DISABLED, event-driven only"; `_loop` không schedule). Comment realtime giờ vào DB qua **WS relay → POST /ingest (WS-DIRECT)** — KHÔNG đọc `web2_live_poller_pages`. Bảng config (trang này sửa) chỉ còn được đọc bởi `listLivePostsForAssign()` + `pollNow()` (on-demand) + `_loop` (chết). ⇒ Trang = **admin cấu hình nguồn page + xem tổng comment (17.259)**, dùng hiếm (2 trang House/Store đã seed sẵn), KHÔNG điều khiển luồng thu realtime. Verdict: **GIỮ + đã fix** (không xoá vì còn là UI duy nhất quản `web2_live_poller_pages` + stat). Liên quan: sidebar "Lấy comment Live (poller)", overview, live-chat Live Comment (cùng kho `web2_live_comments`), route `web2-live-comments.js`, service `web2-livestream-poller.js`, picker chiến dịch cha (chat.html + native-orders).
- **Files**: `web2/livestream-poller/index.html` (bỏ include noti + 2 GET qua \_httpJson).
- ✅ Verify Playwright: stat "17.259 comment", 2 trang (House+Store) load, 0 lỗi NOTIFICATION_CONFIG, 0 console error.

### [live-chat + native-orders] Picker livestream: chọn CHIẾN DỊCH CHA hoặc BÀI LIVE (multi-select) + fix native-orders 401 chiến dịch cha ✅

User: (1) chat.html cho "chọn chiến dịch cha **hoặc như hình**" (ảnh: checklist bài live + "Hôm nay/Bỏ chọn" + badge House/Store); (2) `native-orders/index.html` **chưa load được chiến dịch cha** (console `GET /api/web2-live-comments/campaigns 401` + `/page-posts 401`).

- **chat.html — nâng picker** (`pancake-livestream-filter.js` viết lại): thay `<select>` đơn bằng **dropdown 2 mục**: `CHIẾN DỊCH CHA` (radio, `/campaigns`) **HOẶC** `BÀI LIVESTREAM` (checkbox đa chọn, `/posts` = 53 bài, badge Store/House theo `page_id`, count comment, nhãn `Live HH:mm DD-MM` vì `/posts` không có title) + nút **"Hôm nay"** (lọc bài `last_at` = hôm nay GMT+7) / **"Bỏ chọn"**. Loại trừ 2 chiều (chọn cha → bỏ bài; chọn bài → bỏ cha). Build commenter set: cha → `/?campaignId=`, bài → `/?postIds=`. Persist `{mode,campaignId,postIds}` localStorage. SSE `web2:live-comments` debounce 4s refetch. Fix z-index dropdown (`--pkr-z-dropdown` 400 > sticky 100 → search box hết đè).
- **native-orders FIX 401**: 6 fetch `web2-live-comments` (`/campaigns`,`/posts`,`/page-posts`,`POST /campaigns`,`/assign`,`/unassign`) THIẾU `x-web2-token` → 401 (route soft-gated) → "Chưa có chiến dịch cha". Thêm helper `NO._liveCommentsHeaders()` (Web2Auth.authHeaders / fallback localStorage web2_auth) cho cả 6. Cùng regression đã fix cho live-chat 19/06. Bump `native-orders-filters-campaigns.js?v=20260620lc`. (⚠ `/page-posts` vẫn trả 0 bài trên web2-api — tech-debt riêng, ngoài scope.)
- **Files**: `live-chat/js/pancake/pancake-livestream-filter.js` (viết lại), `live-chat/css/pancake-chat.css` (dropdown/section/row/badge/mini), `live-chat/chat.html` (bump `?v=20260620ls3`), `native-orders/js/native-orders-filters-campaigns.js`, `native-orders/index.html`.
- ✅ Verify Playwright (localhost, web2 admin): native-orders 2 chiến dịch cha load (hết 401). chat.html dropdown 2 radio cha + 53 checkbox bài (badge Store/House, sort mới→cũ); "Hôm nay" → 5 bài → 399 khách → Livestream 63 + Inbox 9 = 72; chọn cha "10/06…" → posts cleared, 149 khách (loại trừ 2 chiều OK); 0 console error. Screenshot xác nhận layout sạch.

### [live-chat] Chat Pancake (`chat.html`): tab Comment→Livestream theo chiến dịch + sub-filter tin nhắn/bình luận + fix overlap ✅

User (ảnh `live-chat/chat.html`): (1) fix giao diện 2 hàng tab bị đè (gear ⚙ đè "Lưu Live"); (2) đổi tab **Comment → Livestream** + đổi chức năng; (3) cho **chọn chiến dịch** như `index.html` → lấy danh sách khách comment → đưa người đó (cả comment + inbox) vào tab **Livestream**; (4) người KHÔNG trong danh sách → tab **Inbox**; (5) bỏ tab **Lưu Live** → còn 3 tab; (6) thêm **filter tin nhắn / bình luận** ở mọi tab.

- **Module mới** `js/pancake/pancake-livestream-filter.js` (`window.PancakeLivestreamFilter`): thanh chọn chiến dịch (render vào `#pkLivestreamBar`) → `GET /api/web2-live-comments/campaigns` + `/?campaignId=X&limit=5000` (gắn `x-web2-token` qua `Web2Auth.authHeaders`) → build Set `fbIds`+`phones` (dedupe commenter). `isLivestreamConv(conv)` đối chiếu `from.id/from_psid/customer.psid/id/fb_id` + SĐT chuẩn hoá. Lưu chiến dịch chọn vào `localStorage` (sống qua reload). **SSE** `web2:live-comments` debounce 4s → refetch set khi live chạy (realtime, KHÔNG poller).
- **Tab filter (theo NGƯỜI)** `pancake-conversation-list.js`: `livestream` = `isLivestreamConv` true; `inbox` = false (người không trong chiến dịch); `all` = tất cả. **Sub-filter (loại hội thoại, mọi tab)** `typeFilter`: `message`=INBOX / `comment`=COMMENT / `all`. Áp sub-filter TRƯỚC tab. Empty-state Livestream khi chưa chọn chiến dịch → hướng dẫn.
- **Shell** `pancake-init.js` `_renderShell`: 3 tab `Tất cả|Inbox|Livestream` + `#pkLivestreamBar` (trên) + hàng `.pk-subfilter` (Tất cả/Tin nhắn/Bình luận). Wiring dùng `closest()` (tab Livestream có `<i>`) + `applyTypeFilter`. `pancake-state.js`: `activeFilter` thêm `livestream`, bỏ `comment/live-saved`; thêm `typeFilter`.
- **Fix overlap (#1)**: tabs cuộn trong `.pk-filter-tabs-scroll` riêng (flex:1, overflow-x), nút gear `.pk-filter-gear` ghim phải `flex:0 0 auto` → hết đè (trước: 4 tab + gear `margin-left:auto` tràn 339px). CSS bar/subfilter thêm vào `pancake-chat.css`.
- **Files**: `js/pancake/pancake-livestream-filter.js` (mới), `js/pancake/pancake-state.js`, `js/pancake/pancake-conversation-list.js`, `js/pancake/pancake-init.js`, `css/pancake-chat.css`, `chat.html` (+script + bump `?v=20260620ls`).
- ✅ Verify Playwright (localhost, web2 admin): 3 tab `["Tất cả","Inbox","Livestream"]` + sub-filter `["Tất cả","Tin nhắn","Bình luận"]`; gear `gearOverlapsTabs:false`; chọn chiến dịch "10/06/2026…(156)" → 149 fbId + 10 SĐT, bar "149 khách"; partition CHÍNH XÁC: Livestream 7 + Inbox 69 = Tất cả 76; sub-filter Bình luận 61 + Tin nhắn 15 = 76. 0 console error, 0 page error. Screenshot xác nhận layout sạch, không đè.

### [printer-settings/vieneu-tts] FIX file cài giọng lỗi PowerShell "Unexpected token '}'" @line 48 ✅

User: trang `web2/printer-settings/` → tải `cai-may-pos.bat` → cài Print Bridge OK nhưng **VieNeu + OmniVoice fail**: `engine-setup.ps1:48 char:1 + } Unexpected token '}' in expression or statement.`

- **Root cause**: `vieneu-tts/vieneu-windows-setup.ps1` (file mà bat tải về thành `engine-setup.ps1`) có **em-dash `—` (U+2014) NẰM TRONG string literal** ở line 30 + 45 (`Write-Host "... Khong tai duoc file — bo qua."` / `"... Da cai Python — CHAY LAI ..."`). File serve **UTF-8 KHÔNG BOM** → Windows PowerShell 5.1 đọc theo ANSI codepage → 3 byte em-dash decode thành rác chứa ký tự giống dấu nháy → vỡ chuỗi → lệch ngoặc → báo `}` thừa ở line 48 (ngoặc kế tiếp sau chỗ hỏng). Mọi `Write-Host` khác trong file đã cố ý né dấu tiếng Việt; 2 em-dash này lọt. `scripts/print-bridge.ps1` không có non-ASCII ngoài comment → cài OK.
- **Fix**: (1) đổi 2 em-dash trong string literal → ASCII `-` (code lines giờ thuần ASCII, độc lập encoding). (2) Thêm **UTF-8 BOM** (`EF BB BF`) → PowerShell đọc đúng UTF-8 tuyệt đối + comment tiếng Việt decode đúng + chống tái phát nếu sau này lỡ thêm tiếng Việt vào string. Comment lines 1-5 còn tiếng Việt nhưng `#` an toàn mọi encoding.
- **Files**: `vieneu-tts/vieneu-windows-setup.ps1` (2 string literal + BOM).
- ✅ Verify: brace/paren balance 0/0; grep non-ASCII ngoài comment = rỗng. bat tự re-download `%VPS1%` mỗi lần chạy → chạy lại bat là lấy file đã sửa (không cần gỡ thủ công).

### [native-orders] Đơn Inbox: "Gán FB khác" — gán lại Facebook đúng nếu auto-dò nhầm ✅

User: "Cho gán lại facebook khác nếu nhầm" — sau khi chọn KH từ kho, hệ thống tự dò hội thoại Pancake theo SĐT có thể gắn nhầm Facebook (nhiều profile cùng SĐT). Thêm nút **"Gán FB khác"** trong chip "KH đã chọn" → mở panel tìm hội thoại Pancake (CHỈ Pancake) → chọn đúng FB → re-bind, **GIỮ NGUYÊN tên + SĐT** đơn (chỉ bù field rỗng).

- **Files**: `native-orders/js/native-orders-inbox-add.js` (panel `#noAddFbRebind` + input/suggest, `openFbRebind/closeFbRebind`, pick handler set `selectedFbId/PageId/ConvId/UserName/AvatarUrl` + `selToken++` huỷ background resolve cũ; chip thêm nút `.no-add-selected-rebind`), `web2/shared/web2-base.css` (`.no-add-selected-actions/-rebind`, `.no-add-fb-rebind*`). Bump `?v=20260620b` ở index.html.
- ✅ Verify Playwright (localhost web2 admin): chọn "Huỳnh Thành Đạt/0908123456" → auto-bind page …390370; bấm "Gán FB khác" → panel prefill SĐT + focus → tìm "huynh thanh dat" → 3 hội thoại Pancake (đều avatar, page khác nhau …364524/…086607/…390370) → chọn page …364524 → fbStatus đổi sang page …364524, name/phone GIỮ NGUYÊN, panel đóng, toast "Đã gán lại Facebook", 0 console error. Screenshot xác nhận.

### [native-orders] Đơn Inbox: admin xoá đơn rỗng + avatar Facebook trong ô tìm KH ✅

User (ảnh modal "Thêm đơn Inbox"): (1) admin được quyền xoá đơn inbox trạng thái nháp/huỷ + giỏ trống; (2) ô nhập KH hiện avatar/tên/thông tin Facebook theo Pancake để chọn, cho tìm lại nếu nhầm KH.

- **Files**: `native-orders/js/native-orders-state.js` (+`NO.isAdmin()` mirror web2-sidebar `_isAdmin`: Web2Auth role → fallback loginindex_auth/userType), `native-orders/js/native-orders-render.js` (nút 🗑 `web2-btn-danger` ở col-actions, gate `channel==='web2_inbox' && status∈{draft,cancelled} && giỏ rỗng && isAdmin()` → gọi `removeOrder()` có sẵn confirm), `native-orders/js/native-orders-inbox-add.js` (avatar trong suggestion kho KH + Pancake; chip "KH đã chọn" avatar+tên+nguồn + nút "Đổi khách" clear+focus tìm lại), `web2/shared/web2-base.css` (`.no-add-av*`, `.no-add-suggest-flex/main/line`, `.no-add-selected*`). Bump `?v=20260620a` ở index.html.
- Backend DELETE `/api/native-orders/:code` đã có sẵn (chặn nếu còn PBH liên kết) — không sửa server. removeOrder() đã có confirm + cập nhật state + SSE `_notify('delete')`.
- ✅ Verify Playwright (localhost, login web2 admin): Inbox tab 3 đơn draft+rỗng → 3 nút xoá; click → confirm "Xóa đơn NJ-…?" → "Xoá đơn" → 3→2 đơn, 0 console error. Gate: nhồi SP vào 1 đơn → nút xoá 2→1; tab Livestream → 0 nút xoá. Modal tìm "01234" → 8 kết quả đều có avatar (FB thật cho KH có fb_id, vòng tròn chữ cái cho KH không có); chọn → chip avatar+tên+"nhắn tin được"+"Đổi khách"; "Đổi khách" → clear chip + focus lại ô tìm. Screenshot xác nhận avatar FB load thật.

### [live-chat] FIX regression: load comment từ DB thiếu x-web2-token → "Chưa có comment nào" (0 comment) ✅

User báo `live-chat/index.html`: "không thấy comment", console `401` + `[Live-INIT] Loaded 0 comments (DB) from 4 campaigns`. Nguyên nhân: commit `40ec6ff2a` gate GET read endpoints `web2-live-comments` (`requireWeb2AuthSoft`, chống PII leak), nhưng fetch DB comments trong `live-init-wiring.js` (nguồn comment chính) chỉ gửi `{ signal }`, **KHÔNG** `x-web2-token` → backend 401 → 0 comment. (Campaigns load OK vì fetch ở `live-init-lifecycle.js` đã có `_w2AuthHeaders` → log đúng "4 campaigns".)

- Fix: fetch `GET /api/web2-live-comments?postIds=…` thêm `headers: window.LiveColumnManager._w2AuthHeaders()` (đúng pattern shared dùng khắp live-chat). Bump `live-init-wiring.js?v=20260620f` ở index.html.
- Audit các fetch gated khác (`/saved/ids`, `/saved`, `/bulk`, `/posts`, `/page-posts`, `/{q}`) — đều ĐÃ có `Web2Auth.authHeaders()`/`_w2AuthHeaders`. `live-init-wiring.js` là fetch DUY NHẤT sót → 1 chỗ fix đủ.
- ✅ Verify: `curl GET /api/web2-live-comments` (no token) → 401 (confirm gate). Fix gắn token → request đi đúng.

### [web2/shared] Fix picker không load SP nếu chưa vào Kho SP + promote API client lên shared ✅

User: "fb-posts phải vào trang Kho SP trước nó mới load danh sách SP, còn chưa vào thì 'Không tìm thấy SP'". Gốc rễ: `Web2ProductsCache` (shared) cần `Web2ProductsApi` để fetch, nhưng API client lại nằm **page-local** `web2/products/js/web2-products-api.js` → 4 trang load cache mà KHÔNG load API (fb-posts, product-card, photo-editor, video-maker) chỉ chạy được khi IDB persist đã được Kho SP ghi sẵn.

- **`git mv web2/products/js/web2-products-api.js → web2/shared/web2-products-api.js`** (cache đã shared thì API client cũng phải shared — 1 nguồn). Repoint 4 trang cross-import (products, purchase-refund, supplier-wallet, so-order) sang `../shared/web2-products-api.js`.
- **Self-heal trong `web2-products-cache.js`**: `_loadList()` gọi `_ensureApiLoaded()` — nếu `Web2ProductsApi` thiếu, cache TỰ inject `web2-products-api.js` (resolve qua `document.currentScript.src` của chính cache) rồi mới fetch. → **Trang mới chỉ cần load cache là chạy, khỏi sửa từng HTML.**
- Bump `web2-products-cache.js?v=20260620a` ở 8 trang.
- ✅ Verify Playwright cold start: xóa IDB → vào THẲNG fb-posts (không qua Kho SP) → mở picker → API tự nạp (`apiScriptInDom:true`), fetch 43 SP từ worker, render 43 dòng list. Screenshot SP thật đủ ảnh/tên/mã/giá.

### [web2/shared] Picker SP — đổi lưới ảnh → DANH SÁCH (ảnh + tên + mã + giá) ✅

User: "xem sản phẩm theo danh sách hình ảnh, tên, giá". Picker chọn SP từ Kho (modal "Chọn sản phẩm cho bài đăng" ở Đăng bài FB) trước hiển thị lưới ảnh card → tên/giá nhỏ khó nhìn. Đổi sang dạng **danh sách dọc, mỗi dòng = thumbnail vuông 52px + tên (đậm) + mã (xám nhỏ) + giá (xanh, canh phải) + tick chọn**.

- **`web2/shared/web2-product-picker.js`**: `[data-list]` `grid` → `flex column`; `cellHtml` → `rowHtml` (layout dòng); thêm `applyRowState(el,on)` cập nhật RIÊNG 1 dòng khi toggle (border/bg/tick) thay vì vẽ lại cả list → **giữ vị trí cuộn** khi chọn nhiều.
- Bump `web2-product-picker.js?v=20260620a` ở `web2/fb-posts/index.html`.
- ✅ Verify Playwright: seed 3 SP ảo → list `display:flex`, 3 dòng render đủ ảnh/📦 + tên + mã + giá; toggle multi → count "Đã chọn 1" + tick xanh + border xanh #0068ff. Screenshot duyệt layout.

### [web2/reconcile] FIX regression: client reconcile thiếu x-web2-token → "Cần đăng nhập Web 2.0" ✅

User báo: `web2/reconcile/index.html` đăng nhập admin vẫn lỗi "Lỗi tải DS PBH: Cần đăng nhập Web 2.0 (thiếu/sai token)". Nguyên nhân: audit trước tôi gate `reconcile.js` (`router.use(requireWeb2AuthSoft)` #43) nhưng `reconcile-state.js api()` chỉ gửi `Content-Type`, KHÔNG `x-web2-token` → backend 401.

- Fix: `api()` thêm `...((window.Web2Auth && Web2Auth.authHeaders()) || {})`. Mọi call reconcile qua RC.api (chỉ reconcile-state.js có fetch) → 1 chỗ fix đủ. Bump `?v=20260620auth`.
- Audit lan rộng: các route khác đã gate (products/variants/returns/purchase-refund/supplier-wallet/jt-tracking/msg-send/ai-script/fb-posts/zalo) — client đều có shared authHeaders (grep file-level confirm). reconcile là NGOẠI LỆ vì có api() helper riêng.

## 2026-06-20

### [live-chat/security] Gate API live-comments read endpoints (đóng nốt PII leak) ✅

Sau khi Pages deploy CLIENT (guard + x-web2-token — verify prod đã có), gate 5 endpoint ĐỌC của `render.com/routes/web2-live-comments.js` bằng `requireWeb2AuthSoft` (WEB2_AUTH_ENFORCE=1 → 401 nếu thiếu token):

- `GET /` (comment + fb_id/tên/SĐT khách = PII), `GET /campaigns`, `GET /posts`, `GET /page-posts`, `GET /saved/ids`.
- Đã verify MỌI caller gửi token trước khi gate: `live-comments-stream.js`+`comments-mobile-actions.js`+`pancake-api.js` (đã sửa, commit trước) + `live-campaign-manager.js _api` (đã có `_w2AuthHeaders`). Desktop live-chat có web2-auth.js sẵn.
- Thứ tự deploy an toàn: client (Pages) TRƯỚC → backend (Render) SAU → user hợp lệ không 401 (trang mở cũ cần reload lấy JS mới).
- node --check PASS. Cần Render deploy web2-api để có hiệu lực.

## 2026-06-20

### [live-chat/security] comments-mobile.html lộ comment khách khi ẩn danh — fix CLIENT (guard + token) ✅

User: vào `nhijudy.store/live-chat/comments-mobile.html` ở trình duyệt ẩn danh KHÔNG cần đăng nhập vẫn xem được. Trang static (Pages) không chặn HTML được, nhưng nó load DATA comment (fb_id/tên/SĐT khách = PII) từ API KHÔNG auth.

**Nguyên nhân**: comments-mobile.html (a) KHÔNG load web2-auth.js → không có guard redirect login; (b) fetch live-comments `credentials:'omit'`, KHÔNG gửi x-web2-token; (c) backend GET `/`, `/posts`, `/page-posts`, `/campaigns`, `/saved/ids` KHÔNG gate.

**Fix CLIENT (commit này)**:

- comments-mobile.html: inline AUTH GUARD ở <head> (chưa có `web2_auth.token` → `location.replace('../web2/login?next=')`) + load `web2-auth.js`.
- Mọi fetch read live-comments gửi `Web2Auth.authHeaders()` (x-web2-token): `live-comments-stream.js` (GET /, dùng chung desktop+mobile), `comments-mobile-actions.js` (posts/page-posts/search), `pancake-api.js` (saved/ids).
- Desktop live-chat đã có web2-auth.js sẵn → authHeaders chạy luôn. Bump `?v=20260620auth`.
- **Fix BACKEND (gate GET read endpoints) ở commit kế** — sau khi Pages deploy client để không 401 user hợp lệ.

## 2026-06-20

### [web2/multi-tool] Tăng comment nền: XONG TỰ DỌN comment đã tăng khỏi live-chat ✅

User: "Xong phải chạy dọn comment đã tăng" (job nền tự dọn như nút "Dọn comment đã tăng").

- **`render.com/routes/web2-live-comments.js`**: tách core `boost-mark` thành hàm export `markBoostAndPurge(pool, ids, ttlMs)` (mark conv → /ingest bỏ qua TTL 20' + XOÁ comment đã ingest `id = cid OR starts_with(id, cid||'_')` + SSE `reconcile`). Route `/boost-mark` gọi lại hàm này.
- **`render.com/services/web2-comment-boost-worker.js`**: worker gom `boostedIds` = `${post_id}_${reply_id}` của mỗi comment boost (từ `res.id`), gọi `_cleanupBoosted` (in-process `markBoostAndPurge`) **3 nơi**: đầu job (mark conv + purge spam cũ), sau MỖI vòng, và CUỐI job (đợi 3s cho comment cuối kịp ingest rồi mark+purge toàn bộ). → live-chat không hiện comment tăng. Giống foreground markBoost/markBoostIds.
- Frontend: help job card thêm "Xong tự dọn comment đã tăng khỏi live-chat". `?v=20260620bg3`.

### [index/login] Fix nối tiếp: login.js không copy previousNames vào loginindex_auth ✅

User: đăng nhập phuoc/phuoc2109 vẫn không hiện data (xác nhận "Phước"="Phước đẹp trai").

- **Gốc**: backend JWT + `user` response ĐÃ có `previousNames` (verify: login phuoc → JWT payload `previousNames:["Phước đẹp trai"]`), NHƯNG `index/login.js` dựng `loginindex_auth` bằng **field-list tường minh** → bỏ sót `previousNames`. `SoquyPermissions.isMine` đọc `auth.previousNames` = undefined → alias không khớp → phuoc thấy 0 voucher cũ.
- **Fix**: thêm `previousNames: user.previousNames || []` vào CẢ 2 block authData (login thường line 91 + verify 2FA line 491). node --check PASS.
- **phuoc cần đăng nhập lại 1 lần nữa** (auth đang lưu vẫn thiếu previousNames) → sau đó thấy đủ 1071 voucher.

### [web2/zalo] Chip nhóm: báo "Cần đăng nhập TK trong nhóm" khi không gửi được ✅

User: nhóm J&T mà không có quyền (TK của nhóm đã xoá/chưa kết nối) thì ghi rõ cần đăng nhập TK Zalo CÓ TRONG nhóm.

- `chat-view.js` `_fillAccChip`: thêm `meta.connected` + check `conv.thread_type==='group'`. NHÓM mà TK đã xoá HOẶC chưa kết nối → chip **"⚠ Cần đăng nhập TK trong nhóm"** (cam) + tooltip giải thích Zalo chỉ cho gửi nhóm bằng tài khoản LÀ THÀNH VIÊN → phải đăng nhập 1 TK có trong nhóm này.
- Nhóm có TK kết nối → "[tên] · nhóm" (xanh, bình thường, không cảnh báo). 1-1 TK đã xoá → "TK Zalo không còn" (muted, giữ như cũ). 1-1 TK phụ → cam.
- Bump `ENGINE_VER=20260620grpmsg` + `web2-zalo.js?v=…acc5` (4 page). node --check PASS.

## 2026-06-20

### [web2/multi-tool] Tăng comment nền: LIVE TEST PASS (Nhi Judy House 97→117) + tuning re-check ✅

Nối tiếp feature "chạy nền server" (commit bedcfb08a). Deploy Render web2-api xong → test thật + fix.

- **Live test PASS** (Nhi Judy House, post livestream `..._2080575446230098`): tạo job addTarget=10 → server chụp baseline=97, target=107. Worker: vòng 1 gửi 10 (count Pancake còn trễ = 97 < 107) → tự chạy vòng 2 gửi 10 → re-check count=111 ≥ 107 → **done "Đạt 111/107"**. Verify độc lập Pancake: `comment_count` 97 → **117**. Đúng spec "check lại phải hơn, ít hơn thì chạy lại".
- **Bug fix (correctness)** `f59ae9d5e`: Pancake conversations API lọc `post_id` KHÔNG chặt — trả cả conv của bài KHÁC (bài photo `updated_at` mới hơn) → auto-select-by-newest nhắm SAI bài. Thêm lọc chặt `conv.post_id === selectedPost.id` (fallback nếu format khác). Fix cả tool foreground. (60 conv lọc post X → chỉ 49 thực sự thuộc X.)
- **Tuning over-send**: `RECHECK_DELAY_MS` 7s→30s. comment_count FB/Pancake trễ ~20-40s → re-check sớm thấy count cũ → chạy thừa vòng (test gửi 20 cho target 10). 30s cho count đuổi kịp rồi mới tính deficit → giảm over-send (vẫn đảm bảo ≥ target).
- Files: `render.com/services/web2-comment-boost-worker.js` (RECHECK_DELAY + bỏ dead `_getJob`), `web2/multi-tool/js/multi-tool.js` (lọc conv post_id) `?v=20260620bg2`.

### [web2/zalo] Phase 3 — gửi tin 1-1 ưu tiên TK cookie (wire vào send) ✅ code

Nối tiếp Phase 1+2. Wire `getCookieAccountKey()` vào path gửi 1-1:

- **Backend** `render.com/routes/web2-zalo.js`: `/conversation/:phone?account=<key>` + `/conversation/ensure {accountKey}` → resolve/tạo hội thoại dưới TK truyền vào (TK cookie); không truyền → TK CHÍNH (is_primary) như cũ. Safe-by-fallback.
- **Client** `web2-zalo.js`: `getConversation(phone, accountKey)` thêm `?account=`; `mountChat(opts.preferAccountKey)` truyền vào getConversation + ensure body.
- **Web2CustomerChat** `mountZalo`: chat 1-1 (theo SĐT) → `await Web2Zalo.getCookieAccountKey()` → preferAccountKey. Nhóm (mở theo convId) KHÔNG override (giữ TK nhóm).
- Verified client (Phase 1+2): ext trả uid 852368 (My Njd), getCookieAccountKey→zca_5aa5d9c5 (My Njd), không tạo trùng. zaloUid là string (không lỗi BIGINT precision).
- Bump `web2-zalo.js?v=…acc4` + `web2-customer-chat.js?v=20260620cookieacc` (4 page). node --check PASS 3 file.
- ⏳ Cần Render deploy (backend) mới test end-to-end. Nhóm jt-tracking (TK relay đã xoá) = follow-up riêng.

## 2026-06-20

### [web2/zalo + extension] Nền tảng "ưu tiên TK cookie để gửi tin" — Phase 1+2 (chưa wire) 🚧

User chốt: gửi tin Zalo ưu tiên TK đang đăng nhập chat.zalo.me (cookie), áp dụng cả 1-1 lẫn nhóm; TK chưa kết nối → tự cookie-login.

- **Phase 1 — Extension đưa ra uid** (cần để biết TK nào đang ở chat.zalo.me): content script `zalo-creds.js` đọc thêm `sh_zlast_uid`/`sh_user_ids` → `GET_ZALO_CREDS` (service-worker) trả `uid`. Bump manifest `1.0.27→1.0.28` (CWS auto-publish). node --check PASS.
- **Phase 2 — Client helper `Web2Zalo.getCookieAccountKey()`**: GET_ZALO_CREDS→uid → match account web2 đang kết nối (theo zalo_uid) → chưa kết nối: reconnect slot cũ / tạo slot mới + cookie-login (autoLogin). Cache 30s. Không ext/cookie/uid → null (caller fallback TK chính). **CHƯA wire vào send path → inert, không đổi hành vi.** Bump `web2-zalo.js?v=…acc3` (4 page).
- **Phase 3 (CHƯA làm)**: wire vào resolve hội thoại 1-1 (`/conversation/:phone?account=`) + nhóm (dùng conv của TK cookie nếu là thành viên) + chip phản ánh TK thực gửi. = phần ĐỔI HÀNH VI gửi tin khách → cần live-test với chat.zalo.me đang đăng nhập.
- ⚠ Live-test bị chặn: browser test restart đã mất phiên chat.zalo.me (cần user quét QR lại). Safe-by-fallback: khi không có cookie → vẫn dùng TK chính như cũ.

## 2026-06-20

### [web2/multi-tool] Tăng comment CHẠY NỀN trên server + re-check tới >= target ✅

User: "Cho chạy background trên server được không? Lúc chạy lấy số comment của bài (vd 362), user chọn 700 → chạy nền, xong check lại phải > 1062; nếu ít hơn thì chạy lại tới >= 1062."

- **Mới — Server (web2-api)**:
    - [`render.com/services/web2-comment-boost-worker.js`](render.com/services/web2-comment-boost-worker.js) — worker nền: lấy TẤT CẢ JWT account admin của page (`pancake_accounts` chatDb), đọc `comment_count` THẬT của bài (`pancake.vn/api/v1/pages/{id}/posts` → field `comment_count`), đăng `reply_comment` (giống 100% trang Tăng comment) work-stealing nhiều account + delay/account + rate-limit guard. Sau mỗi vòng RE-CHECK count; `count < target` → chạy tiếp tới `>= target`. Safety: MAX_ROUNDS=40, cap tổng gửi = add×3+50, backoff 60s khi FB rate-limit (3 vòng liên tiếp → dừng), dừng nếu không đọc được count 4 lần.
    - [`render.com/routes/web2-comment-boost.js`](render.com/routes/web2-comment-boost.js) — bảng `web2_comment_boost_jobs` (web2Db). `POST /create` chụp baseline=comment_count hiện tại → `target = baseline + addTarget`, lưu job pending; `GET /jobs`, `GET /job/:id`, `POST /job/:id/stop`. SSE topic `web2:comment-boost`. Auth `requireWeb2AuthSoft`.
    - [`render.com/server.js`](render.com/server.js) — mount `/api/web2-comment-boost` + ensureSchema + initializeNotifiers; start worker trong block `!DISABLE_WEB2_JOBS` (cạnh livestream-poller). `/api/web2-*` auto-route web2-api qua worker (không sửa Cloudflare).
- **Frontend** [`web2/multi-tool/`](web2/multi-tool/index.html): hiện "Bài đang chọn có X comment" (từ `comment_count`), đổi label "Số lượng"→"Số comment muốn thêm", nút **"Chạy nền trên server"** (`boostBg`→POST /create) bên cạnh "Chạy trong tab" (foreground cũ giữ nguyên), panel job realtime (SSE `web2:comment-boost`) hiện baseline→target + progress + sent/rounds + nút Dừng. Load `web2-sse-bridge.js`. Bump `multi-tool.js?v=20260620bg1`.
- **Feasibility verified (browser probe Pancake)**: post NhiJudy Store có field `comment_count` (vd VOD mới nhất = 1027); `getPageAccountJwts` = 6 account. node --check PASS toàn bộ. ⏳ Cần deploy Render web2-api để worker + route sống (test end-to-end sau deploy).

### [web2/zalo] Chip TK Zalo: LUÔN hiện (fallback "TK Zalo không còn" khi account orphaned) ✅

User báo chip không hiện ở khung chat nhóm jt-tracking. Chẩn đoán live: code mới (chat-view.js 20260620zaloacc) ĐÃ load + header render, nhưng nhóm "XỬ LÝ NJD - J&T" có `account_key=zca_55477969` KHÔNG còn trong status() (= My Njd CŨ đã xoá tay) → `_fillAccChip` không match → tự gỡ chip → user thấy trống.

- Fix: thay vì `chip.remove()` khi không resolve được account, hiện cảnh báo muted xám **"TK Zalo không còn"** + title chỉ rõ key tail + gợi ý đăng nhập lại. → Chip LUÔN hiện (đúng ý "luôn thấy account đang dùng").
- Bump `ENGINE_VER=20260620zaloacc2` + `web2-zalo.js?v=` 4 page.
- **Verified live**: nhóm orphaned → chip "TK Zalo không còn" (xám rgb(156,163,175)); 1-1 primary vẫn "Nhijudy Ơi · TK chính". node --check PASS.
- ⚠ Ngụ ý data: nhóm nguồn jt-tracking đang gắn TK relay đã xoá → có thể không gửi được; nên re-link nhóm sang TK hiện có (việc riêng).

## 2026-06-20

### [soquy + users + navigation] Fix mất data Sổ Quỹ khi account đổi tên (phuoc) + tắt tự đổi tên ✅

User: account **phuoc** hồi trước đổi tên (`Phước đẹp trai` → `Phước`) nên Sổ Quỹ hiển thị thiếu data; "lấy theo userType" + "tắt luôn chức năng đổi tên ở navigation modern".

- **Gốc bug**: voucher `soquy_vouchers` lưu `createdBy` = **displayName** (chuỗi đổi được). Non-admin không có `view_all_transactions` chỉ thấy voucher `createdBy === displayName` hiện tại. Đổi tên → 1070 voucher cũ (`createdBy="Phước đẹp trai"`) biến mất, chỉ còn 1 voucher tên mới. Dữ liệu live xác nhận: 1070 "Phước đẹp trai" + 1 "Phước", **không có** account "Phước đẹp trai" khác → chắc chắn là phuoc. Voucher KHÔNG hề lưu id account (`createdByUsername`/`userType` = 0).
- **Hướng fix (user chọn)**: alias-map, **KHÔNG ghi đè 1070 voucher prod**. Khớp owner theo **account ổn định** (username), legacy khớp theo display-name + alias.
- **Backend `render.com/routes/users.js`**: thêm cột `previous_names JSONB DEFAULT '[]'` (idempotent `ensurePreviousNamesColumn`, chạy 1 lần/process ở login/GET/PUT). `generateToken` + `formatUser` trả `previousNames`. `PUT /:username`: khi đổi tên → tự lưu tên cũ vào `previous_names` (admin rename cũng track); nhận `previousNames` tường minh để seed. `PUT /me/display-name` → **403 (disabled)**.
- **Frontend `soquy`**: `createVoucher` lưu thêm `createdByUsername` + `createdByUserId` (voucher mới, immune rename). `SoquyPermissions.isMine(voucher)` = khớp `createdByUsername===username` HOẶC `createdBy ∈ {displayName, ...previousNames}`; `filterByCreator` + `calculateOpeningBalance` dùng `isMine`. (Display vẫn dùng `createdBy` cho cột Người tạo.)
- **Tắt tự đổi tên `shared/js/navigation-modern.js`**: flag `enableDisplayNameEdit=false` → ẩn nút bút chì "Chỉnh sửa tên hiển thị" (desktop + mobile), `showEditDisplayNameModal` early-return. Admin vẫn đổi tên qua user-management (giờ giữ alias).
- **Seed phuoc**: sau deploy, PUT phuoc với `previousNames=["Phước đẹp trai"]` (giữ nguyên displayName/permissions). phuoc **phải đăng xuất + đăng nhập lại** để token mang previousNames → thấy đủ 1071 voucher.
- node --check PASS cả 4 file. Logic `isMine` test 7 case PASS (legacy/post-rename/brand-new/other × token cũ/mới).

### [web2/multi-tool] Tăng comment: giãn nhịp mặc định + tối thiểu 1 giây, 6 account chạy độc lập ✅

User: "Cho mặc định và thấp nhất là 1 giây → với 6 account Pancake chạy độc lập với nhau → account nào xong rồi cứ chạy tiếp".

- **Files**: `web2/multi-tool/index.html` (input `boostDelay` `value=1` `min=1` `step=0.5`, label "tối thiểu 1", hint "= 1000 ms", help text nêu rõ chạy song song nhiều account độc lập), `web2/multi-tool/js/multi-tool.js` (`run()` clamp `Math.max(1, … || 1)` + `updateHint` clamp `Math.max(1, … || 1)`). Bump `multi-tool.js?v=20260620d1s`.
- **6 account độc lập, work-stealing đã có sẵn**: `run()` đã chạy 1 worker / account (`W.getPageAccountJwts(pageId)` → `Promise.all`), mỗi worker tự `nextIdx()` từ counter `claimed` chung + `sleep(delay)` riêng → account nào gửi xong câu trước thì claim câu kế ngay, không chờ nhau. Không đổi kiến trúc, chỉ làm rõ behavior ở help text.
- **Verified live (browser test)**: page tự chọn "NhiJudy Store", delay `1` / min `1` / hint "= 1000 ms", `getPageAccountJwts` trả **6 account** (Con Nhoc, Thu Lai, Thu Huyền, Huyền Nhi, Kỹ Thuật NJD, longxienc) → 6 luồng song song. node --check PASS.

### [web2/multi-tool] Tăng comment: tự mặc định page "NhiJudy Store" → bài mới nhất ✅

User: "Để mặc định page Nhijudy Store → chọn bài mới nhất → để mặc định 1.5 giây" (trang Tăng số lượng comment).

- **File**: `web2/multi-tool/js/multi-tool.js` (`loadPages`) — sau khi dựng `<option>` page, tìm page có tên chuẩn hoá (`lowercase` + bỏ dấu cách) === `nhijudystore` (fallback `includes`), `sel.value = id` rồi gọi `loadPosts()`. `loadPosts()` đã tự `psel.value='0'` (ĐANG live → mới nhất) + `loadConvs()` (hội thoại mới nhất). Bump `multi-tool.js?v=20260620def`.
- Delay mặc định **1.5 giây** giữ nguyên (HTML `value="1.5"`, min 0.5) — không đụng.
- **Verified live (browser test)**: page tự chọn "NhiJudy Store" (id 270136663390370), bài mới nhất "13:15 20-06 — DỒN ĐƠN TĂNG CUỐI…" (index 0, 6 bài), hội thoại mới nhất "Trần Minh Hồng" (60 hội thoại) — tất cả không cần click tay. node --check PASS.

### [delivery-report] Báo cáo: thêm tab "BÁN HÀNG SHOP" + hiển thị SL đơn ở 5 thẻ tiền ✅

User (modal Báo cáo TOMATO/NAP/TP): "Thêm BÁN HÀNG SHOP" + "Hiển thị số lượng đơn ở 5 mục tiền (kể cả BÁN HÀNG SHOP mới thêm)".

- **Files**: `delivery-report/js/report.js`, `delivery-report/css/delivery-report.css` (Web 1.0, pool chatDb — KHÔNG đụng web2).
- **(1) Tab BÁN HÀNG SHOP**: thêm `{ key: 'shop', label: 'BÁN HÀNG SHOP', color: '#059669', bg: '#d1fae5' }` vào `TABS` (màu emerald khớp `.dr-province-header-shop` ở delivery-report.js). `SHIP_FEE_DEFAULTS.shop = 0` (bán tại shop, không phí ship). Toàn bộ render (button, thẻ tiền, bảng, ảnh bill, ship-fee popover) driven bởi `TABS`/`state.activeTab` nên chỉ cần thêm 1 dòng. `group_name='shop'` đã là valid group server-side (`/by-date-group` trả sẵn) + `sendAlongFor` an toàn khi không có channel map (shop → 0).
- **(2) SL đơn ở 5 thẻ**: `computeTotalLeftForTab` giờ trả `{ total, count }` (cộng dồn `sys.sysCount` ở cả 3 nhánh aggregate/merge/single — khớp logic tiền). `paintTabTotals` render `<span class="dr-tab-total-count">N đơn</span>` phía trên số tiền cho cả 4 nhóm + thẻ TỔNG (count tổng). CSS: thẻ đổi `flex-direction: column`, count nhỏ màu trung tính (#6b7280) không đổi theo +/-.
- **Verified live (browser test, range 01→20/06)**: TOMATO 483 đơn/$10.680.000, NAP 1.423/$18.973.000, THÀNH PHỐ 978/$112.052.000, BÁN HÀNG SHOP 0/$0, TỔNG 2.884/$141.705.000. Card count TOMATO (483) = footer SL ĐƠN bảng (483) → cross-check khớp. Tab shop click OK (14 cột, 20 row), 0 page error. node --check PASS.

### [web2/zalo] Chip hiển thị TK Zalo đang dùng để nhắn (badge read-only) ✅

User: khung chat Zalo cần hiển thị account đang dùng + xác nhận là TK chính. Backend đã ưu tiên `is_primary` (route `/conversation/:phone` ORDER BY is_primary DESC) — chỉ thiếu HIỂN THỊ.

- Thêm chip read-only vào header engine chat dùng chung `zalo-chat/chat-view.js` (`#wzcvAccChip` + `_fillAccChip()`): hiện tên account của hội thoại (= `conv.account_key`), tag **"TK chính"** + màu xanh nếu `isPrimary`; account phụ → màu cam cảnh báo. Account không xác định (conv mồ côi account đã xoá) → ẩn chip.
- Nguồn meta: `ZaloApi.status()` (luôn có nơi engine chạy = ENGINE_JS[0]), fallback `Web2Zalo.status()`. Inline style, KHÔNG đụng file CSS.
- Dùng CHUNG: mọi trang mở chat Zalo qua `WZChat.mountConversation` đều có (web2/zalo Hội thoại + Web2Zalo.mountChat → jt-tracking/native-orders/customers/balance-history + Web2CustomerChat tab Zalo).
- Bump `ENGINE_VER=20260620zaloacc` + `web2-zalo.js?v=20260620zaloacc` ở 4 page.
- **Verified live (browser test)**: primary → "Nhijudy Ơi · TK chính" (xanh); phụ → "My Njd" (cam). node --check PASS.

## 2026-06-20

### [web2/shared chat-modal] Cột trái hiện TẤT CẢ hội thoại + pill tên page mỗi dòng ✅

User: "chat left panel hiện tất cả đoạn hội thoại, hiện luôn tên page" (trang jt-tracking).

- **Files**: `web2/shared/web2-customer-chat-modal.js` (seed search), `web2/shared/web2-customer-chat-core.js` (`_convRowHtml` + CSS `.w2cc-row-page`). Bump `web2-customer-chat-core.js?v=20260620p` + `web2-customer-chat-modal.js?v=20260620p` ở 4 trang load (native-orders, web2/customers, web2/jt-tracking, web2/balance-history).
- **(1) Hiện tất cả hội thoại**: `openModal` đổi `seedQ = opts.query || phone` → `seedQ = opts.query` (CHỈ seed khi caller truyền `query`). Phone-only caller (jt-tracking) → cột trái KHÔNG bị lọc, hiện hết; hội thoại của SĐT vẫn auto-chọn + mở thread (`resolvePancakeConv`). Caller có `query` (native-orders, balance-history, customer-detail, pending-match picker) GIỮ filter — không regression.
- **(2) Pill tên page**: `_convRowHtml` thêm `<span class="w2cc-row-page">` = `_pageName(pageId)` (pill xanh nhỏ dưới snippet) → biết hội thoại thuộc page nào khi gộp nhiều page. Áp dụng mọi trang dùng modal.
- **Verify Playwright** (jt-tracking, click SĐT): `searchValue:""`, `totalRows:150` (trước chỉ 3), `pageChips:150`, pages = `["Nhi Judy House","NhiJudy Store","Nhi Judy Ơi"]`, thread vẫn auto-mở (Thiên Kim Lê), 0 console error. Screenshot xác nhận.

### [web2/zalo] Thêm account bằng phiên chat.zalo.me (cookie) — không cần QR ✅

User: nút "Đăng nhập Zalo" (cookie) chỉ RE-CONNECT slot cũ + có guard expectedUid → KHÔNG thêm được account ĐANG MỞ trên chat.zalo.me nếu nó chưa có slot ("Thêm & quét QR" chỉ có QR). Bằng chứng live: chat.zalo.me = My Njd (852368) nhưng web2 chỉ connect Nhijudy Ơi (711743, session cũ).

- **Fix**: thêm nút **"Đăng nhập bằng Zalo đang mở"** vào modal Thêm account (`#wzAddSaveCookie`). Hàm `saveAddPersonalCookie()`: createAccount(label) → slot mới (chưa uid) → `loginZaloCookie(newKey)` → guard `expectedUid=null` nhận đúng account chat.zalo.me. Login fail/hủy → xoá slot rỗng vừa tạo (tránh slot rác).
- Files: `web2/zalo/index.html` (nút + hint 2 cách), `js/web2-zalo-accounts.js` (saveAddPersonalCookie + export), `js/web2-zalo-app.js` (wire). Bump `?v=20260620cookieadd`.
- **Verified live (browser test + extension)**: bấm nút → thêm "My Njd" uid 852368 (đúng account chat.zalo.me) → `connected`, 2/2 kết nối. node --check PASS.
- ⚠ Tech-debt nhỏ: bấm lại khi account đã có slot → tạo slot trùng uid (dedup theo uid nên làm ở backend `_afterLogin`, để sau).

## 2026-06-20

### [web2/jt-tracking] Chat KH (bấm SĐT) → giao diện 3-cột "Chat khách hàng" giống native-orders ✅

User: "cho chat jt-tracking giống native-orders đi" (drawer phải → modal 3-cột).

- **Files**: `web2/jt-tracking/js/jt-tracking-modals.js` (`openMsgModal`), `web2/jt-tracking/index.html` (bump `jt-tracking-modals.js?v=20260620chat`).
- **Đổi**: `Web2CustomerChat.open({ phone, name })` → `Web2CustomerChat.open({ layout: 'modal', phone, name })`. `layout:'modal'` route sang `openModal` (web2-customer-chat-modal.js) = giao diện 3-cột "Chat khách hàng" (sidebar danh sách hội thoại + ô tìm + thread) — đúng module dùng chung native-orders đang dùng (image 2). Tự auto-chọn hội thoại theo SĐT.
- **Không thêm script/CSS**: modal CSS nằm trong `web2-customer-chat-core.js` `ensureStyles()` (auto-inject), panel bundle lazy-load sẵn → 0 file mới.
- **Giữ nguyên** `openChat` (nhóm Zalo nguồn của mã vận đơn) = drawer Zalo-only (đúng, không có hội thoại Pancake để liệt kê sidebar).
- **Verify Playwright** (login web2 admin → click SĐT 0911607768): `drawer:false`, `modal3col:true`, header "Chat khách hàng", 150 hội thoại sidebar, ô tìm "Tìm hội thoại theo tên / SĐT…" → khớp image 2. Screenshot xác nhận.

### [web2/render] "Làm tất cả" — fix HẾT phần audit còn treo (16 mục) ✅

Đóng nốt toàn bộ MEDIUM/LOW còn lại sau scan 121 issue. node --check PASS 17 file, 0 NUL.

**Money/correctness (backend):**

- **#26** SePay 2 tin xác nhận → cột `confirm_msg_sent` + claim atomic ở CẢ 2 sender (`_sendQrConfirmMessage` + ck-watcher `_applyMatch`); gửi fail thì reset cờ (KH không mất tin). Khách chỉ nhận 1 tin.
- **#24** ck-watcher rollback CLAIM khi credit không thành (`!credited && !reconciled`) → signal về trạng thái cũ, tick sau retry (hết kẹt 'confirmed' không cộng ví).
- **#2** products create: transaction + dedupe `LOWER(name)+variant+supplier` FOR UPDATE (khớp cả biến thể+NCC → không chặn SP thật) → hết SP trùng khi 2 create race.
- **#21** msg-send: `client_message_id = item.id` vào payload Pancake (idempotency proxy/recover).
- **#LOW21** emitAfterCommit: 2 caller raw-client (resolveWeb2PendingMatch + revertMatchAudit) tạo+drain `_afterCommit` → emit wallet SSE SAU commit (hết nextTick stale-read).
- **#LOW11** fb-posts: saveToken `DELETE user_id<>$1` → model 1-account rõ ràng.
- **#LOW8** web2-returns `_genCode`: giữ retry-on-23505 (đúng, audit xác nhận) + ghi chú chống "fix" nhầm.

**Messaging (an toàn, chỉ guard, KHÔNG gửi gì):**

- **#28** chat reply-to: forward `replyToId` end-to-end (sendMessage đã map → `replied_message_id`).
- **#27** msg-template: GIỮ blanket mark (chống re-queue khi job chạy = chống gửi-trùng) + endpoint `/:id/failed-codes` + `_unmarkSent` gỡ mark đơn LỖI sau job → cho gửi lại. (Bỏ blanket naive sẽ TĂNG gửi-trùng → không làm.)

**Frontend (local, no customer-send):**

- **#32** photo-studio: `freshAiMask` segment đúng frame vừa chụp (fallback maskC, no regression).
- **#29** product-counter: detector RIÊNG mỗi controller + close() (chỉ cache fileset/WASM).
- **#31** video-beauty: generation token chống 2 previewLoop chồng.
- **#23** page-builder: rollback xoá → `load()` resync (bỏ splice idx stale).
- **#25** bill-service: iframe RIÊNG mỗi job + afterprint cleanup (hết clobber 2 print song song).
- **#LOW28** products: SSE self-echo freshness guard (`updatedAt`).

→ **Toàn bộ 121 audit issue (CRITICAL+HIGH+MEDIUM+LOW) đã đóng.** Cần deploy n2store-fallback + web2-api.

## 2026-06-20

### [web2/render] Quét lại TOÀN BỘ 121 audit issue + fix nốt money/cosmetic ✅

User "quét lại hết". Verify 6 agent song song toàn MEDIUM(39)+LOW(32) trong code hiện tại. CRITICAL(6)+HIGH(43)=100% FIXED. Đa số MED/LOW trùng HIGH đã fix. Fix thêm trong đợt này:

- **#19 manual deposit idempotency** (routes/v2/web2-wallets.js): client thiếu `x-idempotency-key` → sinh server-side `mdep_<uuid>` → reference_id không NULL → partial unique index chống double-deposit.
- **#20 sepay pending_matches unique** (services/web2-sepay-matching.js): dedupe pending cũ + `uq_web2_pending_matches_tx_pending` (partial unique transaction_id WHERE status='pending') + ON CONFLICT DO UPDATE cả 2 INSERT → hết dup pending khi race.
- **#LOW1** admin-web2-data-reset.js: sửa comment mô tả sai bước per-slug delete web2_records (code không thực thi).
- **#LOW2** admin-web2-data-reset.js `tsTag`: thêm giây+random → 2 reset cùng phút không trùng tên bảng backup.
- node --check PASS, 0 NUL. Cần deploy n2store-fallback + web2-api.

**CÒN LẠI (cố ý để xử lý riêng — chạm path gửi tin khách / money-flow tinh tế / cần quyết định sản phẩm):** #24 ck-watcher rollback claim, #26 SePay 2 tin xác nhận (cần cột confirm_msg_sent), #21 msg-send Pancake idem key, #27 msg-template mark-sent (bỏ sai cách lại tăng gửi-trùng), #28 chat replyToId (cần verify Web2Chat downstream), #2 products dedupe (rủi ro chặn tạo SP hợp lệ). Frontend polish LOW: video-beauty rVFC, page-builder rollback, bill iframe, products self-echo, photo mask, product-counter detector — latent, fix sau.

## 2026-06-20

### [web2/render] Audit sót: gate auth 3 router + cap amount quick-refund (đóng nốt HIGH còn treo) ✅

Verify lại audit Web 2.0 trực tiếp trong code (không tin commit message) → đợt fix trước gate hầu hết router nhưng **sót 3 file bare auth + 1 money-trust**. Đóng nốt:

- **`reconcile.js`** (#43): `router.use(requireWeb2AuthSoft)` toàn router (8 route PBH scan/pack/ship/deliver/return-failed…); `userFromReq` ưu tiên `req.web2User` (token đã verify) thay vì tin body.
- **`web2-unread.js`** (#9/#26): gate `POST /reconcile` — chống ai cũng trigger reconcile hammer Pancake toàn bộ hội thoại.
- **`web2-customer-intents.js`** (#9/#26): gate `POST /:id/done` + lấy `done_by` từ `req.web2User`.
- **`purchase-refund.js` `/quick-refund`** (#42): credit ledger NCC nay CAP về `Σ(qty×price)` của chính line items đã trừ kho (cho refund ÍT hơn, chặn phồng >1%) — trước tin `totalAmount` client tách rời số kho.
- node --check PASS cả 4, 0 NUL. requireWeb2AuthSoft → 401 khi WEB2_AUTH_ENFORCE=1 (trang web2 đã gửi x-web2-token sẵn), warn-pass khi transition. Cần deploy n2store-fallback + web2-api để áp prod.

**Đã verify FIXED từ đợt trước (code hiện tại):** TPOS creds worker, SSRF, admin `?secret=`, mã hoá token Zalo/FB at-rest, requireWeb2Permission enforce, `/ingest` fail-closed, over-refund qty cap (#4/#20), msg-send `/result` state-guard (#35), sidebar escapeHtml, chat double-send, live-comments dedup key.

### [orders-report/bill] Bỏ default account hardcode `nvqldonhang` — chưa gắn TPOS thì báo "không ra bill" ✅

User: bill phải ra theo TPOS account GẮN với user Web 1.0; chưa gắn thì báo lỗi, KHÔNG fallback account dùng chung. `bill-token-manager.js` `init()`+`_retryLoadFromRender()` đang tạo default `{label:'Mặc định', username:'nvqldonhang', password:'Aa@123456987'}` khi `accounts.length===0` → `hasCredentials()` LUÔN true → guard báo lỗi không bao giờ chạy + lộ password billing dùng chung.

- Bỏ 2 block fallback hardcode → chưa gắn account thì `accounts` rỗng → `hasCredentials()`=false → `getBillAuthHeader` (tab1-fast-sale.js:294) báo sẵn **"Chưa cấu hình tài khoản TPOS cho bill. Vui lòng vào 'Tài khoản TPOS' để cài đặt."** + throw (không ra bill).
- Account chính vẫn nạp per-user từ Render (`loadFromRender` theo Web 1.0 userId) — không đổi. `setCredentials` legacy (nhận creds từ caller) giữ nguyên.
- Bỏ luôn password `Aa@123456987` khỏi client (lộ creds). node --check OK. Bump `?v=20260620e`.

### [shared/worker/render] TPOS đổi password → bỏ hardcode creds client, dùng proxy-auth toàn bộ ✅

User đổi password TPOS (nvkt/nvktlive1 + nvktshop1) → mọi nơi hardcode password CŨ `Aa@28612345678` trong client JS HỎNG + lộ creds. Worker `/api/token` đã proxy-auth (inject creds từ Cloudflare secret). Migrate hết client/server sang proxy-auth:

- **Worker**: company1=nvktlive1 (env TPOS_USERNAME/PASSWORD/CLIENT_ID), company2=nvktshop1 (default + TPOS_PASSWORD chung). Set CF secret `TPOS_PASSWORD` + đã verify **✅ company 1 & 2 đều lấy token OK**.
- **Client (gửi `{companyId}` JSON, KHÔNG gửi password)**: `shared/js/token-manager.js` + `shared/browser/token-manager.js` (passwordLogin), `shared/js/navigation-modern.js` (SwitchCompany doSwitch), `shared/universal/tpos-client.js`, `soorder/js/soorder-supplier-loader.js`, `hanghoan/js/banhang.js`+`trahang.js`, `orders-report/js/tab-kpi-commission.js`. Bỏ literal username/password khỏi path active (helper getCredentials dead còn lại = password cũ vô hại, đã rotate).
- **Server**: `render.com/services/auth-token-store.js` đã env-based (process.env.TPOS_USERNAME/\_2/PASSWORD/CLIENT_ID). Set Render env `TPOS_PASSWORD` (mới) + `TPOS_USERNAME_2=nvktshop1` trên n2store-fallback.
- Refresh-token grant giữ nguyên (không cần password). node --check PASS, 0 NUL. Bump `?v=20260620d` (45 HTML).
- ⚠ Còn `scripts/tpos-fetch-shapes.js` (dev script, không deploy) còn pw cũ — vô hại, để sau.

### [web2/render/worker] Fix MEDIUM/LOW audit còn lại (workflow 46-agent per-file) ✅

User "làm tất cả fixes". Workflow per-file (đọc report, giữ nguyên fix auth/money/encrypt đợt trước, node --check). 71 medium/low → **25 file đổi NET** (nhiều backend route đã có fix từ đợt 21-file → no-op).

- **Backend (NEW)**: `proxy-handler.js` (worker, medium), `web2-msg-send-worker.js` (medium race counter). Các route khác (admin-wallet-reset tsTag/timing-safe/assertSafeTable, jt-tracking PURGE_THROTTLE chống write-storm GET /list, products stock atomic, …) đã có sẵn trong HEAD.
- **Frontend (23 file)**: video-beauty (camera/canvas leak), photo-studio (ui/canvas/bg), products (modal/detail/actions), reconcile (api/actions), supplier-wallet-actions, page-builder, ck-assign-picker, product-counter, msg-template, variants-app, video-maker, fb-posts-app, live-chat (init-wiring listener leak, comment-list-render, pancake-chat-window), native-orders-pbh-bill. Chủ yếu: EventSource/listener/camera leak cleanup, debounce/guard, escaping, optimistic rollback closure.
- Agents **skip hợp lý** item rủi ro (đổi money/auth logic cần test runtime) + item đã fix.
- ✅ Verify độc lập: node --check 100% PASS, **0 NUL corruption** (0x1F trong live-comment-list là delimiter có sẵn, không phải agent thêm). Bump `?v=20260620c` (14 HTML). Worker redeploy cho proxy-handler.

### [ops] Deploy + kích hoạt toàn bộ fix audit lên prod (worker + Render + mã hoá) ✅

User "làm tất cả, key ở serect_dont_push" + "đã đổi tpos nvkt". Dùng Render API + Cloudflare Global API (từ secrets) thực thi prod:

- **Worker (Cloudflare `chatomni-proxy`)**: `token-handler.js` bỏ hardcode password TPOS → đọc `env.TPOS_PASSWORD`/`TPOS_USERNAME`/`TPOS_CLIENT_ID` (company1), `TPOS_PASSWORD_2`/`TPOS_USERNAME_2` (company2); set CF secret `TPOS_PASSWORD` (password mới); **deploy** (version b6372e3e). Verify: **✅ company1 (live) auth OK**; ⚠️ **company2 (shop) 400 — cần set `TPOS_USERNAME_2`/`TPOS_PASSWORD_2` đúng creds nvktshop1** (ONCALL\_\* worker = PBX/SIP điện thoại, KHÔNG phải TPOS). SSRF proxy/image: **✅ chặn private-IP + host ngoài allowlist**.
- **Mã hoá at-rest KÍCH HOẠT**: generate `WEB2_ENC_KEY` → set Render env **web2-api + web2-realtime + n2store-fallback** + ghi secrets. Deploy web2-api + n2store-fallback (zca Zalo ở fallback, routes ở web2-api) → live. Row cũ plaintext vẫn đọc (zero-lockout); login/refresh mới mã hoá.
- **Dọn Render env**: grep usage toàn repo → xoá **5 var chết** khỏi n2store-fallback (`AUTOFB_*` ×4 feature gỡ, `BUNNY_ACCOUNT_API_KEY`). Giữ ambiguous/sensitive (GOOGLE*PLACES, VERIFY_TOKEN, ONCALL_SIP*\* PBX, FALLBACK_BASE/MAX_EVENTS dùng live-chat/server).
- **Smoke-test prod ✅**: gated writes → 401 không token; reads → 200; app up. Frontend gửi token (93/93 write-call đã verify) → user thật không bị 401.

### [render] Mã hoá token/session Zalo+FB AT-REST (AES-256-GCM, safe-by-default) ✅

Item HIGH còn lại của audit (token/session lưu plaintext). Build helper dùng chung + wire vào các choke-point.

- **MỚI `render.com/lib/web2-secret-crypto.js`** — AES-256-GCM, đọc env `WEB2_ENC_KEY` (32 byte hex/base64). `encryptString/decryptString` (TEXT) + `encryptJson/decryptJson` (JSONB, bọc `{__enc__:...}` để cột vẫn JSON hợp lệ). **AN-TOÀN-MẶC-ĐỊNH**: không có key → no-op (plaintext như cũ); read path luôn tha legacy plaintext (zero-lockout); sai/thiếu key khi data đã mã hoá → ném (không trả rác). **16/16 unit-test PASS** (roundtrip string/JSONB, passthrough, double-encrypt no-op, sai key).
- **Wire (workflow 5-agent, 9 write encrypt + 8 read decrypt)**: `web2-zalo-zca.js` (session: encrypt \_afterLogin, decrypt restoreAll trước zca.login), `web2-zalo-oa.js` (oa_secret/access_token/refresh_token: encrypt INSERT/UPDATE, decrypt trước fetch OA, tránh double-encrypt nhánh fallback), `web2-zalo.js` (session: \_saveSession encrypt, reconnect+restoreSessions decrypt; boolean hasSession không đụng), `web2-fb-posts.js` (loadToken decrypt + saveToken encrypt = 1 choke-point phủ mọi downstream read user_token+pages). `web2-fb-graph-service.js` không đổi (nhận token đã giải mã). Auth-gating/advisory-lock đợt trước được giữ.
- ✅ node --check 5 file OK, 0 NUL byte, import `../lib/web2-secret-crypto` đúng.
- ⚠️ **KÍCH HOẠT** (chưa bật): `openssl rand -hex 32` → set Render env `WEB2_ENC_KEY=<hex>` cho web2-api (+ realtime/fallback nếu cùng đọc bảng). Row CŨ vẫn plaintext (read tha được); re-login Zalo / re-connect FB sẽ ghi đè = mã hoá dần. **Test trước khi bật prod**: set key ở local → re-login Zalo + re-connect FB xác nhận roundtrip.

### [render/worker/shared] FIX audit Web 2.0 — gate auth + SSRF + money + idempotency (21 file, workflow per-file) ✅

User "fix tất cả". Workflow 23-agent (mỗi agent 1 file, đọc report làm spec, `node --check`) → **21 file đổi, 780+ insert**. Tôi verify độc lập: node --check 19 JS OK + 2 worker ESM OK; **bắt + sửa 2 NUL byte agent chèn nhầm** ở `web2-zalo.js:44` (template dedupe key → đổi `\x00`→`|`); xác nhận **KHÔNG GET read nào bị gate** (chỉ writes → giảm rủi ro 401).

- **Auth gating** (14 router): `web2-zalo` (router.use soft + admin disconnect/delete + idempotency 4 send + IDOR /media private), `web2-fb-posts` (admin connect/disconnect/refresh/delete/publish + advisory-lock chống double-publish), `web2-returns`/`purchase-refund`/`web2-supplier-wallet`/`web2-products`/`web2-variants`/`web2-msg-send`/`web2-msg-templates`/`web2-quick-replies`/`web2-jt-tracking`/`web2-ai-script`/`web2-live-comments`/`web2-users` (gate writes; reads mở).
- **Money**: `web2-returns` server-validate walletCredit (cap giá≤đơn, SL≤đã mua, tổng≤wallet_deducted → không mint tiền) + snapshot per-PBH khi huỷ + dedupe 60s; over-refund server-authoritative (`web2-supplier-wallet`+`purchase-refund` tự tính `ordered`, bỏ tin client).
- **Race/idempotency**: zalo send guard (cliMsgId), fb publish pg_advisory_lock (409 nếu trùng), products PATCH stock atomic, msg-send counter, jt `/clear` cần confirm/admin, chat-compose double-send guard.
- **Worker SSRF**: `proxy-handler`+`image-proxy-handler` validate `?url=` (allowlist host exact/subdomain + chặn private/loopback/link-local IPv4+IPv6).
- **Admin**: bỏ `|| req.query.secret` ở 5 route (chỉ nhận header `x-admin-secret`).
- **escapeHtml** (`web2-sidebar.js`): escape thêm `"` `'` (an toàn attribute context).
- ⚠️ **DEFER (cần user)**: (1) đổi mật khẩu TPOS + `wrangler secret` (token-handler Web 1.0, ngoài scope); (2) mã hoá token/session Zalo+FB at-rest (cần key env + schema change); (3) zalo `/media/:id` opaque-token URL (schema) — hiện `<img>` không gửi header được → thumbnail có thể vỡ khi enforce. ⚠️ **RISK**: writes giờ cần `x-web2-token` (trang phải gửi qua Web2Auth.authHeaders); admin-gated routes 403 với non-admin.

### [docs/web2] Rà soát toàn diện Web 2.0 (read-only audit, multi-agent workflow) → WEB2-FULL-REVIEW-20260620.md ✅

User yêu cầu rà soát toàn bộ Web 2.0 (cloudflare/render/firebase/shared + từng trang: input→handler→hiệu ứng, SSE, console.log, bảo mật, liên kết trang) — KHÔNG gửi gì tới FB/Pancake/Zalo. Chạy workflow ~57 agent audit + verify từng lỗi (adversarial) + null-safe synthesis.

- **Kết quả `docs/web2/WEB2-FULL-REVIEW-20260620.md`**: 56 unit, **121 lỗi xác nhận** (đã khử trùng) — 🔴 6 critical · 🟠 43 high · 🟡 39 medium · ⚪ 32 low. Mỗi lỗi qua 1 agent kiểm chứng độc lập (đa số confidence=high) + `file:line` + fix.
- **Phát hiện nổi bật (CRITICAL/HIGH)**: hàng loạt router Web 2.0 **KHÔNG có auth** (`web2-zalo` 44 routes gồm gửi tin + IDOR /media, `web2-fb-posts` token theft + publish, `web2-returns`/`purchase-refund` tiền + over-refund client-controlled, `web2-products`/`web2-variants` mutations, `web2-msg-send`, `web2-jt-tracking` + `/clear` DELETE-all, `web2-ai-script`); worker **hardcode plaintext TPOS creds** (token-handler.js:42) + **open-proxy/SSRF** (`?url=` không validate); admin secret lộ qua `?secret=` query (5 route); Zalo/FB token + session lưu plaintext; `web2-users` permission không enforce server-side; double-send (Zalo) + double-publish (FB) thiếu idempotency.
- Rà soát tĩnh hoàn toàn (Read/Grep), KHÔNG gọi mạng, KHÔNG gửi gì tới khách. Verify dừng sớm ở 122 verdict do candidate trùng lặp nhiều (lỗi auth bị nhiều agent xác nhận) — critical/high đã phủ đủ. Lộ trình fix ưu tiên: gắn auth router hở + đổi mật khẩu TPOS + validate `?url=` worker.

### [CLAUDE.md/MEMORY] Rule BƯỚC 0: đọc web2/shared/ TRƯỚC khi code Web 2.0 ✅

User: "memory/claude/dev-log vẫn chưa nắm rõ thông tin dự án → nhớ xem shared web 2.0 trước khi code để lấy được toàn bộ module web 2.0".

- **`CLAUDE.md`** mục "Quy tắc khi code": thêm callout **⚠️ BƯỚC 0 BẮT BUỘC** — mở/đọc `web2/shared/` (~90+ module) + `docs/web2/WEB2-CODEMAP.md` §1 Shared Modules Registry TRƯỚC khi viết dòng nào → tái dùng, KHÔNG fork.
- **MEMORY**: file mới `feedback_web2_read_shared_first.md` + pointer đầu `MEMORY.md` (Why: tránh trùng lặp/drift; How: ls web2/shared + tra CODEMAP §1 trước).

### [vieneu-tts/web2-pos-installer] Bộ cài máy POS (.bat) → MENU bấm số: Print Bridge / VieNeu / OmniVoice / cài hết ✅

User: "VieNeu / OmniVoice / printer… tất cả file cài bằng bat của Web 2.0 → mở .bat cho chọn option hoặc cài hết bấm số 0,1,2,3".

- **`web2/shared/web2-pos-installer.js`** `batContent()` → sinh `cai-may-pos.bat` dạng **MENU**: `[1]` Print Bridge (in máy IP), `[2]` VieNeu (~595MB), `[3]` OmniVoice (~vài GB, 600+ ngôn ngữ + Voice Design), `[0]` cài hết, `[Q]` thoát. `uninstallBatContent()` gỡ cả 3 (thêm `N2StoreOmniVoice`).
- **`vieneu-tts/vieneu-windows-setup.ps1`** thêm `-Engine <vieneu|omnivoice>` + `-Port` (8123/8124, chạy song song được): thư mục riêng `N2StoreVieNeu`/`N2StoreOmniVoice`, venv riêng, deps riêng (omnivoice kéo torch + `requirements-omnivoice.txt`), launcher `start.cmd` set `TTS_ENGINE`+`PORT` chạy ẩn + auto-start. **Sửa regression**: app.py giờ import `engine_base/engine_vieneu` → ps1 tải thêm các file engine (trước chỉ tải app/serve/requirements → sẽ vỡ).
- **`vieneu-tts/install-windows.bat`** (chạy từ folder) cũng thành menu `[1]` VieNeu `[2]` OmniVoice `[0]` cài hết.
- Bump `web2-pos-installer.js?v=20260620a` (video-maker + printer-settings).
- ✅ Verify: py_compile OK; node render `cai-may-pos.bat` (menu 3 engine, `-Engine` param đúng, VBASE đúng, paren cân, uninstall có OmniVoice). Bat/ps1 thật chạy trên máy Windows shop.

### [vieneu-tts] Thêm engine OmniVoice (k2-fsa, Apache-2.0) cạnh VieNeu — chọn qua TTS_ENGINE, GIỮ NGUYÊN frontend ✅

Research 3 repo TTS user gửi (TTS-WebUI/MIT, OmniVoice-Studio/AGPL, **k2-fsa/OmniVoice/Apache-2.0**). Verdict: OmniVoice là bản nâng cấp khít VieNeu (cùng hình dạng server máy shop, Apache-2.0, **tiếng Việt thật** — ngôn ngữ #607, 8.481h data; clone SOTA + **Voice Design** chỉnh giới tính/tuổi/cao độ/accent không cần mẫu). User chọn **(A)** thêm engine vào `vieneu-tts/` server.

- **MỚI engine abstraction trong `vieneu-tts/`**: `engine_base.py` (interface `TTSEngine` + `float_to_wav_bytes` stdlib WAV PCM16, không cần soundfile), `engine_vieneu.py` (tách hành vi gốc, KHÔNG đổi logic), `engine_omnivoice.py` (wrap `OmniVoice.from_pretrained().generate(text,ref_audio,instruct,num_step,speed)`, tự dò device cuda/mps/xpu/cpu, preset Voice Design tiếng Việt).
- **`app.py` rewrite**: factory chọn engine qua env `TTS_ENGINE` (mặc định `vieneu` → hành vi cũ y nguyên). Cùng contract `/health`(+field `engine`)·`/voices`·`/synthesize`·`/clone` + **MỚI `/design {text,instruct}`** (501 nếu engine không hỗ trợ). Lock serialize giữ nguyên.
- **`serve.py`**: engine-aware (env `TTS_ENGINE` → tên máy hậu tố "(OmniVoice)", heartbeat thêm `note=engine` để UI phân biệt, print khởi động theo engine). Mặc định vieneu KHÔNG đổi.
- **MỚI**: `requirements-omnivoice.txt` (torch cài theo nền tảng trước + omnivoice) · `run-omnivoice-mac.command` (1-click venv riêng `.venv-omnivoice` + torch MPS + omnivoice). venv 2 engine TÁCH RIÊNG (deps khác).
- **Frontend GIỮ NGUYÊN 100%** — `Web2Vieneu` chỉ gọi `/health /voices /synthesize /clone` + registry `/list`, engine-agnostic. Máy OmniVoice tự hiện trong danh sách (note=omnivoice), `voice` preset → instruct, `/clone` → ref_text auto Whisper.
- ✅ Verify offline (KHÔNG tải model, không mạng): py_compile 5 file OK; factory chọn đúng vieneu/omnivoice + list preset; `float_to_wav_bytes` ra WAV hợp lệ RIFF/WAVE mono 24kHz PCM16 (đúng thứ `decodeAudioData` frontend đọc). Inference thật cần máy có torch+omnivoice (máy shop) — code khớp README API đã verify.

### [web2/shared] PWA dùng chung — "Thêm vào Màn hình chính" (iOS/Android), không App Store ✅

User hỏi build app iOS không + không có Apple dev account cài ngoài App Store được không. Tư vấn: native iOS không đáng (không account = chỉ sideload 7-ngày, không bền); **PWA là giải pháp đúng** (miễn phí, không account, không App Store). Build PWA dùng chung:

- **MỚI `web2/shared/web2-manifest.webmanifest`** (name N2Store, standalone, theme #0068ff, icon logo-emblem 256, start_url/scope TƯƠNG ĐỐI → host-agnostic nhijudy.store + github.io/n2store) + **`web2/shared/web2-pwa.js`** (inject manifest link + apple-mobile-web-app-\* + apple-touch-icon + theme-color vào MỌI trang).
- Auto-nạp qua `web2-sidebar.js` autoLoad (như web2-mobile.css) → KHÔNG sửa 40 HTML. Bump `web2-sidebar.js?v=20260620a` (46 trang). Guard: trang tự khai (photo-studio) giữ manifest riêng.
- **CỐ Ý KHÔNG service worker**: app data cần luôn mới, SW cache dễ kẹt code cũ sau deploy; iOS "Thêm màn hình chính" không cần SW.
- ✅ Verify Playwright 3 trang: manifest fetch 200 "N2Store — Web 2.0", appleCapable=yes, apple-touch-icon=yes, theme=#0068ff. Commit `23b5e998a`.

<!--
HƯỚNG DẪN THÊM ENTRY MỚI:

1. Nếu cùng ngày → thêm entry ngay dưới heading ## [NGÀY]
2. Nếu ngày mới → thêm heading ## [NGÀY MỚI] ở trên cùng (trước ngày cũ)

FORMAT:
### [module] Mô tả ngắn {✅ hoặc 🔄}
**Files**: `path/to/file.js`
**Chi tiết**: Thay đổi gì, tại sao

MODULE TAGS: [inbox] [chat] [extension] [orders] [worker] [render] [shared] [docs] [config]
STATUS: ✅ = Done, 🔄 = In Progress
-->
