# Put-to-Light (đèn LED chỉ ô kệ) — Hướng dẫn lắp & setup

> WEB2.0 · Cho trang **Quét tem** ([web2/unit-scan](../../web2/unit-scan/index.html)).
> Quét 1 tem → **đèn LED ở đúng ô kệ (STT) sáng lên** → bỏ hàng vào, không cần đọc số.
> Mục tiêu: chia hàng **1 lượt** (quét đâu sáng đó, đặt thẳng), giảm sai sót với SP trùng.

---

## 0. Cần bao nhiêu? (số bóng · độ dài · controller)

**Quy mô** (sơ đồ kệ: 9 kệ × 15 cột × 6 hàng):

|                         | 1 ô = 1 bóng | Bóng                            | Độ dài dải LED\*\*                        | Controller (ESP32)              | Nguồn 5V  |
| ----------------------- | ------------ | ------------------------------- | ----------------------------------------- | ------------------------------- | --------- |
| **1 kệ** (90 ô)         | ✔            | **90 bóng**                     | **~9 m**                                  | **1**                           | 1× 5V/5A  |
| **9 kệ (full)** (810 ô) | ✔            | **810 bóng** (mua dư → **900**) | **~81 m** (mua **18 cuộn 50 bóng** = 90m) | **3** (mỗi con 3 kệ = 270 bóng) | 3× 5V/10A |

\*\***Khoảng cách bóng = bề rộng 1 ô** — đo kệ thật rồi chọn. Mặc định ví dụ **10 cm/bóng** → 90 bóng = 9 m/kệ. Mua loại spacing 5/10/13/15 cm tuỳ ô. WS2811 bán theo **string 50 bóng** (~5 m/string).

> **Controller**: 1 ESP32 ôm an toàn **≤ ~270 bóng**. Full 9 kệ → **3 ESP32**.
> Cách dễ lắp hơn cho 5V (ít sụt áp, mở rộng từng kệ): **9 ESP32, mỗi con 1 kệ** — dây ngắn 9m, bơm nguồn 2 đầu. Nhiều board hơn nhưng chống lỗi tốt hơn cho dải dài.

### 💰 Bảng mua — PROTOTYPE 1 kệ (90 ô) ≈ **480–560k**

