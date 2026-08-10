import sys

import dj_database_url
from pathlib import Path
from decouple import config, Csv
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Core ──────────────────────────────────────────────────────────────────────
SECRET_KEY = config('SECRET_KEY')
# Fail closed: production is secure-by-default. Debug must be explicitly opted
# into via the environment (local dev sets DEBUG=True in backend/.env). If the
# env var is missing in production, we stay in the hardened, non-debug mode.
DEBUG      = config('DEBUG', default=False, cast=bool)

ALLOWED_HOSTS = config(
    'ALLOWED_HOSTS',
    default='localhost,127.0.0.1,0.0.0.0',
    cast=Csv()
)

# ── Apps ──────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'cloudinary_storage',
    'cloudinary',
    'users',
    'doctors',
    'hospitals',
    'bookings',
    'payments',
    'notifications',
]

# ── Middleware ─────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF     = 'tokenwalla.urls'
AUTH_USER_MODEL  = 'users.User'
WSGI_APPLICATION = 'tokenwalla.wsgi.application'

TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.debug',
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]

# ── Database ──────────────────────────────────────────────────────────────────
DATABASE_URL = config('DATABASE_URL', default=None)

if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.parse(DATABASE_URL, conn_max_age=600)
    }
else:
    DATABASES = {
        'default': {
            'ENGINE':   'django.db.backends.postgresql',
            'NAME':     config('DB_NAME',     default='tokenwalla_db'),
            'USER':     config('DB_USER',     default='postgres'),
            'PASSWORD': config('DB_PASSWORD', default=''),
            'HOST':     config('DB_HOST',     default='localhost'),
            'PORT':     config('DB_PORT',     default='5432'),
        }
    }

# ── Cache ─────────────────────────────────────────────────────────────────────
# Use Redis when REDIS_URL is actually configured, otherwise fall back to the
# database cache table.
#
# Why it matters: DRF's AnonRateThrottle and UserRateThrottle are global, so
# EVERY api request reads and writes the cache. On DatabaseCache that is extra
# SELECT + UPDATE round trips against tw_cache_table on a polling-heavy read
# path, and a lock hotspot under load (CAPACITY.md §2). The OTP attempt
# counters also rely on atomic incr, which Redis does properly.
#
# Switching on REDIS_URL alone is NOT safe here. It defaulted to
# 'redis://localhost:6379/0' and was read but never used, so that value is
# already sitting in local .env files pointing at a Redis nobody runs — and
# python-decouple would happily hand it over. Every throttled request (which is
# all of them) would then fail against a dead connection, and the site would
# look broken for a reason that isn't in the code. That is the same class of
# trap as the duplicate DEBUG=False documented in CLAUDE.md.
#
# So Redis is an explicit opt-in: set USE_REDIS_CACHE=True on the service that
# actually has a Redis addon attached. A stale REDIS_URL on its own does nothing.
USE_REDIS_CACHE = config('USE_REDIS_CACHE', default=False, cast=bool)
REDIS_URL = config('REDIS_URL', default='')

if USE_REDIS_CACHE and REDIS_URL:
    CACHES = {
        'default': {
            'BACKEND':  'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'TIMEOUT':  300,
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND':  'django.core.cache.backends.db.DatabaseCache',
            'LOCATION': 'tw_cache_table',
            'TIMEOUT':  300,
        }
    }

# ── OTP abuse limits ──────────────────────────────────────────────────────────
# Two different jobs, and they must not be confused:
#
#   per NUMBER (users.auth_views, DB-backed) — the SMS spend control. 10/day.
#   per IP     (below)                       — stops one host enumerating many
#                                              numbers to burn credits.
#
# The per-IP burst was 5/minute, which 429'd real signups: carrier-grade NAT in
# India puts a whole neighbourhood behind one public address, and a promotion
# drives exactly that shape of traffic. The same lesson was already learned once
# for OTP *verify* (see OTPVerifyRateThrottle) — the send bucket was never
# revisited.
#
# Raising the burst on its own would make abuse cheaper (5/min is ~7,200 sends a
# day from one IP), so it comes with a daily ceiling that did not exist before.
# Net: 4x the burst tolerance for real users, ~36x tighter on sustained abuse.
# Both are env-overridable so a promotion can be widened without a deploy.
OTP_IP_RATE                  = config('OTP_IP_RATE', default='20/minute')
OTP_MAX_SENDS_PER_IP_PER_DAY = config('OTP_MAX_SENDS_PER_IP_PER_DAY', default=200, cast=int)

