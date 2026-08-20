# Cadence for Windows

Hold Ctrl+Shift, or hold the green bar, speak, text is inserted at the caret.

Uses faster-whisper `small.en` on CPU (int8). Falls back to Windows SAPI if Whisper fails.

## Run

```
python -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\pythonw cadence_app.py
```

First launch downloads the Whisper model and may take a minute.

## Build exe

```
powershell -File build.ps1
```

A Whisper-bundled exe will be large. The venv + `pythonw cadence_app.py` path is the one that was tested.

## Tests

- `self_test.py` — fillers, actually-correction, speech engine, clipboard
- `accent_test.py` — Scottish Freesound clip vs known sentence
- `sapi_test.py` — Windows speech engine smoke test
- `accent-results.md` — multi-accent scores from 20 Aug 2026
