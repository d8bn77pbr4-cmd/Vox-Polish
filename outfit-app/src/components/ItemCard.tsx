import type { Item } from '../lib/types'

export const tint = (item: Item) => `color-mix(in srgb, ${item.colors[0]?.hex ?? '#cfc8bd'} 13%, #f3efe8)`

interface Props {
  item: Item
  src?: string
  onClick?: () => void
  /** Kleine Kachel ohne Beschriftung (für Leisten). */
  compact?: boolean
  active?: boolean
  badge?: string
}

export function ItemCard({ item, src, onClick, compact, active, badge }: Props) {
  return (
    <button type="button" className={`card ${compact ? 'compact' : ''} ${active ? 'active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="card-img" style={{ background: tint(item), aspectRatio: compact ? '1' : String(Math.min(1.5, Math.max(0.55, item.aspect))) }}>
        {src && <img src={src} alt={item.name} loading="lazy" draggable={false} />}
        {(badge || item.is_wishlist) && <span className="badge">{badge ?? 'Wunsch'}</span>}
      </span>
      {!compact && (
        <span className="card-cap">
          <span className="card-name">{item.name || item.subcategory || 'Ohne Namen'}</span>
          <span className="dots">
            {item.colors.slice(0, 3).map((c, i) => (
              <i key={i} style={{ background: c.hex }} title={c.name} />
            ))}
          </span>
        </span>
      )}
    </button>
  )
}
