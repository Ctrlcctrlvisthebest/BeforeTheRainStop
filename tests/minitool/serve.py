"""Local QA only: apply the offline container's documented CSP to the package."""
import http.server
import functools
import sys

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'")
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

http.server.ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), functools.partial(Handler,directory=sys.argv[2])).serve_forever()
