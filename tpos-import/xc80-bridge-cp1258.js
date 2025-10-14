/**
 * =====================================================
 * XC80 Print Bridge v5.0 - CP1258 Vietnamese Support
 * =====================================================
 *
 * FULL CODE - Ready to use
 *
 * Features:
 * - Full Vietnamese support with CP1258 encoding
 * - Direct TCP/IP printing to thermal printers
 * - Bill printing format
 * - Test endpoints
 *
 * Requirements:
 * - Node.js 14+
 * - Printer configured with Code Page 30 (CP1258)
 *
 * Installation:
 * 1. npm install express cors iconv-lite
 * 2. node xc80-bridge-cp1258.js
 *
 * API Endpoints:
 * - POST /print        - Print text content
 * - POST /print-bill   - Print bill format
 * - POST /printers/test - Test connection
 * - GET  /health       - Health check
 * =====================================================
 */

const express = require("express");
const cors = require("cors");
const net = require("net");
const iconv = require("iconv-lite");

const app = express();
const PORT = 9100;

// Middleware
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ESC/POS Commands
const ESC = "\x1B";
const GS = "\x1D";
const FS = "\x1C";

/**
 * Generate ESC/POS commands with CP1258 encoding
 * @param {string} content - Text content to print
 * @param {object} options - Printing options
 * @returns {string} ESC/POS command string
 */
function generateESCPOS_CP1258(content, options = {}) {
  const align = options.align || "left";
  const bold = options.bold || false;
  const doubleSize = options.doubleSize || false;
  const feeds = options.feeds || 3;

  let commands = "";

  // 1. Initialize printer
  commands += ESC + "@";

  // 2. Set Code Page 30 (CP1258) for Vietnamese
  commands += ESC + "t" + String.fromCharCode(30);

  // 3. Set alignment
  const alignCode = align === "center" ? 1 : align === "right" ? 2 : 0;
  commands += ESC + "a" + String.fromCharCode(alignCode);

  // 4. Set text style
  if (bold) {
    commands += ESC + "E" + String.fromCharCode(1);
  }

  if (doubleSize) {
    commands += GS + "!" + String.fromCharCode(0x11); // Double width + height
  }

  // 5. Add content
  commands += content;

  // 6. Reset styles
  if (bold) {
    commands += ESC + "E" + String.fromCharCode(0);
  }
  if (doubleSize) {
    commands += GS + "!" + String.fromCharCode(0);
  }

  // 7. Feed paper
  commands += ESC + "d" + String.fromCharCode(feeds);

  // 8. Cut paper (full cut)
  commands += GS + "V" + String.fromCharCode(0);

  return commands;
}

/**
 * Generate bill format ESC/POS
 * @param {object} billData - Bill information
 * @returns {string} ESC/POS command string
 */
