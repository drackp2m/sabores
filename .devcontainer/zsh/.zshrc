# zsh del devcontainer. ZDOTDIR (devcontainer.json) apunta a esta carpeta, así que aquí van también
# .p10k.zsh (lo crea `p10k configure`), .aliases y el historial.

# Instant prompt de Powerlevel10k: tiene que quedarse al principio del fichero.
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi

HISTFILE="$ZDOTDIR/.zsh_history"
HISTSIZE=50000
SAVEHIST=50000
setopt share_history hist_ignore_all_dups hist_ignore_space hist_reduce_blanks
setopt auto_cd interactive_comments

bindkey -e
autoload -Uz compinit && compinit
zstyle ':completion:*' menu select
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'

zsh_plugins=/usr/share/zsh/plugins
source $zsh_plugins/powerlevel10k/powerlevel10k.zsh-theme
[[ ! -f ${ZDOTDIR:-~}/.p10k.zsh ]] || source ${ZDOTDIR:-~}/.p10k.zsh
[[ ! -f $ZDOTDIR/.aliases ]] || source $ZDOTDIR/.aliases

source $zsh_plugins/zsh-autosuggestions/zsh-autosuggestions.zsh
# zsh-syntax-highlighting tiene que cargarse el último.
source $zsh_plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
unset zsh_plugins
