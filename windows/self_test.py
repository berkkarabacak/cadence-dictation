import os
import sys
import tempfile
import subprocess
import ctypes
from ctypes import wintypes

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cadence_app import clean_text, transcribe_wav, copy_to_clipboard

user32 = ctypes.windll.user32
kernel32 = ctypes.windll.kernel32
CF_UNICODETEXT = 13

lines = []


def check(name, ok, detail=""):
    mark = "PASS" if ok else "FAIL"
    lines.append(f"{mark}  {name}" + (f"  {detail}" if detail else ""))


def read_clipboard():
    user32.OpenClipboard(0)
    try:
        handle = user32.GetClipboardData(CF_UNICODETEXT)
        if not handle:
            return ""
        locked = kernel32.GlobalLock(handle)
        text = ctypes.wstring_at(locked)
        kernel32.GlobalUnlock(handle)
        return text
    finally:
        user32.CloseClipboard()


def make_speech_wav():
    wav = os.path.join(tempfile.gettempdir(), "cadence-self-test.wav")
    ps = (
        "Add-Type -AssemblyName System.Speech\n"
        f"$s = New-Object System.Speech.Synthesis.SpeechSynthesizer\n"
        f"$s.SetOutputToWaveFile('{wav.replace(chr(39), chr(39)+chr(39))}')\n"
        "$s.Speak('The meeting is at three o clock tomorrow')\n"
        "$s.Dispose()\n"
    )
    script = os.path.join(tempfile.gettempdir(), "cadence-tts.ps1")
    with open(script, "w", encoding="utf-8") as f:
        f.write(ps)
    subprocess.run(["powershell", "-NoProfile", "-File", script], check=True, timeout=30)
    return wav


def main():
    cleaned = clean_text("um hello uh there")
    check("clean fillers", "hello" in cleaned.lower() and "um" not in cleaned.lower(), cleaned)

    corrected = clean_text("send it Friday actually send it Monday")
    check("clean actually-correction", "monday" in corrected.lower(), corrected)

    wav = make_speech_wav()
    heard = transcribe_wav(wav)
    heard_l = heard.lower()
    check(
        "speech engine hears spoken words",
        ("meeting" in heard_l) or ("three" in heard_l) or ("tomorrow" in heard_l),
        heard or "(empty)",
    )

    copy_to_clipboard("Cadence clipboard ok")
    clip = read_clipboard()
    check("clipboard write/read", "Cadence clipboard ok" in clip, clip.strip())

    out = os.path.join(os.path.expanduser("~"), "Desktop", "Cadence-test-results.txt")
    body = "Cadence self-test\n" + "\n".join(lines) + "\n"
    with open(out, "w", encoding="utf-8") as f:
        f.write(body)
    print(body)
    print("Wrote", out)
    failed = any(x.startswith("FAIL") for x in lines)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
