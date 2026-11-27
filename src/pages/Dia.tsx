import { useCallback, useEffect, useRef, useState } from 'react'
import { Celebracao } from '../components/Celebracao'
import { SeletorData } from '../components/SeletorData'
import { ChevronLeft, ChevronRight, Plus, Lock } from 'lucide-react'
import { api, type Atividade, type Membro, type Grupo } from '../api'
import { podeCriarEm, somaDias, pontos, fmtDuracao } from '../regras'
import { eventosDoDia, type EventoGoogle } from '../google'
import { AtividadeItem } from '../components/AtividadeItem'
import { NovaAtividade } from '../components/NovaAtividade'

const rotulo = (d: string, hoje: string) => d === hoje ? 'Hoje' : d === somaDias(hoje, 1) ? 'Amanhã' : d === somaDias(hoje, -1) ? 'Ontem' : new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })

export function Dia({ eu, hoje, pendentes, atualizarPendentes, versaoSync, dataInicial }: { eu: Membro; hoje: string; pendentes: Atividade[]; atualizarPendentes: () => void; versaoSync: number; dataInicial?: string }) {
  const [data, setData] = useState(dataInicial || hoje)
  useEffect(() => { if (dataInicial) setData(dataInicial) }, [dataInicial])
  const [lista, setLista] = useState<Atividade[]>([])
  const [eventos, setEventos] = useState<EventoGoogle[]>([])
  const [novo, setNovo] = useState(false)
  const [grupos, setGrupos] = useState<Grupo[]>([]), [copias, setCopias] = useState<Atividade[]>([]), [membros, setMembros] = useState<Membro[]>([])
  const carregar = useCallback(async () => {
    const l = await api.minhasAtividades(eu.user_id, data, data); setLista(l); atualizarPendentes()
    const g = await api.contextoGrupos(l); setGrupos(g.grupos); setCopias(g.copias); setMembros(g.membros)
  }, [eu.user_id, data, atualizarPendentes])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { eventosDoDia(data).then(setEventos) }, [data, versaoSync])
  useEffect(() => { if (versaoSync) carregar() }, [versaoSync]) // eslint-disable-line

  // Celebração: dispara uma vez quando a última atividade de HOJE recebe marcação (verde ou vermelha).
  const [festa, setFesta] = useState<{ titulo: string; texto: string } | null>(null)
  const incompleto = useRef<string | null>(null)
  useEffect(() => {
    if (data !== hoje || !lista.length || lista.some((a) => a.data !== hoje)) return
    const marcada = (a: Atividade) => a.resultado != null || a.status_pessoal != null
    if (!lista.every(marcada)) { incompleto.current = hoje; return }
    const chave = `planner.festa.${eu.user_id}.${hoje}`
    if (incompleto.current !== hoje || localStorage.getItem(chave)) return
    localStorage.setItem(chave, '1'); incompleto.current = null
    const pts = lista.reduce((s, a) => s + pontos(a), 0), nome = eu.nome.split(' ')[0]
    const todasVermelhas = lista.every((a) => a.resultado === 'nao_feito')
    setFesta(todasVermelhas ? { titulo: `💪 Dia fechado, ${nome}!`, texto: `Nem tudo saiu como planejado, mas você fechou o dia. ${pts} pts — amanhã tem mais!` }
      : { titulo: `🎉 Parabéns, ${nome}! Dia completo!`, texto: `Todas as atividades marcadas · ${pts} pts hoje` })
  }, [lista, data, hoje, eu.user_id, eu.nome])
  const fimFesta = useCallback(() => setFesta(null), [])

  const regra = podeCriarEm(data, hoje, pendentes)
  const planejado = lista.reduce((s, a) => s + (a.duracao_min ?? 30), 0), limite = eu.horas_dia * 60
  const feitas = lista.filter((a) => a.feito).length
  const pct = lista.length ? Math.round((lista.filter((a) => a.status_pessoal).length / lista.length) * 100) : 100
  return (
    <div className="space-y-4 pb-24">
      {festa && <Celebracao titulo={festa.titulo} texto={festa.texto} onFim={fimFesta} />}
      <div className="flex items-center justify-between">
        <button className="btn-sec !px-3" onClick={() => setData(somaDias(data, -1))}><ChevronLeft size={20} /></button>
        <div className="text-center">
          <SeletorData valor={data} onChange={setData}><div className="font-semibold capitalize underline decoration-dotted underline-offset-4">{rotulo(data, hoje)}</div><div className="text-xs text-slate-500">{data.split('-').reverse().join('/')} 📅</div></SeletorData>
          {data !== hoje && <div><button className="text-xs text-blue-600 font-medium mt-1" onClick={() => setData(hoje)}>Hoje</button></div>}
        </div>
        <button className="btn-sec !px-3" onClick={() => setData(somaDias(data, 1))}><ChevronRight size={20} /></button>
      </div>
      <div className="card">
        <div className="flex justify-between text-sm"><span>Checklist {pct}%</span><span>{feitas}/{lista.length} feitas · {lista.reduce((s, a) => s + pontos(a), 0)} pts</span></div>
        <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className="h-full bg-brand-600 transition-all" style={{ width: pct + '%' }} /></div>
        {data === hoje && <p className="text-xs text-slate-500 mt-2">Meta: fechar o checklist até {eu.fim_dia.slice(0, 5)}. Se sobrar pendência, você pode ajustar depois — o app não bloqueia.</p>}
        {data < hoje && <p className="text-xs text-slate-500 mt-2">Dia anterior: você pode marcar ou corrigir o checklist destas atividades.</p>}
      </div>
      <div className="card !py-3">
        <div className="flex justify-between text-sm"><span>⏱ Planejado {fmtDuracao(planejado)} de {eu.horas_dia}h</span><span className={planejado >= limite ? 'text-red-600 font-semibold' : 'text-slate-500'}>{planejado >= limite ? 'dia cheio' : `restam ${fmtDuracao(limite - planejado)}`}</span></div>
        <div className="h-2 bg-slate-100 rounded-full mt-2 overflow-hidden"><div className={`h-full transition-all ${planejado >= limite ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: Math.min(100, (planejado / limite) * 100) + '%' }} /></div>
      </div>
      {lista.length === 0 && <p className="text-center text-slate-500 text-sm py-6">Nenhuma atividade neste dia.</p>}
      <div className="space-y-2">{lista.map((a) => <AtividadeItem key={a.id} a={a} onMudou={carregar} editavel hoje={hoje} grupo={grupos.find((g) => g.id === a.grupo_id)} copias={copias} membros={membros} podeExcluir={a.data >= hoje} planejadoOutros={planejado - (a.duracao_min ?? 30)} horasDia={eu.horas_dia} />)}</div>
      {eventos.length > 0 && (
        <div className="card"><h3 className="text-sm font-semibold mb-2">📅 Google Agenda</h3>
          {eventos.map((e) => <div key={e.event_id} className="text-sm py-1 flex gap-2"><span className="text-slate-500 w-12 shrink-0">{e.hora ? e.hora.slice(0, 5) : 'Dia'}</span><span className="break-words min-w-0">{e.titulo}</span></div>)}
        </div>
      )}
      {!regra.ok && data >= hoje && <div className="card flex gap-2 text-sm text-amber-700 bg-amber-50 border-amber-200"><Lock size={16} className="shrink-0 mt-0.5" />{regra.motivo}</div>}
      {regra.ok && <button onClick={() => setNovo(true)} aria-label="Nova atividade"
        className="fixed right-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] h-14 w-14 rounded-full bg-brand-600 text-white shadow-lg flex items-center justify-center z-30"><Plus size={28} /></button>}
      {novo && <NovaAtividade data={data} eu={eu} planejado={planejado} onCriou={carregar} onFechar={() => setNovo(false)} />}
    </div>
  )
}
