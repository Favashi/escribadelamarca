// Lector de códigos de barras con la cámara.
// Usa BarcodeDetector nativo (Chrome/Android) y, si no existe (iOS Safari, Firefox), ZXing cargado bajo demanda.
import { normalizeCode } from './isbn.js';

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
const ZXING_URL = 'https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm';

async function nativeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const supported = await window.BarcodeDetector.getSupportedFormats();
    const formats = FORMATS.filter((f) => supported.includes(f));
    return formats.length ? new window.BarcodeDetector({ formats }) : null;
  } catch { return null; }
}

/**
 * Arranca el escáner sobre un <video>. onCode(code) recibe el código ya normalizado.
 * Devuelve { stop, torch(on), hasTorch }.
 */
export async function startScanner(video, onCode) {
  let stopped = false;
  let lastCode = null;
  let lastAt = 0;

  const emit = (rawValue) => {
    const code = normalizeCode(rawValue);
    if (!code || stopped) return;
    const now = Date.now();
    if (code === lastCode && now - lastAt < 2500) return; // evita lecturas duplicadas
    lastCode = code; lastAt = now;
    navigator.vibrate?.(80);
    onCode(code);
  };

  const constraints = {
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  };

  const detector = await nativeDetector();
  let zxControls = null;
  let timer = null;

  if (detector) {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    video.setAttribute('playsinline', '');
    video.muted = true;
    await video.play();
    const tick = async () => {
      if (stopped) return;
      try {
        if (video.readyState >= 2) {
          const codes = await detector.detect(video);
          if (codes[0]) emit(codes[0].rawValue);
        }
      } catch { /* frame no disponible */ }
      timer = setTimeout(tick, 150);
    };
    tick();
  } else {
    const { BrowserMultiFormatReader } = await import(ZXING_URL);
    const reader = new BrowserMultiFormatReader();
    zxControls = await reader.decodeFromConstraints(constraints, video, (result) => {
      if (result) emit(result.getText());
    });
  }

  const track = () => video.srcObject?.getVideoTracks?.()[0];
  const caps = track()?.getCapabilities?.() ?? {};

  return {
    hasTorch: !!caps.torch,
    async torch(on) {
      try { await track()?.applyConstraints({ advanced: [{ torch: on }] }); } catch { /* no soportado */ }
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
      zxControls?.stop();
      video.srcObject?.getTracks?.().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}

export const cameraAvailable = () => !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
