const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))
export function SeletorHora({ valor, onChange, vazio, disabled, horas = HORAS, className = '', passo = 5 }: { passo?: number; valor: string; onChange: (v: string) => void; vazio?: boolean; disabled?: boolean; horas?: string[]; className?: string }) {
  const [h, m] = (valor || '').slice(0, 5).split(':')
  const base = passo === 5 ? MINS : Array.from({ length: Math.ceil(60 / passo) }, (_, i) => String(i * passo).padStart(2, '0'))
  const mins = m && !base.includes(m) ? [...base, m].sort() : base
  const sel = 'inp !w-auto min-w-0 flex-1 text-center'
  return (
    <div className={`flex items-center gap-2 max-w-full ${className}`}>
      <select className={sel} disabled={disabled} value={h ?? ''} aria-label="Hora" onChange={(e) => onChange(e.target.value ? `${e.target.value}:${m || '00'}` : '')}>
        {(vazio || !h) && <option value="">--</option>}
        {horas.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="font-semibold">:</span>
      <select className={sel} disabled={disabled || (!h && !!vazio)} value={m ?? ''} aria-label="Minuto" onChange={(e) => onChange(`${h || '00'}:${e.target.value}`)}>
        {!m && <option value="">--</option>}
        {mins.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      {vazio && valor && !disabled && <button type="button" className="text-sm text-slate-500 px-2" onClick={() => onChange('')}>Limpar</button>}
    </div>
  )
}
