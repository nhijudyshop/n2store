// #Note: Đọc CLAUDE.md trước khi sửa. | WEB2.0 — Put-to-light controller (ESP32 + WS2812/WS2811).
// =====================================================================
// PUT-WALL LED — đèn chỉ ô kệ cho trang "Quét tem" (web2/unit-scan).
// Trang quét gửi GET /stt?n=<STT toàn cục> → controller sáng đúng LED của ô đó.
// 1 controller phụ trách 1 dải STT liên tiếp (STT_BASE … STT_BASE+NUM_LEDS-1).
// Nhiều kệ → flash nhiều ESP32, mỗi con đặt STT_BASE khác nhau; trang gửi cho TẤT CẢ,
// con nào trúng dải mới sáng.
//
// Lib (Arduino IDE → Library Manager): "FastLED".
// Board: "ESP32 Dev Module" (cài ESP32 core của Espressif qua Boards Manager).
// Tài liệu đầy đủ + sơ đồ nối + mua gì: docs/web2/PUTWALL-LED-SETUP.md
// =====================================================================
#include <WiFi.h>
#include <WebServer.h>
#include <FastLED.h>

// ─── CẤU HÌNH — SỬA Ở ĐÂY ───────────────────────────────────────────
#define WIFI_SSID   "TEN_WIFI_SHOP"     // ⚠ đổi: tên WiFi (2.4GHz — ESP32 KHÔNG vào 5GHz)
#define WIFI_PASS   "MAT_KHAU_WIFI"     // ⚠ đổi: mật khẩu WiFi

#define LED_PIN     13                  // chân DATA ra LED (GPIO13 an toàn). Đổi nếu cần.
#define NUM_LEDS    90                  // SỐ Ô controller này phụ trách (vd 1 kệ = 90 ô)
#define STT_BASE    1                   // STT TOÀN CỤC của LED đầu tiên. Kệ 1 → 1; Kệ 2 → 91; Kệ K → (K-1)*90+1
#define COLS        15                  // số CỘT mỗi kệ (để map zig-zag). Theo sơ đồ kệ = 15.
#define SERPENTINE  true                // true nếu dải LED đi ZIG-ZAG (hàng lẻ trái→phải, hàng chẵn phải→trái)
#define LED_TYPE    WS2812B             // hoặc WS2811 (đổi cho đúng loại LED đã mua)
#define COLOR_ORDER GRB                 // WS2812B thường GRB; WS2811 thường RGB/BRG — thử /test nếu sai màu

#define MAX_LEDS    300                 // trần mảng (đủ cho tới 3 kệ/1 con). Tăng nếu 1 con ôm nhiều kệ.

CRGB leds[MAX_LEDS];
WebServer server(80);
uint8_t  curBright = 160;              // độ sáng mặc định (0-255)
unsigned long offAt = 0;              // mốc tự tắt (0 = không tự tắt)

// STT toàn cục → chỉ số LED VẬT LÝ (xử lý zig-zag). -1 nếu không thuộc controller này.
int sttToLed(long stt) {
  long local = stt - STT_BASE;        // 0-based trong controller
  if (local < 0 || local >= NUM_LEDS) return -1;
  if (!SERPENTINE) return (int)local;
  long row = local / COLS;
  long col = local % COLS;
  if (row & 1) col = (COLS - 1) - col; // hàng lẻ đảo chiều
  long phys = row * COLS + col;
  return (phys < NUM_LEDS) ? (int)phys : (int)local;
}

void cors() { server.sendHeader("Access-Control-Allow-Origin", "*"); }
void allOff() { fill_solid(leds, MAX_LEDS, CRGB::Black); FastLED.show(); offAt = 0; }

