/** Decisão pura da limpeza de órfãos do Google Agenda (espelhada em supabase/functions/google-sync). Sem I/O. */

export type AtividadeGoogleRef = { id: string; google_event_id: string | null }

export type MotivoRemocao = 'atividade_ausente' | 'duplicata_com_canonico'
export type MotivoPreservar = 'ids_iguais' | 'sem_google_event_id' | 'mismatch_ambiguo'

export type DecisaoOrfao =
  | { acao: 'remover'; motivo: MotivoRemocao }
  | { acao: 'preservar'; motivo: MotivoPreservar }

export type OrfaoListado = {
  id: string
  plannerId: string
  titulo: string
  data: string | null
  hora: string | null
  motivo: MotivoRemocao
}

/**
 * Conservador: erro de DB nunca vira ausência; mismatch só remove se o evento
 * canônico (google_event_id no banco) ainda aparece na lista daquele plannerId.
 */
export function decidirOrfao(opts: {
  atividade: AtividadeGoogleRef | null
  error?: { message?: string } | null
  eventId: string
  idsDoMesmoPlanner: string[]
}): DecisaoOrfao {
  if (opts.error) {
    throw new Error(`Falha ao consultar atividade para limpeza de órfãos: ${opts.error.message ?? 'erro'}`)
  }
  if (!opts.atividade) return { acao: 'remover', motivo: 'atividade_ausente' }
  const canon = opts.atividade.google_event_id
  if (!canon) return { acao: 'preservar', motivo: 'sem_google_event_id' }
  if (canon === opts.eventId) return { acao: 'preservar', motivo: 'ids_iguais' }
  if (opts.idsDoMesmoPlanner.includes(canon)) {
    return { acao: 'remover', motivo: 'duplicata_com_canonico' }
  }
  return { acao: 'preservar', motivo: 'mismatch_ambiguo' }
}

export function deveRemoverOrfao(opts: Parameters<typeof decidirOrfao>[0]): boolean {
  return decidirOrfao(opts).acao === 'remover'
}

/** Filtra itens da Calendar API elegíveis à limpeza (não cancela eventos pessoais). */
export function eventosComPlannerId<T extends {
  id?: string
  status?: string
  extendedProperties?: { private?: { plannerId?: string } }
}>(items: T[]): Array<T & { id: string; plannerId: string }> {
  const out: Array<T & { id: string; plannerId: string }> = []
  for (const e of items) {
    const plannerId = e.extendedProperties?.private?.plannerId
    if (e.status === 'cancelled' || !plannerId || !e.id) continue
    out.push(Object.assign(e, { id: e.id, plannerId }))
  }
  return out
}

/** Agrupa ids de evento Google por plannerId (para detectar duplicata real vs ambígua). */
export function idsPorPlannerId(eventos: Array<{ id: string; plannerId: string }>): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const e of eventos) {
    const lista = m.get(e.plannerId)
    if (lista) lista.push(e.id)
    else m.set(e.plannerId, [e.id])
  }
  return m
}

/** Aplica a decisão conservadora a uma lista já filtrada (só eventos com plannerId). */
export function listarOrfaosParaRemover<T extends { id: string; plannerId: string }>(
  candidatos: T[],
  existentes: Map<string, AtividadeGoogleRef>,
): Array<T & { motivo: MotivoRemocao }> {
  const ids = idsPorPlannerId(candidatos)
  const out: Array<T & { motivo: MotivoRemocao }> = []
  for (const ev of candidatos) {
    const d = decidirOrfao({
      atividade: existentes.get(ev.plannerId) ?? null,
      error: null,
      eventId: ev.id,
      idsDoMesmoPlanner: ids.get(ev.plannerId) ?? [ev.id],
    })
    if (d.acao === 'remover') out.push({ ...ev, motivo: d.motivo })
  }
  return out
}
