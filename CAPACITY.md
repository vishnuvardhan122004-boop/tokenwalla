# TokenWalla — Daily booking capacity

Audit date: 2026-08-08. All figures traced to code, not estimates from docs.

---

## 1. App-level capacity (how many appointments the rules allow)

The cap is per doctor, per slot:

```
per doctor per day  =  len(Doctor.slots) × Doctor.max_per_slot
per hospital per day =  Σ over its doctors
```

`Doctor.max_per_slot` defaults to **10** (`doctors/models.py:23`). Slots are a
free-text JSON list the hospital enters, so the number of slots is whatever they
configured.

| Config | Slots | max_per_slot | Per doctor/day |
|---|---|---|---|
| Current seed data | 14 | 5 | **70** |
| Default `max_per_slot` | 14 | 10 | **140** |
| Typical OPD (9–1, 4–8, 30 min) | 16 | 10 | **160** |

Two further reducers:

- `Doctor.days` — the doctor is only bookable on listed weekdays.
- `BOOKING_CUTOFF_HOURS = 2` (`tokenwalla/utils.py:36`) — a slot starting within
  2 hours is shown as `full`, so same-day capacity is always less than the
  headline number.

So a 50-doctor network at defaults is roughly **7,000 bookings/day** on paper.

### The cap is not actually enforced

This is the finding that matters. `max_per_slot` is checked in exactly two
places:

- `doctors/views.py:161` — the read-only `/slot-availability/` endpoint the UI
  uses to grey out full slots.
- `bookings/views.py:385` — **reschedule** only, correctly done under
  `select_for_update()`.

`payments/views.py:_handle_new_booking` (line 399) creates the booking after
payment capture and validates only that `slot_val in doctor.slots` (line 419).
It never counts existing bookings and never calls `is_slot_bookable`. Neither
does `CreateOrderView._create_booking_order` (line 213).

Consequences:

1. **Overselling.** Two patients who both load the slot page when it has 1 seat
   left will both pay and both get a token. The money is already captured by
   then, so the fix is a refund, not a rejection.
2. **The cap is client-side only.** Anyone calling `/api/payment/verify/`
   directly ignores it entirely.
3. **The 2h cutoff is also client-side only** — a booking for a slot that
   started an hour ago will be accepted.

Real-world blast radius today is small (2 doctors, 8 bookings), but this breaks
the moment two patients book the same popular slot concurrently.

---

## 2. Infrastructure ceiling (how many users the server survives)

### One gunicorn worker

`Procfile` and `railway.json` both start `gunicorn tokenwalla.wsgi` with no
`--workers` / `--threads`. Gunicorn's default is **1 sync worker**, which
handles **exactly one request at a time**. Everything else queues.

That single worker also blocks on Razorpay. `/api/payment/verify/` re-fetches
the order and its payments over HTTPS (by design — server-side verification).
At ~0.5–1.5s per verify, one checkout stalls every other request on the box.

### Polling is the dominant load, not bookings

| Source | Interval | Requests/hour each |
|---|---|---|
| Hospital dashboard (`Hdashboard.js:135`) | 10s | 360 |
| Patient MyBookings (`MyBookings.js:101`) | 15s | 240 |
| BookingToken page (`BookingToken.js:60`) | 15s | 240 |

Patient polling correctly pauses on tab hide (`useVisiblePolling`). The hospital
dashboard does **not** — it polls all day whether or not anyone is looking.

Rough ceiling: a single sync worker at ~120ms average handles ~8 req/s. Patient
polling alone at 15s means **~120 concurrently-active patients saturates the
server**, before any booking traffic. Sustained daily bookings will start
degrading somewhere in the **low thousands**, and the failure will look like
timeouts during checkout, not a clean error.

### `HospitalQueueView` grows without bound

`bookings/views.py:82` filters by `hospital_id` and status — **no date filter,
no pagination**. Every CONFIRMED / ON_HOLD / IN_PROGRESS booking a hospital has
ever taken is serialized on every poll, every 10 seconds. At 100 bookings/day
this endpoint is moving ~3,000 rows per request within a month. This is the
first thing that will fall over.

