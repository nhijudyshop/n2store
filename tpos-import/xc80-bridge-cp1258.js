/**
 * XC80 Print Bridge Server v7.1 - VIETNAMESE PDF SUPPORT
 * Hỗ trợ CP1258 (Windows-1258) cho tiếng Việt có dấu
 * Hỗ trợ in BITMAP từ canvas
 * Hỗ trợ in PDF với tiếng Việt
 *
 * Cách chạy:
 * npm install
 * node xc80-bridge-cp1258.js
 */

const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const net = require("net");
const iconv = require("iconv-lite");
const fs = require("fs").promises;
const fsSync = require("fs");
const path = require("path");
const { promisify } = require("util");
const { exec } = require("child_process");
const execAsync = promisify(exec);

// Thư viện xử lý hình ảnh và PDF
const sharp = require("sharp");
const pdfParse = require("pdf-parse");

const app = express();
const PORT = 9100;
const TEMP_DIR = path.join(__dirname, "temp");

// Tạo thư mục temp nếu chưa có
if (!fsSync.existsSync(TEMP_DIR)) {
  fsSync.mkdirSync(TEMP_DIR, { recursive: true });
}

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.raw({ type: "application/octet-stream", limit: "50mb" }));

// ESC/POS Constants
const ESC = "\x1B";
const GS = "\x1D";

/**
 * CP1258 Encoding Map (Unicode → Windows-1258)
 */
const CP1258_MAP = {
  // Lowercase vowels
  à: "\xE0", á: "\xE1", ả: "\xE3", ã: "\xE3", ạ: "\xE1",
  ằ: "\xE0", ắ: "\xE1", ẳ: "\xE3", ẵ: "\xE3", ặ: "\xE1",
  è: "\xE8", é: "\xE9", ẻ: "\xEB", ẽ: "\xEB", ẹ: "\xE9",
  ề: "\xE8", ế: "\xE9", ể: "\xEB", ễ: "\xEB", ệ: "\xE9",
  ì: "\xEC", í: "\xED", ỉ: "\xEF", ĩ: "\xEF", ị: "\xED",
  ò: "\xF2", ó: "\xF3", ỏ: "\xF5", õ: "\xF5", ọ: "\xF3",
  ồ: "\xF2", ố: "\xF3", ổ: "\xF5", ỗ: "\xF5", ộ: "\xF3",
  ờ: "\xF2", ớ: "\xF3", ở: "\xF5", ỡ: "\xF5", ợ: "\xF3",
  ù: "\xF9", ú: "\xFA", ủ: "\xFC", ũ: "\xFC", ụ: "\xFA",
  ừ: "\xF9", ứ: "\xFA", ử: "\xFC", ữ: "\xFC", ự: "\xFA",
  ỳ: "\xFD", ý: "\xFD", ỷ: "\xFF", ỹ: "\xFF", ỵ: "\xFD",
  đ: "\xF0", Đ: "\xD0",
  // Uppercase vowels
  À: "\xC0", Á: "\xC1", Ả: "\xC3", Ã: "\xC3", Ạ: "\xC1",
  È: "\xC8", É: "\xC9", Ẻ: "\xCB", Ẽ: "\xCB", Ẹ: "\xC9",
  Ì: "\xCC", Í: "\xCD", Ỉ: "\xCF", Ĩ: "\xCF", Ị: "\xCD",
  Ò: "\xD2", Ó: "\xD3", Ỏ: "\xD5", Õ: "\xD5", Ọ: "\xD3",
  Ù: "\xD9", Ú: "\xDA", Ủ: "\xDC", Ũ: "\xDC", Ụ: "\xDA",
  Ỳ: "\xDD", Ý: "\xDD", Ỷ: "\xDF", Ỹ: "\xDF", Ỵ: "\xDD",
};

/**
 * Chuyển Unicode sang CP1258
 */
function convertToCP1258(text) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += CP1258_MAP[char] || char;
  }
  return result;
}

/**
 * Kiểm tra xem hệ thống có pdftoppm không
 */
