#!/bin/zsh
cd "$(dirname "$0")/.."
export DATABASE_URL="postgresql://synapse:password@localhost:5433/synapse"
export REDIS_URL="redis://localhost:6380"
exec npm run dev -w packages/api
