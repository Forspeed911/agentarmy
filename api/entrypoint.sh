#!/bin/sh
echo "Running prisma migrate..."
npx prisma migrate deploy 2>&1 || echo "No migrations to apply"
echo "Starting API..."
exec node dist/main
