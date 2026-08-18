import os
import re
import sys
import tempfile
import threading
import wave
import subprocess
import time
import ctypes
from ctypes import wintypes

import numpy as np
import sounddevice as sd
import tkinter as tk

try:
    from pynput import keyboard
except Exception:
    keyboard = None

SAMPLE_RATE = 16000
CHANNELS = 1
WHISPER_MODEL = "small.en"

user32 = ctypes.WinDLL("user32", use_last_error=True)
kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
_whisper = None


class KEYBDINPUT(ctypes.Structure):
    _fields_ = (
        ("wVk", wintypes.WORD),
        ("wScan", wintypes.WORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    )


class MOUSEINPUT(ctypes.Structure):
    _fields_ = (
        ("dx", wintypes.LONG),
        ("dy", wintypes.LONG),
        ("mouseData", wintypes.DWORD),
        ("dwFlags", wintypes.DWORD),
        ("time", wintypes.DWORD),
        ("dwExtraInfo", ctypes.POINTER(ctypes.c_ulong)),
    )


class HARDWAREINPUT(ctypes.Structure):
    _fields_ = (
        ("uMsg", wintypes.DWORD),
        ("wParamL", wintypes.WORD),
        ("wParamH", wintypes.WORD),
    )


class INPUT(ctypes.Structure):
    class _INPUT(ctypes.Union):
        _fields_ = (("ki", KEYBDINPUT), ("mi", MOUSEINPUT), ("hi", HARDWAREINPUT))

    _anonymous_ = ("_input",)
    _fields_ = (("type", wintypes.DWORD), ("_input", _INPUT))


INPUT_KEYBOARD = 1
KEYEVENTF_KEYUP = 0x0002
VK_CONTROL = 0x11
VK_V = 0x56
CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002

user32.GetForegroundWindow.restype = wintypes.HWND
user32.SetForegroundWindow.argtypes = [wintypes.HWND]
user32.SetForegroundWindow.restype = wintypes.BOOL
user32.OpenClipboard.argtypes = [wintypes.HWND]
user32.OpenClipboard.restype = wintypes.BOOL
user32.EmptyClipboard.restype = wintypes.BOOL
user32.CloseClipboard.restype = wintypes.BOOL
user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
user32.SetClipboardData.restype = wintypes.HANDLE
user32.GetClipboardData.argtypes = [wintypes.UINT]
user32.GetClipboardData.restype = wintypes.HANDLE
user32.SendInput.argtypes = [wintypes.UINT, ctypes.POINTER(INPUT), ctypes.c_int]
user32.SendInput.restype = wintypes.UINT
kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
kernel32.GlobalLock.restype = ctypes.c_void_p
kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]


def copy_to_clipboard(text: str) -> None:
    data = text.encode("utf-16-le") + b"\x00\x00"
    handle = kernel32.GlobalAlloc(GMEM_MOVEABLE, len(data))
    if not handle:
        raise OSError("GlobalAlloc failed")
    locked = kernel32.GlobalLock(handle)
    if not locked:
        raise OSError("GlobalLock failed")
    ctypes.memmove(locked, data, len(data))
    kernel32.GlobalUnlock(handle)
    opened = False
    for _ in range(8):
        if user32.OpenClipboard(None):
            opened = True
            break
        time.sleep(0.05)
    if not opened:
        raise OSError("OpenClipboard failed")
    try:
        user32.EmptyClipboard()
        if not user32.SetClipboardData(CF_UNICODETEXT, handle):
            raise OSError("SetClipboardData failed")
    finally:
        user32.CloseClipboard()


def paste_keys() -> None:
    extras = ctypes.c_ulong(0)

    def key(vk, flags=0):
        ev = INPUT(type=INPUT_KEYBOARD)
        ev.ki = KEYBDINPUT(vk, 0, flags, 0, ctypes.pointer(extras))
        user32.SendInput(1, ctypes.byref(ev), ctypes.sizeof(INPUT))

    key(VK_CONTROL)
    key(VK_V)
    key(VK_V, KEYEVENTF_KEYUP)
    key(VK_CONTROL, KEYEVENTF_KEYUP)


def insert_text(text: str) -> None:
    if not text:
        return
    copy_to_clipboard(text if text.endswith(" ") else text + " ")
    paste_keys()


def clean_text(raw: str) -> str:
    if not raw:
        return ""
    text = raw.strip()
    text = re.sub(r"\b(um+|uh+|erm+|like)\b", "", text, flags=re.I)
    text = re.sub(r"\s+", " ", text).strip()
    for cue in ("actually", "wait no", "I mean"):
        idx = text.lower().rfind(cue)
        if idx >= 0:
            after = text[idx + len(cue) :].strip(" ,.")
            if after:
                text = after[0].upper() + after[1:]
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text


def _transcribe_sapi(path: str) -> str:
    safe = path.replace("'", "''")
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$e = New-Object System.Speech.Recognition.SpeechRecognitionEngine;"
        f"$e.SetInputToWaveFile('{safe}');"
        "$e.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));"
        "$e.InitialSilenceTimeout = [TimeSpan]::FromSeconds(2);"
        "$r = $e.Recognize();"
        "if ($r) { $r.Text }"
    )
    flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            timeout=60,
            creationflags=flags,
        )
        return (out.stdout or "").strip()
    except Exception:
        return ""


