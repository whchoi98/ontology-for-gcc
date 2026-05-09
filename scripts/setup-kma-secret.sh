#!/usr/bin/env bash
set -euo pipefail
KEY="${1:?usage: $0 <kma-api-key>}"
aws secretsmanager create-secret \
  --name ontology-gcc-dev/kma-api-key \
  --secret-string "$KEY" 2>/dev/null || \
aws secretsmanager update-secret \
  --secret-id ontology-gcc-dev/kma-api-key \
  --secret-string "$KEY"
echo "KMA API key stored in Secrets Manager"
