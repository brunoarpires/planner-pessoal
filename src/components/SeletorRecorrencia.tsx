import { useEffect, useState } from 'react'
import { REC_ROTULO, somaAnos, type RegraRec, type TipoRec } from '../regras'
import { SeletorHora } from './SeletorHora'

export type FimRec = 'nenhum' | 'data' | 'qtd'
export type RecForm = { tipo: TipoRec | 'nenhuma'; intervalo: number; dias: number[]; fim: FimRec; fimData: string; fimQtd: number }
export const REC_VAZIA: RecForm = { tipo: 'nenhuma', intervalo: 1, dias: [], fim: 'nenhum', fimData: '', fimQtd: 12 }
const SEM = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const UNID: Record<TipoRec, string> = { horas: 'hora(s)', diaria: 'dia(s)', semanal: 'semana(s)', mensal: 'mês(es)', anual: 'ano(s)' }
const FIM_OPCOES: { id: FimRec; rotulo: string }[] = [
  { id: 'nenhum', rotulo: 'Sem fim' },
  { id: 'data', rotulo: 'Até uma data' },
  { id: 'qtd', rotulo: 'Depois de N vezes' },
]
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

export function paraRegra(f: RecForm, data: string, hora: string | null): RegraRec | null {
  if (f.tipo === 'nenhuma') return null
  return { tipo: f.tipo, intervalo: Math.max(1, f.intervalo), dias_semana: f.tipo === 'semanal' ? f.dias : [], data_inicio: data, hora,
    fim_data: f.fim === 'data' && f.fimData ? f.fimData : null,
    fim_qtd: f.fim === 'qtd' ? Math.min(500, Math.max(1, f.fimQtd)) : null }
}

export function SeletorRecorrencia({ v, onChange, data, hora, setHora }: { v: RecForm; onChange: (f: RecForm) => void; data: string; hora: string; setHora: (h: string) => void }) {
  const set = (p: Partial<RecForm>) => onChange({ ...v, ...p })
  const chip = (on: boolean) => `rounded-lg border px-1 py-1.5 text-[11px] leading-tight ${on ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold' : 'border-slate-200'}`
  const escolherFim = (fim: FimRec) => {
    if (fim === 'data' && !v.fimData) set({ fim, fimData: somaAnos(data, 1) })
    else set({ fim })
  }
  return <div><label className="lbl">Repetir</label>
    <div className="grid grid-cols-6 gap-1">{(Object.keys(REC_ROTULO) as (TipoRec | 'nenhuma')[]).map((t) =>
      <button key={t} type="button" className={chip(v.tipo === t)} onClick={() => set({ tipo: t, dias: t === 'semanal' && !v.dias.length ? [new Date(data + 'T12:00').getDay()] : v.dias })}>{REC_ROTULO[t]}</button>)}</div>
    {v.tipo !== 'nenhuma' && <div className="mt-2 space-y-2 rounded-xl bg-slate-50 p-2 text-sm">
      <div className="flex items-center gap-2">A cada <CampoNum min={1} max={v.tipo === 'horas' ? 24 : 99} valor={v.intervalo} onValor={(n) => set({ intervalo: n })} /> {UNID[v.tipo]}</div>
      {v.tipo === 'horas' && <div><span className="text-xs text-slate-500">Começa às (repete até o fim do seu dia)</span><SeletorHora valor={hora || '08:00'} onChange={(h) => setHora(h || '08:00')} /></div>}
      {v.tipo === 'semanal' && <div className="grid grid-cols-7 gap-1">{SEM.map((d, i) => { const on = v.dias.includes(i)
        return <button key={i} type="button" className={chip(on)} onClick={() => set({ dias: on ? v.dias.filter((x) => x !== i) : [...v.dias, i] })}>{d}</button> })}</div>}
      {v.tipo === 'mensal' && Number(data.slice(8)) > 28 && <p className="text-[11px] text-slate-500">Em meses sem o dia {Number(data.slice(8))}, cai no último dia do mês.</p>}
      <div>
        <div className="text-xs text-slate-500 mb-1">Termina</div>
        <div className="grid grid-cols-3 gap-1">{FIM_OPCOES.map((o) =>
          <button key={o.id} type="button" className={chip(v.fim === o.id)} onClick={() => escolherFim(o.id)}>{o.rotulo}</button>)}</div>
        {v.fim === 'qtd' && <div className="mt-2 flex items-center gap-2 flex-wrap">Após <CampoNum min={1} max={500} valor={v.fimQtd} onValor={(n) => set({ fimQtd: n })} /> vezes</div>}
        {v.fim === 'data' && <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-1">{[1, 2, 5].map((a) => {
            const d = somaAnos(data, a); const on = v.fimData === d
            return <button key={a} type="button" className={chip(on)} onClick={() => set({ fimData: d })}>{a} ano{a > 1 ? 's' : ''}</button>
          })}</div>
          <SeletorDataPartes valor={v.fimData || somaAnos(data, 1)} min={data} onChange={(d) => set({ fimData: d })} />
        </div>}
      </div>
      <p className="text-[11px] text-slate-500">Gera ~60 dias à frente e estende ao abrir o app. Dias sem tempo livre são pulados.</p>
    </div>}
  </div>
}

