/**
 * Chẩn đoán kết nối máy chấm công
 * Chạy: node diagnose.js
 *
 * Kiểm tra từng bước: TCP → UDP → ZK Protocol
 */
const net = require('net');
const dgram = require('dgram');
const config = require('./config');

const { ip, port, timeout } = config.device;

async function diagnose() {
    console.log('╔══════════════════════════════════════════╗');
    console.log('║   CHẨN ĐOÁN MÁY CHẤM CÔNG DG-600       ║');
    console.log(`║   IP: ${ip}   Port: ${port}            ║`);
    console.log(`║   Node: ${process.version}                      ║`);
    console.log('╚══════════════════════════════════════════╝\n');

    // Test 1: TCP
    console.log('── Bước 1: Test TCP ──');
    const tcpOk = await testTCP();
    console.log('');

    // Test 2: UDP
    console.log('── Bước 2: Test UDP ──');
    const udpOk = await testUDP();
    console.log('');

    // Test 3: ZK Protocol
    console.log('── Bước 3: Test ZK Protocol (zk-jubaer) ──');
    await testZKLib();
    console.log('');

    // Summary
    console.log('══ KẾT QUẢ ══');
    console.log(`TCP port ${port}: ${tcpOk ? '✔ OPEN' : '✖ CLOSED/TIMEOUT'}`);
    console.log(`UDP port ${port}: ${udpOk ? '✔ OK' : '? Không xác định'}`);
}

function testTCP() {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(5000);

        socket.on('connect', () => {
            console.log(`  ✔ TCP ${ip}:${port} - OPEN`);
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            console.log(`  ✖ TCP ${ip}:${port} - TIMEOUT (5s)`);
            socket.destroy();
            resolve(false);
        });

        socket.on('error', (err) => {
            console.log(`  ✖ TCP ${ip}:${port} - ${err.code || err.message}`);
            resolve(false);
        });

        socket.connect(port, ip);
    });
}

function testUDP() {
    return new Promise((resolve) => {
        const client = dgram.createSocket('udp4');

        // ZK connect command (minimal)
        const CMD_CONNECT = Buffer.from([
            0x50, 0x50, 0x82, 0x7d,  // header
            0xe8, 0x03,              // CMD_CONNECT
            0x00, 0x00,              // checksum
            0x00, 0x00, 0x00, 0x00,  // session + reply
        ]);

        const timer = setTimeout(() => {
            console.log(`  ? UDP ${ip}:${port} - Không phản hồi (5s)`);
            client.close();
            resolve(false);
        }, 5000);

        client.on('message', (msg) => {
            clearTimeout(timer);
            console.log(`  ✔ UDP ${ip}:${port} - Phản hồi ${msg.length} bytes`);
            client.close();
            resolve(true);
        });

        client.on('error', (err) => {
            clearTimeout(timer);
            console.log(`  ✖ UDP ${ip}:${port} - ${err.code || err.message}`);
            client.close();
            resolve(false);
        });

        client.send(CMD_CONNECT, port, ip);
    });
}

async function testZKLib() {
    try {
        const ZKLib = require('zk-jubaer');
        console.log('  Thư viện: zk-jubaer ✔');

        const device = new ZKLib(ip, port, timeout, 5200);

        console.log('  Đang kết nối...');
        await device.createSocket();
        console.log('  ✔ Kết nối ZK thành công!');

        // Users
        try {
            const users = await device.getUsers();
            const list = users.data || users || [];
            console.log(`  ✔ Users: ${list.length} người`);
        } catch (e) {
            console.log(`  ✖ Users lỗi: ${e.message}`);
        }

        // Attendances
        try {
            const att = await device.getAttendances();
            const list = att.data || att || [];
            console.log(`  ✔ Chấm công: ${list.length} bản ghi`);
        } catch (e) {
            console.log(`  ✖ Chấm công lỗi: ${e.message}`);
        }

        await device.disconnect();
        console.log('\n  ═══ ZK PROTOCOL OK ═══');

    } catch (err) {
        console.log(`  ✖ ZK lỗi: ${err.message || JSON.stringify(err)}`);

        // Try node-zklib as fallback
        try {
            const ZKLib2 = require('node-zklib');
            console.log('\n  Thử node-zklib fallback...');
            const device2 = new ZKLib2(ip, port, timeout, 5200);
            await device2.createSocket();
            console.log('  ✔ node-zklib kết nối OK');
            await device2.disconnect();
        } catch (e2) {
            console.log(`  ✖ node-zklib cũng lỗi: ${e2.message || JSON.stringify(e2)}`);
        }
    }
}

diagnose().then(() => process.exit(0)).catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
});
