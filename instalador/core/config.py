from __future__ import annotations

from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

try:
    import yaml
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "PyYAML nao instalado. Execute o bootstrap do instalador antes de usar."
    ) from exc


@dataclass
class InterfaceConfig:
    name: str
    role: str
    mac_address: str = ""
    addressing: str = "dhcp"
    address_cidr: str = ""
    gateway: str = ""
    dns_servers: list[str] = field(default_factory=list)


@dataclass
class VlanConfig:
    vlan_id: int
    name: str
    parent: str
    subnet_cidr: str
    gateway: str
    dhcp_enabled: bool = False
    captive_portal: bool = False
    policy_profile: str = "standard"


@dataclass
class DomainConfig:
    public_domain: str
    internal_domains: list[str]
    enable_https: bool = True
    certificate_mode: str = "internal_ca"
    admin_email: str = ""


@dataclass
class DatabaseConfig:
    host: str = "127.0.0.1"
    port: int = 5432
    database: str = "sgcg"
    user: str = "sgcg"
    password: str = "sgcg-change-me"


@dataclass
class StackConfig:
    node_major: str = "22"
    python_binary: str = "python3"
    project_root: str = "/opt/controlebeckercorp-v8"
    frontend_dir: str = "/opt/sgcg/frontend"
    backend_dir: str = "/opt/sgcg/backend"
    backend_proxy_dir: str = "/opt/sgcg/backend-proxy"
    enable_pm2: bool = True
    enable_nginx: bool = True
    enable_unbound: bool = True
    enable_squid: bool = True
    enable_postgresql: bool = True
    enable_tailwind_build: bool = True
    enable_typescript_build: bool = True


@dataclass
class FirewallConfig:
    ssh_port: int = 22
    wan_policy: str = "deny"
    lan_forwarding: bool = True
    enable_nat: bool = True
    allow_dns: bool = True
    allow_http: bool = True
    allow_https: bool = True
    allow_postgresql_local_only: bool = True


@dataclass
class BrandingConfig:
    vendor: str = "JMB TECNOLOGIA"
    tenant_name: str = "Prefeitura"
    tenant_secretariat: str = "Secretaria de Tecnologia"
    support_label: str = "Superinstalador SGCG"


@dataclass
class InstallerConfig:
    profile: str
    hostname: str
    timezone: str
    domains: DomainConfig
    interfaces: list[InterfaceConfig]
    vlans: list[VlanConfig]
    database: DatabaseConfig = field(default_factory=DatabaseConfig)
    stack: StackConfig = field(default_factory=StackConfig)
    firewall: FirewallConfig = field(default_factory=FirewallConfig)
    branding: BrandingConfig = field(default_factory=BrandingConfig)
    modules: dict[str, bool] = field(
        default_factory=lambda: {
            "hotspot": True,
            "collaborators": True,
            "dns_rpz": True,
            "vip_bypass": True,
            "pontorh_compatibility": True,
        }
    )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def _from_dict(data: dict[str, Any]) -> InstallerConfig:
    return InstallerConfig(
        profile=data["profile"],
        hostname=data["hostname"],
        timezone=data["timezone"],
        domains=DomainConfig(**data["domains"]),
        interfaces=[InterfaceConfig(**item) for item in data.get("interfaces", [])],
        vlans=[VlanConfig(**item) for item in data.get("vlans", [])],
        database=DatabaseConfig(**data.get("database", {})),
        stack=StackConfig(**data.get("stack", {})),
        firewall=FirewallConfig(**data.get("firewall", {})),
        branding=BrandingConfig(**data.get("branding", {})),
        modules=data.get("modules", {}),
    )


def load_config(path: Path) -> InstallerConfig:
    with path.open("r", encoding="utf-8") as handle:
        data = yaml.safe_load(handle) or {}
    return _from_dict(data)


def save_config(config: InstallerConfig, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        yaml.safe_dump(config.to_dict(), handle, sort_keys=False, allow_unicode=False)
