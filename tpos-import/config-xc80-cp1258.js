/**
 * =====================================================
 * XC80 Configuration Helper - CP1258 Setup
 * =====================================================
 * 
 * FULL CODE - Ready to use
 * 
 * Purpose:
 * Configure XC80 thermal printer to use Code Page 30 (CP1258)
 * for Vietnamese character support
 * 
 * Usage:
 * node config-xc80-cp1258.js [PRINTER_IP] [PRINTER_PORT]
 * 
 * Example:
 * node config-xc80-cp1258.js 192.168.1.100 9100
 * 
 * Requirements:
 * - Node.js 14+
 * - npm install net iconv-lite
 * - Printer must be accessible via network
 * =====================================================
 */

const net = require('net');
const iconv = require('iconv-lite');

// Get command line arguments
const printerIP = process.argv[2] || '192.168.1.100';
const printerPort = parseInt(process.argv[3]) || 9100;

// ESC/POS Commands
const ESC = '\x1B';
const GS = '\x1D';

/**
 * Send data to printer
 */
function sendToPrinter(ip, port, data) {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    let timeout;
    
    console.log(`\n🔌 Connecting to ${ip}:${port}...`);
    
    // Set timeout
    client.setTimeout(10000);
    
    client.connect(port, ip, () => {
      console.log('✅ Connected successfully');
      console.log('📤 Sending configuration data...');
      
      client.write(data);
      
      // Auto-close after 3 seconds
      timeout = setTimeout(() => {
        console.log('⏱️  Waiting for printer response...');
        client.end();
      }, 3000);
    });
    
    client.on('data', (response) => {
      console.log('📥 Printer responded:', response.toString('hex').substring(0, 50));
    });
    
    client.on('close', () => {
      console.log('🔌 Connection closed');
      clearTimeout(timeout);
      resolve();
    });
    
    client.on('timeout', () => {
      console.error('⏱️  Connection timeout (10 seconds)');
      client.destroy();
      clearTimeout(timeout);
      reject(new Error('Connection timeout'));
    });
    
    client.on('error', (err) => {
      console.error('❌ Connection error:', err.message);
      clearTimeout(timeout);
      reject(err);
    });
  });
}

/**
 * Main configuration function
 */
