import { useRef } from 'react'
import type { Box } from '../lib/types'

const MIN = 0.04
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se'

/** Foto mit einem Rahmen, den man verschieben und an den Ecken ziehen kann. */
export function BoxEditor({ src, box, onChange }: { src: string; box: Box; onChange: (box: Box) => void }) {
  const wrap = useRef<HTMLDivElement>(null)
  const drag = useRef<{ handle: Handle; x: number; y: number; start: Box } | null>(null)

  const rel = (e: React.PointerEvent) => {
    const r = wrap.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }
  const down = (e: React.PointerEvent, handle: Handle) => {
    e.stopPropagation()
    e.preventDefault()
    ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
    drag.current = { handle, ...rel(e), start: box }
  }
  const move = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const p = rel(e)
    const dx = p.x - d.x
    const dy = p.y - d.y
    const s = d.start
    if (d.handle === 'move') {
      onChange({ ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) })
      return
    }
    let x0 = s.x
    let y0 = s.y
    let x1 = s.x + s.w
    let y1 = s.y + s.h
    if (d.handle.includes('w')) x0 = clamp(s.x + dx, 0, x1 - MIN)
    if (d.handle.includes('e')) x1 = clamp(x1 + dx, x0 + MIN, 1)
    if (d.handle.includes('n')) y0 = clamp(s.y + dy, 0, y1 - MIN)
    if (d.handle.includes('s')) y1 = clamp(y1 + dy, y0 + MIN, 1)
    onChange({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 })
  }
  const up = () => {
    drag.current = null
  }
  const pct = (v: number) => `${v * 100}%`

  return (
    <div className="boxed" ref={wrap} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <img src={src} alt="Foto" draggable={false} />
      <div
        className="boxed-rect"
        style={{ left: pct(box.x), top: pct(box.y), width: pct(box.w), height: pct(box.h) }}
        onPointerDown={(e) => down(e, 'move')}
      >
        {(['nw', 'ne', 'sw', 'se'] as const).map((h) => (
          <span key={h} className={`boxed-handle ${h}`} onPointerDown={(e) => down(e, h)} />
        ))}
      </div>
    </div>
  )
}
