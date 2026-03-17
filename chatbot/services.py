# chatbot/services.py

import os
import re
import requests
from datetime import timedelta
from django.utils import timezone

# OpenRouter endpoint
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# ---------------------------------------------------------
# Date regexes
# ---------------------------------------------------------
# Supported formats:
#   - 2026-03-15
#   - 15.03.2026
ISO_DATE_RE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
DOT_DATE_RE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b")


# ---------------------------------------------------------
# Date helpers
# ---------------------------------------------------------
def parse_any_date_from_text(text: str):
    """
    Parse one date from text.

    Supports:
      - YYYY-MM-DD
      - DD.MM.YYYY
      - today
      - tomorrow

    Returns:
      date or None
    """
    t = (text or "").lower()

    # YYYY-MM-DD
    m = ISO_DATE_RE.search(t)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return timezone.datetime(y, mo, d).date()
        except ValueError:
            return None

    # DD.MM.YYYY
    m = DOT_DATE_RE.search(t)
    if m:
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return timezone.datetime(y, mo, d).date()
        except ValueError:
            return None

    # Natural words
    if "tomorrow" in t:
        return timezone.localdate() + timedelta(days=1)

    if "today" in t:
        return timezone.localdate()

    return None


def extract_all_dates(text: str):
    """
    Extract all dates from text in the order they appear.

    Example:
      "I want to go to Amsterdam 15.03.2026 until 25.03.2026"

    Returns:
      [date(2026, 3, 15), date(2026, 3, 25)]
    """
    text = text or ""
    items = []

    # Find DD.MM.YYYY with position
    for m in DOT_DATE_RE.finditer(text):
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            items.append((m.start(), timezone.datetime(y, mo, d).date()))
        except ValueError:
            pass

    # Find YYYY-MM-DD with position
    for m in ISO_DATE_RE.finditer(text):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            items.append((m.start(), timezone.datetime(y, mo, d).date()))
        except ValueError:
            pass

    # Sort by appearance in string
    items.sort(key=lambda x: x[0])

    # Remove duplicates while preserving order
    dates = []
    seen = set()
    for _, dt in items:
        if dt not in seen:
            dates.append(dt)
            seen.add(dt)

    return dates


def parse_departure_date(text: str):
    """
    Departure date:
    - first explicit date in the text
    - or parse_any_date_from_text fallback
    """
    dates = extract_all_dates(text)
    if dates:
        return dates[0]

    return parse_any_date_from_text(text)


def parse_return_date(text: str):
    """
    Return date:
    - explicit "return/back/until/till"
    - or second date in the text
    """
    t = (text or "").lower()

    m = re.search(r"\b(return|returning|back|until|till)\b(.{0,80})", t)
    if m:
        parsed = parse_any_date_from_text(m.group(2))
        if parsed:
            return parsed

    dates = extract_all_dates(text)
    if len(dates) >= 2:
        return dates[1]

    return None


