"""Run actual redis-py, redis-cli and redis-benchmark against an isolated RedisX.
Usage: python real_client_audit.py /path/to/redisx
Requires the redis Python package and Redis command-line tools.
"""
import subprocess
import sys
sys.dont_write_bytecode = True
import tempfile
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "integration"))
from server_audit import Server, wire
import redis
with tempfile.TemporaryDirectory() as directory:
    server = Server(Path(directory))
    try:
        server.start()
        client = redis.Redis(host="127.0.0.1", port=server.port, protocol=2, socket_timeout=5)
        assert client.ping()
        payload = bytes(range(256)) * 1000
        assert client.set("binary", payload)
        assert client.get("binary") == payload
        assert client.hset("hash", mapping={"f": "v"}) == 1
        assert client.hgetall("hash") == {b"f": b"v"}
        assert client.sadd("set", "01", "1") == 2
        assert client.zadd("zset", {"b": 2, "a": 1}) == 2
        assert client.zrange("zset", 0, -1, withscores=True) == [(b"a", 1.), (b"b", 2.)]
        with client.pipeline() as pipe:
            pipe.set("counter", 0); pipe.incr("counter"); pipe.get("counter")
            assert pipe.execute() == [True, 1, b"1"]
        with client.pipeline() as pipe:
            pipe.watch("counter"); pipe.multi(); pipe.incr("counter"); assert pipe.execute() == [2]
        client.client_setname("real-client")
        assert client.client_getname() in ("real-client", b"real-client")
        client.close()
        print(f"PASS redis-py {redis.__version__}: binary strings, collections, transactions, WATCH, client metadata", flush=True)
        reply = subprocess.check_output(["redis-cli", "-p", str(server.port), "PING"], timeout=5)
        assert reply.strip() == b"PONG"
        piped = b"".join(wire("SET", f"mass:{i}", "value") for i in range(1000))
        result = subprocess.run(["redis-cli", "-p", str(server.port), "--pipe"], input=piped, capture_output=True, timeout=15, check=True)
        assert b"errors: 0, replies: 1000" in result.stdout, result.stdout
        print("PASS redis-cli PING and --pipe: 1,000 actual pipelined writes", flush=True)
        result = subprocess.run(["redis-benchmark", "-p", str(server.port), "-n", "1000", "-c", "4", "-t", "set,get", "-q"], capture_output=True, timeout=20, check=True)
        print("PASS redis-benchmark SET/GET smoke (results are not a performance certification)", flush=True)
    finally: server.stop()
