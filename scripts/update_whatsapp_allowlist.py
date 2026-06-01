#!/usr/bin/env python3
"""
update_whatsapp_allowlist.py — Atualiza o ipset sgcg_whatsapp_allowed com os IPs
atuais dos domínios do WhatsApp que se sobrepõem aos ranges Meta bloqueados.

Por que este script existe:
  O WhatsApp (Meta) compartilha ranges de IP com Facebook e Instagram (AS32934).
  Não é possível distinguir WhatsApp de Facebook/Instagram apenas por range — os IPs
  convivem na mesma /24. O ipset sgcg_whatsapp_allowed tem ACCEPT antes do
  sgcg_social_blocked, permitindo o WhatsApp enquanto bloqueia o restante.
  Como os IPs da Meta rodam com load balancing e mudam com frequência, este script
  resolve os domínios e atualiza o allowlist. Executar periodicamente (cron).

Uso:
  python3 update_whatsapp_allowlist.py
  # Ideal: adicionar ao crontab para rodar a cada 6h:
  # 0 */6 * * * python3 /opt/controlebeckercorp-v8/scripts/update_whatsapp_allowlist.py >> /var/log/sgcg_whatsapp_allowlist.log 2>&1
"""

import subprocess
import sys
import os
import ipaddress
from datetime import datetime

IPSET_NAME = "sgcg_whatsapp_allowed"
SOCIAL_BLOCKED_SET = "sgcg_social_blocked"
DNS_RESOLVERS = [
    "127.0.0.1",       # Unbound local — mesmo caminho DNS usado pelos clientes
    "208.67.222.222",  # OpenDNS — livre em todas as VLANs
    "1.1.1.1",         # Cloudflare — cobre rotacoes distintas de CDN/Meta
]
PROJECT_ROOT = os.environ.get("PROJECT_ROOT", "/opt/controlebeckercorp-v8")
DB_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://postgres:change_me@127.0.0.1:5432/controlebeckercorp_v8",
)

WHATSAPP_TCP_PORTS = ["4244", "5222", "5223", "5228", "5242", "50318", "59234"]
WHATSAPP_UDP_PORTS = ["3478", "34784", "45395", "50318", "59234"]

# Domínios do WhatsApp que podem resolver para IPs dentro dos ranges Meta bloqueados
WHATSAPP_DOMAINS = [
    "acs.whatsapp.com",
    "api.whatsapp.com",
    "api.whatsapp.net",
    "chat-fallback.cdn.whatsapp.net",
    "chat.cdn.whatsapp.net",
    "crashlogs.whatsapp.net",
    "dit.whatsapp.net",
    "flows.whatsapp.net",
    "g-fallback.whatsapp.net",
    "g.whatsapp.net",
    "graph.whatsapp.com",
    "graph.whatsapp.net",
    "media-gig4-1.cdn.whatsapp.net",
    "media-gig4-2.cdn.whatsapp.net",
    "media-gru1-1.cdn.whatsapp.net",
    "media-gru1-2.cdn.whatsapp.net",
    "media-gru2-1.cdn.whatsapp.net",
    "media-gru2-2.cdn.whatsapp.net",
    "media-poa1-1.cdn.whatsapp.net",
    "media-sea1-1.cdn.whatsapp.net",
    "media-sea5-1.cdn.whatsapp.net",
    "media.whatsapp.net",
    "mmg-fallback.whatsapp.net",
    "mmg.whatsapp.net",
    "mmx-ds-fallback.cdn.whatsapp.net",
    "mmx-ds.cdn.whatsapp.net",
    "pps.whatsapp.net",
    "scontent.whatsapp.net",
    "sonar-gru.cdn.whatsapp.net",
    "static.whatsapp.net",
    "v.whatsapp.net",
    "wa.me",
    "web.whatsapp.com",
    "webtp.whatsapp.net",
    "whatsapp.com",
    "whatsapp.net",
    # Dependências Meta usadas pelo WhatsApp Web/sessão. Sem esses hosts,
    # o bloqueio amplo de facebook.com pode quebrar login, push e mídia.
    "api.facebook.com",
    "b-graph.facebook.com",
    "chat-e2ee-mini.facebook.com",
    "connect.facebook.net",
    "dgw-mini.c10r.facebook.com",
    "edge-mqtt.facebook.com",
    "edge-mqtt-fallback.facebook.com",
    "ep7.facebook.com",
    "gateway.facebook.com",
    "graph.facebook.com",
    "graph-fallback.facebook.com",
    "mqtt.fallback.c10r.facebook.com",
    "mqtt.c10r.facebook.com",
    "star.c10r.facebook.com",
    "star.fallback.c10r.facebook.com",
    "z-m-gateway.facebook.com",
    "z-p42-chat-e2ee-ig.facebook.com",
]

