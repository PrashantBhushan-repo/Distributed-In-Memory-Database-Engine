"""Exercise the real deploy script's success/failure paths without a live host.

Docker/network/system-service commands are faked; filesystem state, backups,
release pointers, credential cleanup and shell exit behavior are real.
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.app = self.root / "app"
        self.release = self.app / ".deploy/releases/test-release"
        (self.release / "infra/scripts").mkdir(parents=True)
        (self.release / "infra/configs").mkdir()
        (self.release / "infra/monitoring").mkdir()
        (self.app / "data").mkdir()
        (self.app / "data/appendonly.aof").write_bytes(b"existing database")
        for name in ("deploy-ec2.sh", "prepare-storage.sh", "inspect-ec2.sh"):
            shutil.copyfile(ROOT / "infra/scripts" / name, self.release / "infra/scripts" / name)
        for name in (".env.production", "docker-compose.prod.yml", "infra/configs/pbRedis.prod.conf", "infra/monitoring/prometheus.yml"):
            (self.release / name).write_text("test fixture\n")
        self.manifest = self.release / "images.env"
        self.manifest.write_text("".join(
            f"{name}_IMAGE=ghcr.io/test/{name.lower()}@sha256:{'a' * 64}\n"
            for name in ("ENGINE", "GATEWAY", "WEB")
        ))
        self.bin = self.root / "bin"
        self.bin.mkdir()
        self.log = self.root / "commands.jsonl"
        self.credentials = self.root / "credentials"
        self.credentials.mkdir()
        # Model sudo's env_reset: deployment settings must be passed explicitly.
        self.write_tool("sudo", '#!/bin/sh\n[ "$1" != -n ] || shift\nexec env -u DATA_DIR -u COMPOSE_PROJECT_NAME -u DOCKER_CONFIG -u PROMETHEUS_DATA_VOLUME -u GRAFANA_DATA_VOLUME "$@"\n')
        self.write_tool("systemctl", "#!/bin/sh\nexit 0\n")
        self.write_tool("curl", "#!/bin/sh\nexit 0\n")
        self.write_tool("mktemp", '#!/bin/sh\nmkdir -p "$TEST_CREDENTIALS"\nprintf "%s\\n" "$TEST_CREDENTIALS"\n')
        self.write_tool("docker", '''#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
with open(os.environ["TEST_LOG"], "a") as log:
    log.write(json.dumps(args) + "\\n")
    if args[:1] == ["compose"] and "--project-name" in args:
        log.write(json.dumps(["compose-context", os.environ.get("DATA_DIR"), os.environ.get("PROMETHEUS_DATA_VOLUME"), os.environ.get("GRAFANA_DATA_VOLUME")]) + "\\n")
project = os.environ.get("TEST_PROJECT", "pbredisdb")
services = {"redisx-server": "redisx", "redisx-gateway": "gateway", "redisx-web": "web", "redisx-prometheus": "prometheus", "redisx-grafana": "grafana"}
if args[:1] == ["inspect"]:
    template = args[2]
    if "com.docker.compose.project" in template:
        print("different-project" if os.environ.get("TEST_SPLIT_PROJECT") and args[-1] == "redisx-web" else project)
    elif "com.docker.compose.service" in template:
        print(services[args[-1]])
    elif '.Destination "/data"' in template:
        print(os.environ.get("TEST_DATA_DIR", os.environ["APP_ROOT"] + "/data"))
    elif '.Destination "/prometheus"' in template:
        print(os.environ.get("TEST_PROMETHEUS_VOLUME", project + "_prometheus-data"))
    elif '.Destination "/var/lib/grafana"' in template:
        print(os.environ.get("TEST_GRAFANA_VOLUME", project + "_grafana-data"))
if args[:1] == ["login"]:
    sys.stdin.read()
if args[:1] == ["ps"] and "publish=6379" in args and os.environ.get("TEST_PORT_CONFLICT"):
    print("unrelated-database")
if args[:1] == ["run"] and "id -u; id -g" in args:
    print("999\\n999")
if args[:1] == ["inspect"] and "{{.State.Running}}" in args:
    print("true")
if args[:1] == ["compose"] and "up" in args and os.environ.get("FAIL_UP"):
    sys.exit(42)
if args[:1] == ["compose"] and "pull" in args and os.environ.get("FAIL_PULL"):
    sys.exit(43)
''')

    def write_tool(self, name, content):
        path = self.bin / name
        path.write_text(content)
        path.chmod(0o755)

    def deploy(self, **overrides):
        env = dict(os.environ, PATH=f"{self.bin}:{os.environ['PATH']}",
                   APP_ROOT=str(self.app), GH_TOKEN="test-token", GH_ACTOR="test-user",
                   TEST_LOG=str(self.log), TEST_CREDENTIALS=str(self.credentials))
        env.update(overrides)
        return subprocess.run(["bash", str(self.release / "infra/scripts/deploy-ec2.sh")],
                              env=env, capture_output=True, text=True, timeout=20)

    def commands(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_success_preserves_data_and_records_release(self):
        result = self.deploy()
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual((self.app / "data/appendonly.aof").read_bytes(), b"existing database")
        self.assertEqual((self.app / ".deploy/current").resolve(), self.release)
        self.assertTrue((self.app / ".deploy/backups/test-release.tar").is_file())
        self.assertFalse(self.credentials.exists())
        commands = self.commands()
        up = next(cmd for cmd in commands if cmd[0] == "compose" and "up" in cmd)
        self.assertIn("--wait", up)
        self.assertIn("--force-recreate", up)
        self.assertEqual(up[up.index("--project-name") + 1], "pbredisdb")
        contexts = [cmd for cmd in commands if cmd[0] == "compose-context"]
        self.assertTrue(contexts)
        self.assertTrue(all(cmd[1] == str(self.app / "data") for cmd in contexts))
        self.assertTrue(any(cmd[0] == "exec" for cmd in commands))

    def test_failed_start_keeps_exit_status_and_collects_logs(self):
        result = self.deploy(FAIL_UP="1")
        self.assertEqual(result.returncode, 42, result.stdout + result.stderr)
        self.assertFalse((self.app / ".deploy/current").exists())
        self.assertFalse(self.credentials.exists())
        self.assertTrue(any(cmd[0] == "compose" and "logs" in cmd for cmd in self.commands()))
        self.assertEqual((self.app / "data/appendonly.aof").read_bytes(), b"existing database")

    def test_pull_failure_does_not_stop_existing_database(self):
        result = self.deploy(FAIL_PULL="1")
        self.assertEqual(result.returncode, 43)
        self.assertFalse(any(cmd[0] == "stop" for cmd in self.commands()))
        self.assertFalse(self.credentials.exists())

    def test_mutable_images_rejected_before_service_changes(self):
        self.manifest.write_text(self.manifest.read_text().replace("@sha256:" + "a" * 64, ":latest"))
        result = self.deploy()
        self.assertNotEqual(result.returncode, 0)
        self.assertFalse(any(cmd[0] in ("stop", "run") for cmd in self.commands()))

    def test_backup_failure_restarts_same_container(self):
        self.write_tool("tar", "#!/bin/sh\nexit 44\n")
        result = self.deploy()
        self.assertEqual(result.returncode, 44)
        self.assertIn(["start", "redisx-server"], self.commands())
        self.assertFalse(any(cmd[0] == "compose" and "up" in cmd for cmd in self.commands()))

    def test_existing_project_and_monitoring_volumes_are_preserved(self):
        result = self.deploy(TEST_PROJECT="legacy-stack", TEST_PROMETHEUS_VOLUME="existing-prom", TEST_GRAFANA_VOLUME="existing-grafana")
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        commands = self.commands()
        compose = [cmd for cmd in commands if cmd[0] == "compose" and "--project-name" in cmd]
        self.assertTrue(all(cmd[cmd.index("--project-name") + 1] == "legacy-stack" for cmd in compose))
        contexts = [cmd for cmd in commands if cmd[0] == "compose-context"]
        self.assertTrue(all(cmd[2:] == ["existing-prom", "existing-grafana"] for cmd in contexts))

    def test_different_database_mount_is_not_replaced(self):
        result = self.deploy(TEST_DATA_DIR="/different-database")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Refusing to switch databases", result.stderr)
        self.assertFalse(any(cmd[0] in ("stop", "run") for cmd in self.commands()))

    def test_mixed_projects_are_not_removed(self):
        result = self.deploy(TEST_SPLIT_PROJECT="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("different projects", result.stderr)
        self.assertFalse(any(cmd[0] in ("stop", "rm", "run") for cmd in self.commands()))

    def test_unrelated_port_owner_is_detected_before_stopping_database(self):
        result = self.deploy(TEST_PORT_CONFLICT="1")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unrelated container", result.stderr)
        self.assertFalse(any(cmd[0] in ("stop", "rm", "run") for cmd in self.commands()))


if __name__ == "__main__":
    unittest.main()
