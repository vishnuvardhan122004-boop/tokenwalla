#!/usr/bin/env bash
# Stress the read paths that carry ~95% of real traffic.
#
# NEVER point this at production. It is live with real patients, real Razorpay
# and real SMS money — a load test there is a self-inflicted outage. The guard
# below refuses anything that is not localhost; override only if you genuinely
# mean it (a staging box), never for tokenwalla-production.
#
# Usage:  ./stress_test.sh [--checkout] [BASE_URL] [REQUESTS] [CONCURRENCY]
#         ./stress_test.sh                       # 2000 reqs, 24 concurrent, local
#         ./stress_test.sh http://127.0.0.1:8000 5000 50
#         ./stress_test.sh --checkout            # also hit /create-order/
#
# --checkout adds the one path that makes a real outbound call to Razorpay. It
# is opt-in, refuses anything but a test key, and is the only leg that says
# anything about the gunicorn thread count. See the bottom of this file.

set -euo pipefail

CHECKOUT=0
if [ "${1:-}" = "--checkout" ]; then CHECKOUT=1; shift; fi

BASE="${1:-http://127.0.0.1:8000}"
N="${2:-2000}"
C="${3:-24}"          # 24 = the server's real slot count (3 workers x 8 threads)

case "$BASE" in
  *localhost*|*127.0.0.1*) ;;
  *) echo "REFUSING: '$BASE' is not localhost. This would load-test a live system."
     echo "If you truly mean a staging host, edit this guard deliberately."
     exit 1 ;;
esac

command -v ab >/dev/null || { echo "ApacheBench (ab) not found"; exit 1; }
curl -sf -o /dev/null "$BASE/health/" || { echo "No server at $BASE — start runserver first"; exit 1; }

# The endpoints patients actually hit, in traffic order.
PATHS=(
  "/api/doctors/"                 # doctor list — the busiest read
  "/api/hospitals/"               # hospital list
  "/health/"                      # cheap baseline: framework floor, no DB
)

printf '\n%-24s %10s %10s %10s\n' "ENDPOINT" "REQ/SEC" "MEAN(ms)" "FAILED"
printf '%s\n' "----------------------------------------------------------------"

for p in "${PATHS[@]}"; do
  out=$(ab -n "$N" -c "$C" -s 30 -q "$BASE$p" 2>/dev/null) || { printf '%-24s %10s\n' "$p" "ERROR"; continue; }
  rps=$(awk '/Requests per second/ {print $4}' <<<"$out")
  mean=$(awk '/Time per request/ && /mean\)/ {print $4; exit}' <<<"$out")
  fail=$(awk '/Failed requests/ {print $3}' <<<"$out")
  non2xx=$(awk '/Non-2xx/ {print $3}' <<<"$out")
  printf '%-24s %10s %10s %10s\n' "$p" "${rps:-?}" "${mean:-?}" "${fail:-0}${non2xx:+ (+$non2xx non-2xx)}"
done

echo
echo "Concurrency tested: $C   (server serves 3 workers x 8 threads = 24 at once)"
echo "Daily capacity ~= REQ/SEC x 3600 x active_hours x 0.2  (peak-hour is ~20% of a day)"
echo "Watch RAM on the Railway graph if you raise -c well past 24."

# ── Checkout leg — opt-in with --checkout ──────────────────────────────────────
#
# /create-order/ is the only path that holds a thread on an OUTBOUND HTTP call
# (Razorpay), which is the whole reason gunicorn runs 8 threads per worker. It
# is therefore the one endpoint whose req/sec says anything about the thread
# count; the read paths above are DB-bound and would look the same at 4.
#
# It needs a JWT (IsAuthenticated) and a doctor id. Both are minted from the
# LOCAL database below, so nothing has to be pasted in by hand.
#
# What this does NOT do:
#   * /verify/ — it needs a really-captured payment, which cannot be driven
#     synthetically. Verify's cost is one more Razorpay round trip; assume it
#     behaves like create-order.
#   * write any local row — create-order only calls Razorpay and returns the
#     order. Bookings are written by /verify/, so there is nothing to clean up.
#     The Razorpay-side test orders are unpaid and expire on their own.
[ "$CHECKOUT" = "1" ] || exit 0

cd "$(dirname "$0")"

# Refuse anything that is not a test key. Allowlist, not denylist: an unset or
# unrecognised key must fail closed, because the failure mode here is charging
# a real card a few hundred times in a row.
KEY=$(python manage.py shell -c \
  'from django.conf import settings; print(settings.RAZORPAY_KEY_ID or "")' 2>/dev/null | tail -1)
case "$KEY" in
  rzp_test_*) ;;
  *) echo "REFUSING: RAZORPAY_KEY_ID is not a test key (got '${KEY:0:9}...')."
     echo "A load test against a live-mode key charges a real card per request."
     exit 1 ;;
esac

# One active user for the token, one doctor for the amount. Both read-only.
read -r TOKEN DOCTOR_ID <<<"$(python manage.py shell -c '
from django.contrib.auth import get_user_model
from rest_framework_simplejwt.tokens import RefreshToken
from doctors.models import Doctor
u = get_user_model().objects.filter(is_active=True).order_by("id").first()
d = Doctor.objects.filter(fee__gt=0).order_by("id").first()
print(RefreshToken.for_user(u).access_token, d.pk) if u and d else print("", "")
' 2>/dev/null | tail -1)"

[ -n "$TOKEN" ] && [ -n "$DOCTOR_ID" ] || {
  echo "SKIPPING checkout: need one active user and one doctor with a fee in the local DB."
  exit 0; }

BODY=$(mktemp); trap 'rm -f "$BODY"' EXIT
printf '{"doctorId": %s}' "$DOCTOR_ID" > "$BODY"

# Far fewer requests than the read paths: every one is a real call to Razorpay's
# test API, and hammering it gets you rate-limited, not a better number.
NC="${CHECKOUT_N:-200}"

echo
echo "Checkout leg — /api/payment/create-order/ (doctor $DOCTOR_ID, test key)"
printf '%-24s %10s %10s %10s\n' "ENDPOINT" "REQ/SEC" "MEAN(ms)" "FAILED"
printf '%s\n' "----------------------------------------------------------------"

out=$(ab -n "$NC" -c "$C" -s 60 -q -p "$BODY" -T application/json \
        -H "Authorization: Bearer $TOKEN" "$BASE/api/payment/create-order/" 2>/dev/null) \
  || { echo "checkout leg: ab failed"; exit 1; }

rps=$(awk '/Requests per second/ {print $4}' <<<"$out")
mean=$(awk '/Time per request/ && /mean\)/ {print $4; exit}' <<<"$out")
fail=$(awk '/Failed requests/ {print $3}' <<<"$out")
non2xx=$(awk '/Non-2xx/ {print $3}' <<<"$out")
printf '%-24s %10s %10s %10s\n' "/create-order/" "${rps:-?}" "${mean:-?}" "${fail:-0}${non2xx:+ (+$non2xx non-2xx)}"

echo
echo "Non-2xx here is the signal that matters: it means threads ran out or"
echo "Razorpay throttled. A clean run at -c $C is what the 3x8 slot count buys."
