from __future__ import annotations

import shutil
import subprocess

from .config import InstallerConfig


def _run(command: list[str]) -> tuple[bool, str]:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            check=False,
        )
    except FileNotFoundError:
        return False, "comando nao encontrado"

    output = (result.stdout or result.stderr).strip()
    return result.returncode == 0, output or "sem saida"


def _service_status(service_name: str) -> tuple[bool, str]:
    return _run(["systemctl", "is-active", service_name])


def validate_installer_state(config: InstallerConfig) -> str:
    checks: list[tuple[str, bool, str]] = []

    binaries = [
        ("python3", "Python 3"),
        ("node", "Node.js"),
        ("npm", "npm"),
        ("psql", "PostgreSQL client"),
        ("nginx", "Nginx"),
        ("unbound-checkconf", "Unbound"),
        ("ufw", "UFW"),
        ("pm2", "PM2"),
    ]
    for binary, label in binaries:
        available = shutil.which(binary) is not None
        checks.append((label, available, binary if available else "nao instalado"))

    services = []
    if config.stack.enable_postgresql:
        services.append(("postgresql", "PostgreSQL"))
    if config.stack.enable_nginx:
        services.append(("nginx", "Nginx"))
    if config.stack.enable_unbound:
        services.append(("unbound", "Unbound"))
    if config.stack.enable_squid:
        services.append(("squid", "Squid"))

    for unit, label in services:
        ok, output = _service_status(unit)
        checks.append((f"{label} service", ok, output))

    if config.stack.enable_nginx:
        ok, output = _run(["nginx", "-t"])
        checks.append(("nginx -t", ok, output.splitlines()[-1] if output else "sem saida"))

    if config.stack.enable_unbound:
        ok, output = _run(["unbound-checkconf"])
        checks.append(("unbound-checkconf", ok, output.splitlines()[-1] if output else "ok"))

    if config.stack.enable_pm2:
        ok, output = _run(["pm2", "list"])
        checks.append(("pm2 list", ok, output.splitlines()[0] if output else "ok"))

    lines = ["=== VALIDACAO DO SUPERINSTALADOR SGCG JMB TECNOLOGIA ==="]
    for label, ok, detail in checks:
        status = "OK" if ok else "FALHA"
        lines.append(f"[{status}] {label}: {detail}")
    return "\n".join(lines)
