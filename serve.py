# simple serve script so I can code on school chromebook

from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import argparse
import json


class NoCacheHandler(SimpleHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/__log":
            self.send_error(404, "Not Found")
            return

        length = int(self.headers.get("Content-Length", 0) or 0)
        raw_body = self.rfile.read(length).decode("utf-8", errors="replace")

        try:
            payload = json.loads(raw_body)
        except json.JSONDecodeError:
            payload = {"message": raw_body}

        level = str(payload.get("level", "log")).upper()
        message = payload.get("message", "")
        source = payload.get("source", "browser")
        print(f"[{source}] {level}: {message}", flush=True)

        stack = payload.get("stack")
        if stack:
            print(stack, flush=True)

        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Serve the project with cache disabled.")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind to")
    parser.add_argument("--port", type=int, default=3001, help="Port to bind to")
    parser.add_argument(
        "--directory",
        default=str(Path(__file__).resolve().parent),
        help="Directory to serve",
    )
    args = parser.parse_args()

    handler = lambda *handler_args, **handler_kwargs: NoCacheHandler(
        *handler_args,
        directory=args.directory,
        **handler_kwargs,
    )

    with ThreadingHTTPServer((args.host, args.port), handler) as server:
        print(f"Serving {args.directory} on http://{args.host}:{args.port}")
        server.serve_forever()