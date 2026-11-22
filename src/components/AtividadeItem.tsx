import { SeletorCanal, type Canal } from './SeletorCanal'
import { useEffect, useState } from 'react'
import { Check, X, Trash2, ChevronDown } from 'lucide-react'
import { api, type Atividade, type Grupo, type Membro } from '../api'
import { STATUS_ROTULO, pontos, cabeNoDia, fmtDuracao, modoEdicao, podeMarcar, agoraNoFuso, podeEditarComum, naoCabemNaEdicao, naoCabem, podeMoverPara, fmtData, MOTIVO_ROTULO, MOTIVO_PONTOS, type MotivoNaoFeito, type StatusPessoal } from '../regras'
import { SeletorData } from './SeletorData'
import { SeletorHora } from './SeletorHora'
import { CalendarDays } from 'lucide-react'
import { TempoPrevisto } from './TempoPrevisto'
import { sincronizarEmBreve } from '../google'
import { ChipCategoria, SeletorCategoria, useCategorias } from '../categorias'

export function AtividadeItem({ a, onMudou, editavel, podeExcluir, planejadoOutros = 0, horasDia = 24, hoje = agoraNoFuso().data, grupo, copias = [], membros = [] }: { a: Atividade; onMudou: () => void; editavel: boolean; podeExcluir: boolean; planejadoOutros?: number; horasDia?: number; hoje?: string; grupo?: Grupo; copias?: Atividade[]; membros?: Membro[] }) {
  const [aberto, setAberto] = useState(false)
  const [txt, setTxt] = useState(a.status_texto || '')
  const [cats] = useCategorias()
  const [erro, setErro] = useState('')
  const [escopo, setEscopo] = useState<'so' | 'prox'>('so')
  const salvar = async (c: Partial<Atividade>) => { setErro(''); try { const pessoal = Object.keys(c).every((k) => ['feito', 'status_pessoal', 'status_texto', 'resultado', 'motivo_nao_feito'].includes(k))
    if (a.recorrencia_id && escopo === 'prox' && !pessoal) await api.editarProximas(a, c); else await api.atualizar(a.id, c); onMudou(); sincronizarEmBreve() } catch (e) { setErro((e as Error).message) } }
  const checada = a.status_pessoal !== null
  const modo = modoEdicao(a, hoje)
  const fechando = editavel && modo === 'fechamento'
  const livreBase = editavel && modo === 'livre'
  const marcavel = editavel && podeMarcar(a, hoje)
  const nomes: Record<string, string> = Object.fromEntries(membros.map((m) => [m.user_id, m.nome]))
  // compartilhada sem dados do grupo carregados: trava detalhes por segurança
  const podeComum = a.grupo_id ? !!grupo && podeEditarComum(a, grupo.criador) : true
  const souCriador = !a.grupo_id || (!!grupo && grupo.criador === a.user_id)
  const validarDuracao = async (m: number): Promise<string> => {
    const c = cabeNoDia(planejadoOutros, m, horasDia); if (!c.ok) return c.motivo!
    if (a.grupo_id) {
      const doGrupo = copias.filter((x) => x.grupo_id === a.grupo_id && x.user_id !== a.user_id)
      try {
        const falta = naoCabemNaEdicao(doGrupo, membros, await api.planejadoFamilia(a.data), m)
        if (falta.length) return `Não cabe no dia de: ${falta.map((x) => `${x.nome} (restam ${x.restante} min)`).join(', ')}. Reduza o tempo.`
      } catch { /* o banco confere de novo */ }
    }
    return ''
  }
  const validarData = async (nova: string, dur: number): Promise<string> => {
    const v = podeMoverPara(nova, hoje); if (!v.ok) return v.motivo!
    try {
      const plan = await api.planejadoFamilia(nova)
      if (a.grupo_id) {
        const us = copias.filter((x) => x.grupo_id === a.grupo_id).map((x) => x.user_id)
        const falta = naoCabem(membros.filter((m) => us.includes(m.user_id)), plan, dur)
        if (falta.length) return (`Não cabe em ${fmtData(nova)} no dia de: ${falta.map((x) => `${x.nome} (restam ${x.restante} min)`).join(', ')}.`)
      } else {
        const c = cabeNoDia(plan[a.user_id] ?? 0, dur, horasDia); if (!c.ok) return `Não cabe em ${fmtData(nova)}: ${c.motivo}`
      }
    } catch { /* o banco confere de novo */ }
    return ''
  }
  const livre = livreBase
  const comum = livreBase && podeComum
  // Rascunho da edição: nada é gravado até "Salvar alterações"
  const ini = () => ({ titulo: a.titulo, data: a.data, hora: a.hora ? a.hora.slice(0, 5) : '', dur: a.duracao_min, canal: (a.lembrete_canal ?? 'ambos') as Canal, cat: a.categoria_id, sub: a.subcategoria_id, obs: a.observacao || '', txt: a.status_texto || '' })
  const [ed, setEd] = useState(ini)
  const [gravando, setGravando] = useState(false), [okMsg, setOkMsg] = useState('')
  useEffect(() => { setEd(ini()); setTxt(a.status_texto || '') }, [a]) // eslint-disable-line
  const mudancas = (): Partial<Atividade> => {
    const c: Partial<Atividade> = {}
    if (comum) {
      if (ed.titulo.trim() && ed.titulo.trim() !== a.titulo) c.titulo = ed.titulo.trim()
      if (ed.hora !== (a.hora ? a.hora.slice(0, 5) : '')) c.hora = ed.hora || null
      if (ed.dur !== a.duracao_min) c.duracao_min = ed.dur
      if (ed.cat !== a.categoria_id || ed.sub !== a.subcategoria_id) { c.categoria_id = ed.cat; c.subcategoria_id = ed.sub }
      if (ed.obs !== (a.observacao || '')) c.observacao = ed.obs || null
    }
    if (livre) {
      if (ed.canal !== (a.lembrete_canal ?? 'ambos')) c.lembrete_canal = ed.canal
      if (txt !== (a.status_texto || '')) c.status_texto = txt || null
    }
    return c
  }
  const dataMudou = comum && ed.data !== a.data
  const alterado = Object.keys(mudancas()).length > 0 || dataMudou
  const salvarTudo = async () => {
    setErro(''); setOkMsg(''); const c = mudancas()
    if (dataMudou) c.data = ed.data
    setGravando(true)
    try {
      if (c.duracao_min !== undefined) { const e = await validarDuracao(c.duracao_min); if (e) return setErro(e) }
      if (dataMudou) { const e = await validarData(ed.data, ed.dur); if (e) return setErro(e) }
      if (Object.keys(c).length) {
        if (a.recorrencia_id && escopo === 'prox') await api.editarProximas(a, c); else await api.atualizar(a.id, c)
      }
      setOkMsg('Alterações salvas ✅'); setTimeout(() => setOkMsg(''), 2500)
      onMudou(); sincronizarEmBreve()
    } catch (e) { setErro((e as Error).message) } finally { setGravando(false) }
  }
  const cancelar = () => { setEd(ini()); setTxt(a.status_texto || ''); setErro('') }
  type Res = 'feito' | 'nao_feito' | null
  const [rasc, setRasc] = useState<{ feito: boolean; status: StatusPessoal | null; res: Res; mot: MotivoNaoFeito | null }>({ feito: a.feito, status: null, res: null, mot: null })
  const feitoVis = fechando ? rasc.feito : a.feito
  const statusVis = fechando ? rasc.status : a.status_pessoal
  const resVis: Res = fechando ? rasc.res : (a.resultado ?? null)
  const motVis = fechando ? rasc.mot : (a.motivo_nao_feito ?? null)
  const [motivoAberto, setMotivoAberto] = useState(false), [motivo, setMotivo] = useState(''), [motTipo, setMotTipo] = useState<MotivoNaoFeito | null>(null)
  const fechar = () => {
    if (rasc.res === 'nao_feito' && (!txt.trim() || !rasc.mot)) return setErro('Não realizada: escolha o motivo e escreva o comentário.')
    if (!rasc.status) return setErro('Escolha como foi antes de fechar.')
    if (confirm('Fechar esta atividade? Depois ela fica só para leitura.')) salvar({ feito: rasc.feito, status_pessoal: rasc.status, status_texto: txt || null, resultado: rasc.res, motivo_nao_feito: rasc.res === 'nao_feito' ? rasc.mot : null })
  }
  const verde = () => {
    setMotivoAberto(false)
    if (fechando) return setRasc(rasc.res === 'feito' ? { ...rasc, feito: false, res: null } : { ...rasc, feito: true, res: 'feito', mot: null })
    salvar(a.feito && a.resultado !== 'nao_feito' ? { feito: false, resultado: null } : { feito: true, resultado: 'feito', motivo_nao_feito: null })
  }
  const vermelho = () => {
    if (resVis === 'nao_feito') { setMotivoAberto(false); return fechando ? setRasc({ ...rasc, res: null, mot: null }) : salvar({ resultado: null, motivo_nao_feito: null }) }
    setMotivo(fechando ? txt : (a.status_texto || '')); setMotTipo(null); setMotivoAberto(true)
  }
  const confirmarVermelho = () => {
    const m = motivo.trim(); if (!motTipo || !m) return setErro('Escolha o motivo e escreva por que não foi realizada.')
    setMotivoAberto(false); setErro(''); setTxt(m)
    if (fechando) return setRasc({ feito: false, status: rasc.status ?? 'nao_fiz', res: 'nao_feito', mot: motTipo })
    salvar({ resultado: 'nao_feito', motivo_nao_feito: motTipo, feito: false, status_texto: m, status_pessoal: a.status_pessoal ?? 'nao_fiz' })
  }
  const salvarComentario = () => {
    if (!marcavel || livre || fechando) return
    const atual = a.status_texto || ''
    if (txt === atual) return
    salvar({ status_texto: txt || null })
  }
  return (
    <div className={`card ${checada ? 'bg-slate-50' : ''}`}>
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1 shrink-0">
          <button disabled={!marcavel} onClick={verde} aria-label="Feito"
            className={`h-8 w-8 rounded-full border-2 flex items-center justify-center ${feitoVis && resVis !== 'nao_feito' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-emerald-300 text-emerald-300'}`}>
            <Check size={18} />
          </button>
          <button disabled={!marcavel} onClick={vermelho} aria-label="Não realizada"
            className={`h-8 w-8 rounded-full border-2 flex items-center justify-center ${resVis === 'nao_feito' ? 'bg-red-500 border-red-500 text-white' : 'border-red-300 text-red-300'}`}>
            <X size={18} />
          </button>
        </div>
        <button type="button" className="flex-1 min-w-0 self-stretch text-left touch-manipulation" onClick={() => setAberto(!aberto)}>
          <div className={`font-medium break-words ${a.feito ? 'line-through text-slate-400' : ''}`}>{a.titulo}</div>
          <div className="text-xs text-slate-500">{a.hora ? a.hora.slice(0, 5) : 'Sem horário'} · ⏱ {fmtDuracao(a.duracao_min)}{a.resultado === 'nao_feito' ? ` · ❌ ${a.motivo_nao_feito ? MOTIVO_ROTULO[a.motivo_nao_feito] : 'Não realizada'}` : a.status_pessoal ? ` · ${STATUS_ROTULO[a.status_pessoal]}` : ' · ⏳ sem checklist'}{checada ? ` · ${pontos(a)} pts` : ''}{a.google_event_id ? ' · 📅' : ''}{a.recorrencia_id ? ' · 🔁' : ''}</div>
          <ChipCategoria cats={cats} cat={a.categoria_id} sub={a.subcategoria_id} />
          {a.grupo_id && <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px]">
            <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-0.5 font-medium">👥 Compartilhada</span>
            {copias.filter((c) => c.grupo_id === a.grupo_id).map((c) => { const n = nomes[c.user_id] || '?'
              return <span key={c.id} title={n} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5">
                <span className="h-4 w-4 rounded-full bg-brand-600 text-white text-[9px] flex items-center justify-center">{n.slice(0, 1).toUpperCase()}</span>
                {n.split(' ')[0]}{c.user_id === grupo?.criador ? '★' : ''} {c.status_pessoal ? STATUS_ROTULO[c.status_pessoal].split(' ')[0] : c.feito ? '✅' : '⏳'}</span> })}
          </div>}
        </button>
        <button type="button" aria-label={aberto ? 'Recolher' : 'Expandir'} aria-expanded={aberto} onClick={() => setAberto(!aberto)}
          className="-mr-2 h-11 w-11 shrink-0 flex items-center justify-center rounded-full active:bg-slate-100 touch-manipulation">
          <ChevronDown size={20} className={`pointer-events-none text-slate-400 transition ${aberto ? 'rotate-180' : ''}`} />
        </button>
      </div>
      {motivoAberto && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 space-y-2">
        <label className="lbl !text-red-700">Por que não foi realizada? (obrigatório)</label>
        <div className="grid grid-cols-3 gap-2">{(Object.keys(MOTIVO_ROTULO) as MotivoNaoFeito[]).map((k) => <button key={k} type="button" onClick={() => setMotTipo(k)}
          className={`rounded-xl border px-2 py-2 text-xs ${motTipo === k ? 'border-red-600 bg-white text-red-700 font-semibold' : 'border-red-200'}`}>{MOTIVO_ROTULO[k]}<br />{MOTIVO_PONTOS[k]} pts</button>)}</div>
        <textarea className="inp" rows={2} autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        <div className="flex gap-2"><button type="button" className="btn-sec flex-1 text-sm" onClick={() => setMotivoAberto(false)}>Cancelar</button>
          <button type="button" className="btn flex-[2] text-sm !bg-red-600" disabled={!motivo.trim() || !motTipo} onClick={confirmarVermelho}>Confirmar não realizada</button></div>
      </div>}
      {aberto && (
        <div className="mt-3 space-y-3">
          {modo === 'leitura' && <p className="text-xs text-slate-500">📅 Dia passado — detalhes só leitura; você ainda pode marcar ou corrigir o checklist.</p>}
          {a.grupo_id && <p className="text-xs text-slate-500">👥 Compartilhada por {nomes[grupo?.criador ?? ''] || 'outra pessoa'} — todos os participantes podem alterar os detalhes; cada um fecha a sua parte do checklist.</p>}
          {a.data > hoje && <p className="text-xs text-slate-500">📅 O checklist (feito / não realizada / como foi) libera no dia da atividade.</p>}
          {a.recorrencia_id && livre && <div className="flex items-center gap-1 text-[11px]"><span className="text-slate-500">🔁 Alterar/excluir:</span>
            {([['so', 'Só esta'], ['prox', 'Esta e as próximas']] as const).map(([v, r]) => <button key={v} type="button" onClick={() => setEscopo(v)} className={`rounded-full border px-2 py-0.5 ${escopo === v ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold' : 'border-slate-200'}`}>{r}</button>)}</div>}
          {comum && <div>
            <label className="lbl">Título</label>
            <input className="inp" value={ed.titulo} onChange={(e) => setEd({ ...ed, titulo: e.target.value })} maxLength={120} />
          </div>}
          {comum && <div className="flex items-center gap-2 text-sm flex-wrap"><span className="lbl !mb-0">Data</span>
            <SeletorData valor={ed.data} min={hoje} onChange={(d) => setEd({ ...ed, data: d })}><span className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5"><CalendarDays size={16} /> {fmtData(ed.data)}/{ed.data.slice(0, 4)}</span></SeletorData>
            {a.recorrencia_id && <span className="text-[11px] text-slate-500">{escopo === 'prox' ? 'esta e as próximas' : 'só esta repetição'}</span>}</div>}
          {comum && <div className="flex items-center gap-2 text-sm"><span className="lbl !mb-0">Horário</span>
            <SeletorHora vazio valor={ed.hora} onChange={(h) => setEd({ ...ed, hora: h })} /></div>}
          <TempoPrevisto valor={ed.dur} disabled={!comum} onChange={(m) => setEd({ ...ed, dur: m })} />
          <SeletorCanal valor={ed.canal} disabled={!livre} onChange={(c) => setEd({ ...ed, canal: c })} />
          <SeletorCategoria cats={cats} cat={ed.cat} sub={ed.sub} disabled={!comum} onChange={(c, s) => setEd({ ...ed, cat: c, sub: s })} />
          <div>
            <label className="lbl">Observação</label>
            <textarea className="inp" rows={2} value={ed.obs} disabled={!comum} onChange={(e) => setEd({ ...ed, obs: e.target.value })} />
          </div>
          <div>
            <label className="lbl">{resVis === 'nao_feito' ? 'Por que não foi realizada?' : 'Como foi? (status pessoal)'}</label>
            {resVis === 'nao_feito' ? <div className="grid grid-cols-3 gap-2">
              {(Object.keys(MOTIVO_ROTULO) as MotivoNaoFeito[]).map((k) => (
                <button key={k} disabled={!marcavel} onClick={() => fechando ? setRasc({ ...rasc, mot: k }) : salvar({ motivo_nao_feito: k })}
                  className={`rounded-xl border px-2 py-2 text-xs ${motVis === k ? 'border-red-600 bg-red-50 text-red-700 font-semibold' : 'border-slate-200'}`}>{MOTIVO_ROTULO[k]} ({MOTIVO_PONTOS[k]})</button>))}
            </div> :
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(STATUS_ROTULO) as StatusPessoal[]).map((s) => (
                <button key={s} disabled={!marcavel} onClick={() => { const f = s === 'nao_fiz' ? false : s === 'fiz_bem' ? true : feitoVis; const r: Res = f ? 'feito' : null; fechando ? setRasc({ ...rasc, feito: f, status: s, res: r }) : salvar({ status_pessoal: s, feito: f, resultado: r, status_texto: txt || null }) }}
                  className={`rounded-xl border px-2 py-2 text-xs ${statusVis === s ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold' : 'border-slate-200'}`}>{STATUS_ROTULO[s]}</button>
              ))}
            </div>}
            <input className="inp mt-2" placeholder={resVis === 'nao_feito' ? 'Comentário (obrigatório)' : 'Comentário (opcional)'} value={txt} disabled={!marcavel} onChange={(e) => setTxt(e.target.value)} onBlur={salvarComentario} />
          </div>
          {livre && <div className="flex gap-2 pt-1">
            <button type="button" className="btn-sec flex-1 text-sm" disabled={!alterado || gravando} onClick={cancelar}>Cancelar</button>
            <button type="button" className="btn flex-[2] text-sm" disabled={!alterado || gravando} onClick={salvarTudo}>{gravando ? 'Salvando…' : a.recorrencia_id && escopo === 'prox' ? 'Salvar (esta e as próximas)' : 'Salvar alterações'}</button>
          </div>}
          {okMsg && <p className="text-sm text-emerald-600">{okMsg}</p>}
          <div className="flex gap-2 justify-end">
            {fechando && <button className="btn text-sm" onClick={fechar}>Fechar atividade</button>}
            {podeExcluir && livre && <button className="btn-sec text-sm text-red-600" onClick={async () => { const prox = a.recorrencia_id && escopo === 'prox'; if (confirm((prox ? 'Excluir esta e as próximas repetições' : 'Excluir atividade') + (a.grupo_id ? (souCriador ? ' para todos os participantes?' : ' (sair da compartilhada)?') : '?'))) { try { if (prox) await api.excluirProximas(a); else await api.excluir(a.id) } catch (e) { return setErro((e as Error).message) } onMudou(); sincronizarEmBreve() } }}><Trash2 size={16} /></button>}
          </div>
        </div>
      )}
      {erro && <p className="mt-2 text-sm text-red-600">{erro}</p>}
    </div>
  )
}
