import { useEffect, useState } from 'react'
import { api, type Atividade, type Membro } from '../api'
import { pontos } from '../regras'
import { useCategorias } from '../categorias'

export function Mes({ eu, hoje }: { eu: Membro; hoje: string }) {
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [ativs, setAtivs] = useState<Atividade[]>([])
  const [rank, setRank] = useState<Awaited<ReturnType<typeof api.ranking>>>([])
  useEffect(() => {
    const [y, m] = mes.split('-').map(Number); const fim = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)
    api.minhasAtividades(eu.user_id, mes + '-01', fim).then(setAtivs)
    api.ranking(mes).then(setRank)
  }, [mes, eu.user_id])
  const [cats] = useCategorias()
  const total = ativs.reduce((s, a) => s + pontos(a), 0)
  const dias = [...new Set(ativs.map((a) => a.data))].sort()
  const medalha = ['🥇', '🥈', '🥉']
  return (
    <div className="space-y-4">
      <input type="month" className="inp" value={mes} onChange={(e) => setMes(e.target.value)} />
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card !p-3"><div className="text-2xl font-bold text-brand-600">{total}</div><div className="text-xs text-slate-500">pontos</div></div>
        <div className="card !p-3"><div className="text-2xl font-bold">{ativs.filter((a) => a.feito).length}/{ativs.length}</div><div className="text-xs text-slate-500">feitas</div></div>
        <div className="card !p-3"><div className="text-2xl font-bold">{ativs.length ? Math.round((total / (ativs.length * 15)) * 100) : 0}%</div><div className="text-xs text-slate-500">aproveit.</div></div>
      </div>
      <div className="card"><h2 className="font-semibold mb-2">🏆 Ranking da família</h2>
        {rank.map((r, i) => (
          <div key={r.user_id} className={`flex items-center gap-3 py-2 ${r.user_id === eu.user_id ? 'font-semibold' : ''}`}>
            <span className="w-6 text-center">{medalha[i] || i + 1}</span><span className="flex-1 min-w-0 truncate">{r.nome}</span>
            <span className="text-xs text-slate-500">{r.feitas}/{r.total}</span><span className="w-16 text-right">{r.pontos} pts</span>
          </div>))}
      </div>
      <div className="card"><h2 className="font-semibold mb-2">Pontos por categoria</h2>
        {(() => { const g = new Map<string, { p: number; n: number }>()
          ativs.forEach((a) => { const k = a.categoria_id || ''; const v = g.get(k) || { p: 0, n: 0 }; v.p += pontos(a); v.n++; g.set(k, v) })
          const max = Math.max(1, ...[...g.values()].map((v) => v.p))
          if (!g.size) return <p className="text-sm text-slate-500">Sem atividades neste mês.</p>
          return [...g.entries()].sort((x, y) => y[1].p - x[1].p).map(([k, v]) => { const c = cats.find((x) => x.id === k)
            return <div key={k || 'sem'} className="flex items-center gap-3 py-1 text-sm"><span className="w-28 truncate">{c ? `${c.emoji} ${c.nome}` : 'Sem categoria'}</span>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full" style={{ width: (v.p / max) * 100 + '%', background: c?.cor || '#94a3b8' }} /></div><span className="w-14 text-right">{v.p} pts</span></div> }) })()}
      </div>
      <div className="card"><h2 className="font-semibold mb-2">Pontos por dia</h2>
        {dias.length === 0 && <p className="text-sm text-slate-500">Sem atividades neste mês.</p>}
        {dias.map((d) => { const l = ativs.filter((a) => a.data === d); const p = l.reduce((s, a) => s + pontos(a), 0)
          return <div key={d} className="flex items-center gap-3 py-1 text-sm"><span className="w-12 text-slate-500">{d.slice(8)}/{d.slice(5, 7)}</span>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-brand-500" style={{ width: (p / (l.length * 15)) * 100 + '%' }} /></div><span className="w-14 text-right">{p} pts</span></div> })}
      </div>
      <p className="text-xs text-slate-500 text-center">Regra: 10 pts por atividade feita · +5 se "fiz bem".</p>
    </div>
  )
}
