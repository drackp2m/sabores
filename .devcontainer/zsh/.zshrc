# The devcontainer's zsh. ZDOTDIR (devcontainer.json) points to this folder, so this is also where
# .p10k.zsh (created by `p10k configure`), .aliases and the history go.

# Powerlevel10k's instant prompt: it has to stay at the top of the file.
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
# zsh-syntax-highlighting has to load last.
source $zsh_plugins/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
unset zsh_plugins
