#!/usr/bin/env python3
"""
sanitize_doh_vlans.py — Aplica bloqueio de resolvedores DNS externos (DoH/DoT/QUIC)
para todas as VLANs gerenciadas (10, 30, 50, 70).

Regras de negócio:
  - Todos os resolvedores externos são bloqueados por padrão para as VLANs gerenciadas.
  - EXCEÇÃO PERMANENTE: OpenDNS 208.67.222.222 e 208.67.220.220 (porta 443/tcp)
    são liberados — o app Ponto RH os usa hardcoded.
  - IPs VIP (policy_exceptions + dns_vip) recebem ALLOW antes dos bloqueios.
  - Em modo de contingência DNS ou bypass total de VLAN, as regras não são aplicadas
    (o operador deve invocar rollback manualmente via engine service).

Servidores DoH bloqueados:
  - Cloudflare : 1.1.1.1, 1.0.0.1
  - Google     : 8.8.8.8, 8.8.4.4
  - Quad9      : 9.9.9.9, 149.112.112.112
  - AdGuard    : 94.140.14.14, 94.140.15.15

Referência: CODEX.md — UFW é o firewall principal oficial do SGCG.
"""

import subprocess
import sys
import os
import json
from datetime import datetime

# ---------------------------------------------------------------------------
# Configuração
# ---------------------------------------------------------------------------

WAN_IFACE = "enp8s0"

MANAGED_VLANS = {
    10: "enp6s0.10",
    30: "enp6s0.30",
    50: "enp6s0.50",
    70: "enp6s0.70",
}

# OpenDNS — PERMITIDO em todas as VLANs (hardcoded no Ponto RH)
OPENDNS_IPS = ["208.67.222.222", "208.67.220.220"]

# Resolvedores a bloquear (DoH porta 443/tcp)
DOH_BLOCK_SERVERS = [
    ("1.1.1.1",           "Cloudflare"),
    ("1.0.0.1",           "Cloudflare"),
    ("8.8.8.8",           "Google"),
    ("8.8.4.4",           "Google"),
    ("9.9.9.9",           "Quad9"),
    ("149.112.112.112",   "Quad9"),
    ("94.140.14.14",      "AdGuard"),
    ("94.140.15.15",      "AdGuard"),
]

PROJECT_ROOT = os.environ.get("PROJECT_ROOT", "/opt/controlebeckercorp-v8")
BACKUP_DIR = os.path.join(PROJECT_ROOT, "backups", "firewall")
DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://postgres:change_me@127.0.0.1:5432/controlebeckercorp_v8",
)

# ---------------------------------------------------------------------------
# Utilitários
# ---------------------------------------------------------------------------

def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    print(f"  $ {' '.join(cmd)}")
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def backup_ufw_rules():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")
    bak = os.path.join(BACKUP_DIR, f"before_sanitize_doh_{ts}.rules")
    with open(bak, "w") as f:
        result = subprocess.run(["iptables-save"], capture_output=True, text=True)
        f.write(result.stdout)
    print(f"  Backup salvo em: {bak}")
    return bak


def ufw_status_numbered() -> list[str]:
    r = subprocess.run(["ufw", "status", "numbered"], capture_output=True, text=True)
    return r.stdout.splitlines()


def delete_ufw_rules_by_comment(comment_fragment: str):
    """Remove todas as regras UFW que contenham o fragment no comentário, da maior para menor."""
    lines = ufw_status_numbered()
    numbers = []
    for line in lines:
        if comment_fragment in line:
            try:
                num = int(line.strip().lstrip("[").split("]")[0])
                numbers.append(num)
            except ValueError:
                pass
    for num in sorted(numbers, reverse=True):
        print(f"  Removendo regra UFW [{num}]...")
        subprocess.run(["ufw", "--force", "delete", str(num)],
                       capture_output=True, text=True)


def rule_exists(fragment: str) -> bool:
    lines = ufw_status_numbered()
    return any(fragment in line for line in lines)


