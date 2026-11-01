import textMask from '../../assets/brand/sgcg-text.png';
import blueMask from '../../assets/brand/sgcg-blue.png';
import cyanMask from '../../assets/brand/sgcg-cyan.png';

/*
 * Logotipo do SGCG em três camadas de máscara (texto, hexágono azul e nós claros), cada uma pintada com um token do tema.
 * Assim ele segue o modo claro/escuro e o tema de cor escolhido em Configurações, sem uma imagem para cada combinação.
 * `iconOnly` mostra só o hexágono (menu recolhido).
 */
const RATIO = 1765 / 630; // largura / altura do logotipo completo
const ICON_FRACTION = 0.32; // parte da largura ocupada pelo hexágono

const layer = (url, color) => ({
  position: 'absolute',
  inset: 0,
  backgroundColor: color,
  WebkitMaskImage: `url(${url})`,
  maskImage: `url(${url})`,
  WebkitMaskRepeat: 'no-repeat',
  maskRepeat: 'no-repeat',
  WebkitMaskSize: '100% 100%',
  maskSize: '100% 100%',
});

export default function BrandLogo({ height = 44, iconOnly = false, className = '' }) {
  const full = { width: height * RATIO, height };
  const box = iconOnly ? { width: full.width * ICON_FRACTION, height } : full;
  return (
    <span
      role="img"
      aria-label="SGCG, Governança e Controle"
      className={`relative inline-block shrink-0 overflow-hidden ${className}`}
      style={box}
    >
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 0, ...full }}>
        <span style={layer(blueMask, 'var(--md-primary)')} />
        <span style={layer(cyanMask, 'color-mix(in srgb, var(--md-primary) 55%, var(--md-secondary))')} />
        {iconOnly ? null : <span style={layer(textMask, 'var(--md-on-surface)')} />}
      </span>
    </span>
  );
}
