/* ── Shared auth layout styles ────────────────────────────────────────────
   Export this string and spread into any auth page's <style> block.
   Usage: <style>{authCSS}</style>
─────────────────────────────────────────────────────────────────────────── */

export const authCSS = `
  .auth-page {
    font-family: 'DM Sans', sans-serif;
    min-height: 100vh;
    background: #fff;
    display: flex;
    align-items: stretch;
    color: var(--gray-900);
  }

  /* ── LEFT PANEL ── */
  .auth-left {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 60px 72px;
    background: linear-gradient(160deg, var(--blue-50) 0%, #EBF4FF 60%, #F8FBFF 100%);
    position: relative;
    overflow: hidden;
  }
  .auth-left-grid {
    position: absolute; inset: 0;
    background-image:
      linear-gradient(var(--blue-100) 1px, transparent 1px),
      linear-gradient(90deg, var(--blue-100) 1px, transparent 1px);
    background-size: 48px 48px; opacity: 0.5;
  }
  .auth-left-glow {
    position: absolute; bottom: -100px; left: -100px;
    width: 400px; height: 400px; border-radius: 50%;
    background: radial-gradient(circle, rgba(55,138,221,0.12) 0%, transparent 70%);
  }
  .auth-left-content { position: relative; max-width: 460px; }

  .auth-brand {
    display: flex; align-items: center; gap: 10px;
    text-decoration: none; margin-bottom: 52px;
  }
  .auth-brand-logo {
    width: 38px; height: 38px; border-radius: 11px;
    overflow: hidden; box-shadow: 0 4px 14px rgba(24,95,165,0.2);
    flex-shrink: 0;
    transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1);
  }
  .auth-brand:hover .auth-brand-logo { transform: rotate(-6deg) scale(1.08); }
  .auth-brand-logo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .auth-brand-name { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.2rem; font-weight: 800; color: var(--gray-900); }
  .auth-brand-name .accent { color: var(--blue-600); }

  .auth-panel-label { font-size: 11px; font-weight: 600; letter-spacing: 2.5px; text-transform: uppercase; color: var(--blue-600); margin-bottom: 12px; }
  .auth-panel-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: clamp(1.8rem, 3vw, 2.6rem); font-weight: 800; color: var(--gray-900); line-height: 1.1; margin-bottom: 16px; }
  .auth-panel-title .accent { color: var(--blue-600); }
  .auth-panel-sub { font-size: 15px; color: var(--gray-500); line-height: 1.7; margin-bottom: 44px; max-width: 380px; }

  .auth-features { display: flex; flex-direction: column; gap: 14px; }
  .auth-feature { display: flex; align-items: flex-start; gap: 14px; }
  .auth-feature-icon {
    width: 38px; height: 38px; border-radius: 11px;
    background: #fff; border: 1px solid var(--blue-200);
    display: flex; align-items: center; justify-content: center;
    font-size: 17px; flex-shrink: 0; box-shadow: var(--shadow-sm);
  }
  .auth-feature-title { font-size: 14px; font-weight: 600; color: var(--gray-800); margin-bottom: 2px; }
  .auth-feature-desc  { font-size: 13px; color: var(--gray-500); }

  /* ── RIGHT PANEL (form) ── */
  .auth-right {
    width: 460px; flex-shrink: 0;
    background: #fff; border-left: 1px solid var(--blue-100);
    display: flex; flex-direction: column; justify-content: center;
    padding: 52px 44px; overflow-y: auto;
  }

  .auth-form-title { font-family: 'Plus Jakarta Sans', sans-serif; font-size: 1.55rem; font-weight: 800; color: var(--gray-900); margin-bottom: 4px; }
  .auth-form-sub   { font-size: 14px; color: var(--gray-500); margin-bottom: 30px; }

  /* Error alert */
  .auth-alert-error {
    background: var(--color-error-bg); border: 1px solid var(--color-error-border);
    border-radius: 12px; padding: 12px 16px;
    font-size: 14px; color: var(--color-error-text); margin-bottom: 18px;
    display: flex; align-items: flex-start; gap: 8px;
  }
  .auth-alert-success {
    background: var(--color-success-bg); border: 1px solid var(--color-success-border);
    border-radius: 12px; padding: 12px 16px;
    font-size: 14px; color: var(--color-success-text); margin-bottom: 18px;
  }

  /* Fields */
  .auth-field { margin-bottom: 16px; }
  .auth-field-label { font-size: 12px; font-weight: 600; letter-spacing: 0.4px; color: var(--gray-600); margin-bottom: 7px; display: block; }
  .auth-field-error { font-size: 12px; color: var(--color-error-text); margin-top: 5px; display: block; }

  .auth-input-wrap { position: relative; }
  .auth-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); font-size: 15px; color: var(--gray-400); pointer-events: none; }
  .auth-input {
    width: 100%;
    background: var(--gray-50); border: 1px solid var(--blue-100);
    border-radius: 12px; padding: 12px 14px 12px 42px;
    font-family: 'DM Sans', sans-serif; font-size: 15px; color: var(--gray-900);
    outline: none; transition: all 0.15s;
  }
  .auth-input::placeholder { color: var(--gray-400); }
  .auth-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(55,138,221,0.12); }
  .auth-input.has-error { border-color: var(--color-error-border); background: var(--color-error-bg); }

  /* OTP row */
  .auth-otp-row { display: flex; gap: 8px; }
  .auth-otp-row .auth-input-wrap { flex: 1; }
  .auth-otp-btn {
    flex-shrink: 0; background: var(--blue-50); border: 1px solid var(--blue-200);
    border-radius: 12px; padding: 12px 16px;
    font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600;
    color: var(--blue-700); cursor: pointer; transition: all 0.15s; white-space: nowrap;
  }
  .auth-otp-btn:hover:not(:disabled) { background: var(--blue-100); border-color: var(--blue-400); }
  .auth-otp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Verified pill */
  .auth-verified {
    display: flex; align-items: center; gap: 8px;
    background: var(--color-success-bg); border: 1px solid var(--color-success-border);
    border-radius: 10px; padding: 10px 14px; font-size: 13px; color: var(--color-success-text);
    margin-bottom: 14px;
  }

  /* Submit button */
  .auth-submit {
    width: 100%; padding: 14px;
    border-radius: 12px; border: none;
    background: var(--blue-600); color: #fff;
    font-family: 'DM Sans', sans-serif; font-size: 15px; font-weight: 600;
    cursor: pointer; transition: all 0.2s;
    box-shadow: 0 4px 14px rgba(24,95,165,0.2);
    margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 9px;
  }
  .auth-submit:hover:not(:disabled) { background: var(--blue-800); box-shadow: 0 8px 24px rgba(24,95,165,0.3); }
  .auth-submit:disabled { opacity: 0.5; cursor: not-allowed; }

  /* Divider */
  .auth-divider { display: flex; align-items: center; gap: 14px; margin: 20px 0; font-size: 12px; color: var(--gray-400); }
  .auth-divider::before, .auth-divider::after { content: ''; flex: 1; height: 1px; background: var(--blue-100); }

  /* Switch / links */
  .auth-switch { text-align: center; font-size: 14px; color: var(--gray-500); }
  .auth-switch a { color: var(--blue-600); font-weight: 600; text-decoration: none; }
  .auth-switch a:hover { color: var(--blue-800); }

  /* Progress steps */
  .auth-progress { display: flex; gap: 6px; margin-bottom: 28px; }
  .auth-progress-step { flex: 1; height: 3px; border-radius: 2px; background: var(--blue-100); transition: background 0.3s; }
  .auth-progress-step.done   { background: var(--blue-600); }
  .auth-progress-step.active { background: var(--blue-400); }

  /* OTP sent hint */
  .otp-hint { font-size: 12px; color: var(--color-success-text); margin-top: 5px; display: block; }

  /* Responsive */
  @media (max-width: 900px) {
    .auth-left { display: none; }
    .auth-right {
      width: 100%; border-left: none;
      padding: 80px 24px 44px;
    }
  }
`;