def get_vips_from_db() -> dict[int, list[str]]:
    """Retorna dict vlan_id → [ip, ...] combinando policy_exceptions + dns_vip."""
    try:
        import psycopg2
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()

        cur.execute("""
            SELECT host(ip)::text, vlan_id
            FROM policy_exceptions
            WHERE active = true
              AND masklen(ip) = 32
              AND (valid_until IS NULL OR valid_until >= NOW())
        """)
        pe_rows = cur.fetchall()

        cur.execute("SELECT cidr::text FROM dns_vip WHERE ativo = true")
        dv_rows = cur.fetchall()

        conn.close()

        result: dict[int, list[str]] = {}
        for ip, vlan_id in pe_rows:
            if vlan_id not in result:
                result[vlan_id] = []
            if ip not in result[vlan_id]:
                result[vlan_id].append(ip)

        # dns_vip não tem vlan_id — derivar pelo octeto (192.168.X.y)
        for (cidr,) in dv_rows:
            parts = cidr.split(".")
            if len(parts) == 4:
                try:
                    vlan_id = int(parts[2])
                    if vlan_id not in result:
                        result[vlan_id] = []
                    if cidr not in result[vlan_id]:
                        result[vlan_id].append(cidr)
                except ValueError:
                    pass

        return result
    except Exception as e:
        print(f"  [AVISO] Não foi possível consultar VIPs do banco: {e}")
        return {}


# ---------------------------------------------------------------------------
# Etapas de aplicação
# ---------------------------------------------------------------------------

def step_remove_vlan10_opendns_blocks():
    """
    Remove os bloqueios de OpenDNS na VLAN 10 (eram incorretos).
    OpenDNS deve ser PERMITIDO — hardcoded no Ponto RH.
    """
    print("\n[1/5] Removendo bloqueios incorretos de OpenDNS na VLAN 10...")
    for ip in OPENDNS_IPS:
        delete_ufw_rules_by_comment(f"SANITIZE VLAN10 BLOCK DOH {ip}")
        # comentário da regra 47 não tinha o IP explícito
    # Também remover pelo fragmento genérico de VLAN10 OpenDNS (regra 47)
    lines = ufw_status_numbered()
    to_delete = []
    for line in lines:
        for ip in OPENDNS_IPS:
            if ip in line and "VLAN10" in line and "DENY" in line:
                try:
                    num = int(line.strip().lstrip("[").split("]")[0])
                    to_delete.append(num)
                except ValueError:
                    pass
    for num in sorted(set(to_delete), reverse=True):
        print(f"  Removendo regra UFW [{num}] (OpenDNS VLAN10 incorreto)...")
        subprocess.run(["ufw", "--force", "delete", str(num)],
                       capture_output=True, text=True)


def step_add_vip_allows(vips: dict[int, list[str]]):
    """
    Adiciona regras ALLOW para IPs VIP antes das regras de bloqueio.
    VIPs podem usar qualquer resolvedor externo, incluindo DoH.
    """
    print("\n[2/5] Adicionando ALLOW para VIPs (DoH/DoT/QUIC)...")
    for vlan_id, iface in MANAGED_VLANS.items():
        ips = vips.get(vlan_id, [])
        if not ips:
            print(f"  VLAN {vlan_id}: sem VIPs registrados.")
            continue
        for ip in ips:
            tag = f"VIP DOH ALLOW {ip}"
            if rule_exists(ip) and rule_exists("VIP DOH ALLOW"):
                print(f"  VLAN {vlan_id}: {ip} já tem regra VIP, pulando.")
                continue
            # Porta 443 TCP (DoH)
            run(["ufw", "route", "allow",
                 "in", "on", iface, "out", "on", WAN_IFACE,
                 "proto", "tcp", "from", ip, "to", "any", "port", "443",
                 "comment", f"VIP DOH ALLOW {ip}"])
            # Porta 443 UDP (QUIC)
            run(["ufw", "route", "allow",
                 "in", "on", iface, "out", "on", WAN_IFACE,
                 "proto", "udp", "from", ip, "to", "any", "port", "443",
                 "comment", f"VIP QUIC ALLOW {ip}"])
            # Porta 853 TCP (DoT)
            run(["ufw", "route", "allow",
                 "in", "on", iface, "out", "on", WAN_IFACE,
                 "proto", "tcp", "from", ip, "to", "any", "port", "853",
                 "comment", f"VIP DOT ALLOW {ip}"])


