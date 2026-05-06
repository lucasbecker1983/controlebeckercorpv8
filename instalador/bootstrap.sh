#!/usr/bin/env bash
set -euo pipefail

INSTALLER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="${INSTALLER_DIR}/.venv"
NODESOURCE_SETUP="/tmp/sgcg_nodesource_setup.sh"

log() {
  printf '[SGCG/JMB] %s\n' "$*"
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    log "execute como root ou com sudo"
    exit 1
  fi
}

detect_ubuntu() {
  if [[ ! -f /etc/os-release ]]; then
    log "/etc/os-release nao encontrado"
    exit 1
  fi

  # shellcheck disable=SC1091
  source /etc/os-release

  if [[ "${ID:-}" != "ubuntu" && "${ID_LIKE:-}" != *"ubuntu"* ]]; then
    log "este bootstrap foi desenhado para Ubuntu Server 24.04+ ou compativel"
    exit 1
  fi

  local version
  version="${VERSION_ID:-0}"
  if dpkg --compare-versions "${version}" lt "24.04"; then
    log "versao detectada ${version}; e necessario Ubuntu 24.04 ou superior"
    exit 1
  fi
}

install_system_packages() {
  local packages=(
    acl
    apt-transport-https
    build-essential
    ca-certificates
    curl
    dialog
    dnsutils
    ethtool
    git
    gnupg
    iproute2
    jq
    lsb-release
    net-tools
    nginx
    openssl
    postgresql
    postgresql-client
    python3
    python3-pip
    python3-venv
    software-properties-common
    squid
    ufw
    unbound
    unzip
    wget
    zip
  )

  log "atualizando indice de pacotes"
  apt-get update

  log "instalando pacotes base do SGCG"
  DEBIAN_FRONTEND=noninteractive apt-get install -y "${packages[@]}"
}

install_node_runtime() {
  if command -v node >/dev/null 2>&1; then
    log "Node.js ja detectado: $(node --version)"
    return
  fi

  log "instalando Node.js 22.x via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_22.x -o "${NODESOURCE_SETUP}"
  bash "${NODESOURCE_SETUP}"
  DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
}

install_global_node_tools() {
  log "instalando ferramentas globais Node.js"
  npm install -g npm pm2 typescript vite tailwindcss
}

prepare_python_venv() {
  log "preparando ambiente virtual Python do instalador"
  python3 -m venv "${VENV_DIR}"
  # shellcheck disable=SC1090
  source "${VENV_DIR}/bin/activate"
  pip install --upgrade pip
  pip install -r "${INSTALLER_DIR}/requirements.txt"
}

main() {
  require_root
  detect_ubuntu
  install_system_packages
  install_node_runtime
  install_global_node_tools
  prepare_python_venv

  log "bootstrap concluido"
  log "proximo passo: source ${VENV_DIR}/bin/activate && python3 ${INSTALLER_DIR}/sgcg-installer.py wizard"
}

main "$@"
