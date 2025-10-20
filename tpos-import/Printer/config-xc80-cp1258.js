/**
 * XP-K200L Configuration Script - CP1258 Setup
 * Cấu hình Code Page 30 (Windows-1258) cho in tiếng Việt có dấu
 * 
 * Cách chạy:
 * node config-xc80-cp1258.js 192.168.1.100 9100
 */

const net = require('net');

// Lấy IP và Port từ command line
const PRINTER_IP = process.argv[2] || '192.168.1.100';
const PRINTER_PORT = parseInt(process.argv[3]) || 9100;

console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
console.log(`║     XP-K200L Code Page Configuration Tool v1.0            ║`);
console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

/**
 * Tạo buffer ESC/POS với CP1258 encoding
 */
function buildConfigCommands() {
  const commands = [];
  
  // 1. Initialize printer
  commands.push(Buffer.from([0x1B, 0x40])); // ESC @
  
  // 2. Set Code Page to 30 (Windows-1258 Vietnamese)
  commands.push(Buffer.from([0x1B, 0x74, 0x1E])); // ESC t 30
  
  // 3. Test text với CP1258
  const testText = Buffer.from(
    `\n\n` +
    `================================\n` +
    `   XP-K200L TEST CP1258\n` +
    `================================\n` +
    `M\xE1y in: XP-K200L 80mm\n` +  // Máy
    `IP: ${PRINTER_IP}:${PRINTER_PORT}\n` +
    `Th\xF4i gian: ${new Date().toLocaleString('vi-VN')}\n` + // Thời
    `--------------------------------\n` +
    `In th\xED ti\xEBng Vi\xECt (C\xD3 D\xC2U):\n` + // thử tiếng Việt CÓ DẤU
    `- Xin ch\xE0o Vi\xECt Nam!\n` + // chào Việt
    `- \xD0\xE2y l\xE0 b\xE3n in th\xED nghi\xECm.\n` + // Đây là bản thử nghiệm
    `- C\xE1c k\xFD t\xFA: \xE1\xE0\xE3\xE3\xE1 \xE9\xE8\xEB\xEB\xE9\n` + // Các ký tự: áàảãạ éèẻẽẹ
    `- Gi\xE1: 150,000 VN\xD0\n` + // Giá VNĐ
    `================================\n\n\n`,
    'binary'
  );
  commands.push(testText);
  
  // 4. Cut paper
  commands.push(Buffer.from([0x1D, 0x56, 0x00])); // GS V 0 (full cut)
  
  return Buffer.concat(commands);
}

/**
 * Gửi lệnh đến máy in
 */
async function sendToPrinter(buffer) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection({
      host: PRINTER_IP,
      port: PRINTER_PORT,
      timeout: 5000
    }, () => {
      console.log(`✅ Đã kết nối với máy in tại ${PRINTER_IP}:${PRINTER_PORT}`);
      console.log(`📤 Đang gửi lệnh cấu hình Code Page 30 (CP1258)...`);
      
      client.write(buffer, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`✅ Đã gửi ${buffer.length} bytes`);
          console.log(`📄 Đang in test page...`);
          
          setTimeout(() => {
            client.end();
            resolve();
          }, 1000);
        }
      });
    });
    
    client.on('timeout', () => {
      client.destroy();
      reject(new Error('Connection timeout'));
    });
    
    client.on('error', (err) => {
      reject(err);
    });
    
    client.on('close', () => {
      console.log(`🔌 Đã ngắt kết nối\n`);
    });
  });
}

/**
 * Main execution
 */
async function main() {
  console.log(`🔧 Cấu hình máy in XP-K200L với Code Page 30 (CP1258)`);
  console.log(`📍 Target: ${PRINTER_IP}:${PRINTER_PORT}\n`);
  
  try {
    const commands = buildConfigCommands();
    await sendToPrinter(commands);
    
    console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
    console.log(`║                     ✅ HOÀN TẤT                                ║`);
    console.log(`╚════════════════════════════════════════════════════════════════╝\n`);
    
    console.log(`📋 Kiểm tra test page vừa in ra:\n`);
    console.log(`✅ NẾU THẤY: "Xin chào Việt Nam!" với dấu đầy đủ`);
    console.log(`   → Máy in hỗ trợ CP1258! Dùng mode "cp1258" trong app.\n`);
    console.log(`❌ NẾU THẤY: Ký tự lạ hoặc vuông (▯)`);
    console.log(`   → Máy in KHÔNG hỗ trợ CP1258.`);
    console.log(`   → Giải pháp: Dùng mode "no-accents" (bỏ dấu)\n`);
    
    console.log(`📖 Lưu ý:`);
    console.log(`   • XP-K200L thường HỖ TRỢ CP1258`);
    console.log(`   • Nếu vẫn lỗi, update firmware máy in`);
    console.log(`   • Hoặc liên hệ nhà phân phối XPrinter\n`);
    
  } catch (error) {
    console.error(`\n❌ LỖI: ${error.message}\n`);
    
    if (error.code === 'ECONNREFUSED') {
      console.log(`🔍 Troubleshooting:`);
      console.log(`   • Kiểm tra IP có đúng không: ${PRINTER_IP}`);
      console.log(`   • Ping thử: ping ${PRINTER_IP}`);
      console.log(`   • Máy in có bật và kết nối mạng không?`);
      console.log(`   • Port có đúng không? (mặc định: 9100)\n`);
    } else if (error.code === 'ETIMEDOUT') {
      console.log(`🔍 Troubleshooting:`);
      console.log(`   • Máy in có thể bị treo`);
      console.log(`   • Thử tắt và bật lại máy in`);
      console.log(`   • Kiểm tra firewall\n`);
    }
    
    process.exit(1);
  }
}

main();