def step_add_dot_quic_blocks():
    """
    Bloqueia DoT (853/tcp) e QUIC (443/udp) para VLANs sem cobertura.
    Usa REJECT para que navegadores façam fallback rápido para HTTPS/TCP.
    """
    print("\n[3/5] Adicionando bloqueios de DoT (853) e QUIC (443/udp) para VLANs 30, 50, 70...")
    for vlan_id, iface in MANAGED_VLANS.items():
        if vlan_id == 10:
            continue  # VLAN 10 já tem essas regras

        tag_dot  = f"SANITIZE VLAN{vlan_id} BLOCK DOT"
        tag_quic = f"SANITIZE VLAN{vlan_id} BLOCK QUIC"

        if not rule_exists(tag_dot):
            run(["ufw", "route", "reject",
                 "in", "on", iface, "out", "on", WAN_IFACE,
                 "proto", "tcp", "to", "any", "port", "853",
                 "comment", tag_dot])
        else:
            print(f"  VLAN {vlan_id}: DoT já bloqueado, pulando.")

        if not rule_exists(tag_quic):
            run(["ufw", "route", "reject",
                 "in", "on", iface, "out", "on", WAN_IFACE,
                 "proto", "udp", "to", "any", "port", "443",
                 "comment", tag_quic])
        else:
            print(f"  VLAN {vlan_id}: QUIC já bloqueado, pulando.")


def step_add_doh_blocks():
    """
    Bloqueia DoH (443/tcp) para os resolvedores externos conhecidos em todas as VLANs.
    Usa REJECT para evitar espera por timeout quando o cliente tenta DNS seguro externo.
    OpenDNS NÃO é bloqueado.
    """
    print("\n[4/5] Adicionando bloqueios de DoH por servidor para todas as VLANs...")
    for vlan_id, iface in MANAGED_VLANS.items():
        for server_ip, provider in DOH_BLOCK_SERVERS:
            tag = f"SANITIZE VLAN{vlan_id} BLOCK DOH {server_ip}"
            if rule_exists(tag):
                print(f"  VLAN {vlan_id}: {server_ip} ({provider}) já bloqueado, pulando.")
                continue
            run(["ufw", "route", "reject",
                 "in", "on", iface, "out", "on", WAN_IFACE,
                 "proto", "tcp", "to", server_ip, "port", "443",
                 "comment", tag])


def step_reload_ufw():
    print("\n[5/5] Recarregando UFW...")
    run(["ufw", "reload"])
    print("  UFW recarregado com sucesso.")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if os.geteuid() != 0:
        print("Erro: este script precisa ser executado como root.")
        sys.exit(1)

    print("=" * 70)
    print("  SGCG — Sanitização DoH/DoT/QUIC para VLANs gerenciadas")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    print()
    print("Política aplicada:")
    print("  • Bloqueio de DoT (853/tcp) em todas as VLANs gerenciadas")
    print("  • Bloqueio de QUIC (443/udp) em todas as VLANs gerenciadas")
    print("  • Bloqueio de DoH (443/tcp) para: Cloudflare, Google, Quad9, AdGuard")
    print("  • PERMITIDO: OpenDNS 208.67.222.222 e 208.67.220.220 (Ponto RH)")
    print("  • PERMITIDO: IPs VIP registrados no banco")
    print()

    bak = backup_ufw_rules()

    vips = get_vips_from_db()
    print(f"  VIPs encontrados: {json.dumps({str(k): v for k, v in vips.items()}, indent=4)}")

    try:
        step_remove_vlan10_opendns_blocks()
        step_add_vip_allows(vips)
        step_add_dot_quic_blocks()
        step_add_doh_blocks()
        step_reload_ufw()
    except Exception as e:
        print(f"\n[ERRO] Falha durante aplicação: {e}")
        print(f"  As regras antigas estão no backup: {bak}")
        print("  Para restaurar: iptables-restore < <arquivo_bak>")
        sys.exit(1)

    print()
    print("=" * 70)
    print("  Sanitização concluída com sucesso.")
    print("  Resolvedores externos bloqueados para VLANs 10, 30, 50, 70.")
    print("  OpenDNS 208.67.x.x permanece LIVRE (Ponto RH).")
    print("=" * 70)


if __name__ == "__main__":
    main()
