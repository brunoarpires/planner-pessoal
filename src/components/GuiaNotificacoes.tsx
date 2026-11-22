import { useEffect, useState } from 'react'
import { ativarPush, pushSuportado } from '../push'

const CHAVE = 'planner.guiaPush'
const instalado = () => matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Guia simples que aparece sozinho: instalar o app (iPhone) e ativar notificações. */
export function GuiaNotificacoes() {
  const [passo, setPasso] = useState<'instalar' | 'ativar' | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    // Permissão já dada: garante que a inscrição deste aparelho está salva (recria se expirou/foi apagada)
    if (pushSuportado() && Notification.permission === 'granted') ativarPush().catch(() => {})
    const adiado = Number(localStorage.getItem(CHAVE) || 0)
    if (Date.now() < adiado) return
    if (ios() && !instalado()) setPasso('instalar')
    else if (pushSuportado() && Notification.permission === 'default') setPasso('ativar')
  }, [])
  if (!passo) return null
  const depois = () => { localStorage.setItem(CHAVE, String(Date.now() + 3 * 864e5)); setPasso(null) }
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end justify-center" onClick={depois}>
      <div className="w-full max-w-md bg-white rounded-t-3xl p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] space-y-3" onClick={(e) => e.stopPropagation()}>
        {passo === 'instalar' ? <>
          <h2 className="text-lg font-semibold">📲 Instale o Planner no iPhone</h2>
          <ol className="text-sm space-y-2 list-decimal pl-5">
            <li>Toque em <b>Compartilhar</b> (quadrado com seta ↑) no Safari.</li>
            <li>Escolha <b>Adicionar à Tela de Início</b> → <b>Adicionar</b>.</li>
            <li>Abra o Planner pelo ícone novo — aí as notificações funcionam.</li>
          </ol>
          <button className="btn w-full" onClick={depois}>Entendi</button>
        </> : <>
          <h2 className="text-lg font-semibold">🔔 Ativar lembretes</h2>
          <p className="text-sm text-slate-600">Vamos te avisar antes de cada atividade e na hora de fechar o dia. Toque em <b>Ativar</b> e depois em <b>Permitir</b>.</p>
          {msg && <p className="text-sm">{msg}</p>}
          <div className="flex gap-2">
            <button className="btn-sec flex-1" onClick={depois}>Agora não</button>
            <button className="btn flex-1" onClick={async () => { const r = await ativarPush(); setMsg(r); if (r.includes('✅')) setTimeout(() => setPasso(null), 1200) }}>Ativar</button>
          </div>
        </>}
      </div>
    </div>
  )
}
