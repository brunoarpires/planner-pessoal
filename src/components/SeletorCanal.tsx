import { useEffect, useState } from 'react'
import { statusGoogle } from '../google'
export type Canal = 'celular' | 'email' | 'ambos' | 'nenhum'
const OPCOES: [Canal, string][] = [['celular', '📱 Celular'], ['email', '✉️ Email'], ['ambos', '🔔 Ambos'], ['nenhum', '🔕 Nenhum']]
export function SeletorCanal({ valor, onChange, disabled }: { valor: Canal; onChange: (c: Canal) => void; disabled?: boolean }) {
  const [g, setG] = useState<boolean | null>(null)
  useEffect(() => { statusGoogle().then((x) => setG(x.conectado)).catch(() => {}) }, [])
  return <div><label className="lbl">Lembrete</label>
    <div className="grid grid-cols-4 gap-1">{OPCOES.map(([v, r]) => <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
      className={`rounded-lg border px-1 py-1.5 text-[11px] leading-tight disabled:opacity-60 ${valor === v ? 'border-brand-600 bg-brand-50 text-brand-700 font-semibold' : 'border-slate-200'}`}>{r}</button>)}</div>
    <p className="text-[11px] text-slate-500 mt-1">{g === false && (valor === 'email' || valor === 'ambos') ? '⚠️ Email vem do Google Agenda: conecte em Ajustes.' : 'Celular = aviso do app; Email = Google Agenda (15 min antes).'}</p></div>
}
