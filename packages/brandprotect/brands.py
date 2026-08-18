"""
QUAERYX Brand Sentinel — Protected brand database.
100+ global and Indian brands with their official domains and security contacts.
"""

PROTECTED_BRANDS = [
    # ── INDIAN IT GIANTS ────────────────────────────────────────
    {"name": "TCS",            "domain": "tcs.com",            "alt_domains": ["tata.com"],                  "security_email": "phishing@tcs.com",           "keywords": ["tcs", "tata consultancy"]},
    {"name": "Infosys",        "domain": "infosys.com",        "alt_domains": [],                            "security_email": "phishing@infosys.com",       "keywords": ["infosys", "infy"]},
    {"name": "Wipro",          "domain": "wipro.com",          "alt_domains": [],                            "security_email": "phishing@wipro.com",         "keywords": ["wipro"]},
    {"name": "HCL",            "domain": "hcltech.com",        "alt_domains": ["hcl.com"],                   "security_email": "security@hcltech.com",       "keywords": ["hcl", "hcltech"]},
    {"name": "Tech Mahindra",  "domain": "techmahindra.com",   "alt_domains": [],                            "security_email": "cert@techmahindra.com",      "keywords": ["techmahindra", "tech mahindra"]},
    {"name": "Reliance / Jio", "domain": "jio.com",            "alt_domains": ["ril.com", "reliancejio.com"],"security_email": "abuse@jio.com",              "keywords": ["jio", "reliance", "reliancejio"]},
    {"name": "HDFC Bank",      "domain": "hdfcbank.com",       "alt_domains": ["hdfc.com"],                  "security_email": "phishing@hdfcbank.com",      "keywords": ["hdfc", "hdfcbank"]},
    {"name": "ICICI Bank",     "domain": "icicibank.com",      "alt_domains": ["icicidirect.com"],           "security_email": "fraud@icicibank.com",        "keywords": ["icici", "icicibank"]},
    {"name": "SBI",            "domain": "sbi.co.in",          "alt_domains": ["onlinesbi.com"],             "security_email": "report.phishing@sbi.co.in",  "keywords": ["sbi", "state bank"]},
    {"name": "Axis Bank",      "domain": "axisbank.com",       "alt_domains": [],                            "security_email": "phishing@axisbank.com",      "keywords": ["axisbank", "axis bank"]},
    {"name": "Kotak Bank",     "domain": "kotak.com",          "alt_domains": ["kotakbank.com"],             "security_email": "phishing@kotak.com",         "keywords": ["kotak"]},
    {"name": "Paytm",          "domain": "paytm.com",          "alt_domains": [],                            "security_email": "fraud@paytm.com",            "keywords": ["paytm"]},
    {"name": "PhonePe",        "domain": "phonepe.com",        "alt_domains": [],                            "security_email": "security@phonepe.com",       "keywords": ["phonepe"]},
    {"name": "Flipkart",       "domain": "flipkart.com",       "alt_domains": [],                            "security_email": "abuse@flipkart.com",         "keywords": ["flipkart"]},
    {"name": "Razorpay",       "domain": "razorpay.com",       "alt_domains": [],                            "security_email": "security@razorpay.com",      "keywords": ["razorpay"]},
    {"name": "Zomato",         "domain": "zomato.com",         "alt_domains": [],                            "security_email": "trust@zomato.com",           "keywords": ["zomato"]},
    {"name": "Swiggy",         "domain": "swiggy.com",         "alt_domains": [],                            "security_email": "security@swiggy.com",        "keywords": ["swiggy"]},
    {"name": "OYO",            "domain": "oyorooms.com",       "alt_domains": ["oyo.com"],                   "security_email": "abuse@oyorooms.com",         "keywords": ["oyo", "oyorooms"]},
    {"name": "BYJU'S",         "domain": "byjus.com",          "alt_domains": [],                            "security_email": "security@byjus.com",         "keywords": ["byjus", "byju"]},
    {"name": "MakeMyTrip",     "domain": "makemytrip.com",     "alt_domains": [],                            "security_email": "phishing@makemytrip.com",    "keywords": ["makemytrip", "mmt"]},
    {"name": "Nykaa",          "domain": "nykaa.com",          "alt_domains": [],                            "security_email": "security@nykaa.com",         "keywords": ["nykaa"]},
    # ── GLOBAL TECH ─────────────────────────────────────────────
    {"name": "Microsoft",      "domain": "microsoft.com",      "alt_domains": ["outlook.com", "azure.com"],  "security_email": "phish@office365.microsoft.com","keywords": ["microsoft", "outlook", "azure", "office365"]},
    {"name": "Google",         "domain": "google.com",         "alt_domains": ["gmail.com", "youtube.com"],  "security_email": "phishing-report@google.com", "keywords": ["google", "gmail", "youtube"]},
    {"name": "Apple",          "domain": "apple.com",          "alt_domains": ["icloud.com"],                "security_email": "reportphishing@apple.com",   "keywords": ["apple", "icloud", "iphone", "itunes"]},
    {"name": "Amazon",         "domain": "amazon.com",         "alt_domains": ["amazon.in", "aws.amazon.com"],"security_email": "stop-spoofing@amazon.com",  "keywords": ["amazon", "aws", "prime"]},
    {"name": "Meta / Facebook","domain": "meta.com",           "alt_domains": ["facebook.com", "instagram.com"],"security_email": "phish@fb.com",            "keywords": ["facebook", "instagram", "meta", "whatsapp"]},
    {"name": "Oracle",         "domain": "oracle.com",         "alt_domains": [],                            "security_email": "secalert_us@oracle.com",     "keywords": ["oracle"]},
    {"name": "NVIDIA",         "domain": "nvidia.com",         "alt_domains": [],                            "security_email": "psirt@nvidia.com",           "keywords": ["nvidia", "geforce", "cuda"]},
    {"name": "Tesla",          "domain": "tesla.com",          "alt_domains": [],                            "security_email": "security@tesla.com",         "keywords": ["tesla"]},
    {"name": "IBM",            "domain": "ibm.com",            "alt_domains": [],                            "security_email": "phishing@us.ibm.com",        "keywords": ["ibm"]},
    {"name": "SAP",            "domain": "sap.com",            "alt_domains": [],                            "security_email": "secure@sap.com",             "keywords": ["sap"]},
    {"name": "Salesforce",     "domain": "salesforce.com",     "alt_domains": [],                            "security_email": "security@salesforce.com",    "keywords": ["salesforce", "crm"]},
    {"name": "Adobe",          "domain": "adobe.com",          "alt_domains": [],                            "security_email": "psirt@adobe.com",            "keywords": ["adobe", "photoshop", "acrobat"]},
    {"name": "Intel",          "domain": "intel.com",          "alt_domains": [],                            "security_email": "secure@intel.com",           "keywords": ["intel"]},
    {"name": "Cisco",          "domain": "cisco.com",          "alt_domains": ["webex.com"],                 "security_email": "psirt@cisco.com",            "keywords": ["cisco", "webex"]},
    {"name": "Accenture",      "domain": "accenture.com",      "alt_domains": [],                            "security_email": "security@accenture.com",     "keywords": ["accenture"]},
    {"name": "Capgemini",      "domain": "capgemini.com",      "alt_domains": [],                            "security_email": "security@capgemini.com",     "keywords": ["capgemini"]},
    # ── FINANCE ──────────────────────────────────────────────────
    {"name": "PayPal",         "domain": "paypal.com",         "alt_domains": [],                            "security_email": "phishing@paypal.com",        "keywords": ["paypal"]},
    {"name": "Visa",           "domain": "visa.com",           "alt_domains": [],                            "security_email": "phishing@visa.com",          "keywords": ["visa"]},
    {"name": "Mastercard",     "domain": "mastercard.com",     "alt_domains": [],                            "security_email": "phishing@mastercard.com",    "keywords": ["mastercard"]},
    {"name": "Stripe",         "domain": "stripe.com",         "alt_domains": [],                            "security_email": "security@stripe.com",        "keywords": ["stripe"]},
    # ── E-COMMERCE ───────────────────────────────────────────────
    {"name": "eBay",           "domain": "ebay.com",           "alt_domains": ["ebay.in", "ebay.co.uk"],     "security_email": "spoof@ebay.com",             "keywords": ["ebay"]},
    {"name": "Alibaba",        "domain": "alibaba.com",        "alt_domains": ["aliexpress.com"],            "security_email": "security@alibaba-inc.com",   "keywords": ["alibaba", "aliexpress"]},
    {"name": "Shopify",        "domain": "shopify.com",        "alt_domains": [],                            "security_email": "security@shopify.com",       "keywords": ["shopify"]},
    {"name": "Myntra",         "domain": "myntra.com",         "alt_domains": [],                            "security_email": "security@myntra.com",        "keywords": ["myntra"]},
]
