// Regras de negócio puras (sem dependências) — testadas em scripts/test-regras.mjs

export type StatusPessoal = 'fiz_bem' | 'parcial' | 'nao_fiz'
export type Resultado = 'feito' | 'nao_feito'
export type MotivoNaoFeito = 'falta_tempo' | 'sem_disposicao' | 'mudou_plano'
export const MOTIVO_ROTULO: Record<MotivoNaoFeito, string> = { falta_tempo: '🕐 Faltou tempo', sem_disposicao: '😓 Sem disposição', mudou_plano: '🔄 Mudou o plano' }
export const MOTIVO_PONTOS: Record<MotivoNaoFeito, number> = { falta_tempo: -5, sem_disposicao: -5, mudou_plano: -2 }
export interface AtividadeBase { data: string; feito: boolean; status_pessoal: StatusPessoal | null; resultado?: Resultado | null; motivo_nao_feito?: MotivoNaoFeito | null }

export const PONTOS_FEITO = 10
export const BONUS_STATUS_POSITIVO = 5

export const STATUS_ROTULO: Record<StatusPessoal, string> = { fiz_bem: '😄 Fiz bem', parcial: '😐 Fiz parcialmente', nao_fiz: '😞 Não fiz' }

/** Vermelho (não realizada) = -5 (faltou tempo / sem disposição) ou -2 (mudou o plano); senão 10 pts se feita + 5 se "fiz bem". Espelho da coluna gerada atividades.pontos. */
export function pontos(a: Pick<AtividadeBase, 'feito' | 'status_pessoal' | 'resultado' | 'motivo_nao_feito'>): number {
  if (a.resultado === 'nao_feito') return a.motivo_nao_feito === 'mudou_plano' ? -2 : -5
  return (a.feito ? PONTOS_FEITO : 0) + (a.status_pessoal === 'fiz_bem' ? BONUS_STATUS_POSITIVO : 0)
}

/** Uma atividade está "checada" quando recebeu o status pessoal (feita ou não). */
export const checada = (a: AtividadeBase) => a.status_pessoal !== null

/** Dia 100% fechado: todas as atividades do dia checadas (dia sem atividades conta como fechado). */
export function diaCompleto(atividades: AtividadeBase[], data: string): boolean {
  return atividades.filter((a) => a.data === data).every(checada)
}

/** Atividades pendentes de dias anteriores à data informada. */
export function pendentesAntes(atividades: AtividadeBase[], data: string) {
  return atividades.filter((a) => a.data < data && !checada(a))
}

/** Só pode criar atividade em hoje ou futuro (nunca em dia passado). Pendências de checklist não impedem criar. */
export function podeCriarEm(data: string, hoje: string, atividades: AtividadeBase[]): { ok: boolean; motivo?: string } {
  if (data < hoje) return { ok: false, motivo: 'Não é possível criar atividades em dias passados.' }
  void atividades // pendências de checklist não bloqueiam criação
  return { ok: true }
}

/** Converte "HH:MM" em minutos. */
export const minutos = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + (b || 0) }

/**
 * Antes bloqueava o app após o fim do dia com checklist incompleto.
 * Mantida por compatibilidade: sempre vazia — pendências não travam mais o app.
 * Use `datasComPendencia` para aviso não bloqueante.
 */
export function deveBloquear(_hoje: string, _horaAgora: string, _fimDia: string, _atividades: AtividadeBase[]): string[] {
  return []
}

/** Datas ≤ hoje com pelo menos uma atividade sem checklist (aviso não bloqueante). */
export function datasComPendencia(hoje: string, atividades: AtividadeBase[]): string[] {
  const datas = new Set<string>()
  for (const a of atividades) {
    if (a.data <= hoje && !checada(a)) datas.add(a.data)
  }
  return [...datas].sort()
}

/** A hora está dentro da janela do dia configurada (início + N horas)? */
export function dentroDaJanela(hora: string, inicio: string, horasDia: number): boolean {
  const m = minutos(hora), i = minutos(inicio)
  return m >= i && m <= i + horasDia * 60
}

