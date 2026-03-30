"""URL parsing and normalization utilities."""

from urllib.parse import urlparse, urlunparse


def normalize_url(url: str) -> str:
    """
    Normalize URL for consistent storage and comparison.

    Rules:
    1. No scheme -> add https://
    2. Scheme + host to lowercase
    3. Remove trailing /
    4. Remove default port (http:80, https:443)
    5. Remove fragment (#)
    6. Empty or invalid URL -> return ""
    7. Preserve path and query params
    """
    if not url or not isinstance(url, str):
        return ""

    s = url.strip()
    if not s:
        return ""

    if "://" not in s:
        s = f"https://{s}"

    try:
        parsed = urlparse(s)
    except Exception:
        return ""

    if not parsed.netloc:
        return ""

    scheme = parsed.scheme.lower()
    host = parsed.hostname or ""
    port = parsed.port
    path = parsed.path or "/"
    query = parsed.query
    # Fragment explicitly omitted

    if scheme not in ("http", "https"):
        return ""

    host_lower = host.lower()

    if port:
        if (scheme == "http" and port == 80) or (scheme == "https" and port == 443):
            port = None

    path = path.rstrip("/") or ""

    netloc = host_lower
    if port:
        netloc = f"{host_lower}:{port}"

    normalized = urlunparse((scheme, netloc, path, "", query, ""))
    return normalized
