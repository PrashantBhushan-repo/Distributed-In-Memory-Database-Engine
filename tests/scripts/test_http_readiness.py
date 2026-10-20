"""Exercise readiness with real curl and local HTTP startup failures."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import socket
import subprocess
import threading
import unittest

HELPER = Path(__file__).resolve().parents[2] / "infra/scripts/wait-http.sh"


class ReadinessTests(unittest.TestCase):
    def probe(self, initial_failure, permanent=False):
        attempts = []

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                attempts.append(self.path)
                if permanent or len(attempts) == 1:
                    if initial_failure == "reset":
                        self.connection.shutdown(socket.SHUT_RDWR)
                        self.connection.close()
                        return
                    self.send_response(503)
                else:
                    self.send_response(200)
                self.end_headers()
                self.wfile.write(b"response body should not appear in logs")

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            result = subprocess.run(
                ["bash", "-c", 'source "$1"; wait_http "$2" "$3" "$4"',
                 "test", str(HELPER), "Grafana",
                 f"http://127.0.0.1:{server.server_port}/api/health",
                 "1" if permanent else "10"],
                capture_output=True, text=True, timeout=15,
            )
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)
        return result, attempts

    def test_retries_service_unavailable_until_ready(self):
        result, attempts = self.probe("503")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreaterEqual(len(attempts), 2)
        self.assertIn("Grafana is ready", result.stdout)
        self.assertNotIn("response body", result.stdout)

    def test_retries_connection_reset_until_ready(self):
        result, attempts = self.probe("reset")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertGreaterEqual(len(attempts), 2)

    def test_permanent_failure_is_bounded_and_names_service(self):
        result, _ = self.probe("503", permanent=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Grafana readiness failed", result.stderr)
        self.assertNotIn("Grafana is ready", result.stdout)


if __name__ == "__main__":
    unittest.main()
