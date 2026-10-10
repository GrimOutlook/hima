#!/usr/bin/env python3
"""Exercise the shipped nginx config with TLS and the signed-provider DB suite.

Requires nginx, openssl, cargo, built dist/, and a disposable DATABASE_URL with
CREATEDB privileges. Leaves the actual API port 3000 free before running.
"""
import os
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
import time
import urllib.error
import urllib.request


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def assert_security_headers(response):
    expected = {
        "Strict-Transport-Security": "max-age=63072000; includeSubDomains",
        "Content-Security-Policy": (
            "default-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; frame-ancestors 'none'; "
            "base-uri 'none'; form-action 'self'"
        ),
        "X-Content-Type-Options": "nosniff",
    }
    for name, value in expected.items():
        assert response.headers.get_all(name) == [value], (name, response.headers)


root = Path(__file__).resolve().parent.parent
if not (root / "dist/index.html").exists():
    raise SystemExit("Run pnpm run build first")
if not os.environ.get("DATABASE_URL"):
    raise SystemExit("Set DATABASE_URL to a disposable PostgreSQL instance")

with tempfile.TemporaryDirectory(prefix="hima-https-") as directory:
    tmp = Path(directory)
    cert = tmp / "cert.pem"
    key = tmp / "key.pem"
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
        "-addext", "basicConstraints=critical,CA:FALSE",
        "-keyout", str(key), "-out", str(cert),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    port = free_port()
    config = (root / "deploy/nginx.conf").read_text()
    config = config.replace("listen 80;", f"listen 127.0.0.1:{free_port()};")
    config = config.replace("listen 443 ssl;", f"listen 127.0.0.1:{port} ssl;")
    config = config.replace("hima.example", "127.0.0.1")
    config = config.replace("/etc/letsencrypt/live/127.0.0.1/fullchain.pem", str(cert))
    config = config.replace("/etc/letsencrypt/live/127.0.0.1/privkey.pem", str(key))
    config = config.replace("/opt/hima/current/frontend/dist", str(root / "dist"))
    config = config.replace("/var/log/nginx/hima-api-error.log", str(tmp / "api-error.log"))
    config_path = tmp / "nginx.conf"
    config_path.write_text(
        f"pid {tmp}/nginx.pid;\nerror_log {tmp}/error.log;\n"
        f"events {{}}\nhttp {{ access_log {tmp}/access.log;\n"
        f"client_body_temp_path {tmp}/body;\nproxy_temp_path {tmp}/proxy;\n"
        f"{config}\n}}\n"
    )
    args = ["nginx", "-e", str(tmp / "error.log"), "-p", str(tmp), "-c", str(config_path)]
    subprocess.run([*args, "-t"], check=True)
    proxy = subprocess.Popen([*args, "-g", "daemon off;"])
    try:
        origin = f"https://127.0.0.1:{port}"
        context = ssl.create_default_context(cafile=str(cert))
        for attempt in range(50):
            try:
                with urllib.request.urlopen(origin, context=context, timeout=1) as response:
                    assert_security_headers(response)
                    assert response.headers["Cache-Control"] == "no-cache"
                    assert b'<div id="root">' in response.read()
                break
            except (OSError, urllib.error.URLError):
                if proxy.poll() is not None:
                    raise RuntimeError("nginx exited before readiness")
                time.sleep(0.1)
        else:
            raise RuntimeError("HTTPS proxy did not become ready")
        for extension, mime in [("js", "application/javascript"), ("css", "text/css")]:
            asset = next((root / "dist/assets").glob(f"*.{extension}"))
            with urllib.request.urlopen(
                f"{origin}/assets/{asset.name}", context=context, timeout=5
            ) as response:
                assert response.headers.get_content_type() == mime
                assert_security_headers(response)
        for version in (ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_3):
            tls_context = ssl.create_default_context(cafile=str(cert))
            tls_context.minimum_version = tls_context.maximum_version = version
            with urllib.request.urlopen(origin, context=tls_context, timeout=5) as response:
                assert_security_headers(response)
        # No API is running yet: verify `always` on nginx-generated errors and
        # server-level inheritance on both bare and nested proxy routes.
        for path in ("/api", "/api/me", "/auth", "/auth/login"):
            try:
                urllib.request.urlopen(f"{origin}{path}", context=context, timeout=5)
            except urllib.error.HTTPError as response:
                with response:
                    assert response.code == 502
                    assert_security_headers(response)
            else:
                raise AssertionError(f"Expected unavailable upstream for {path}")
        env = {**os.environ, "HIMA_TEST_HTTPS_PROXY": origin, "HIMA_TEST_PROXY_CA": str(cert)}
        env.pop("HIMA_TEST_VITE_PROXY", None)
        subprocess.run([
            "cargo", "test", "--locked", "--manifest-path", str(root / "backend/Cargo.toml"),
            "--test", "auth", "--", "--ignored",
        ], env=env, cwd=root, check=True)
        # Auth/API callbacks must never leak code/state into proxy logs.
        assert "/auth" not in (tmp / "access.log").read_text()
        assert "/api" not in (tmp / "access.log").read_text()
        assert (tmp / "api-error.log").read_text() == ""
        print("HTTPS security headers, TLS 1.2/1.3, static serving, OIDC, CSRF save, restart persistence, logout and log privacy passed")
    finally:
        proxy.terminate()
        proxy.wait(timeout=10)
