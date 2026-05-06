from __future__ import annotations

import argparse
import json
from pathlib import Path

from .config import InstallerConfig, load_config, save_config
from .detect import detect_runtime_inventory
from .provisioner import Provisioner
from .validate import validate_installer_state
from .wizard import run_wizard


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="sgcg-installer",
        description="Superinstalador SGCG JMB TECNOLOGIA",
    )
    parser.add_argument(
        "--config",
        default="/etc/sgcg/installer/sgcg-config.yaml",
        help="caminho do arquivo declarativo do instalador",
    )

    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("wizard", help="executa o wizard interativo")
    sub.add_parser("detect", help="exibe inventario do servidor")
    sub.add_parser("plan", help="gera o plano de instalacao")
    sub.add_parser("apply", help="gera artefatos e scripts do ambiente")
    sub.add_parser("validate", help="executa validacoes locais do servidor")
    install = sub.add_parser("install", help="executa a instalacao real no host")
    install.add_argument("--dry-run", action="store_true", help="nao altera o host; apenas mostra as etapas")
    install.add_argument("--skip-network-apply", action="store_true", help="gera o netplan, mas nao executa netplan apply")
    install.add_argument("--skip-firewall-apply", action="store_true", help="nao executa o baseline de UFW")
    return parser


def _load_or_fail(config_path: Path) -> InstallerConfig:
    if not config_path.exists():
        raise SystemExit(
            f"configuracao nao encontrada em {config_path}. execute primeiro o comando wizard"
        )
    return load_config(config_path)


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    config_path = Path(args.config)

    if args.command == "wizard":
        inventory = detect_runtime_inventory()
        config = run_wizard(inventory)
        save_config(config, config_path)
        print(f"configuracao salva em {config_path}")
        return 0

    if args.command == "detect":
        inventory = detect_runtime_inventory()
        print(json.dumps(inventory.to_dict(), indent=2, ensure_ascii=True))
        return 0

    config = _load_or_fail(config_path)
    provisioner = Provisioner(config=config, config_path=config_path)

    if args.command == "plan":
        print(provisioner.render_plan())
        return 0

    if args.command == "apply":
        report_path = provisioner.apply()
        print(f"artefatos gerados. relatorio: {report_path}")
        return 0

    if args.command == "validate":
        report = validate_installer_state(config)
        print(report)
        return 0

    if args.command == "install":
        report_path = provisioner.install(
            dry_run=args.dry_run,
            apply_network=not args.skip_network_apply,
            apply_firewall=not args.skip_firewall_apply,
        )
        print(f"instalacao concluida. relatorio: {report_path}")
        return 0

    parser.error("comando invalido")
    return 2
