from __future__ import annotations

from datetime import datetime
from pathlib import Path

from .config import InstallerConfig
from .packages import build_package_plan
from .render import TemplateRenderer


class Provisioner:
    def __init__(self, config: InstallerConfig, config_path: Path) -> None:
        self.config = config
        self.config_path = config_path
        self.root = Path(__file__).resolve().parent.parent
        self.template_root = self.root / "templates"
        self.renderer = TemplateRenderer(self.template_root)

    def render_plan(self) -> str:
        package_plan = build_package_plan(self.config)
        interface_summary = "\n".join(
            f"  - {iface.role}: {iface.name}" for iface in self.config.interfaces
        )
        vlan_summary = "\n".join(
            f"  - VLAN {vlan.vlan_id} ({vlan.name}) {vlan.subnet_cidr} gw {vlan.gateway}"
            for vlan in self.config.vlans
        ) or "  - nenhuma VLAN configurada"

        apt_packages = "\n".join(f"  - {pkg}" for pkg in package_plan["apt"])
        npm_packages = "\n".join(f"  - {pkg}" for pkg in package_plan["npm_global"])

        return (
            "=== PLANO DO SUPERINSTALADOR SGCG JMB TECNOLOGIA ===\n"
            f"Perfil: {self.config.profile}\n"
            f"Hostname: {self.config.hostname}\n"
            f"Timezone: {self.config.timezone}\n"
            f"Dominio principal: {self.config.domains.public_domain}\n"
            "Interfaces:\n"
            f"{interface_summary}\n"
            "VLANs:\n"
            f"{vlan_summary}\n"
            "Pacotes apt previstos:\n"
            f"{apt_packages}\n"
            "Ferramentas globais npm previstas:\n"
            f"{npm_packages}\n"
            "Artefatos previstos:\n"
            "  - netplan base do SGCG\n"
            "  - vhost nginx institucional\n"
            "  - env do backend\n"
            "  - env do frontend\n"
            "  - ecosystem PM2\n"
            "  - baseline de UFW\n"
            "  - include inicial do Unbound\n"
            "  - script de inicializacao do PostgreSQL\n"
            "  - script de deploy base do SGCG\n"
            "  - script de validacao local\n"
            "  - relatorio final da instalacao\n"
        )

    def apply(self) -> Path:
        output_root = Path("/etc/sgcg/installer/generated")
        output_root.mkdir(parents=True, exist_ok=True)

        files = {
            output_root / "00-sgcg-installer.yaml": self.renderer.render(
                "netplan/00-sgcg-installer.yaml.j2",
                config=self.config,
            ),
            output_root / "sgcg-nginx.conf": self.renderer.render(
                "nginx/sgcg-nginx.conf.j2",
                config=self.config,
            ),
            output_root / "backend.env": self.renderer.render(
                "env/backend.env.j2",
                config=self.config,
            ),
            output_root / "frontend.env": self.renderer.render(
                "env/frontend.env.j2",
                config=self.config,
            ),
            output_root / "ecosystem.config.cjs": self.renderer.render(
                "pm2/ecosystem.config.cjs.j2",
                config=self.config,
            ),
            output_root / "ufw-baseline.sh": self.renderer.render(
                "ufw/ufw-baseline.sh.j2",
                config=self.config,
            ),
            output_root / "unbound-sgcg.conf": self.renderer.render(
                "unbound/unbound-sgcg.conf.j2",
                config=self.config,
            ),
            output_root / "postgres-init.sql": self.renderer.render(
                "postgres/postgres-init.sql.j2",
                config=self.config,
            ),
            output_root / "setup-postgresql.sh": self.renderer.render(
                "postgres/setup-postgresql.sh.j2",
                config=self.config,
            ),
            output_root / "deploy-sgcg.sh": self.renderer.render(
                "deploy/deploy-sgcg.sh.j2",
                config=self.config,
            ),
            output_root / "validate-sgcg.sh": self.renderer.render(
                "validate/validate-sgcg.sh.j2",
                config=self.config,
            ),
            output_root / "install-stack.sh": self._render_install_script(),
        }

        for path, content in files.items():
            path.write_text(content.rstrip() + "\n", encoding="utf-8")
            if path.suffix == ".sh":
                path.chmod(0o755)

        report_path = output_root / "install-report.txt"
        report_path.write_text(self._render_report(output_root), encoding="utf-8")
        return report_path

    def _render_install_script(self) -> str:
        package_plan = build_package_plan(self.config)
        apt_line = " ".join(package_plan["apt"])
        npm_line = " ".join(package_plan["npm_global"])
        return f"""#!/usr/bin/env bash
set -euo pipefail

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y {apt_line}
npm install -g {npm_line}

echo "SGCG stack base preparada para {self.config.domains.public_domain}"
"""

    def _render_report(self, output_root: Path) -> str:
        generated = "\n".join(f"- {path.name}" for path in sorted(output_root.iterdir()))
        vlans = (
            "\n".join(
                f"- VLAN {v.vlan_id} | {v.name} | {v.subnet_cidr} | gw {v.gateway}"
                for v in self.config.vlans
            )
            or "- nenhuma"
        )
        return (
            "SGCG JMB TECNOLOGIA - RELATORIO DE INSTALACAO\n"
            f"Gerado em: {datetime.now().isoformat()}\n"
            f"Perfil: {self.config.profile}\n"
            f"Hostname: {self.config.hostname}\n"
            f"Dominio principal: {self.config.domains.public_domain}\n"
            f"Arquivo declarativo: {self.config_path}\n"
            "VLANs:\n"
            f"{vlans}\n"
            "Artefatos gerados:\n"
            f"{generated}\n"
        )
