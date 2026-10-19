"""Black-box regression checks against a real isolated RedisX process."""
import os
import socket
import ssl
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
BINARY = str(Path(sys.argv.pop(1)).resolve())
class Error(str): pass
def wire(*args):
    args = [x if isinstance(x, bytes) else str(x).encode() for x in args]
    return b"*%d\r\n" % len(args) + b"".join(b"$%d\r\n" % len(x) + x + b"\r\n" for x in args)
class Client:
    def __init__(self, port, tls=False):
        self.socket = socket.create_connection(("127.0.0.1", port), 3)
        self.socket.settimeout(3)
        if tls: self.socket = ssl._create_unverified_context().wrap_socket(self.socket, server_hostname="localhost")
        self.file = self.socket.makefile("rb")
    def read(self):
        line = self.file.readline()
        if not line: raise EOFError("server disconnected")
        kind, value = line[:1], line[1:-2]
        if kind == b"+": return value
        if kind == b"-": return Error(value.decode())
        if kind == b":": return int(value)
        n = int(value)
        if n == -1: return None
        if kind == b"$":
            value = self.file.read(n)
            assert self.file.read(2) == b"\r\n"
            return value
        if kind == b"*": return [self.read() for _ in range(n)]
        raise AssertionError(line)
    def call(self, *args):
        self.socket.sendall(wire(*args)); return self.read()
    def close(self): self.file.close(); self.socket.close()
def free_port():
    with socket.socket() as s: s.bind(("127.0.0.1", 0)); return s.getsockname()[1]
class Server:
    def __init__(self, path, *options): self.path, self.options, self.port, self.process = path, options, free_port(), None
    def start(self):
        self.log = open(self.path / "server.log", "ab")
        self.process = subprocess.Popen([BINARY, "--port", str(self.port), "--metrics-port", "0", "--dir", str(self.path), *self.options], cwd=self.path, stdout=self.log, stderr=self.log)
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            if self.process.poll() is not None: raise AssertionError((self.path / "server.log").read_text())
            try: self.client = Client(self.port); return self.client
            except OSError: time.sleep(.02)
        raise AssertionError("startup timed out")
    def stop(self, kill=False):
        if hasattr(self, "client"): self.client.close()
        if self.process and self.process.poll() is None:
            self.process.kill() if kill else self.process.terminate()
            self.process.wait(timeout=8)
            if not kill: assert self.process.returncode == 0, (self.path / "server.log").read_text()
        if hasattr(self, "log"): self.log.close()