CRGB parseHex(const String& h, CRGB def) {
  String s = h; s.replace("#", "");
  if (s.length() < 6) return def;
  long v = strtol(s.substring(0, 6).c_str(), nullptr, 16);
  return CRGB((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
}

// GET /stt?n=<STT>&c=RRGGBB&b=0-255&ms=<tự tắt ms>&keep=1
//  - mặc định: tắt hết rồi sáng 1 ô (chế độ "1 đích" — đặt xong quét tiếp).
//  - keep=1: GIỮ các ô đang sáng, cộng thêm ô mới (sáng cả "sấp" cùng SP).
void handleStt() {
  cors();
  if (!server.hasArg("n")) { server.send(400, "text/plain", "missing n"); return; }
  long stt = server.arg("n").toInt();
  int idx = sttToLed(stt);
  bool keep = server.hasArg("keep") && server.arg("keep") == "1";
  if (server.hasArg("b")) curBright = (uint8_t)constrain(server.arg("b").toInt(), 0, 255);
  CRGB col = parseHex(server.hasArg("c") ? server.arg("c") : "1AFF5A", CRGB(0x1A, 0xFF, 0x5A));
  long ms = server.hasArg("ms") ? server.arg("ms").toInt() : 0;

  if (!keep) fill_solid(leds, MAX_LEDS, CRGB::Black);
  if (idx >= 0) leds[idx] = col;        // không trúng dải → chỉ tắt (nếu !keep), không lỗi
  FastLED.setBrightness(curBright);
  FastLED.show();
  offAt = (ms > 0) ? millis() + ms : 0;

  String body = String("{\"ok\":true,\"stt\":") + stt + ",\"led\":" + idx +
                ",\"hit\":" + (idx >= 0 ? "true" : "false") + "}";
  server.send(200, "application/json", body);
}

void handleClear() { cors(); allOff(); server.send(200, "application/json", "{\"ok\":true}"); }

void handleTest() { // chạy 1 vòng để kiểm tra thứ tự + màu (xanh chạy 1→cuối)
  cors();
  for (int i = 0; i < NUM_LEDS; i++) {
    fill_solid(leds, MAX_LEDS, CRGB::Black);
    leds[sttToLed(STT_BASE + i)] = CRGB(0x1A, 0xFF, 0x5A);
    FastLED.setBrightness(curBright); FastLED.show(); delay(40);
  }
  allOff();
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleHealth() {
  cors();
  String b = String("{\"ok\":true,\"base\":") + STT_BASE + ",\"num\":" + NUM_LEDS +
             ",\"cols\":" + COLS + ",\"serpentine\":" + (SERPENTINE ? "true" : "false") +
             ",\"ip\":\"" + WiFi.localIP().toString() + "\"}";
  server.send(200, "application/json", b);
}

void handleRoot() {
  cors();
  String h = "<h2>Put-wall ESP32</h2><p>IP: " + WiFi.localIP().toString() +
             "</p><p>STT " + STT_BASE + ".." + (STT_BASE + NUM_LEDS - 1) +
             " (" + NUM_LEDS + " ô)</p>"
             "<p><a href='/test'>/test</a> · <a href='/clear'>/clear</a> · <a href='/health'>/health</a></p>";
  server.send(200, "text/html", h);
}

void setup() {
  Serial.begin(115200);
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, MAX_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.setBrightness(curBright);
  allOff();

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi");
  unsigned long t0 = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - t0 < 30000) { delay(400); Serial.print("."); }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("IP: "); Serial.println(WiFi.localIP());
    // báo "sẵn sàng": chớp xanh 2 cái
    for (int k = 0; k < 2; k++) { leds[0] = CRGB::Green; FastLED.show(); delay(150); leds[0] = CRGB::Black; FastLED.show(); delay(150); }
  } else {
    Serial.println("WiFi FAIL — kiểm tra SSID/PASS (2.4GHz)");
    leds[0] = CRGB::Red; FastLED.show();
  }

  server.on("/", handleRoot);
  server.on("/stt", handleStt);
  server.on("/clear", handleClear);
  server.on("/test", handleTest);
  server.on("/health", handleHealth);
  server.onNotFound([]() { cors(); server.send(404, "text/plain", "nope"); });
  server.begin();
}

void loop() {
  server.handleClient();
  if (offAt && millis() > offAt) allOff();
}
