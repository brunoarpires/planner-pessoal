import { useState } from 'react'
import { linkConvite, textoConvite } from '../convite'

export function Convidar({ familia, codigo }: { familia: string; codigo: string }) {
  const [aberto, setAberto] = useState(false), [ok, setOk] = useState('')
  const texto = textoConvite(familia, codigo), link = linkConvite(codigo)
  const compartilhar = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'Convite — Planner Diário', text: texto }); return } catch { /* cancelado */ } }
    setAberto(true)
  }
  const copiar = async () => { try { await navigator.clipboard.writeText(link); setOk('Link copiado ✅') } catch { prompt('Copie o link:', link) } }
  return (
    <div className="space-y-2">
      <button className="btn w-full" onClick={compartilhar}>📨 Convidar</button>
      <button className="text-sm text-brand-600 w-full" onClick={() => setAberto(!aberto)}>{aberto ? 'Ocultar opções' : 'Outras opções de envio'}</button>
      {aberto && <div className="grid grid-cols-3 gap-2 text-sm">
        <a className="btn-sec text-center" href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer">WhatsApp</a>
        <a className="btn-sec text-center" href={`mailto:?subject=${encodeURIComponent('Convite para a família ' + familia + ' no Planner Diário')}&body=${encodeURIComponent(texto)}`}>E-mail</a>
        <button className="btn-sec" onClick={copiar}>Copiar link</button>
      </div>}
      {ok && <p className="text-xs text-emerald-700 text-center">{ok}</p>}
    </div>
  )
}
