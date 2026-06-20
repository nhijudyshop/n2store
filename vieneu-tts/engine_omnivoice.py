# #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 service.
"""
Engine OmniVoice — wrap package `omnivoice` (https://github.com/k2-fsa/OmniVoice, Apache-2.0).
Zero-shot TTS 600+ ngôn ngữ (CÓ tiếng Việt — 8.481 giờ data), clone giọng SOTA +
Voice Design (chỉnh giới tính/tuổi/cao độ/giọng vùng KHÔNG cần mẫu). PyTorch, nặng hơn VieNeu.

Map vào HTTP contract chung (app.py) để giữ NGUYÊN frontend:
  /voices       -> preset Voice Design (voice_id = chuỗi instruct)
  /synthesize   -> voice rỗng = auto voice; voice = chuỗi instruct -> voice design
  /clone        -> ref_audio (ref_text bỏ trống -> OmniVoice tự transcribe bằng Whisper)
  /design       -> instruct trực tiếp (tính năng riêng của OmniVoice)

API tham chiếu (README k2-fsa/OmniVoice):
  model = OmniVoice.from_pretrained("k2-fsa/OmniVoice", device_map=..., dtype=...)
  audio = model.generate(text=..., ref_audio=..., instruct=..., num_step=32, speed=1.0)
  # audio = list[np.ndarray] (T,) @ 24 kHz
"""
import os

from engine_base import TTSEngine, float_to_wav_bytes

# Preset Voice Design thân thiện (label hiển thị, instruct gửi model).
# voice_id = "" => auto voice (model tự chọn). Lưu ý: voice design train chủ yếu
# trên Trung+Anh; với tiếng Việt có thể chưa ổn định — clone vẫn là chế độ chuẩn nhất.
_DESIGN_PRESETS: list[tuple[str, str]] = [
    ("Tự động (máy tự chọn giọng)", ""),
    ("Nữ — trẻ", "female, young"),
    ("Nữ — trung niên", "female, middle-aged"),
    ("Nữ — nhẹ nhàng (thì thầm)", "female, whisper"),
    ("Nam — trẻ", "male, young"),
    ("Nam — trầm ấm", "male, low pitch"),
    ("Nam — trung niên", "male, middle-aged"),
]


def _auto_device() -> str:
    """Tự chọn thiết bị: CUDA > MPS (Apple Silicon) > XPU (Intel Arc) > CPU."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda:0"
        mps = getattr(torch.backends, "mps", None)
        if mps is not None and mps.is_available():
            return "mps"
        xpu = getattr(torch, "xpu", None)
        if xpu is not None and xpu.is_available():
            return "xpu"
    except Exception:
        pass
    return "cpu"


def _resolve_dtype(device: str):
    import torch

    name = (os.environ.get("OMNIVOICE_DTYPE") or "").lower()
    if name in ("fp16", "float16", "half"):
        return torch.float16
    if name in ("fp32", "float32"):
        return torch.float32
    if name in ("bf16", "bfloat16"):
        return torch.bfloat16
    # Mặc định: fp16 chỉ trên CUDA; CPU/MPS dùng fp32 (fp16 dễ lỗi/chậm ngoài CUDA).
    return torch.float16 if str(device).startswith("cuda") else torch.float32


class OmniVoiceEngine(TTSEngine):
    name = "omnivoice"
    sample_rate = 24000

    def __init__(
        self,
        model_id: str = "k2-fsa/OmniVoice",
        device: str = "",
        num_step: int = 32,
        speed: float = 1.0,
    ):
        self._model_id = model_id
        self._device = device
        self._num_step = num_step
        self._speed = speed
        self._model = None

    @property
    def loaded(self) -> bool:
        return self._model is not None

    def load(self):
        if self._model is None:
            from omnivoice import OmniVoice

            device = self._device or _auto_device()
            dtype = _resolve_dtype(device)
            self._model = OmniVoice.from_pretrained(
                self._model_id, device_map=device, dtype=dtype
            )
            self._device = device
        return self._model

    def _gen_wav(self, **kwargs) -> bytes:
        import numpy as np

        model = self.load()
        audio = model.generate(num_step=self._num_step, speed=self._speed, **kwargs)
        samples = audio[0] if isinstance(audio, (list, tuple)) else audio
        return float_to_wav_bytes(np.asarray(samples, dtype="float32"), self.sample_rate)

    def list_voices(self) -> list[tuple[str, str]]:
        return list(_DESIGN_PRESETS)

    def synth_wav(self, text: str, voice: str | None = None) -> bytes:
        v = (voice or "").strip()
        return self._gen_wav(text=text, instruct=v) if v else self._gen_wav(text=text)

    def clone_wav(self, text: str, ref_path: str) -> bytes:
        # ref_text bỏ trống -> OmniVoice tự transcribe bằng Whisper.
        return self._gen_wav(text=text, ref_audio=ref_path)

    def design_wav(self, text: str, instruct: str) -> bytes:
        return self._gen_wav(text=text, instruct=(instruct or "").strip())