export interface Resumo { user_id: string; pontos: number; feitas: number; total: number; maximo: number }
/** Somatória mensal por pessoa (mes = "YYYY-MM"), ordenada por pontos (ranking). */
export function rankingMensal<T extends AtividadeBase & { user_id: string }>(atividades: T[], mes: string): Resumo[] {
  const m = new Map<string, Resumo>()
  for (const a of atividades) {
    if (!a.data.startsWith(mes)) continue
    const r = m.get(a.user_id) ?? { user_id: a.user_id, pontos: 0, feitas: 0, total: 0, maximo: 0 }
    r.pontos += pontos(a); r.total++; r.maximo += PONTOS_FEITO + BONUS_STATUS_POSITIVO
    if (a.feito) r.feitas++
    m.set(a.user_id, r)
  }
  return [...m.values()].sort((a, b) => b.pontos - a.pontos || b.feitas - a.feitas)
}

export function fmtData(d: string) { const [y, mo, di] = d.split('-'); return `${di}/${mo}${y ? '' : ''}` }

/** Data e hora "agora" num fuso (padrão São Paulo). */
export function agoraNoFuso(fuso = 'America/Sao_Paulo', agora = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(agora).map((x) => [x.type, x.value]))
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

export function somaDias(data: string, n: number) {
  const d = new Date(data + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10)
}

// ---------- Tempo previsto ----------
export const DURACAO_PADRAO = 30
export const DURACAO_MIN = 1
export const duracaoValida = (m: number) => Number.isInteger(m) && m >= DURACAO_MIN && m <= 1440
export function fmtDuracao(min: number): string {
  const h = Math.floor(min / 60), m = min % 60
  return h && m ? `${h}h${String(m).padStart(2, '0')}` : h ? `${h}h` : `${m}min`
}
/** Verifica se cabe uma atividade de `duracao` min no dia, dado o que já está planejado (sem ela). */
export function cabeNoDia(planejadoSemEsta: number, duracao: number, horasDia: number): { ok: boolean; restante: number; motivo?: string } {
  const lim = horasDia * 60, restante = Math.max(0, lim - planejadoSemEsta)
  if (duracao <= restante) return { ok: true, restante }
  return { ok: false, restante, motivo: `Passa do limite de ${horasDia}h do dia. Restam ${fmtDuracao(restante)}${restante ? '' : ' (dia cheio)'}.` }
}

// ---------- Dias passados ----------
export type ModoEdicao = 'livre' | 'fechamento' | 'leitura'
/** Checklist (feito / não feita / como foi) pode ser marcado ou corrigido em hoje e em dias passados. Futuro: só no dia. */
export const podeMarcar = (a: Pick<AtividadeBase, 'data'>, hoje: string) => a.data <= hoje
/** Hoje/futuro: edição livre dos detalhes. Passado: detalhes só leitura (checklist via podeMarcar). */
export function modoEdicao(a: Pick<AtividadeBase, 'data' | 'status_pessoal'>, hoje: string): ModoEdicao {
  return a.data >= hoje ? 'livre' : 'leitura'
}
export const CAMPOS_FECHAMENTO = ['feito', 'status_pessoal', 'status_texto', 'resultado', 'motivo_nao_feito'] as const
const ehCampoChecklist = (k: string) => (CAMPOS_FECHAMENTO as readonly string[]).includes(k)
/** Espelho do trigger travar_passado: valida uma alteração (ou exclusão, se mudanca = null). */
export function alteracaoPermitida(a: Pick<AtividadeBase, 'data' | 'status_pessoal'>, mudanca: Record<string, unknown> | null, hoje: string): boolean {
  if (mudanca === null) return a.data >= hoje // exclusão só hoje/futuro
  if (a.data > hoje) return !Object.keys(mudanca).some(ehCampoChecklist) // futuro: detalhes ok, checklist não
  if (a.data === hoje) return true
  // passado: só ajuste de checklist (marcar ou corrigir)
  return Object.keys(mudanca).length > 0 && Object.keys(mudanca).every(ehCampoChecklist)
}

