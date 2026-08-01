"""
backend/payments/cashfree_payouts_utils.py

The ONE place that talks to Cashfree Payouts. Everything else (the daily task,
the webhook handler) goes through create_payout() so that switching from the
current simulation to the live API is a one-file change. (Replaces the old
razorpayx_utils.py — the doctor-payout counterpart to cashfree_utils.py.)

Cashfree Payouts requires KYC + activation that isn't done yet, so
`settings.CASHFREE_PAYOUTS_ENABLED` defaults to False and create_payout()
SIMULATES a queued transfer (returns a fake id, no network call). This lets the
whole pipeline — ledger → batch → webhook — run end to end now.

Amounts are in RUPEES (Decimal), matching Cashfree's unit — no paise conversion.

When the account is live, set CASHFREE_PAYOUTS_ENABLED=true and the
CASHFREE_PAYOUT_CLIENT_ID/SECRET — nothing else changes. `_live_payout()` below
is the real Cashfree Payouts V2 transfer; CASHFREE_ENV picks sandbox vs
production, the same switch the Payment Gateway side uses.
"""
import base64
import hashlib
import hmac
import logging
import re
import textwrap
import time
import uuid
from pathlib import Path

from django.conf import settings

from payments.cashfree_utils import verify_webhook_signature

logger = logging.getLogger('tokenwalla')

# Cashfree Payouts API contract version this integration is written against.
PAYOUTS_API_VERSION = '2024-01-01'


def verify_payout_webhook_signature(raw_body, signature, timestamp):
    """Verify a Cashfree Payouts TRANSFER_* webhook (TRANSFER_SUCCESS/FAILED/
    REVERSED) — the x-webhook-signature/x-webhook-timestamp header scheme.
    Cashfree signs these with the Payout CLIENT SECRET itself (there is no
    separate Payouts webhook secret) — see
    https://www.cashfree.com/docs/api-reference/payouts/v2/webhooks/webhooks-v2.
    CASHFREE_PAYOUT_WEBHOOK_SECRET is an optional override for when
    CASHFREE_PAYOUT_CLIENT_SECRET has been rotated: Cashfree signs with the
    OLDEST still-active client secret during the rotation window."""
    secret = settings.CASHFREE_PAYOUT_WEBHOOK_SECRET or settings.CASHFREE_PAYOUT_CLIENT_SECRET
    return verify_webhook_signature(raw_body, signature, timestamp, secret=secret)


def verify_legacy_payout_notification(payload):
    """Verify Cashfree's OLDER Payouts webhook format — used for account-level
    notifications (e.g. LOW_BALANCE_ALERT) rather than transfer events. Unlike
    verify_payout_webhook_signature above, there are no x-webhook-* headers;
    the signature travels INSIDE the JSON body as payload['signature'], and is
    computed over the OTHER fields sorted by key, concatenating their values
    (skipping empty ones) — not timestamp+raw_body. See
    https://www.cashfree.com/docs/payouts/payouts/make-payouts/webhooks
    ("oldest active Key Pair" secret, same rotation caveat as above)."""
    secret = settings.CASHFREE_PAYOUT_WEBHOOK_SECRET or settings.CASHFREE_PAYOUT_CLIENT_SECRET
    signature = payload.get('signature')
    if not signature or not secret:
        return False
    concatenated = ''.join(
        str(v) for k, v in sorted(payload.items()) if k != 'signature' and str(v)
    )
    expected = base64.b64encode(
        hmac.new(secret.encode('utf-8'), concatenated.encode('utf-8'), hashlib.sha256).digest()
    ).decode('utf-8')
    return hmac.compare_digest(expected, str(signature))


def payout_target(doctor):
    """Whose ACCOUNT a doctor's payout is sent to.

    A salaried doctor doesn't collect their own fees — the hospital employing
    them does — so `Doctor.payout_to_hospital` routes the money to the
    hospital's account. Everyone else is paid directly.

    Hospital and Doctor deliberately carry identically named payout fields
    (upi_vpa / bank_account_number / ifsc / account_holder_name / name / mobile),
    so every function below takes whichever this returns without caring which.

    Only the DESTINATION changes: the ledger and the batch stay keyed to the
    doctor, so earnings remain attributable per doctor even when several
    salaried doctors are paid into one hospital account.
    """
    if doctor.payout_to_hospital and doctor.hospital_id:
        return doctor.hospital
    return doctor


