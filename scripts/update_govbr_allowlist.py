#!/usr/bin/env python3
"""
Atualiza a liberacao operacional de gov.br/Empresa Facil.

Esta rotina mantem um ipset com os IPs atuais dos portais criticos e garante
regras no topo do FORWARD/NAT para que esses destinos nao caiam em captive,
social block, sanitizacao UFW ou DNAT local.
"""

import os
import re
import subprocess
from datetime import datetime
from urllib.parse import urlparse

IPSET_NAME = "sgcg_govbr_allowed"
WAN_IFACE = "enp8s0"
LAN_IFACE_GLOB = "enp6s0+"
IPSET_FILE = "/etc/ipset.conf"
IPTABLES_FILE = "/etc/iptables/rules.v4"
UNBOUND_CUSTOM_ZONES = "/etc/unbound/unbound.conf.d/custom-zones.conf"
VIP_CLEAN_CONF = "/etc/unbound/sgcg-vip-clean.conf"
SQUID_ACL_FILES = [
    "/etc/squid/acl/proxy_whitelist.acl",
    "/etc/squid/acl/proxy_protected_ssl.acl",
]
RPZ_ALLOW_FILES = [
    "/etc/unbound/becker/allowed.rpz",
    "/etc/unbound/becker/allowlist-vlan-10.rpz",
    "/etc/unbound/becker/allowlist-vlan-30.rpz",
    "/etc/unbound/becker/allowlist-vlan-40.rpz",
    "/etc/unbound/becker/allowlist-vlan-50.rpz",
    "/etc/unbound/becker/allowlist-vlan-70.rpz",
]
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgres://postgres:becker_admin_secure@localhost:5432/controlebeckercorp_v8",
)
FORWARDERS = ["1.1.1.1", "1.0.0.1"]

FORWARD_ZONE_DOMAINS = [
    "gov.br",
    "acesso.gov.br",
    "sistema.gov.br",
    "servicos.gov.br",
    "dados.gov.br",
    "fazenda.gov.br",
    "caixa.gov.br",
    "fgts.caixa.gov.br",
    "conectividade.caixa.gov.br",
    "serpro.gov.br",
    "estaleiro.serpro.gov.br",
    "ebc.com.br",
    "go-mpulse.net",
    "akamaiedge.net",
    "akamaihd.net",
    "akamaized.net",
    "akamaitechnologies.com",
]

SEED_DOMAINS = [
    "www.gov.br",
    "sso.acesso.gov.br",
    "contas.acesso.gov.br",
    "servicos.acesso.gov.br",
    "barra.sistema.gov.br",
    "receita.fazenda.gov.br",
    "dados.gov.br",
    "autenticacao.empresafacil.pr.gov.br",
    "empresafacil.pr.gov.br",
    "www.empresafacil.pr.gov.br",
    "barra.sistema.gov.br",
    "certificado.sso.acesso.gov.br",
    "cadastro.acesso.gov.br",
    "estruturaorganizacional.dados.gov.br",
    "agenciagov.ebc.com.br",
    "api.recomgov.df-1.estaleiro.serpro.gov.br",
    "portalunico.estaleiro.serpro.gov.br",
    "faq-login-unico.servicos.gov.br",
    "falabr.cgu.gov.br",
    "sigfacil.staticvox.com.br",
    "js-agent.newrelic.com",
    "bam.nr-data.net",
    "hcaptcha.com",
    "js.hcaptcha.com",
    "newassets.hcaptcha.com",
    "www.googletagmanager.com",
    "www.google-analytics.com",
    "www.google.com",
    "ssl.google-analytics.com",
    "www.gstatic.com",
    "fonts.googleapis.com",
    "fonts.gstatic.com",
    "maps.googleapis.com",
    "cdnjs.cloudflare.com",
    "vlibras.gov.br",
    "www.vlibras.gov.br",
    "dicionario2.vlibras.gov.br",
    "traducao2.vlibras.gov.br",
    "cdp.cloud.unity3d.com",
    "config.uca.cloud.unity3d.com",
    "serprobots.estaleiro.serpro.gov.br",
    "cdn-dsgovserprodesign.estaleiro.serpro.gov.br",
    "c.go-mpulse.net",
    "go-mpulse.net",
    "wildcard46.go-mpulse.net",
    "e4518.dscapi7.akamaiedge.net",
    "apps.apple.com",
    "play.google.com",
    "caixa.gov.br",
    "www.caixa.gov.br",
    "conectividade.caixa.gov.br",
    "conectividadesocial.caixa.gov.br",
    "conectividade-social.caixa.gov.br",
    "cmt.caixa.gov.br",
    "cns.caixa.gov.br",
    "fgts.caixa.gov.br",
    "www.conectividade.caixa.gov.br",
    "consulta-crf.caixa.gov.br",
    "certificado.caixa.gov.br",
    "login.caixa.gov.br",
    "internetbanking.caixa.gov.br",
    "gerenciador.caixa.gov.br",
    "sefip.caixa.gov.br",
    "esocial.gov.br",
    "www.esocial.gov.br",
    "login.esocial.gov.br",
    "portal.esocial.gov.br",
]

