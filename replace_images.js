const fs = require('fs');

const files = ['quanlynhanvien.md', 'quanlychamcong.md', 'quanlyhoahong.md', 'quanlytinhluong.md'];

files.forEach(file => {
    if (!fs.existsSync(file)) return;
    let content = fs.readFileSync(file, 'utf8');

    let blocks = content.split('\n\n');
    let newBlocks = [];

    for (let i = 0; i < blocks.length; i++) {
        let block = blocks[i];

        if (block.includes('![') && block.includes('[Mô tả ảnh cho AI:')) {
            let context = '';
            for (let j = Math.max(0, i - 4); j < i; j++) {
                context += blocks[j] + '\n';
            }

            let uiElements = [];
            let matches = [];

            // Extract bold and italicized terms which usually represent UI elements in KiotViet docs
            const combinedRegex = /(?:\*\*|_)([^*_]{2,40})(?:\*\*|_)/g;
            let m;
            while ((m = combinedRegex.exec(context)) !== null) {
                let text = m[1].replace(/[*_]/g, '').trim();
                matches.push(text);
            }

            matches = [...new Set(matches)]; // deduplicate

            let ascii = `\`\`\`text\n+---------------------------------------------------------+\n`;
            ascii += `| MÔ PHỎNG GIAO DIỆN (Dựng tự động từ ngữ cảnh)           |\n`;
            ascii += `+---------------------------------------------------------+\n`;

            let added = 0;
            matches.forEach(item => {
                if (item.length < 2 || item.length > 40) return;
                if (/^[IVX]+\.$/.test(item)) return; // Ignore roman numerals like II.

                let lower = item.toLowerCase();
                let padItem = item.padEnd(25).substring(0, 25);

                if (lower === 'lưu' || lower === 'đồng ý' || lower === 'xóa' || lower === 'cập nhật' || lower.includes('thêm') || lower === 'ngừng hoạt động') {
                    ascii += `| Nút bấm : [ ${padItem} ]                   |\n`;
                    added++;
                } else if (lower.includes('tab ') || lower.includes('màn hình ') || lower.includes('danh sách')) {
                    ascii += `| KHU VỰC : ${padItem.padEnd(41)} |\n`;
                    added++;
                } else if (!lower.includes('tình huống') && !lower.includes('thao tác')) {
                    ascii += `| Dữ liệu : [ ${padItem} ]                   |\n`;
                    added++;
                }
            });

            if (added === 0) {
                ascii += `| Hiển thị danh sách dữ liệu hoặc chi tiết                |\n`;
            }
            ascii += `+---------------------------------------------------------+\n\`\`\``;

            block = block.replace('Hình ảnh minh họa với đường dẫn', 'Giao diện tính năng (kèm mô phỏng cấu trúc bên dưới). URL');
            block = block + '\n\n' + ascii;
        }

        newBlocks.push(block);
    }

    fs.writeFileSync(file, newBlocks.join('\n\n'), 'utf8');
    console.log(`Processed images in ${file}`);
});
