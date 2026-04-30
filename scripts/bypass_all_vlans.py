#!/usr/bin/env python3
"""
bypass_all_vlans.py — Bypass total de enforcement para TODAS as VLANs (runtime-only)

Uso:
    sudo python3 bypass_all_vlans.py           # ativa bypass em todas as VLANs
    sudo python3 bypass_all_vlans.py --undo    # restaura enforcement em todas

Por que runtime-only:
    - Efeito imediato (milissegundos), sem reload de UFW, sem restart de serviços
    - Sessão SSH instável não desfaz o que já foi aplicado
    - Reboot restaura o estado UFW persistente automaticamente (failsafe)
    - --undo reverte sem reboot

Camadas afetadas:
    1. iptables FORWARD  — injeta ACCEPT antes de todos os DROPs por VLAN
    2. NAT PREROUTING    — remove redirect DNS (libera resolução sem Unbound)
    3. QoS (tc)          — limpa limitação de banda por interface

Squid não é afetado (opera em modo explícito, sem intercepção transparente ativa).
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

ORDERED_VLANS = sorted(VLANS.keys())


def log(msg: str) -> None:
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] [bypass_all] {msg}"
    print(line, flush=True)
    try:
        with open(LOG_FILE, "a") as fh:
            fh.write(line + "\n")
    except OSError:
        pass


def run(args: list[str], *, check: bool = True, capture: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(args, check=check, capture_output=capture, text=True)


# ─── Helpers de iptables ────────────────────────────────────────────────────

def forward_accept_exists(iface: str) -> bool:
    result = run(
        ["iptables", "-L", "ufw-before-forward", "-n", "--line-numbers"],
        check=False, capture=True,
    )
    return f"-i {iface}" in result.stdout and "ACCEPT" in result.stdout


def inject_forward_accept(iface: str) -> str:
    if forward_accept_exists(iface):
        return "já existia"
    run(["iptables", "-I", "ufw-before-forward", "1", "-i", iface, "-j", "ACCEPT"])
    return "injetado"


def remove_forward_accept(iface: str) -> int:
    removed = 0
    while True:
        result = run(
            ["iptables", "-D", "ufw-before-forward", "-i", iface, "-j", "ACCEPT"],
            check=False, capture=True,
        )
        if result.returncode != 0:
            break
        removed += 1
    return removed


def delete_nat_redirect(iface: str) -> int:
    removed = 0
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
            removed += 1
    return removed


def add_nat_redirect(iface: str) -> None:
    for pos, proto in enumerate(("tcp", "udp"), start=1):
        run(
            ["iptables", "-t", "nat", "-I", "PREROUTING", str(pos),
             "-i", iface, "-p", proto, "--dport", "53",
             "-j", "REDIRECT", "--to-ports", "53"],
            check=False,
        )


def clear_qos(iface: str, ifb: str) -> None:
    for cmd in [
        ["tc", "qdisc", "del", "dev", iface, "root"],
        ["tc", "qdisc", "del", "dev", iface, "ingress"],
        ["tc", "qdisc", "del", "dev", ifb, "root"],
    ]:
        run(cmd, check=False, capture=True)


# ─── Bypass total ────────────────────────────────────────────────────────────

def activate_all() -> None:
    log("=" * 60)
    log("BYPASS TOTAL INICIADO — todas as VLANs gerenciadas")
    log("=" * 60)

    for vlan_id in ORDERED_VLANS:
        v = VLANS[vlan_id]
        iface = v["iface"]
        ifb   = v["ifb"]
        label = v["label"]

        log(f"  VLAN {vlan_id:>2} ({label:<12}) [{iface}]")

        status_fw = inject_forward_accept(iface)
        log(f"    FORWARD  → {status_fw}")

        removed_nat = delete_nat_redirect(iface)
        log(f"    DNS NAT  → {removed_nat} regra(s) removida(s)")

        clear_qos(iface, ifb)
        log(f"    QoS      → tc limpo ({iface} + {ifb})")

    log("-" * 60)
    log("BYPASS TOTAL ATIVO em todas as VLANs.")
    log("Reboot restaura o estado UFW persistente (failsafe automático).")
    log("Use --undo para restaurar enforcement sem reboot.")
    log("=" * 60)
    _print_forward_summary()
    _print_nat_summary()


def undo_all() -> None:
    log("=" * 60)
    log("DESFAZENDO bypass total — restaurando enforcement")
    log("=" * 60)

    for vlan_id in ORDERED_VLANS:
        v = VLANS[vlan_id]
        iface = v["iface"]
        label = v["label"]

        log(f"  VLAN {vlan_id:>2} ({label:<12}) [{iface}]")

        removed_fw = remove_forward_accept(iface)
        log(f"    FORWARD  → {removed_fw} regra(s) ACCEPT removida(s)")

        add_nat_redirect(iface)
        log(f"    DNS NAT  → redirect DNS restaurado (UDP+TCP porta 53)")

        log(f"    QoS      → NÃO restaurado automaticamente (re-aplique via SGCG > QoS)")

    log("-" * 60)
    log("ENFORCEMENT RESTAURADO em todas as VLANs.")
    log("QoS: re-aplique via SGCG > Controle de Rede > QoS > Reconciliar runtime.")
    log("=" * 60)
    _print_forward_summary()
    _print_nat_summary()


# ─── Status ──────────────────────────────────────────────────────────────────

def _print_forward_summary() -> None:
    print()
    print("─" * 60)
    print("  FORWARD chain (ufw-before-forward) — regras de VLAN")
    print("─" * 60)
    result = run(
        ["iptables", "-L", "ufw-before-forward", "-n", "--line-numbers"],
        check=False, capture=True,
    )
    for line in result.stdout.splitlines():
        if any(v["iface"] in line for v in VLANS.values()) or "Chain" in line or "target" in line:
            print(f"  {line}")
    print()


def _print_nat_summary() -> None:
    print("─" * 60)
    print("  NAT PREROUTING — redirects DNS ativos")
    print("─" * 60)
    result = run(["iptables", "-t", "nat", "-L", "PREROUTING", "-n"], check=False, capture=True)
    lines = [
        line for line in result.stdout.splitlines()
        if "Chain" in line or "target" in line
        or any(v["iface"] in line for v in VLANS.values())
    ]
    if not lines:
        print("  (nenhum redirect DNS ativo)")
    for line in lines:
        print(f"  {line}")
    print()


# ─── Main ────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Bypass total de enforcement para TODAS as VLANs (runtime-only, sem reload).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Exemplo:\n"
            "  sudo python3 bypass_all_vlans.py         # ativa bypass em todas as VLANs\n"
            "  sudo python3 bypass_all_vlans.py --undo  # restaura enforcement\n"
            "\n"
            "Para uma VLAN específica, use: bypass_vlan.py <vlan_id>"
        ),
    )
    parser.add_argument(
        "--undo", action="store_true",
        help="Remove o bypass e restaura o enforcement em todas as VLANs.",
    )
    args = parser.parse_args()

    if args.undo:
        undo_all()
    else:
        activate_all()


if __name__ == "__main__":
    main()
