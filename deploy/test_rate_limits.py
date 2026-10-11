#!/usr/bin/env python3
"""Exercise production nginx rate limits against a counting HTTP upstream."""
from concurrent.futures import ThreadPoolExecutor
import gzip
import http.client
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import ssl
import subprocess
import tempfile
from threading import Thread, Lock
import time


root = Path(__file__).resolve().parent.parent
count = 0
lock = Lock()
json_body = b'{"document":"' + b'planner data ' * 1000 + b'"}'


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        global count
        with lock:
            count += 1
        self.send_response(200)
        body = json_body if self.path.startswith("/api/") else b"upstream"
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Upstream-Accept-Encoding", self.headers.get("Accept-Encoding", "absent"))
        self.send_header("X-Upstream-CSRF", self.headers.get("X-CSRF-Token", "absent"))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


with tempfile.TemporaryDirectory(prefix="hima-rate-limits-") as directory:
    tmp = Path(directory)
    (tmp / "index.html").write_text("static")
    (tmp / "assets").mkdir()
    for asset in ("index-abc123.js", "index-abc123.css", "font-abc123.woff2", "favicon.svg"):
        (tmp / "assets" / asset).write_text(asset)
    compressed_assets = {
        "large-abc123.js": b"console.log('hima');\n" * 1000,
        "large-abc123.css": b"body { color: blue; }\n" * 1000,
        "large-abc123.svg": b'<svg xmlns="http://www.w3.org/2000/svg">' + b"<path/>" * 1000 + b"</svg>",
    }
    for name, body in compressed_assets.items():
        (tmp / "assets" / name).write_bytes(body)
    cert, key = tmp / "cert.pem", tmp / "key.pem"
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost",
        "-keyout", str(key), "-out", str(cert),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
    Thread(target=upstream.serve_forever, daemon=True).start()
    # Reserve ports until configuration is prepared.
    with socket.socket() as listener, socket.socket() as redirect:
        listener.bind(("127.0.0.1", 0))
        redirect.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        http_port = redirect.getsockname()[1]
        config = (root / "deploy/nginx.conf").read_text()
        for old, new in [
            ("listen 80 default_server;", f"listen 127.0.0.1:{http_port} default_server;"),
            ("listen 443 ssl default_server;", f"listen 127.0.0.1:{port} ssl default_server;"),
            ("server_name hima.example;", "server_name localhost;"),
            ("listen 80;", f"listen 127.0.0.1:{redirect.getsockname()[1]};"),
            ("listen 443 ssl;", f"listen 127.0.0.1:{port} ssl;"),
            ("/etc/letsencrypt/live/hima.example/fullchain.pem", str(cert)),
            ("/etc/letsencrypt/live/hima.example/privkey.pem", str(key)),
            ("/opt/hima/current/frontend/dist", str(tmp)),
            ("/var/log/nginx/hima-api-error.log", str(tmp / "api-error.log")),
            ("http://127.0.0.1:3000", f"http://127.0.0.1:{upstream.server_port}"),
        ]:
            config = config.replace(old, new)
        path = tmp / "nginx.conf"
        path.write_text(
            f"pid {tmp}/nginx.pid;\nerror_log {tmp}/error.log;\nevents {{}}\n"
            f"http {{ access_log off; client_body_temp_path {tmp}/body;\n"
            f"proxy_temp_path {tmp}/proxy;\n{config}\n}}\n"
        )
    args = ["nginx", "-e", str(tmp / "error.log"), "-p", str(tmp), "-c", str(path)]
    subprocess.run([*args, "-t"], check=True)
    proxy = subprocess.Popen([*args, "-g", "daemon off;"])
    context = ssl.create_default_context(cafile=str(cert))

    def request(path, client="127.0.0.1", forwarded="203.0.113.1", headers=None, metadata=False):
        connection = http.client.HTTPSConnection(
            "localhost", port, context=context, timeout=5,
            source_address=(client, 0),
        )
        try:
            connection.request("GET", path, headers={"X-Forwarded-For": forwarded, **(headers or {})})
            response = connection.getresponse()
            body = response.read()
            assert response.getheader("Server") == "nginx"
            assert b"nginx/" not in body
            assert response.getheader("X-Content-Type-Options") == "nosniff"
            assert response.getheader("Strict-Transport-Security")
            assert response.getheader("Content-Security-Policy")
            if metadata:
                return response.status, body, dict(response.getheaders())
            return response.status, body
        finally:
            connection.close()

    try:
        for attempt in range(50):
            try:
                assert request("/") == (200, b"static")
                break
            except OSError:
                if proxy.poll() is not None:
                    raise RuntimeError("nginx exited before readiness")
                time.sleep(0.1)
        else:
            raise RuntimeError("nginx did not become ready")

        before = count
        for host in ("unknown.example", "127.0.0.1"):
            connection = http.client.HTTPConnection("127.0.0.1", http_port, timeout=5)
            try:
                connection.request("GET", "/api/me", headers={"Host": host})
                try:
                    connection.getresponse()
                except http.client.RemoteDisconnected:
                    pass
                else:
                    raise AssertionError(f"Unknown HTTP host {host} was accepted")
            finally:
                connection.close()
        connection = http.client.HTTPConnection("127.0.0.1", http_port, timeout=5)
        try:
            connection.request("GET", "/planner?check=1", headers={"Host": "localhost"})
            response = connection.getresponse()
            assert response.status == 308
            assert response.getheader("Location") == "https://hima.example/planner?check=1"
            assert response.getheader("Server") == "nginx"
        finally:
            connection.close()
        for version in (ssl.TLSVersion.TLSv1_2, ssl.TLSVersion.TLSv1_3):
            rejection_context = ssl.create_default_context(cafile=str(cert))
            rejection_context.check_hostname = False
            rejection_context.minimum_version = rejection_context.maximum_version = version
            for name in ("unknown.example", None):
                with socket.create_connection(("127.0.0.1", port), timeout=5) as raw:
                    try:
                        with rejection_context.wrap_socket(raw, server_hostname=name):
                            raise AssertionError(f"TLS {version.name} accepted SNI {name}")
                    except ssl.SSLError as error:
                        assert "UNRECOGNIZED_NAME" in str(error), error
        # Valid SNI cannot bypass HTTP Host routing to the rejecting default.
        connection = http.client.HTTPSConnection("localhost", port, context=context, timeout=5)
        try:
            connection.request("GET", "/api/me", headers={"Host": "unknown.example"})
            try:
                connection.getresponse()
            except http.client.RemoteDisconnected:
                pass
            else:
                raise AssertionError("Unknown HTTPS Host was accepted")
        finally:
            connection.close()
        assert count == before, "Unknown hosts reached upstream"

        # Verify real HTTP/2 requests, not just a configured directive.
        version = subprocess.check_output([
            "curl", "--silent", "--show-error", "--fail", "--http2",
            "--cacert", str(cert), "--output", "/dev/null", "--write-out", "%{http_version}",
            "--resolve", f"localhost:{port}:127.0.0.1", f"https://localhost:{port}/",
        ], text=True)
        assert version == "2", version
        for name, original in compressed_assets.items():
            path = f"/assets/{name}"
            status, body, headers = request(path, headers={"Accept-Encoding": "gzip"}, metadata=True)
            assert status == 200
            assert headers["Content-Encoding"] == "gzip"
            assert "Accept-Encoding" in headers["Vary"]
            assert gzip.decompress(body) == original
            assert len(body) < len(original)
            status, body, headers = request(path, metadata=True)
            assert (status, body) == (200, original)
            assert "Content-Encoding" not in headers
            status, body, headers = request(path, headers={"Accept-Encoding": "gzip;q=0"}, metadata=True)
            assert (status, body) == (200, original)
            assert "Content-Encoding" not in headers
        status, body, headers = request("/assets/index-abc123.js", headers={"Accept-Encoding": "gzip"}, metadata=True)
        assert (status, body) == (200, b"index-abc123.js")
        assert "Content-Encoding" not in headers, "Small assets should not be compressed"
        for path in ("/api/planner", "/api/planner?compression=1", "/api/me", "/api/me?compression=1"):
            status, body, headers = request(path, client="127.0.0.5", headers={
                "Accept-Encoding": "gzip", "Via": "1.1 test-proxy", "X-CSRF-Token": "test-token",
            }, metadata=True)
            assert status == 200, (path, status, body)
            assert headers["X-Upstream-Accept-Encoding"] == "absent"
            assert headers["X-Upstream-CSRF"] == "test-token"
            assert "Content-Encoding" not in headers
            assert body == json_body
        status, body, headers = request("/api/planner", client="127.0.0.5", metadata=True)
        assert (status, body) == (200, json_body)
        assert "Content-Encoding" not in headers

        for asset in ("index-abc123.js", "index-abc123.css", "font-abc123.woff2"):
            path = f"/assets/{asset}"
            status, body, headers = request(path, metadata=True)
            assert (status, body) == (200, asset.encode())
            assert headers["Cache-Control"] == "public, max-age=31536000, immutable"
            status, body, headers = request(
                path, headers={"If-None-Match": headers["ETag"]}, metadata=True,
            )
            assert (status, body) == (304, b"")
            assert headers["Cache-Control"] == "public, max-age=31536000, immutable"
        for path in ("/", "/index.html", "/planner", "/assets/favicon.svg?release=2"):
            status, _, headers = request(path, metadata=True)
            assert status == 200
            assert headers["Cache-Control"] == "no-cache", path
        for path in ("/assets/missing-abc123.js", "/assets/missing.svg", "/assets/"):
            status, body, headers = request(path, metadata=True)
            assert status == 404, path
            assert body != b"static", "Missing asset became SPA HTML"
            assert "Cache-Control" not in headers, "Missing asset cached as immutable"

        # Bare and nested auth paths consume the same budget, even if XFF changes.
        for path in ("/auth", "/auth/login", "/auth/callback", "/auth/logout", "/auth/login", "/auth"):
            assert request(path)[0] == 200
        before = count
        for path in ("/auth", "/auth/login?next=1", "/auth/callback"):
            assert request(path, forwarded="198.51.100.99")[0] == 429
        assert count == before, "Rejected auth requests reached upstream"
        assert request("/auth/login", client="127.0.0.2")[0] == 200
        assert request("/api/me")[0] == 200, "Auth exhausted API budget"

        before = count
        with ThreadPoolExecutor(max_workers=16) as pool:
            results = list(pool.map(
                lambda i: request("/api" if i % 2 else "/api/me", client="127.0.0.3"),
                range(60),
            ))
        statuses = [status for status, _ in results]
        assert set(statuses) == {200, 429}, statuses
        assert count - before == statuses.count(200), "Rejected API requests reached upstream"
        assert request("/auth/login", client="127.0.0.3")[0] == 200
        assert request("/api/me", client="127.0.0.4")[0] == 200
        for _ in range(10):
            assert request("/") == (200, b"static")
            assert request("/authentication") == (200, b"static")
        time.sleep(10.1)
        assert request("/auth/login")[0] == 200, "Auth budget did not recover"
        assert request("/api/me", client="127.0.0.3")[0] == 200
        assert (tmp / "api-error.log").read_text() == ""
        print("Host rejection, TLS handshake rejection, hidden nginx version, HTTP/2, gzip negotiation, CSRF compression exclusion, HTTPS asset caching, rate limits, independent budgets, recovery and headers passed")
    finally:
        proxy.terminate()
        proxy.wait(timeout=10)
        upstream.shutdown()
        upstream.server_close()
