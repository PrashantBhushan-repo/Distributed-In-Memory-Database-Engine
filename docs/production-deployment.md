# EC2 production deployment

Normal deployments run entirely through `.github/workflows/deploy.yml`. No
ownership fixes, configuration edits, persistence cleanup or container commands
should be necessary over SSH. Existing database files are never deleted.

## Prerequisites

- An Ubuntu EC2 instance reachable over SSH from the Actions runner.
- An SSH user with noninteractive sudo (the normal Ubuntu EC2 user supports this).
- Repository Actions secrets `EC2_HOST`, `EC2_USER`, and `EC2_SSH_KEY`.
- Correct production settings in `.env.production`. This file is currently
  repository-managed; do not put new production secrets in source control.
- Enough disk space for images and three local, uncompressed database backups,
  plus the next backup. A single deployment requires dataset size plus at least
  64 MiB free for its backup before the current engine is stopped.

Existing DNS, security groups and host HTTPS configuration remain prerequisites;
this pipeline does not create AWS infrastructure or configure a domain. Docker
and the Compose plugin are installed automatically if missing. The temporary
registry credential is removed when the deployment exits.

## Deploy

This project's `.env.production` sets `STUDIO_AUTH_MODE=open`: Studio opens
directly without a username/password page, and the gateway accepts HTTP and
WebSocket requests without an account. Open visitors receive the administrative
workspace role; existing command validation and explicit destructive-operation
confirmation still apply. Set `STUDIO_AUTH_MODE=authenticated` in that file to
require gateway accounts again. Do not enable open mode for a private database
unless access to the instance is otherwise restricted.

Push to `main`, `feature/packaging-and-docs`, or `feature/redis-studio`, or run the
workflow manually with a branch/commit. These branches share the existing EC2
environment. Actions serializes runs and never cancels a deployment mid-flight.
The selected ref is resolved once and all subsequent jobs use that exact commit.

The pipeline:

1. Builds/tests the gateway, web application and C++ engine; lints deployment
   scripts and tests deployment failure handling.
2. Builds three application images tagged with the resolved commit. Deployment
   uses their immutable registry digests, not `latest`.
3. Runs a container test against the actual engine image: initialize root-owned
   storage twice, retain existing contents, write a key, restart and recover it.
4. Uploads a complete runtime bundle into a unique release directory.
5. Acquires a host lock, installs Docker if necessary, inventories existing
   containers, project labels, volumes, published ports and disk usage; validates
   Compose and pulls images before interrupting existing services.
6. Detects the image's actual non-root UID/GID, repairs host data permissions
   without following symlinks, and tests writing as the normal engine user.
7. Checks backup space, stops the existing engine and takes a consistent local
   backup. If backup fails, restarts that same existing container and fails CI.
8. Recreates services (including config-only changes), waits up to 180 seconds
   for Compose readiness, then verifies gateway-to-engine connectivity, web,
   Prometheus and Grafana HTTP readiness. Each HTTP check names the service and
   retries startup connection resets and HTTP errors with a 120-second retry
   budget (at most five seconds per request). Services without container health
   checks must still pass these HTTP checks; running alone is not readiness.
9. Records the successful release, retains three completed backups and removes
   its temporary registry login.

On failure, Actions prints container states, health results, recent logs and disk
usage, and exits unsuccessfully. Fixes can be deployed by another workflow run.
This does not attempt destructive recovery of corrupted data or automatically
downgrade a database binary after it may have changed persistence files.

## EC2 layout and migration from the previous workflow

```text
/home/<EC2_USER>/pbRedisDB/
  data/                              # SAME existing live database directory
  .deploy/
    deploy.lock
    releases/<run-id>-<attempt>/
      docker-compose.prod.yml
      images.env                     # engine/gateway/web digest references
      .env.production
      infra/configs/
      infra/monitoring/
      infra/scripts/
    backups/<run-id>-<attempt>.tar    # consistent pre-deployment dataset
    current -> releases/...          # latest verified release
    previous -> releases/...         # prior verified release
```

The Compose project is passed explicitly with `--project-name`, so release folder
names never create new stacks. Existing application containers are inspected and
their project is reused (`pbredisdb` is the default on a fresh host). Existing
Prometheus and Grafana named volume names are also reused explicitly. Runtime
storage settings are passed through `sudo env`, which normally drops exported
shell variables. `DATA_DIR` points to the original absolute data directory,
so introducing release directories does not start an empty database. Old files in
the application root are no longer used for new releases. Do not edit EC2 copies;
update repository configuration and run the workflow.

Unknown container ownership, mixed projects, a different existing engine data
mount, or an unrelated Docker container publishing a required port fail preflight
before stopping the database. No unknown containers or volumes are removed.
The Actions log provides the EC2 inventory automatically; a separate manual SSH
inspection is not required for each deployment. Cached images and unused networks
from previous failed deployments are not themselves container-name conflicts.
No blanket Docker pruning is performed.

The engine's numeric user and group are discovered from its image. The deployment
fixes existing root/SSH-user-owned persistence automatically; Dockerfile ownership
alone cannot fix a bind-mounted host directory.

## Operational limits

Single-instance engine replacement has a brief interruption; this is not a
high-availability or zero-downtime deployment. Genuine corruption, incompatible
data formats, disk exhaustion or failed hardware require an explicit recovery
decision. Local backups protect against deployment mistakes but not loss of the
instance/storage: add off-instance backups with restore drills for disaster
recovery. Release bundles and old application images are retained for diagnosis;
monitor disk capacity and establish a retention policy as usage grows.

Moving credentials to AWS Secrets Manager/Parameter Store and using GitHub OIDC
with Systems Manager deployment are separate infrastructure improvements. The
current workflow continues using the existing authorized SSH secrets.

## Validation

```bash
shellcheck infra/scripts/deploy-ec2.sh infra/scripts/prepare-storage.sh infra/scripts/inspect-ec2.sh infra/scripts/wait-http.sh tests/scripts/test_deployment.sh
python3 tests/scripts/test_deploy_orchestration.py
python3 tests/scripts/test_http_readiness.py
ENGINE_IMAGE=ghcr.io/<owner>/pbredisdb-engine@sha256:<digest> bash tests/scripts/test_deployment.sh
```

The orchestration tests mock Docker and system services while exercising the real
deployment script, backups, exit codes, credential cleanup and release pointers.
The image test requires a running Linux Docker daemon and sudo for disposable
root-owned test-directory cleanup; Actions provides both.
