import os
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cadence_app import _transcribe_whisper, _transcribe_sapi, clean_text

CLIP_URL = "https://cdn.freesound.org/previews/220/220525_2631570-hq.mp3"
EXPECTED = "will you tell the girls about the murder rate of squirrels in third world countries"
KEYS = ["will", "tell", "girls", "murder", "squirrels", "third", "world", "countries"]


def download(path):
    req = urllib.request.Request(CLIP_URL, headers={"User-Agent": "CadenceAccentTest/1.0"})
    with urllib.request.urlopen(req, timeout=60) as src, open(path, "wb") as out:
        out.write(src.read())


def first_seconds(src, dest, seconds=22):
    import av
    import numpy as np
    import wave

    container = av.open(src)
    stream = container.streams.audio[0]
    resampler = av.audio.resampler.AudioResampler(format="s16", layout="mono", rate=16000)
    chunks = []
    limit = seconds * 16000
    got = 0
    for frame in container.decode(stream):
        for converted in resampler.resample(frame):
            arr = converted.to_ndarray()
            if arr.ndim > 1:
                arr = arr[0]
            arr = arr.astype(np.int16)
            take = min(len(arr), limit - got)
            if take <= 0:
                break
            chunks.append(arr[:take])
            got += take
        if got >= limit:
            break
    leftover = resampler.resample(None)
    if leftover:
        for converted in leftover:
            arr = converted.to_ndarray()
            if arr.ndim > 1:
                arr = arr[0]
            chunks.append(arr.astype(np.int16))
    audio = np.concatenate(chunks) if chunks else np.zeros(16000, dtype=np.int16)
    with wave.open(dest, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(16000)
        wf.writeframes(audio.tobytes())
    return dest


def score(text):
    low = text.lower()
    hits = [k for k in KEYS if k in low]
    return hits, round(100 * len(hits) / len(KEYS))


def main():
    root = os.path.dirname(os.path.abspath(__file__))
    mp3 = os.path.join(root, "scottish-sample.mp3")
    wav = os.path.join(root, "scottish-sample.wav")
    print("Downloading Scottish English clip...", flush=True)
    download(mp3)
    print("Trimming first 22 seconds...", flush=True)
    first_seconds(mp3, wav, 22)
    print("Whisper (small.en)...", flush=True)
    whisper = clean_text(_transcribe_whisper(wav))
    print("SAPI (old US engine)...", flush=True)
    sapi = clean_text(_transcribe_sapi(wav))
    w_hits, w_pct = score(whisper)
    s_hits, s_pct = score(sapi)
    lines = [
        "Cadence accent test",
        "Source: Freesound 220525 urbaneguerilla, Scots Standard English",
        "Expected: " + EXPECTED,
        "",
        "WHISPER: " + (whisper or "(empty)"),
        "WHISPER keywords: %s/%s (%s%%) %s" % (len(w_hits), len(KEYS), w_pct, w_hits),
        "",
        "SAPI: " + (sapi or "(empty)"),
        "SAPI keywords: %s/%s (%s%%) %s" % (len(s_hits), len(KEYS), s_pct, s_hits),
    ]
    body = "\n".join(lines) + "\n"
    out = os.path.join(os.path.expanduser("~"), "Desktop", "Cadence-scottish-test.txt")
    with open(out, "w", encoding="utf-8") as f:
        f.write(body)
    print(body, flush=True)
    print("Wrote", out, flush=True)
    sys.exit(0 if w_pct >= 70 else 1)


if __name__ == "__main__":
    main()
