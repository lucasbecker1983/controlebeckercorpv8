#!/usr/bin/env python3
"""
bypass_vlan.py — Bypass total de enforcement por VLAN (runtime-only, sem reload)

Uso:
    sudo python3 bypass_vlan.py <vlan_id>           # ativa bypass
    sudo python3 bypass_vlan.py <vlan_id> --undo    # restaura enforcement

VLANs gerenciadas: 10, 30, 40, 50, 70, 80, 99

O script atua apenas em runtime (iptables/tc). Nenhum arquivo é editado.
O reboot restaura o estado UFW persistente automaticamente.
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from datetime import datetime

LOG_FILE = "/var/log/sgcg-bypass.log"

VLANS: dict[int, dict[str, str]] = {
    10:  {"iface": "enp6s0.10",  "subnet": "192.168.10.0/24",  "ifb": "ifb10",  "label": "Secretaria"},
    30:  {"iface": "enp6s0.30",  "subnet": "192.168.30.0/24",  "ifb": "ifb30",  "label": "Celulares"},
    40:  {"iface": "enp6s0.40",  "subnet": "192.168.40.0/24",  "ifb": "ifb40",  "label": "CFTV"},
    50:  {"iface": "enp6s0.50",  "subnet": "192.168.50.0/24",  "ifb": "ifb50",  "label": "SINE"},
    70:  {"iface": "enp6s0.70",  "subnet": "192.168.70.0/24",  "ifb": "ifb70",  "label": "Visitantes"},
    80:  {"iface": "enp6s0.80",  "subnet": "192.168.80.0/24",  "ifb": "ifb80",  "label": "VOIP"},
    99:  {"iface": "enp6s0.99",  "subnet": "192.168.99.0/24",  "ifb": "ifb99",  "label": "Gestao"},
}


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [bypass_vlan] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def run(args: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=check, capture_output=capture, text=True)


def rule_exists_in_forward(iface: str) -> bool:
    """Verifica se já existe regra ACCEPT para esta interface no ufw-before-forward."""
    result = run(
        ["iptables", "-L", "ufw-before-forward", "-n", "--line-numbers"],
        check=False, capture=True,
    )
    return f"-i {iface}" in result.stdout and "ACCEPT" in result.stdout


def nat_redirect_exists(iface: str, proto: str) -> bool:
    result = run(["iptables", "-t", "nat", "-L", "PREROUTING", "-n"], check=False, capture=True)
    return f"{iface}" in result.stdout and f"{proto}" in result.stdout and "53" in result.stdout


def delete_nat_redirect(iface: str) -> None:
    """Remove redirecionamentos DNS desta VLAN da tabela NAT (idempotente)."""
    for proto in ("udp", "tcp"):
        while True:
            result = run(
                ["iptables", "-t", "nat", "-D", "PREROUTING",
                 "-i", iface, "-p", proto, "--dport", "53",
                 "-j", "REDIRECT", "--to-ports", "53"],
                check=False, capture=True,
            )
            if result.returncode != 0:
                break


def add_nat_redirect(iface: str) -> None:
    """Restaura redirecionamentos DNS desta VLAN na posição 1 da tabela NAT."""
    for pos, proto in enumerate(("tcp", "udp"), start=1):
        run(
            ["iptables", "-t", "nat", "-I", "PREROUTING", str(pos),
             "-i", iface, "-p", proto, "--dport", "53",
             "-j", "REDIRECT", "--to-ports", "53"],
            check=False,
        )


def clear_qos(iface: str, ifb: str) -> None:
    """Remove regras tc da VLAN (download, upload, IFB)."""
    for cmd in [
        ["tc", "qdisc", "del", "dev", iface, "root"],
        ["tc", "qdisc", "del", "dev", iface, "ingress"],
        ["tc", "qdisc", "del", "dev", ifb, "root"],
    ]:
        run(cmd, check=False, capture=True)


def activate_bypass(vlan_id: int) -> None:
    v = VLANS[vlan_id]
    iface = v["iface"]
    ifb   = v["ifb"]
    label = v["label"]

    log(f"ATIVANDO bypass — VLAN {vlan_id} ({label}) / {iface}")

    # 1. FORWARD: injeta ACCEPT antes de qualquer DROP
    if rule_exists_in_forward(iface):
        log(f"  [FORWARD] Regra ACCEPT já existe para {iface}, pulando.")
    else:
        run(["iptables", "-I", "ufw-before-forward", "1",
             "-i", iface, "-j", "ACCEPT"])
        log(f"  [FORWARD] Injetado ACCEPT na posição 1 para {iface}.")

    # 2. NAT: remove redirect DNS para liberar resolução direta
    delete_nat_redirect(iface)
    log(f"  [DNS NAT] Redirect DNS removido para {iface} (UDP+TCP porta 53).")

    # 3. QoS: limpa tc para liberar banda total
    clear_qos(iface, ifb)
    log(f"  [QoS] Regras tc removidas de {iface} e {ifb}.")

    log(f"BYPASS ATIVO — VLAN {vlan_id} ({label}). "
        f"Reboot restaura estado normal. Use --undo para restaurar agora.")
    _print_status(vlan_id)


def undo_bypass(vlan_id: int) -> None:
    v = VLANS[vlan_id]
    iface = v["iface"]
    ifb   = v["ifb"]
    label = v["label"]

    log(f"DESFAZENDO bypass — VLAN {vlan_id} ({label}) / {iface}")

    # 1. FORWARD: remove a regra ACCEPT injetada
    removed = 0
    while True:
        result = run(
            ["iptables", "-D", "ufw-before-forward",
             "-i", iface, "-j", "ACCEPT"],
            check=False, capture=True,
        )
        if result.returncode != 0:
            break
        removed += 1
    if removed:
        log(f"  [FORWARD] {removed} regra(s) ACCEPT removida(s) para {iface}.")
    else:
        log(f"  [FORWARD] Nenhuma regra ACCEPT injetada encontrada para {iface}.")

    # 2. NAT: restaura redirect DNS
    add_nat_redirect(iface)
    log(f"  [DNS NAT] Redirect DNS restaurado para {iface} (UDP+TCP porta 53).")

    # 3. QoS: não é possível restaurar automaticamente — o estado vem do banco
    log(f"  [QoS] Banda NÃO restaurada automaticamente. "
        f"Re-aplique via SGCG > Controle de Rede > QoS se necessário.")

    log(f"ENFORCEMENT RESTAURADO — VLAN {vlan_id} ({label}).")
    _print_status(vlan_id)


def _print_status(vlan_id: int) -> None:
    v = VLANS[vlan_id]
    iface = v["iface"]
    print()
    print(f"{'─'*60}")
    print(f"  Estado FORWARD — VLAN {vlan_id} ({v['label']})")
    print(f"{'─'*60}")
    result = run(
        ["iptables", "-L", "ufw-before-forward", "-n", "--line-numbers"],
        check=False, capture=True,
    )
    for line in result.stdout.splitlines():
        if iface in line or "Chain" in line or "target" in line:
            print(f"  {line}")
    print()
    print(f"  Estado NAT PREROUTING — VLAN {vlan_id}")
    print(f"{'─'*60}")
    result = run(["iptables", "-t", "nat", "-L", "PREROUTING", "-n"], check=False, capture=True)
    for line in result.stdout.splitlines():
        if iface in line or "Chain" in line or "target" in line:
            print(f"  {line}")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bypass total de enforcement por VLAN (runtime-only, sem reload).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Exemplo:\n  sudo python3 bypass_vlan.py 10\n  sudo python3 bypass_vlan.py 10 --undo",
    )
    parser.add_argument("vlan_id", type=int, choices=sorted(VLANS), metavar="VLAN_ID",
                        help=f"ID da VLAN: {sorted(VLANS)}")
    parser.add_argument("--undo", action="store_true",
                        help="Remove o bypass e restaura o enforcement.")
    args = parser.parse_args()

    if args.undo:
        undo_bypass(args.vlan_id)
    else:
        activate_bypass(args.vlan_id)


if __name__ == "__main__":
    main()
