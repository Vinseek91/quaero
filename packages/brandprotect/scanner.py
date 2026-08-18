"""
QUAERYX Brand Sentinel — URL Risk Scorer
Detects phishing / fake brand sites without any paid APIs.
"""
import re
import asyncio
from urllib.parse import urlparse
from loguru import logger
from .brands import PROTECTED_BRANDS


def _levenshtein(a: str, b: str) -> int:
    """Compute edit distance between two strings."""
    if len(a) < len(b):
        return _levenshtein(b, a)
    if len(b) == 0:
        return len(a)
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        curr = [i + 1]
        for j, cb in enumerate(b):
            curr.append(min(prev[j + 1] + 1, curr[j] + 1, prev[j] + (ca != cb)))
        prev = curr
    return prev[len(b)]


def _similarity(a: str, b: str) -> float:
    """Return 0.0–1.0 similarity score."""
    if not a or not b:
        return 0.0
    dist = _levenshtein(a.lower(), b.lower())
    return 1.0 - dist / max(len(a), len(b))


def _extract_domain(url: str) -> str:
    """Extract bare domain without www/TLD for comparison."""
    try:
        host = urlparse(url if url.startswith("http") else f"https://{url}").hostname or ""
        host = host.lower().replace("www.", "")
        # Remove TLD — keep only the registrable part
        parts = host.split(".")
        return parts[-2] if len(parts) >= 2 else host
    except Exception:
        return url.lower()


def score_url(url: str) -> dict:
    """
    Score a URL for brand impersonation risk.
    Returns: {risk: int 0-100, brand: str|None, reasons: list, is_suspicious: bool}
    """
    if not url or not url.strip():
        return {"risk": 0, "brand": None, "reasons": [], "is_suspicious": False}

    try:
        parsed = urlparse(url if url.startswith("http") else f"https://{url}")
        full_host = (parsed.hostname or "").lower().replace("www.", "")
        domain_core = _extract_domain(url)
    except Exception:
        return {"risk": 0, "brand": None, "reasons": [], "is_suspicious": False}

    best_risk = 0
    best_brand = None
    reasons = []

    for brand in PROTECTED_BRANDS:
        official_core = _extract_domain(brand["domain"])
        brand_name = brand["name"]

        # Skip if this IS the official domain
        if full_host == brand["domain"] or full_host in brand.get("alt_domains", []):
            continue

        risk = 0
        brand_reasons = []

        # 1. Keyword in domain
        for kw in brand["keywords"]:
            if kw in full_host:
                risk += 40
                brand_reasons.append(f'Contains brand keyword "{kw}"')
                break

        # 2. High similarity to official domain core
        sim = _similarity(domain_core, official_core)
        if sim >= 0.85:
            risk += 35
            brand_reasons.append(f"Domain {sim*100:.0f}% similar to {brand['domain']}")
        elif sim >= 0.70:
            risk += 20
            brand_reasons.append(f"Domain {sim*100:.0f}% similar to {brand['domain']}")

        # 3. Official domain core IS a substring of the fake domain
        if official_core in domain_core and domain_core != official_core:
            risk += 20
            brand_reasons.append(f"Official domain name embedded in fake domain")

        # 4. Suspicious TLD patterns
        suspicious_tlds = [".xyz", ".top", ".club", ".online", ".site", ".tk", ".ml", ".ga", ".cf", ".gq", ".pw", ".cc"]
        for tld in suspicious_tlds:
            if full_host.endswith(tld):
                risk += 15
                brand_reasons.append(f"Suspicious TLD: {tld}")
                break

        # 5. Hyphenated brand name (ebay-deals.com)
        for kw in brand["keywords"]:
            if f"{kw}-" in full_host or f"-{kw}" in full_host:
                risk += 15
                brand_reasons.append(f"Brand name used with hyphen")
                break

        # 6. Brand + country/region pattern (ebayindia.com, applestore-in.com)
        geo_words = ["india", "in", "us", "uk", "au", "ca", "store", "shop", "deals", "offer", "free", "win", "prize", "secure", "login", "verify", "update", "account", "support"]
        for kw in brand["keywords"]:
            for geo in geo_words:
                if f"{kw}{geo}" in full_host or f"{geo}{kw}" in full_host:
                    risk += 10
                    brand_reasons.append(f'Geo/action word "{geo}" combined with brand name')
                    break

        if risk > best_risk:
            best_risk = min(risk, 100)
            best_brand = brand_name
            reasons = brand_reasons

    is_suspicious = best_risk >= 50

    return {
        "risk": best_risk,
        "brand": best_brand,
        "reasons": reasons,
        "is_suspicious": is_suspicious,
        "url": url,
    }


def score_results(results: list[dict]) -> list[dict]:
    """Add risk scores to a list of search results."""
    for r in results:
        url = r.get("url", "")
        scored = score_url(url)
        r["risk_score"] = scored["risk"]
        r["risk_brand"] = scored["brand"]
        r["risk_reasons"] = scored["reasons"]
        r["is_suspicious"] = scored["is_suspicious"]
    return results


def get_brand_info(brand_name: str) -> dict | None:
    """Look up a brand by name."""
    name_lower = brand_name.lower()
    for b in PROTECTED_BRANDS:
        if name_lower in b["name"].lower() or any(name_lower in kw for kw in b["keywords"]):
            return b
    return None
