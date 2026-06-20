# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 service.
"""
Giao diện chung cho các engine giọng (TTS) của server máy shop.

Mục tiêu: cùng 1 HTTP contract (app.py) phục vụ NHIỀU engine (VieNeu, OmniVoice…).
Trang web (Web2Vieneu) KHÔNG cần biết engine nào — chỉ gọi /voices, /synthesize, /clone.
Mỗi engine tự lo: tải model (lazy), liệt kê giọng preset, sinh WAV.
"""
import io
import wave


class NotSupported(Exception):
    """Engine không hỗ trợ tính năng này (vd voice design)."""


class TTSEngine:
    """Hợp đồng tối thiểu mọi engine phải hiện thực."""

    name = "base"
    sample_rate = 24000

    def load(self):
        """Tải model 1 lần (idempotent). Trả về handle model."""
        raise NotImplementedError

    @property
    def loaded(self) -> bool:
        return True

    def list_voices(self) -> list[tuple[str, str]]:
        """Danh sách giọng preset: [(label, voice_id), …]. Rỗng nếu không có."""
        return []

    def synth_wav(self, text: str, voice: str | None = None) -> bytes:
        """Sinh giọng theo text (+ voice preset tuỳ chọn) -> bytes WAV."""
        raise NotImplementedError

    def clone_wav(self, text: str, ref_path: str) -> bytes:
        """Nhái giọng từ file mẫu (3-10s) -> bytes WAV."""
        raise NotImplementedError

    def design_wav(self, text: str, instruct: str) -> bytes:
        """Thiết kế giọng theo thuộc tính (gender/age/pitch/accent…) -> bytes WAV."""
        raise NotSupported("engine không hỗ trợ voice design")


def float_to_wav_bytes(samples, sample_rate: int) -> bytes:
    """np.float32 mono trong [-1, 1] -> WAV PCM16 bytes (stdlib, không cần soundfile)."""
    import numpy as np

    arr = np.asarray(samples, dtype=np.float32).reshape(-1)
    arr = np.clip(arr, -1.0, 1.0)
    pcm = (arr * 32767.0).astype("<i2")  # int16 little-endian
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(int(sample_rate))
        w.writeframes(pcm.tobytes())
    return buf.getvalue()
