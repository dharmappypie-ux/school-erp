#!/bin/sh
# Apply pending migrations during a production build.
#
# Retries, because the database this deploys against is a Neon instance that
# auto-suspends when idle. The first connection after a quiet spell has to wake
# it, and that wake can outlast Prisma's connect timeout — which fails as P1002
# ("the database server was reached but timed out") and takes the whole deploy
# with it. That is a cold start, not a broken migration, and the next attempt
# lands on a database that is now awake.
#
# A genuine failure still fails the build: after the last attempt the exit code
# is propagated, because shipping code whose schema was never applied is the
# thing this step exists to prevent.
set -e

attempt=1
max=3

while true; do
  if npx prisma migrate deploy; then
    exit 0
  fi

  if [ "$attempt" -ge "$max" ]; then
    echo "migrate deploy failed after $max attempts — failing the build." >&2
    exit 1
  fi

  echo "migrate deploy attempt $attempt failed; retrying in 10s (database may be waking)." >&2
  attempt=$((attempt + 1))
  sleep 10
done
