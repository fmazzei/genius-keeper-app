import traceback,sys
try:
    from faster_whisper import WhisperModel
    m = WhisperModel("large-v3", device="cpu", compute_type="int8")
    for i in (1,2,3):
        segs,_ = m.transcribe(f"audio/clip{i}.wav", language="es", word_timestamps=True, beam_size=5)
        lines=[f"[{s.start:.2f}-{s.end:.2f}] {s.text.strip()}" for s in segs]
        print(f"::notice title=clip{i}::" + " %0A ".join(lines))
except Exception:
    print("::notice title=error::" + traceback.format_exc().replace("\n"," %0A "))
