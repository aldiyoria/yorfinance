#!/bin/bash
set -e

echo "=== YorFinance Bot — Starting ==="

# Wait for PostgreSQL to be ready
echo "Waiting for PostgreSQL..."
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q 2>/dev/null; do
  sleep 1
done
echo "PostgreSQL is ready."

# Run Prisma migrations
echo "Running database migrations..."
npx prisma migrate deploy

echo "Migrations applied successfully."

# Start the application
echo "Starting application..."
exec "$@"