WHATSAPP_DOMAINS.extend([f"e{i}.whatsapp.net" for i in range(1, 17)])


def resolve(domain: str) -> list[str]:
    ips: list[str] = []
    for resolver in DNS_RESOLVERS:
        result = subprocess.run(
            ["dig", f"@{resolver}", domain, "A", "+short"],
            capture_output=True, text=True
        )
        for line in result.stdout.splitlines():
            value = line.strip()
            if not value or value.endswith("."):
                continue
            try:
                ipaddress.IPv4Address(value)
            except ValueError:
                print(f"  [AVISO] resposta DNS ignorada para {domain} via {resolver}: {value}")
                continue
            if value not in ips:
                ips.append(value)
    return ips


def is_in_blocked_set(ip: str) -> bool:
    r = subprocess.run(["ipset", "test", SOCIAL_BLOCKED_SET, ip], capture_output=True)
    return r.returncode == 0


def social_blocked_set_has_entries() -> bool:
    result = subprocess.run(["ipset", "list", SOCIAL_BLOCKED_SET], capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  [AVISO] ipset {SOCIAL_BLOCKED_SET} ausente; usando allowlist completa resolvida para WhatsApp.")
        return False
    for line in result.stdout.splitlines():
        if line.startswith("Number of entries:"):
            try:
                entries = int(line.split(":", 1)[1].strip())
                if entries == 0:
                    print(f"  [AVISO] ipset {SOCIAL_BLOCKED_SET} vazio; usando allowlist completa resolvida para WhatsApp.")
                return entries > 0
            except ValueError:
                return True
    return True


def recent_whatsapp_domains() -> list[str]:
    try:
        import psycopg2

        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            SELECT DISTINCT lower(query_name)
            FROM dns_policy_events
            WHERE occurred_at > now() - interval '7 days'
              AND query_name ILIKE '%whatsapp%'
              AND query_name NOT LIKE '\\_%'
            ORDER BY lower(query_name)
            LIMIT 250
        """)
        rows = [row[0].strip(".") for row in cur.fetchall() if row[0]]
        conn.close()
        return rows
    except Exception as e:
        print(f"  [AVISO] Não foi possível consultar domínios recentes no radar: {e}")
        return []


def ensure_forward_rule(proto: str, ports: list[str], comment: str):
    rules = subprocess.run(["iptables", "-S", "FORWARD"], capture_output=True, text=True).stdout
    if comment in rules:
        print(f"  Regra {comment} já existe.")
        return

    check_cmd = [
        "iptables", "-C", "FORWARD",
        "-p", proto,
        "-m", "multiport", "--dports", ",".join(ports),
        "-m", "set", "--match-set", IPSET_NAME, "dst",
        "-j", "ACCEPT",
    ]
    if subprocess.run(check_cmd, capture_output=True).returncode == 0:
        print(f"  Regra {comment} já existe.")
        return

    subprocess.run([
        "iptables", "-I", "FORWARD", "2",
        "-p", proto,
        "-m", "multiport", "--dports", ",".join(ports),
        "-m", "set", "--match-set", IPSET_NAME, "dst",
        "-m", "comment", "--comment", comment,
        "-j", "ACCEPT",
    ], check=True)
    print(f"  + Regra {comment} inserida antes dos DROPs sociais.")


def ensure_whatsapp_return_rule():
    comment = "SGCG WHATSAPP RETURN ALLOW"
    rules = subprocess.run(["iptables", "-S", "FORWARD"], capture_output=True, text=True).stdout
    if comment in rules:
        print(f"  Regra {comment} já existe.")
        return

    check_cmd = [
        "iptables", "-C", "FORWARD",
        "-i", "enp8s0",
        "-o", "enp6s0+",
        "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED",
        "-m", "set", "--match-set", IPSET_NAME, "src",
        "-j", "ACCEPT",
    ]
    if subprocess.run(check_cmd, capture_output=True).returncode == 0:
        print(f"  Regra {comment} já existe.")
        return

    subprocess.run([
        "iptables", "-I", "FORWARD", "1",
        "-i", "enp8s0",
        "-o", "enp6s0+",
        "-m", "conntrack", "--ctstate", "ESTABLISHED,RELATED",
        "-m", "set", "--match-set", IPSET_NAME, "src",
        "-m", "comment", "--comment", comment,
        "-j", "ACCEPT",
    ], check=True)
    print(f"  + Regra {comment} inserida antes do SGCG_GUARD.")


def ensure_whatsapp_allow_rule():
    rules = subprocess.run(["iptables", "-S", "FORWARD"], capture_output=True, text=True).stdout
    if f"--match-set {IPSET_NAME} dst" in rules and "SGCG WHATSAPP ALLOW" in rules:
        print("  Regra SGCG WHATSAPP ALLOW já existe.")
        return

    subprocess.run([
        "iptables", "-I", "FORWARD", "1",
        "-m", "set", "--match-set", IPSET_NAME, "dst",
        "-m", "comment", "--comment", "SGCG WHATSAPP ALLOW",
        "-j", "ACCEPT"
    ], check=True)
    print("  Regra ACCEPT reinserida no FORWARD.")


def ensure_whatsapp_call_rules():
    # Chamadas do WhatsApp usam sinalização TCP própria e mídia UDP/STUN/TURN.
    # Estas regras ficam antes do DROP dos ranges Meta, sem liberar TCP/443 amplo.
    ensure_forward_rule("tcp", WHATSAPP_TCP_PORTS, "SGCG WHATSAPP CALL TCP ALLOW")
    ensure_forward_rule("udp", WHATSAPP_UDP_PORTS, "SGCG WHATSAPP CALL UDP ALLOW")


def main():
    if os.geteuid() != 0:
        print("Erro: precisa de root.")
        sys.exit(1)

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Atualizando allowlist do WhatsApp...")

    domains = sorted(set(WHATSAPP_DOMAINS + recent_whatsapp_domains()))
    print(f"  Domínios avaliados: {len(domains)}")

    require_social_overlap = social_blocked_set_has_entries()

    # Coletar IPs atuais do WhatsApp. Quando o ipset social existe, restringe ao
    # overlap Meta bloqueado; quando ele está ausente/vazio, evita allowlist vazia.
    whatsapp_blocked_ips: set[str] = set()
    for domain in domains:
        ips = resolve(domain)
        for ip in ips:
            if not require_social_overlap or is_in_blocked_set(ip):
                whatsapp_blocked_ips.add(ip)
                reason = "dentro do range bloqueado" if require_social_overlap else "allow preventivo"
                print(f"  {domain} → {ip} ({reason}, adicionar ao allow)")
            else:
                print(f"  {domain} → {ip} (fora do range bloqueado, OK)")

    # Criar o ipset se não existir
    subprocess.run(["ipset", "create", IPSET_NAME, "hash:ip", "comment"], capture_output=True)

    # Buscar IPs atuais no ipset
    result = subprocess.run(["ipset", "list", IPSET_NAME], capture_output=True, text=True)
    current_ips: set[str] = set()
    for line in result.stdout.splitlines():
        parts = line.split()
        if parts and parts[0].count('.') == 3:
            current_ips.add(parts[0])

    # Adicionar novos
    for ip in whatsapp_blocked_ips - current_ips:
        subprocess.run(["ipset", "add", IPSET_NAME, ip, "comment", "whatsapp"])
        print(f"  + Adicionado: {ip}")

    if os.environ.get("PRUNE_WHATSAPP_ALLOWLIST") == "1":
        for ip in current_ips - whatsapp_blocked_ips:
            if is_in_blocked_set(ip):
                subprocess.run(["ipset", "del", IPSET_NAME, ip], capture_output=True)
                print(f"  - Removido (não mais em uso): {ip}")
    elif current_ips - whatsapp_blocked_ips:
        print(f"  Mantidos {len(current_ips - whatsapp_blocked_ips)} IPs anteriores para evitar quebra por rotação/CDN.")

    # Salvar
    subprocess.run(["ipset", "save"], stdout=open("/etc/ipset.conf", "w"))
    print(f"  ipset.conf atualizado. Novos/atuais resolvidos: {len(whatsapp_blocked_ips)} IPs.")

    ensure_whatsapp_allow_rule()
    ensure_whatsapp_return_rule()
    ensure_whatsapp_call_rules()

    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Concluído.")


if __name__ == "__main__":
    main()