async function checkPdftoppmAvailable() {
  try {
    await execAsync("pdftoppm -v");
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Extract text từ PDF
 */
async function extractPdfText(pdfBuffer) {
  try {
    const data = await pdfParse(pdfBuffer);
    return data.text;
  } catch (error) {
    console.warn("Cannot extract text from PDF:", error.message);
    return null;
  }
}

/**
 * Convert PDF to ESC/POS bitmap using pdftoppm + sharp
 * Có hỗ trợ font tiếng Việt tốt hơn
 */
async function pdfToESCPOSBitmap(pdfBuffer, options = {}) {
  const { 
    dpi = 300, 
    threshold = 115, 
    width = 944,
    fontPath = null // Đường dẫn đến font tiếng Việt nếu cần
  } = options;
  
  const timestamp = Date.now();
  const pdfPath = path.join(TEMP_DIR, `temp_${timestamp}.pdf`);
  const outputPrefix = path.join(TEMP_DIR, `output_${timestamp}`);
  
  try {
    // Step 1: Save PDF buffer to file
    await fs.writeFile(pdfPath, pdfBuffer);
    
    // Step 2: Convert PDF to PNG với options hỗ trợ font tốt hơn
    console.log(`📄 Converting PDF to PNG (DPI: ${dpi})...`);
    
    // Tạo command với options tốt hơn cho tiếng Việt
    let command = `pdftoppm -r ${dpi} -png`;
    
    // Thêm antialiasing để text mượt hơn
    command += ` -aa yes -aaVector yes`;
    
    command += ` "${pdfPath}" "${outputPrefix}"`;
    
    console.log(`🔧 Command: ${command}`);
    await execAsync(command);
    
    // Step 3: Find generated PNG file
    const pngPath = `${outputPrefix}-1.png`;
    if (!fsSync.existsSync(pngPath)) {
      throw new Error('PDF conversion failed - no output file generated');
    }
    
    // Step 4: Process image với sharp
    console.log(`🖼️ Processing image (width: ${width}px, threshold: ${threshold})...`);
    let img = sharp(pngPath);
    
    // Get metadata
    const metadata = await img.metadata();
    console.log(`📏 Original size: ${metadata.width}x${metadata.height}px`);
    
    // Resize if necessary
    if (metadata.width > width) {
      img = img.resize(width, null, {
        kernel: 'lanczos3',
        fit: 'inside'
      });
    }
    
    // Enhance và convert to monochrome với settings tốt hơn cho text
    const processedBuffer = await img
      .greyscale()
      .sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 })
      .normalise()
      .threshold(threshold)
      .toFormat('png')
      .toBuffer();
    
    // Step 5: Get raw pixel data
    const { data: imageData, info } = await sharp(processedBuffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    
    console.log(`✅ Final size: ${info.width}x${info.height}px`);
    
    // Step 6: Convert to ESC/POS format
    const escposData = encodeImageToESCPOS(imageData, info.width, info.height);
    
    // Cleanup temp files
    try {
      await fs.unlink(pdfPath);
      await fs.unlink(pngPath);
    } catch (e) {
      console.warn('Warning: Could not delete temp files:', e.message);
    }
    
    return escposData;
    
  } catch (error) {
    // Cleanup on error
    try {
      await fs.unlink(pdfPath).catch(() => {});
      const pngPath = `${outputPrefix}-1.png`;
      await fs.unlink(pngPath).catch(() => {});
    } catch (e) {}
    
    throw new Error(`PDF to ESC/POS conversion failed: ${error.message}`);
  }
}

/**
 * Encode image buffer to ESC/POS bitmap commands (GS v 0 format)
 */
function encodeImageToESCPOS(imageData, width, height) {
  const commands = [];
  
  // Initialize printer
  commands.push(Buffer.from([0x1B, 0x40])); // ESC @ - Initialize
  
  // Center alignment
  commands.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1 - Center
  
  // Calculate bitmap dimensions
  const widthBytes = Math.ceil(width / 8);
  const xL = widthBytes & 0xFF;
  const xH = (widthBytes >> 8) & 0xFF;
  const yL = height & 0xFF;
  const yH = (height >> 8) & 0xFF;
  
  // GS v 0 - Print raster bitmap
  commands.push(Buffer.from([0x1D, 0x76, 0x30, 0x00, xL, xH, yL, yH]));
  
  // Convert pixels to bitmap (1 bit per pixel)
  const bitmapData = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < widthBytes; x++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const pixelX = x * 8 + bit;
        if (pixelX < width) {
          const pixelIndex = (y * width + pixelX) * (imageData.length / (width * height));
          const pixelValue = imageData[Math.floor(pixelIndex)];
          
          // Black pixel = 1, White pixel = 0
          if (pixelValue < 128) {
            byte |= (1 << (7 - bit));
          }
        }
      }
      bitmapData.push(byte);
    }
  }
  
  commands.push(Buffer.from(bitmapData));
  
  // Left align for next commands
  commands.push(Buffer.from([0x1B, 0x61, 0x00])); // ESC a 0 - Left
  
  // Feed paper
  commands.push(Buffer.from([0x1B, 0x64, 3])); // ESC d 3 - Feed 3 lines
  
  // Cut paper
  commands.push(Buffer.from([0x1D, 0x56, 0x00])); // GS V 0 - Full cut
  
  return Buffer.concat(commands);
}

