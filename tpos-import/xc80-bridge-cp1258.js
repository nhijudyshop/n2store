/**
 * PDF to ESC/POS Bitmap Converter - FULL VERSION
 * Converts PDF to optimized bitmap for thermal printers
 * 
 * Usage:
 *   node pdf-to-escpos-bitmap.js <pdf-file> [printer-ip] [options]
 * 
 * Examples:
 *   node pdf-to-escpos-bitmap.js bill.pdf 192.168.1.100
 *   node pdf-to-escpos-bitmap.js bill.pdf 192.168.1.100 --dpi=300 --threshold=115
 *   node pdf-to-escpos-bitmap.js bill.pdf --save-only  (chỉ lưu file, không in)
 */

const sharp = require('sharp');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Config
const DEFAULT_DPI = 203;  // Máy in 80mm thermal
const DEFAULT_THRESHOLD = 115;  // 0-255, thấp hơn = chữ đậm hơn
const PRINTER_WIDTH_MM = 80;  // Width máy in (80mm)
const PRINTER_WIDTH_PIXELS = Math.floor(PRINTER_WIDTH_MM * DEFAULT_DPI / 25.4); // ~640 pixels

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    pdfPath: null,
    printerIP: '192.168.1.100',
    printerPort: 9100,
    bridgeURL: 'http://localhost:9100',
    dpi: DEFAULT_DPI,
    threshold: DEFAULT_THRESHOLD,
    width: PRINTER_WIDTH_PIXELS,
    saveOnly: false,
    outputDir: './output'
  };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (key === 'dpi') options.dpi = parseInt(value);
      else if (key === 'threshold') options.threshold = parseInt(value);
      else if (key === 'width') options.width = parseInt(value);
      else if (key === 'save-only') options.saveOnly = true;
      else if (key === 'bridge') options.bridgeURL = value;
    } else if (!options.pdfPath) {
      options.pdfPath = arg;
    } else if (!arg.startsWith('--')) {
      options.printerIP = arg;
    }
  }

  return options;
}

/**
 * Cleanup temporary files
 */
function cleanupTempFiles(pattern = 'temp-*.pgm') {
  try {
    const files = fs.readdirSync('.');
    files.forEach(file => {
      if (file.match(pattern.replace('*', '.*'))) {
        fs.unlinkSync(file);
      }
    });
  } catch (err) {
    console.warn('⚠️  Warning: Could not cleanup temp files:', err.message);
  }
}

/**
 * Convert PDF to ESC/POS bitmap
 */
async function pdfToESCPOSBitmap(pdfPath, options = {}) {
  const {
    dpi = DEFAULT_DPI,
    threshold = DEFAULT_THRESHOLD,
    width = PRINTER_WIDTH_PIXELS
  } = options;

  console.log(`📄 Processing PDF: ${pdfPath}`);
  console.log(`⚙️  Settings: DPI=${dpi}, Threshold=${threshold}, Width=${width}px`);

  let tempFile = null;

  try {
    // Step 1: Check if PDF exists
    if (!fs.existsSync(pdfPath)) {
      throw new Error(`PDF file not found: ${pdfPath}`);
    }

    // Step 2: Convert PDF to grayscale image
    console.log('🔄 Step 1/5: Converting PDF to grayscale...');
    execSync(`pdftoppm -r ${dpi} -gray "${pdfPath}" temp`, {
      stdio: 'pipe'
    });

    // Find the generated temp file
    const tempFiles = fs.readdirSync('.').filter(f => f.startsWith('temp-') && f.endsWith('.pgm'));
    if (tempFiles.length === 0) {
      throw new Error('PDF conversion failed - no output file generated');
    }
    tempFile = tempFiles[0];
    console.log(`✅ Generated: ${tempFile}`);

    // Step 3: Load and enhance image
    console.log('🔄 Step 2/5: Enhancing image quality...');
    let img = sharp(tempFile);
    
    // Get image metadata
    const metadata = await img.metadata();
    console.log(`📐 Original size: ${metadata.width}x${metadata.height}px`);

    // Resize if too wide
    if (metadata.width > width) {
      console.log(`🔄 Step 3/5: Resizing to ${width}px width...`);
      img = img.resize(width, null, {
        kernel: 'lanczos3',
        fit: 'inside'
      });
    } else {
      console.log('✅ Step 3/5: Size OK, no resize needed');
    }

    // Enhance: sharpen + normalize
    const enhanced = await img
      .greyscale()
      .sharpen({ sigma: 1.2, m1: 0.5, m2: 0.5 })
      .normalise()
      .toBuffer();

    // Step 4: Convert to monochrome
    console.log(`🔄 Step 4/5: Converting to monochrome (threshold=${threshold})...`);
    const processed = await sharp(enhanced)
      .threshold(threshold)
      .toFormat('png')
      .toBuffer();

    // Step 5: Get raw pixel data
    console.log('🔄 Step 5/5: Generating ESC/POS bitmap...');
    const { data, info } = await sharp(processed)
      .raw()
      .toBuffer({ resolveWithObject: true });

    console.log(`✅ Final size: ${info.width}x${info.height}px`);

    // Convert to ESC/POS format
    const escposData = convertToESCPOS(data, info.width, info.height);
    
    console.log(`✅ ESC/POS data: ${escposData.length} bytes`);

    return {
      data: escposData,
      width: info.width,
      height: info.height,
      preview: processed
    };

  } catch (error) {
    console.error('❌ Error during conversion:', error.message);
    throw error;
  } finally {
    // Cleanup temp files
    cleanupTempFiles('temp-*.pgm');
  }
}

