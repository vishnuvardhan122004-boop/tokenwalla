"""
backend/payments/payout_utils.py

Doctor payouts are MANUAL: TokenWalla staff wire the money from our own bank
account and mark it paid in the admin payouts page (payments.views.
PendingPayoutsView / MarkPayoutPaidView). There is no gateway payout API call
here — this module just answers "who gets paid, and on which rail" so the
admin page can show that. (Replaces cashfree_payouts_utils.py, which drove an
automated Cashfree Payouts integration that never got past Cashfree's
mandatory 2FA gate.)
"""


def payout_target(doctor):
    """Whose ACCOUNT a doctor's payout is sent to.

    A salaried doctor doesn't collect their own fees — the hospital employing
    them does — so `Doctor.payout_to_hospital` routes the money to the
    hospital's account. Everyone else is paid directly.

    Hospital and Doctor deliberately carry identically named payout fields
    (upi_vpa / bank_account_number / ifsc / account_holder_name / name / mobile),
    so every function below takes whichever this returns without caring which.

    Only the DESTINATION changes: the ledger stays keyed to the doctor, so
    earnings remain attributable per doctor even when several salaried doctors
    are paid into one hospital account.
    """
    if doctor.payout_to_hospital and doctor.hospital_id:
        return doctor.hospital
    return doctor


def ledger_owner(booking):
    """Which payee a booking's earnings belong to, as DoctorLedger kwargs.

    A scan booking has no doctor — the money is owed to the centre that owns the
    Scan. Returned as kwargs (`{'doctor': …}` or `{'center': …}`) rather than a
    bare object so no caller can accidentally write `doctor=None`, which the
    ledger's CheckConstraint would reject anyway but only after the surrounding
    transaction has done its work.

    A scanning centre IS its own payout target: Hospital already carries the
    upi_vpa / bank / account-holder fields, so `choose_mode()` takes it
    unchanged. There is no centre equivalent of `payout_to_hospital` — a centre
    is the top of its own chain.

    Returns None when the booking has neither provider. Impossible under
    Booking's own CheckConstraint, but this function is used on the money path
    and returning None lets the caller log and skip rather than guess.
    """
    if booking.doctor_id:
        return {'doctor': booking.doctor}
    scan = getattr(booking, 'scan', None)
    if scan is not None and scan.center_id:
        return {'center': scan.center}
    return None


def choose_mode(target):
    """Which rail `target` should be paid on — 'UPI', 'IMPS', or None.

    `target` is a Doctor or a Hospital (see payout_target). An EXPLICIT
    payment_method chosen in the dashboard wins: a stale UPI VPA left over from
    before must not silently override a bank account someone deliberately
    selected. With no usable explicit choice we take whichever rail is actually
    on file, UPI first (instant and free).

    Returns None when there is NEITHER a VPA nor a full bank account: nowhere
    to send the money, so the caller should hold the ledger rather than show a
    payout that can't actually be sent.
    """
    method   = (target.payment_method or '').strip().upper()
    has_vpa  = bool((target.upi_vpa or '').strip())
    has_bank = bool((target.bank_account_number or '').strip()
                    and (target.ifsc or '').strip())

    if method == 'UPI' and has_vpa:
        return 'UPI'
    if method == 'BANK' and has_bank:
        return 'IMPS'
    if has_vpa:
        return 'UPI'
    if has_bank:
        return 'IMPS'
    return None
