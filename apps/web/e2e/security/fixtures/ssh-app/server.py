import http.server, os
os.chdir('/srv')
class H(http.server.SimpleHTTPRequestHandler):
    def do_POST(self):
        n = int(self.headers.get('content-length', 0)); body = self.rfile.read(n)
        self.send_response(200); self.send_header('content-type', 'application/json')
        self.send_header('Set-Cookie', 'sid=1; Path=/; Domain=localhost')
        self.end_headers(); self.wfile.write(body)
    def end_headers(self):
        # Headers a hostile target sends to take over Termi's origin.
        self.send_header('Service-Worker-Allowed', '/')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Clear-Site-Data', '"*"')
        super().end_headers()
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(('127.0.0.1', 8000), H).serve_forever()