/**
 * Gửi data đến máy in qua network
 */
async function sendToPrinter(printerIp, printerPort, data) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(
      {
        host: printerIp,
        port: printerPort,
        timeout: 10000,
      },
      () => {
        client.write(data, (err) => {
          if (err) {
            reject(err);
          } else {
            setTimeout(() => {
              client.end();
              resolve();
            }, 500);
          }
        });
      }
    );

    client.on("timeout", () => {
      client.destroy();
      reject(new Error("Connection timeout"));
    });

    client.on("error", (err) => {
      reject(err);
    });
  });
}

// ============================================
// API ENDPOINTS
// ============================================

/**
 * Bitmap printing endpoint (ESC/POS bitmap format)
 */
app.post('/print/bitmap', async (req, res) => {
  try {
    const { printerIp, printerPort, bitmapData } = req.body;

    if (!printerIp || !printerPort || !bitmapData) {
      return res.status(400).json({ 
        error: 'Missing required fields: printerIp, printerPort, bitmapData' 
      });
    }

    console.log(`📄 Printing ESC/POS bitmap to ${printerIp}:${printerPort}`);
    console.log(`Bitmap size: ${bitmapData.length} bytes`);

    const uint8Data = new Uint8Array(bitmapData);
    await sendToPrinter(printerIp, printerPort, uint8Data);

    res.json({ 
      success: true, 
      message: 'ESC/POS bitmap sent to printer',
      bytesTransferred: uint8Data.length
    });

  } catch (error) {
    console.error('❌ Bitmap print error:', error.message);
    res.status(500).json({ 
      error: error.message,
      details: 'Failed to print ESC/POS bitmap'
    });
  }
});

/**
 * Health check
 */