RELATED_SUFFIXES = tuple(sorted(set(FORWARD_ZONE_DOMAINS + [
    "empresafacil.pr.gov.br",
    "staticvox.com.br",
    "nr-data.net",
    "newrelic.com",
    "hcaptcha.com",
    "gstatic.com",
    "googleapis.com",
    "googletagmanager.com",
    "google-analytics.com",
    "cloudflare.com",
    "cloudfront.net",
])))

DOMAIN_HINTS = (
    "gov",
    "acesso",
    "serpro",
    "estaleiro",
    "caixa",
    "conectividade",
    "fgts",
    "esocial",
    "receita",
    "fazenda",
    "govbr",
    "go-mpulse",
)

DOMAINS = sorted(set(FORWARD_ZONE_DOMAINS + SEED_DOMAINS))
RESOLVERS = FORWARDERS + ["127.0.0.1"]


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, check=check)


def resolve(domain: str) -> set[str]:
    ips: set[str] = set()
    for resolver in RESOLVERS:
        result = run(["dig", f"@{resolver}", "+time=2", "+tries=1", domain, "A", "+short"], check=False)
        for line in result.stdout.splitlines():
            value = line.strip()
            if value.count(".") == 3 and all(part.isdigit() for part in value.split(".")):
                ips.add(value)
    return ips


def normalize_domain(value: str) -> str:
    value = (value or "").strip().lower().rstrip(".")
    value = re.sub(r"^[*.]+", "", value)
    if not value or "/" in value or " " in value:
        return ""
    if not re.fullmatch(r"[a-z0-9_.-]+\.[a-z0-9-]+", value):
        return ""
    return value


def is_related_domain(domain: str) -> bool:
    domain = normalize_domain(domain)
    if not domain:
        return False
    if domain.endswith(RELATED_SUFFIXES):
        return True
    return any(hint in domain for hint in DOMAIN_HINTS)


