#!/usr/bin/env bash
set -euo pipefail

# The additional CA is mounted only into this disposable container.
if [[ -n "${DEV_CA_CERT:-}" ]]; then
  cat /etc/ssl/certs/ca-certificates.crt "$DEV_CA_CERT" > /tmp/dev-ca-bundle.pem
  export NODE_EXTRA_CA_CERTS="$DEV_CA_CERT"
  export AWS_CA_BUNDLE=/tmp/dev-ca-bundle.pem CURL_CA_BUNDLE=/tmp/dev-ca-bundle.pem
  export SSL_CERT_FILE=/tmp/dev-ca-bundle.pem GIT_SSL_CAINFO=/tmp/dev-ca-bundle.pem
fi

mkdir -p "$TF_PLUGIN_CACHE_DIR"
# Include package.json (install-script allowlist), runtime and CPU architecture.
# The volume contains Linux dependencies, isolated from host node_modules.
fingerprint="$(cd /workspace/app; { sha256sum package.json package-lock.json; node --version; npm --version; uname -m; } | sha256sum | cut -d ' ' -f 1)"
if [[ ! -f /workspace/app/node_modules/.dev-fingerprint ]] || [[ "$(cat /workspace/app/node_modules/.dev-fingerprint)" != "$fingerprint" ]]; then
  echo 'Installing the locked app dependencies into the Docker volume…' >&2
  (cd /workspace/app && npm ci --no-audit --no-fund)
  printf '%s\n' "$fingerprint" > /workspace/app/node_modules/.dev-fingerprint
fi

if [[ "${1:-}" == bash && -t 0 ]]; then
  cat <<'WELCOME'

Ready in /workspace.
  cd app && npm run dev     # open http://localhost:3000 on the host
  npm --prefix app test     # from /workspace
  aws configure sso         # configure AWS inside this container

Use exit to leave. Source, state and Docker caches persist.
WELCOME
fi
exec "$@"
