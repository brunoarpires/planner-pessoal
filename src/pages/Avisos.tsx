import { Bell, CalendarDays, Settings } from 'lucide-react'
import type { Aviso } from '../avisos'
import { fmtDataAviso } from '../avisos'

function icone(tipo: Aviso['tipo']) {
  if (tipo === 'checklist-pendente') return <CalendarDays size={18} className="text-amber-700 shrink-0 mt-0.5" />
  if (tipo === 'orfaos-google') return <Settings size={18} className="text-brand-700 shrink-0 mt-0.5" />
  return <Bell size={18} className="text-red-600 shrink-0 mt-0.5" />
}

export function Avisos({
  avisos,
  idsNaoLidos,
  onAbrir,
  onMarcarTodos,
}: {
  avisos: Aviso[]
  idsNaoLidos: Set<string>
  onAbrir: (a: Aviso) => void
  onMarcarTodos: () => void
}) {
  const n = idsNaoLidos.size
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-semibold text-lg">Avisos</h1>
          <p className="text-sm text-slate-500">
            {avisos.length === 0
              ? 'Nada pendente no momento.'
              : n === 0
                ? 'Tudo visto. Os itens abaixo ainda pedem uma ação.'
                : n === 1
                  ? '1 aviso não lido.'
                  : `${n} avisos não lidos.`}
          </p>
        </div>
        {n > 0 && (
          <button type="button" className="text-xs text-brand-600 shrink-0 mt-1" onClick={onMarcarTodos}>
            Marcar todos como lidos
          </button>
        )}
      </div>
      {avisos.length === 0 && (
        <div className="card text-sm text-slate-500 text-center py-8">Você não tem avisos agora.</div>
      )}
      <div className="space-y-2">
        {avisos.map((a) => {
          const naoLido = idsNaoLidos.has(a.id)
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => onAbrir(a)}
              className={`card w-full text-left flex gap-3 items-start ${naoLido ? 'border-brand-200 bg-brand-50/60' : ''}`}
            >
              {icone(a.tipo)}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-sm">{a.titulo}</span>
                  {naoLido && <span className="h-2 w-2 rounded-full bg-brand-600 shrink-0" aria-label="Não lido" />}
                </span>
                <span className="block text-xs text-slate-600 mt-1">{a.corpo}</span>
                {a.data && <span className="block text-xs text-brand-700 mt-1.5 font-medium">Abrir {fmtDataAviso(a.data)}</span>}
                {a.tipo === 'orfaos-google' && <span className="block text-xs text-brand-700 mt-1.5 font-medium">Ir para Ajustes</span>}
                {a.tipo === 'google-erro' && <span className="block text-xs text-brand-700 mt-1.5 font-medium">Abrir Ajustes</span>}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
