import { SeletorHora } from './SeletorHora'
import { useEffect, useRef, useState } from 'react'
import { api, type Membro } from '../api'
import { dentroDaJanela, cabeNoDia, DURACAO_PADRAO, naoCabem, participantesFinais } from '../regras'
import { TempoPrevisto } from './TempoPrevisto'
import { sincronizarEmBreve } from '../google'
import { SeletorCategoria, useCategorias } from '../categorias'

import { SeletorData } from './SeletorData'
import { SeletorCanal, type Canal } from './SeletorCanal'
import { SeletorRecorrencia, REC_VAZIA, paraRegra, type RecForm } from './SeletorRecorrencia'
import { agoraNoFuso, fmtData } from '../regras'
export function NovaAtividade({ data: dataInicial, eu, planejado, onCriou, onFechar }: { data: string; eu: Membro; planejado: number; onCriou: () => void; onFechar: () => void }) {
  const [data, setData] = useState(dataInicial)
  const [titulo, setTitulo] = useState(''), [hora, setHora] = useState(''), [obs, setObs] = useState('')
  const [cats] = useCategorias(), [cat, setCat] = useState<string | null>(null), [sub, setSub] = useState<string | null>(null)
  const [dur, setDur] = useState(DURACAO_PADRAO), [canal, setCanal] = useState<Canal>('ambos')
  const [comp, setComp] = useState(false), [todaFam, setTodaFam] = useState(true), [escolhidos, setEscolhidos] = useState<string[]>([])
  const [membros, setMembros] = useState<Membro[]>([]), [planFam, setPlanFam] = useState<Record<string, number> | null>(null)
  useEffect(() => { api.membros().then(setMembros).catch(() => {}) }, [])
  useEffect(() => { setPlanFam(null); api.planejadoFamilia(data).then(setPlanFam).catch(() => {}) }, [data])
  const meuPlan = planFam ? (planFam[eu.user_id] ?? 0) : planejado
  const cabe = cabeNoDia(meuPlan, dur, eu.horas_dia)
  const outros = membros.filter((m) => m.user_id !== eu.user_id)
  const parts = participantesFinais(eu.user_id, membros.map((m) => m.user_id), escolhidos, todaFam)
  const semTempo = comp ? naoCabem(membros.filter((m) => parts.includes(m.user_id)), planFam ?? {}, dur) : []
  const okComp = !comp || (parts.length >= 2 && semTempo.length === 0)
  const [rec, setRec] = useState<RecForm>(REC_VAZIA)
  const [erro, setErro] = useState(''), [salvando, setSalvando] = useState(false)
  const fora = hora && !dentroDaJanela(hora, eu.inicio_dia.slice(0, 5), eu.horas_dia)
  const enviando = useRef(false)
  const salvar = async () => {
    if (enviando.current) return
    const repete = rec.tipo !== 'nenhuma'
    if (!repete && !cabe.ok) { setErro(cabe.motivo!); return }
    if (!repete && !okComp || comp && parts.length < 2) { setErro(semTempo.length ? `Não cabe no dia de: ${semTempo.map((x) => x.nome).join(', ')}.` : 'Escolha pelo menos mais uma pessoa.'); return }
    setErro(''); setSalvando(true); enviando.current = true
    try {
      const nova = { data, titulo: titulo.trim(), hora: hora || null, observacao: obs || null, duracao_min: dur, categoria_id: cat, subcategoria_id: sub }
      const regra = paraRegra(rec, data, hora || null)
      if (regra) {
        if (regra.tipo === 'semanal' && !regra.dias_semana.length) throw new Error('Escolha os dias da semana.')
        if (regra.tipo === 'horas' && !hora) regra.hora = '08:00'
        const r = await api.criarRecorrencia(eu, regra, { ...nova, lembrete_canal: canal, participantes: comp ? parts : [], toda_familia: comp && todaFam }, agoraNoFuso(eu.fuso).data)
        sincronizarEmBreve(500); onCriou()
        if (r.pulados.length) alert(`Criadas ${r.geradas} ocorrências. Puladas por falta de tempo no dia: ${r.pulados.map(fmtData).join(', ')}.`)
        onFechar(); return
      }
      if (comp) await api.criarCompartilhada(nova, parts, todaFam, canal); else await api.criar({ ...nova, lembrete_canal: canal })
      sincronizarEmBreve(500)
      onCriou(); onFechar()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false); enviando.current = false }
  }
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center" onClick={onFechar}>
      <div className="w-full sm:max-w-md bg-white max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold">Nova atividade · <SeletorData valor={data} onChange={setData}><span className="underline decoration-dotted underline-offset-4">{data.split('-').reverse().join('/')} 📅</span></SeletorData></h2>
        <div><label className="lbl">Título</label><input className="inp" autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
        <div><label className="lbl">Horário</label><SeletorHora vazio valor={hora} onChange={setHora} />
          {fora && <p className="text-xs text-amber-600 mt-1">Fora da sua janela do dia ({eu.inicio_dia.slice(0, 5)} + {eu.horas_dia}h).</p>}</div>
        <TempoPrevisto valor={dur} onChange={setDur} />
        <p className={`text-xs ${cabe.ok ? 'text-slate-500' : 'text-red-600'}`}>{cabe.ok ? `Restam ${Math.floor((cabe.restante - dur) / 60)}h${String((cabe.restante - dur) % 60).padStart(2, '0')} no dia depois desta.` : cabe.motivo}</p>
        <SeletorCategoria cats={cats} cat={cat} sub={sub} onChange={(c, s) => { setCat(c); setSub(s) }} />
        <SeletorRecorrencia v={rec} onChange={setRec} data={data} hora={hora} setHora={setHora} />
        <SeletorCanal valor={canal} onChange={setCanal} />
        <div><label className="lbl">Observação</label><textarea className="inp" rows={2} value={obs} onChange={(e) => setObs(e.target.value)} /></div>
        {outros.length > 0 && <div>
          <div className="grid grid-cols-2 gap-2">
            {[false, true].map((v) => <button key={String(v)} type="button" onClick={() => setComp(v)} className={`rounded-xl border px-2 py-2 text-sm ${comp === v ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold' : 'border-slate-200'}`}>{v ? '👥 Compartilhada' : '👤 Individual'}</button>)}
          </div>
          {comp && <div className="mt-2 space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={todaFam} onChange={(e) => setTodaFam(e.target.checked)} /> Toda a família</label>
            {!todaFam && <div className="flex flex-wrap gap-2">
              <span className="rounded-full px-3 py-1 text-xs bg-brand-600 text-white">{eu.nome} (você)</span>
              {outros.map((m) => { const on = escolhidos.includes(m.user_id), falta = semTempo.find((x) => x.user_id === m.user_id)
                return <button key={m.user_id} type="button" onClick={() => setEscolhidos(on ? escolhidos.filter((u) => u !== m.user_id) : [...escolhidos, m.user_id])}
                  className={`rounded-full px-3 py-1 text-xs border ${on ? (falta ? 'bg-red-50 border-red-400 text-red-700' : 'bg-brand-50 border-brand-600 text-brand-700') : 'border-slate-300'}`}>{on ? '✓ ' : ''}{m.nome}</button> })}
            </div>}
            {semTempo.length > 0 && <p className="text-xs text-red-600">Não cabe no dia de: {semTempo.map((x) => `${x.nome} (restam ${x.restante} min)`).join(', ')}. {todaFam ? 'Desmarque "Toda a família" e escolha quem participa, ou' : 'Desmarque essas pessoas ou'} reduza o tempo.</p>}
            <p className="text-xs text-slate-500">Cada pessoa recebe a atividade no próprio dia (com checklist, pontos e Google Agenda próprios) e um aviso no celular.</p>
          </div>}
        </div>}
        {erro && <p className="text-sm text-red-600">{erro}</p>}
        <div className="flex gap-2"><button className="btn-sec flex-1" onClick={onFechar}>Cancelar</button><button className="btn flex-1" disabled={!titulo.trim() || salvando || (rec.tipo === 'nenhuma' && (!cabe.ok || !okComp))} onClick={salvar}>Salvar</button></div>
      </div>
    </div>
  )
}
