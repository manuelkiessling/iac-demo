# syntax=docker/dockerfile:1
ARG NODE_VERSION=24.22.1
FROM node:${NODE_VERSION}-bookworm-slim

ARG NPM_VERSION=12.2.1
ARG OPENTOFU_VERSION=1.13.2
ARG AWS_CLI_VERSION=2.38.5
ARG DEV_UID=1000
ARG DEV_GID=1000

# Optional CA secret supports managed/corporate proxies without baking their CA
# into the image. Normal Docker Desktop builds do not need it.
RUN --mount=type=secret,id=proxy_ca \
    set -eu; \
    apt-get update; \
    apt-get install -y --no-install-recommends ca-certificates curl git groff-base less unzip; \
    if [ -f /run/secrets/proxy_ca ]; then \
      cat /etc/ssl/certs/ca-certificates.crt /run/secrets/proxy_ca > /tmp/build-ca.pem; \
      export CURL_CA_BUNDLE=/tmp/build-ca.pem NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; \
    fi; \
    npm install --global "npm@${NPM_VERSION}" --no-audit --no-fund; \
    case "$(dpkg --print-architecture)" in \
      amd64) tofu_arch=amd64; aws_arch=x86_64 ;; \
      arm64) tofu_arch=arm64; aws_arch=aarch64 ;; \
      *) echo 'Only amd64 and arm64 are supported.' >&2; exit 1 ;; \
    esac; \
    mkdir /tmp/tools; cd /tmp/tools; \
    curl -fsSL --retry 3 "https://github.com/opentofu/opentofu/releases/download/v${OPENTOFU_VERSION}/tofu_${OPENTOFU_VERSION}_linux_${tofu_arch}.zip" -o "tofu_${OPENTOFU_VERSION}_linux_${tofu_arch}.zip"; \
    curl -fsSL --retry 3 "https://github.com/opentofu/opentofu/releases/download/v${OPENTOFU_VERSION}/tofu_${OPENTOFU_VERSION}_SHA256SUMS" -o SHA256SUMS; \
    sha256sum --check --ignore-missing SHA256SUMS; \
    unzip -q "tofu_${OPENTOFU_VERSION}_linux_${tofu_arch}.zip" tofu -d /usr/local/bin; \
    curl -fsSL --retry 3 "https://awscli.amazonaws.com/awscli-exe-linux-${aws_arch}-${AWS_CLI_VERSION}.zip" -o aws.zip; \
    unzip -q aws.zip; ./aws/install; \
    cd /; rm -rf /tmp/tools /tmp/build-ca.pem /root/.npm /var/lib/apt/lists/*

# Match the caller on Linux. Docker Desktop also handles the macOS bind mount.
RUN set -eu; \
    if [ "$DEV_UID" != 0 ]; then \
      if ! getent group "$DEV_GID" >/dev/null; then groupadd --gid "$DEV_GID" developer; fi; \
      usermod --uid "$DEV_UID" --gid "$DEV_GID" node; \
    fi; \
    mkdir -p /workspace/app/node_modules /workspace/infrastructure/.terraform /home/node/.cache/opentofu/plugins; \
    chown -R "$DEV_UID:$DEV_GID" /home/node /workspace

COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/dev-entrypoint
ENV HOME=/home/node \
    npm_config_cache=/home/node/.npm \
    TF_PLUGIN_CACHE_DIR=/home/node/.cache/opentofu/plugins \
    AWS_PAGER="" \
    AWS_CLI_AUTO_PROMPT=off
USER ${DEV_UID}:${DEV_GID}
WORKDIR /workspace
ENTRYPOINT ["dev-entrypoint"]
CMD ["bash"]
