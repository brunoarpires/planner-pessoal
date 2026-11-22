import { fmtData } from '../regras'

/** Faixa não bloqueante: lembra checklist pendente sem travar o app. */
export function AvisoPendencias({ datas, onIrPara }: { datas: string[]; onIrPara?: (data: string) => void }) {
  if (!datas.length) return null
  const rotulo = datas.length === 1 ? fmtData(datas[0]) : `${datas.length} dias`
  return (
    <div className="mx-auto max-w-xl px-4 pt-3">
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <p className="font-medium">Checklist pendente ({rotulo})</p>
        <p className="text-amber-800/90 text-xs mt-0.5">
          Você pode marcar ou corrigir as atividades quando quiser — o app não fica bloqueado.
          {onIrPara && datas[0] && (
            <> {' '}<button type="button" className="underline font-medium" onClick={() => onIrPara(datas[0])}>Ver {fmtData(datas[0])}</button></>
          )}
        </p>
      </div>
    </div>
  )
}
