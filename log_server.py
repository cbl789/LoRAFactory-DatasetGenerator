#!/usr/bin/env python3
"""
LoRAFactory - Logging Server
Receives logs from browser and writes to file
"""

from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import os
from datetime import datetime
import threading

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, f"lorafactory_{datetime.now().strftime('%Y%m%d')}.log")

# Ensure log directory exists
os.makedirs(LOG_DIR, exist_ok=True)

class LogHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path == '/log':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)

            try:
                log_entry = json.loads(post_data.decode('utf-8'))

                # Format log entry
                timestamp = datetime.fromtimestamp(log_entry.get('timestamp', 0) / 1000).strftime('%Y-%m-%d %H:%M:%S.%f')[:-3]
                log_type = log_entry.get('type', 'UNKNOWN')

                # Write to file
                with open(LOG_FILE, 'a', encoding='utf-8') as f:
                    f.write(f"[{timestamp}] [{log_type}] {json.dumps(log_entry)}\n")

                # Send success response
                self.send_response(200)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status":"ok"}')

            except Exception as e:
                print(f"Error processing log: {e}")
                self.send_response(500)
                self.end_headers()
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        # Handle CORS preflight
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def log_message(self, format, *args):
        # Suppress HTTP request logging to console
        pass

def run_server(port=3101):
    server = HTTPServer(('localhost', port), LogHandler)
    print(f"📝 Logging server started on http://localhost:{port}")
    print(f"📁 Writing logs to: {os.path.abspath(LOG_FILE)}")
    print(f"🔄 Server running in background...")
    server.serve_forever()

if __name__ == '__main__':
    run_server()
