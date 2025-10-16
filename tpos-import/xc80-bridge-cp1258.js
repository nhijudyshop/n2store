/**
 * XP-K200L Print Bridge Server v5.0
 * Hỗ trợ CP1258 (Windows-1258) cho tiếng Việt có dấu
 * 
 * Cách chạy:
 * npm install express body-parser cors iconv-lite
 * node xpk200l-bridge-cp1258.js
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const net = require('net');
const iconv = require('iconv-lite');

const app = express();
const PORT = 9100;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// ESC/POS Constants
const ESC = '\x1B';
const GS = '\x1D';

/**
 * CP1258 Encoding Map (Unicode → Windows-1258)
 */
const CP1258_MAP = {
  // Lowercase vowels
  'à': '\xE0', 'á': '\xE1', 'ả': '\xE3', 'ã': '\xE3', 'ạ': '\xE1',
  'ằ': '\xE0', 'ắ': '\xE1', 'ẳ': '\xE3', 'ẵ': '\xE3', 'ặ': '\xE1',
  'è': '\xE8', 'é': '\xE9', 'ẻ': '\xEB', 'ẽ': '\xEB', 'ẹ': '\xE9',
  'ì': '\xEC', 'í': '\xED', 'ỉ': '\xEF', 'ĩ': '\xEF', 'ị': '\xED',
  'ò': '\xF2', 'ó': '\xF3', 'ỏ': '\xF5', 'õ': '\xF5', 'ọ': '\xF3',
  'ù': '\xF9', 'ú': '\xFA', 'ủ': '\xFC', 'ũ': '\xFC', 'ụ': '\xFA',
  'ỳ': '\xFD', 'ý': '\xFD', 'ỷ': '\xFF', 'ỹ': '\xFF', 'ỵ': '\xFD',
  
  // Special characters
  'đ': '\xF0', 'Đ': '\xD0',
  
  // Uppercase vowels  
  'À': '\xC0', 'Á': '\xC1', 'Ả': '\xC3', 'Ã': '\xC3', 'Ạ': '\xC1',
  'È': '\xC8', 'É': '\xC9', 'Ẻ': '\xCB', 'Ẽ': '\xCB', 'Ẹ': '\xC9',
  'Ì': '\xCC', 'Í': '\xCD', 'Ỉ': '\xCF', 'Ĩ': '\xCF', 'Ị': '\xCD',
  'Ò': '\xD2', 'Ó': '\xD3', 'Ỏ': '\xD5', 'Õ': '\xD5', 'Ọ': '\xD3',
  'Ù': '\xD9', 'Ú': '\xDA', 'Ủ': '\xDC', 'Ũ': '\xDC', 'Ụ': '\xDA',
  'Ỳ': '\xDD', 'Ý': '\xDD', 'Ỷ': '\xDF', 'Ỹ': '\xDF', 'Ỵ': '\xDD'
};

/**
 * Chuyển Unicode sang CP1258
 */
function convertToCP1258(text) {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    result += CP1258_MAP[char] || char;
  }
  return result;
}

/**
 * Bỏ dấu tiếng Việt
 */