// ---------- Compartilhadas ----------
export interface Participante { user_id: string; nome: string; horas_dia: number }
/** Quem não tem tempo livre no dia para esta duração. */
export function naoCabem(ps: Participante[], planejadoPor: Record<string, number>, dur: number): { user_id: string; nome: string; restante: number }[] {
  return ps.map((p) => ({ p, c: cabeNoDia(planejadoPor[p.user_id] ?? 0, dur, p.horas_dia) }))
    .filter((x) => !x.c.ok).map((x) => ({ user_id: x.p.user_id, nome: x.p.nome, restante: x.c.restante }))
}
/** Participantes finais: toda a família ou os escolhidos + o criador. */
export function participantesFinais(eu: string, todos: string[], escolhidos: string[], todaFamilia: boolean): string[] {
  return todaFamilia ? [...new Set(todos)] : [...new Set([eu, ...escolhidos])].filter((u) => todos.includes(u))
}
/**
 * Campos comuns (título, horário, tempo, categoria, observação): qualquer participante altera.
 * Em compartilhada, exige o criador conhecido (grupo carregado) — sem isso a UI trava por segurança.
 */
export const podeEditarComum = (a: { grupo_id?: string | null; user_id: string }, criador: string | null | undefined) => !a.grupo_id || !!criador

export type EscopoEdicao = 'so' | 'prox'
/**
 * Participante (incl. não-criador) pode editar detalhes em 'Só esta' ou 'Esta e as próximas'
 * quando o dia está livre (hoje/futuro). Exclusão da tarefa inteira para todos segue só do criador.
 */
export function podeAplicarEdicaoDetalhes(
  a: { grupo_id?: string | null; user_id: string; recorrencia_id?: string | null; data: string },
  criador: string | null | undefined,
  escopo: EscopoEdicao,
  hoje: string,
): boolean {
  if (a.data < hoje) return false // passado: detalhes só leitura (checklist via podeMarcar)
  if (!podeEditarComum(a, criador)) return false
  if (escopo === 'prox') return !!a.recorrencia_id
  return true
}
/** Ao mudar a duração de uma compartilhada: quem deixa de caber (desconta a duração atual de cada cópia). */
export function naoCabemNaEdicao(copias: { user_id: string; duracao_min: number }[], ps: Participante[], planejadoPor: Record<string, number>, dur: number) {
  const sem: Record<string, number> = {}
  for (const c of copias) sem[c.user_id] = (planejadoPor[c.user_id] ?? 0) - c.duracao_min
  return naoCabem(ps.filter((p) => p.user_id in sem), sem, dur)
}

// ---------- Recorrência ----------
export type TipoRec = 'horas' | 'diaria' | 'semanal' | 'mensal' | 'anual'
export interface RegraRec { tipo: TipoRec; intervalo: number; dias_semana: number[]; data_inicio: string; hora: string | null; fim_data: string | null; fim_qtd: number | null }
export const REC_HORIZONTE_DIAS = 60      // gera ocorrências até hoje + 60 dias (rola ao abrir o app)
export const REC_MAX_QTD = 500            // teto só quando o fim é "depois de N vezes"
/** Sentinela: sem fim_data a série não tem data limite (o horizonte de 60 dias limita o que materializa). */
export const REC_SEM_FIM = '9999-12-31'
const iso = (d: Date) => d.toISOString().slice(0, 10)
const dt = (s: string) => new Date(s + 'T00:00:00Z')
const ultimoDia = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate()
/** Data limite da regra: fim_data se houver; senão sem fim (horizonte rolante cuida da materialização). */
export function limiteRec(r: RegraRec): string {
  return r.fim_data ?? REC_SEM_FIM
}
/**
 * Todas as ocorrências da regra (desde o início) até `ate`, respeitando fim_data e fim_qtd.
 * Sem fim_qtd: sem teto de quantidade (só a data `ate` / fim_data limita).
 * horas: a cada N horas a partir de `hora` até `fimDia`, todos os dias.
 * mensal/anual: dia 29–31 vira o último dia do mês quando não existir.
 */