/**
 * Convert image data to ESC/POS GS v 0 bitmap format
 */
function convertToESCPOS(imageData, width, height) {
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
          // For grayscale/RGB, take first channel
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
 * Send to printer via bridge
 */
async function sendToPrinter(escposData, options) {
  const { printerIP, printerPort, bridgeURL } = options;
  
  console.log(`\n📤 Sending to printer...`);
  console.log(`   Bridge: ${bridgeURL}/print-bitmap`);
  console.log(`   Printer: ${printerIP}:${printerPort}`);

  const base64Data = escposData.toString('base64');
  
  try {
    // Use node-fetch for Node.js < 18, native fetch for >= 18
    let fetchFn;
    try {
      fetchFn = fetch; // Native fetch (Node 18+)
    } catch {
      fetchFn = require('node-fetch'); // Fallback for older Node
    }

    const response = await fetchFn(`${bridgeURL}/print-bitmap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ip: printerIP,
        port: printerPort,
        bitmap: base64Data
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Bridge error: ${response.status} - ${error}`);
    }

    const result = await response.json();
    console.log('✅ Print job sent successfully!');
    console.log(`   Response:`, result);
    
    return result;
  } catch (error) {
    console.error('❌ Failed to send to printer:', error.message);
    
    if (error.message.includes('ECONNREFUSED')) {
      console.log('\n💡 Troubleshooting:');
      console.log('   • Is the bridge server running?');
      console.log(`   • Try: node xc80-bridge-cp1258.js`);
      console.log(`   • Check bridge URL: ${bridgeURL}`);
    }
    
    throw error;
  }
}

/**
 * Save output files
 */
async function saveOutput(result, pdfPath, options) {
  const { outputDir } = options;
  
  // Create output directory
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const basename = path.basename(pdfPath, '.pdf');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

  // Save ESC/POS binary
  const binaryPath = path.join(outputDir, `${basename}_${timestamp}.bin`);
  fs.writeFileSync(binaryPath, result.data);
  console.log(`💾 Saved ESC/POS binary: ${binaryPath}`);

  // Save preview PNG
  const previewPath = path.join(outputDir, `${basename}_${timestamp}_preview.png`);
  fs.writeFileSync(previewPath, result.preview);
  console.log(`💾 Saved preview image: ${previewPath}`);

  return { binaryPath, previewPath };
}

/**
 * Main execution
 */
async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     PDF to ESC/POS Bitmap Converter v1.0                 ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // Parse arguments
    const options = parseArgs();

    if (!options.pdfPath) {
      console.error('❌ Error: No PDF file specified\n');
      console.log('Usage:');
      console.log('  node pdf-to-escpos-bitmap.js <pdf-file> [printer-ip] [options]\n');
      console.log('Options:');
      console.log('  --dpi=<number>        DPI for conversion (default: 203)');
      console.log('  --threshold=<number>  Threshold 0-255 (default: 115, lower=darker)');
      console.log('  --width=<number>      Max width in pixels (default: 640)');
      console.log('  --save-only           Only save files, don\'t print');
      console.log('  --bridge=<url>        Bridge server URL (default: http://localhost:9100)\n');
      console.log('Examples:');
      console.log('  node pdf-to-escpos-bitmap.js bill.pdf 192.168.1.100');
      console.log('  node pdf-to-escpos-bitmap.js bill.pdf --dpi=300 --threshold=100');
      console.log('  node pdf-to-escpos-bitmap.js bill.pdf --save-only\n');
      process.exit(1);
    }

    // Check dependencies
    try {
      execSync('pdftoppm -v', { stdio: 'pipe' });
    } catch {
      console.error('❌ Error: pdftoppm not found');
      console.log('\n💡 Install poppler-utils:');
      console.log('   • Ubuntu/Debian: sudo apt install poppler-utils');
      console.log('   • macOS: brew install poppler');
      console.log('   • Windows: Download from https://blog.alivate.com.au/poppler-windows/\n');
      process.exit(1);
    }

    // Convert PDF
    const result = await pdfToESCPOSBitmap(options.pdfPath, options);

    // Save output files
    const saved = await saveOutput(result, options.pdfPath, options);

    // Send to printer (if not save-only mode)
    if (!options.saveOnly) {
      await sendToPrinter(result.data, options);
    } else {
      console.log('\n✅ Files saved successfully (save-only mode)');
    }

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    ✅ COMPLETED                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log('📊 Summary:');
    console.log(`   • Input: ${options.pdfPath}`);
    console.log(`   • Size: ${result.width}x${result.height}px`);
    console.log(`   • Data: ${result.data.length} bytes`);
    console.log(`   • Binary: ${saved.binaryPath}`);
    console.log(`   • Preview: ${saved.previewPath}`);
    if (!options.saveOnly) {
      console.log(`   • Printer: ${options.printerIP}:${options.printerPort}`);
    }
    console.log('');

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('❌ Unhandled error:', err);
    process.exit(1);
  });
}

// Export for use as module
module.exports = {
  pdfToESCPOSBitmap,
  convertToESCPOS,
  sendToPrinter
};
