import { SeletorHora } from '../components/SeletorHora'
import { useEffect, useState } from 'react'
import { api, type Familia, type Membro } from '../api'
import { supabase } from '../supabase'
import { conectarGoogle, desconectarGoogle, sincronizarGoogle, statusGoogle, type StatusGoogle } from '../google'
import { ativarPush } from '../push'
import { GerenciarCategorias } from '../categorias'
import { Convidar } from '../components/Convidar'

export function Ajustes({ eu, onMudou }: { eu: Membro; onMudou: () => void }) {
  const [c, setC] = useState({ inicio_dia: eu.inicio_dia.slice(0, 5), horas_dia: String(eu.horas_dia), fim_dia: eu.fim_dia.slice(0, 5), lembrete_min: String(eu.lembrete_min), lembrete_email: eu.lembrete_email, lembrete_push: eu.lembrete_push, nome: eu.nome })
  const [toast, setToast] = useState<{ ok: boolean; txt: string } | null>(null), [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState(''), [google, setGoogle] = useState<StatusGoogle | null>(null)
  const [familia, setFamilia] = useState<Familia | null>(null), [membros, setMembros] = useState<Membro[]>([])
  const admin = eu.papel === 'administrador'
  const carregarFam = () => { api.familia().then(setFamilia); api.membros().then(setMembros) }
  useEffect(carregarFam, [])
  const carregarGoogle = () => { statusGoogle().then(setGoogle) }
  useEffect(carregarGoogle, [])
  const quando = (d: string | null) => d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'ainda não'
  const tentar = async (f: () => Promise<unknown>, ok?: string) => { setMsg(''); try { const r = await f(); setMsg(typeof r === 'string' ? r : ok || 'Salvo ✅') } catch (e) { setMsg((e as Error).message) } }
  return (
    <div className="space-y-4">
      <div className="card space-y-3"><h2 className="font-semibold">Meu dia</h2>
        <div><label className="lbl">Meu nome</label><input className="inp" value={c.nome} onChange={(e) => setC({ ...c, nome: e.target.value })} /></div>
        <div className="space-y-3">
          <div><label className="lbl">Início do dia</label><SeletorHora valor={c.inicio_dia} onChange={(v) => setC({ ...c, inicio_dia: v })} /></div>
          <div><label className="lbl">Horas no dia</label><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} className="inp" value={c.horas_dia} onChange={(e) => setC({ ...c, horas_dia: e.target.value.replace(/\D/g, '') })} /></div>
        </div>
        <div><label className="lbl">Fim do dia (obrigatório) — fechar checklist até</label><SeletorHora valor={c.fim_dia} onChange={(v) => setC({ ...c, fim_dia: v || '22:00' })} /></div>
        <div><label className="lbl">Lembrar antes da atividade (min)</label><input type="text" inputMode="numeric" pattern="[0-9]*" maxLength={3} className="inp" value={c.lembrete_min} onChange={(e) => setC({ ...c, lembrete_min: e.target.value.replace(/\D/g, '') })} /></div>
        <button className="btn w-full" disabled={salvando} onClick={async () => {
          const h = Number(c.horas_dia), l = Number(c.lembrete_min)
          if (!c.horas_dia || h < 1 || h > 24) return setToast({ ok: false, txt: 'Horas no dia deve ser entre 1 e 24.' })
          if (c.lembrete_min === '' || l < 0 || l > 240) return setToast({ ok: false, txt: 'Lembrete deve ser entre 0 e 240 min.' })
          setSalvando(true); setToast(null)
          try {
            const s = await api.salvarConfig(eu.user_id, { ...c, horas_dia: h, lembrete_min: l })
            setC({ ...c, horas_dia: String(s.horas_dia), lembrete_min: String(s.lembrete_min) })
            setToast({ ok: true, txt: `Salvo ✅ (${s.horas_dia}h no dia)` }); onMudou()
          } catch (e) { setToast({ ok: false, txt: (e as Error).message }) } finally { setSalvando(false); setTimeout(() => setToast(null), 4000) }
        }}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        {toast && <div role="status" className={`fixed left-4 right-4 bottom-24 z-50 rounded-xl px-4 py-3 text-sm text-white shadow-lg text-center ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>{toast.txt}</div>}
      </div>
      <div className="card space-y-2"><h2 className="font-semibold">Integrações</h2>
        <button className="btn-sec w-full" onClick={() => tentar(ativarPush)}>🔔 Ativar notificações neste aparelho</button>
        <div className="rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="font-medium">📅 Google Agenda</div>
          {!google ? <p className="text-sm text-slate-500">Verificando…</p>
            : google.conectado ? <>
              <p className={`text-sm ${google.erro ? 'text-red-600' : 'text-emerald-700'}`}>{google.erro ? `⚠️ ${google.erro}` : '✅ Conectado — sincroniza sozinho a cada 5 min e ao editar.'}</p>
              <p className="text-xs text-slate-500">Última sincronização: {quando(google.ultimo_sync)}</p>
              <div className="flex gap-2">
                <button className="btn-sec flex-1 text-sm" onClick={() => tentar(async () => { await sincronizarGoogle(); carregarGoogle() }, 'Sincronizado ✅')}>Sincronizar agora</button>
                {google.erro ? <button className="btn flex-1 text-sm" onClick={() => tentar(conectarGoogle)}>Reconectar</button>
                  : <button className="btn-sec text-sm text-red-600" onClick={() => confirm('Desconectar o Google Agenda?') && tentar(async () => { await desconectarGoogle(); carregarGoogle() }, 'Desconectado')}>Desconectar</button>}
              </div></>
            : <>
              <p className="text-sm text-slate-500">Não conectado. Conecte uma vez e pronto: suas atividades vão para a agenda e os eventos aparecem no app.</p>
              <button className="btn w-full" onClick={() => tentar(conectarGoogle)}>Conectar Google Agenda</button></>}
        </div>
      </div>
      {msg && <p className="text-sm text-center">{msg}</p>}
      <div className="card space-y-2"><h2 className="font-semibold">Família {familia?.nome}</h2>
        {admin && familia && <Convidar familia={familia.nome} codigo={familia.codigo_convite} />}
        {admin && familia && <div className="text-sm">Código de convite: <b className="tracking-widest">{familia.codigo_convite}</b> <button className="text-brand-600 ml-2" onClick={() => tentar(async () => { await api.novoCodigo(); carregarFam() }, 'Novo código gerado')}>gerar novo</button></div>}
        {membros.map((m) => (
          <div key={m.user_id} className="flex items-center gap-2 py-1 text-sm">
            <span className="flex-1 min-w-0 truncate">{m.nome} {m.papel === 'administrador' && <span className="text-xs bg-brand-100 text-brand-700 rounded px-1">admin</span>}<br /><span className="text-xs text-slate-500">fim do dia {m.fim_dia.slice(0, 5)}</span></span>
            {admin && m.user_id !== eu.user_id && <>
              <button className="text-xs text-brand-600" onClick={() => tentar(async () => { await api.definirPapel(m.user_id, m.papel === 'administrador' ? 'membro' : 'administrador'); carregarFam() })}>{m.papel === 'administrador' ? 'tirar admin' : 'tornar admin'}</button>
              <button className="text-xs text-red-600" onClick={() => confirm(`Remover ${m.nome}?`) && tentar(async () => { await api.remover(m.user_id); carregarFam() })}>remover</button></>}
          </div>))}
      </div>
      <GerenciarCategorias familiaId={eu.familia_id} admin={admin} />
      <button className="btn-sec w-full" onClick={() => supabase.auth.signOut()}>Sair da conta</button>
    </div>
  )
}
