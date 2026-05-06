from __future__ import annotations

import shutil
import subprocess

from .config import (
    DomainConfig,
    InstallerConfig,
    InterfaceConfig,
    RuntimeConfig,
    StackConfig,
    VlanConfig,
)
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


def _run_dialog(args: list[str]) -> str:
    command = shutil.which("whiptail") or shutil.which("dialog")
    if not command:
        raise RuntimeError("dialog indisponivel")

    if command.endswith("dialog"):
        cmd = [command, "--stdout", *args]
    else:
        cmd = [command, *args]

    result = subprocess.run(
        cmd,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError("dialog cancelado")
    output = result.stdout.strip() or result.stderr.strip()
    return output


def _dialog_input(title: str, label: str, default: str = "") -> str:
    return _run_dialog(
        [
            "--title",
            title,
            "--inputbox",
            label,
            "14",
            "78",
            default,
        ]
    )


def _dialog_yesno(title: str, label: str, default: bool = True) -> bool:
    command = shutil.which("whiptail") or shutil.which("dialog")
    if not command:
        raise RuntimeError("dialog indisponivel")

    cmd = [command]
    if command.endswith("dialog"):
        cmd.append("--stdout")
    if default:
        cmd.append("--defaultno")
        cmd.pop()
    cmd.extend(["--title", title, "--yesno", label, "12", "78"])
    result = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    return result.returncode == 0 if default else result.returncode == 0


def _dialog_menu(title: str, label: str, options: list[tuple[str, str]], default: str) -> str:
    menu_args: list[str] = []
    for key, desc in options:
        menu_args.extend([key, desc])
    return _run_dialog(
        [
            "--title",
            title,
            "--menu",
            label,
            "18",
            "90",
            "8",
            *menu_args,
        ]
    ) or default


def _supports_dialog() -> bool:
    return shutil.which("whiptail") is not None or shutil.which("dialog") is not None


def _run_dialog_wizard(inventory: RuntimeInventory) -> InstallerConfig:
    profile = _dialog_menu(
        "JMB TECNOLOGIA",
        "Selecione o perfil inicial do SGCG",
        [
            ("simple-console", "Console simples"),
            ("gateway-vlans", "Gateway com VLANs"),
            ("full-appliance", "Appliance completo"),
        ],
        "full-appliance",
    )
    hostname = _dialog_input("JMB TECNOLOGIA", "Hostname do SGCG", inventory.hostname or "sgcg")
    timezone = _dialog_input(
        "JMB TECNOLOGIA",
        "Timezone do servidor",
        inventory.default_timezone or "America/Sao_Paulo",
    )
    public_domain = _dialog_input(
        "JMB TECNOLOGIA",
        "Dominio principal do console SGCG",
        "console.interno.local",
    )
    internal_domains_raw = _dialog_input(
        "JMB TECNOLOGIA",
        "Dominios internos separados por virgula",
        "console.interno.local,suporte.interno.local,chamados.interno.local",
    )
    certificate_mode = _dialog_menu(
        "JMB TECNOLOGIA",
        "Modo de certificado",
        [
            ("internal_ca", "CA interna"),
            ("letsencrypt", "Let's Encrypt"),
            ("client_cert", "Certificado fornecido pelo cliente"),
            ("none", "Somente HTTP"),
        ],
        "internal_ca",
    )
    ssl_certificate_path = ""
    ssl_certificate_key_path = ""
    enable_https = certificate_mode != "none"
    if enable_https:
        ssl_certificate_path = _dialog_input(
            "JMB TECNOLOGIA",
            "Caminho do certificado SSL",
            "/etc/letsencrypt/live/console.exemplo/fullchain.pem",
        )
        ssl_certificate_key_path = _dialog_input(
            "JMB TECNOLOGIA",
            "Caminho da chave SSL",
            "/etc/letsencrypt/live/console.exemplo/privkey.pem",
        )
    wan_name = _dialog_input("JMB TECNOLOGIA", "Interface WAN", inventory.recommended_wan)
    lan_name = _dialog_input("JMB TECNOLOGIA", "Interface LAN", inventory.recommended_lan)
    gateway_ip = _dialog_input("JMB TECNOLOGIA", "IP principal do gateway SGCG", "192.168.10.1")
    trunk_enabled = _dialog_yesno(
        "JMB TECNOLOGIA",
        "Havera interface TRUNK/VLAN neste servidor?",
        True,
    )

    interfaces = [
        InterfaceConfig(name=wan_name, role="wan"),
        InterfaceConfig(name=lan_name, role="lan"),
    ]

    if trunk_enabled:
        trunk_name = _dialog_input("JMB TECNOLOGIA", "Interface TRUNK", lan_name)
        interfaces.append(InterfaceConfig(name=trunk_name, role="trunk"))

    vlans: list[VlanConfig] = []
    if trunk_enabled and _dialog_yesno(
        "JMB TECNOLOGIA",
        "Deseja cadastrar VLANs agora?",
        True,
    ):
        while True:
            vlan_id = int(_dialog_input("JMB TECNOLOGIA", "VLAN ID", "70"))
            subnet = _dialog_input("JMB TECNOLOGIA", "Sub-rede CIDR", "192.168.70.0/24")
            gateway = _dialog_input("JMB TECNOLOGIA", "Gateway da VLAN", "192.168.70.1")
            parent = _dialog_input("JMB TECNOLOGIA", "Interface pai da VLAN", interfaces[-1].name)
            name = _dialog_input("JMB TECNOLOGIA", "Nome da VLAN", f"vlan-{vlan_id}")
            dhcp_enabled = _dialog_yesno("JMB TECNOLOGIA", "Ativar DHCP nesta VLAN?", False)
            captive_portal = _dialog_yesno(
                "JMB TECNOLOGIA",
                "Ativar portal cativo nesta VLAN?",
                False,
            )
            profile_name = _dialog_input(
                "JMB TECNOLOGIA",
                "Perfil de politica da VLAN",
                "standard",
            )
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
            if not _dialog_yesno("JMB TECNOLOGIA", "Cadastrar outra VLAN?", False):
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
            enable_https=enable_https,
            certificate_mode=certificate_mode,
            ssl_certificate_path=ssl_certificate_path,
            ssl_certificate_key_path=ssl_certificate_key_path,
        ),
        interfaces=interfaces,
        vlans=vlans,
        stack=StackConfig(
            project_root="/opt/controlebeckercorp-v8",
            frontend_dir="/opt/controlebeckercorp-v8/frontend",
            backend_dir="/opt/controlebeckercorp-v8/backend",
            backend_proxy_dir="/opt/controlebeckercorp-v8/backend-proxy",
        ),
        runtime=RuntimeConfig(
            gateway_ip=gateway_ip,
            lan_interface=lan_name,
            wan_interface=wan_name,
            proxy_visible_hostname=f"proxy.{public_domain}",
        ),
    )