### Throttling runs on the database

`settings.py:95` sets the default cache to `DatabaseCache` on `tw_cache_table`,
even though `REDIS_URL` is read on line 93 and then never used. DRF's
`AnonRateThrottle` + `UserRateThrottle` are global, so **every single API
request does extra SELECT/UPDATE round trips against that table** — a write on a
polling-heavy read path, and a lock hotspot under load.

Throttle limits themselves: `user: 300/minute`. A patient with 2 tabs open
polling every 15s uses 8/min, so the limit is not the constraint — the DB writes
behind it are.

`conn_max_age=600` on the Railway DB URL is set correctly (line 78).

---

## 3. How to manage it

### Now — correctness (money is at stake)

1. **Enforce capacity where the booking is created.** In
   `_handle_new_booking`, inside the existing `transaction.atomic()`, count
   CONFIRMED + IN_PROGRESS bookings for `(doctor, date, slot)` under
   `select_for_update()` and reject past `max_per_slot` — mirroring the
   reschedule logic at `bookings/views.py:371-388`. Because payment is already
   captured, the rejection path must **auto-refund**, not just 400.
2. **Check capacity in `CreateOrderView` too**, before the Razorpay order
   exists. This turns almost every collision into a clean "slot full" message
   with no money moved; step 1 stays as the race-condition backstop.
3. **Call `is_slot_bookable(date, slot)` server-side** on both paths so the 2h
   cutoff is real.
4. Add a regression test for two concurrent bookings on a 1-seat slot.

### This week — the cheap 10× on throughput

5. **`gunicorn tokenwalla.wsgi --workers 3 --threads 4 --timeout 60`** in both
   `Procfile` and `railway.json`. Sync workers spend the verify call blocked on
   I/O, so threads help a lot here. This alone lifts concurrency ~12×.
6. **Bound `HospitalQueueView`** — filter to `date=today` (the queue is a
   today-only view) and drop the unbounded `completed` list to today's as well.
   The `idx_booking_hosp_date_status` index already exists for exactly this.
7. **Point `CACHES` at Redis.** `REDIS_URL` is already in settings; Railway has
   a one-click Redis. Removes 2–4 DB round trips per request.

### Next — before scaling past ~20 hospitals

8. Pause the hospital dashboard poll on tab hide (reuse `useVisiblePolling`).
9. Move queue updates to Server-Sent Events or push, or back off the poll to
   30s. Polling is what makes concurrent users expensive.
10. Add a per-day booking archive/purge so the queue tables stay small.
11. Load-test the checkout path specifically — it's the only one holding an
    external HTTP call.

### Capacity after these fixes

With 3 workers × 4 threads, Redis cache, and a date-bounded queue endpoint,
~1,000+ concurrently-active patients is reasonable on one Railway instance,
which puts the practical daily-booking ceiling well above the app-level
`slots × max_per_slot` limit. At that point capacity is a business question
(how many doctors, how many slots) rather than an engineering one — which is
where it should be.

---

## Files referenced

- `backend/doctors/models.py:20,23` — `slots`, `max_per_slot`
- `backend/doctors/views.py:116-169` — `slot_availability` (read-only)
- `backend/payments/views.py:399-447` — `_handle_new_booking` (no cap check)
- `backend/payments/views.py:213` — `_create_booking_order` (no cap check)
- `backend/bookings/views.py:82-116` — `HospitalQueueView` (unbounded)
- `backend/bookings/views.py:367-394` — reschedule (correct locking, use as model)
- `backend/tokenwalla/utils.py:36` — `is_slot_bookable`
- `backend/tokenwalla/settings.py:93-101,113-123` — cache, throttles
- `backend/Procfile`, `backend/railway.json` — gunicorn start command
- `src/hospital/Hdashboard.js:135`, `src/componets/MyBookings.js:101`
