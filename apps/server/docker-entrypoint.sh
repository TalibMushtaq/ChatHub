#!/bin/sh
set -e

echo "Running Prisma migrate deploy..."
./node_modules/.bin/prisma migrate deploy

echo "Starting server..."
exec node dist/src/index.js
