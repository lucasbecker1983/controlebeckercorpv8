from __future__ import annotations

import json
import os
import platform
import shutil
import socket
import subprocess
from dataclasses import asdict, dataclass
from pathlib import Path


def _run_json(command: list[str]) -> list[dict]:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            check=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return []
    try:
        payload = json.loads(result.stdout)
    except json.JSONDecodeError:
        return []
    return payload if isinstance(payload, list) else []


def _read_os_release() -> dict[str, str]:
    values: dict[str, str] = {}
    path = Path("/etc/os-release")
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        if "=" not in line:
            continue
        key, raw = line.split("=", 1)
        values[key] = raw.strip().strip('"')
    return values


@dataclass
class NetworkInterface:
    name: str
    mac_address: str
    state: str
    mtu: int
    addresses: list[str]


@dataclass
class RuntimeInventory:
    hostname: str
    fqdn: str
    os_name: str
    os_version: str
    kernel: str
    architecture: str
    default_timezone: str
    interfaces: list[NetworkInterface]
    recommended_wan: str
    recommended_lan: str

    def to_dict(self) -> dict:
        return asdict(self)


def detect_runtime_inventory() -> RuntimeInventory:
    os_release = _read_os_release()
    ip_addr = _run_json(["ip", "-j", "addr", "show"])
    interfaces: list[NetworkInterface] = []

    for item in ip_addr:
        if item.get("ifname") == "lo":
            continue
        addresses = []
        for addr_info in item.get("addr_info", []):
            local = addr_info.get("local")
            prefix = addr_info.get("prefixlen")
            if local and prefix:
                addresses.append(f"{local}/{prefix}")
        interfaces.append(
            NetworkInterface(
                name=item.get("ifname", ""),
                mac_address=item.get("address", ""),
                state=item.get("operstate", "UNKNOWN"),
                mtu=item.get("mtu", 1500),
                addresses=addresses,
            )
        )

    recommended_wan = interfaces[0].name if interfaces else ""
    recommended_lan = interfaces[1].name if len(interfaces) > 1 else recommended_wan

    timezone = "UTC"
    if shutil.which("timedatectl"):
        try:
            result = subprocess.run(
                ["timedatectl", "show", "--property=Timezone", "--value"],
                capture_output=True,
                check=True,
                text=True,
            )
            timezone = result.stdout.strip() or timezone
        except subprocess.CalledProcessError:
            pass
    else:
        timezone = os.environ.get("TZ", timezone)

    return RuntimeInventory(
        hostname=socket.gethostname(),
        fqdn=socket.getfqdn(),
        os_name=os_release.get("PRETTY_NAME", platform.system()),
        os_version=os_release.get("VERSION_ID", platform.version()),
        kernel=platform.release(),
        architecture=platform.machine(),
        default_timezone=timezone,
        interfaces=interfaces,
        recommended_wan=recommended_wan,
        recommended_lan=recommended_lan,
    )
