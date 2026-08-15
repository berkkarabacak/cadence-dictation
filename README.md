# Cadence

Cadence is a voice dictation product. Speak naturally — rambles, pauses, mid-course corrections — and it types the polished line you meant to write, in the app you already have open.

This repo is a static marketing site plus an in-browser dictation demo (Web Speech cleanup, a weekly Free word cap, and a Pro paywall).

## Run locally

No build step. From this directory:

```
python3 -m http.server 8080
```

Then open http://localhost:8080/

Chrome or Edge is required for live microphone dictation. The Demo page plays scripted rooms without a mic.

## Pro checkout

Checkout reads Stripe Payment Links from `config.js` (`CADENCE_STRIPE_PAYMENT_LINKS.monthly` and `.annual`). Leave them empty and checkout starts a 14-day Pro trial in this browser — no card is charged.