function removeVietnameseTones(str) {
  const tones = {
    'à': 'a', 'á': 'a', 'ả': 'a', 'ã': 'a', 'ạ': 'a',
    'ă': 'a', 'ằ': 'a', 'ắ': 'a', 'ẳ': 'a', 'ẵ': 'a', 'ặ': 'a',
    'â': 'a', 'ầ': 'a', 'ấ': 'a', 'ẩ': 'a', 'ẫ': 'a', 'ậ': 'a',
    'đ': 'd',
    'è': 'e', 'é': 'e', 'ẻ': 'e', 'ẽ': 'e', 'ẹ': 'e',
    'ê': 'e', 'ề': 'e', 'ế': 'e', 'ể': 'e', 'ễ': 'e', 'ệ': 'e',
    'ì': 'i', 'í': 'i', 'ỉ': 'i', 'ĩ': 'i', 'ị': 'i',
    'ò': 'o', 'ó': 'o', 'ỏ': 'o', 'õ': 'o', 'ọ': 'o',
    'ô': 'o', 'ồ': 'o', 'ố': 'o', 'ổ': 'o', 'ỗ': 'o', 'ộ': 'o',
    'ơ': 'o', 'ờ': 'o', 'ớ': 'o', 'ở': 'o', 'ỡ': 'o', 'ợ': 'o',
    'ù': 'u', 'ú': 'u', 'ủ': 'u', 'ũ': 'u', 'ụ': 'u',
    'ư': 'u', 'ừ': 'u', 'ứ': 'u', 'ử': 'u', 'ữ': 'u', 'ự': 'u',
    'ỳ': 'y', 'ý': 'y', 'ỷ': 'y', 'ỹ': 'y', 'ỵ': 'y',
    'À': 'A', 'Á': 'A', 'Ả': 'A', 'Ã': 'A', 'Ạ': 'A',
    'Ă': 'A', 'Ằ': 'A', 'Ắ': 'A', 'Ẳ': 'A', 'Ẵ': 'A', 'Ặ': 'A',
    'Â': 'A', 'Ầ': 'A', 'Ấ': 'A', 'Ẩ': 'A', 'Ẫ': 'A', 'Ậ': 'A',
    'Đ': 'D',
    'È': 'E', 'É': 'E', 'Ẻ': 'E', 'Ẽ': 'E', 'Ẹ': 'E',
    'Ê': 'E', 'Ề': 'E', 'Ế': 'E', 'Ể': 'E', 'Ễ': 'E', 'Ệ': 'E',
    'Ì': 'I', 'Í': 'I', 'Ỉ': 'I', 'Ĩ': 'I', 'Ị': 'I',
    'Ò': 'O', 'Ó': 'O', 'Ỏ': 'O', 'Õ': 'O', 'Ọ': 'O',
    'Ô': 'O', 'Ồ': 'O', 'Ố': 'O', 'Ổ': 'O', 'Ỗ': 'O', 'Ộ': 'O',
    'Ơ': 'O', 'Ờ': 'O', 'Ớ': 'O', 'Ở': 'O', 'Ỡ': 'O', 'Ợ': 'O',
    'Ù': 'U', 'Ú': 'U', 'Ủ': 'U', 'Ũ': 'U', 'Ụ': 'U',
    'Ư': 'U', 'Ừ': 'U', 'Ứ': 'U', 'Ử': 'U', 'Ữ': 'U', 'Ự': 'U',
    'Ỳ': 'Y', 'Ý': 'Y', 'Ỷ': 'Y', 'Ỹ': 'Y', 'Ỵ': 'Y'
  };
  
  return str.split('').map(char => tones[char] || char).join('');
}

/**
 * Tạo ESC/POS commands
 */
function buildESCPOS(content, options = {}) {
  const {
    mode = 'cp1258', // 'cp1258', 'no-accents', 'utf8'
    align = 'left',
    feeds = 3
  } = options;
  
  const commands = [];
  
  // Initialize
  commands.push(Buffer.from([0x1B, 0x40])); // ESC @
  
  // Set Code Page based on mode
  if (mode === 'cp1258') {
    commands.push(Buffer.from([0x1B, 0x74, 0x1E])); // ESC t 30 (CP1258)
    content = convertToCP1258(content);
  } else if (mode === 'no-accents') {
    commands.push(Buffer.from([0x1B, 0x74, 0x00])); // ESC t 0 (PC437)
    content = removeVietnameseTones(content);
  } else if (mode === 'utf8') {
    commands.push(Buffer.from([0x1B, 0x74, 0x10])); // ESC t 16 (UTF-8)
  }
  
  // Alignment
  const alignCode = { left: 0x00, center: 0x01, right: 0x02 }[align] || 0x00;
  commands.push(Buffer.from([0x1B, 0x61, alignCode]));
  
  // Content
  commands.push(Buffer.from(content, 'binary'));
  
  // Paper feed
  if (feeds > 0) {
    commands.push(Buffer.from([0x1B, 0x64, feeds]));
  }
  
  // Cut paper
  commands.push(Buffer.from([0x1D, 0x56, 0x00]));
  
  return Buffer.concat(commands);
}

/**
 * Gửi data đến máy in
 */
async function sendToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({ host: ip, port, timeout: 5000 }, () => {
      client.write(data, (err) => {
        if (err) reject(err);
        else {
          setTimeout(() => {
            client.end();
            resolve();
          }, 500);
        }
      });
    });
    
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Connection timeout'));
    });
    
    client.on('error', reject);
  });
}

// ==================== API ENDPOINTS ====================

/**
 * Health check
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '5.0',
    printer: 'XP-K200L',
    encoding: 'CP1258',
    timestamp: new Date().toISOString()
  });
});

/**
 * Test connection
 */
