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

def _parse_ct_date(s: str) -> datetime.datetime | None:
    """Parse crt.sh date — handles both '2026-01-15 12:34:56' and '2026-01-15T12:34:56'."""
    if not s:
        return None
    s = s[:19].replace("T", " ")
    try:
        return datetime.datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    except Exception:
        return None


async def _fetch_crt(keyword: str, days: int = 30) -> tuple[list[dict], str | None]:
    """
    Query crt.sh for SSL certs containing `keyword` issued in the last `days` days.
    Returns (list of {domain, issued_at, issuer, cert_id}, error_message | None).
    Retries up to 3 times on 5xx errors.
    """
    import httpx
    url = f"https://crt.sh/?q=%25{keyword}%25&output=json"
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    seen: set[str] = set()
    results: list[dict] = []

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=25.0, follow_redirects=True) as client:
                r = await client.get(url, headers={"Accept": "application/json", "User-Agent": "QUAERYX-BrandSentinel/1.0"})
                if r.status_code == 429:
                    return [], "crt.sh rate limit hit — try again in a few minutes"
                if r.status_code >= 500:
                    if attempt < 2:
                        await asyncio.sleep(3 * (attempt + 1))
                        continue
                    return [], f"crt.sh unavailable (HTTP {r.status_code}) — try again later"
                if r.status_code != 200:
                    return [], f"crt.sh returned HTTP {r.status_code}"

                try:
                    certs = r.json()
                except Exception:
                    return [], "crt.sh returned invalid JSON"

                for cert in certs:
                    name_value = cert.get("name_value", "")
                    domains = [d.strip().lstrip("*.") for d in name_value.split("\n") if d.strip()]

                    issued_at = _parse_ct_date(cert.get("not_before", ""))
                    if not issued_at or issued_at < cutoff:
                        continue

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
                return results, None  # success

        except Exception as e:
            if attempt < 2:
                await asyncio.sleep(3 * (attempt + 1))
                continue
            logger.error(f"crt.sh fetch error for '{keyword}': {e}")
            return [], f"crt.sh connection failed: {type(e).__name__}"

    return [], "crt.sh: max retries exceeded"


async def _fetch_certspotter(keyword: str, days: int = 30) -> tuple[list[dict], str | None]:
    """
    CertSpotter (SSLMate) fallback — free, no API key, different infrastructure from crt.sh.
    Searches for certs issued for domains matching the keyword.
    """
    import httpx
    # CertSpotter searches by registered domain — we use keyword as a domain stem
    # Returns certs for that domain and all subdomains
    url = f"https://api.certspotter.com/v1/issuances?domain={keyword}&include_subdomains=true&expand=dns_names&expand=issuer"
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(days=days)
    seen: set[str] = set()
    results: list[dict] = []

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "QUAERYX-BrandSentinel/1.0"})
            if r.status_code != 200:
                return [], f"CertSpotter returned HTTP {r.status_code}"

            certs = r.json()
            for cert in certs:
                dns_names = cert.get("dns_names", [])
                not_before_str = cert.get("not_before", "")
                issued_at = _parse_ct_date(not_before_str)
                if not issued_at or issued_at < cutoff:
                    continue

                issuer = cert.get("issuer", {})
                issuer_name = issuer.get("friendly_name", "") if isinstance(issuer, dict) else str(issuer)

                for domain in dns_names:
                    domain = domain.lstrip("*.")
                    if domain in seen:
                        continue
                    seen.add(domain)
                    results.append({
                        "domain": domain,
                        "issued_at": issued_at.strftime("%Y-%m-%d"),
                        "issuer": issuer_name,
                        "cert_id": cert.get("id", ""),
                    })
        return results, None
    except Exception as e:
        return [], f"CertSpotter connection failed: {type(e).__name__}"


async def ct_scan_brand(brand_name: str, days: int = 30) -> dict:
    """
    Scan Certificate Transparency logs for fake sites impersonating `brand_name`.
    Primary source: crt.sh. Fallback: CertSpotter (SSLMate).

    Returns:
        {brand, official_domain, days_scanned, certs_checked, threats_found,
         threats, source, source_error}
    """
    brand_info = get_brand_info(brand_name)
    if not brand_info:
        return {"ok": False, "error": f"Brand '{brand_name}' not in protected list"}

    all_domains: list[dict] = []
    seen_domains: set[str] = set()
    source_used = "crt.sh"
    source_errors: list[str] = []

    # Try crt.sh first for each keyword in parallel
    crt_tasks = [_fetch_crt(kw, days) for kw in brand_info["keywords"]]
    crt_results = await asyncio.gather(*crt_tasks, return_exceptions=True)

    crt_ok = False
    for item in crt_results:
        if isinstance(item, Exception):
            source_errors.append(str(item))
            continue
        batch, err = item
        if err:
            source_errors.append(f"crt.sh: {err}")
        else:
            crt_ok = True
        for entry in batch:
            d = entry["domain"]
            if d not in seen_domains:
                seen_domains.add(d)
                all_domains.append(entry)

    # If crt.sh failed for all keywords, try CertSpotter as fallback
    if not crt_ok and source_errors:
        logger.warning(f"crt.sh failed for {brand_name}, trying CertSpotter fallback")
        source_used = "CertSpotter (fallback)"
        cs_tasks = [_fetch_certspotter(kw, days) for kw in brand_info["keywords"]]
        cs_results = await asyncio.gather(*cs_tasks, return_exceptions=True)
        for item in cs_results:
            if isinstance(item, Exception):
                continue
            batch, err = item
            if err:
                source_errors.append(f"CertSpotter: {err}")
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
            cert_link = f"https://crt.sh/?id={entry['cert_id']}" if entry.get("cert_id") else ""
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

    threats.sort(key=lambda x: x["risk_score"], reverse=True)

    # Surface source errors clearly if no certs were found
    source_error_msg = None
    if len(all_domains) == 0 and source_errors:
        # Deduplicate and pick the first unique error
        unique_errors = list(dict.fromkeys(source_errors))
        source_error_msg = unique_errors[0]

    return {
        "ok": True,
        "brand": brand_info["name"],
        "official_domain": brand_info["domain"],
        "days_scanned": days,
        "certs_checked": len(all_domains),
        "threats_found": len(threats),
        "threats": threats,
        "source": source_used,
        "source_error": source_error_msg,
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
