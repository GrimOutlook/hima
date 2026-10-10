#!/usr/bin/env python3
"""Exercise production nginx rate limits against a counting HTTP upstream."""
from concurrent.futures import ThreadPoolExecutor
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


class Upstream(BaseHTTPRequestHandler):
    def do_GET(self):
        global count
        with lock:
            count += 1
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"upstream")

    def log_message(self, *args):
        pass


with tempfile.TemporaryDirectory(prefix="hima-rate-limits-") as directory:
    tmp = Path(directory)
    (tmp / "index.html").write_text("static")
    cert, key = tmp / "cert.pem", tmp / "key.pem"
    subprocess.run([
        "openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
        "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
        "-keyout", str(key), "-out", str(cert),
    ], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    upstream = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
    Thread(target=upstream.serve_forever, daemon=True).start()
    # Reserve ports until configuration is prepared.
    with socket.socket() as listener, socket.socket() as redirect:
        listener.bind(("127.0.0.1", 0))
        redirect.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
        config = (root / "deploy/nginx.conf").read_text()
        for old, new in [
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

    def request(path, client="127.0.0.1", forwarded="203.0.113.1"):
        connection = http.client.HTTPSConnection(
            "127.0.0.1", port, context=context, timeout=5,
            source_address=(client, 0),
        )
        try:
            connection.request("GET", path, headers={"X-Forwarded-For": forwarded})
            response = connection.getresponse()
            body = response.read()
            assert response.getheader("X-Content-Type-Options") == "nosniff"
            assert response.getheader("Strict-Transport-Security")
            assert response.getheader("Content-Security-Policy")
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
        print("HTTPS rate limits, upstream exclusion, independent budgets, recovery and headers passed")
    finally:
        proxy.terminate()
        proxy.wait(timeout=10)
        upstream.shutdown()
        upstream.server_close()