export function ocorrencias(r: RegraRec, ate: string, fimDia = '23:59'): { data: string; hora: string | null }[] {
  const out: { data: string; hora: string | null }[] = []
  const lim = limiteRec(r) < ate ? limiteRec(r) : ate
  // Sem fim_qtd: sem teto — aGerar só pede até hoje+60 dias, então a lista fica pequena.
  const maxQ = r.fim_qtd != null ? Math.min(Math.max(1, r.fim_qtd), REC_MAX_QTD) : Number.MAX_SAFE_INTEGER
  const n = Math.max(1, Math.floor(r.intervalo || 1))
  const push = (data: string, hora: string | null) => { if (data >= r.data_inicio && data <= lim && out.length < maxQ) out.push({ data, hora }); return out.length < maxQ }
  const ini = dt(r.data_inicio), D = 86400000
  if (r.tipo === 'horas' || r.tipo === 'diaria') {
    const passo = r.tipo === 'diaria' ? n : 1
    for (let t = ini.getTime(); iso(new Date(t)) <= lim; t += passo * D) {
      const data = iso(new Date(t))
      if (r.tipo === 'diaria') { if (!push(data, r.hora)) break; continue }
      for (let m = minutos(r.hora || '08:00'); m <= minutos(fimDia); m += n * 60)
        if (!push(data, `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`)) return out
    }
  } else if (r.tipo === 'semanal') {
    const dias = (r.dias_semana.length ? r.dias_semana : [ini.getUTCDay()]).slice().sort()
    const semana0 = ini.getTime() - ini.getUTCDay() * D
    for (let s = semana0; iso(new Date(s)) <= lim; s += 7 * n * D)
      for (const w of dias) if (!push(iso(new Date(s + w * D)), r.hora)) return out
  } else {
    const dia = ini.getUTCDate(), passo = r.tipo === 'anual' ? 12 * n : n
    for (let k = 0; ; k += passo) {
      const y = ini.getUTCFullYear(), m = ini.getUTCMonth() + k
      const d = iso(new Date(Date.UTC(y, m, Math.min(dia, ultimoDia(y, m)))))
      if (d > lim || !push(d, r.hora)) break
    }
  }
  return out
}
/** Ocorrências novas a gerar: após `geradoAte` (exclusivo) até hoje+horizonte. Respeita fim_data / fim_qtd. */
export function aGerar(r: RegraRec, geradoAte: string | null, hoje: string, fimDia = '23:59') {
  const horizonte = somaDiasRec(hoje, REC_HORIZONTE_DIAS)
  const ate = limiteRec(r) < horizonte ? limiteRec(r) : horizonte
  const todas = ocorrencias(r, ate, fimDia)
  return { lista: todas.filter((o) => (!geradoAte || o.data > geradoAte) && o.data >= hoje), ate }
}
const somaDiasRec = (d: string, n: number) => iso(new Date(dt(d).getTime() + n * 86400000))
/** Soma N anos a uma data ISO (ajusta 29/02). */
export function somaAnos(data: string, anos: number): string {
  const d = dt(data); const y = d.getUTCFullYear() + anos, m = d.getUTCMonth()
  return iso(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), ultimoDia(y, m)))))
}
/** Separa ocorrências que cabem / não cabem no limite diário (planejado: minutos já usados por data). */
export function encaixar(lista: { data: string; hora: string | null }[], dur: number, horasDia: number, planejado: Record<string, number>) {
  const usado = { ...planejado }, ok: typeof lista = [], pulados: string[] = []
  for (const o of lista) {
    if ((usado[o.data] ?? 0) + dur > horasDia * 60) { pulados.push(o.data); continue }
    usado[o.data] = (usado[o.data] ?? 0) + dur; ok.push(o)
  }
  return { ok, pulados: [...new Set(pulados)] }
}
export const REC_ROTULO: Record<TipoRec | 'nenhuma', string> = { nenhuma: 'Nenhuma', horas: 'Horas', diaria: 'Diária', semanal: 'Semanal', mensal: 'Mensal', anual: 'Anual' }

// ---------- Mover atividade de data ----------
/** Nova data precisa ser hoje ou depois (fuso America/Sao_Paulo). */
export function podeMoverPara(nova: string, hoje: string): { ok: boolean; motivo?: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nova)) return { ok: false, motivo: 'Data inválida.' }
  if (nova < hoje) return { ok: false, motivo: `A nova data não pode ser anterior a hoje (${fmtData(hoje)}).` }
  return { ok: true }
}
