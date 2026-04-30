#!/usr/bin/env python3
from __future__ import annotations

from pathlib import Path
from datetime import datetime
import subprocess
import shutil


BEFORE_RULES = Path("/etc/ufw/before.rules")
DEFAULT_UFW = Path("/etc/default/ufw")
BACKUP_ROOT = Path("/opt/controlebeckercorp-v8/backups")


def run(*args: str) -> None:
    subprocess.run(args, check=True)


def remove_dns_redirects(text: str) -> str:
    lines = text.splitlines()
    out: list[str] = []
    in_nat = False

    for line in lines:
        stripped = line.strip()
        if stripped == "*nat":
            in_nat = True
            out.append(line)
            continue
        if in_nat and stripped == "COMMIT":
            in_nat = False
            out.append(line)
            continue
        if in_nat and "-A PREROUTING" in line and "--dport 53" in line and "REDIRECT --to-ports 53" in line:
            continue
        out.append(line)

    return "\n".join(out) + "\n"


def replace_early_forward_block(text: str) -> str:
    begin = "# BEGIN BECKERCORP_EARLY_FORWARD\n"
    end = "# END BECKERCORP_EARLY_FORWARD\n"
    start_idx = text.index(begin)
    end_idx = text.index(end, start_idx) + len(end)
    replacement = (
        "# BEGIN BECKERCORP_EARLY_FORWARD\n"
        "# Bypass total solicitado em 2026-04-28: libera todo encaminhamento iniciado pelas VLANs.\n"
        "-A ufw-before-forward -i enp6s0+ -j ACCEPT\n"
        "# END BECKERCORP_EARLY_FORWARD\n"
    )
    return text[:start_idx] + replacement + text[end_idx:]


def main() -> None:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_dir = BACKUP_ROOT / f"bypass-total-{stamp}"
    backup_dir.mkdir(parents=True, exist_ok=True)

    shutil.copy2(BEFORE_RULES, backup_dir / "before.rules.bak")
    shutil.copy2(DEFAULT_UFW, backup_dir / "default.ufw.bak")

    before_text = BEFORE_RULES.read_text()
    before_text = remove_dns_redirects(before_text)
    before_text = replace_early_forward_block(before_text)
    BEFORE_RULES.write_text(before_text)

    default_text = DEFAULT_UFW.read_text()
    default_text = default_text.replace('DEFAULT_FORWARD_POLICY="DROP"', 'DEFAULT_FORWARD_POLICY="ACCEPT"')
    DEFAULT_UFW.write_text(default_text)

    run("ufw", "reload")

    with (backup_dir / "filter.after.txt").open("w") as handle:
        subprocess.run(("iptables-save", "-t", "filter"), check=True, stdout=handle)
    with (backup_dir / "nat.after.txt").open("w") as handle:
        subprocess.run(("iptables-save", "-t", "nat"), check=True, stdout=handle)

    print(str(backup_dir))


if __name__ == "__main__":
    main()
