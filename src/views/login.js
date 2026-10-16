import { html, useState } from '../../vendor/preact-htm.js';
import { tr, getLang, setLang } from '../i18n.js';
import { signIn } from '../store.js';
import { Btn, Field, Input, Icon } from '../components.js';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr('');
    try { await signIn(email.trim(), pw); }
    catch (ex) { setErr(/network/i.test(ex.code || '') ? tr('No connection. The first sign-in on a device needs internet.', 'Không có mạng. Lần đăng nhập đầu tiên cần có internet.') : tr('Wrong email or password.', 'Sai email hoặc mật khẩu.')); }
    setBusy(false);
  };
  return html`<div class="login">
    <form class="card login-card" onSubmit=${submit}>
      <img src="assets/img/logo.png" alt="Idea L Pack" />
      <p class="eyebrow">CARTON TRACKING</p>
      <h1>${tr('Sign in', 'Đăng nhập')}</h1>
      <p class="muted">${tr('Once per device. You stay signed in after that.', 'Mỗi thiết bị chỉ cần một lần. Sau đó sẽ luôn đăng nhập.')}</p>
      <${Field} label="Email"><${Input} type="email" value=${email} onInput=${setEmail} autofocus /></${Field}>
      <${Field} label=${tr('Password', 'Mật khẩu')}><${Input} type="password" value=${pw} onInput=${setPw} /></${Field}>
      ${err && html`<p class="field-error"><${Icon} name="alert" /> ${err}</p>`}
      <${Btn} kind="primary" type="submit" disabled=${busy || !email || !pw}>${busy ? tr('Signing in…', 'Đang đăng nhập…') : tr('Sign in', 'Đăng nhập')}</${Btn}>
      <div class="lang center"><button type="button" aria-pressed=${getLang() === 'vi'} onClick=${() => setLang('vi')}>VI</button><button type="button" aria-pressed=${getLang() === 'en'} onClick=${() => setLang('en')}>EN</button></div>
    </form>
  </div>`;
}
