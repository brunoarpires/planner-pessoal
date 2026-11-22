import { useEffect, useRef } from 'react'

/** Fogos/confete leve em canvas (sem dependências). Fecha sozinho em ~4s ou ao tocar; não bloqueia a tela. */
export function Celebracao({ titulo, texto, onFim }: { titulo: string; texto: string; onFim: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const t = setTimeout(onFim, 4500)
    try { navigator.vibrate?.([60, 40, 120]) } catch { /* */ }
    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const cv = ref.current
    if (reduzir || !cv) return () => clearTimeout(t)
    const ctx = cv.getContext('2d')!, dpr = window.devicePixelRatio || 1
    const W = innerWidth, H = innerHeight; cv.width = W * dpr; cv.height = H * dpr; ctx.scale(dpr, dpr)
    const cores = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#a855f7', '#facc15']
    type P = { x: number; y: number; vx: number; vy: number; c: string; v: number; r: number; conf: boolean; a: number }
    const ps: P[] = []
    const explodir = (x: number, y: number) => { for (let i = 0; i < 60; i++) { const ang = Math.random() * Math.PI * 2, s = 2 + Math.random() * 4
      ps.push({ x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, c: cores[i % cores.length], v: 1, r: 2 + Math.random() * 2, conf: false, a: 0 }) } }
    for (let i = 0; i < 120; i++) ps.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.5, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3, c: cores[i % cores.length], v: 1, r: 4 + Math.random() * 4, conf: true, a: Math.random() * 6 })
    const tiros = [0, 500, 1000, 1500, 2100].map((d) => setTimeout(() => explodir(W * (0.2 + Math.random() * 0.6), H * (0.15 + Math.random() * 0.3)), d))
    let raf = 0
    const passo = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of ps) {
        p.x += p.vx; p.y += p.vy
        if (p.conf) { p.a += 0.1; p.vy = Math.min(p.vy + 0.02, 4) } else { p.vy += 0.06; p.vx *= 0.98; p.v -= 0.012 }
        if (p.v <= 0 || p.y > H + 20) continue
        ctx.globalAlpha = Math.max(p.v, 0); ctx.fillStyle = p.c
        if (p.conf) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); ctx.restore() }
        else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill() }
      }
      raf = requestAnimationFrame(passo)
    }
    raf = requestAnimationFrame(passo)
    return () => { clearTimeout(t); tiros.forEach(clearTimeout); cancelAnimationFrame(raf) }
  }, [onFim])
  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <canvas ref={ref} className="absolute inset-0 h-full w-full" />
      <button type="button" onClick={onFim} className="pointer-events-auto absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 w-[85%] max-w-sm rounded-2xl bg-white/95 shadow-2xl px-5 py-4 text-center animate-[pulse_1s_ease-in-out_1]">
        <div className="text-lg font-bold text-slate-800">{titulo}</div>
        <div className="text-sm text-slate-600 mt-1">{texto}</div>
        <div className="text-[11px] text-slate-400 mt-2">toque para fechar</div>
      </button>
    </div>
  )
}
