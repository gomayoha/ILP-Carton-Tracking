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
