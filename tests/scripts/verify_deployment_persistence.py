"""Check actual RESP responses and AOF recovery against the production image."""
import socket
import sys
import time

port, mode = int(sys.argv[1]), sys.argv[2]
deadline = time.monotonic() + 45
while True:
    try:
        connection = socket.create_connection(("127.0.0.1", port), timeout=2)
        break
    except OSError:
        if time.monotonic() >= deadline:
            raise
        time.sleep(0.5)

with connection:
    stream = connection.makefile("rb")

    def command(*args):
        parts = [arg.encode() for arg in args]
        connection.sendall(
            f"*{len(parts)}\r\n".encode()
            + b"".join(f"${len(part)}\r\n".encode() + part + b"\r\n" for part in parts)
        )
        line = stream.readline()
        if line.startswith(b"$") and line != b"$-1\r\n":
            return stream.read(int(line[1:]) + 2)[:-2]
        return line

    assert command("PING") == b"+PONG\r\n"
    if mode == "write":
        assert command("SET", "deployment-durability-check", "retained") == b"+OK\r\n"
        time.sleep(2)  # Production policy fsyncs every second.
    else:
        assert command("GET", "deployment-durability-check") == b"retained"
