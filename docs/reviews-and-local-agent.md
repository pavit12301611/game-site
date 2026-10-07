# Reviews & Local Agent

## Model Provenance

The sentiment model is `Xenova/distilbert-base-uncased-finetuned-sst-2-english`, a quantized DistilBERT model that runs entirely in the browser via WebAssembly.

## First-Use Download

The quantized weights (~65MB) download on first use and are cached by the browser.

## Privacy

No review text is sent to any external API. Analysis happens entirely on-device.

## Automatic Replies

The backend attaches a reply from the "Arcade Review Agent" using fallback sentiment logic.