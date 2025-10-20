/**
 * Test PDF Printing Script
 * Tạo PDF đơn giản và gửi đến máy in qua bridge
 * 
 * Cách chạy:
 * node test-pdf-print.js 192.168.1.100 9100
 */

const fs = require('fs');
const path = require('path');

// Configuration
const PRINTER_IP = process.argv[2] || '192.168.1.100';
const PRINTER_PORT = parseInt(process.argv[3]) || 9100;
const BRIDGE_URL = process.argv[4] || 'http://localhost:9100';

console.log(`\n╔════════════════════════════════════════════════════════════════╗`);
console.log(`║           PDF Print Test - XC80 Bridge v7.0                ║`);
console.log(`╚════════════════════════════════════════════════════════════════╝\n`);

console.log(`🖨️  Printer: ${PRINTER_IP}:${PRINTER_PORT}`);
console.log(`🌉 Bridge: ${BRIDGE_URL}`);
console.log(`📄 Generating test PDF...\n`);

/**
 * Tạo PDF đơn giản bằng cách manual (không cần library)
 * Đây là minimal PDF structure
 */
function createSimplePDF() {
  const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /Resources 4 0 R /MediaBox [0 0 226.77 595.27] /Contents 5 0 R >>
endobj
4 0 obj
<< /Font << /F1 << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> >> >>
endobj
5 0 obj
<< /Length 200 >>
stream
BT
/F1 18 Tf
10 560 Td
(TEST PDF PRINT) Tj
0 -30 Td
(XC80 Bridge v7.0) Tj
0 -30 Td
(Printer: ${PRINTER_IP}:${PRINTER_PORT}) Tj
0 -30 Td
(Time: ${new Date().toLocaleString('vi-VN')}) Tj
0 -30 Td
(Vietnamese: Xin chao Viet Nam!) Tj
ET
endstream
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000230 00000 n 
0000000330 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
582
%%EOF`;
  
  return Buffer.from(pdfContent);
}

/**
 * Gửi PDF đến bridge
 */
async function sendPDFToBridge(pdfBuffer) {
  try {
    const base64Pdf = pdfBuffer.toString('base64');
    
    console.log(`📦 PDF size: ${(pdfBuffer.length / 1024).toFixed(2)} KB`);
    console.log(`🔄 Sending to bridge...`);
    
    const response = await fetch(`${BRIDGE_URL}/print/pdf`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        printerIp: PRINTER_IP,
        printerPort: PRINTER_PORT,
        pdfBase64: base64Pdf,
        dpi: 300,
        threshold: 115,
        width: 944  // 80mm @ 300 DPI
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      console.log(`\n✅ SUCCESS!`);
      console.log(`   Data size: ${result.details.dataSize} bytes`);
      console.log(`   Settings: DPI=${result.details.settings.dpi}, Threshold=${result.details.settings.threshold}`);
      console.log(`\n🎉 PDF printed successfully!\n`);
    } else {
      throw new Error(result.error || 'Unknown error');
    }
    
  } catch (error) {
    console.error(`\n❌ ERROR: ${error.message}\n`);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log(`🔍 Troubleshooting:`);
      console.log(`   • Bridge server không chạy`);
      console.log(`   • Chạy: node xc80-bridge-cp1258.js`);
      console.log(`   • Kiểm tra port: ${BRIDGE_URL}\n`);
    } else if (error.message.includes('pdftoppm')) {
      console.log(`🔍 Troubleshooting:`);
      console.log(`   • Chưa cài poppler-utils`);
      console.log(`   • Ubuntu/Debian: sudo apt-get install poppler-utils`);
      console.log(`   • macOS: brew install poppler`);
      console.log(`   • Windows: Download từ https://github.com/oschwartz10612/poppler-windows/releases/\n`);
    }
    
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  try {
    // Tạo PDF
    const pdfBuffer = createSimplePDF();
    
    // Lưu PDF ra file (optional, để debug)
    const testPdfPath = path.join(__dirname, 'test-output.pdf');
    fs.writeFileSync(testPdfPath, pdfBuffer);
    console.log(`💾 PDF saved to: ${testPdfPath}`);
    
    // Gửi đến bridge
    await sendPDFToBridge(pdfBuffer);
    
  } catch (error) {
    console.error(`\n❌ FATAL ERROR: ${error.message}\n`);
    process.exit(1);
  }
}

// Run
main();