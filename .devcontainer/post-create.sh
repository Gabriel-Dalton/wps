#!/usr/bin/env bash
# Runs once, after the dev container is created.
set -euo pipefail

cd /workspace

# python-decouple walks up from the package directory, so .env belongs at the repo
# root (see backend/README.md).
if [ ! -f .env ]; then
  cp .env.example .env
  # .env.example already points POSTGRES_*_HOST at the `db` service; redis and nats
  # default to localhost, which is wrong once they are separate containers.
  sed -i 's/^REDIS_HOST=.*/REDIS_HOST=redis/' .env
  sed -i 's/^NATS_SERVER=.*/NATS_SERVER=nats/' .env
  # The RedAPP comparison tests need the bundled jars on the CLASSPATH.
  libs=/workspace/backend/packages/wps-api/libs
  sed -i "s|^CLASSPATH=.*|CLASSPATH=${libs}/REDapp_Lib.jar:${libs}/WTime.jar:${libs}/hss-java.jar|" .env
  echo "Created .env from .env.example. External service credentials (WFWX, object"
  echo "store, Sentry) are still placeholders - ask a maintainer for real values."
fi

if [ ! -f web/apps/wps-web/.env ]; then
  cp web/apps/wps-web/.env.example web/apps/wps-web/.env
fi

echo "Installing python workspace dependencies (this builds gdal, it takes a while)..."
cd /workspace/backend
uv sync --all-extras

echo
echo "Done. Next steps:"
echo "  cd backend/packages/wps-api && uv run --package wps-api alembic upgrade head"
echo "  cd backend && uv run pytest"
