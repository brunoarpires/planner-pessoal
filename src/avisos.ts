/** Montagem pura da lista de avisos do app (sem I/O). Persistência do lido fica em avisos_lidos. */

export type TipoAviso = 'orfaos-google' | 'checklist-pendente' | 'google-erro'

export type Aviso = {
  id: string
  tipo: TipoAviso
  titulo: string
  corpo: string
  destino: string
  assinatura: string
  data?: string
}

export type AvisoLido = { aviso_id: string; assinatura: string | null }

export function fmtDataAviso(d: string): string {
  const [y, mo, di] = d.split('-')
  return y && mo && di ? `${di}/${mo}/${y}` : d
}

/** Dias anteriores a hoje com pelo menos uma atividade sem checklist. */
export function datasChecklistPendentePassado(hoje: string, atividades: Array<{ data: string; status_pessoal: string | null }>): string[] {
  const datas = new Set<string>()
  for (const a of atividades) {
    if (a.data < hoje && a.status_pessoal == null) datas.add(a.data)
  }
  return [...datas].sort()
}

export function avisosAtivos(opts: {
  hoje: string
  datasPendentesPassadas: string[]
  orfaos: Array<{ id: string }> | null
  googleErro: string | null
}): Aviso[] {
  const lista: Aviso[] = []
  if (opts.googleErro) {
    lista.push({
      id: 'google-erro',
      tipo: 'google-erro',
      titulo: 'Google Agenda precisa de atenção',
      corpo: opts.googleErro,
      destino: '#/ajustes',
      assinatura: opts.googleErro,
    })
  }
  if (opts.orfaos && opts.orfaos.length > 0) {
    const n = opts.orfaos.length
    const assinatura = [...opts.orfaos.map((o) => o.id)].sort().join(',')
    lista.push({
      id: 'orfaos-google',
      tipo: 'orfaos-google',
      titulo: n === 1 ? '1 evento órfão na Google Agenda' : `${n} eventos órfãos na Google Agenda`,
      corpo: n === 1
        ? 'O Planner criou esse evento e a atividade já não existe. Abra Ajustes para revisar e remover.'
        : 'O Planner criou esses eventos e as atividades já não existem. Abra Ajustes para revisar e remover.',
      destino: '#/ajustes/orfaos',
      assinatura,
    })
  }
  for (const data of opts.datasPendentesPassadas) {
    lista.push({
      id: `checklist:${data}`,
      tipo: 'checklist-pendente',
      titulo: `Checklist de ${fmtDataAviso(data)} não foi fechado`,
      corpo: 'Há atividade(s) desse dia sem marcação. Toque para abrir o dia e ajustar.',
      destino: `#/dia/${data}`,
      assinatura: data,
      data,
    })
  }
  return lista
}

export function avisosNaoLidos(avisos: Aviso[], lidos: AvisoLido[]): Aviso[] {
  const mapa = new Map(lidos.map((l) => [l.aviso_id, l.assinatura]))
  return avisos.filter((a) => mapa.get(a.id) !== a.assinatura)
}