app.get("/health", async (req, res) => {
  const hasPdftoppm = await checkPdftoppmAvailable();
  
  res.json({
    status: "OK",
    version: "7.1",
    features: ["text", "bitmap", "pdf", "vietnamese"],
    pdftoppm: hasPdftoppm ? "available" : "not installed",
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /print/pdf - In file PDF với hỗ trợ tiếng Việt
 * Body: {
 *   printerIp: "192.168.1.100",
 *   printerPort: 9100,
 *   pdfBase64: "base64_encoded_pdf_data",
 *   dpi: 300 (optional),
 *   threshold: 115 (optional, 0-255),
 *   width: 944 (optional, pixels for 80mm @ 300 DPI),
 *   mode: "bitmap" | "text" | "auto" (optional, default "auto")
 * }
 */
app.post("/print/pdf", async (req, res) => {
  try {
    const { 
      printerIp, 
      printerPort = 9100, 
      pdfBase64, 
      dpi = 300, 
      threshold = 115, 
      width = 944,
      mode = "auto" // "bitmap", "text", or "auto"
    } = req.body;

    if (!printerIp || !pdfBase64) {
      return res.status(400).json({
        error: "Missing required fields: printerIp, pdfBase64",
      });
    }

    console.log(`\n📄 [PDF Print Request]`);
    console.log(`   Printer: ${printerIp}:${printerPort}`);
    console.log(`   Mode: ${mode}`);

    // Decode base64 PDF
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    console.log(`   PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);

    // Check if we should try text mode
    let useBitmap = mode === "bitmap";
    let pdfText = null;
    
    if (mode === "auto" || mode === "text") {
      console.log(`   🔍 Extracting text from PDF...`);
      pdfText = await extractPdfText(pdfBuffer);
      
      if (pdfText && pdfText.trim().length > 0) {
        console.log(`   ✅ Found ${pdfText.length} characters of text`);
        useBitmap = mode === "bitmap"; // Only use bitmap if explicitly requested
      } else {
        console.log(`   ℹ️ No extractable text, using bitmap mode`);
        useBitmap = true;
      }
    }

    let escposData;
    
    if (!useBitmap && pdfText) {
      // Text mode - in text trực tiếp với CP1258
      console.log(`   📝 Using text mode with CP1258 encoding`);
      
      const commands = [];
      commands.push(Buffer.from([0x1B, 0x40])); // Initialize
      commands.push(Buffer.from([0x1B, 0x74, 0x1E])); // Set CP1258
      
      const convertedText = convertToCP1258(pdfText);
      commands.push(Buffer.from(convertedText + "\n\n\n", "binary"));
      commands.push(Buffer.from([0x1D, 0x56, 0x00])); // Cut
      
      escposData = Buffer.concat(commands);
      console.log(`   ✅ Text converted: ${escposData.length} bytes`);
      
    } else {
      // Bitmap mode - convert PDF to image
      console.log(`   🖼️ Using bitmap mode`);
      console.log(`   Settings: DPI=${dpi}, Threshold=${threshold}, Width=${width}px`);
      
      escposData = await pdfToESCPOSBitmap(pdfBuffer, { dpi, threshold, width });
      console.log(`   ✅ Bitmap created: ${escposData.length} bytes`);
    }

    // Send to printer
    console.log(`   📤 Sending to printer...`);
    await sendToPrinter(printerIp, printerPort, escposData);
    console.log(`   ✅ Print job sent successfully\n`);

    res.json({
      success: true,
      message: "PDF printed successfully",
      details: {
        mode: useBitmap ? "bitmap" : "text",
        dataSize: escposData.length,
        settings: { dpi, threshold, width }
      },
    });
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
});

/**
 * POST /print/text - In text với CP1258
 */
app.post("/print/text", async (req, res) => {
  try {
    const { printerIp, printerPort = 9100, text, encoding = "cp1258" } = req.body;

    if (!printerIp || !text) {
      return res.status(400).json({
        error: "Missing required fields: printerIp, text",
      });
    }

    console.log(`\n📝 [Text Print Request]`);
    console.log(`   Printer: ${printerIp}:${printerPort}`);
    console.log(`   Encoding: ${encoding}`);

    // Build ESC/POS commands
    const commands = [];
    commands.push(Buffer.from([0x1B, 0x40])); // Initialize

    // Set code page to CP1258
    if (encoding === "cp1258") {
      commands.push(Buffer.from([0x1B, 0x74, 0x1E])); // ESC t 30
    }

    // Convert text
    const convertedText = encoding === "cp1258" ? convertToCP1258(text) : text;
    commands.push(Buffer.from(convertedText + "\n\n\n", "binary"));
    commands.push(Buffer.from([0x1D, 0x56, 0x00])); // Cut

    const escposData = Buffer.concat(commands);
    await sendToPrinter(printerIp, printerPort, escposData);
    
    console.log(`   ✅ Text printed successfully\n`);

    res.json({
      success: true,
      message: "Text printed successfully",
    });
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}\n`);
    res.status(500).json({
      error: error.message,
    });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, async () => {
  const hasPdftoppm = await checkPdftoppmAvailable();
  
  console.log(`\n╔═══════════════════════════════════════════════════════════╗`);
  console.log(`║   XC80 Print Bridge v7.1 - VIETNAMESE PDF SUPPORT        ║`);
  console.log(`╚═══════════════════════════════════════════════════════════╝\n`);
  console.log(`🌐 Server running on port ${PORT}`);
  console.log(`📡 Endpoints:`);
  console.log(`   GET  /health           - Health check`);
  console.log(`   POST /print/pdf        - Print PDF (Vietnamese support)`);
  console.log(`   POST /print/text       - Print text (CP1258)`);
  console.log(`   POST /print/bitmap     - Print bitmap from canvas\n`);
  console.log(`🔧 System Status:`);
  console.log(`   pdftoppm: ${hasPdftoppm ? '✅ Available' : '❌ Not installed'}`);
  
  if (!hasPdftoppm) {
    console.log(`\n⚠️  WARNING: pdftoppm not found!`);
    console.log(`   📦 Install poppler-utils:`);
    console.log(`   • Ubuntu/Debian: sudo apt-get install poppler-utils`);
    console.log(`   • macOS: brew install poppler`);
    console.log(`   • Windows: Download from https://blog.alivate.com.au/poppler-windows/\n`);
  }
  
  console.log(`\n📋 Vietnamese Font Tips:`);
  console.log(`   • Install Vietnamese fonts for better PDF rendering`);
  console.log(`   • Recommended: DejaVu, Liberation, Noto fonts`);
  console.log(`   • Ubuntu: sudo apt-get install fonts-dejavu fonts-liberation`);
  console.log(`   • PDF text mode uses CP1258 for best Vietnamese support\n`);
  console.log(`🚀 Ready to accept print jobs!`);
  console.log(`═══════════════════════════════════════════════════════════\n`);
});
