# See https://github.com/devcontainers/images/blob/main/docs/README.md for base image options
FROM mcr.microsoft.com/devcontainers/javascript-node:0-20

# Install OS packages if needed
USER root
RUN apt-get update \
  && apt-get -y install --no-install-recommends build-essential git curl \
  && rm -rf /var/lib/apt/lists/*

# Use non-root vscode user
USER vscode
WORKDIR /workspace

# Ensure pnpm is available
RUN corepack enable && corepack prepare pnpm@latest --activate

