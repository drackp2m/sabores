FROM node:26.5-alpine3.24

# git: needed by VS Code (source control) and by pnpm for dependencies from repositories.
# openssh-client and gnupg: to use the host's SSH and GPG keys (git push, signing commits).
# bash and ripgrep: Claude Code can't run commands with BusyBox's sh and on Alpine it searches with
#   the system's ripgrep (USE_BUILTIN_RIPGREP=0).
# zsh, Powerlevel10k and plugins: node's default shell; its configuration is in .devcontainer/zsh.
# sudo: the node user can install more packages with `sudo apk add …` without rebuilding the image.
RUN apk add --no-cache git openssh-client gnupg bash ripgrep sudo \
		zsh zsh-vcs zsh-theme-powerlevel10k zsh-autosuggestions zsh-syntax-highlighting \
	&& echo "node ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/node \
	&& chmod 0440 /etc/sudoers.d/node \
	&& sed -i '/^node:/s#:/bin/sh$#:/bin/zsh#' /etc/passwd

RUN npm install -g pnpm@11

# VS Code forwards the host's GPG agent here; gpg requires the folder to be private.
RUN mkdir -m 700 /home/node/.gnupg && chown node:node /home/node/.gnupg

ENV USE_BUILTIN_RIPGREP=0
