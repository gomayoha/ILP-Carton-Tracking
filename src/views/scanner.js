// Camera QR scanner + scanner-gun / keyboard input in one component.

import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { tr } from '../i18n.js';
import { Icon, Btn } from '../components.js';
import { state } from '../store.js';

let audio;
export function feedback(ok = true) {
  try {
    if (state.device.beep) {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = ok ? 1320 : 330;
      g.gain.value = 0.08;
      o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + (ok ? 0.08 : 0.25));
    }
    navigator.vibrate && navigator.vibrate(ok ? 60 : [80, 60, 80]);
  } catch {}
}

const isTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

export function Scanner({ onCode, compact }) {
  const video = useRef();
  const scanner = useRef(null);
  const last = useRef({ text: '', at: 0 });
  const [cam, setCam] = useState('idle'); // idle | starting | on | denied | none | insecure | error
  const [manual, setManual] = useState('');
  const [hasFlash, setHasFlash] = useState(false);
  const [flash, setFlash] = useState(false);

  const handle = (text) => {
    const now = Date.now();
    if (text === last.current.text && now - last.current.at < 2500) return; // same label still in view
    last.current = { text, at: now };
    onCode(text);
  };

  const start = async () => {
    if (!window.isSecureContext) { setCam('insecure'); return; }
    setCam('starting');
    try {
      const QrScanner = (await import('../../vendor/qr-scanner.min.js')).default;
      if (!(await QrScanner.hasCamera())) { setCam('none'); return; }
      const sc = new QrScanner(video.current, (res) => handle(res.data), {
        preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true,
        maxScansPerSecond: 8, returnDetailedScanResult: true,
        // The library's default reads only a 400 px copy of the middle 2/3 of the picture, so a small QR
        // (an A4 sheet of 10, or labels on a laptop screen) is too blurry to decode. Read the middle 85%
        // at up to 1000 px instead.
        calculateScanRegion: (v) => {
          const size = Math.round(0.85 * Math.min(v.videoWidth, v.videoHeight)), d = Math.min(size, 1000);
          return { x: Math.round((v.videoWidth - size) / 2), y: Math.round((v.videoHeight - size) / 2), width: size, height: size, downScaledWidth: d, downScaledHeight: d };
        },
      });
      scanner.current = sc;
      await sc.start();
      setCam('on');
      setHasFlash(await sc.hasFlash().catch(() => false));
    } catch (e) {
      console.warn(e);
      setCam(/denied|NotAllowed|Permission/i.test(String(e && (e.name || e.message || e))) ? 'denied' : 'error');
    }
  };

  // Backup for phones whose live camera can't focus close up (many iPhones): take a normal photo with
  // the phone's own camera (sharp, focuses close) and read the QR from that photo.
  const fileIn = useRef();
  const [photoMsg, setPhotoMsg] = useState('');
  const readPhoto = async (file) => {
    if (!file) return;
    setPhotoMsg(tr('Reading the photo…', 'Đang đọc ảnh…'));
    try {
      const QrScanner = (await import('../../vendor/qr-scanner.min.js')).default;
      const bmp = await createImageBitmap(file);
      let text = '';
      for (const max of [1600, 2600]) {
        const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas');
        c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        try { text = (await QrScanner.scanImage(c, { returnDetailedScanResult: true })).data; } catch {}
        if (text || k === 1) break;
      }
      if (!text) throw new Error('no QR');
      setPhotoMsg('');
      last.current = { text: '', at: 0 };
      handle(text);
    } catch (e) {
      feedback(false);
      setPhotoMsg(tr('No QR code found in the photo. Take it again with one sticker filling most of the picture.', 'Không tìm thấy mã QR trong ảnh. Chụp lại sao cho một nhãn chiếm gần hết khung hình.'));
    } finally { if (fileIn.current) fileIn.current.value = ''; }
  };

  const stop = () => {
    if (scanner.current) { scanner.current.stop(); scanner.current.destroy(); scanner.current = null; }
    setCam('idle');
  };

  useEffect(() => {
    if (isTouch()) start();
    return () => { if (scanner.current) { scanner.current.stop(); scanner.current.destroy(); scanner.current = null; } };
  }, []);

  const submitManual = () => {
    const v = manual.trim();
    if (!v) return;
    last.current = { text: '', at: 0 };
    handle(v);
    setManual('');
  };

  const msg = {
    denied: tr('Camera permission was refused. Allow camera access for this site in the browser settings, then try again.', 'Quyền camera bị từ chối. Cho phép camera cho trang này trong cài đặt trình duyệt rồi thử lại.'),
    none: tr('No camera found on this device. Use a scanner gun or type the carton ID below.', 'Thiết bị không có camera. Dùng súng quét hoặc nhập mã thùng bên dưới.'),
    insecure: tr('The camera only works when the app is opened over https:// (the published link).', 'Camera chỉ hoạt động khi mở ứng dụng qua https:// (đường link chính thức).'),
    error: tr('Could not start the camera. Close other apps using it and try again.', 'Không mở được camera. Đóng ứng dụng khác đang dùng camera rồi thử lại.'),
  }[cam];

  return html`<div class=${'scanner ' + (compact ? 'compact' : '')}>
    <div class=${'scan-view ' + cam}>
      <video ref=${video} playsinline muted></video>
      ${cam !== 'on' && html`<div class="scan-overlay">
        ${cam === 'starting' ? html`<p>${tr('Starting camera…', 'Đang mở camera…')}</p>` : html`
          <${Icon} name="camera" size="34" />
          ${msg && html`<p>${msg}</p>`}
          <${Btn} kind="primary" icon="camera" onClick=${start}>${tr('Start camera', 'Mở camera')}</${Btn}>`}
      </div>`}
      ${cam === 'on' && html`<div class="scan-tools">
        ${hasFlash && html`<button class="icon-btn light" aria-pressed=${flash} onClick=${async () => { await scanner.current.toggleFlash(); setFlash(scanner.current.isFlashOn()); }} aria-label=${tr('Torch', 'Đèn')}><${Icon} name="sparkle" /></button>`}
        <button class="icon-btn light" onClick=${stop} aria-label=${tr('Stop camera', 'Tắt camera')}><${Icon} name="x" /></button>
      </div>`}
    </div>
    <div class="scan-photo">
      <input ref=${fileIn} type="file" accept="image/*" capture="environment" hidden onChange=${(e) => readPhoto(e.target.files && e.target.files[0])} />
      <${Btn} icon="camera" onClick=${() => fileIn.current && fileIn.current.click()}>${tr('Scan with photo', 'Quét bằng ảnh chụp')}</${Btn}>
      <span class="muted small">${photoMsg || tr('Live camera not reading? Hold the phone 20–30 cm away, or take a photo of the sticker.', 'Camera không đọc được? Cầm điện thoại cách 20–30 cm, hoặc chụp ảnh nhãn.')}</span>
    </div>
    <div class="scan-manual">
      <${Icon} name="keyboard" />
      <input class="input" value=${manual} placeholder=${tr('Scanner gun or type carton ID, then Enter', 'Súng quét hoặc nhập mã thùng rồi Enter')}
        autocomplete="off" spellcheck="false" enterkeyhint="go"
        onInput=${(e) => setManual(e.target.value)}
        onKeyDown=${(e) => {
          if (e.key === 'Tab' && manual) { e.preventDefault(); setManual(manual + '\t'); }
          if (e.key === 'Enter') { e.preventDefault(); submitManual(); }
        }} />
      <${Btn} small onClick=${submitManual} disabled=${!manual.trim()}>${tr('Look up', 'Tra cứu')}</${Btn}>
    </div>
  </div>`;
}
