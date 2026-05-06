from __future__ import annotations

from pathlib import Path

try:
    from jinja2 import Environment, FileSystemLoader, StrictUndefined
except ImportError as exc:  # pragma: no cover
    raise SystemExit(
        "Jinja2 nao instalado. Execute o bootstrap do instalador antes de usar."
    ) from exc


class TemplateRenderer:
    def __init__(self, template_root: Path) -> None:
        self.env = Environment(
            loader=FileSystemLoader(str(template_root)),
            undefined=StrictUndefined,
            autoescape=False,
            trim_blocks=True,
            lstrip_blocks=True,
        )

    def render(self, template_name: str, **context: object) -> str:
        return self.env.get_template(template_name).render(**context)