# ---------------------------------------------------------
# Budget / passenger helpers
# ---------------------------------------------------------
def parse_budget(text: str) -> float | None:
    """
    Strict budget extraction.

    Accept:
      - budget 5000
      - €5000
      - 5000 eur
      - 5000 euros

    Reject:
      - dates like 15.03.2026
    """
    t = (text or "").lower()

    # budget 5000
    m = re.search(r"\bbudget\s*(?:is\s*)?(?:€\s*)?(\d+(?:[.,]\d+)?)\s*(?:eur|euro|euros)?\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # €5000
    m = re.search(r"€\s*(\d+(?:[.,]\d+)?)\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 5000€
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*€\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 5000 eur / euros
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(eur|euro|euros)\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    return None


def parse_adults(text: str) -> int:
    """
    Parse number of travelers.

    Supports:
      - 1 adult
      - 2 adults
      - 1 passenger
      - 2 passengers
      - 1 person
      - 2 people
    """
    t = (text or "").lower()

    m = re.search(
        r"\b(\d+)\s*(adult|adults|passenger|passengers|person|persons|people)\b",
        t,
    )
    if m:
        n = int(m.group(1))
        return max(1, min(n, 9))

    return 1


# ---------------------------------------------------------
# Preserve dates before punctuation cleanup
# ---------------------------------------------------------
def _stash_dates(text: str) -> tuple[str, dict[str, str]]:
    """
    Replace dates with placeholders so punctuation cleanup
    does not destroy DD.MM.YYYY.
    """
    stash: dict[str, str] = {}
    i = 0

    def repl(m: re.Match) -> str:
        nonlocal i
        key = f"__DATE{i}__"
        stash[key] = m.group(0)
        i += 1
        return key

    text = DOT_DATE_RE.sub(repl, text)
    text = ISO_DATE_RE.sub(repl, text)
    return text, stash


def _restore_stashed_dates(text: str, stash: dict[str, str]) -> str:
    """
    Restore placeholders back into the original date strings.
    """
    for k, v in stash.items():
        text = text.replace(k, v)
    return text


# ---------------------------------------------------------
# Destination extraction for broad trip prompts
# ---------------------------------------------------------
def extract_destination_city(text: str) -> str | None:
    """
    Extract a destination from broad trip prompts like:
      - I want to go to Amsterdam 15.03.2026 until 25.03.2026
      - going to Paris tomorrow
      - trip to London with 1000 euros
    """
    s = (text or "").strip()
    if not s:
        return None

    s, date_stash = _stash_dates(s)

    # Clean punctuation but keep placeholders
    s = re.sub(r"[,\.;:()\[\]{}]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    # Restore dates for final text analysis
    s = _restore_stashed_dates(s, date_stash)

    patterns = [
        r"\bi want to go to\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:with|for|on|from|until|till|budget|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2}|today|tomorrow)|$)",
        r"\bgoing to\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:with|for|on|from|until|till|budget|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2}|today|tomorrow)|$)",
        r"\btrip to\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:with|for|on|from|until|till|budget|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2}|today|tomorrow)|$)",
        r"\bto\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:with|for|on|from|until|till|budget|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2}|today|tomorrow)|$)",
    ]

    for pat in patterns:
        m = re.search(pat, s, flags=re.IGNORECASE)
        if m:
            dest = m.group("dest").strip()
            if dest:
                return dest

    return None


# ---------------------------------------------------------
# Main intent extraction
# ---------------------------------------------------------
def extract_flight_intent(text: str):
    """
    Detect travel intent from either:

    A) classic flight prompt:
       "flight from Riga to Amsterdam, 1 person, tomorrow"

    B) broad trip prompt:
       "I want to go to Amsterdam 15.03.2026 until 25.03.2026 with 5000 euros"

    Returns:
      dict or None
    """
    original = (text or "").strip()
    if not original:
        return None

    # Protect dates during punctuation cleanup
    s, date_stash = _stash_dates(original)
    s = re.sub(r"[,\.;:()\[\]{}]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    # Restore dates for downstream parsers
    date_parse_text = _restore_stashed_dates(s, date_stash)

    keyword = r"(?:flight|flights|fly)"

    # Stop destination capture when the next words look like filters/details
    stop_lookahead = (
        r"(?=\s+(?:"
        r"tomorrow|today|on|for|with|"
        r"return|returning|roundtrip|round-trip|back|until|till|"
        r"\d{4}-\d{2}-\d{2}|"
        r"\d{1,2}\.\d{1,2}\.20\d{2}|"
        r"\d+\s*(?:adult|adults|passenger|passengers|person|persons|people)|"
        r"budget|€|eur|euro|euros"
        r")|$)"
    )

    # Pattern A: flight from X to Y
    p1 = (
        rf"\b{keyword}\b\s+from\s+"
        rf"(?P<origin>[A-Za-z][A-Za-z\- ]*?)\s+to\s+"
        rf"(?P<dest>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    # Pattern B: flight to Y from X
    p2 = (
        rf"\b{keyword}\b\s+to\s+"
        rf"(?P<dest>[A-Za-z][A-Za-z\- ]*?)\s+from\s+"
        rf"(?P<origin>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    m = re.search(p1, s, flags=re.IGNORECASE) or re.search(p2, s, flags=re.IGNORECASE)

    origin = None
    destination = None

    if m:
        origin = m.group("origin").strip()
        destination = m.group("dest").strip()
    else:
        # Broad trip prompt fallback:
        # if user says "I want to go to Amsterdam...", treat it as a valid travel intent
        destination = extract_destination_city(original)

        # MVP default origin if not supplied
        if destination:
            origin = "Riga"

    if not destination:
        return None

    departure_date = parse_departure_date(date_parse_text)
    return_date = parse_return_date(date_parse_text)
    adults = parse_adults(date_parse_text)
    budget = parse_budget(date_parse_text)

    t = date_parse_text.lower()
    direct_only = any(
        k in t
        for k in [
            "direct only",
            "only direct",
            "nonstop",
            "non-stop",
            "no stops",
            "without stops",
        ]
    )
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


# ---------------------------------------------------------
# OpenRouter chat
# ---------------------------------------------------------
def openrouter_chat(messages: list[dict]) -> str:
    """
    Send chat messages to OpenRouter and return assistant text.
    """
    api_key = os.environ.get("OPENROUTER_API_KEY")
    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is missing")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    payload = {
        "model": model,
        "messages": messages,
    }

    r = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)
    r.raise_for_status()
    data = r.json()
    return data["choices"][0]["message"]["content"]