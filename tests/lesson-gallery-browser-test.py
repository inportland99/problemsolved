"""Headless Chrome interaction test; uses local fake storage, never Supabase."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import subprocess
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ALLOWED = {
    "/tests/fixtures/lesson-gallery-browser.html",
    "/tests/fixtures/gallery-storage-stub.mjs",
    "/src/assets/js/lesson-gallery-ui.mjs",
    "/src/assets/js/lesson-gallery-model.mjs",
    "/_site/styles/output.css",
}

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path not in ALLOWED:
            self.send_error(404)
            return
        super().do_GET()

    def log_message(self, *_args):
        pass

def main():
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with tempfile.TemporaryDirectory(prefix="gallery-chrome-") as profile:
            url = f"http://127.0.0.1:{server.server_port}/tests/fixtures/lesson-gallery-browser.html"
            result = subprocess.run([
                CHROME, "--headless", "--disable-gpu", "--disable-background-networking",
                "--no-first-run", "--no-default-browser-check", f"--user-data-dir={profile}",
                "--dump-dom", "--virtual-time-budget=5000", url,
            ], capture_output=True, text=True, timeout=45)
            if result.returncode or 'data-status="passed"' not in result.stdout:
                raise RuntimeError(result.stdout + result.stderr)
            print("Browser gallery interactions passed in headless Chrome with stubbed storage.")
    finally:
        server.shutdown()
        server.server_close()

if __name__ == "__main__":
    main()
