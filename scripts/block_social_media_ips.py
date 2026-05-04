#!/usr/bin/env python3
"""
block_social_media_ips.py — Bloqueio por range de IP das redes sociais para VLANs gerenciadas.

Por que isso é necessário:
  Apps Android (Instagram, Facebook, TikTok) mantêm sessões HTTPS persistentes com TTL
  de até 5 dias no conntrack. Mesmo com DNS bloqueado (RPZ) e DoH/QUIC bloqueados,
  o app não precisa de DNS para reconectar — ele usa IPs em cache ou hardcoded.
  Este script cria um ipset com os ranges conhecidos de Facebook/Meta (AS32934) e
  TikTok/ByteDance (AS396986, AS138699), bloqueia via iptables FORWARD e derruba as
  sessões ativas existentes via conntrack.

Ranges bloqueados:
  Facebook/Meta (AS32934):
    157.240.0.0/16   — range principal do Facebook
    31.13.64.0/18    — Facebook Ireland
    57.144.0.0/14    — Meta (cobre .66, .136, .164, .232 confirmados via conntrack)
    179.60.192.0/22  — Meta Brasil (WhatsApp/Messenger)
    185.89.216.0/22  — Meta infra
    163.70.128.0/17  — Meta
    129.134.0.0/17   — Meta

  TikTok/ByteDance (AS396986, AS138699):
    71.18.0.0/18     — ByteDance/TikTok (cobre .24, .42, .251 confirmados via conntrack)

Não confundir com bloqueio DNS: este script atua na camada de rede (Layer 3/4).
VIPs registrados NO recebem ALLOW antes do ipset DROP.
"""

import subprocess
import sys
import os
from datetime import datetime

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

IPSET_NAME = "sgcg_social_blocked"
WHATSAPP_IPSET_NAME = "sgcg_whatsapp_allowed"
WAN_IFACE  = "enp8s0"

WHATSAPP_TCP_PORTS = ["4244", "5222", "5223", "5228", "5242", "50318", "59234"]
WHATSAPP_UDP_PORTS = ["3478", "34784", "45395", "50318", "59234"]

MANAGED_VLANS = {
    10: ("enp6s0.10", "192.168.10.0/24"),
    30: ("enp6s0.30", "192.168.30.0/24"),
    50: ("enp6s0.50", "192.168.50.0/24"),
    70: ("enp6s0.70", "192.168.70.0/24"),
}

SOCIAL_IP_RANGES = [
    # Facebook / Meta — AS32934
    ("157.240.0.0/16",   "Meta principal"),
    ("31.13.64.0/18",    "Meta Ireland"),
    ("57.144.0.0/14",    "Meta CDN"),
    ("179.60.192.0/22",  "Meta Brasil"),
    ("185.89.216.0/22",  "Meta infra"),
    ("163.70.128.0/17",  "Meta"),
    ("129.134.0.0/17",   "Meta"),
    # TikTok / ByteDance — AS396986, AS138699
    # /16 necessário: confirmado via conntrack 71.18.24.x, 71.18.42.x, 71.18.122.x, 71.18.251.x
    ("71.18.0.0/16",     "TikTok/ByteDance"),
]

PROJECT_ROOT = os.environ.get("PROJECT_ROOT", "/opt/controlebeckercorp-v8")
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