/** Dia / mês / ano com &lt;select&gt; (melhor no Android Chrome que o date nativo). */
function SeletorDataPartes({ valor, min, onChange }: { valor: string; min: string; onChange: (d: string) => void }) {
  const [y, m, d] = (valor || min).split('-').map(Number)
  const yMin = Number(min.slice(0, 4))
  const anos = Array.from({ length: 40 }, (_, i) => yMin + i)
  const ultimo = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate()
  const aplicar = (yy: number, mm: number, dd: number) => {
    const maxD = ultimo(yy, mm)
    const dia = Math.min(Math.max(1, dd), maxD)
    const iso = `${yy}-${String(mm).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    onChange(iso < min ? min : iso)
  }
  const dias = Array.from({ length: ultimo(y, m) }, (_, i) => i + 1)
  const sel = 'inp !w-auto min-w-0 flex-1 text-center !py-1.5'
  return (
    <div className="flex items-center gap-1.5 max-w-full">
      <select className={sel} aria-label="Dia" value={d} onChange={(e) => aplicar(y, m, Number(e.target.value))}>
        {dias.map((x) => <option key={x} value={x}>{String(x).padStart(2, '0')}</option>)}
      </select>
      <select className={sel} aria-label="Mês" value={m} onChange={(e) => aplicar(y, Number(e.target.value), d)}>
        {MESES.map((nome, i) => <option key={nome} value={i + 1}>{nome}</option>)}
      </select>
      <select className={sel} aria-label="Ano" value={y} onChange={(e) => aplicar(Number(e.target.value), m, d)}>
        {anos.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </div>
  )
}

/** Campo numérico que deixa apagar e digitar livremente (celular); limita só ao sair do campo. */
function CampoNum({ valor, min, max, onValor }: { valor: number; min: number; max: number; onValor: (n: number) => void }) {
  const [txt, setTxt] = useState(String(valor))
  useEffect(() => { setTxt((t) => (Number(t) === valor ? t : String(valor))) }, [valor])
  const lim = (n: number) => Math.min(max, Math.max(min, n))
  const invalido = !txt || Number(txt) < min
  return <><input type="text" inputMode="numeric" pattern="[0-9]*" className="inp !w-16 !py-1 text-center" value={txt}
    onChange={(e) => { const t = e.target.value.replace(/\D/g, '').slice(0, 3); setTxt(t); const n = Number(t); if (t && n >= min && n <= max) onValor(n) }}
    onBlur={() => { const n = lim(Number(txt) || min); setTxt(String(n)); onValor(n) }} />{invalido && <span className="text-xs text-red-600">mínimo {min}</span>}</>
}