app.post('/printers/test', async (req, res) => {
  const { ipAddress, port = 9100 } = req.body;
  
  if (!ipAddress) {
    return res.status(400).json({ success: false, error: 'Missing IP address' });
  }
  
  try {
    const testData = buildESCPOS('Test connection OK\n', { feeds: 2 });
    await sendToPrinter(ipAddress, port, testData);
    
    res.json({
      success: true,
      message: 'Printer connected successfully',
      printer: `${ipAddress}:${port}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Print content
 */
app.post('/print', async (req, res) => {
  const { ipAddress, port = 9100, content, options = {} } = req.body;
  
  if (!ipAddress || !content) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: ipAddress, content'
    });
  }
  
  try {
    const escposData = buildESCPOS(content, options);
    await sendToPrinter(ipAddress, port, escposData);
    
    res.json({
      success: true,
      message: 'Print job sent successfully',
      jobID: Date.now().toString(36),
      encoding: options.mode || 'cp1258',
      printer: `${ipAddress}:${port}`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// 🆕 ROUTE MỚI: IN BITMAP (CHO TEXT TO IMAGE)
// ============================================
app.post('/print/bitmap', async (req, res) => {
  const { ipAddress, port, bitmapBase64, feeds = 3 } = req.body;

  if (!ipAddress || !port || !bitmapBase64) {
    return res.status(400).json({ 
      success: false, 
      error: 'Missing ipAddress, port, or bitmapBase64' 
    });
  }

  console.log(`\n🖼️ Bitmap print request:`);
  console.log(`   - Target: ${ipAddress}:${port}`);
  console.log(`   - Bitmap size: ${bitmapBase64.length} bytes (base64)`);

  try {
    const client = new net.Socket();
    client.setTimeout(5000);

    await new Promise((resolve, reject) => {
      client.connect(port, ipAddress, () => {
        console.log(`✅ Connected to ${ipAddress}:${port}`);

        const commands = [];
        
        // ESC @ - Initialize printer
        commands.push(Buffer.from([0x1B, 0x40]));
        
        // Decode base64 → Buffer
        const bitmapBuffer = Buffer.from(bitmapBase64, 'base64');
        console.log(`📦 Decoded bitmap: ${bitmapBuffer.length} bytes`);
        
        // Add bitmap data
        commands.push(bitmapBuffer);
        
        // Add line feeds
        commands.push(Buffer.from('\n'.repeat(feeds)));
        
        const finalBuffer = Buffer.concat(commands);
        console.log(`📤 Sending ${finalBuffer.length} bytes to printer`);
        
        client.write(finalBuffer, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });

      client.on('error', reject);
      client.on('timeout', () => {
        client.destroy();
        reject(new Error('Connection timeout'));
      });
    });

    client.end();
    
    res.json({ 
      success: true,
      message: 'Bitmap sent to printer successfully' 
    });

  } catch (error) {
    console.error('❌ Bitmap print error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Print bill (legacy support)
 */
app.post('/print-bill', async (req, res) => {
  const { billData, printer } = req.body;
  
  if (!billData || !printer) {
    return res.status(400).json({
      success: false,
      error: 'Missing billData or printer config'
    });
  }
  
  try {
    // Format bill content
    let content = '\n\n';
    content += `#${billData.sessionIndex} - ${billData.phone || 'Chua co SDT'}\n`;
    content += `${billData.customerName}\n`;
    content += `${billData.productCode} - ${billData.productName}\n`;
    if (billData.comment) {
      content += `"${billData.comment}"\n`;
    }
    content += `\n${new Date(billData.createdTime).toLocaleString('vi-VN')}\n`;
    
    const escposData = buildESCPOS(content, { mode: 'cp1258', align: 'center', feeds: 3 });
    await sendToPrinter(printer.ipAddress, printer.port, escposData);
    
    res.json({
      success: true,
      message: `Đã in qua ${printer.name}`
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log('║                                                               ║');
  console.log('║        XP-K200L Print Bridge v5.0 - CP1258                   ║');
  console.log('║        Server running on port ' + PORT + '                          ║');
  console.log('║                                                               ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');
  console.log('✅ Server is ready to accept connections!');
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`\n📖 Endpoints:`);
  console.log(`   POST /print              - In nội dung text`);
  console.log(`   POST /printers/test      - Test kết nối`);
  console.log(`   POST /print-bill         - In hóa đơn\n`);
  console.log(`🔧 Encoding modes:`);
  console.log(`   • cp1258 (mặc định)     - Tiếng Việt có dấu`);
  console.log(`   • no-accents            - Bỏ dấu (dự phòng)`);
  console.log(`   • utf8                  - UTF-8 (thử nghiệm)\n`);
});
