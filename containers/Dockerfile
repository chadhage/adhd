# syntax=docker/dockerfile:1.7
ARG BASE_IMAGE=ubuntu:24.04@sha256:9a04f13b3f80ef056361e30868593b1cfd2279fe19e4081cb93a90bf56819d6a
FROM --platform=linux/amd64 ${BASE_IMAGE} AS toolchains
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/usr/local/bin:/usr/bin:/bin:/opt/dotnet:/usr/local/go/bin:/opt/google-cloud-sdk/bin:/opt/powershell \
    DOTNET_ROOT=/opt/dotnet DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 \
    CLOUDSDK_PYTHON=/usr/bin/python3 CLOUDSDK_CORE_DISABLE_USAGE_REPORTING=true \
    CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK=true \
    AZURE_CORE_COLLECT_TELEMETRY=no AZURE_EXTENSION_USE_DYNAMIC_INSTALL=no
WORKDIR /build
RUN test "$(dpkg --print-architecture)" = amd64 \
    && apt-get update -qq \
    && apt-get install -y --no-install-recommends ca-certificates curl unzip xz-utils python3 python3-venv \
    && rm -rf /var/lib/apt/lists/*
RUN curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://nodejs.org/dist/v22.23.5/node-v22.23.5-linux-x64.tar.xz -o node.tar.xz \
    && echo 'cdeb8670a0c81f51b4dc4ac61919f9b1ad917b304bf8221eb939570663d240f8  node.tar.xz' | sha256sum --check --strict \
    && tar -xJf node.tar.xz --strip-components=1 -C /usr/local \
    && rm node.tar.xz \
    && test "$(node --version)" = v22.23.5
RUN mkdir -p /opt/dotnet /opt/powershell \
    && curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://builds.dotnet.microsoft.com/dotnet/Sdk/10.0.404/dotnet-sdk-10.0.404-linux-x64.tar.gz -o dotnet.tar.gz \
    && echo '577d0eb17fec33d029104c5c63a1ab0accc3e28776274abef2218dbac5af18d2109b5406d26b31d76f5c245215e3ba0926a94c20246c672c41847c9e1eb1dc50  dotnet.tar.gz' | sha512sum --check --strict \
    && tar -xzf dotnet.tar.gz -C /opt/dotnet \
    && curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://go.dev/dl/go1.27.4.linux-amd64.tar.gz -o go.tar.gz \
    && echo '7226736c2339719cda28fbf3a54d71aa63bcefe376e98cef00034268dab24840  go.tar.gz' | sha256sum --check --strict \
    && tar -xzf go.tar.gz -C /usr/local \
    && curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://github.com/PowerShell/PowerShell/releases/download/v7.7.0/powershell-7.7.0-linux-x64.tar.gz -o powershell.tar.gz \
    && echo 'c89d9c682d2c403dfe726f3df948e359675235a5bd6fab535776de69729ca0cb  powershell.tar.gz' | sha256sum --check --strict \
    && tar -xzf powershell.tar.gz -C /opt/powershell \
    && chmod 0755 /opt/powershell/pwsh \
    && rm dotnet.tar.gz go.tar.gz powershell.tar.gz
RUN curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-594.0.1-linux-x86_64.tar.gz -o gcloud.tar.gz \
    && echo '8fc798fd0638428551f80277a568112d08afcf9cafd967d1cf39ae0918df2a1d  gcloud.tar.gz' | sha256sum --check --strict \
    && tar -xzf gcloud.tar.gz -C /opt \
    && rm -rf /opt/google-cloud-sdk/platform/bundledpythonunix \
    && rm gcloud.tar.gz \
    && python3 -m venv /opt/cloud-cli \
    && /opt/cloud-cli/bin/pip install --no-cache-dir --disable-pip-version-check azure-cli==2.93.0 awscli==1.46.3 \
    && ln -s /opt/cloud-cli/bin/az /usr/local/bin/az \
    && ln -s /opt/cloud-cli/bin/aws /usr/local/bin/aws
RUN curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://releases.hashicorp.com/terraform/1.17.2/terraform_1.17.2_linux_amd64.zip -o terraform.zip \
    && echo 'e6f16b2f0b137ee5729caa8c4e79a3bae4ee261acd198a1fcfa8584a6296605b  terraform.zip' | sha256sum --check --strict \
    && unzip -q terraform.zip terraform -d /usr/local/bin \
    && curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://github.com/Azure/bicep/releases/download/v0.49.2/bicep-linux-x64 -o bicep \
    && echo '0ab9de90c2493f206f8281bae74f9ee2d5ed3605548dab1adf41fef185e1f7c5  bicep' | sha256sum --check --strict \
    && install -m 0755 bicep /usr/local/bin/bicep \
    && curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://get.helm.sh/helm-v4.3.2-linux-amd64.tar.gz -o helm.tar.gz \
    && echo 'd1c0278d46beab79582d7e50f5b3dc206944ba8e577cde618513fd07daa53983  helm.tar.gz' | sha256sum --check --strict \
    && tar -xzf helm.tar.gz linux-amd64/helm \
    && install -m 0755 linux-amd64/helm /usr/local/bin/helm \
    && curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
      https://dl.k8s.io/release/v1.37.3/bin/linux/amd64/kubectl -o kubectl \
    && echo '9a1b55af2795b25dd288dbef62387db9b5530087ab918d28c6ad067f2e3cb07c  kubectl' | sha256sum --check --strict \
    && install -m 0755 kubectl /usr/local/bin/kubectl \
    && rm -rf terraform.zip bicep helm.tar.gz linux-amd64 kubectl
WORKDIR /opt/adhd
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --include=optional --ignore-scripts --no-audit --no-fund \
    && test -s node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64/runtime.node \
    && test -s node_modules/@github/copilot-sdk-linux-x64/prebuilds/linux-x64/copilot-runtime \
    && npm install --prefix /opt/typescript --ignore-scripts --no-audit --no-fund --save-exact typescript@5.9.3 \
    && ln -s /opt/typescript/node_modules/typescript/bin/tsc /usr/local/bin/tsc \
    && ln -s /opt/typescript/node_modules/typescript/bin/tsserver /usr/local/bin/tsserver \
    && npm cache clean --force >/dev/null

FROM --platform=linux/amd64 ${BASE_IMAGE} AS runtime
ARG SOURCE_REVISION
ARG SOURCE_URL
ARG BUILD_TIMESTAMP
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ENV DEBIAN_FRONTEND=noninteractive \
    PATH=/usr/local/bin:/usr/bin:/bin:/opt/dotnet:/usr/local/go/bin:/opt/google-cloud-sdk/bin:/opt/powershell \
    HOME=/home/studio DOTNET_ROOT=/opt/dotnet JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 \
    DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1 DOTNET_NOLOGO=1 \
    POWERSHELL_TELEMETRY_OPTOUT=1 CLOUDSDK_PYTHON=/usr/bin/python3 \
    CLOUDSDK_CORE_DISABLE_USAGE_REPORTING=true CLOUDSDK_CORE_DISABLE_PROMPTS=1 \
    CLOUDSDK_COMPONENT_MANAGER_DISABLE_UPDATE_CHECK=true \
    AZURE_CORE_COLLECT_TELEMETRY=no AZURE_EXTENSION_USE_DYNAMIC_INSTALL=no AZURE_BICEP_USE_BINARY_FROM_PATH=True \
    AWS_PAGER="" AWS_EC2_METADATA_DISABLED=true GIT_TERMINAL_PROMPT=0 TF_INPUT=0 \
    GIT_AUTHOR_NAME="ADHD container" GIT_AUTHOR_EMAIL=adhd-container@users.noreply.github.com \
    GIT_COMMITTER_NAME="ADHD container" GIT_COMMITTER_EMAIL=adhd-container@users.noreply.github.com
RUN test "$(dpkg --print-architecture)" = amd64 \
    && [[ "$SOURCE_REVISION" =~ ^([a-f0-9]{40}|[a-f0-9]{64})$ ]] \
    && [[ "$SOURCE_URL" =~ ^https://[a-zA-Z0-9.-]+/[a-zA-Z0-9._/-]+$ ]] \
    && [[ "$BUILD_TIMESTAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]+)?Z$ ]] \
    && apt-get update -qq \
    && apt-get install -y --no-install-recommends \
      ca-certificates curl git gh util-linux tzdata python3 python3-venv openjdk-21-jdk-headless maven \
      build-essential cmake ninja-build pkg-config gdb libicu74 libgssapi-krb5-2 libssl3t64 zlib1g \
    && rm -rf /var/lib/apt/lists/* \
    && (getent group 1000 >/dev/null || groupadd --gid 1000 studio) \
    && (getent passwd 1000 >/dev/null || useradd --uid 1000 --gid 1000 --home-dir /home/studio --no-create-home studio) \
    && install -d -o 1000 -g 1000 -m 0700 /home/studio /workspace/product
COPY --from=toolchains /usr/local /usr/local
COPY --from=toolchains /opt/dotnet /opt/dotnet
COPY --from=toolchains /opt/powershell /opt/powershell
COPY --from=toolchains /opt/google-cloud-sdk /opt/google-cloud-sdk
COPY --from=toolchains /opt/cloud-cli /opt/cloud-cli
COPY --from=toolchains /opt/typescript /opt/typescript
COPY --from=toolchains /opt/adhd/node_modules /opt/adhd/node_modules
WORKDIR /opt/adhd
COPY --chown=0:0 package.json package-lock.json LICENSE ./
COPY --chown=0:0 studio/*.mjs ./studio/
COPY --chown=0:0 .github/agents/ ./.github/agents/
COPY --chown=0:0 .github/skills/ ./.github/skills/
COPY --chown=0:0 .github/tools/revision-lock.mjs ./.github/tools/revision-lock.mjs
COPY --chown=0:0 .github/SECURITY.md ./.github/SECURITY.md
COPY --chown=0:0 prototype/index.html prototype/style.css prototype/app.js prototype/service.js prototype/live-ui.js prototype/factory-ui.js ./prototype/
COPY --chown=0:0 containers/toolchains.json ./containers/toolchains.json
RUN mkdir -p provenance \
    && dpkg-query -W > provenance/apt-packages.txt \
    && /opt/cloud-cli/bin/pip freeze > provenance/python-cli-packages.txt \
    && cp /opt/typescript/package-lock.json provenance/typescript-package-lock.json \
    && sha256sum package-lock.json containers/toolchains.json > provenance/manifest.sha256 \
    && find studio .github/agents .github/skills .github/tools prototype -type f -print0 \
      | sort -z | xargs -0 sha256sum > provenance/source.sha256 \
    && node --check studio/launch.mjs && node --check studio/container.mjs \
    && node --check studio/worker.mjs && node --check studio/healthcheck.mjs && node --check studio/operations.mjs \
    && test "$(dotnet --version)" = 10.0.404 \
    && test "$(go version)" = 'go version go1.27.4 linux/amd64' \
    && tsc --version | grep -Fx 'Version 5.9.3' \
    && python3 --version | grep '^Python 3.12\.' \
    && javac --version | grep '^javac 21' \
    && mvn --version | grep 'Apache Maven 3\.' \
    && az version --output json | grep '"azure-cli": "2.93.0"' \
    && aws --version 2>&1 | grep 'aws-cli/1.46.3' \
    && gcloud --version | grep -Fx 'Google Cloud SDK 594.0.1' \
    && terraform version | grep -Fx 'Terraform v1.17.2' \
    && bicep --version | grep 'Bicep CLI version 0.49.2' \
    && pwsh -NoLogo -NoProfile -NonInteractive -Command '$PSVersionTable.PSVersion.ToString()' | grep -Fx '7.7.0' \
    && helm version --short | grep '^v4.3.2' \
    && kubectl version --client --output=json | grep '"gitVersion": "v1.37.3"' \
    && rm -rf /root/.cache /root/.azure /root/.config /root/.dotnet
LABEL org.opencontainers.image.title="ADHD immutable Factory runtime" \
      org.opencontainers.image.version="1.0.0" \
      org.opencontainers.image.revision="${SOURCE_REVISION}" \
      org.opencontainers.image.source="${SOURCE_URL}" \
      org.opencontainers.image.created="${BUILD_TIMESTAMP}" \
      io.adhd.framework-license="MIT; bundled tool licenses require inventory review" \
      io.adhd.platform="linux/amd64" \
      io.adhd.toolchain-manifest="/opt/adhd/containers/toolchains.json" \
      io.adhd.source-provenance="/opt/adhd/provenance/source.sha256" \
      io.adhd.authentication="protected runtime files; no embedded credentials" \
      io.adhd.authority="image/configuration are not inference, provisioning, release or automatic-start approval"
USER 1000:1000
EXPOSE 4319
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 CMD ["node", "/opt/adhd/studio/healthcheck.mjs"]
ENTRYPOINT ["node", "/opt/adhd/studio/launch.mjs"]
