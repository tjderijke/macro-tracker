// Barcode-scanner via de camera. Safari heeft geen ingebouwde BarcodeDetector,
// dus we laden een polyfill (ZXing in WebAssembly) die lokaal in /vendor staat.

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
let libPromise = null;

function loadLib() {
  if (libPromise) return libPromise;
  libPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'vendor/barcode-detector/ponyfill.js';
    s.onload = () => {
      const api = window.BarcodeDetectionAPI;
      const wasmUrl = new URL('vendor/barcode-detector/zxing_reader.wasm', document.baseURI).href;
      api.prepareZXingModule({
        overrides: {
          locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
        },
      });
      resolve(api);
    };
    s.onerror = () => {
      libPromise = null;
      reject(new Error('Scanner kon niet geladen worden.'));
    };
    document.head.appendChild(s);
  });
  return libPromise;
}

// Start de camera in `video` en roept onCode(code) aan bij de eerste geldige barcode.
// Geeft een stop()-functie terug.
export async function startScanner(video, onCode, onError) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error('Deze browser geeft geen toegang tot de camera. Open de app via HTTPS in Safari.');
  }
  const api = await loadLib();
  const detector = new api.BarcodeDetector({ formats: FORMATS });

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
  });
  video.srcObject = stream;
  video.setAttribute('playsinline', '');
  video.muted = true;
  await video.play();

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let stopped = false;
  let busy = false;
  let timer = null;

  const stop = () => {
    stopped = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  };

  const tick = async () => {
    if (stopped) return;
    if (!busy && video.readyState >= 2 && video.videoWidth) {
      busy = true;
      try {
        // Alleen het middelste deel van het beeld (waar het kader staat): sneller en nauwkeuriger.
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const cw = Math.round(vw * 0.9);
        const ch = Math.round(vh * 0.5);
        const scale = Math.min(1, 960 / cw);
        canvas.width = Math.round(cw * scale);
        canvas.height = Math.round(ch * scale);
        ctx.drawImage(video, (vw - cw) / 2, (vh - ch) / 2, cw, ch, 0, 0, canvas.width, canvas.height);
        const codes = await detector.detect(canvas);
        const hit = codes.find((c) => /^\d{8,14}$/.test(c.rawValue));
        if (hit && !stopped) {
          stop();
          onCode(hit.rawValue);
          return;
        }
      } catch (err) {
        onError?.(err);
      } finally {
        busy = false;
      }
    }
    timer = setTimeout(tick, 120);
  };
  tick();
  return stop;
}