def fetch_recent_related_domains() -> set[str]:
    try:
        import psycopg2
    except ImportError:
        return set()

    domains: set[str] = set()
    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT DISTINCT lower(query_name)
                  FROM dns_policy_events
                 WHERE created_at > now() - interval '24 hours'
                   AND (
                        query_name ILIKE '%%gov%%'
                     OR query_name ILIKE '%%acesso%%'
                     OR query_name ILIKE '%%serpro%%'
                     OR query_name ILIKE '%%estaleiro%%'
                     OR query_name ILIKE '%%caixa%%'
                     OR query_name ILIKE '%%conectividade%%'
                     OR query_name ILIKE '%%fgts%%'
                     OR query_name ILIKE '%%esocial%%'
                     OR query_name ILIKE '%%receita%%'
                     OR query_name ILIKE '%%fazenda%%'
                     OR query_name ILIKE '%%go-mpulse%%'
                   )
                 LIMIT 1500
                """
            )
            for (query_name,) in cur.fetchall():
                domain = normalize_domain(str(query_name or ""))
                if is_related_domain(domain):
                    domains.add(domain)

            cur.execute(
                """
                SELECT DISTINCT url
                  FROM proxy_audit_log
                 WHERE timestamp > now() - interval '24 hours'
                   AND (
                        url ILIKE '%%gov%%'
                     OR url ILIKE '%%acesso%%'
                     OR url ILIKE '%%serpro%%'
                     OR url ILIKE '%%estaleiro%%'
                     OR url ILIKE '%%caixa%%'
                     OR url ILIKE '%%conectividade%%'
                     OR url ILIKE '%%fgts%%'
                     OR url ILIKE '%%esocial%%'
                     OR url ILIKE '%%receita%%'
                     OR url ILIKE '%%fazenda%%'
                     OR url ILIKE '%%go-mpulse%%'
                   )
                 LIMIT 1500
                """
            )
            for (url,) in cur.fetchall():
                raw = str(url or "").strip()
                parsed = urlparse(raw if "://" in raw else f"https://{raw}")
                domain = normalize_domain(parsed.hostname or raw.split("/")[0].split(":")[0])
                if is_related_domain(domain):
                    domains.add(domain)
    finally:
        conn.close()

    return domains


def ensure_ipset() -> None:
    run(["ipset", "create", IPSET_NAME, "hash:ip", "family", "inet", "hashsize", "1024", "maxelem", "65536", "comment", "-exist"], check=False)


def current_members() -> set[str]:
    result = run(["ipset", "list", IPSET_NAME], check=False)
    members: set[str] = set()
    for line in result.stdout.splitlines():
        first = line.split(" ", 1)[0].strip()
        if first.count(".") == 3 and all(part.isdigit() for part in first.split(".")):
            members.add(first)
    return members


def refresh_members() -> int:
    wanted: dict[str, str] = {}
    domains = sorted(set(DOMAINS) | fetch_recent_related_domains())
    for domain in domains:
        for ip in resolve(domain):
            wanted[ip] = domain

    for ip, domain in wanted.items():
        run(["ipset", "add", IPSET_NAME, ip, "comment", domain, "-exist"], check=False)

    for ip in current_members() - set(wanted):
        run(["ipset", "del", IPSET_NAME, ip], check=False)

    return len(wanted)


def forward_zone_block(domain: str) -> str:
    lines = ["forward-zone:", f'    name: "{domain}"']
    lines.extend(f"    forward-addr: {addr}" for addr in FORWARDERS)
    return "\n".join(lines)


def write_if_changed(path: str, content: str) -> bool:
    current = ""
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as handle:
            current = handle.read()
    if current == content:
        return False
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(content)
    return True


def ensure_line_file(path: str, lines: list[str]) -> bool:
    existing: list[str] = []
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as handle:
            existing = [line.rstrip("\n") for line in handle]
    merged = existing[:]
    present = {line.strip().lower() for line in existing if line.strip()}
    changed = False
    for line in lines:
        clean = line.strip()
        if clean and clean.lower() not in present:
            merged.append(clean)
            present.add(clean.lower())
            changed = True
    if changed:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write("\n".join(merged).rstrip() + "\n")
    return changed


def ensure_squid_acls(domains: set[str]) -> bool:
    changed = False
    acl_domains = sorted({domain for domain in domains if normalize_domain(domain)})
    for path in SQUID_ACL_FILES:
        changed = ensure_line_file(path, acl_domains) or changed
    if changed:
        parse = run(["squid", "-k", "parse"], check=False)
        if parse.returncode == 0:
            run(["systemctl", "reload", "squid"], check=False)
        else:
            print("  [AVISO] squid -k parse falhou apos atualizar ACLs.")
    return changed


def ensure_rpz_passthru(domains: set[str]) -> bool:
    changed = False
    records: list[str] = []
    for domain in sorted({domain for domain in domains if normalize_domain(domain)}):
        records.append(f"{domain} CNAME rpz-passthru.")
        records.append(f"*.{domain} CNAME rpz-passthru.")
    for path in RPZ_ALLOW_FILES:
        if os.path.exists(path):
            changed = ensure_line_file(path, records) or changed
    return changed


def ensure_institutional_dns_rows() -> None:
    try:
        import psycopg2
    except ImportError:
        print("  [AVISO] psycopg2 ausente; nao foi possivel sincronizar net_dns_rules.")
        return

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn:
            with conn.cursor() as cur:
                for domain in sorted(set(FORWARD_ZONE_DOMAINS + SEED_DOMAINS)):
                    cur.execute(
                        "SELECT id FROM net_dns_rules WHERE lower(domain)=lower(%s) ORDER BY id LIMIT 1",
                        (domain,),
                    )
                    row = cur.fetchone()
                    if row:
                        cur.execute(
                            "UPDATE net_dns_rules SET target_ip=%s, type='FWD' WHERE id=%s",
                            (",".join(FORWARDERS), row[0]),
                        )
                    else:
                        cur.execute(
                            "INSERT INTO net_dns_rules (domain, target_ip, type) VALUES (%s, %s, 'FWD')",
                            (domain, ",".join(FORWARDERS)),
                        )
    finally:
        conn.close()


def split_forward_addrs(value: str) -> list[str]:
    return [item.strip() for item in value.replace(",", " ").split() if item.strip()]


def ensure_unbound_custom_zones() -> bool:
    try:
        import psycopg2
    except ImportError:
        print("  [AVISO] psycopg2 ausente; nao foi possivel regenerar custom-zones.conf.")
        return False

    conn = psycopg2.connect(DATABASE_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT domain, target_ip, type FROM net_dns_rules ORDER BY id ASC")
            rows = cur.fetchall()
    finally:
        conn.close()

    server_lines: list[str] = []
    forward_blocks: list[str] = []
    for domain, target_ip, rule_type in rows:
        domain = str(domain or "").strip()
        target_ip = str(target_ip or "").strip()
        rule_type = str(rule_type or "A").strip().upper()
        if not domain or not target_ip:
            continue
        if rule_type == "FWD":
            addrs = split_forward_addrs(target_ip)
            if not addrs:
                continue
            lines = ["forward-zone:", f'    name: "{domain}"']
            lines.extend(f"    forward-addr: {addr}" for addr in addrs)
            forward_blocks.append("\n".join(lines))
        else:
            server_lines.append(f'    local-zone: "{domain}" redirect')
            server_lines.append(f'    local-data: "{domain} A {target_ip}"')

    parts = ["# Gerado por scripts/update_govbr_allowlist.py a partir de net_dns_rules"]
    if server_lines:
        parts.append("server:\n" + "\n".join(server_lines))
    if forward_blocks:
        parts.append("\n\n".join(forward_blocks))
    content = "\n\n".join(parts).rstrip() + "\n"
    return write_if_changed(UNBOUND_CUSTOM_ZONES, content)


def reload_unbound_if_needed(config_changed: bool) -> None:
    if not config_changed:
        return
    run(["unbound-checkconf", "/etc/unbound/unbound.conf"])
    run(["unbound-checkconf", "-f", VIP_CLEAN_CONF])
    run(["systemctl", "reload", "unbound"], check=False)


def ensure_rule(table: str, chain: str, rule: list[str], insert_pos: str = "1") -> None:
    check_cmd = ["iptables"]
    if table != "filter":
        check_cmd += ["-t", table]
    check_cmd += ["-C", chain] + rule
    if run(check_cmd, check=False).returncode == 0:
        return

    insert_cmd = ["iptables"]
    if table != "filter":
        insert_cmd += ["-t", table]
    insert_cmd += ["-I", chain, insert_pos] + rule
    run(insert_cmd)


def ensure_firewall_rules() -> None:
    comment = "SGCG GOVBR EMPRESAFACIL ALLOW"
    ensure_rule(
        "filter",
        "FORWARD",
        [
            "-i", WAN_IFACE,
            "-o", LAN_IFACE_GLOB,
            "-m", "conntrack",
            "--ctstate", "ESTABLISHED,RELATED",
            "-m", "set",
            "--match-set", IPSET_NAME, "src",
            "-m", "comment",
            "--comment", "SGCG GOVBR EMPRESAFACIL RETURN ALLOW",
            "-j", "ACCEPT",
        ],
    )

    for proto in ("tcp", "udp"):
        ensure_rule(
            "filter",
            "FORWARD",
            [
                "-i", LAN_IFACE_GLOB,
                "-o", WAN_IFACE,
                "-p", proto,
                "-m", "multiport",
                "--dports", "80,443",
                "-m", "set",
                "--match-set", IPSET_NAME, "dst",
                "-m", "comment",
                "--comment", comment,
                "-j", "ACCEPT",
            ],
        )

    ensure_rule(
        "nat",
        "PREROUTING",
        [
            "-i", LAN_IFACE_GLOB,
            "-m", "set",
            "--match-set", IPSET_NAME, "dst",
            "-m", "comment",
            "--comment", "SGCG GOVBR EMPRESAFACIL NAT BYPASS",
            "-j", "RETURN",
        ],
    )


def persist() -> None:
    os.makedirs(os.path.dirname(IPTABLES_FILE), exist_ok=True)
    with open(IPSET_FILE, "w", encoding="utf-8") as handle:
        handle.write(run(["ipset", "save"]).stdout)
    with open(IPTABLES_FILE, "w", encoding="utf-8") as handle:
        handle.write(run(["iptables-save"]).stdout)


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("Precisa executar como root.")

    print(f"[{datetime.now().isoformat(timespec='seconds')}] Atualizando gov.br/Empresa Facil")
    ensure_ipset()
    policy_domains = sorted(set(FORWARD_ZONE_DOMAINS + SEED_DOMAINS) | fetch_recent_related_domains())
    ensure_institutional_dns_rows()
    config_changed = ensure_unbound_custom_zones()
    config_changed = ensure_rpz_passthru(set(policy_domains)) or config_changed
    ensure_squid_acls(set(policy_domains))
    count = refresh_members()
    ensure_firewall_rules()
    reload_unbound_if_needed(config_changed)
    persist()
    print(f"ok members={count}")


if __name__ == "__main__":
    main()
