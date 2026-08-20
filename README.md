# Cadence

Voice dictation. Hold a hotkey (or the on-screen bar), speak, and polished text lands where the cursor was.

Live site: https://berkkarabacak.github.io/cadence-dictation/

Paused 20 Aug 2026. Everything needed to resume is in this repo.

## What is in this repo

- Marketing site (static HTML/CSS/JS) with an in-page hold-to-talk demo
- Windows dictation app under `windows/` (Whisper `small.en`, SAPI fallback)
- Accent and speech tests under `windows/`

Do not use the Wispr name, logo, or taglines.

## Site

No build step:

```
python3 -m http.server 8080
```

Open http://localhost:8080/ in Chrome or Edge for the mic demo.

Trial is WinRAR-style: dictation never locks. Checkout can nag after 14 days. Stripe Payment Links go in `config.js` (`CADENCE_STRIPE_PAYMENT_LINKS`). Empty means no card charge.

## Windows app

See [windows/README.md](windows/README.md).

On the XPS13 Desktop the working copy was:

- `C:\Users\XPS13\Desktop\Cadence` — site
- `C:\Users\XPS13\Desktop\CadenceApp` — app + `.venv` with faster-whisper
- `C:\Users\XPS13\Desktop\Start Cadence.cmd` — launches the venv app
- `C:\Users\XPS13\Desktop\Cadence.exe` — older one-file build (SAPI era; prefer the venv app)

Hold the green bar to talk. Ctrl+Shift if the hotkey library is installed. Esc quits.

## Tests (20 Aug 2026)

Whisper `small.en`, CPU int8. Scores vs known words:

| Clip | Score | Heard |
| --- | --- | --- |
| Scottish English | 100% | Exact squirrels / third-world-countries line |
| Irish English | 100% | Irish heart / harps in Ireland |
| British RP | 100% | Full North Wind and the Sun paragraph |
| Indian English | 100% | I want to dance. Can you help me? |
| Australian slang | 100% | How's it going? |
| Cockney weather | 100% | London / Tower Bridge weather report |
| Australian short | 67% | "Telling he's dreaming" (dropped him) |
| Australian mate | 67% | "Hey, Mike" instead of "hey mate" |

Full notes: [windows/accent-results.md](windows/accent-results.md)

## Left for later

- Stripe so Pro can actually charge
- Rebuild Cadence.exe with Whisper (current exe is the old listener)
- Sign the exe (SmartScreen)
- Public download button on the site pointing at a real installer
- Stronger handling of two-second slang clips
