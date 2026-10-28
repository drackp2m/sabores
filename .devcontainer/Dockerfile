FROM node:26.5-alpine3.24

# git: lo necesitan VS Code (control de código fuente) y pnpm para dependencias desde repositorios.
# openssh-client y gnupg: para usar las claves SSH y GPG del host (git push, firmar commits).
# bash y ripgrep: Claude Code no puede ejecutar comandos con el sh de BusyBox y en Alpine busca con
#   el ripgrep del sistema (USE_BUILTIN_RIPGREP=0).
# zsh, Powerlevel10k y plugins: shell por defecto de node; su configuración está en .devcontainer/zsh.
# sudo: el usuario node puede instalar más paquetes con `sudo apk add …` sin reconstruir la imagen.
RUN apk add --no-cache git openssh-client gnupg bash ripgrep sudo \
		zsh zsh-vcs zsh-theme-powerlevel10k zsh-autosuggestions zsh-syntax-highlighting \
	&& echo "node ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/node \
	&& chmod 0440 /etc/sudoers.d/node \
	&& sed -i '/^node:/s#:/bin/sh$#:/bin/zsh#' /etc/passwd

RUN npm install -g pnpm@11

# VS Code reenvía aquí el agente GPG del host; gpg exige que la carpeta sea privada.
RUN mkdir -m 700 /home/node/.gnupg && chown node:node /home/node/.gnupg

ENV USE_BUILTIN_RIPGREP=0
