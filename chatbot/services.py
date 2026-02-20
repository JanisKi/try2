# chatbot/services.py

import os  # Environment access
import re  # Regex parsing
import requests  # HTTP client
from datetime import timedelta
from django.utils import timezone

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"  # OpenRouter endpoint :contentReference[oaicite:9]{index=9}

def parse_budget(text: str) -> float | None:
    """
    Extract budget from text like:
      - "I have 500 euros"
      - "budget 300"
      - "€250"
    Returns float or None.
    """
    t = (text or "").lower()

    # Match "€500" or "500 eur/euros"
    m = re.search(r"(?:€\s*)?(\d+(?:\.\d+)?)\s*(?:eur|euro|euros)?", t)
    if not m:
        return None

    # Only treat it as budget if user used budget words OR euro symbol OR eur word
    if "budget" in t or "€" in text or "eur" in t or "euro" in t:
        return float(m.group(1))

    return None

def parse_departure_date(text: str):
    """
    Try to extract a departure date from text.
    Supports:
      - YYYY-MM-DD
      - 'tomorrow'
      - 'today'
    """
    t = text.lower()

    # Match an explicit date like 2026-03-15
    m = re.search(r"\b(20\d{2})-(\d{2})-(\d{2})\b", t)
    if m:
        y, mo, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
        try:
            return timezone.datetime(y, mo, d).date()
        except ValueError:
            return None

    # Match natural words
    if "tomorrow" in t:
        return timezone.localdate() + timedelta(days=1)

    if "today" in t:
        return timezone.localdate()

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

    # Look for a number + people word
    m = re.search(r"\b(\d+)\s*(adult|adults|passenger|passengers|people)\b", t)
    if m:
        n = int(m.group(1))
        return max(1, min(n, 9))  # Clamp for MVP

    return 1

def extract_flight_intent(text: str):
    """
    Detect flight intent from multiple phrasing styles.
    Now supports:
      - 'flight from Riga to Amsterdam ...'
      - 'flights from Riga to Amsterdam ...'   ✅ plural
      - 'fly from Riga to Amsterdam ...'
      - 'fly to Amsterdam from Riga ...'
      - 'flights to Amsterdam from Riga ...'  ✅ plural
    """
    s = (text or "").strip()  # Normalize input text

    # This lookahead stops capturing city names when extra words start
    stop_lookahead = r"(?=\s+(?:tomorrow|today|on|for|return|returning|roundtrip|round-trip|back|\d{4}-\d{2}-\d{2}|\d+\s*(?:adult|adults|passenger|passengers|people))|$)"

    # ✅ Allow: flight / flights / fly
    keyword = r"(?:flight|flights|fly)"

    # Pattern A: from X to Y
    p1 = (
        rf"\b{keyword}\b\s+from\s+"
        r"(?P<origin>[A-Za-z][A-Za-z\- ]*?)\s+to\s+"
        r"(?P<dest>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    # Pattern B: to Y from X
    p2 = (
        rf"\b{keyword}\b\s+to\s+"
        r"(?P<dest>[A-Za-z][A-Za-z\- ]*?)\s+from\s+"
        r"(?P<origin>[A-Za-z][A-Za-z\- ]*?)"
        + stop_lookahead
    )

    # Try both patterns (case-insensitive)
    m = re.search(p1, s, flags=re.IGNORECASE) or re.search(p2, s, flags=re.IGNORECASE)
    if not m:
        return None  # Not a flight request

    # Extract cities
    origin = m.group("origin").strip()
    destination = m.group("dest").strip()

    # Reuse your existing helpers
    departure_date = parse_departure_date(s)
    adults = parse_adults(s)

    # Return intent object used by ChatSendView
    return {
        "intent_type": "flight_search",
        "origin": origin,
        "destination": destination,
        "departure_date": departure_date,
        "adults": adults,
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
