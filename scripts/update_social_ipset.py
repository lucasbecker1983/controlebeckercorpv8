#!/usr/bin/env python3
"""
update_social_ipset.py --rebuild — Lista dinâmica de IPs de Facebook, Instagram e TikTok (ipset sgcg_social_dynamic).

Por que existe:
  As faixas fixas da Meta e da ByteDance (sgcg_social_blocked) não cobrem tudo:
  - a Meta instala caches dentro das operadoras ("*.fna.fbcdn.net"), com IPs da própria operadora;
  - o TikTok roda também em nuvens de terceiros (Alibaba, Oracle).
  Os apps conectam direto nesses IPs, sem passar pelo DNS bloqueado.

Como funciona:
  Pega os nomes dessas redes que os aparelhos tentaram acessar nos últimos 2 dias (o DNS registra mesmo quando
  bloqueia), descobre o IP verdadeiro pelo DNS dos VIPs (127.0.0.1:5355, sem filtro), guarda cada IP por 7 dias
  (/var/lib/sgcg/social_ips.json) e troca a lista de forma atômica. Ficam de fora:
  - IPs da lista do WhatsApp (sgcg_whatsapp_allowed);
  - IPs de CDNs compartilhadas por milhares de sites (Cloudflare, Google, Akamai, Fastly, Amazon, Microsoft),
    para não derrubar outros sites.
  O reconciliador do proxy roda este script a cada 3 minutos.
"""

import ipaddress
import json
import os
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

IPSET_NAME = "sgcg_social_dynamic"
WHATSAPP_SET = "sgcg_whatsapp_allowed"
STATE_FILE = "/var/lib/sgcg/social_ips.json"
KEEP_DAYS = 7
CLEAN_DNS = ("127.0.0.1", "5355")
PROJECT_ROOT = os.environ.get("PROJECT_ROOT", "/opt/controlebeckercorp-v8")
SOCIAL_NAME_REGEX = (
    r"(instagram\.com|cdninstagram\.com|fbcdn\.net|facebook\.com|facebook\.net|fbsbx\.com|messenger\.com|"
    r"tiktok|tiktokv|tiktokcdn|ttdns2\.com|byteoversea|bytedance|ibyteimg|ibytedtos|byteimg|bytefcdn|ttwstatic|"
    r"musical\.ly|snssdk|amemv|muscdn|kwai|kuaishou|kwimgs)"
)
# CDNs compartilhadas: nunca entram (bloquear um IP delas derrubaria outros sites).
SHARED_CDN = [ipaddress.ip_network(n) for n in [
    "104.16.0.0/13", "172.64.0.0/13", "162.158.0.0/15", "188.114.96.0/20", "141.101.64.0/18", "108.162.192.0/18",  # Cloudflare
    "142.250.0.0/15", "172.217.0.0/16", "172.253.0.0/16", "216.58.192.0/19", "74.125.0.0/16", "64.233.160.0/19",
    "34.0.0.0/9", "35.184.0.0/13", "8.8.4.0/24", "8.8.8.0/24",  # Google
    "2.16.0.0/13", "23.0.0.0/12", "23.32.0.0/11", "23.64.0.0/14", "104.64.0.0/10", "184.24.0.0/13", "92.122.0.0/15",  # Akamai
    "151.101.0.0/16", "199.232.0.0/16", "146.75.0.0/16",  # Fastly
    "13.32.0.0/15", "13.224.0.0/14", "18.64.0.0/14", "52.84.0.0/15", "54.192.0.0/16", "99.84.0.0/16", "143.204.0.0/16",  # CloudFront
    "13.107.0.0/16", "20.0.0.0/8", "40.64.0.0/10",  # Microsoft
]]
PRIVATE = [ipaddress.ip_network(n) for n in ["0.0.0.0/8", "10.0.0.0/8", "127.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "100.64.0.0/10"]]


def load_db_url() -> str:
    env_file = os.path.join(PROJECT_ROOT, "backend", ".env")
    with open(env_file, encoding="utf-8") as handle:
        for line in handle:
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("DATABASE_URL ausente no backend/.env")


def recent_social_names() -> list:
    import psycopg2
    conn = psycopg2.connect(load_db_url())
    cur = conn.cursor()
    cur.execute(
        """
        SELECT lower(query_name), COUNT(*) AS n
        FROM dns_policy_events
        WHERE occurred_at > now() - interval '2 days'
          AND query_name ~* %s
          AND query_name !~* 'whatsapp'
        GROUP BY 1 ORDER BY n DESC LIMIT 600
        """,
        (SOCIAL_NAME_REGEX,),
    )
    names = [r[0].strip(".") for r in cur.fetchall() if r[0]]
    conn.close()
    return names


def resolve(name: str) -> list:
    r = subprocess.run(["dig", f"@{CLEAN_DNS[0]}", "-p", CLEAN_DNS[1], name, "A", "+short", "+time=2", "+tries=1"],
                       capture_output=True, text=True)
    out = []
    for line in r.stdout.splitlines():
        try:
            out.append(str(ipaddress.IPv4Address(line.strip())))
        except ValueError:
            pass
    return out


def in_set(setname: str, ip: str) -> bool:
    return subprocess.run(["ipset", "test", setname, ip], capture_output=True).returncode == 0


def excluded(ip: str) -> bool:
    addr = ipaddress.IPv4Address(ip)
    return any(addr in n for n in SHARED_CDN) or any(addr in n for n in PRIVATE)


def rebuild():
    now = int(time.time())
    try:
        state = json.load(open(STATE_FILE))
    except Exception:
        state = {}
    names = recent_social_names()
    with ThreadPoolExecutor(max_workers=16) as pool:
        results = list(pool.map(resolve, names))
    fresh = 0
    skipped_cdn = 0
    for ips in results:
        for ip in ips:
            if excluded(ip):
                skipped_cdn += 1
                continue
            if ip not in state:
                fresh += 1
            state[ip] = now
    # Nunca bloquear um IP que o WhatsApp usa.
    state = {ip: ts for ip, ts in state.items() if now - int(ts) <= KEEP_DAYS * 86400 and not in_set(WHATSAPP_SET, ip)}
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    json.dump(state, open(STATE_FILE + ".tmp", "w"))
    os.replace(STATE_FILE + ".tmp", STATE_FILE)
    tmp = IPSET_NAME + "_tmp"
    subprocess.run(["ipset", "create", IPSET_NAME, "hash:ip", "comment"], capture_output=True)
    subprocess.run(["ipset", "destroy", tmp], capture_output=True)
    subprocess.run(["ipset", "create", tmp, "hash:ip", "comment"], check=True)
    restore = "".join(f"add {tmp} {ip} comment social\n" for ip in sorted(state))
    if restore:
        subprocess.run(["ipset", "restore", "-exist"], input=restore, text=True, check=True)
    subprocess.run(["ipset", "swap", tmp, IPSET_NAME], check=True)
    subprocess.run(["ipset", "destroy", tmp], capture_output=True)
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Lista dinâmica de redes sociais: {len(state)} IPs ({fresh} novos), "
          f"{len(names)} nomes, {skipped_cdn} respostas de CDN compartilhada ignoradas.")


if __name__ == "__main__":
    if os.geteuid() != 0:
        print("Erro: precisa de root.")
        sys.exit(1)
    rebuild()
