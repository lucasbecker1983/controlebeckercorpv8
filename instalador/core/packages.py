from __future__ import annotations

from .config import InstallerConfig


APT_PACKAGES = [
    "acl",
    "build-essential",
    "ca-certificates",
    "curl",
    "dialog",
    "dnsutils",
    "ethtool",
    "git",
    "iproute2",
    "jq",
    "net-tools",
    "nginx",
    "openssl",
    "postgresql",
    "postgresql-client",
    "python3",
    "python3-pip",
    "python3-venv",
    "squid",
    "ufw",
    "unbound",
]

GLOBAL_NPM_PACKAGES = [
    "pm2",
    "typescript",
    "vite",
    "tailwindcss",
]


def build_package_plan(config: InstallerConfig) -> dict[str, list[str]]:
    packages = list(APT_PACKAGES)
    npm_tools = list(GLOBAL_NPM_PACKAGES)

    if not config.stack.enable_postgresql:
        packages = [item for item in packages if not item.startswith("postgresql")]
    if not config.stack.enable_nginx:
        packages = [item for item in packages if item != "nginx"]
    if not config.stack.enable_unbound:
        packages = [item for item in packages if item != "unbound"]
    if not config.stack.enable_squid:
        packages = [item for item in packages if item != "squid"]
    if not config.stack.enable_pm2:
        npm_tools = [item for item in npm_tools if item != "pm2"]

    return {
        "apt": packages,
        "npm_global": npm_tools,
    }
