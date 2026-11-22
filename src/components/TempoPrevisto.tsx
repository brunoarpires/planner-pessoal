import { SeletorHora } from './SeletorHora'
import { useState } from 'react'
import { fmtDuracao, duracaoValida } from '../regras'

const CHIPS = [1, 15, 30, 45, 60, 90, 120]
export function TempoPrevisto({ valor, onChange, disabled }: { valor: number; onChange: (m: number) => void; disabled?: boolean }) {
  const [outro, setOutro] = useState(!CHIPS.includes(valor))
  const hhmm = `${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`
  return (
    <div><label className="lbl">Tempo previsto</label>
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((m) => <button type="button" key={m} disabled={disabled} onClick={() => { setOutro(false); onChange(m) }}
          className={`rounded-full border px-3 py-1.5 text-sm ${!outro && valor === m ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>{fmtDuracao(m)}</button>)}
        <button type="button" disabled={disabled} onClick={() => setOutro(true)} className={`rounded-full border px-3 py-1.5 text-sm ${outro ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300'}`}>Outro</button>
      </div>
      {outro && <SeletorHora className="mt-2" passo={1} horas={Array.from({ length: 13 }, (_, i) => String(i).padStart(2, '0'))} disabled={disabled} valor={hhmm} onChange={(v) => { const [h, m] = (v || '00:30').split(':').map(Number); const t = h * 60 + m; if (duracaoValida(t)) onChange(t) }} />}
    </div>
  )
}