def get_vip_ips() -> list[str]:
    try:
        import psycopg2
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT host(ip)::text FROM policy_exceptions
            WHERE active = true AND masklen(ip) = 32
              AND (valid_until IS NULL OR valid_until >= NOW())
            UNION
            SELECT DISTINCT cidr::text FROM dns_vip WHERE ativo = true
        """)
        rows = cur.fetchall()
        conn.close()
        return [r[0] for r in rows]
    except Exception as e:
        print(f"  [AVISO] Não foi possível consultar VIPs: {e}")
        return []


# ---------------------------------------------------------------------------
# Etapas
# ---------------------------------------------------------------------------

def step_create_ipset():
    print("\n[1/5] Criando/atualizando ipset...")
    # Criar o set (ignora se já existe)
    run(["ipset", "create", IPSET_NAME, "hash:net", "comment"], check=False)
    # Adicionar todos os ranges
    for cidr, label in SOCIAL_IP_RANGES:
        result = run(["ipset", "add", IPSET_NAME, cidr, "comment", label, "-exist"], check=False)
        if result.returncode != 0:
            print(f"    [AVISO] {cidr}: {result.stderr.strip()}")


def step_add_vip_whitelists(vip_ips: list[str]):
    """VIPs precisam de regras ACCEPT antes do DROP do ipset."""
    if not vip_ips:
        print("\n[3/5] Sem VIPs para liberar.")
        return
    print(f"\n[3/5] Adicionando ACCEPT de VIPs ({len(vip_ips)}) antes do DROP...")
    for ip in vip_ips:
        # Verifica se já existe
        chk = subprocess.run(
            ["iptables", "-C", "FORWARD", "-s", ip, "-m", "set", "--match-set", IPSET_NAME, "dst",
             "-j", "ACCEPT"],
            capture_output=True
        )
        if chk.returncode == 0:
            print(f"  {ip}: regra ACCEPT já existe, pulando.")
            continue
        run(["iptables", "-I", "FORWARD", "1",
             "-s", ip,
             "-m", "set", "--match-set", IPSET_NAME, "dst",
             "-m", "comment", "--comment", f"VIP SOCIAL ALLOW {ip}",
             "-j", "ACCEPT"])


def ensure_whatsapp_allow_rules():
    """Preserva WhatsApp e chamadas antes dos DROPs por range Meta."""
    print("\n[2/5] Garantindo exceções operacionais do WhatsApp antes dos DROPs...")
    rules = subprocess.run(["iptables", "-S", "FORWARD"], capture_output=True, text=True).stdout

    if f"--match-set {WHATSAPP_IPSET_NAME} dst" not in rules:
        run(["iptables", "-I", "FORWARD", "1",
             "-m", "set", "--match-set", WHATSAPP_IPSET_NAME, "dst",
             "-m", "comment", "--comment", "SGCG WHATSAPP ALLOW",
             "-j", "ACCEPT"])
    else:
        print("  SGCG WHATSAPP ALLOW já existe.")

    if "SGCG WHATSAPP CALL UDP ALLOW" not in rules:
        run(["iptables", "-I", "FORWARD", "2",
             "-p", "udp",
             "-m", "multiport", "--dports", ",".join(WHATSAPP_UDP_PORTS),
             "-m", "set", "--match-set", IPSET_NAME, "dst",
             "-m", "comment", "--comment", "SGCG WHATSAPP CALL UDP ALLOW",
             "-j", "ACCEPT"])
    else:
        print("  SGCG WHATSAPP CALL UDP ALLOW já existe.")

    if "SGCG WHATSAPP CALL TCP ALLOW" not in rules:
        run(["iptables", "-I", "FORWARD", "3",
             "-p", "tcp",
             "-m", "multiport", "--dports", ",".join(WHATSAPP_TCP_PORTS),
             "-m", "set", "--match-set", IPSET_NAME, "dst",
             "-m", "comment", "--comment", "SGCG WHATSAPP CALL TCP ALLOW",
             "-j", "ACCEPT"])
    else:
        print("  SGCG WHATSAPP CALL TCP ALLOW já existe.")


def count_forward_rules_with(fragment: str) -> int:
    result = subprocess.run(["iptables", "-L", "FORWARD", "-n", "--line-numbers"],
                            capture_output=True, text=True)
    return sum(1 for line in result.stdout.splitlines() if fragment in line)


def step_add_forward_drop():
    """
    Adiciona DROP no FORWARD para cada VLAN → ipset.
    Os DROP devem vir DEPOIS dos ACCEPT de VIPs para que VIPs não sejam bloqueados.
    Insere na posição imediatamente após o último VIP ALLOW.
    """
    print("\n[4/5] Adicionando DROP FORWARD por VLAN → ipset...")
    # Descobrir posição após as exceções do WhatsApp e os VIPs.
    whatsapp_count = (
        count_forward_rules_with("SGCG WHATSAPP ALLOW")
        + count_forward_rules_with("SGCG WHATSAPP CALL UDP ALLOW")
        + count_forward_rules_with("SGCG WHATSAPP CALL TCP ALLOW")
    )
    vip_count = count_forward_rules_with("VIP SOCIAL ALLOW")
    insert_pos = whatsapp_count + vip_count + 1

    for vlan_id, (iface, subnet) in MANAGED_VLANS.items():
        comment = f"SGCG SOCIAL BLOCK VLAN{vlan_id}"
        # Verificar se regra já existe
        chk = subprocess.run(
            ["iptables", "-C", "FORWARD",
             "-i", iface, "-s", subnet,
             "-m", "set", "--match-set", IPSET_NAME, "dst",
             "-j", "DROP"],
            capture_output=True
        )
        if chk.returncode == 0:
            print(f"  VLAN {vlan_id}: regra DROP já existe, pulando.")
            continue
        run(["iptables", "-I", "FORWARD", str(insert_pos),
             "-i", iface, "-s", subnet,
             "-m", "set", "--match-set", IPSET_NAME, "dst",
             "-m", "comment", "--comment", comment,
             "-j", "DROP"])
        insert_pos += 1  # próximo DROP vai depois deste


def step_flush_conntrack():
    """Derruba todas as sessões ativas das VLANs gerenciadas para IPs de redes sociais."""
    print("\n[5/5] Derrubando sessões conntrack ativas para IPs de redes sociais...")
    flushed = 0
    for _, (_, subnet) in MANAGED_VLANS.items():
        for cidr, label in SOCIAL_IP_RANGES:
            result = subprocess.run(
                ["conntrack", "-D", "-s", subnet, "-d", cidr],
                capture_output=True, text=True
            )
            if result.returncode == 0 and result.stdout.strip():
                lines = result.stdout.strip().splitlines()
                print(f"  {subnet} → {cidr} ({label}): {len(lines)} sessões removidas")
                flushed += len(lines)
    # Também flush específico por src da VLAN 50 (o caso reportado)
    for _, (_, subnet) in MANAGED_VLANS.items():
        result = subprocess.run(
            ["conntrack", "-D", "-s", subnet, "-p", "tcp", "--dport", "443"],
            capture_output=True, text=True
        )
        result2 = subprocess.run(
            ["conntrack", "-D", "-s", subnet, "-p", "udp", "--dport", "443"],
            capture_output=True, text=True
        )
    print(f"  Total de sessões derrubadas: {flushed}")


def step_persist():
    """Persiste as regras do ipset para sobreviver a reboot via iptables-save."""
    print("\n  Salvando ipset e regras iptables...")
    ipset_dir = os.path.join(PROJECT_ROOT, "backups", "firewall")
    os.makedirs(ipset_dir, exist_ok=True)
    ts = datetime.now().strftime("%Y-%m-%dT%H-%M-%S")

    ipset_file = "/etc/ipset.conf"
    with open(ipset_file, "w") as f:
        result = subprocess.run(["ipset", "save"], capture_output=True, text=True)
        f.write(result.stdout)
    print(f"  ipset persistido em: {ipset_file}")

    # Verificar se ipset-restore está no rc.local ou similar
    restore_marker = "ipset restore"
    rc_local = "/etc/rc.local"
    try:
        content = open(rc_local).read() if os.path.exists(rc_local) else ""
        if restore_marker not in content:
            print(f"  [AVISO] Adicione ao {rc_local}: ipset restore < {ipset_file}")
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    if os.geteuid() != 0:
        print("Erro: precisa de root.")
        sys.exit(1)

    # Verificar ipset disponível
    if subprocess.run(["which", "ipset"], capture_output=True).returncode != 0:
        print("Erro: ipset não encontrado. Instalar com: apt install ipset")
        sys.exit(1)

    print("=" * 70)
    print("  SGCG — Bloqueio por IP de Redes Sociais (Layer 3)")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)
    print(f"\n  Ranges: {len(SOCIAL_IP_RANGES)} prefixos (Meta AS32934 + TikTok AS396986/138699)")
    print(f"  VLANs : {list(MANAGED_VLANS.keys())}")

    vips = get_vip_ips()
    print(f"  VIPs  : {vips or 'nenhum'}")

    step_create_ipset()
    ensure_whatsapp_allow_rules()
    step_add_vip_whitelists(vips)
    step_add_forward_drop()
    step_flush_conntrack()
    step_persist()

    print()
    print("=" * 70)
    print("  Concluído. Sessões ativas derrubadas.")
    print("  Novas conexões para IPs de redes sociais serão bloqueadas.")
    print("  Testar: os apps devem perder conexão em 30-60 segundos.")
    print("=" * 70)


if __name__ == "__main__":
    main()