| Món                                         | SL            | Đơn giá\* | Thành tiền | Link Shopee (tìm)                                                                                                                                                                                                         |
| ------------------------------------------- | ------------- | --------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ESP32 DevKit WROOM-32 (38 chân)             | 1             | ~110k     | 110k       | [tìm](https://shopee.vn/search?keyword=esp32%20devkit%20wroom%2032)                                                                                                                                                       |
| WS2811 5V 12mm đục lỗ, string 50 bóng       | 2 (=100 bóng) | ~130k     | 260k       | [tìm](https://shopee.vn/search?keyword=led%20ws2811%205v%20%C4%91%E1%BB%A5c%20l%E1%BB%97)                                                                                                                                 |
| Nguồn tổ ong 5V/5A                          | 1             | ~90k      | 90k        | [tìm](https://shopee.vn/search?keyword=ngu%E1%BB%93n%20t%E1%BB%95%20ong%205v%205a)                                                                                                                                        |
| Tụ 1000µF/16V + trở 470Ω + dây + JST 3 chân | 1 bộ          | ~80k      | 80k        | [tụ](https://shopee.vn/search?keyword=t%E1%BB%A5%201000uf%2016v) · [trở](https://shopee.vn/search?keyword=%C4%91i%E1%BB%87n%20tr%E1%BB%9F%20470%20ohm) · [JST](https://shopee.vn/search?keyword=jst%20sm%203%20ch%C3%A2n) |
|                                             |               |           | **≈ 540k** |                                                                                                                                                                                                                           |

### 💰 Bảng mua — FULL 9 kệ (810 ô) ≈ **3.0–3.5 triệu**

| Món                                                   | SL             | Đơn giá\* | Thành tiền   | Link Shopee (tìm)                                                                         |
| ----------------------------------------------------- | -------------- | --------- | ------------ | ----------------------------------------------------------------------------------------- |
| ESP32 DevKit WROOM-32                                 | 3              | ~110k     | 330k         | [tìm](https://shopee.vn/search?keyword=esp32%20devkit%20wroom%2032)                       |
| WS2811 5V 12mm đục lỗ, string 50 bóng                 | 18 (=900 bóng) | ~130k     | 2.340k       | [tìm](https://shopee.vn/search?keyword=led%20ws2811%205v%20%C4%91%E1%BB%A5c%20l%E1%BB%97) |
| Nguồn tổ ong 5V/10A                                   | 3              | ~140k     | 420k         | [tìm](https://shopee.vn/search?keyword=ngu%E1%BB%93n%20t%E1%BB%95%20ong%205v%2010a)       |
| Phụ kiện: tụ ×3, trở, dây silicon 2 cuộn, JST, hộp ×3 | 1 bộ           | ~200k     | 200k         | [dây](https://shopee.vn/search?keyword=d%C3%A2y%20silicon%20%C4%91i%E1%BB%87n)            |
| (Tuỳ chọn) Level shifter 74AHCT125                    | 3              | ~10k      | 30k          | [tìm](https://shopee.vn/search?keyword=74AHCT125)                                         |
|                                                       |                |           | **≈ 3.290k** |                                                                                           |

\*Giá **tham khảo Shopee 2026, dao động theo shop** — link là **trang tìm kiếm**, tự chọn shop uy tín (xem đánh giá). **Mua dư ~10% bóng** phòng hư.

> 💡 **Bắt đầu**: mua bộ **PROTOTYPE 1 kệ (~540k)** chạy thật 1 kệ trước; ổn rồi nhân ra full 9 kệ.

---

## 1. Cách hoạt động

```
[Điện thoại quét tem QR]
        │  (cùng WiFi LAN)
        │  HTTP GET  /stt?n=<STT toàn cục>
        ▼
[ESP32 + WS2811]  ──►  sáng LED ở ô STT đó (xanh)
```

- Mỗi tem QR = 1 đơn vị, đã gán **1 STT** (xem [KB-PRODUCT-CODE-UNITS](KB-PRODUCT-CODE-UNITS.md)).
- Trang web tính **STT toàn cục** rồi gửi cho **mọi ESP32** đã khai báo. Con nào phụ trách dải STT đó mới sáng (tự lọc).
- 1 ESP32 ôm 1–3 kệ (≤ ~270 LED/con cho ổn định). 9 kệ → vài con ESP32, mỗi con `STT_BASE` khác nhau.

### Vì sao WS2811 5V (không phải WS2812B strip)?

- Ô kệ rộng ~10–20cm → cần bóng **thưa**. **WS2811 dạng đục lỗ (string)** mỗi bóng cách nhau ~5–15cm, xỏ qua lỗ khoan từng ô → 1 bóng/ô gọn đẹp.
- WS2812B strip dày 30–60 LED/m → quá dày cho ô kệ (chỉ hợp trang trí). Vẫn DÙNG ĐƯỢC nếu bạn chấp nhận cắt/nối.
- **Chọn loại 5V** (không phải 12V): 12V WS2811 gom 3 LED/1 IC → không địa chỉ hoá từng bóng đơn được. Firmware mặc định `WS2811`/`WS2812B` đều chạy, chỉ cần đổi `LED_TYPE` + `COLOR_ORDER`.

---

## 2. ⚠ QUAN TRỌNG — HTTPS chặn gọi ESP32 (mixed content)

Trình duyệt **CHẶN** trang **HTTPS** (https://nhijudy.store) gọi tới ESP32 **HTTP** (http://192.168…). Đây là rào bảo mật, không thể tắt từ web.

→ **2 cách dùng:**

### Cách A — Mở trang qua HTTP LAN (KHUYÊN DÙNG, đơn giản + nhanh nhất)

Chạy server tĩnh trên 1 máy shop rồi mở trang qua HTTP:

```bash
# trên máy shop (đã có sẵn trong dự án):
cd /đường-dẫn/n2store && python3 -m http.server 8080
# điện thoại mở (cùng WiFi):  http://<IP-máy-shop>:8080/web2/unit-scan/
```

- HTTP page → HTTP ESP32: **OK** (cùng cấp).
- HTTP page → HTTPS API worker: **OK** (trình duyệt cho nâng cấp lên HTTPS).
- Đèn phản hồi **tức thì (<20ms)**, không qua mạng ngoài.

### Cách B — Cầu nối SSE qua cloud (chạy được trên HTTPS, chậm hơn ~100–300ms)

ESP32 tự kết nối ra SSE Render (`/api/realtime/web2/sse?keys=web2:putwall`); trang HTTPS chỉ cần gọi `POST /api/web2-putwall/light {stt}` (HTTPS→HTTPS, không vướng mixed content). **Chưa làm sẵn** — khi nào cần chạy trên nhijudy.store thật thì báo, sẽ bổ sung route + firmware SSE. Hiện tại dùng **Cách A**.

---

## 3. Sơ đồ nối dây

```
 ESP32                         WS2811 string (5V)
 ┌───────┐                     ┌───────────────┐
 │ GPIO13├───[ 330–470Ω ]──────┤ DIN (data)    │
 │  GND  ├──────────┬──────────┤ GND           │
 │  5V/VIN│         │          │ +5V           │
 └───────┘         │           └───────────────┘
                   │                  ▲   ▲
            ┌──────┴──────┐           │   │
            │ Nguồn 5V    ├───────────┘   │  (+5V)
            │ (tổ ong)    ├───────────────┘  (GND)
            └─────────────┘
   Tụ 1000µF/16V mắc song song +5V↔GND ở ĐẦU dải (chân dài = +).
```

**Nguyên tắc bắt buộc:**

1. **GND chung**: GND của ESP32, nguồn 5V, và LED phải **nối chung** (không chung GND → không sáng / sáng loạn).
2. **Điện trở 330–470Ω** nối tiếp chân DATA (GPIO13 → DIN) chống nhiễu xung đầu.
3. **Tụ 1000µF** giữa +5V và GND ngay đầu dải LED, chống sụt áp lúc bật.
4. **KHÔNG cấp 5V cho LED từ chân 5V của ESP32** nếu nhiều bóng — lấy 5V **trực tiếp từ nguồn tổ ong**. ESP32 chỉ cấp DATA + GND chung.
5. Chú ý **chiều mũi tên** trên dải LED (DIN→DOUT). Nối sai chiều = không sáng.
6. (Tuỳ chọn) Data 3.3V của ESP32 đôi khi yếu với dải dài → thêm **74AHCT125** nâng 3.3V→5V cho DATA. Dải ngắn (<2–3m) thường bỏ qua được.

---

## 4. Tính nguồn điện

- 1 LED WS2811 sáng trắng tối đa ~**50–60mA**. Nhưng put-to-light **chỉ sáng 1–vài bóng/lúc** → tải thực rất nhỏ.
- Công thức an toàn (nếu lỡ sáng hết): `Ampe = số_LED × 0.06`. Vd 90 LED × 0.06 = **5.4A** → nguồn **5V/10A** dư sức cho 1 kệ; **5V/5A** đủ cho prototype (vì không bao giờ sáng hết).
- Dải dài → **bơm nguồn 2 đầu** (đầu + cuối nối +5V/GND) tránh sụt áp (bóng cuối tối/ngả đỏ).

---

## 5. Map LED ↔ STT (gắn cho ĐÚNG)

STT chạy **tuần tự Kệ1→9, hàng-major** (xem [web2-shelf-map.js](../../web2/shared/web2-shelf-map.js)): Kệ 1 = STT 1–90, Kệ 2 = 91–180, … Kệ K = `(K-1)*90+1 … K*90`. Mỗi kệ 15 cột × 6 hàng.

Trong firmware mỗi ESP32 khai:

| Biến         | Nghĩa                              | Ví dụ Kệ 1     | Ví dụ Kệ 2 |
| ------------ | ---------------------------------- | -------------- | ---------- |
| `STT_BASE`   | STT toàn cục của **bóng đầu tiên** | `1`            | `91`       |
| `NUM_LEDS`   | số ô con này phụ trách             | `90`           | `90`       |
| `COLS`       | số cột mỗi kệ                      | `15`           | `15`       |
| `SERPENTINE` | dải đi **zig-zag** hàng lẻ↔chẵn?   | `true`/`false` | —          |

### Đi dây theo STT (2 kiểu)

- **Thẳng hàng** (`SERPENTINE=false`): mỗi hàng nối lại từ trái. Đẹp nhưng tốn dây hồi đầu hàng.
- **Zig-zag** (`SERPENTINE=true`, khuyên dùng): hàng 1 trái→phải, hàng 2 phải→trái, … (rắn bò). Tiết kiệm dây. Firmware tự đảo cột hàng chẵn để STT vẫn đúng.

> ✅ Sau khi gắn, bấm **/test** (hoặc nút Test trong app) → 1 chấm xanh chạy STT 1→cuối. Nếu thứ tự nhảy lung tung → sai `SERPENTINE`/`COLS`. Nếu **sai màu** (đỏ thành xanh…) → đổi `COLOR_ORDER` (GRB↔RGB↔BRG).

---

## 6. Cài firmware (Arduino IDE)

File: [`web2/putwall/firmware/putwall-esp32.ino`](../../web2/putwall/firmware/putwall-esp32.ino)

1. Cài **Arduino IDE** → `File ▸ Preferences ▸ Additional Boards URL`:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
2. `Tools ▸ Board ▸ Boards Manager` → cài **esp32 by Espressif**.
3. `Tools ▸ Manage Libraries` → cài **FastLED**.
4. Mở `putwall-esp32.ino`, sửa phần **CẤU HÌNH**:
    - `WIFI_SSID` / `WIFI_PASS` (WiFi **2.4GHz** — ESP32 không vào 5GHz).
    - `NUM_LEDS`, `STT_BASE`, `COLS`, `SERPENTINE`, `LED_TYPE`, `COLOR_ORDER`, `LED_PIN`.
5. `Tools ▸ Board ▸ ESP32 Dev Module`, chọn cổng COM, **Upload**.
6. Mở `Tools ▸ Serial Monitor` (115200) → xem **IP** (vd `192.168.1.50`). Bóng đầu chớp xanh 2 cái = WiFi OK; đỏ = sai WiFi.
7. Mở trình duyệt `http://192.168.1.50/test` → kiểm tra chạy đèn.

> 📌 Nên **đặt IP tĩnh** cho ESP32 trên router (DHCP reservation theo MAC) để IP không đổi.

---

## 7. Cấu hình trang web

Trang [Quét tem](../../web2/unit-scan/index.html) → nút **💡** trên header → bảng cài đặt:

- ✅ **Bật đèn LED khi quét**.
- **Địa chỉ ESP32**: mỗi dòng 1 con, vd:
    ```
    http://192.168.1.50
    http://192.168.1.51
    ```
- **Màu / Độ sáng / Tự tắt (ms)** (0 = giữ sáng tới lần quét sau).
- **Kiểm tra** → ping `/health` từng con (báo dải STT con đó ôm). **Test** → chạy đèn. **Tắt đèn** → clear.

Sau đó: **quét tem → ô sáng**. Trong **chi tiết kệ**, bấm 1 SP → **sáng mọi ô của SP đó** (đặt cả "sấp" 1 lượt).

---

## 8. Nhiều kệ (9 kệ)

- Mỗi ESP32 ôm 1–3 kệ. Vd: con A `STT_BASE=1, NUM_LEDS=270` (Kệ 1–3), con B `STT_BASE=271, NUM_LEDS=270` (Kệ 4–6), con C `STT_BASE=541…` (Kệ 7–9).
- Khai **tất cả IP** vào ô địa chỉ (mỗi dòng 1 con). Trang gửi cho cả 3; chỉ con trúng dải mới sáng.
- ⚠ 1 con ôm >270 LED → tăng `MAX_LEDS` trong firmware + cân nhắc bơm nguồn/level shifter.

---

## 9. Quy trình **chia hàng 1 lượt** (layout vuông + đèn)

Đúng ý tưởng "đống hàng ở giữa, 8 kệ quây vuông":

1. Để **sấp áo (đã dán tem)** ở **giữa**, các kệ quây quanh trong tầm với.
2. Lấy 1 món → **quét** → đèn ô kệ của nó **sáng** → bỏ thẳng vào ô đó.
3. Lặp lại. **Không cần xe trung gian, không cần đọc STT** — mắt nhìn đèn.
4. SP trùng (5 áo polo → STT 1 & 6): mỗi tem sáng đúng ô riêng → không nhầm.
5. Theo dõi tiến độ "9 kệ" + "Đưa xe ra" vẫn chạy như cũ (mỗi quét cộng tiến độ).

> Mẹo: trong chi tiết kệ bấm 1 SP → **mọi ô của SP đó sáng cùng lúc** → ôm cả sấp đặt 1 lượt nếu muốn gom theo SP thay vì theo món.

---

## 10. Troubleshooting

| Hiện tượng                              | Nguyên nhân / cách sửa                                                   |
| --------------------------------------- | ------------------------------------------------------------------------ |
| Bấm Test/Kiểm tra không ăn, trang HTTPS | **Mixed content** — mở trang qua **HTTP LAN** (mục 2A).                  |
| `/health` lỗi "unreachable"             | Sai IP / khác WiFi / ESP32 chưa lên. Ping IP, xem Serial Monitor.        |
| Không bóng nào sáng                     | GND chưa chung; sai chiều DIN→DOUT; sai `LED_PIN`; chưa cấp 5V từ nguồn. |
| Thứ tự đèn loạn                         | Sai `SERPENTINE` hoặc `COLS`. Chạy `/test` đối chiếu.                    |
| Sai màu                                 | Đổi `COLOR_ORDER` (GRB/RGB/BRG).                                         |
| Bóng cuối tối/ngả đỏ                    | Sụt áp — bơm nguồn 2 đầu, dây nguồn to hơn.                              |
| ESP32 reset liên tục                    | Thiếu nguồn / chập. Tách nguồn LED khỏi USB.                             |
| Đèn sai ô lệch đều                      | `STT_BASE` sai (lệch 1 kệ = 90).                                         |

---

## 11. Tham khảo (GitHub / thư viện)

- **FastLED** — thư viện điều khiển WS2811/WS2812 (firmware này dùng): https://github.com/FastLED/FastLED
- **Adafruit NeoPixel** — thư viện thay thế: https://github.com/adafruit/Adafruit_NeoPixel
- **WLED** — firmware LED-over-WiFi nổi tiếng, có REST `/json/state` set từng pixel (`{"seg":[{"i":[5,"00FF00"]}]}`) nếu muốn dùng sẵn thay firmware custom: https://github.com/wled/WLED
- **Freenove WS2812 lib for ESP32**: https://github.com/Freenove/Freenove_WS2812_Lib_for_ESP32
- **arkandas/esp32-led-controller** (web UI + Alexa): https://github.com/arkandas/esp32-led-controller
- **matthewlai/ESP32LEDControl**: https://github.com/matthewlai/ESP32LEDControl

> Firmware của dự án (`putwall-esp32.ino`) là bản **tối giản riêng cho put-to-light** (map STT→ô + HTTP `/stt`), nhẹ hơn WLED và đúng nhu cầu. Chỉ chuyển sang WLED nếu cần hiệu ứng/quản lý nâng cao.

---

## 12. Giao thức HTTP của controller (tham khảo dev)

| Route                                                    | Tác dụng                                          |
| -------------------------------------------------------- | ------------------------------------------------- |
| `GET /stt?n=<STT>&c=RRGGBB&b=0-255&ms=<auto-off>&keep=1` | Sáng ô của STT. `keep=1` giữ ô cũ (sáng nhiều ô). |
| `GET /clear`                                             | Tắt hết.                                          |
| `GET /test`                                              | Chạy 1 chấm STT đầu→cuối (kiểm tra thứ tự/màu).   |
| `GET /health`                                            | JSON `{ok, base, num, cols, serpentine, ip}`.     |

Client web: [`web2/shared/web2-putwall.js`](../../web2/shared/web2-putwall.js) (`window.Web2PutWall`).
