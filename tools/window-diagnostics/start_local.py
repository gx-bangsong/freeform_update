"""Serve the prebuilt USB diagnostic page on loopback only (Python 3)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import webbrowser


def main():
    root = Path(__file__).resolve().parent
    # Source checkout uses dist/; downloadable bundle has index.html at root.
    site = root if (root / "index.html").exists() and not (root / "package.json").exists() else root / "dist"
    if not (site / "index.html").exists():
        raise SystemExit("Built page missing. Run npm run build first, or extract the complete ZIP.")
    handler = partial(SimpleHTTPRequestHandler, directory=str(site))
    # Let the OS assign an unused port rather than conflict with another server.
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        url = "http://localhost:%s" % server.server_port
        print("FreeForm USB Lab", flush=True)
        print("Open this address in desktop Chrome or Edge: " + url, flush=True)
        print("Keep this window open. Press Ctrl+C to stop.", flush=True)
        try:
            webbrowser.open(url)
        except Exception:
            pass  # The printed URL can always be opened manually.
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")


if __name__ == "__main__":
    main()