def choose_mode(target):
    """UPI if the payout target has a VPA, else IMPS (bank) as fallback.

    `target` is a Doctor or a Hospital — see payout_target(). Returns None when
    it has NEITHER a VPA nor a full bank account: there is nowhere to send the
    money, so the caller holds the ledger instead of creating a batch that can
    only fail."""
    if (target.upi_vpa or '').strip():
        return 'UPI'
    if (target.bank_account_number or '').strip() and (target.ifsc or '').strip():
        return 'IMPS'
    return None


def _simulate_payout(doctor, amount, mode, idempotency_key):
    """Stand-in for the live Cashfree Payouts call while payouts are disabled."""
    target = payout_target(doctor)
    logger.info(
        '[cashfree-payouts:SIMULATED] payout ₹%s for doctor %s to %s %s via %s '
        '(key=%s) — Cashfree Payouts disabled; no money moved.',
        amount, doctor.id, target._meta.model_name, target.id, mode, idempotency_key,
    )
    return {
        'id':        f'txn_sim_{uuid.uuid4().hex[:14]}',
        'status':    'queued',
        'mode':      mode,
        'amount':    str(amount),
        'simulated': True,
    }


def payouts_base_url():
    """Sandbox unless CASHFREE_ENV is PRODUCTION — same switch the PG side uses,
    so both halves of the integration can never point at different worlds."""
    return ('https://api.cashfree.com/payout'
            if str(settings.CASHFREE_ENV).upper() == 'PRODUCTION'
            else 'https://sandbox.cashfree.com/payout')


def _public_key_pem(raw):
    """Normalise CASHFREE_PAYOUT_PUBLIC_KEY into PEM bytes.

    Accepts the key in whichever shape it arrives, because all three happen in
    practice and the failure mode is otherwise a confusing crash at payout time:
      * a full PEM block (possibly with literal "\\n" instead of real newlines,
        which is what most env-var UIs produce),
      * a path to a .pem file,
      * the bare base64 body with no BEGIN/END armor — what you get pasting from
        the Cashfree dashboard.
    Never log or echo the value: it is key material.
    """
    if raw.startswith('-----'):
        return raw.replace('\\n', '\n').encode()
    try:
        if Path(raw).is_file():
            return Path(raw).read_bytes()
    except OSError:
        pass    # too long / not a valid path — it's key material, not a file
    body = '\n'.join(textwrap.wrap(re.sub(r'\s+', '', raw), 64))
    return f'-----BEGIN PUBLIC KEY-----\n{body}\n-----END PUBLIC KEY-----\n'.encode()


def cf_signature():
    """Cashfree Payouts 2FA header for hosts without a static IP.

    Payouts refuses every call (sandbox included) with 403 "IP not whitelisted"
    unless the caller's IP is whitelisted OR it sends X-Cf-Signature: the string
    "<client_id>.<unix_epoch>" RSA-OAEP-encrypted with the merchant PUBLIC key
    from Payouts Dashboard → Developers → Two-Factor Authentication, base64'd.

    Returns '' when no key is configured, so a whitelisted static IP keeps
    working with no key and no extra setup. The payload is timestamped, so this
    is regenerated per request — never cached.

    UNVERIFIED against a live account as of 2026-08-01: sending this header made
    no difference on TokenWalla's sandbox account — /payout/v1/authorize returned
    the same "IP not whitelisted" with and without it. Cashfree ignores the
    signature until the public-key method is actually ENABLED for the merchant
    under Payouts Dashboard → Developers → Two-Factor Authentication (having
    downloaded a key is not enough). The header itself is correct per Cashfree's
    documented scheme and is covered by a test that decrypts it back to
    "<client_id>.<epoch>"; if it still fails once the dashboard is switched over,
    suspect the key pairing, not the encoding.
    """
    raw = (settings.CASHFREE_PAYOUT_PUBLIC_KEY or '').strip()
    if not raw:
        return ''
    pem = _public_key_pem(raw)

    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding

    encrypted = serialization.load_pem_public_key(pem).encrypt(
        f'{settings.CASHFREE_PAYOUT_CLIENT_ID}.{int(time.time())}'.encode(),
        # SHA-1 OAEP — matches Cashfree's own PHP/Java reference implementations.
        padding.OAEP(mgf=padding.MGF1(algorithm=hashes.SHA1()),
                     algorithm=hashes.SHA1(), label=None),
    )
    return base64.b64encode(encrypted).decode()


def _payout_headers():
    headers = {
        'x-client-id':     settings.CASHFREE_PAYOUT_CLIENT_ID,
        'x-client-secret': settings.CASHFREE_PAYOUT_CLIENT_SECRET,
        'x-api-version':   PAYOUTS_API_VERSION,
        'Content-Type':    'application/json',
    }
    signature = cf_signature()
    if signature:
        headers['X-Cf-Signature'] = signature
    return headers


