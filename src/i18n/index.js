import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './en.json';
import hi from './hi.json';
import te from './te.json';
import kn from './kn.json';

export const LANG_STORAGE_KEY = 'tw_lang';
export const SUPPORTED_LANGS = ['en', 'hi', 'te', 'kn'];

function readStoredLang() {
  try { return localStorage.getItem(LANG_STORAGE_KEY); } catch { return null; }
}

function writeStoredLang(lng) {
  try { localStorage.setItem(LANG_STORAGE_KEY, lng); } catch { /* storage unavailable */ }
}

const storedLang = readStoredLang();
const initialLang = SUPPORTED_LANGS.includes(storedLang) ? storedLang : 'en';

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      hi: { translation: hi },
      te: { translation: te },
      kn: { translation: kn },
    },
    lng: initialLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  });

i18n.on('languageChanged', writeStoredLang);

export default i18n;
