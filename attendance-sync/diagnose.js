/**
 * Chuong trinh chan doan ket noi may cham cong
 * Chay: node diagnose.js
 *
 * Kiem tra:
 * 1. Ping (ICMP)
 * 2. TCP port 4370
 * 3. UDP port 4370
 * 4. ZK Protocol (qua node-zklib)
 */
const net = require('net');
const dgram = require('dgram');
const { execSync } = require('child_process');
const config = require('./config');

const IP = config.device.ip;
const PORT = config.device.port;

async function main() {
    console.log('========================================');
    console.log(' CHAN DOAN KET NOI MAY CHAM CONG');
    console.log(`  IP: ${IP}`);
    console.log(`  Port: ${PORT}`);
    console.log('========================================\n');

    // Test 1: Ping
    console.log('[1/4] PING...');
    try {
        const isWin = process.platform === 'win32';
        const cmd = isWin ? `ping -n 2 -w 2000 ${IP}` : `ping -c 2 -W 2 ${IP}`;
        const result = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });

        if (result.includes('TTL=') || result.includes('ttl=') || result.includes('time=')) {
            console.log('  => PING OK - May cham cong dang hoat dong\n');
        } else {
            console.log('  => PING THAT BAI - May cham cong khong phan hoi');
            console.log('  Kiem tra: day mang, nguon dien, IP\n');
        }
    } catch (err) {
        console.log('  => PING THAT BAI:', err.message, '\n');
    }

    // Test 2: TCP
    console.log(`[2/4] TCP port ${PORT}...`);
    const tcpOk = await testTCP(IP, PORT);
    if (tcpOk) {
        console.log(`  => TCP OK - Port ${PORT} mo\n`);
    } else {
        console.log(`  => TCP DONG - Port ${PORT} khong mo (binh thuong voi DG-600, may dung UDP)\n`);
    }

    // Test 3: UDP
    console.log(`[3/4] UDP port ${PORT}...`);
    const udpOk = await testUDP(IP, PORT);
    if (udpOk) {
        console.log('  => UDP OK - May phan hoi goi tin ZK\n');
    } else {
        console.log('  => UDP KHONG PHAN HOI - Co the firewall chan hoac may khong ho tro\n');
    }

    // Test 4: ZK Protocol (node-zklib)
    console.log('[4/4] ZK PROTOCOL (node-zklib)...');
    try {
        const ZKLib = require('node-zklib');
        const zk = new ZKLib(IP, PORT, 10000, 5200);

        // Thu binh thuong
        console.log('  a) Thu createSocket() (TCP->UDP fallback)...');
        try {
            await zk.createSocket();
            console.log(`  => KET NOI THANH CONG! Protocol: ${zk.connectionType}`);

            // Lay thong tin
            try {
                const info = await zk.getInfo();
                console.log('  Thong tin may:', JSON.stringify(info));
            } catch (e) {
                console.log('  Khong lay duoc info:', e.message);
            }

            // Lay users
            try {
                const users = await zk.getUsers();
                console.log(`  So user: ${users.data ? users.data.length : 0}`);
                if (users.data && users.data.length > 0) {
                    users.data.slice(0, 5).forEach(u => {
                        console.log(`    - ID: ${u.uid}, Ten: ${u.name}`);
                    });
                }
            } catch (e) {
                console.log('  Khong lay duoc users:', e.message);
            }

            // Lay attendance
            try {
                const att = await zk.getAttendances();
                console.log(`  So ban ghi cham cong: ${att.data ? att.data.length : 0}`);
                if (att.data && att.data.length > 0) {
                    att.data.slice(-3).forEach(r => {
                        console.log(`    - User ${r.deviceUserId} @ ${r.recordTime}`);
                    });
                }
            } catch (e) {
                console.log('  Khong lay duoc attendance:', e.message);
            }

            await zk.disconnect();
        } catch (normalErr) {
            console.log(`  createSocket that bai: ${normalErr.message}`);

            // Thu force UDP
            console.log('  b) Thu FORCE UDP...');
            try {
                const zk2 = new ZKLib(IP, PORT, 10000, 5200);
                if (zk2.zklibUdp) {
                    await zk2.zklibUdp.createSocket();
                    await zk2.zklibUdp.connect();
                    console.log('  => FORCE UDP THANH CONG!');

                    // Thu lay users
                    zk2.connectionType = 'udp';
                    try {
                        const users = await zk2.getUsers();
                        console.log(`  So user: ${users.data ? users.data.length : 0}`);
                    } catch (e) {
                        console.log('  Khong lay duoc users:', e.message);
                    }

                    await zk2.disconnect();
                } else {
                    console.log('  Khong co UDP handler');
                }
            } catch (udpErr) {
                console.log(`  Force UDP that bai: ${udpErr.message}`);
            }
        }
    } catch (err) {
        console.log(`  LOI: ${err.message}`);
        console.log('  Chay "npm install" truoc khi test');
    }

    console.log('\n========================================');
    console.log(' KET LUAN:');
    if (tcpOk) {
        console.log('  May ho tro TCP -> dung node-zklib binh thuong');
    } else if (udpOk) {
        console.log('  May chi ho tro UDP -> dung node-zklib force UDP');
    } else {
        console.log('  Khong ket noi duoc ca TCP lan UDP');
        console.log('  Kiem tra:');
        console.log('    - Firewall Windows: cho phep UDP port 4370');
        console.log('    - Khong co phan mem khac dang ket noi may');
        console.log('    - May cham cong: Comm Key = 0');
        console.log('    - Thu tat/bat lai may cham cong');
    }
    console.log('========================================');
}

function testTCP(ip, port) {
    return new Promise(resolve => {
        const socket = new net.Socket();
        socket.setTimeout(5000);

        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });

        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });

        socket.on('error', () => {
            socket.destroy();
            resolve(false);
        });

        socket.connect(port, ip);
    });
}

function testUDP(ip, port) {
    return new Promise(resolve => {
        const client = dgram.createSocket('udp4');
        let responded = false;

        const timer = setTimeout(() => {
            if (!responded) {
                client.close();
                resolve(false);
            }
        }, 5000);

        client.on('message', () => {
            responded = true;
            clearTimeout(timer);
            client.close();
            resolve(true);
        });

        client.on('error', () => {
            clearTimeout(timer);
            client.close();
            resolve(false);
        });

        // ZK protocol connect packet
        // Header: \x50\x50\x82\x7d (magic) + \x08\x00 (length) + \xe8\x03 (CMD_CONNECT=1000) + ...
        const connectPacket = Buffer.from([
            0x50, 0x50, 0x82, 0x7d,  // ZK UDP magic
            0x08, 0x00,              // packet length
            0xe8, 0x03,              // CMD_CONNECT (1000)
            0x00, 0x00,              // checksum
            0x00, 0x00,              // session id
            0x00, 0x00,              // reply id
        ]);

        client.send(connectPacket, 0, connectPacket.length, port, ip, (err) => {
            if (err) {
                clearTimeout(timer);
                client.close();
                resolve(false);
            }
        });
    });
}

main().catch(err => {
    console.error('LOI:', err);
    process.exit(1);
});
