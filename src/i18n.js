// Bilingual UI. Every string is written inline as tr('English', 'Tiếng Việt') so both
// languages always stay together. Printouts use bi() which shows both, like the paper forms.

const KEY = 'ilp.lang';
let lang = (() => {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'vi' || saved === 'en') return saved;
  } catch {}
  return (navigator.language || '').toLowerCase().startsWith('vi') ? 'vi' : 'en';
})();

const listeners = new Set();

export const getLang = () => lang;

export function setLang(l) {
  lang = l === 'vi' ? 'vi' : 'en';
  try { localStorage.setItem(KEY, lang); } catch {}
  document.documentElement.lang = lang;
  listeners.forEach((f) => f(lang));
}

export const onLang = (f) => { listeners.add(f); return () => listeners.delete(f); };

export const tr = (en, vi) => (lang === 'vi' ? vi : en);

// Vietnamese first, English second — the order used on Ideal Pack paper forms.
export const bi = (en, vi) => `${vi} / ${en}`;

document.documentElement.lang = lang;
