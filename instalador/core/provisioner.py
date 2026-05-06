from __future__ import annotations

from datetime import datetime
import os
from pathlib import Path
import shutil
import subprocess

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
        self.generated_root = Path("/etc/sgcg/installer/generated")
        self.backup_root = Path("/etc/sgcg/installer/backups")

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
            "  - script de certificado interno do backend-proxy\n"
            "  - relatorio final da instalacao\n"
        )

    def apply(self) -> Path:
        output_root = self.generated_root
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
            output_root / "backend-proxy.env": self.renderer.render(
                "env/backend-proxy.env.j2",
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
            output_root / "generate-proxy-cert.sh": self.renderer.render(
                "ssl/generate-proxy-cert.sh.j2",
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

    def install(
        self,
        *,
        dry_run: bool = False,
        apply_network: bool = True,
        apply_firewall: bool = True,
    ) -> Path:
        report_path = self.apply()
        if dry_run:
            return report_path

        self._require_root()
        backup_dir = self._create_backup_dir()
        rollback_actions: list[tuple[Path, Path]] = []

        try:
            self._persist_canonical_config(backup_dir, rollback_actions)
            self._run_script(self.generated_root / "install-stack.sh")
            self._run_script(self.generated_root / "generate-proxy-cert.sh")
            self._apply_project_envs(backup_dir, rollback_actions)
            self._apply_hostname_timezone()
            self._apply_nginx(backup_dir, rollback_actions)
            self._apply_unbound(backup_dir, rollback_actions)
            if apply_firewall:
                self._run_script(self.generated_root / "ufw-baseline.sh")
            self._run_script(self.generated_root / "setup-postgresql.sh")
            if apply_network:
                self._apply_netplan(backup_dir, rollback_actions)
            self._run_script(self.generated_root / "deploy-sgcg.sh")
            self._wait_for_runtime()
            self._run_script(self.generated_root / "validate-sgcg.sh")
        except Exception:
            self._rollback(rollback_actions)
            raise

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

    def _apply_project_envs(
        self,
        backup_dir: Path,
        rollback_actions: list[tuple[Path, Path]],
    ) -> None:
        env_map = {
            self.generated_root / "backend.env": Path(self.config.stack.project_root) / "backend/.env",
            self.generated_root / "backend-proxy.env": Path(self.config.stack.project_root) / "backend-proxy/.env",
            self.generated_root / "frontend.env": Path(self.config.stack.project_root) / "frontend/.env.production",
        }
        for source, target in env_map.items():
            self._backup_and_copy(source, target, backup_dir, rollback_actions)

    def _persist_canonical_config(
        self,
        backup_dir: Path,
        rollback_actions: list[tuple[Path, Path]],
    ) -> None:
        canonical = Path("/etc/sgcg/installer/sgcg-config.yaml")
        self._backup_and_copy(self.config_path, canonical, backup_dir, rollback_actions)

    def _apply_hostname_timezone(self) -> None:
        self._run(["hostnamectl", "set-hostname", self.config.hostname])
        self._run(["timedatectl", "set-timezone", self.config.timezone])

    def _apply_nginx(
        self,
        backup_dir: Path,
        rollback_actions: list[tuple[Path, Path]],
    ) -> None:
        site_available = Path("/etc/nginx/sites-available/sgcg.conf")
        site_enabled = Path("/etc/nginx/sites-enabled/sgcg.conf")
        default_enabled = Path("/etc/nginx/sites-enabled/default")

        self._backup_and_copy(self.generated_root / "sgcg-nginx.conf", site_available, backup_dir, rollback_actions)
        if default_enabled.exists() or default_enabled.is_symlink():
            backup_path = backup_dir / "nginx-default.link"
            if default_enabled.is_symlink():
                backup_path.write_text(os.readlink(default_enabled), encoding="utf-8")
            rollback_actions.append((backup_path, default_enabled))
            default_enabled.unlink()
        if site_enabled.exists() or site_enabled.is_symlink():
            site_enabled.unlink()
        site_enabled.symlink_to(site_available)
        self._run(["nginx", "-t"])
        self._run(["systemctl", "reload", "nginx"])

    def _apply_unbound(
        self,
        backup_dir: Path,
        rollback_actions: list[tuple[Path, Path]],
    ) -> None:
        target = Path("/etc/unbound/unbound.conf.d/sgcg-installer.conf")
        self._backup_and_copy(self.generated_root / "unbound-sgcg.conf", target, backup_dir, rollback_actions)
        self._run(["unbound-checkconf"])
        self._run(["systemctl", "reload", "unbound"])

    def _apply_netplan(
        self,
        backup_dir: Path,
        rollback_actions: list[tuple[Path, Path]],
    ) -> None:
        target = Path("/etc/netplan/00-sgcg-installer.yaml")
        self._backup_and_copy(self.generated_root / "00-sgcg-installer.yaml", target, backup_dir, rollback_actions)
        self._run(["netplan", "generate"])
        self._run(["netplan", "apply"])

    def _create_backup_dir(self) -> Path:
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        path = self.backup_root / timestamp
        path.mkdir(parents=True, exist_ok=True)
        return path

    def _backup_and_copy(
        self,
        source: Path,
        target: Path,
        backup_dir: Path,
        rollback_actions: list[tuple[Path, Path]],
    ) -> None:
        try:
            if source.resolve() == target.resolve():
                return
        except FileNotFoundError:
            pass
        target.parent.mkdir(parents=True, exist_ok=True)
        backup_path = backup_dir / target.as_posix().lstrip("/").replace("/", "__")
        if target.exists() or target.is_symlink():
            if target.is_symlink():
                backup_path.write_text(os.readlink(target), encoding="utf-8")
            else:
                shutil.copy2(target, backup_path)
            rollback_actions.append((backup_path, target))
        else:
            rollback_actions.append((Path("__DELETE__"), target))
        shutil.copy2(source, target)

    def _rollback(self, rollback_actions: list[tuple[Path, Path]]) -> None:
        for backup, target in reversed(rollback_actions):
            try:
                if str(backup) == "__DELETE__":
                    if target.exists() or target.is_symlink():
                        if target.is_dir() and not target.is_symlink():
                            shutil.rmtree(target)
                        else:
                            target.unlink()
                    continue
                target.parent.mkdir(parents=True, exist_ok=True)
                if backup.suffix == ".link":
                    if target.exists() or target.is_symlink():
                        target.unlink()
                    target.symlink_to(backup.read_text(encoding="utf-8"))
                else:
                    shutil.copy2(backup, target)
            except Exception:
                continue

    def _run_script(self, path: Path) -> None:
        self._run(["bash", str(path)])

    def _wait_for_runtime(self) -> None:
        import socket
        import time

        checks = [
            ("127.0.0.1", self.config.stack.backend_port),
            ("127.0.0.1", self.config.stack.backend_proxy_port),
        ]
        deadline = time.time() + 60
        pending = set(checks)

        while pending and time.time() < deadline:
            ready = set()
            for host, port in pending:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                sock.settimeout(2)
                try:
                    sock.connect((host, port))
                    ready.add((host, port))
                except OSError:
                    pass
                finally:
                    sock.close()
            pending -= ready
            if pending:
                time.sleep(2)

        if pending:
            missing = ", ".join(f"{host}:{port}" for host, port in sorted(pending))
            raise RuntimeError(f"runtime nao ficou pronto a tempo: {missing}")

    def _run(self, command: list[str]) -> None:
        subprocess.run(command, check=True)

    def _require_root(self) -> None:
        if os.geteuid() != 0:
            raise PermissionError("o comando install exige root")

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