class ServerAudit(unittest.TestCase):
    def setUp(self): self.temp = tempfile.TemporaryDirectory(); self.path = Path(self.temp.name); self.servers = []
    def tearDown(self):
        for s in self.servers: s.stop()
        self.temp.cleanup()
    def server(self, *options):
        s = Server(self.path, *options); self.servers.append(s); return s, s.start()
    def test_auth_arity_and_unknown_username(self):
        s, c = self.server("--requirepass", "secret")
        self.assertIsInstance(c.call("AUTH"), Error)
        self.assertIsInstance(c.call("AUTH", "nobody", "secret"), Error)
        self.assertIsInstance(c.call("PING"), Error)
        self.assertEqual(c.call("AUTH", "secret"), b"OK")
        self.assertEqual(c.call("PING"), b"PONG")
    def test_acl_key_checks_and_atomic_rules(self):
        s, c = self.server()
        self.assertEqual(c.call("ACL", "SETUSER", "reader", "on", ">pw", "+@read", "~safe:*"), b"OK")
        self.assertIsInstance(c.call("ACL", "SETUSER", "reader", "+@write", "invalid-rule"), Error)
        d = Client(s.port)
        try:
            self.assertEqual(d.call("AUTH", "reader", "pw"), b"OK")
            self.assertIsInstance(d.call("SET", "safe:x", "1"), Error)
            self.assertEqual(d.call("GET", "safe:x"), None)
            self.assertIsInstance(d.call("EXISTS", "safe:x", "private:x"), Error)
        finally: d.close()
    def test_aof_restart_types_expiry_conditionals(self):
        s, c = self.server("--appendonly", "yes", "--appendfsync", "always")
        self.assertEqual(c.call("SET", "counter", "0"), b"OK")
        self.assertEqual(c.call("INCR", "counter"), 1)
        self.assertEqual(c.call("SET", "counter", "bad", "NX"), None)
        for cmd in [("LPUSH", "list", "b", "a"), ("HSET", "hash", "f", "v"), ("SADD", "set", "01", "1"), ("ZADD", "zset", "2", "b", "1", "a")]: self.assertNotIsInstance(c.call(*cmd), Error)
        self.assertEqual(c.call("SET", "short", "x", "PX", "80"), b"OK")
        self.assertEqual(c.call("SAVE"), b"OK")
        s.stop(kill=True); time.sleep(.1); c = s.start()
        self.assertEqual(c.call("GET", "counter"), b"1")
        self.assertEqual(c.call("GET", "short"), None)
        self.assertEqual(c.call("LRANGE", "list", "0", "-1"), [b"a", b"b"])
        self.assertEqual(c.call("HGET", "hash", "f"), b"v")
        self.assertEqual(c.call("SCARD", "set"), 2)
        self.assertEqual(c.call("ZRANGE", "zset", "0", "-1"), [b"a", b"b"])
    def test_aof_repairs_truncated_tail_before_new_appends(self):
        s, c = self.server("--appendonly", "yes", "--appendfsync", "always")
        c.call("SET", "a", "one"); s.stop(kill=True)
        with open(self.path / "appendonly.aof", "ab") as f: f.write(b"*3\r\n$3\r\nSET\r\n$6\r\nbroken")
        c = s.start(); self.assertEqual(c.call("SET", "b", "two"), b"OK"); s.stop(kill=True)
        c = s.start(); self.assertEqual(c.call("GET", "a"), b"one"); self.assertEqual(c.call("GET", "b"), b"two")
    def test_transaction_select_persistence(self):
        s, c = self.server("--appendonly", "yes")
        self.assertEqual(c.call("MULTI"), b"OK")
        c.call("SELECT", "3"); c.call("SET", "tx", "value", "PX", "60000")
        self.assertEqual(c.call("EXEC"), [b"OK", b"OK"])
        self.assertEqual(c.call("GET", "tx"), b"value")
        s.stop(kill=True); c = s.start()
        self.assertEqual(c.call("GET", "tx"), None)
        c.call("SELECT", "3"); self.assertEqual(c.call("GET", "tx"), b"value")
    def test_watch_expiration(self):
        s, c = self.server(); d = Client(s.port)
        try:
            c.call("SET", "watched", "x", "PX", "30"); c.call("WATCH", "watched"); c.call("MULTI"); c.call("SET", "other", "x")
            time.sleep(.04); self.assertEqual(c.call("EXEC"), None)
        finally: d.close()
    def test_numeric_errors_do_not_crash(self):
        s, c = self.server()
        for args in [("LRANGE", "x", "no", "1"), ("ZRANGE", "x", "no", "1"), ("BLPOP", "x", "nan"), ("BLPOP", "x", "-1"), ("ZADD", "z", "NaN", "x"), ("EXPIRE", "x", "bad")]:
            self.assertIsInstance(c.call(*args), Error, args)
        self.assertEqual(c.call("PING"), b"PONG")
    def test_blocking_pipeline_and_durable_pop(self):
        s, c = self.server("--appendonly", "yes"); d = Client(s.port)
        try:
            c.socket.sendall(wire("PING") + wire("BLPOP", "jobs", "1") + wire("PING"))
            self.assertEqual(c.read(), b"PONG")
            time.sleep(.03); d.call("RPUSH", "jobs", "task")
            self.assertEqual(c.read(), [b"jobs", b"task"])
            self.assertEqual(c.read(), b"PONG")
        finally: d.close()
        s.stop(kill=True); c = s.start(); self.assertEqual(c.call("LLEN", "jobs"), 0)
    def test_background_save_and_rewrite_with_writes(self):
        s, c = self.server("--appendonly", "yes")
        for i in range(50): c.call("SET", f"key:{i}", "v" * 100)
        self.assertNotIsInstance(c.call("BGSAVE"), Error)
        self.assertNotIsInstance(c.call("BGREWRITEAOF"), Error)
        for i in range(50): c.call("INCR", "count")
        time.sleep(.4)
        s.stop(kill=True); c = s.start(); self.assertEqual(c.call("GET", "count"), b"50")
    def test_real_tls_and_plaintext_rejection(self):
        subprocess.run(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", str(self.path / "key.pem"), "-out", str(self.path / "cert.pem"), "-subj", "/CN=localhost", "-days", "1"], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        port = free_port()
        s, c = self.server("--tls-port", str(port), "--tls-cert-file", str(self.path / "cert.pem"), "--tls-key-file", str(self.path / "key.pem"))
        d = Client(port, tls=True)
        try:
            self.assertEqual(d.call("PING"), b"PONG")
            self.assertEqual(d.call("SET", "encrypted", "x" * 100000), b"OK")
            self.assertEqual(len(d.call("GET", "encrypted")), 100000)
        finally: d.close()
        raw = socket.create_connection(("127.0.0.1", port), 2); raw.settimeout(2)
        try:
            raw.sendall(wire("PING"))
            try: self.assertNotEqual(raw.recv(100), b"+PONG\r\n")
            except ConnectionResetError: pass
        finally: raw.close()
    def test_wait_does_not_block_other_clients(self):
        s, c = self.server(); d = Client(s.port)
        try:
            c.socket.sendall(wire("WAIT", "1", "100"))
            start = time.monotonic(); self.assertEqual(d.call("PING"), b"PONG")
            self.assertLess(time.monotonic() - start, .08)
            self.assertEqual(c.read(), 0)
        finally: d.close()
    def test_disk_failure_disables_further_mutations(self):
        s, c = self.server("--appendonly", "yes", "--appendfsync", "always")
        c.call("DEBUG", "FAILPOINT", "aof_write", "once")
        self.assertIsInstance(c.call("SET", "failed", "x"), Error)
        self.assertIsInstance(c.call("SET", "later", "x"), Error)
        self.assertEqual(c.call("GET", "later"), None)
    def test_primary_replica_full_sync_and_live_expiry(self):
        primary, c = self.server()
        c.call("SELECT", "3"); c.call("SET", "before-sync", "old")
        replica_path = self.path / "replica"; replica_path.mkdir()
        replica = Server(replica_path, "--appendonly", "yes", "--appendfsync", "always"); self.servers.append(replica); d = replica.start()
        self.assertEqual(d.call("REPLICAOF", "127.0.0.1", primary.port), b"OK")
        d.call("SELECT", "3")
        deadline = time.monotonic() + 4
        while time.monotonic() < deadline:
            if d.call("GET", "before-sync") == b"old": break
            time.sleep(.02)
        self.assertEqual(d.call("GET", "before-sync"), b"old")
        c.call("SET", "live", "new", "PX", "1000")
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            if d.call("GET", "live") == b"new": break
            time.sleep(.01)
        self.assertEqual(d.call("GET", "live"), b"new")
        c.call("MULTI"); c.call("SET", "replica-tx", "0", "PX", "60000"); c.call("INCR", "replica-tx"); self.assertEqual(c.call("EXEC"), [b"OK", 1])
        self.assertEqual(c.call("WAIT", "1", "2000"), 1)
        self.assertEqual(d.call("GET", "replica-tx"), b"1")
        self.assertIsInstance(d.call("SET", "forbidden", "x"), Error)
        replica.stop(kill=True); d = replica.start(); d.call("SELECT", "3")
        self.assertEqual(d.call("GET", "before-sync"), b"old")
        self.assertEqual(d.call("GET", "replica-tx"), b"1")
    def test_transaction_durability_failure_is_not_acknowledged(self):
        s, c = self.server("--appendonly", "yes", "--appendfsync", "always")
        c.call("MULTI"); c.call("SET", "uncertain", "x"); c.call("DEBUG", "FAILPOINT", "aof_write", "once")
        self.assertIsInstance(c.call("EXEC"), Error)
        self.assertIsInstance(c.call("SET", "later", "x"), Error)
        s.stop(kill=True); c = s.start(); self.assertEqual(c.call("GET", "uncertain"), None)
    def test_scan_rejects_bad_options(self):
        s, c = self.server()
        for options in [("COUNT", "bad"), ("COUNT", "0"), ("MATCH",), ("UNKNOWN", "x")]: self.assertIsInstance(c.call("SCAN", "0", *options), Error)
    def test_recovery_does_not_resurrect_expired_mutated_keys(self):
        s, c = self.server("--appendonly", "yes", "--appendfsync", "always")
        c.call("SET", "expires", "0", "PX", "100")
        self.assertEqual(c.call("INCR", "expires"), 1)
        c.call("RPUSH", "expired-list", "a"); c.call("PEXPIRE", "expired-list", "100"); c.call("RPUSH", "expired-list", "b")
        s.stop(kill=True); time.sleep(.12); c = s.start()
        self.assertEqual(c.call("GET", "expires"), None)
        self.assertEqual(c.call("LRANGE", "expired-list", "0", "-1"), [])
    def test_pubsub_unsubscribe_preserves_patterns_and_responds_empty(self):
        s, c = self.server()
        self.assertEqual(c.call("UNSUBSCRIBE"), [b"unsubscribe", None, 0])
        self.assertEqual(c.call("SUBSCRIBE", "channel"), [b"subscribe", b"channel", 1])
        self.assertEqual(c.call("PSUBSCRIBE", "news:*"), [b"psubscribe", b"news:*", 2])
        self.assertEqual(c.call("UNSUBSCRIBE"), [b"unsubscribe", b"channel", 1])
        self.assertEqual(c.call("PING", "hi"), [b"pong", b"hi"])
        self.assertEqual(c.call("PUNSUBSCRIBE"), [b"punsubscribe", b"news:*", 0])
        self.assertEqual(c.call("PING"), b"PONG")
    def test_bad_config_and_port_rejected(self):
        for options in [("--port", "123bad"), ("--appendonly", "maybe"), ("--tls-port", str(free_port()))]:
            result = subprocess.run([BINARY, "--dir", str(self.path), *options], cwd=self.path, capture_output=True, timeout=5)
            self.assertNotEqual(result.returncode, 0)
if __name__ == "__main__": unittest.main(verbosity=2)