# ── REST Framework ────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ],
    'DEFAULT_PAGINATION_CLASS':  'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 50,
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '60/minute',
        'user': '300/minute',
        'otp':  OTP_IP_RATE,   # per-IP burst on OTP sends; see the block above
        'otp_verify': '30/minute',  # verifying / checking (cheap, several per flow)
        'admin_setup': '10/hour',   # /auth/create-admin/ — anti brute-force on the setup key
    },
}

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':    timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME':   timedelta(days=14),
    'ROTATE_REFRESH_TOKENS':    True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN':        True,
    'ALGORITHM':                'HS256',
    'SIGNING_KEY':              SECRET_KEY,
    'AUTH_HEADER_TYPES':        ('Bearer',),
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS   = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
    cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True
CORS_ALLOW_HEADERS = [
    'accept', 'accept-encoding', 'authorization', 'content-type',
    'dnt', 'origin', 'user-agent', 'x-csrftoken', 'x-requested-with',
]

# ── Static files ──────────────────────────────────────────────────────────────
STATIC_URL  = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

# ── Cloudinary / Storage ──────────────────────────────────────────────────────
# Reads from .env — empty string means Cloudinary is NOT configured.
CLOUDINARY_CLOUD_NAME = config('CLOUDINARY_CLOUD_NAME', default='')
CLOUDINARY_API_KEY    = config('CLOUDINARY_API_KEY',    default='')
CLOUDINARY_API_SECRET = config('CLOUDINARY_API_SECRET', default='')

_cloudinary_configured = bool(
    CLOUDINARY_CLOUD_NAME and CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET
)

if _cloudinary_configured:
    import cloudinary
    cloudinary.config(
        cloud_name = CLOUDINARY_CLOUD_NAME,
        api_key    = CLOUDINARY_API_KEY,
        api_secret = CLOUDINARY_API_SECRET,
        secure     = True,
    )
    CLOUDINARY_STORAGE = {
        'CLOUD_NAME': CLOUDINARY_CLOUD_NAME,
        'API_KEY':    CLOUDINARY_API_KEY,
        'API_SECRET': CLOUDINARY_API_SECRET,
    }
    STORAGES = {
        'default': {
            'BACKEND': 'cloudinary_storage.storage.MediaCloudinaryStorage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
        },
    }
else:
    # Dev fallback — images stored locally in backend/media/
    STORAGES = {
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
        },
        'staticfiles': {
            'BACKEND': 'whitenoise.storage.CompressedManifestStaticFilesStorage',
        },
    }

MEDIA_URL  = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

# ── Razorpay Payment Gateway (patient checkout) ───────────────────────────────
# The accept-payment flow. Doctor payouts are MANUAL (see payments.payout_utils
# / payments.views.MarkPayoutPaidView) — no payout API keys needed here.
RAZORPAY_KEY_ID     = config('RAZORPAY_KEY_ID',     default='')
RAZORPAY_KEY_SECRET = config('RAZORPAY_KEY_SECRET', default='')

# ── TokenWalla GST identity (for patient receipts) ────────────────────────────
TOKENWALLA_GSTIN = config('TOKENWALLA_GSTIN', default='')
TWOFACTOR_API_KEY   = config('TWOFACTOR_API_KEY',   default='')
WHATSAPP_ACCESS_TOKEN            = config('WHATSAPP_ACCESS_TOKEN', default='')
WHATSAPP_PHONE_NUMBER_ID         = config('WHATSAPP_PHONE_NUMBER_ID', default='')
WHATSAPP_BUSINESS_ACCOUNT_ID     = config('WHATSAPP_BUSINESS_ACCOUNT_ID', default='')
WHATSAPP_API_VERSION             = config('WHATSAPP_API_VERSION', default='v21.0')
WHATSAPP_TEMPLATE_BOOKING_CONFIRM = config('WHATSAPP_TEMPLATE_BOOKING_CONFIRM', default='booking_confirmation')
WHATSAPP_TEMPLATE_REMINDER       = config('WHATSAPP_TEMPLATE_REMINDER', default='appointment_reminder')
WHATSAPP_TEMPLATE_DOCTOR_UNAVAILABLE = config('WHATSAPP_TEMPLATE_DOCTOR_UNAVAILABLE', default='doctor_unavailable')
WHATSAPP_TEMPLATE_HOSPITAL_NEW_BOOKING = config('WHATSAPP_TEMPLATE_HOSPITAL_NEW_BOOKING', default='hospital_new_booking')
WHATSAPP_TEMPLATE_DOCTOR_PAYOUT  = config('WHATSAPP_TEMPLATE_DOCTOR_PAYOUT', default='doctor_payout')
WHATSAPP_TEMPLATE_BOOKING_CANCELLED = config('WHATSAPP_TEMPLATE_BOOKING_CANCELLED', default='booking_cancelled')
WHATSAPP_TEMPLATE_NO_SHOW        = config('WHATSAPP_TEMPLATE_NO_SHOW', default='booking_no_show')
WHATSAPP_TEMPLATE_LANG           = config('WHATSAPP_TEMPLATE_LANG', default='en')
ADMIN_SETUP_KEY = config('ADMIN_SETUP_KEY', default='')

