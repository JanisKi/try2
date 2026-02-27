# chatbot/services.py

import os  # Environment access
import re  # Regex parsing
import requests  # HTTP client
from datetime import timedelta
from django.utils import timezone

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"  # OpenRouter endpoint :contentReference[oaicite:9]{index=9}

def parse_any_date_from_text(text: str):
    """
    Parse a date from text.
    Supports:
      - YYYY-MM-DD
      - DD.MM.YYYY   ✅ NEW
      - today / tomorrow
    Returns a date or None.
    """
    t = (text or "").lower()

    # YYYY-MM-DD
    m = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", t)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return timezone.datetime(y, mo, d).date()
        except ValueError:
            return None

    # ✅ DD.MM.YYYY (allow 1 or 2 digits for day/month)
    m = re.search(r"\b(\d{1,2})\.(\d{1,2})\.(20\d{2})\b", t)
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

def parse_budget(text: str) -> float | None:
    """
    Extract budget from text.
    Supports:
      - "budget 500"
      - "I have 500 euros"
      - "€500"
      - "500 EUR"
    Returns float or None.
    """
    t = (text or "").lower()

    # Only treat numbers as budget if user used budget keywords or currency hints
    has_budget_hint = any(k in t for k in ["budget", "€", "eur", "euro", "euros"])
    if not has_budget_hint:
        return None

    # Match €500 / 500 eur / budget 500
    m = re.search(r"(?:€\s*)?(\d+(?:\.\d+)?)\s*(?:eur|euro|euros)?", t)
    if not m:
        return None

    try:
        return float(m.group(1))
    except ValueError:
        return None

def parse_departure_date(text: str):
    """
    Departure date parser (uses parse_any_date_from_text).
    """
    return parse_any_date_from_text(text)

def parse_return_date(text: str):
    """
    Parse return date if text contains return keywords like:
      - 'return on 5.03.2026'
      - 'back on 2026-03-05'
      - 'returning 05.03.2026'
    Returns a date or None.
    """
    t = (text or "").lower()

    # Look for a "return/back" chunk and parse a date from that chunk only
    m = re.search(r"\b(return|returning|back)\b(.{0,40})", t)
    if not m:
        return None

    # Only parse inside the matched tail after the keyword
    tail = m.group(2)
    return parse_any_date_from_text(tail)

# def parse_departure_date(text: str):
#     """
#     Try to extract a departure date from text.
#     Supports:
#       - YYYY-MM-DD
#       - 'tomorrow'
#       - 'today'
#     """
#     t = text.lower()

#     # Match an explicit date like 2026-03-15
#     m = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", t)
#     if m:
#         y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
#         try:
#             return timezone.datetime(y, mo, d).date()
#         except ValueError:
#             return None

#     # Match natural words
#     if "tomorrow" in t:
#         return timezone.localdate() + timedelta(days=1)

#     if "today" in t:
#         return timezone.localdate()

#     return None

def parse_adults(text: str) -> int:
    """
    Extract adults count from text.
    Examples:
      - 'for 2 adults'
      - '2 passengers'
      - '1 adult'
    """
    t = (text or "").lower()

    # Look for a number + people word
    m = re.search(r"\b(\d+)\s*(adult|adults|passenger|passengers|people)\b", t)
    if m:
        n = int(m.group(1))
        return max(1, min(n, 9))  # Clamp for MVP

    return 1

def extract_flight_intent(text: str):
    """
    Detect flight intent from multiple phrasing styles.

    Fix included:
    ✅ Handles punctuation like commas:
       "flight from Riga to Amsterdam, 1 adult, tomorrow"
       (comma used to break matching)

    Supported:
      - "flight from X to Y ..."
      - "flights from X to Y ..."
      - "fly from X to Y ..."
      - "fly to Y from X ..."
      - "flights to Y from X ..."
    """
    # 1) Normalize input (important!)
    # Replace punctuation with spaces so regex doesn't fail on "Amsterdam,"
    s = (text or "").strip()  # Original text
    s = re.sub(r"[,\.;:()\[\]{}]+", " ", s)  # Turn commas/dots/etc into spaces
    s = re.sub(r"\s+", " ", s).strip()  # Collapse multiple spaces

    # 2) Stop destination when extra words begin (date/adults/return keywords)
    stop_lookahead = (
        r"(?=\s+(?:"
        r"tomorrow|today|on|for|"
        r"return|returning|roundtrip|round-trip|back|"
        r"\d{4}-\d{2}-\d{2}|"
        r"\d+\s*(?:adult|adults|passenger|passengers|people)"
        r")|$)"
    )

    # 3) Allow: flight / flights / fly
    keyword = r"(?:flight|flights|fly)"

    # 4) Pattern A: "from X to Y"
    p1 = (
        rf"\b{keyword}\b\s+from\s+"
        r"(?P<origin>[A-Za-z][A-Za-z\- ]*?)\s+to\s+"
        r"(?P<dest>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    # 5) Pattern B: "to Y from X"
    p2 = (
        rf"\b{keyword}\b\s+to\s+"
        r"(?P<dest>[A-Za-z][A-Za-z\- ]*?)\s+from\s+"
        r"(?P<origin>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    # 6) Try both patterns
    m = re.search(p1, s, flags=re.IGNORECASE) or re.search(p2, s, flags=re.IGNORECASE)
    if not m:
        return None  # Not detected as a flight request

    # 7) Extract cities
    origin = m.group("origin").strip()
    destination = m.group("dest").strip()

    # 8) Reuse existing helpers for date/adults
    departure_date = parse_departure_date(s)
    return_date = parse_return_date(s)
    adults = parse_adults(s)
    budget = parse_budget(s)

    # ✅ Detect direct-only preference
    # (supports "direct", "only direct", "no stops", "nonstop", "non-stop")
    t = s.lower()
    direct_only = any(k in t for k in ["direct", "nonstop", "non-stop", "no stops", "without stops"])
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

# def extract_flight_intent(text: str) -> dict | None:
#     # Very simple MVP parser: "flight from Riga to Amsterdam"
#     # Later you can replace this with a better NLP parser.
#     pattern = r"\bflight\s+from\s+([A-Za-z\- ]+)\s+to\s+([A-Za-z\- ]+)\b"  # Capture origin+dest
#     m = re.search(pattern, text, flags=re.IGNORECASE)  # Try match
#     if not m:
#         return None  # No flight intent found
#     return {"intent_type": "flight_search", "origin": m.group(1).strip(), "destination": m.group(2).strip()}


def openrouter_chat(messages: list[dict]) -> str:
    # Read key + model from environment (loaded via .env in settings)
    api_key = os.environ.get("OPENROUTER_API_KEY")  # API key :contentReference[oaicite:10]{index=10}
    model = os.environ.get("OPENROUTER_MODEL", "openai/gpt-4o-mini")  # Model name

    if not api_key:
        raise RuntimeError("OPENROUTER_API_KEY is missing")

    headers = {
        "Authorization": f"Bearer {api_key}",  # Auth header :contentReference[oaicite:11]{index=11}
        "Content-Type": "application/json",  # JSON body
        # Optional OpenRouter headers (nice to have):
        # "HTTP-Referer": "http://localhost:8000",
        # "X-Title": "TravelApp MVP",
    }

    payload = {
        "model": model,  # Which model to use
        "messages": messages,  # Chat conversation
    }

    r = requests.post(OPENROUTER_URL, headers=headers, json=payload, timeout=30)  # Make request
    r.raise_for_status()  # Throw error if non-200

    data = r.json()  # Parse JSON
    return data["choices"][0]["message"]["content"]  # Return assistant text (OpenAI-style)