async function configurePrinter() {
  try {
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║       XC80 CP1258 Configuration Tool                 ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Target Printer:                                      ║
║    IP: ${printerIP.padEnd(45)}║
║    Port: ${printerPort.toString().padEnd(42)}║
║                                                       ║
║  Configuration:                                       ║
║    Code Page: 30 (CP1258)                            ║
║    Language: Vietnamese                               ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  This script will:                                    ║
║    1. Initialize printer                              ║
║    2. Set Code Page 30 (CP1258)                      ║
║    3. Print Vietnamese test page                      ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
    
    // Generate configuration + test print
    let commands = '';
    
    // 1. Initialize printer
    console.log('📋 Step 1: Initializing printer...');
    commands += ESC + '@';
    
    // 2. Set Code Page 30 (CP1258) - CRITICAL
    console.log('📋 Step 2: Setting Code Page 30 (CP1258)...');
    commands += ESC + 't' + String.fromCharCode(30);
    
    // 3. Center alignment for test print
    commands += ESC + 'a' + String.fromCharCode(1);
    
    // 4. Test content with full Vietnamese characters
    console.log('📋 Step 3: Preparing test content...');
    
    const testHeader = 
      '================================\n' +
      '   TEST TIẾNG VIỆT CP1258\n' +
      '================================\n\n';
    
    const printerInfo = 
      'Máy in: XC80 Thermal Printer\n' +
      `IP: ${printerIP}:${printerPort}\n` +
      `Thời gian: ${new Date().toLocaleString('vi-VN')}\n\n`;
    
    const testChars = 
      '--------------------------------\n' +
      'TEST CÁC KÝ TỰ TIẾNG VIỆT:\n' +
      '--------------------------------\n\n' +
      '✅ Chữ thường có dấu:\n' +
      '   áàảãạ éèẻẽẹ íìỉĩị\n' +
      '   óòỏõọ úùủũụ ýỳỷỹỵ\n\n' +
      '✅ Chữ hoa có dấu:\n' +
      '   ÁÀẢÃẠ ÉÈẺẼẸ ÍÌỈĨỊ\n' +
      '   ÓÒỎÕỌ ÚÙỦŨỤ ÝỲỶỸỴ\n\n' +
      '✅ Ký tự đặc biệt:\n' +
      '   ăắằẳẵặ ĂẮẰẲẴẶ\n' +
      '   âấầẩẫậ ÂẤẦẨẪẬ\n' +
      '   êếềểễệ ÊẾỀỂỄỆ\n' +
      '   ôốồổỗộ ÔỐỒỔỖỘ\n' +
      '   ơớờởỡợ ƠỚỜỞỠỢ\n' +
      '   ưứừửữự ƯỨỪỬỮỰ\n' +
      '   đ Đ\n\n';
    
    const examples = 
      '--------------------------------\n' +
      'VÍ DỤ CÂU TIẾNG VIỆT:\n' +
      '--------------------------------\n\n' +
      '• Xin chào Việt Nam!\n' +
      '• Đây là bản in thử nghiệm.\n' +
      '• Chúc mừng năm mới!\n' +
      '• Sản phẩm chất lượng cao.\n' +
      '• Giá: 150,000 VNĐ\n' +
      '• Địa chỉ: Hà Nội, Việt Nam\n\n';
    
    const result = 
      '================================\n\n' +
      '✅ NẾU THẤY CHỮ VIỆT ĐÚNG:\n' +
      '   → Cấu hình CP1258 thành công!\n' +
      '   → Có thể in tiếng Việt có dấu\n\n' +
      '❌ NẾU THẤY KÝ TỰ LẠ:\n' +
      '   → Máy in chưa hỗ trợ CP1258\n' +
      '   → Cần cài driver mới hơn\n' +
      '   → Hoặc dùng mode NO-ACCENTS\n\n' +
      '================================\n\n';
    
    const footer = 
      'Tool: XC80 Config Helper v1.0\n' +
      `Date: ${new Date().toLocaleDateString('vi-VN')}\n` +
      '================================\n\n\n';
    
    // Combine all content
    const fullContent = testHeader + printerInfo + testChars + examples + result + footer;
    commands += fullContent;
    
    // 5. Feed paper
    commands += ESC + 'd' + String.fromCharCode(5);
    
    // 6. Cut paper
    commands += GS + 'V' + String.fromCharCode(0);
    
    // Encode to CP1258
    console.log('📋 Step 4: Encoding to CP1258...');
    const buffer = iconv.encode(commands, 'windows-1258');
    
    console.log(`\n📦 Buffer Information:`);
    console.log(`   - Total size: ${buffer.length} bytes`);
    console.log(`   - Content length: ${fullContent.length} characters`);
    console.log(`   - Encoding: Windows-1258 (CP1258)`);
    
    // Send to printer
    console.log(`\n🚀 Sending to printer...`);
    await sendToPrinter(printerIP, printerPort, buffer);
    
    console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║              ✅ CONFIGURATION COMPLETED               ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  📄 Test page has been printed!                      ║
║                                                       ║
║  📋 Next Steps:                                      ║
║                                                       ║
║  1. Check the printed test page                       ║
║                                                       ║
║  2. ✅ If Vietnamese displays correctly:             ║
║     → Configuration successful!                       ║
║     → Printer supports CP1258                         ║
║     → You can now print with full diacritics         ║
║                                                       ║
║  3. ❌ If you see weird characters:                  ║
║     → Printer does not support CP1258                ║
║     → Try updating printer firmware                   ║
║     → Or use NO-ACCENTS mode instead                 ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  🔧 Troubleshooting:                                 ║
║                                                       ║
║  • Update printer firmware:                           ║
║    http://www.xprintertech.com/download              ║
║                                                       ║
║  • Check printer settings:                            ║
║    Use XPrinter Tool to verify Code Page             ║
║                                                       ║
║  • Alternative solution:                              ║
║    Use NO-ACCENTS mode (removes diacritics)          ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
    
    process.exit(0);
    
  } catch (error) {
    console.error(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║              ❌ CONFIGURATION FAILED                  ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Error: ${error.message.padEnd(46)}║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  💡 Troubleshooting:                                 ║
║                                                       ║
║  1. Check printer IP address:                         ║
║     • Is ${printerIP} correct?            ║
║     • Try: ping ${printerIP}              ║
║                                                       ║
║  2. Check printer port:                               ║
║     • Default: 9100                                   ║
║     • Some printers use: 9000, 9001                   ║
║                                                       ║
║  3. Check printer status:                             ║
║     • Is printer powered on?                          ║
║     • Is it connected to network?                     ║
║     • Can you access it from other apps?             ║
║                                                       ║
║  4. Check firewall:                                   ║
║     • Is port ${printerPort} blocked?                      ║
║     • Try disabling firewall temporarily              ║
║                                                       ║
║  5. Try different IP/Port:                            ║
║     node config-xc80-cp1258.js [IP] [PORT]           ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
`);
    
    process.exit(1);
  }
}

// Print usage if --help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
╔═══════════════════════════════════════════════════════╗
║                                                       ║
║       XC80 CP1258 Configuration Tool - HELP          ║
║                                                       ║
╠═══════════════════════════════════════════════════════╣
║                                                       ║
║  Usage:                                               ║
║    node config-xc80-cp1258.js [IP] [PORT]            ║
║                                                       ║
║  Arguments:                                           ║
║    IP     - Printer IP address (default: 192.168.1.100)║
║    PORT   - Printer port (default: 9100)             ║
║                                                       ║
║  Examples:                                            ║
║    node config-xc80-cp1258.js                        ║
║    node config-xc80-cp1258.js 192.168.1.100          ║
║    node config-xc80-cp1258.js 192.168.1.100 9100     ║
║                                                       ║
║  What it does:                                        ║
║    1. Connects to XC80 printer via TCP               ║
║    2. Sends Code Page 30 (CP1258) configuration      ║
║    3. Prints Vietnamese test page                     ║
║    4. Verifies if printer supports CP1258            ║
║                                                       ║
║  Requirements:                                        ║
║    • Node.js 14+                                     ║
║    • npm install net iconv-lite                      ║
║    • XC80 printer with network connection            ║
║                                                       ║
╚═══════════════════════════════════════════════════════╝
  `);
  process.exit(0);
}

// Run configuration
configurePrinter();