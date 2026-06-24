// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Trang "Sửa ảnh AI" (group AI) — thay photo-editor cũ. Tool grid điều phối các module
// dùng chung: Web2BgScene (xóa/đổi nền), Web2LogoEraser (xóa logo/WM), Web2Watermark
// (thêm logo/WM), Web2BeautyStudio (làm đẹp), Web2ImageEditor (nâng cao/Photopea).
(function (global) {
    'use strict';

    const $ = (id) => document.getElementById(id);
    let _src = null,
        _result = null,
        _name = 'anh';

    function notify(m, t) {
        if (global.notificationManager?.show) global.notificationManager.show(m, t || 'info');
    }
    function loadImg(src) {
        return new Promise((res, rej) => {
            const im = new Image();
            im.onload = () => res(im);
            im.onerror = () => rej(new Error('ảnh lỗi'));
            im.src = src;
        });
    }

    async function setSource(src, name) {
        _src = src;
        if (name) _name = name.replace(/\.[^.]+$/, '');
        const img = $('apSrc');
        img.src = src;
        img.hidden = false;
        $('apEmpty').hidden = true;
        $('apTools').hidden = false;
        try {
            const i = await loadImg(src);
            $('apMeta').hidden = false;
            $('apMeta').textContent = `${i.naturalWidth}×${i.naturalHeight}px`;
        } catch {}
    }

    function showResult(dataUrl) {
        _result = dataUrl;
        $('apResult').hidden = false;
        $('apResultWrap').innerHTML = `<img src="${dataUrl}" alt="kết quả">`;
        $('apDownload').href = dataUrl;
        $('apResult').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    async function runTool(tool) {
        if (!_src) return notify('Hãy tải ảnh trước', 'warning');
        let out = null;
        try {
            if (tool === 'bg') {
                if (!global.Web2BgScene?.open)
                    return notify('Chưa tải được công cụ tách nền', 'error');
                out = await global.Web2BgScene.open(_src);
            } else if (tool === 'erase') {
                if (!global.Web2LogoEraser?.open)
                    return notify('Chưa tải được công cụ xóa logo', 'error');
                out = await global.Web2LogoEraser.open(_src);
            } else if (tool === 'watermark') {
                if (!global.Web2Watermark?.open)
                    return notify('Chưa tải được công cụ thêm logo/WM', 'error');
                out = await global.Web2Watermark.open(_src);
            } else if (tool === 'advanced') {
                if (!global.Web2ImageEditor?.open)
                    return notify('Chưa tải được trình chỉnh nâng cao', 'error');
                out = await global.Web2ImageEditor.open(_src, { name: _name, engine: 'photopea' });
            } else {
                if (!global.Web2BeautyStudio?.open)
                    return notify('Chưa tải được Studio làm đẹp', 'error');
                out = await global.Web2BeautyStudio.open(_src, { tool, name: _name });
            }
        } catch (e) {
            console.error('[ai-photo] runTool', tool, e);
            return notify('Lỗi mở công cụ: ' + (e.message || e), 'error');
        }
        if (out) {
            await setSource(out, _name); // chỉnh chồng tiếp
            showResult(out);
            notify('Đã áp dụng — có thể bấm công cụ khác', 'success');
        }
    }

    function wireInput() {
        const drop = $('apDrop'),
            file = $('apFile');
        drop.addEventListener('click', (e) => {
            if (e.target.closest('.ap-tool')) return;
            file.click();
        });
        file.addEventListener('change', () => {
            const f = file.files?.[0];
            if (f) setSource(URL.createObjectURL(f), f.name);
        });
        drop.addEventListener('dragover', (e) => {
            e.preventDefault();
            drop.classList.add('drag');
        });
        drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
        drop.addEventListener('drop', (e) => {
            e.preventDefault();
            drop.classList.remove('drag');
            const f = e.dataTransfer?.files?.[0];
            if (f && f.type.startsWith('image/')) setSource(URL.createObjectURL(f), f.name);
        });
        document.addEventListener('paste', (e) => {
            const it = [...(e.clipboardData?.items || [])].find((x) => x.type.startsWith('image/'));
            if (it) setSource(URL.createObjectURL(it.getAsFile()), 'dan-anh');
        });
    }

    function init() {
        wireInput();
        document
            .querySelectorAll('.ap-tool')
            .forEach((b) => b.addEventListener('click', () => runTool(b.dataset.tool)));
        $('apUseSrc').addEventListener('click', () => {
            if (_result) setSource(_result, _name);
        });
    }

    global.AiPhoto = { init };
})(window);
