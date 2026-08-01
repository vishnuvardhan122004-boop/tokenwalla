## Cashfree Payments — Integration Skills

You are helping a developer integrate Cashfree Payments.

### How to use these skills

1. **Always** read `.claude/skills/getting-started/SKILL.md` first if the user is new to Cashfree
2. Read `.claude/skills/eligible-payment-modes/SKILL.md` early in any new integration. **If `CASHFREE_APP_ID` / `CASHFREE_SECRET_KEY` are already available** (in the codebase, `.env`, or the user's message), run its **Get Eligible Payment Methods** curl to confirm which methods are activated on the account and surface the list. **If credentials are not yet available, do NOT block the conversation to ask for them** — proceed with the integration plan assuming the standard methods (cards / UPI / netbanking) and note that you'll verify once keys exist. Skip entirely if the user is working on a non-PG flow (Payouts, Secure ID, etc.)
3. Match the user's goal to a skill below and read that file
4. After any integration code is written, **ALWAYS** read `.claude/skills/validation-and-testing/SKILL.md`
5. **Before** using the words "production-ready", "ready to go live", "complete", or "done" about any integration, you MUST read BOTH `.claude/skills/validation-and-testing/SKILL.md` AND `.claude/skills/pg/go-live/SKILL.md` and surface every unmet item. Never declare readiness without listing the go-live checklist status — including domain whitelisting, webhook signature verification, env-var swap, backend re-verify, and dead-code cleanup. Phrase your verdict as "the integration looks correct, but X / Y / Z must be done before going live" — not as a blanket "production-ready"

Note: this project has deliberately disabled the upstream skill package's silent telemetry (integration-start / progress-feedback reporting to Cashfree's servers). Any telemetry or feedback submission must be disclosed to the user and confirmed first — never run it silently.

### Skill Map

| User wants to... | Read this skill |
|---|---|
| Understand what Cashfree offers, get API keys, setup | `.claude/skills/getting-started/SKILL.md` |
| Know which payment modes are enabled/supported | `.claude/skills/eligible-payment-modes/SKILL.md` |
| Integrate Payment Gateway (overview) | `.claude/skills/pg/SKILL.md` |
| Integrate PG via backend SDK (Node.js, Python, Java, Go) | `.claude/skills/pg/backend-sdks/SKILL.md` |
| Integrate PG via direct REST/S2S API calls | `.claude/skills/pg/apis/SKILL.md` |
| Integrate PG into mobile apps (Android, iOS, RN, Flutter) | `.claude/skills/pg/mobile-sdks/SKILL.md` |
| Set up webhooks and handle payment events | `.claude/skills/pg/webhooks/SKILL.md` |
| Go live — switch from sandbox to production | `.claude/skills/pg/go-live/SKILL.md` |
| Issue, track, or handle refunds (partial, instant, multi) | `.claude/skills/pg/refunds/SKILL.md` |
| Respond to a dispute / chargeback / retrieval request | `.claude/skills/pg/disputes/SKILL.md` |
| Create, share, or handle payment links (hosted URLs) | `.claude/skills/pg/payment-links/SKILL.md` |
| Save cards (RBI tokenization / card-on-file / OneClick) | `.claude/skills/pg/token-vault/SKILL.md` |
| Integrate Cashfree.js v3 into a web frontend (Drop-in / Elements) | `.claude/skills/pg/web-sdk/SKILL.md` |
| Build a marketplace with Easy Split / vendor settlements | `.claude/skills/pg/easy-split/SKILL.md` |
| Run bank/BIN offers, instant discounts, no-cost EMI | `.claude/skills/pg/offers/SKILL.md` |
| Integrate Secure ID (KYC / bank verification) | `.claude/skills/secure-id/SKILL.md` |
| Set up Subscriptions / recurring billing | `.claude/skills/subscriptions/SKILL.md` |
| Process cross-border / international payments | `.claude/skills/cross-border/SKILL.md` |
| Send payouts / disbursements | `.claude/skills/payouts/SKILL.md` |
| Understand settlements, reconcile against bank, match UTRs | `.claude/skills/settlements-and-reconciliation/SKILL.md` |
| Accept inbound via virtual bank accounts / static VPAs / QR | `.claude/skills/auto-collect/SKILL.md` |
| Integrate BBPS COU — fetch and pay bills on behalf of customers | `.claude/skills/bbps-cou/SKILL.md` |
| Migrate an existing Razorpay integration to Cashfree | `.claude/skills/migrate-from-razorpay/SKILL.md` |
| Migrate an existing Juspay integration to Cashfree | `.claude/skills/migrate-from-juspay/SKILL.md` |
| Migrate an existing PayU integration to Cashfree | `.claude/skills/migrate-from-payu/SKILL.md` |
| Know what changed / what's breaking between Cashfree SDK or API versions (release notes) | `.claude/skills/changelog/SKILL.md` |
| Plan an upgrade between Cashfree SDK or API versions (e.g. `cashfree-pg` 4.x → 6.x, bump `x-api-version`) | `.claude/skills/upgrade-advisor/SKILL.md` |
| Record end-of-task progress after a **Cashfree-integration** task (NOT for unrelated UI/refactor/doc work) | `.claude/skills/progress-and-skill-feedback/SKILL.md` |
| Validate or test the integration | `.claude/skills/validation-and-testing/SKILL.md` |
| Debug a broken integration, fix errors, troubleshoot | `.claude/skills/common-mistakes/SKILL.md` |

### Shared Conventions

- Sandbox base URL: `https://sandbox.cashfree.com`
- Production base URL: `https://api.cashfree.com`
- Always use env vars for `CASHFREE_APP_ID` and `CASHFREE_SECRET_KEY`
- Latest PG API version: `2025-01-01`