def _load_whisper():
    global _whisper
    if _whisper is None:
        from faster_whisper import WhisperModel

        _whisper = WhisperModel(WHISPER_MODEL, device="cpu", compute_type="int8")
    return _whisper


def _transcribe_whisper(path: str) -> str:
    model = _load_whisper()
    segments, _info = model.transcribe(
        path,
        language="en",
        beam_size=5,
        vad_filter=True,
        condition_on_previous_text=False,
    )
    return " ".join(seg.text.strip() for seg in segments).strip()


def transcribe_wav(path: str) -> str:
    try:
        text = _transcribe_whisper(path)
        if text:
            return text
    except Exception:
        pass
    return _transcribe_sapi(path)


def is_ctrl(key) -> bool:
    if keyboard is None:
        return False
    return key in (keyboard.Key.ctrl, keyboard.Key.ctrl_l, keyboard.Key.ctrl_r)


def is_shift(key) -> bool:
    if keyboard is None:
        return False
    return key in (keyboard.Key.shift, keyboard.Key.shift_l, keyboard.Key.shift_r)


class CadenceApp:
    def __init__(self) -> None:
        self.recording = False
        self.frames: list = []
        self.stream = None
        self.target_hwnd = None
        self.ctrl = False
        self.shift = False
        self.root = tk.Tk()
        self.root.title("Cadence")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg="#0f3d3a")
        self.root.geometry("340x48+40+40")
        idle = "Hold Ctrl+Shift, or hold this bar" if keyboard else "Hold this bar to talk"
        self.label = tk.Label(
            self.root,
            text="Loading speech model…",
            fg="#f4efe4",
            bg="#0f3d3a",
            font=("Segoe UI", 11),
        )
        self.label.pack(expand=True, fill="both", padx=14, pady=10)
        self.label.bind("<ButtonPress-1>", lambda _e: self.start_rec())
        self.label.bind("<ButtonRelease-1>", lambda _e: self.stop_rec())
        self.root.bind("<Escape>", lambda _e: self.quit())
        self.idle = idle
        threading.Thread(target=self.warmup, daemon=True).start()

    def warmup(self) -> None:
        try:
            _load_whisper()
            self.set_status(self.idle)
        except Exception:
            self.set_status("Hold this bar to talk")

    def set_status(self, text: str) -> None:
        self.root.after(0, lambda: self.label.config(text=text))

    def audio_cb(self, indata, _frames, _time, _status) -> None:
        if self.recording:
            self.frames.append(indata.copy())

    def start_rec(self) -> None:
        if self.recording:
            return
        self.target_hwnd = user32.GetForegroundWindow()
        self.frames = []
        self.recording = True
        self.set_status("Listening…")
        try:
            self.stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=CHANNELS,
                dtype="int16",
                callback=self.audio_cb,
            )
            self.stream.start()
        except Exception:
            self.recording = False
            self.set_status("Mic failed · check Windows permission")

    def stop_rec(self) -> None:
        if not self.recording:
            return
        self.recording = False
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:
                pass
            self.stream = None
        self.set_status("Writing…")
        threading.Thread(target=self.finish, daemon=True).start()

    def finish(self) -> None:
        text = ""
        if self.frames:
            audio = np.concatenate(self.frames, axis=0)
            fd, path = tempfile.mkstemp(suffix=".wav")
            os.close(fd)
            with wave.open(path, "wb") as wf:
                wf.setnchannels(CHANNELS)
                wf.setsampwidth(2)
                wf.setframerate(SAMPLE_RATE)
                wf.writeframes(audio.tobytes())
            text = clean_text(transcribe_wav(path))
            try:
                os.remove(path)
            except OSError:
                pass
        if text and self.target_hwnd:
            user32.SetForegroundWindow(self.target_hwnd)
            try:
                insert_text(text)
                self.set_status(self.idle)
            except Exception:
                self.set_status("Could not paste · try again")
        elif text:
            self.set_status(text[:40])
        else:
            self.set_status("Heard nothing · try again")
            self.root.after(2500, lambda: self.set_status(self.idle))

    def on_press(self, key) -> None:
        if keyboard is None:
            return
        if key == keyboard.Key.esc:
            self.quit()
            return
        if is_ctrl(key):
            self.ctrl = True
        if is_shift(key):
            self.shift = True
        if self.ctrl and self.shift:
            self.start_rec()

    def on_release(self, key) -> None:
        if keyboard is None:
            return
        if is_ctrl(key):
            self.ctrl = False
        if is_shift(key):
            self.shift = False
        if self.recording and not (self.ctrl and self.shift):
            if key in (
                keyboard.Key.ctrl,
                keyboard.Key.ctrl_l,
                keyboard.Key.ctrl_r,
                keyboard.Key.shift,
                keyboard.Key.shift_l,
                keyboard.Key.shift_r,
            ):
                self.stop_rec()

    def quit(self) -> None:
        self.recording = False
        try:
            self.root.destroy()
        except Exception:
            pass
        os._exit(0)

    def run(self) -> None:
        if keyboard is not None:
            listener = keyboard.Listener(on_press=self.on_press, on_release=self.on_release)
            listener.daemon = True
            listener.start()
        self.root.mainloop()


if __name__ == "__main__":
    CadenceApp().run()
