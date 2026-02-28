/**
 * Test TCP port 4370 trên máy chấm công
 * Chạy: node test-port.js
 */
const net = require('net');
const config = require('./config');

const { ip, port } = config.device;

console.log(`Testing TCP ${ip}:${port}...`);

const socket = new net.Socket();
socket.setTimeout(5000);

socket.on('connect', () => {
    console.log(`✔ Port ${port} OPEN - Máy chấm công phản hồi`);
    socket.destroy();
});

socket.on('timeout', () => {
    console.log(`✖ Port ${port} TIMEOUT - Port bị chặn hoặc sai`);
    socket.destroy();
});

socket.on('error', (err) => {
    console.log(`✖ Port ${port} ERROR: ${err.message}`);
});

socket.on('close', () => {
    console.log('\nNếu port OPEN nhưng node-zklib lỗi → thử đổi thư viện.');
    console.log('Chạy: npm install zk-jubaer && node test-zkjubaer.js');
    process.exit(0);
});

socket.connect(port, ip);
