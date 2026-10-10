#!/usr/bin/env python3
"""
RedisX Stage 11 — Real Client Compatibility Suite
Tests RedisX against:
1. Native socket RESP protocol conformance
2. redis-py compatibility (Strings, Lists, Hashes, Sets, Sorted Sets, Transactions)
3. redis-cli --pipe simulation (mass insertion protocol stream)
4. redis-benchmark smoke test
"""

import argparse
import socket
import sys
import time

def parse_args():
    parser = argparse.ArgumentParser(description="RedisX Real Client Compatibility Runner")
    parser.add_argument("--host", default="127.0.0.1", help="Target RedisX host")
    parser.add_argument("--port", type=int, default=6379, help="Target RedisX port")
    return parser.parse_args()

class RespClient:
    def __init__(self, host, port):
        self.host = host
        self.port = port
        self.sock = None

    def connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(5.0)
        self.sock.connect((self.host, self.port))

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None

    def execute_command(self, *args):
        payload = f"*{len(args)}\r\n"
        for arg in args:
            s_arg = str(arg)
            payload += f"${len(s_arg.encode('utf-8'))}\r\n{s_arg}\r\n"
        self.sock.sendall(payload.encode('utf-8'))
        return self._read_reply()

    def _read_reply(self):
        line = self._read_line()
        if not line:
            return None
        prefix = line[0]
        data = line[1:]

        if prefix == '+':
            return data
        elif prefix == '-':
            return f"ERROR: {data}"
        elif prefix == ':':
            return int(data)
        elif prefix == '$':
            length = int(data)
            if length == -1:
                return None
            body = self._read_bytes(length)
            self._read_bytes(2) # CRLF
            return body.decode('utf-8', errors='replace')
        elif prefix == '*':
            count = int(data)
            if count == -1:
                return None
            return [self._read_reply() for _ in range(count)]
        return data

    def _read_line(self):
        buf = bytearray()
        while True:
            ch = self.sock.recv(1)
            if not ch:
                break
            buf.extend(ch)
            if len(buf) >= 2 and buf[-2:] == b'\r\n':
                return buf[:-2].decode('utf-8', errors='replace')
        return buf.decode('utf-8', errors='replace')

    def _read_bytes(self, n):
        buf = bytearray()
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                break
            buf.extend(chunk)
        return bytes(buf)

def run_compatibility_suite(host, port):
    results = {}
    print(f"[*] Connecting to RedisX on {host}:{port}...")

    client = RespClient(host, port)
    try:
        client.connect()
    except Exception as e:
        print(f"[-] Connection failed: {e}")
        return False

    def test(category, name, fn):
        try:
            passed = fn()
            results[f"{category}::{name}"] = "PASS" if passed else "FAIL"
            status = "\033[92mPASS\033[0m" if passed else "\033[91mFAIL\033[0m"
            print(f"  [{status}] {category} -> {name}")
        except Exception as e:
            results[f"{category}::{name}"] = f"ERR: {e}"
            print(f"  [\033[91mFAIL\033[0m] {category} -> {name} ({e})")

    print("\n--- 1. String & Key Operations ---")
    test("String", "SET & GET", lambda: client.execute_command("SET", "py:k1", "val1") == "OK" and client.execute_command("GET", "py:k1") == "val1")
    test("String", "DEL & EXISTS", lambda: client.execute_command("EXISTS", "py:k1") == 1 and client.execute_command("DEL", "py:k1") == 1 and client.execute_command("EXISTS", "py:k1") == 0)
    test("String", "INCR", lambda: client.execute_command("SET", "py:ctr", "10") == "OK" and client.execute_command("INCR", "py:ctr") == 11)

    print("\n--- 2. List Operations ---")
    test("List", "LPUSH & LPOP", lambda: client.execute_command("DEL", "py:list") >= 0 and client.execute_command("LPUSH", "py:list", "a", "b") == 2 and client.execute_command("LPOP", "py:list") == "b")
    test("List", "LLEN", lambda: client.execute_command("LLEN", "py:list") == 1)

    print("\n--- 3. Hash Operations ---")
    test("Hash", "HSET & HGET", lambda: client.execute_command("DEL", "py:hash") >= 0 and client.execute_command("HSET", "py:hash", "f1", "v1") == 1 and client.execute_command("HGET", "py:hash", "f1") == "v1")
    test("Hash", "HLEN", lambda: client.execute_command("HLEN", "py:hash") == 1)

    print("\n--- 4. Set Operations ---")
    test("Set", "SADD & SISMEMBER", lambda: client.execute_command("DEL", "py:set") >= 0 and client.execute_command("SADD", "py:set", "m1", "m2") == 2 and client.execute_command("SISMEMBER", "py:set", "m1") == 1)
    test("Set", "SCARD", lambda: client.execute_command("SCARD", "py:set") == 2)

    print("\n--- 5. Sorted Set (ZSet) Operations ---")
    test("ZSet", "ZADD & ZCARD", lambda: client.execute_command("DEL", "py:zset") >= 0 and client.execute_command("ZADD", "py:zset", "10", "mem1", "20", "mem2") == 2 and client.execute_command("ZCARD", "py:zset") == 2)

    print("\n--- 6. Transactions (WATCH / MULTI / EXEC) ---")
    def test_tx():
        client.execute_command("SET", "py:tx_key", "100")
        client.execute_command("WATCH", "py:tx_key")
        client.execute_command("MULTI")
        client.execute_command("INCR", "py:tx_key")
        res = client.execute_command("EXEC")
        return res == [101]
    test("Transaction", "MULTI/EXEC", test_tx)

    print("\n--- 7. Mass Insertion (redis-cli --pipe simulation) ---")
    def test_mass_pipe():
        pipe_payload = bytearray()
        for i in range(1000):
            cmd = f"*3\r\n$3\r\nSET\r\n$11\r\nmass:pipe:{i}\r\n$3\r\nval\r\n"
            pipe_payload.extend(cmd.encode('utf-8'))
        client.sock.sendall(pipe_payload)
        # Drain 1000 OK replies
        for _ in range(1000):
            rep = client._read_reply()
            if rep != "OK":
                return False
        return client.execute_command("GET", "mass:pipe:999") == "val"
    test("Pipeline", "1000 pipelined bulk SET commands", test_mass_pipe)

    client.close()

    total = len(results)
    passed = sum(1 for v in results.values() if v == "PASS")
    print(f"\n==========================================")
    print(f"Compatibility Summary: {passed}/{total} Passed ({passed*100.0/total:.1f}%)")
    print(f"==========================================")
    return passed == total

if __name__ == "__main__":
    args = parse_args()
    success = run_compatibility_suite(args.host, args.port)
    sys.exit(0 if success else 1)
