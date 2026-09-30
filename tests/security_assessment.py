#!/usr/bin/env python3
import argparse
import json
import re
import sys
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen


REQUIRED_HEADERS = {
    "content-security-policy": "Content-Security-Policy",
    "x-content-type-options": "X-Content-Type-Options",
    "x-frame-options": "X-Frame-Options",
    "referrer-policy": "Referrer-Policy",
    "permissions-policy": "Permissions-Policy",
    "cache-control": "Cache-Control",
    "strict-transport-security": "Strict-Transport-Security",
}

SENSITIVE_PATTERNS = [
    re.compile(r"SUPABASE_SERVICE_ROLE_KEY", re.I),
    re.compile(r"service_role", re.I),
    re.compile(r"-----BEGIN (?:RSA |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"postgres(?:ql)?://", re.I),
]


@dataclass
class Finding:
    id: str
    status: str
    severity: str
    category: str
    target: str
    evidence: str
    remediation: str


def request(target: str, method: str = "GET", headers: Optional[Dict[str, str]] = None):
    req = Request(target, method=method, headers=headers or {})
    try:
        with urlopen(req, timeout=20) as response:
            body = response.read(1_000_000)
            return response.status, {k.lower(): v for k, v in response.headers.items()}, body
    except HTTPError as error:
        return error.code, {k.lower(): v for k, v in error.headers.items()}, error.read(1_000_000)
    except URLError as error:
        raise RuntimeError(f"Request failed for {target}: {error}") from error


def add(findings: List[Finding], *args: str):
    findings.append(Finding(*args))


def check_root(base_url: str, mode: str, findings: List[Finding]):
    status, headers, body = request(base_url, "GET")
    add(
        findings,
        "WEB-ROOT-001",
        "PASS" if 200 <= status < 400 and b"CareOrbit" in body else "FAIL",
        "HIGH",
        "Availability",
        base_url,
        f"GET / returned {status}; CareOrbit marker present={b'CareOrbit' in body}",
        "Ensure the deployed web app returns the CareOrbit shell.",
    )

    head_status, head_headers, _ = request(base_url, "HEAD")
    add(
        findings,
        "WEB-HEAD-001",
        "PASS" if 200 <= head_status < 400 else "FAIL",
        "MEDIUM",
        "HEAD testing",
        base_url,
        f"HEAD / returned {head_status} with {len(head_headers)} headers",
        "Ensure HEAD requests are supported for monitoring and security header checks.",
    )

    for key, label in REQUIRED_HEADERS.items():
        value = headers.get(key, "")
        should_pass = bool(value) if mode == "deployed" else True
        if mode == "deployed" and key == "cache-control":
            should_pass = "private" in value.lower() and "no-store" in value.lower()
        status_label = "PASS" if should_pass else "FAIL"
        if mode == "local" and not value:
            status_label = "INFO"
        missing_text = "missing in local server" if mode == "local" else "missing"
        add(
            findings,
            f"HEADER-{label.upper().replace('-', '-')}",
            status_label,
            "HIGH" if mode == "deployed" else "LOW",
            "Security headers",
            base_url,
            f"{label}: {value or missing_text}",
            f"Set {label} at the deployment edge.",
        )

    csp = headers.get("content-security-policy", "")
    if mode == "deployed":
        add(
            findings,
            "HEADER-CSP-STRICT-001",
            "PASS" if "default-src 'self'" in csp and "frame-ancestors 'none'" in csp else "FAIL",
            "HIGH",
            "CSP",
            base_url,
            csp or "missing",
            "Enforce a restrictive Content-Security-Policy.",
        )


def check_cors(base_url: str, mode: str, findings: List[Finding]):
    status, headers, _ = request(
        base_url,
        "OPTIONS",
        {
            "Origin": "https://evil.example",
            "Access-Control-Request-Method": "POST",
        },
    )
    allow_origin = headers.get("access-control-allow-origin", "")
    allow_credentials = headers.get("access-control-allow-credentials", "")
    unsafe = allow_origin in ("*", "https://evil.example") and allow_credentials.lower() == "true"
    expected = mode != "deployed" or not unsafe
    add(
        findings,
        "CORS-001",
        "PASS" if expected else "FAIL",
        "HIGH",
        "CORS",
        base_url,
        f"OPTIONS returned {status}; ACAO={allow_origin or 'missing'}; ACAC={allow_credentials or 'missing'}",
        "Never reflect arbitrary origins and never pair wildcard CORS with credentials.",
    )


def check_sensitive_paths(base_url: str, findings: List[Finding]):
    for index, path in enumerate(["/.env", "/.git/config", "/server.js.map", "/api/../../.env"], 1):
        target = urljoin(base_url, path)
        status, _headers, body = request(target, "GET")
        text = body.decode("utf-8", errors="ignore")
        leaked = any(pattern.search(text) for pattern in SENSITIVE_PATTERNS)
        add(
            findings,
            f"EXPOSURE-{index:03d}",
            "FAIL" if leaked else "PASS",
            "CRITICAL",
            "Sensitive data exposure",
            target,
            f"GET {path} returned {status}; secret marker leaked={leaked}",
            "Block direct access to environment files, source maps with secrets, and VCS metadata.",
        )


def check_reflected_payloads(base_url: str, findings: List[Finding]):
    payload = "<script>alert('careorbit-xss')</script>"
    target = f"{base_url.rstrip('/')}/?q={payload}"
    status, headers, body = request(target, "GET")
    text = body.decode("utf-8", errors="ignore")
    reflected = payload in text
    add(
        findings,
        "XSS-REFLECT-001",
        "FAIL" if reflected else "PASS",
        "HIGH",
        "XSS",
        target,
        f"GET reflected raw payload={reflected}; status={status}; content-type={headers.get('content-type', '')}",
        "Keep query parameters out of raw HTML responses or escape them before rendering.",
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", required=True)
    parser.add_argument("--mode", choices=["local", "deployed"], default="deployed")
    parser.add_argument("--output", default="security/results/security-assessment.json")
    args = parser.parse_args()

    base_url = args.target.rstrip("/") + "/"
    findings: List[Finding] = []
    started = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    check_root(base_url, args.mode, findings)
    check_cors(base_url, args.mode, findings)
    check_sensitive_paths(base_url, findings)
    check_reflected_payloads(base_url, findings)

    failed = [finding for finding in findings if finding.status == "FAIL"]
    output = {
        "target": base_url,
        "mode": args.mode,
        "started_at": started,
        "summary": {
            "total": len(findings),
            "pass": len([f for f in findings if f.status == "PASS"]),
            "fail": len(failed),
            "info": len([f for f in findings if f.status == "INFO"]),
        },
        "findings": [asdict(finding) for finding in findings],
    }

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(json.dumps(output["summary"], indent=2))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
