/**
 * SEO.js — Dynamic meta tag manager
 * Usage:  <SEO title="..." description="..." />
 * No extra npm package needed — uses plain DOM manipulation.
 */
import { useEffect } from 'react';

const BASE_URL = 'https://www.tokenwalla.in';
const DEFAULT_IMAGE = `${BASE_URL}/og-image.png`;

export default function SEO({
  title,
  description,
  keywords,
  image   = DEFAULT_IMAGE,
  url,
  type    = 'website',
  noIndex = false,
}) {
  const fullTitle = title
    ? `${title} | TokenWalla`
    : 'TokenWalla — Book Doctor Appointments Online | Skip Hospital Queue';

  const fullDesc = description ||
    'Book doctor appointments online in AP & Telangana. Get a digital token, skip the waiting room, and track your live queue position.';

  const fullUrl = url ? `${BASE_URL}${url}` : BASE_URL;

  useEffect(() => {
    // ── Title ──
    document.title = fullTitle;

    // Helper to set/create a meta tag
    const setMeta = (selector, content) => {
      let el = document.querySelector(selector);
      if (!el) {
        el = document.createElement('meta');
        // Parse selector to set attribute
        const match = selector.match(/\[(.+?)="(.+?)"\]/);
        if (match) el.setAttribute(match[1], match[2]);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    const setLink = (rel, href) => {
      let el = document.querySelector(`link[rel="${rel}"]`);
      if (!el) {
        el = document.createElement('link');
        el.setAttribute('rel', rel);
        document.head.appendChild(el);
      }
      el.setAttribute('href', href);
    };

    // ── Standard meta ──
    setMeta('[name="description"]',  fullDesc);
    setMeta('[name="robots"]',       noIndex ? 'noindex, nofollow' : 'index, follow');
    if (keywords) setMeta('[name="keywords"]', keywords);

    // ── Canonical ──
    setLink('canonical', fullUrl);

    // ── Open Graph ──
    setMeta('[property="og:title"]',       fullTitle);
    setMeta('[property="og:description"]', fullDesc);
    setMeta('[property="og:url"]',         fullUrl);
    setMeta('[property="og:type"]',        type);
    setMeta('[property="og:image"]',       image);

    // ── Twitter ──
    setMeta('[name="twitter:title"]',       fullTitle);
    setMeta('[name="twitter:description"]', fullDesc);
    setMeta('[name="twitter:image"]',       image);
    setMeta('[name="twitter:url"]',         fullUrl);

  }, [fullTitle, fullDesc, fullUrl, image, type, keywords, noIndex]);

  return null;
}