def _beneficiary_details(target, mode):
    """Inline beneficiary for a V2 transfer — no pre-registration step needed.

    `target` is a Doctor or a Hospital (see payout_target). beneficiary_id is
    stable per target so Cashfree links repeat payouts to the same payee, and
    keying it on the model name keeps a hospital's account distinct from any
    doctor's — two salaried doctors at one hospital share ONE beneficiary rather
    than each registering the hospital's account under their own id.

    Only the instrument for the chosen mode is sent: a stale/blank bank account
    alongside a good VPA is a rejection waiting to happen.
    """
    instrument = ({'vpa': target.upi_vpa.strip()} if mode == 'UPI' else {
        'bank_account_number': (target.bank_account_number or '').strip(),
        'bank_ifsc':           (target.ifsc or '').strip(),
    })
    return {
        'beneficiary_id':   f'tw_{target._meta.model_name}_{target.id}',
        'beneficiary_name': (target.account_holder_name or target.name).strip()[:100],
        'beneficiary_instrument_details': instrument,
        'beneficiary_contact_details': {
            'beneficiary_phone': (target.mobile or '').strip()[-10:],
        },
    }


def _live_payout(doctor, amount, mode, idempotency_key):
    """Real Cashfree Payouts V2 standard transfer.

    Uses the REST API directly (`requests`) rather than the cashfree-payout SDK:
    the pinned SDK is a V1-era package and this is a single POST. Beneficiary
    details are inlined, so there is no separate beneficiary-registration step
    to keep in sync with the doctor record.

    `transfer_id` is our idempotency_key — Cashfree rejects a duplicate, which
    is what makes a re-run of the daily task safe rather than a double payout.

    Transfers are async: the response is RECEIVED/PENDING and the final outcome
    arrives as a TRANSFER_SUCCESS/FAILED webhook (payments.webhooks).

    NOTE: every Payouts call — sandbox included — is refused with 403 "IP not
    whitelisted" until this server's public IP is whitelisted in the Payouts
    dashboard. Verified against sandbox: valid keys alone are not enough. See
    the CASHFREE_PAYOUTS_ENABLED block in .env.example.
    """
    import requests   # local: the simulated path shouldn't pay for the import

    target = payout_target(doctor)
    body = {
        'transfer_id':       idempotency_key,
        'transfer_amount':   float(amount),          # rupees, not paise
        'transfer_currency': 'INR',
        'transfer_mode':     mode.lower(),           # 'upi' | 'imps'
        'beneficiary_details': _beneficiary_details(target, mode),
        'transfer_remarks':  'TokenWalla consultation payout',
    }
    resp = requests.post(f'{payouts_base_url()}/transfers',
                         json=body, headers=_payout_headers(), timeout=30)
    data = {}
    try:
        data = resp.json() or {}
    except ValueError:
        pass
    if resp.status_code >= 300:
        # NEVER blind-retry a payout on an error — a 5xx can still have created
        # the transfer. The caller marks the batch FAILED and the next cycle
        # reuses a NEW idempotency_key only after this one is known-dead, and
        # Cashfree rejects a duplicate transfer_id regardless.
        raise RuntimeError(
            f'Cashfree Payouts transfer failed ({resp.status_code}): '
            f'{data.get("message") or resp.text[:300]}'
        )
    # V2 returns the transfer object flat; tolerate a `data` wrapper either way.
    body_out = data.get('data') if isinstance(data.get('data'), dict) else data
    logger.info('[cashfree-payouts] transfer %s → doctor %s (paid to %s %s) ₹%s '
                'via %s: %s', idempotency_key, doctor.id,
                target._meta.model_name, target.id, amount, mode,
                body_out.get('status'))
    return {
        'id':     str(body_out.get('cf_transfer_id') or ''),
        'status': body_out.get('status', ''),
        'mode':   mode,
        'amount': str(amount),
    }


def create_payout(doctor, amount, mode, idempotency_key):
    """Create a doctor payout. Routes to the live API or the simulation depending
    on settings.CASHFREE_PAYOUTS_ENABLED. Returns the payout object (its ['id'] is
    the razorpay_payout_id column value — kept name, now a Cashfree transfer id).
    The idempotency_key (== transfer_id) makes retries safe on both paths.
    """
    if settings.CASHFREE_PAYOUTS_ENABLED:
        return _live_payout(doctor, amount, mode, idempotency_key)
    return _simulate_payout(doctor, amount, mode, idempotency_key)
