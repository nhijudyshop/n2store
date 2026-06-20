# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 service.
"""
Engine VieNeu — wrap package `vieneu` (https://github.com/pnnbao97/VieNeu-TTS, Apache-2.0).
Giọng tiếng Việt + clone zero-shot 3-5s. Chạy ONNX CPU (torch-free) → nhẹ.

Đây là hành vi GỐC của server (tách ra từ app.py, KHÔNG đổi logic).
"""
import os
import tempfile

from engine_base import TTSEngine


class VieneuEngine(TTSEngine):
    name = "vieneu"
    sample_rate = 24000

    def __init__(self, mode: str = ""):
        self._mode = mode  # "" -> mặc định v3 Turbo
        self._tts = None

    @property
    def loaded(self) -> bool:
        return self._tts is not None

    def load(self):
        """Lazy-load model 1 lần (595MB tải lần đầu). Giữ trong RAM."""
        if self._tts is None:
            from vieneu import Vieneu

            self._tts = Vieneu(mode=self._mode) if self._mode else Vieneu()
        return self._tts

    def list_voices(self) -> list[tuple[str, str]]:
        tts = self.load()
        return [(str(lbl), str(vid)) for lbl, vid in tts.list_preset_voices()]

    def _infer_wav(self, text: str, **kwargs) -> bytes:
        tts = self.load()
        audio = tts.infer(text, **kwargs)
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            out_path = f.name
        try:
            tts.save(audio, out_path)
            with open(out_path, "rb") as fh:
                return fh.read()
        finally:
            try:
                os.unlink(out_path)
            except OSError:
                pass

    def synth_wav(self, text: str, voice: str | None = None) -> bytes:
        return self._infer_wav(text, **({"voice": voice} if voice else {}))

    def clone_wav(self, text: str, ref_path: str) -> bytes:
        return self._infer_wav(text, ref_audio=ref_path)