# ── Mobile app version gate ───────────────────────────────────────────────────
# Read by GET /api/app-version/ and used by the app to decide whether to nag or
# block on launch. Set on Railway; changing a variable there redeploys the
# service, and every installed app picks the new values up on its next launch —
# no store release needed to start or stop prompting.
#
#   APP_MIN_VERSION    below this, the app blocks (its API calls no longer match
#                      this backend). Leave EMPTY to never block — that is the
#                      default on purpose, so a typo can't brick every install.
#   APP_LATEST_VERSION below this, the app shows a dismissible "update available".
#
# Both are dotted numeric strings ('1.2.0'). An empty value disables that tier.
APP_MIN_VERSION    = config('APP_MIN_VERSION',    default='')
APP_LATEST_VERSION = config('APP_LATEST_VERSION', default='')
APP_STORE_URL      = config(
    'APP_STORE_URL',
    default='https://play.google.com/store/apps/details?id=com.vishnu2004.Tokenwalla',
)
APP_UPDATE_MESSAGE = config('APP_UPDATE_MESSAGE', default='')

# ── Logging ───────────────────────────────────────────────────────────────────
LOGGING = {
    'version':                  1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style':  '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style':  '{',
        },
    },
    'handlers': {
        'console': {
            'class':     'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level':    'WARNING',
    },
    'loggers': {
        'django': {
            'handlers':  ['console'],
            'level':     config('DJANGO_LOG_LEVEL', default='WARNING'),
            'propagate': False,
        },
        'tokenwalla': {
            'handlers':  ['console'],
            'level':     'DEBUG',
            'propagate': False,
        },
    },
}

# ── Localisation ──────────────────────────────────────────────────────────────
LANGUAGE_CODE      = 'en-us'
TIME_ZONE          = 'Asia/Kolkata'
USE_I18N           = True
USE_TZ             = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ── Password Validation ────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME':    'django.contrib.auth.password_validation.MinimumLengthValidator',
        'OPTIONS': {'min_length': 6},
    },
]

# ── Security headers ──────────────────────────────────────────────────────────
SECURE_BROWSER_XSS_FILTER  = True
X_FRAME_OPTIONS             = 'DENY'
SECURE_CONTENT_TYPE_NOSNIFF = True

if not DEBUG:
    SECURE_SSL_REDIRECT            = True
    SESSION_COOKIE_SECURE          = True
    CSRF_COOKIE_SECURE             = True
    SECURE_HSTS_SECONDS            = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD            = True
    SECURE_PROXY_SSL_HEADER        = ('HTTP_X_FORWARDED_PROTO', 'https')

# The test client speaks plain HTTP, so SECURE_SSL_REDIRECT turns every request
# into a 301 and the whole suite fails on status codes. Whether the suite runs
# is then decided by whatever DEBUG happens to be in the local .env, which is
# not something a test result should depend on.
if 'test' in sys.argv:
    SECURE_SSL_REDIRECT = False
    # Never let the suite talk to a real Redis (or a real cache table): the
    # throttle and OTP tests assume an isolated cache they can clear between
    # cases, and a developer with REDIS_URL set locally would otherwise get
    # cross-test bleed that looks like flakiness.
    CACHES = {
        'default': {
            'BACKEND':  'django.core.cache.backends.locmem.LocMemCache',
            'LOCATION': 'tokenwalla-tests',
        }
    }