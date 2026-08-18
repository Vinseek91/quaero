"""
QUAERYX Brand Sentinel — URL Risk Scorer + Certificate Transparency Scanner
Detects phishing / fake brand sites without any paid APIs.
Sources:
  - Heuristic domain scoring (Levenshtein + pattern matching)
  - crt.sh Certificate Transparency logs — every SSL cert ever issued, worldwide
  - PhishTank / OpenPhish / URLhaus community feeds
"""
import re
import asyncio
import datetime
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

    # Known safe domain patterns — subdomains of official sites are always legitimate
    # e.g. career.infosys.com, mail.google.com, portal.hdfcbank.com
    SAFE_SUBDOMAINS = {"career", "careers", "jobs", "mail", "email", "portal", "login",
                       "account", "accounts", "secure", "pay", "payments", "shop", "store",
                       "support", "help", "developer", "developers", "dev", "api", "docs",
                       "blog", "news", "media", "investor", "investors", "ir", "corporate",
                       "hr", "recruit", "recruitment", "campus", "apply", "id", "sso", "auth"}

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

        # Build full list of safe domains for this brand
        all_official = [brand["domain"]] + brand.get("alt_domains", [])

        # Skip if this IS the official domain or an official alt domain
        if full_host in all_official:
            continue

        # Skip if this is a LEGITIMATE SUBDOMAIN of an official domain
        # e.g. career.infosys.com → ends with .infosys.com → SAFE
        is_official_subdomain = any(
            full_host.endswith("." + od) for od in all_official
        )
        if is_official_subdomain:
            continue

        risk = 0
        brand_reasons = []

        # 1. Keyword in domain — only score if NOT a legitimate subdomain pattern
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
        # BUT not if the fake domain is just keyword.officialdomain.com (already caught above)
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


# ── Certificate Transparency Scanner ─────────────────────────────────────────

async def _fetch_crt(keyword: str, days: int = 30) -> list[dict]:
    """
    Query crt.sh for SSL certs containing `keyword` issued in the last `days` days.
    Returns list of {domain, issued_at, issuer, cert_id}.
    """
    import httpx
    url = f"https://crt.sh/?q=%25{keyword}%25&output=json"
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    results = []
    seen = set()

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"Accept": "application/json"})
            if r.status_code != 200:
                logger.warning(f"crt.sh returned {r.status_code} for keyword '{keyword}'")
                return []

            certs = r.json()
            for cert in certs:
                # Each cert may have multiple SANs separated by newlines
                name_value = cert.get("name_value", "")
                domains = [d.strip().lstrip("*.") for d in name_value.split("\n") if d.strip()]

                # Parse issue date — crt.sh format: "2024-01-15T12:34:56"
                not_before_str = cert.get("not_before", "")
                try:
                    issued_at = datetime.datetime.strptime(not_before_str[:19], "%Y-%m-%dT%H:%M:%S")
                except Exception:
                    continue

                if issued_at < cutoff:
                    continue  # Too old

                for domain in domains:
                    if domain in seen:
                        continue
                    seen.add(domain)
                    results.append({
                        "domain": domain,
                        "issued_at": issued_at.strftime("%Y-%m-%d"),
                        "issuer": cert.get("issuer_name", ""),
                        "cert_id": cert.get("id", ""),
                    })
    except Exception as e:
        logger.error(f"crt.sh fetch error for '{keyword}': {e}")

    return results


async def ct_scan_brand(brand_name: str, days: int = 30) -> dict:
    """
    Scan Certificate Transparency logs for fake sites impersonating `brand_name`.

    Queries crt.sh for every SSL cert issued in the last `days` days that
    contains any of the brand's keywords in the domain. Scores each discovered
    domain using score_url() and returns suspicious ones.

    Returns:
        {brand, official_domain, days_scanned, certs_checked, threats_found, threats: [...]}
    """
    brand_info = get_brand_info(brand_name)
    if not brand_info:
        return {"ok": False, "error": f"Brand '{brand_name}' not in protected list"}

    all_domains: list[dict] = []

    # Fetch certs for each brand keyword in parallel
    tasks = [_fetch_crt(kw, days) for kw in brand_info["keywords"]]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    seen_domains: set[str] = set()
    for batch in results:
        if isinstance(batch, Exception):
            continue
        for entry in batch:
            d = entry["domain"]
            if d not in seen_domains:
                seen_domains.add(d)
                all_domains.append(entry)

    # Score every discovered domain
    threats = []
    for entry in all_domains:
        scored = score_url(entry["domain"])
        if scored["is_suspicious"] and scored["brand"] == brand_info["name"]:
            # Build crt.sh link for the certificate
            cert_link = f"https://crt.sh/?id={entry['cert_id']}" if entry["cert_id"] else ""
            threats.append({
                "domain": entry["domain"],
                "url": f"https://{entry['domain']}",
                "risk_score": scored["risk"],
                "reasons": scored["reasons"],
                "issued_at": entry["issued_at"],
                "issuer": entry["issuer"],
                "cert_link": cert_link,
                "report_to": brand_info["security_email"],
            })

    # Sort by risk score descending
    threats.sort(key=lambda x: x["risk_score"], reverse=True)

    return {
        "ok": True,
        "brand": brand_info["name"],
        "official_domain": brand_info["domain"],
        "days_scanned": days,
        "certs_checked": len(all_domains),
        "threats_found": len(threats),
        "threats": threats,
        "report_to": brand_info["security_email"],
        "cert_in": "https://www.cert-in.org.in/",
        "google_safe_browsing": "https://safebrowsing.google.com/safebrowsing/report_phish/",
        "scanned_at": datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC"),
    }


async def ct_scan_all_brands(days: int = 7) -> list[dict]:
    """
    Run CT log scans for ALL 45+ protected brands simultaneously.
    Called by the background scheduler every 6 hours.
    Returns only brands that have threats.
    """
    tasks = [ct_scan_brand(b["name"], days) for b in PROTECTED_BRANDS]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    active_threats = []
    for r in results:
        if isinstance(r, Exception) or not isinstance(r, dict):
            continue
        if r.get("ok") and r.get("threats_found", 0) > 0:
            active_threats.append(r)
    return active_threats
