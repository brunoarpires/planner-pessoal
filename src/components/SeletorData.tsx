import { useRef, type ReactNode } from 'react'

/** Envolve um conteúdo clicável com um input date nativo invisível por cima. */
export function SeletorData({ valor, onChange, children, className = '', min }: { min?: string; valor: string; onChange: (d: string) => void; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  const abrir = () => { const el = ref.current as (HTMLInputElement & { showPicker?: () => void }) | null; try { el?.showPicker?.() } catch { /* fallback: toque direto no input */ } }
  return (
    <label className={`relative inline-block cursor-pointer ${className}`} onClick={abrir}>
      {children}
      <input ref={ref} type="date" value={valor} min={min} aria-label="Escolher data"
        onChange={e => e.target.value && onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
    </label>
  )
}
