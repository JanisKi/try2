# chatbot/services.py

import os
import re
import requests
from datetime import timedelta
from django.utils import timezone

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


# ----------------------------
# Date parsing helpers
# ----------------------------

# NOTE: We support both:
#   - YYYY-MM-DD
#   - DD.MM.YYYY
ISO_DATE_RE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
DOT_DATE_RE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b")


def parse_any_date_from_text(text: str):
    """
    Parse a date from text.

    Supports:
      - YYYY-MM-DD
      - DD.MM.YYYY
      - "today" / "tomorrow"

    Returns a date or None.
    """
    t = (text or "").lower()

    # 1) YYYY-MM-DD
    m = ISO_DATE_RE.search(t)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return timezone.datetime(y, mo, d).date()
        except ValueError:
            return None

    # 2) DD.MM.YYYY
    m = DOT_DATE_RE.search(t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return timezone.datetime(y, mo, d).date()
        except ValueError:
            return None

    # 3) natural words
    if "tomorrow" in t:
        return timezone.localdate() + timedelta(days=1)
    if "today" in t:
        return timezone.localdate()

    return None


def parse_departure_date(text: str):
    """
    Departure date parser (just parses any date from the whole text).
    """
    return parse_any_date_from_text(text)


def parse_return_date(text: str):
    """
    Parse return date only if text contains keywords like:
      - 'return on 05.03.2026'
      - 'back on 2026-03-05'
      - 'returning 05.03.2026'
    """
    t = (text or "").lower()
    m = re.search(r"\b(return|returning|back)\b(.{0,60})", t)
    if not m:
        return None
    tail = m.group(2)
    return parse_any_date_from_text(tail)


# ----------------------------
# Budget / adults helpers
# ----------------------------

def parse_budget(text: str) -> float | None:
    """
    Strict budget extraction:
      ✅ €500 / 500€
      ✅ 500 eur / 500 euros
      ✅ budget 500 (optionally with eur/euro)
      ❌ must NOT match dates like 27.02.2026
    """
    t = (text or "").lower()

    # 1) Explicit "budget ..." (most reliable)
    m = re.search(r"\bbudget\s*(?:is\s*)?(?:€\s*)?(\d+(?:[.,]\d+)?)\s*(?:eur|euro|euros)?\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 2) Currency sign before number: €500 or € 500
    m = re.search(r"€\s*(\d+(?:[.,]\d+)?)\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 3) Currency sign after number: 500€
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*€\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 4) Currency word after number: 500 eur / euros
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(eur|euro|euros)\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    return None


def parse_adults(text: str) -> int:
    """
    Extract adults count from text.
    Examples:
      - 'for 2 adults'
      - '2 passengers'
      - '1 adult'
    """
    t = (text or "").lower()
    m = re.search(r"\b(\d+)\s*(adult|adults|passenger|passengers|people)\b", t)
    if m:
        n = int(m.group(1))
        return max(1, min(n, 9))  # clamp for MVP
    return 1


# ----------------------------
# IMPORTANT FIX: Preserve DD.MM.YYYY during punctuation cleanup
# ----------------------------

def _stash_dates(text: str) -> tuple[str, dict[str, str]]:
    """
    We *must* protect dates like 27.02.2026 before we remove punctuation.

    Without this, your normalization:
        re.sub(r"[,\.;:()...]", " ", text)
    turns "27.02.2026" into "27 02 2026"
    and then DD.MM.YYYY regex can no longer match.

    Strategy:
      - Replace dates with placeholders: __DATE0__, __DATE1__ ...
      - Clean punctuation safely
      - Restore dates back when parsing
    """
    stash: dict[str, str] = {}
    i = 0

    def repl(m: re.Match) -> str:
        nonlocal i
        key = f"__DATE{i}__"
        stash[key] = m.group(0)
        i += 1
        return key

    # stash both formats
    text = DOT_DATE_RE.sub(repl, text)
    text = ISO_DATE_RE.sub(repl, text)
    return text, stash


def _restore_stashed_dates(text: str, stash: dict[str, str]) -> str:
    """
    Restore placeholders back to original date strings.
    """
    for k, v in stash.items():
        text = text.replace(k, v)
    return text


# ----------------------------
# Flight intent extraction
# ----------------------------

def extract_flight_intent(text: str):
    """
    Detect flight intent from multiple phrasing styles.

    Supported:
      - "flight(s)/fly from X to Y ..."
      - "flight(s)/fly to Y from X ..."
      - punctuation cleanup
      - dates: YYYY-MM-DD and DD.MM.YYYY
      - return: "return on ..."
      - direct: "direct only", "only direct", "nonstop", "no stops"
      - budget: "€500", "budget 500 euros", etc.
    """
    original = (text or "").strip()
    if not original:
        return None

    # 1) Stash dates so we don't destroy DD.MM.YYYY during punctuation cleanup
    s, date_stash = _stash_dates(original)

    # 2) Normalize punctuation (safe now because dates are placeholders)
    # NOTE: This is the line that previously broke 27.02.2026.
    s = re.sub(r"[,\.;:()\[\]{}]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    # 3) Restore dates back for date parsing
    date_parse_text = _restore_stashed_dates(s, date_stash)

    # 4) Stop destination when extra words begin (date/adults/return keywords)
    stop_lookahead = (
        r"(?=\s+(?:"
        r"tomorrow|today|on|for|"
        r"return|returning|roundtrip|round-trip|back|"
        r"\d{4}-\d{2}-\d{2}|"
        r"\d{1,2}\.\d{1,2}\.20\d{2}|"
        r"\d+\s*(?:adult|adults|passenger|passengers|people)"
        r")|$)"
    )

    keyword = r"(?:flight|flights|fly)"

    # 5) Pattern A: "from X to Y"
    p1 = (
        rf"\b{keyword}\b\s+from\s+"
        rf"(?P<origin>[A-Za-z][A-Za-z\- ]*?)\s+to\s+"
        rf"(?P<dest>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    # 6) Pattern B: "to Y from X"
    p2 = (
        rf"\b{keyword}\b\s+to\s+"
        rf"(?P<dest>[A-Za-z][A-Za-z\- ]*?)\s+from\s+"
        rf"(?P<origin>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    m = re.search(p1, s, flags=re.IGNORECASE) or re.search(p2, s, flags=re.IGNORECASE)
    if not m:
        return None

    origin = m.group("origin").strip()
    destination = m.group("dest").strip()

    # 7) Parse fields using the restored string (so DD.MM.YYYY works!)
    departure_date = parse_departure_date(date_parse_text)
    return_date = parse_return_date(date_parse_text)
    adults = parse_adults(date_parse_text)
    budget = parse_budget(date_parse_text)

    # 8) Direct-only detection
    t = date_parse_text.lower()
    direct_only = any(k in t for k in ["direct only", "only direct", "direct", "nonstop", "non-stop", "no stops", "without stops"])
    max_stops = 0 if direct_only else None

    return {
        "intent_type": "flight_search",
        "origin": origin,
        "destination": destination,
        "departure_date": departure_date,
        "return_date": return_date,
        "adults": adults,
        "max_stops": max_stops,
        "budget": budget,
    }


# ----------------------------
# OpenRouter chat
# ----------------------------

def openrouter_chat(messages: list[dict]) -> str:
    """
    Sends messages to OpenRouter and returns assistant content.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is missing")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        # Optional:
        # "HTTP-Referer": "http://localhost:8000",
        # "X-Title": "TravelApp MVP",
    }

    payload = {"model": model, "messages": messages}
    r = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["choices"][0]["message"]["content"]