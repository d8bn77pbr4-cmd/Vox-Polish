import { useId, useMemo, useRef } from 'react'
import { bodyGeometry, placement, VIEW } from '../lib/doll'
import type { Adjust, Item, Measurements } from '../lib/types'

const NONE: Adjust = { dx: 0, dy: 0, scale: 1 }

/** Mischt eine Hex-Farbe mit Schwarz (negativ) oder Weiß (positiv). */
function shade(hex: string, amount: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const target = amount < 0 ? 0 : 255
  const k = Math.abs(amount)
  const part = (i: number) => {
    const v = parseInt(m[1].slice(i, i + 2), 16)
    return Math.round(v + (target - v) * k)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${part(0)}${part(2)}${part(4)}`
}

interface Props {
  measurements: Partial<Measurements>
  skin: string
  items: Item[]
  url: (path: string) => string | undefined
  adjust?: Record<string, Adjust>
  /** Im Bearbeiten-Modus lassen sich Teile antippen und verschieben. */
  editable?: boolean
  selectedId?: string | null
  onSelect?: (id: string | null) => void
  onAdjust?: (id: string, adjust: Adjust) => void
  className?: string
}

export function DollFigure({ measurements, skin, items, url, adjust = {}, editable, selectedId, onSelect, onAdjust, className }: Props) {
  const uid = useId().replace(/:/g, '')
  const svg = useRef<SVGSVGElement>(null)
  const drag = useRef<{ id: string; x: number; y: number; start: Adjust } | null>(null)
  const geo = useMemo(() => bodyGeometry(measurements), [measurements])
  const placed = useMemo(
    () =>
      items
        .map((item) => {
          const p = placement(item, geo)
          const a = adjust[item.id] ?? NONE
          const w = p.w * a.scale
          const h = p.h * a.scale
          return { item, z: p.z, x: p.x + a.dx - (w - p.w) / 2, y: p.y + a.dy - (h - p.h) / 2, w, h }
        })
        .sort((a, b) => a.z - b.z),
    [items, geo, adjust],
  )

  const point = (e: React.PointerEvent) => {
    const ctm = svg.current?.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    return { x: (e.clientX - ctm.e) / ctm.a, y: (e.clientY - ctm.f) / ctm.d }
  }
  const down = (e: React.PointerEvent, id: string) => {
    if (!editable) return
    e.stopPropagation()
    onSelect?.(id)
    ;(e.target as Element).setPointerCapture(e.pointerId)
    drag.current = { id, ...point(e), start: adjust[id] ?? NONE }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = point(e)
    onAdjust?.(d.id, { ...d.start, dx: d.start.dx + p.x - d.x, dy: d.start.dy + p.y - d.y })
  }
  const up = () => {
    drag.current = null
  }

  const span = Math.max(geo.half.shoulder, geo.half.hip) + 46
  const s = geo.shapes
  return (
    <svg
      ref={svg}
      className={`doll ${editable ? 'editable' : ''} ${className ?? ''}`}
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      role="img"
      aria-label="Anprobe-Puppe"
      onPointerDown={() => editable && onSelect?.(null)}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <defs>
        <linearGradient id={`skin${uid}`} gradientUnits="userSpaceOnUse" x1={geo.cx - span} x2={geo.cx + span} y1="0" y2="0">
          <stop offset="0" stopColor={shade(skin, -0.2)} />
          <stop offset="0.3" stopColor={skin} />
          <stop offset="0.5" stopColor={shade(skin, 0.18)} />
          <stop offset="0.72" stopColor={skin} />
          <stop offset="1" stopColor={shade(skin, -0.24)} />
        </linearGradient>
        <radialGradient id={`floor${uid}`}>
          <stop offset="0" stopColor="rgba(40,30,20,0.22)" />
          <stop offset="1" stopColor="rgba(40,30,20,0)" />
        </radialGradient>
      </defs>
      <ellipse cx={geo.cx} cy={geo.y.floor + 4} rx={span * 1.1} ry="14" fill={`url(#floor${uid})`} />
      <g fill={`url(#skin${uid})`}>
        <path d={s.armL} />
        <path d={s.armR} />
        <path d={s.footL} />
        <path d={s.footR} />
        <path d={s.legL} />
        <path d={s.legR} />
        <path d={s.neck} />
        <path d={s.torso} />
        <ellipse cx={geo.head.cx} cy={geo.head.cy} rx={geo.head.rx} ry={geo.head.ry} />
      </g>
      {placed.map(({ item, x, y, w, h }) => {
        const href = url(item.image_path)
        if (!href) return null
        return (
          <image
            key={item.id}
            href={href}
            x={x}
            y={y}
            width={w}
            height={h}
            preserveAspectRatio="xMidYMid meet"
            onPointerDown={(e) => down(e, item.id)}
          />
        )
      })}
      {editable &&
        placed
          .filter((p) => p.item.id === selectedId)
          .map((p) => <rect key="sel" className="doll-selection" x={p.x} y={p.y} width={p.w} height={p.h} rx="8" />)}
    </svg>
  )
}
