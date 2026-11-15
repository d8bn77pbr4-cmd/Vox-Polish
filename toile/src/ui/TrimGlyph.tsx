import type { Trim, Finish } from '../core/model';

export const FINISH_COLOR: Record<Finish, string> = { gold: '#c9a45a', silver: '#c8c8cc', gunmetal: '#4a4b50', horn: '#4a3426', pearl: '#ece6dc', plastic: '', wood: '#9a6b3f', fabric: '' };
export const trimColor = (t: Pick<Trim, 'finish' | 'color'>) => FINISH_COLOR[t.finish] || t.color;

/** 2D glyph of a trim, drawn in mm around (0,0). */
export function TrimGlyph({ t, selected }: { t: Trim; selected?: boolean }) {
  const c = trimColor(t), r = t.size / 2, sw = Math.max(0.3, t.size * 0.04);
  const ring = selected ? <circle r={Math.max(r, 6) + 3} fill="none" stroke="#d8c3a0" strokeWidth={0.8} strokeDasharray="2 1.5" /> : null;
  const metal = ['gold', 'silver', 'gunmetal'].includes(t.finish);
  const grad = `tg-${t.id}`;
  const defs = <defs><radialGradient id={grad} cx="35%" cy="30%" r="75%"><stop offset="0" stopColor="#fff" stopOpacity={metal ? 0.7 : 0.35} /><stop offset="0.45" stopColor={c} /><stop offset="1" stopColor="#000" stopOpacity={0.55} /></radialGradient></defs>;
  switch (t.type) {
    case 'button4': case 'button2': {
      const holes = t.type === 'button4' ? [[-1, -1], [1, -1], [-1, 1], [1, 1]] : [[-1, 0], [1, 0]];
      return <g transform={`rotate(${t.rot})`}>{defs}<circle r={r} fill={`url(#${grad})`} stroke="rgba(0,0,0,.45)" strokeWidth={sw} /><circle r={r * 0.72} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={sw} />
        {holes.map(([x, y], i) => <circle key={i} cx={x * r * 0.22} cy={y * r * 0.22} r={r * 0.1} fill="rgba(0,0,0,.6)" />)}{ring}</g>;
    }
    case 'shank': return <g>{defs}<circle r={r} fill={`url(#${grad})`} stroke="rgba(0,0,0,.4)" strokeWidth={sw} /><circle r={r * 0.55} fill="none" stroke="rgba(255,255,255,.25)" strokeWidth={sw} />{ring}</g>;
    case 'snap': return <g>{defs}<circle r={r} fill={`url(#${grad})`} stroke="rgba(0,0,0,.4)" strokeWidth={sw} /><circle r={r * 0.35} fill="none" stroke="rgba(0,0,0,.35)" strokeWidth={sw * 1.5} />{ring}</g>;
    case 'rivet': return <g>{defs}<circle r={r} fill={`url(#${grad})`} stroke="rgba(0,0,0,.5)" strokeWidth={sw} />{ring}</g>;
    case 'eyelet': return <g>{defs}<circle r={r * 0.78} fill="#0b0b0c" stroke={`url(#${grad})`} strokeWidth={r * 0.45} />{ring}</g>;
    case 'zipper': {
      const L = t.length ?? 300, w = Math.max(4, t.size);
      return <g transform={`rotate(${t.rot})`}>{defs}
        <rect x={-w * 1.4} y={0} width={w * 2.8} height={L} fill={t.color} opacity={0.9} />
        <line x1={0} y1={0} x2={0} y2={L} stroke={metal ? c : '#222'} strokeWidth={w * 0.9} strokeDasharray={`${w * 0.35} ${w * 0.25}`} />
        <rect x={-w * 0.6} y={-w * 0.2} width={w * 1.2} height={w * 2.4} rx={w * 0.3} fill={`url(#${grad})`} stroke="rgba(0,0,0,.5)" strokeWidth={sw} />
        <rect x={-w * 0.35} y={w * 2} width={w * 0.7} height={w * 2.6} rx={w * 0.25} fill={`url(#${grad})`} stroke="rgba(0,0,0,.5)" strokeWidth={sw} />
        {selected && <rect x={-w * 1.6} y={-4} width={w * 3.2} height={L + 8} fill="none" stroke="#d8c3a0" strokeWidth={0.8} strokeDasharray="2 1.5" />}</g>;
    }
    case 'drawcord': {
      const L = t.length ?? 400, w = Math.max(3, t.size);
      return <g transform={`rotate(${t.rot})`}>
        <path d={`M0 0 C ${w * 2} ${L * 0.3}, ${-w * 2} ${L * 0.6}, ${w} ${L}`} fill="none" stroke={t.color} strokeWidth={w} strokeLinecap="round" />
        <rect x={w - w * 0.7} y={L - 2} width={w * 1.4} height={w * 4} rx={w * 0.4} fill="#c8c8cc" stroke="rgba(0,0,0,.4)" strokeWidth={sw} />
        {selected && <circle r={8} fill="none" stroke="#d8c3a0" strokeWidth={0.8} strokeDasharray="2 1.5" />}</g>;
    }
    case 'label': {
      const w = t.size, h = t.size * 0.42;
      return <g transform={`rotate(${t.rot})`}><rect x={-w / 2} y={-h / 2} width={w} height={h} fill={t.color} stroke="rgba(255,255,255,.2)" strokeWidth={sw} />
        <text textAnchor="middle" dominantBaseline="middle" fontSize={h * 0.5} fill="#e9e1d3" fontFamily="Cormorant Garamond" letterSpacing={h * 0.12}>{t.text ?? 'TOILE'}</text>
        {selected && <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} fill="none" stroke="#d8c3a0" strokeWidth={0.8} strokeDasharray="2 1.5" />}</g>;
    }
    case 'patch': {
      const w = t.size, h = t.size * 0.8;
      return <g transform={`rotate(${t.rot})`}><rect x={-w / 2} y={-h / 2} width={w} height={h} rx={h * 0.18} fill={t.color} stroke="rgba(0,0,0,.35)" strokeWidth={sw} />
        <rect x={-w / 2 + 2.5} y={-h / 2 + 2.5} width={w - 5} height={h - 5} rx={h * 0.14} fill="none" stroke="rgba(0,0,0,.45)" strokeWidth={0.6} strokeDasharray="2 1.2" />
        <text textAnchor="middle" dominantBaseline="middle" fontSize={h * 0.28} fill="#1b1b1d" fontFamily="Cormorant Garamond" fontWeight={600}>{t.text ?? 'T'}</text>
        {selected && <rect x={-w / 2 - 3} y={-h / 2 - 3} width={w + 6} height={h + 6} fill="none" stroke="#d8c3a0" strokeWidth={0.8} strokeDasharray="2 1.5" />}</g>;
    }
  }
}
