import os
import re
import sys
import tempfile
import threading
import wave
import subprocess
import ctypes
from ctypes import wintypes

import numpy as np
import sounddevice as sd
from pynput import keyboard
import tkinter as tk

SAMPLE_RATE = 16000
CHANNELS = 1
HOTKEY = {keyboard.Key.ctrl_l, keyboard.Key.cmd}

user32 = ctypes.windll.user32


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


KEYEVENTF_UNICODE = 0x0004
KEYEVENTF_KEYUP = 0x0002
INPUT_KEYBOARD = 1


def insert_text(text: str) -> None:
    extras = ctypes.c_ulong(0)
    for ch in text:
        down = INPUT(type=INPUT_KEYBOARD)
        down.ki = KEYBDINPUT(0, ord(ch), KEYEVENTF_UNICODE, 0, ctypes.pointer(extras))
        up = INPUT(type=INPUT_KEYBOARD)
        up.ki = KEYBDINPUT(0, ord(ch), KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, 0, ctypes.pointer(extras))
        user32.SendInput(1, ctypes.byref(down), ctypes.sizeof(INPUT))
        user32.SendInput(1, ctypes.byref(up), ctypes.sizeof(INPUT))


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
                text = after[0].upper() + after[1:] if after else after
    if text and text[0].islower():
        text = text[0].upper() + text[1:]
    return text


def transcribe_wav(path: str) -> str:
    script = (
        "Add-Type -AssemblyName System.Speech;"
        "$e = New-Object System.Speech.Recognition.SpeechRecognitionEngine;"
        f"$e.SetInputToWaveFile('{path}');"
        "$e.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar));"
        "$r = $e.Recognize();"
        "if ($r) { $r.Text }"
    )
    try:
        out = subprocess.run(
            ["powershell", "-NoProfile", "-Command", script],
            capture_output=True,
            text=True,
            timeout=45,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        return (out.stdout or "").strip()
    except Exception:
        return ""


class CadenceApp:
    def __init__(self) -> None:
        self.recording = False
        self.frames: list[np.ndarray] = []
        self.stream = None
        self.target_hwnd = None
        self.pressed = set()
        self.root = tk.Tk()
        self.root.title("Cadence")
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)
        self.root.configure(bg="#0f3d3a")
        self.root.geometry("280x44+40+40")
        self.label = tk.Label(
            self.root,
            text="Hold Ctrl+Win · Cadence",
            fg="#f4efe4",
            bg="#0f3d3a",
            font=("Segoe UI", 11),
        )
        self.label.pack(expand=True, fill="both", padx=14, pady=8)
        self.root.bind("<Escape>", lambda _e: self.quit())

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
        self.stream = sd.InputStream(
            samplerate=SAMPLE_RATE,
            channels=CHANNELS,
            dtype="int16",
            callback=self.audio_cb,
        )
        self.stream.start()

    def stop_rec(self) -> None:
        if not self.recording:
            return
        self.recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
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
            insert_text(text if text.endswith(" ") else text + " ")
        self.set_status("Hold Ctrl+Win · Cadence")

    def on_press(self, key) -> None:
        if key == keyboard.Key.esc:
            self.quit()
            return
        self.pressed.add(key)
        if HOTKEY.issubset(self.pressed):
            self.start_rec()

    def on_release(self, key) -> None:
        self.pressed.discard(key)
        if self.recording and not HOTKEY.issubset(self.pressed):
            self.stop_rec()

    def quit(self) -> None:
        self.recording = False
        self.root.destroy()
        os._exit(0)

    def run(self) -> None:
        listener = keyboard.Listener(on_press=self.on_press, on_release=self.on_release)
        listener.daemon = True
        listener.start()
        self.root.mainloop()


if __name__ == "__main__":
    CadenceApp().run()
