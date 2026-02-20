
# SECRET_KEY = 'django-insecure-lmm1y=uchd+*u^^$7w(ie+lr5ixaa_xo8g$i^5&vj#=xx=^v%i'
# travelapp/settings.py

from pathlib import Path  # Import Path for filesystem paths
import environ  # Import django-environ for .env handling
from datetime import timedelta  # Used for token lifetime durations

BASE_DIR = Path(__file__).resolve().parent.parent  # Project root directory

env = environ.Env(  # Create env reader with defaults
    DJANGO_DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR / ".env")  # Load variables from .env

SIMPLE_JWT = {
    # Make access tokens last longer during development
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=12),

    # Refresh tokens can last longer (example)
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
}

SECRET_KEY = env("DJANGO_SECRET_KEY")  # Secret key from .env
DEBUG = env("DJANGO_DEBUG")  # Debug flag from .env

ALLOWED_HOSTS = ["127.0.0.1", "localhost"]  # Local dev hosts

INSTALLED_APPS = [
    "django.contrib.admin",  # Admin
    "django.contrib.auth",  # Auth
    "django.contrib.contenttypes",  # Content types
    "django.contrib.sessions",  # Sessions
    "django.contrib.messages",  # Messages
    "django.contrib.staticfiles",  # Static files
    # Third-party
    "rest_framework",
    "corsheaders",
    "rest_framework_simplejwt.token_blacklist",  # enables logout blacklisting

    # Your apps
    "accounts",
    "chatbot",
    "travel",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # allow React frontend to call API
    "django.middleware.security.SecurityMiddleware",  # Security middleware
    "django.contrib.sessions.middleware.SessionMiddleware",  # Session support
    "django.middleware.common.CommonMiddleware",  # Common HTTP middleware
    "django.middleware.csrf.CsrfViewMiddleware",  # CSRF protection
    "django.contrib.auth.middleware.AuthenticationMiddleware",  # Auth
    "django.contrib.messages.middleware.MessageMiddleware",  # Messages
    "django.middleware.clickjacking.XFrameOptionsMiddleware",  # Clickjacking protection
]

CORS_ALLOWED_ORIGINS = [
    "http://localhost:5173",
]

ROOT_URLCONF = "travelapp.urls"  # Root URL config

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",  # Django templates
        "DIRS": [BASE_DIR / "templates"],  # Global templates folder
        "APP_DIRS": True,  # Also look in app templates/
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",  # Request in templates
                "django.contrib.auth.context_processors.auth",  # Auth in templates
                "django.contrib.messages.context_processors.messages",  # Messages
            ],
        },
    },
]

WSGI_APPLICATION = "travelapp.wsgi.application"  # WSGI entrypoint

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",  # Postgres backend
        "NAME": env("DB_NAME"),  # DB name
        "USER": env("DB_USER"),  # DB user
        "PASSWORD": env("DB_PASSWORD"),  # DB password
        "HOST": env("DB_HOST"),  # DB host
        "PORT": env("DB_PORT"),  # DB port
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},  # Prevent similar pw
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},  # Min length
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},  # Block common pw
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},  # Block numeric-only pw
]

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
        "rest_framework.authentication.SessionAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.AllowAny",
    ),
}

AUTH_USER_MODEL = "accounts.User"  # Use our custom user model

LOGIN_REDIRECT_URL = "/"  # Where to go after login
LOGOUT_REDIRECT_URL = "/"  # Where to go after logout

STATIC_URL = "static/"  # Static URL

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"  # Default PK type
