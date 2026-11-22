import { useEffect, useState } from 'react'
import { api, type Categoria } from './api'

let cache: Promise<Categoria[]> | null = null
export const recarregarCategorias = () => { cache = api.categorias(); return cache }
export function useCategorias() {
  const [l, setL] = useState<Categoria[]>([])
  useEffect(() => { (cache ||= api.categorias()).then(setL).catch(() => setL([])) }, [])
  return [l, () => recarregarCategorias().then(setL)] as const
}

export function SeletorCategoria({ cats, cat, sub, onChange, disabled }: { cats: Categoria[]; cat: string | null; sub: string | null; onChange: (cat: string | null, sub: string | null) => void; disabled?: boolean }) {
  const principais = cats.filter((c) => !c.pai_id), subs = cats.filter((c) => c.pai_id && c.pai_id === cat)
  return (
    <div className="grid grid-cols-2 gap-2">
      <div><label className="lbl">Categoria</label>
        <select className="inp" disabled={disabled} value={cat || ''} onChange={(e) => onChange(e.target.value || null, null)}>
          <option value="">—</option>{principais.map((c) => <option key={c.id} value={c.id}>{c.emoji} {c.nome}</option>)}
        </select></div>
      <div><label className="lbl">Subcategoria</label>
        <select className="inp" disabled={disabled || !cat} value={sub || ''} onChange={(e) => onChange(cat, e.target.value || null)}>
          <option value="">—</option>{subs.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select></div>
    </div>
  )
}

export function ChipCategoria({ cats, cat, sub }: { cats: Categoria[]; cat: string | null; sub: string | null }) {
  const c = cats.find((x) => x.id === cat); if (!c) return null
  const s = cats.find((x) => x.id === sub)
  return <span className="inline-block mt-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white" style={{ background: c.cor || '#64748b' }}>{c.emoji} {c.nome}{s ? ` · ${s.nome}` : ''}</span>
}

export function GerenciarCategorias({ familiaId, admin }: { familiaId: string; admin?: boolean }) {
  const [cats, recarregar] = useCategorias()
  const [nome, setNome] = useState(''), [emoji, setEmoji] = useState(''), [cor, setCor] = useState('#4f46e5'), [pai, setPai] = useState('')
  const [msg, setMsg] = useState('')
  const principais = cats.filter((c) => !c.pai_id)
  const add = async () => {
    setMsg('')
    try { await api.criarCategoria({ familia_id: familiaId, nome: nome.trim(), pai_id: pai || null, emoji: pai ? null : emoji || null, cor: pai ? null : cor }); setNome(''); setEmoji(''); await recarregar(); setMsg('Adicionada ✅') }
    catch (e) { setMsg((e as Error).message) }
  }
  const podeExcluir = (c: Categoria) => admin || !!c.familia_id
  const del = async (c: Categoria) => {
    const temSubs = !c.pai_id && cats.some((s) => s.pai_id === c.id)
    if (!confirm(`Excluir "${c.nome}"${temSubs ? ' e suas subcategorias' : ''}?`)) return
    setMsg('')
    try { await api.excluirCategoria(c.id); await recarregarCategorias(); await recarregar(); setMsg('Excluída ✅') }
    catch (e) { setMsg('⚠️ ' + (e as Error).message) }
  }
  return (
    <div className="card space-y-3"><h2 className="font-semibold">Categorias</h2>
      <div className="space-y-1 text-sm max-h-72 overflow-auto">
        {principais.map((c) => (
          <div key={c.id}>
            <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ background: c.cor || '#64748b' }} /><span className="flex-1 min-w-0 truncate">{c.emoji} {c.nome}</span>
              {podeExcluir(c) && <button aria-label={`Excluir ${c.nome}`} className="shrink-0 h-7 w-7 rounded-full text-red-600 hover:bg-red-50 text-base leading-none" onClick={() => del(c)}>×</button>}</div>
            <div className="pl-5 text-xs text-slate-500 flex flex-wrap gap-1">{cats.filter((s) => s.pai_id === c.id).map((s) => (
              <span key={s.id} className="inline-flex items-center rounded bg-slate-100 pl-1.5 py-0.5 max-w-full"><span className="truncate">{s.nome}</span>{podeExcluir(s) ? <button aria-label={`Excluir ${s.nome}`} className="ml-0.5 px-1.5 text-red-600 text-sm leading-none" onClick={() => del(s)}>×</button> : <span className="pr-1.5" />}</span>))}</div>
          </div>))}
      </div>
      <div className="space-y-2 border-t pt-3">
        <select className="inp" value={pai} onChange={(e) => setPai(e.target.value)}>
          <option value="">Nova categoria</option>{principais.map((c) => <option key={c.id} value={c.id}>Subcategoria de {c.emoji} {c.nome}</option>)}
        </select>
        <div className="flex gap-2">
          {!pai && <input className="inp !w-16 text-center" placeholder="😀" value={emoji} onChange={(e) => setEmoji(e.target.value)} />}
          <input className="inp flex-1" placeholder="Nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          {!pai && <input type="color" className="h-11 w-11 rounded-xl border" value={cor} onChange={(e) => setCor(e.target.value)} />}
        </div>
        <button className="btn w-full" disabled={!nome.trim()} onClick={add}>Adicionar</button>
        {msg && <p className="text-sm text-slate-600">{msg}</p>}
      </div>
    </div>
  )
}
