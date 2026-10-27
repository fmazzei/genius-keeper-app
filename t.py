import traceback
try:
    from faster_whisper import WhisperModel
    m = WhisperModel("large-v3", device="cpu", compute_type="int8")
    segs,_ = m.transcribe("audio/clip1.wav", language="es", beam_size=5, vad_filter=True, vad_parameters={"min_silence_duration_ms":250})
    lines=[f"[{s.start:.2f}-{s.end:.2f}] {s.text.strip()}" for s in segs]
    print("::notice title=clip1::" + " %0A ".join(lines))
except Exception:
    print("::notice title=error::" + traceback.format_exc().replace("\n"," %0A "))