def run_wizard(inventory: RuntimeInventory) -> InstallerConfig:
    if _supports_dialog():
        try:
            return _run_dialog_wizard(inventory)
        except RuntimeError:
            pass

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
    certificate_mode = _prompt(
        "Modo de certificado (internal_ca/letsencrypt/client_cert/none)",
        "internal_ca",
    )
    enable_https = certificate_mode != "none"
    ssl_certificate_path = ""
    ssl_certificate_key_path = ""
    if enable_https:
        ssl_certificate_path = _prompt(
            "Caminho do certificado SSL",
            "/etc/letsencrypt/live/console.exemplo/fullchain.pem",
        )
        ssl_certificate_key_path = _prompt(
            "Caminho da chave SSL",
            "/etc/letsencrypt/live/console.exemplo/privkey.pem",
        )
    wan_name = _prompt("Interface WAN", inventory.recommended_wan)
    lan_name = _prompt("Interface LAN", inventory.recommended_lan)
    gateway_ip = _prompt("IP principal do gateway SGCG", "192.168.10.1")
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
            enable_https=enable_https,
            certificate_mode=certificate_mode,
            ssl_certificate_path=ssl_certificate_path,
            ssl_certificate_key_path=ssl_certificate_key_path,
        ),
        interfaces=interfaces,
        vlans=vlans,
        stack=StackConfig(
            project_root="/opt/controlebeckercorp-v8",
            frontend_dir="/opt/controlebeckercorp-v8/frontend",
            backend_dir="/opt/controlebeckercorp-v8/backend",
            backend_proxy_dir="/opt/controlebeckercorp-v8/backend-proxy",
        ),
        runtime=RuntimeConfig(
            gateway_ip=gateway_ip,
            lan_interface=lan_name,
            wan_interface=wan_name,
            proxy_visible_hostname=f"proxy.{public_domain}",
        ),
    )
