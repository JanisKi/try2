# chatbot/services.py

import os
import re
import requests
from datetime import timedelta
from django.utils import timezone

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

# -------------------------------------------------
# Date parsing helpers
# -------------------------------------------------

# Supports:
#   - 2026-03-15
#   - 15.03.2026
ISO_DATE_RE = re.compile(r"\b(20\d{2})-(\d{2})-(\d{2})\b")
DOT_DATE_RE = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b")


def parse_any_date_from_text(text: str):
    """
    Parse the FIRST supported date from text.

    Supported:
      - YYYY-MM-DD
      - DD.MM.YYYY
      - today
      - tomorrow

    Returns:
      datetime.date or None
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


def extract_all_dates(text: str):
    """
    Extract ALL explicit dates from text, in order.

    Useful for prompts like:
      'I want to go to Paris 15.03.2026 until 25.03.2026'
    """
    text = text or ""
    found = []

    # Find YYYY-MM-DD
    for m in ISO_DATE_RE.finditer(text):
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            found.append(timezone.datetime(y, mo, d).date())
        except ValueError:
            pass

    # Find DD.MM.YYYY
    for m in DOT_DATE_RE.finditer(text):
        d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            found.append(timezone.datetime(y, mo, d).date())
        except ValueError:
            pass

    # Remove duplicates while preserving order
    unique = []
    seen = set()
    for dt in found:
        if dt not in seen:
            unique.append(dt)
            seen.add(dt)

    return unique


def parse_departure_date(text: str):
    """
    Try structured departure parsing first.
    If not available, fall back to the first date in the prompt.
    """
    dates = extract_all_dates(text)
    if dates:
        return dates[0]
    return parse_any_date_from_text(text)


def parse_return_date(text: str):
    """
    Return date parsing.

    Supports:
      - 'return on 25.03.2026'
      - 'back on 2026-03-25'
      - 'until 25.03.2026'
      - second date in free-form trip prompts
    """
    t = (text or "").lower()

    # Explicit return/back/until wording
    m = re.search(r"\b(return|returning|back|until|till)\b(.{0,80})", t)
    if m:
        tail = m.group(2)
        parsed = parse_any_date_from_text(tail)
        if parsed:
            return parsed

    # Fallback: second date in the prompt
    dates = extract_all_dates(text)
    if len(dates) >= 2:
        return dates[1]

    return None


# -------------------------------------------------
# Budget / adults helpers
# -------------------------------------------------

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

    # 1) explicit "budget ..."
    m = re.search(r"\bbudget\s*(?:is\s*)?(?:€\s*)?(\d+(?:[.,]\d+)?)\s*(?:eur|euro|euros)?\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 2) euro sign before number
    m = re.search(r"€\s*(\d+(?:[.,]\d+)?)\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 3) euro sign after number
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*€\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    # 4) currency word after number
    m = re.search(r"\b(\d+(?:[.,]\d+)?)\s*(eur|euro|euros)\b", t)
    if m:
        return float(m.group(1).replace(",", "."))

    return None


def parse_adults(text: str) -> int:
    """
    Extract adult count from text.
    """
    t = (text or "").lower()

    m = re.search(r"\b(\d+)\s*(adult|adults|passenger|passengers|people|persons)\b", t)
    if m:
        n = int(m.group(1))
        return max(1, min(n, 9))

    return 1


# -------------------------------------------------
# Helpers to preserve dotted dates during cleanup
# -------------------------------------------------

def _stash_dates(text: str) -> tuple[str, dict[str, str]]:
    """
    Protect DD.MM.YYYY / YYYY-MM-DD before punctuation cleanup.
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
    Put original date strings back.
    """
    for k, v in stash.items():
        text = text.replace(k, v)
    return text


# -------------------------------------------------
# Destination extraction for free-form trip prompts
# -------------------------------------------------

def extract_destination_city(text: str) -> str | None:
    """
    Extract destination city from broad prompts like:
      - 'I want to go to Paris 15.03.2026 until 25.03.2026'
      - 'Trip to Amsterdam tomorrow'
      - 'Going to London with 1000 euros'

    We stop city capture before dates / budget / adult words.
    """
    s = (text or "").strip()
    if not s:
        return None

    s, date_stash = _stash_dates(s)
    s = re.sub(r"[,\.;:()\[\]{}]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = _restore_stashed_dates(s, date_stash)

    patterns = [
        # I want to go to Paris ...
        r"\bi want to go to\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:on|from|until|till|for|with|budget|__DATE|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2})|$)",
        # trip to Paris ...
        r"\btrip to\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:on|from|until|till|for|with|budget|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2})|$)",
        # going to Paris ...
        r"\bgoing to\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:on|from|until|till|for|with|budget|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2})|$)",
        # to Paris ...
        r"\bto\s+(?P<dest>[A-Za-z][A-Za-z\- ]*?)(?=\s+(?:on|from|until|till|for|with|budget|\d{1,2}\.\d{1,2}\.20\d{2}|\d{4}-\d{2}-\d{2})|$)",
    ]

    for pat in patterns:
        m = re.search(pat, s, flags=re.IGNORECASE)
        if m:
            dest = m.group("dest").strip()
            if dest:
                return dest

    return None


# -------------------------------------------------
# Flight / trip intent extraction
# -------------------------------------------------

def extract_flight_intent(text: str):
    """
    Detect travel intent from either:
      A) classic flight command:
         'flights from Riga to Amsterdam on 27.02.2026'
      B) free-form trip command:
         'I want to go to Paris 15.03.2026 until 25.03.2026 with 5000 euros'

    Returns a dict or None.
    """
    original = (text or "").strip()
    if not original:
        return None

    # Preserve dates before punctuation cleanup
    s, date_stash = _stash_dates(original)
    s = re.sub(r"[,\.;:()\[\]{}]+", " ", s)
    s = re.sub(r"\s+", " ", s).strip()

    # Restore dates for parsing
    date_parse_text = _restore_stashed_dates(s, date_stash)

    keyword = r"(?:flight|flights|fly)"
    stop_lookahead = (
        r"(?=\s+(?:"
        r"tomorrow|today|on|for|"
        r"return|returning|roundtrip|round-trip|back|until|till|"
        r"\d{4}-\d{2}-\d{2}|"
        r"\d{1,2}\.\d{1,2}\.20\d{2}|"
        r"\d+\s*(?:adult|adults|passenger|passengers|people|persons)|"
        r"budget|€|eur|euro|euros"
        r")|$)"
    )

    # Pattern A: "flight from X to Y"
    p1 = (
        rf"\b{keyword}\b\s+from\s+"
        rf"(?P<origin>[A-Za-z][A-Za-z\- ]*?)\s+to\s+"
        rf"(?P<dest>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    # Pattern B: "flight to Y from X"
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
        # NEW:
        # If user gave a broad trip prompt, still treat it as a searchable travel intent.
        destination = extract_destination_city(original)

        # Sensible fallback for your MVP:
        # if the user does not specify origin, assume Riga.
        if destination:
            origin = "Riga"

    # If we still do not have a destination, not a trip/flight request we understand
    if not destination:
        return None

    departure_date = parse_departure_date(date_parse_text)
    return_date = parse_return_date(date_parse_text)
    adults = parse_adults(date_parse_text)
    budget = parse_budget(date_parse_text)

    t = date_parse_text.lower()
    direct_only = any(
        k in t for k in [
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


# -------------------------------------------------
# OpenRouter chat
# -------------------------------------------------

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