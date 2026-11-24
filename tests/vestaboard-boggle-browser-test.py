"""Serve only built local assets; replace bootstrap with fake API. No live requests."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import re
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ALLOWED = {
    "/assets/js/vestaboard-boggle/controller.mjs",
    "/assets/js/vestaboard-boggle/game.mjs",
    "/assets/css/vestaboard-boggle.css",
    "/assets/data/boggle/scowl-35.json",
    "/styles/output.css",
}


class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/personal/vestaboard/boggle/":
            page = (ROOT / "_site/personal/vestaboard/boggle/index.html").read_text()
            page = re.sub(r'<script type="module">.*?</script>',
                          '<script type="module" src="/browser-test.mjs"></script>', page, flags=re.S)
            self.send_response(200)
            self.send_header("Content-Type", "text/html")
            self.end_headers()
            self.wfile.write(page.encode())
        elif self.path == "/browser-test.mjs":
            self.send_response(200)
            self.send_header("Content-Type", "text/javascript")
            self.end_headers()
            self.wfile.write((ROOT / "tests/fixtures/vestaboard-boggle-browser.mjs").read_bytes())
        elif self.path in ALLOWED:
            super().do_GET()
        else:
            self.send_error(404)

    def log_message(self, *_args):
        pass


def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT / "_site")))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        with tempfile.TemporaryDirectory(prefix="boggle-chrome-") as profile:
            result = subprocess.run([
                CHROME, "--headless", "--disable-gpu", "--disable-background-networking",
                "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}",
                "--window-size=390,844", "--force-device-scale-factor=1",
                "--dump-dom", "--virtual-time-budget=10000",
                f"http://127.0.0.1:{server.server_port}/personal/vestaboard/boggle/",
            ], capture_output=True, text=True, timeout=60)
            if result.returncode or 'data-status="passed"' not in result.stdout:
                raise RuntimeError(result.stdout + result.stderr)
            viewport = re.search(r'data-viewport="(\d+)"', result.stdout)
            print(f"Boggle browser passed: launch, duplicate clicks, recovery, cancel, black finish, dictionary paths, auth, offline; viewport {viewport[1]}px.")
    finally:
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
