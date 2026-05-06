from __future__ import annotations

from .config import DomainConfig, InstallerConfig, InterfaceConfig, VlanConfig
from .detect import RuntimeInventory


def _prompt(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    raw = input(f"{label}{suffix}: ").strip()
    return raw or default


def _prompt_bool(label: str, default: bool = True) -> bool:
    prompt_default = "Y/n" if default else "y/N"
    raw = input(f"{label} [{prompt_default}]: ").strip().lower()
    if not raw:
        return default
    return raw in {"y", "yes", "s", "sim"}


def run_wizard(inventory: RuntimeInventory) -> InstallerConfig:
    print("=== JMB TECNOLOGIA | Superinstalador SGCG ===")
    print(f"Host detectado: {inventory.hostname} | {inventory.os_name}")
    print("Interfaces detectadas:")
    for iface in inventory.interfaces:
        addresses = ", ".join(iface.addresses) if iface.addresses else "sem IP"
        print(
            f" - {iface.name} | MAC {iface.mac_address} | {iface.state} | {addresses}"
        )

    profile = _prompt(
        "Perfil (simple-console/gateway-vlans/full-appliance)", "full-appliance"
    )
    hostname = _prompt("Hostname do SGCG", inventory.hostname or "sgcg")
    timezone = _prompt("Timezone", inventory.default_timezone or "America/Sao_Paulo")
    public_domain = _prompt("Dominio principal", "console.interno.local")
    internal_domains_raw = _prompt(
        "Dominios internos separados por virgula",
        "console.interno.local,suporte.interno.local,chamados.interno.local",
    )
    wan_name = _prompt("Interface WAN", inventory.recommended_wan)
    lan_name = _prompt("Interface LAN", inventory.recommended_lan)
    trunk_enabled = _prompt_bool("Havera interface TRUNK/VLAN?", True)

    interfaces = [
        InterfaceConfig(name=wan_name, role="wan"),
        InterfaceConfig(name=lan_name, role="lan"),
    ]

    if trunk_enabled:
        trunk_name = _prompt("Interface TRUNK", lan_name)
        interfaces.append(InterfaceConfig(name=trunk_name, role="trunk"))

    vlans: list[VlanConfig] = []
    if trunk_enabled and _prompt_bool("Deseja cadastrar VLANs agora?", True):
        while True:
            vlan_id = int(_prompt("VLAN ID", "70"))
            subnet = _prompt("Sub-rede CIDR", "192.168.70.0/24")
            gateway = _prompt("Gateway da VLAN", "192.168.70.1")
            parent = _prompt("Interface pai da VLAN", interfaces[-1].name)
            name = _prompt("Nome da VLAN", f"vlan-{vlan_id}")
            dhcp_enabled = _prompt_bool("Ativar DHCP nesta VLAN?", False)
            captive_portal = _prompt_bool("Ativar portal cativo nesta VLAN?", False)
            profile_name = _prompt("Perfil de politica", "standard")
            vlans.append(
                VlanConfig(
                    vlan_id=vlan_id,
                    name=name,
                    parent=parent,
                    subnet_cidr=subnet,
                    gateway=gateway,
                    dhcp_enabled=dhcp_enabled,
                    captive_portal=captive_portal,
                    policy_profile=profile_name,
                )
            )
            if not _prompt_bool("Cadastrar outra VLAN?", False):
                break

    return InstallerConfig(
        profile=profile,
        hostname=hostname,
        timezone=timezone,
        domains=DomainConfig(
            public_domain=public_domain,
            internal_domains=[
                item.strip() for item in internal_domains_raw.split(",") if item.strip()
            ],
        ),
        interfaces=interfaces,
        vlans=vlans,
    )