function generateBillESCPOS(billData) {
  let commands = "";

  // Initialize
  commands += ESC + "@";

  // Set CP1258
  commands += ESC + "t" + String.fromCharCode(30);

  // Center align
  commands += ESC + "a" + String.fromCharCode(1);

  // Double size - Order number
  commands += GS + "!" + String.fromCharCode(0x11);
  commands += `#${billData.sessionIndex} - ${billData.phone || "Chưa có SĐT"}\n`;

  // Normal size + Bold - Customer name
  commands += GS + "!" + String.fromCharCode(0);
  commands += ESC + "E" + String.fromCharCode(1);
  commands += `${billData.customerName}\n`;
  commands += ESC + "E" + String.fromCharCode(0);

  // Product info
  const productName = billData.productName.replace(/^\d+\s+/, "");
  commands += `${billData.productCode} - ${productName}\n`;

  // Comment
  if (billData.comment) {
    commands += `"${billData.comment}"\n`;
  }

  // Separator
  commands += "--------------------------------\n";

  // Date/time
  const dateStr = new Date(billData.createdTime).toLocaleString("vi-VN", {
    timeZone: "Asia/Bangkok",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  commands += `${dateStr}\n`;

  // Feed and cut
  commands += ESC + "d" + String.fromCharCode(3);
  commands += GS + "V" + String.fromCharCode(0);

  return commands;
}

/**
 * Send data to printer via TCP
 * @param {string} ip - Printer IP address
 * @param {number} port - Printer port
 * @param {Buffer} data - Data to send
 * @returns {Promise}
 */
function sendToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let timeout;

    // Set connection timeout
    client.setTimeout(5000);

    client.connect(port, ip, () => {
      console.log(`✅ Connected to ${ip}:${port}`);
      client.write(data);

      // Auto-close after 2 seconds
      timeout = setTimeout(() => {
        client.end();
      }, 2000);
    });

    client.on("data", (response) => {
      console.log(
        "📥 Printer response:",
        response.toString("hex").substring(0, 100),
      );
    });

    client.on("close", () => {
      console.log("🔌 Connection closed");
      clearTimeout(timeout);
      resolve({ success: true });
    });

    client.on("timeout", () => {
      console.error("⏱️ Connection timeout");
      client.destroy();
      clearTimeout(timeout);
      reject(new Error("Connection timeout"));
    });

    client.on("error", (err) => {
      console.error("❌ Socket error:", err.message);
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// =====================================================
// API ENDPOINTS
// =====================================================

/**
 * POST /print
 * Print text content with CP1258 encoding
 */
app.post("/print", async (req, res) => {
  try {
    const { ipAddress, port, content, options } = req.body;

    // Validate input
    if (!ipAddress || !port || !content) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: ipAddress, port, content",
      });
    }

    console.log(`\n📝 Print request (CP1258):`, {
      ip: ipAddress,
      port,
      contentLength: content.length,
      options: options || {},
    });

    // Generate ESC/POS commands
    const escposCommands = generateESCPOS_CP1258(content, options);

    // Encode to CP1258 (Windows-1258)
    const buffer = iconv.encode(escposCommands, "windows-1258");

    console.log(`📦 Buffer size: ${buffer.length} bytes`);
    console.log(
      `🔤 Content preview: ${content.substring(0, 100)}${content.length > 100 ? "..." : ""}`,
    );

    // Send to printer
    await sendToPrinter(ipAddress, port, buffer);

    const jobID = `CP1258-${Date.now()}`;
    console.log(`✅ Print job ${jobID} completed successfully`);

    res.json({
      success: true,
      jobID,
      encoding: "CP1258",
      bytesWritten: buffer.length,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Print error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /print-bill
 * Print bill format with CP1258 encoding
 */
app.post("/print-bill", async (req, res) => {
  try {
    const { ipAddress, port, billData } = req.body;

    // Validate input
    if (!ipAddress || !port || !billData) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: ipAddress, port, billData",
      });
    }

    console.log(`\n🧾 Print bill (CP1258):`, {
      ip: ipAddress,
      port,
      orderNumber: billData.sessionIndex,
      customer: billData.customerName,
      product: billData.productCode,
    });

    // Generate bill ESC/POS
    const escposCommands = generateBillESCPOS(billData);

    // Encode to CP1258
    const buffer = iconv.encode(escposCommands, "windows-1258");

    console.log(`📦 Bill buffer size: ${buffer.length} bytes`);

    // Send to printer
    await sendToPrinter(ipAddress, port, buffer);

    const jobID = `BILL-${Date.now()}`;
    console.log(`✅ Bill printed successfully: ${jobID}`);

    res.json({
      success: true,
      jobID,
      encoding: "CP1258",
      billNumber: billData.sessionIndex,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Bill print error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * POST /printers/test
 * Test printer connection with Vietnamese test
 */
app.post("/printers/test", async (req, res) => {
  try {
    const { ipAddress, port } = req.body;

    // Validate input
    if (!ipAddress || !port) {
      return res.status(400).json({
        success: false,
        error: "Missing required fields: ipAddress, port",
      });
    }

    console.log(`\n🧪 Testing CP1258 on ${ipAddress}:${port}...`);

    // Test content with full Vietnamese characters
    const testContent =
      "================================\n" +
      "   TEST TIẾNG VIỆT CP1258\n" +
      "================================\n" +
      "Máy in: XC80 Thermal Printer\n" +
      "Địa chỉ: " +
      ipAddress +
      ":" +
      port +
      "\n" +
      "--------------------------------\n" +
      "Test các ký tự tiếng Việt:\n" +
      "- Xin chào Việt Nam! ✓\n" +
      "- Đây là bản in thử nghiệm\n" +
      "- áàảãạ éèẻẽẹ íìỉĩị\n" +
      "- óòỏõọ úùủũụ ýỳỷỹỵ\n" +
      "- ĂẮẰẲẴẶ ÊẾỀỂỄỆ ÔỐỒỔỖỘ\n" +
      "- ƠỚỜỞỠỢ ƯỨỪỬỮỰ Đ đ\n" +
      "- Giá: 150,000 VNĐ\n" +
      "================================\n" +
      "\n" +
      "✅ Nếu thấy chữ Việt đúng\n" +
      "   → Cấu hình CP1258 thành công!\n" +
      "\n" +
      "❌ Nếu thấy ký tự lạ\n" +
      "   → Máy in chưa hỗ trợ CP1258\n" +
      "   → Dùng mode NO-ACCENTS\n" +
      "================================\n\n";

    // Generate ESC/POS
    const escposCommands = generateESCPOS_CP1258(testContent, {
      align: "center",
      feeds: 3,
    });

    // Encode to CP1258
    const buffer = iconv.encode(escposCommands, "windows-1258");

    console.log(`📦 Test buffer size: ${buffer.length} bytes`);

    // Send to printer
    await sendToPrinter(ipAddress, port, buffer);

    console.log(`✅ Test print completed`);

    res.json({
      success: true,
      message: "Test in tiếng Việt thành công! Kiểm tra máy in.",
      encoding: "CP1258",
      testContentLength: testContent.length,
      instructions: [
        "Nếu thấy chữ Việt có dấu đúng → Máy in đã hỗ trợ CP1258",
        "Nếu thấy ký tự lạ → Cần cấu hình Code Page 30 trên máy in",
        "Hoặc dùng mode NO-ACCENTS để bỏ dấu",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      troubleshooting: [
        "Kiểm tra IP và Port có đúng không",
        "Đảm bảo máy in đã bật và kết nối mạng",
        "Ping thử IP máy in: ping " + (req.body.ipAddress || "192.168.1.100"),
        "Kiểm tra firewall có chặn port " + (req.body.port || 9100),
      ],
    });
  }
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    version: "5.0.0-CP1258",
    encoding: "CP1258 (Windows-1258)",
    features: [
      "Full Vietnamese support with diacritics",
      "Bill printing format",
      "Text formatting (bold, size, align)",
      "TCP/IP direct printing",
    ],
    endpoints: {
      "POST /print": "Print text content",
      "POST /print-bill": "Print bill format",
      "POST /printers/test": "Test connection with Vietnamese",
      "GET /health": "Health check",
    },
    requirements: [
      "Printer must support Code Page 30 (CP1258)",
      "TCP port 9100 must be accessible",
      "Network connection to printer",
    ],
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * GET /
 * Root endpoint
 */
app.get("/", (req, res) => {
  res.json({
    name: "XC80 Print Bridge",
    version: "5.0.0-CP1258",
    status: "Running",
    message: "Vietnamese thermal printer bridge with CP1258 encoding",
    documentation: {
      health: "GET /",
      test: "POST /printers/test",
      print: "POST /print",
      bill: "POST /print-bill",
    },
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║       XC80 Print Bridge v5.0 - CP1258                ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  🚀 Server Status: RUNNING                            ║
║  🌐 Port: ${PORT}                                        ║
║  📝 Encoding: CP1258 (Windows-1258)                   ║
║  🇻🇳 Vietnamese Support: FULL (with diacritics)       ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  📡 API Endpoints:                                    ║
║                                                       ║
║    GET  /health                                       ║
║         → Health check và thông tin hệ thống          ║
║                                                       ║
║    POST /print                                        ║
║         → In nội dung text với CP1258                 ║
║         → Body: { ipAddress, port, content, options } ║
║                                                       ║
║    POST /print-bill                                   ║
║         → In hóa đơn format chuẩn                     ║
║         → Body: { ipAddress, port, billData }         ║
║                                                       ║
║    POST /printers/test                                ║
║         → Test kết nối và in thử tiếng Việt          ║
║         → Body: { ipAddress, port }                   ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  ✅ Features:                                         ║
║     • Full Vietnamese characters (có dấu đầy đủ)     ║
║     • Direct TCP/IP printing                          ║
║     • Bill format printing                            ║
║     • Text formatting support                         ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  ⚙️  Requirements:                                    ║
║     • Máy in phải cấu hình Code Page 30 (CP1258)     ║
║     • Port 9100 phải accessible                       ║
║     • Network connection tới máy in                   ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  📚 Quick Test:                                       ║
║     curl http://localhost:${PORT}/health                ║
║                                                       ║
║  🔧 Configuration:                                    ║
║     Dùng XPrinter Tool để set Code Page 30            ║
║     Hoặc chạy: node config-xc80-cp1258.js             ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝

✅ Server is ready to accept connections!
📍 Listening on http://localhost:${PORT}
⏰ Started at ${new Date().toLocaleString("vi-VN")}

`);

  // Log system info
  console.log("System Information:");
  console.log("- Node.js version:", process.version);
  console.log("- Platform:", process.platform);
  console.log("- Architecture:", process.arch);
  console.log(
    "- Memory usage:",
    Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + " MB",
  );
  console.log("\n");
});
