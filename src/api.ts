import { supabase } from './supabase'
import { aGerar, type StatusPessoal, type RegraRec, type MotivoNaoFeito } from './regras'

export interface Membro {
  familia_id: string; user_id: string; nome: string; email: string | null; papel: 'administrador' | 'membro'
  inicio_dia: string; horas_dia: number; fim_dia: string; fuso: string; lembrete_min: number; lembrete_email: boolean; lembrete_push: boolean
}
export interface Atividade {
  id: string; familia_id: string; user_id: string; data: string; hora: string | null; titulo: string; observacao: string | null
  feito: boolean; status_pessoal: StatusPessoal | null; status_texto: string | null; google_event_id: string | null; pontos: number
  duracao_min: number; categoria_id: string | null; subcategoria_id: string | null; grupo_id?: string | null; lembrete_canal?: string; recorrencia_id?: string | null; data_movida?: boolean; resultado?: 'feito' | 'nao_feito' | null; motivo_nao_feito?: MotivoNaoFeito | null
}
export interface Modelo { titulo: string; observacao: string | null; duracao_min: number; categoria_id: string | null; subcategoria_id: string | null; lembrete_canal: string; participantes: string[]; toda_familia: boolean }
export interface Recorrencia extends RegraRec { id: string; criador: string; familia_id: string; gerado_ate: string | null; gerados: number; modelo: Modelo; ativo: boolean }
export interface Grupo { id: string; criador: string; toda_familia: boolean }
export interface Categoria { id: string; familia_id: string | null; pai_id: string | null; nome: string; emoji: string | null; cor: string | null; ordem: number }
export interface Familia { id: string; nome: string; codigo_convite: string }

const gerando = new Set<string>()
const ok = <T,>(r: { data: T; error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message); return r.data }

export const api = {
  async eu(uid: string) { return ok(await supabase.from('membros').select('*').eq('user_id', uid).maybeSingle()) as Membro | null },
  async familia() { return ok(await supabase.from('familias').select('*').maybeSingle()) as Familia | null },
  async membros() { return ok(await supabase.from('membros').select('*').order('nome')) as Membro[] },
  async salvarConfig(uid: string, c: Partial<Membro>) {
    const r = ok(await supabase.from('membros').update(c).eq('user_id', uid).select()) as Membro[]
    if (!r.length) throw new Error('Não foi possível salvar (sem permissão ou sessão expirada). Entre novamente.')
    return r[0]
  },
  async minhasAtividades(uid: string, de: string, ate: string) {
    return ok(await supabase.from('atividades').select('*').eq('user_id', uid).gte('data', de).lte('data', ate).order('data').order('hora', { nullsFirst: true })) as Atividade[]
  },
  /** Atividades sem checklist (aviso não bloqueante / criação). */
  async pendentes(uid: string) {
    return ok(await supabase.from('atividades').select('*').eq('user_id', uid).is('status_pessoal', null).order('data')) as Atividade[]
  },
  async criar(a: Partial<Atividade>) { return ok(await supabase.from('atividades').insert(a).select().single()) as Atividade },
  async criarCompartilhada(a: { data: string; hora: string | null; titulo: string; observacao: string | null; duracao_min: number; categoria_id: string | null; subcategoria_id: string | null }, participantes: string[], todaFamilia: boolean, canal = 'ambos') {
    const g = ok(await supabase.rpc('criar_compartilhada', { p_data: a.data, p_hora: a.hora, p_titulo: a.titulo, p_observacao: a.observacao, p_duracao: a.duracao_min, p_categoria: a.categoria_id, p_subcategoria: a.subcategoria_id, p_participantes: participantes, p_toda_familia: todaFamilia })) as string
    // canal é pessoal: aplica na cópia de quem criou; demais participantes começam em 'ambos' e ajustam a sua
    if (canal !== 'ambos') { const { data: u } = await supabase.auth.getUser(); await supabase.from('atividades').update({ lembrete_canal: canal }).eq('grupo_id', g).eq('user_id', u.user!.id) }
    return g
  },
  /** Minutos planejados por pessoa da família num dia. */
  async planejadoFamilia(data: string) {
    const r = ok(await supabase.from('atividades').select('user_id,duracao_min').eq('data', data)) as { user_id: string; duracao_min: number }[]
    return r.reduce<Record<string, number>>((m, x) => { m[x.user_id] = (m[x.user_id] ?? 0) + x.duracao_min; return m }, {})
  },
  /** Grupos, cópias e membros das compartilhadas de uma lista. */
  async contextoGrupos(lista: Atividade[]) {
    const ids = [...new Set(lista.map((a) => a.grupo_id).filter(Boolean) as string[])]
    if (!ids.length) return { grupos: [] as Grupo[], copias: [] as Atividade[], membros: [] as Membro[] }
    const [g, membros] = await Promise.all([api.grupos(ids), api.membros()])
    return { ...g, membros }
  },
  async grupos(ids: string[]) {
    if (!ids.length) return { grupos: [] as Grupo[], copias: [] as Atividade[] }
    const [g, c] = await Promise.all([supabase.from('atividade_grupos').select('*').in('id', ids), supabase.from('atividades').select('*').in('grupo_id', ids)])
    return { grupos: ok(g) as Grupo[], copias: ok(c) as Atividade[] }
  },
  async atualizar(id: string, a: Partial<Atividade>) { return ok(await supabase.from('atividades').update(a).eq('id', id).select().single()) as Atividade },
  async excluir(id: string) { const r = ok(await supabase.from('atividades').delete().eq('id', id).select('id')) as { id: string }[]; if (!r?.length) throw new Error('Não foi possível excluir esta atividade (sem permissão ou já fechada). Atualize a tela e tente de novo.') },
  /** Cria a regra e gera as primeiras ocorrências. Retorna datas puladas (sem tempo no dia). */
  async criarRecorrencia(eu: Membro, regra: RegraRec, modelo: Modelo, hoje: string) {
    const rec = ok(await supabase.from('recorrencias').insert({ ...regra, familia_id: eu.familia_id, criador: eu.user_id, modelo }).select().single()) as Recorrencia
    try { return await api.gerarRecorrencia(rec, eu, hoje) }
    catch (e) { await supabase.from('atividades').delete().eq('recorrencia_id', rec.id); await supabase.from('recorrencias').delete().eq('id', rec.id); throw e } // limpa o que já foi criado
  },
  async gerarRecorrencia(rec: Recorrencia, eu: Membro, hoje: string) {
    if (gerando.has(rec.id)) return { geradas: 0, pulados: [] as string[] }
    gerando.add(rec.id)
    try { return await api._gerar(rec, eu, hoje) } finally { gerando.delete(rec.id) }
  },
  async _gerar(rec: Recorrencia, eu: Membro, hoje: string) {
    const { lista, ate } = aGerar(rec, rec.gerado_ate, hoje, eu.fim_dia.slice(0, 5))
    const m = rec.modelo, pulados: string[] = []
    // Reserva o período ANTES de inserir (trava otimista): se outra aba/aparelho/execução já gerou, não duplica.
    let q = supabase.from('recorrencias').update({ gerado_ate: ate, gerados: rec.gerados + lista.length }).eq('id', rec.id)
    q = rec.gerado_ate ? q.eq('gerado_ate', rec.gerado_ate) : q.is('gerado_ate', null)
    const reservado = ok(await q.select('id')) as { id: string }[]
    if (!reservado.length) return { geradas: 0, pulados }
    if (lista.length) {
      const membros = await api.membros()
      const parts = m.toda_familia ? membros.map((x) => x.user_id) : [...new Set([...(m.participantes || []), eu.user_id])]
      const plan = ok(await supabase.from('atividades').select('user_id,data,duracao_min').in('user_id', parts).gte('data', lista[0].data).lte('data', lista.at(-1)!.data)) as { user_id: string; data: string; duracao_min: number }[]
      const usado: Record<string, number> = {}
      for (const x of plan) usado[x.user_id + x.data] = (usado[x.user_id + x.data] ?? 0) + x.duracao_min
      const lim = (u: string) => (membros.find((x) => x.user_id === u)?.horas_dia ?? 24) * 60
      const ok_: typeof lista = []
      for (const o of lista) {
        if (parts.some((u) => (usado[u + o.data] ?? 0) + m.duracao_min > lim(u))) { pulados.push(o.data); continue }
        parts.forEach((u) => { usado[u + o.data] = (usado[u + o.data] ?? 0) + m.duracao_min }); ok_.push(o)
      }
      const base = { titulo: m.titulo, observacao: m.observacao, duracao_min: m.duracao_min, categoria_id: m.categoria_id, subcategoria_id: m.subcategoria_id }
      if (parts.length < 2) {
        if (ok_.length) ok(await supabase.from('atividades').insert(ok_.map((o) => ({ ...base, user_id: eu.user_id, data: o.data, hora: o.hora, lembrete_canal: m.lembrete_canal, recorrencia_id: rec.id }))))
      } else {
        const umaVez = async (o: (typeof ok_)[number]) => {
          const g = ok(await supabase.rpc('criar_compartilhada_rec', { p_data: o.data, p_hora: o.hora, p_titulo: base.titulo, p_observacao: base.observacao, p_duracao: base.duracao_min, p_categoria: base.categoria_id, p_subcategoria: base.subcategoria_id, p_participantes: parts, p_toda_familia: m.toda_familia, p_rec: rec.id })) as string
          if (m.lembrete_canal !== 'ambos') await supabase.from('atividades').update({ lembrete_canal: m.lembrete_canal }).eq('grupo_id', g).eq('user_id', eu.user_id)
        }
        for (let i = 0; i < ok_.length; i += 6) {
          if (i > 0) { const at = ok(await supabase.from('recorrencias').select('ativo').eq('id', rec.id).maybeSingle()) as { ativo: boolean } | null; if (!at?.ativo) break } // série encerrada no meio: para
          await Promise.all(ok_.slice(i, i + 6).map(umaVez)) // em lotes: bem mais rápido
        }
      }
    }
    return { geradas: lista.length - pulados.length, pulados: [...new Set(pulados)] }
  },
  /** Estende recorrências ativas até hoje + horizonte (~60 dias). Chamado ao abrir o app e ao voltar para a aba. */
  async estenderRecorrencias(eu: Membro, hoje: string) {
    const recs = ok(await supabase.from('recorrencias').select('*').eq('criador', eu.user_id).eq('ativo', true)) as Recorrencia[]
    const pulados: string[] = []
    for (const r of recs) { try { pulados.push(...(await api.gerarRecorrencia(r, eu, hoje)).pulados) } catch { /* ex.: dia passado pendente; tenta na próxima abertura */ } }
    return pulados
  },
  async recorrencia(id: string) { return ok(await supabase.from('recorrencias').select('*').eq('id', id).maybeSingle()) as Recorrencia | null },
  /** "Esta e as próximas": aplica mudanças às minhas ocorrências a partir da data e ao modelo da regra (qualquer participante). Data nova: RPC mover_proximas (série inteira a partir daqui). */
  async editarProximas(a: Atividade, c: Partial<Atividade>) {
    const rec = await api.recorrencia(a.recorrencia_id!)
    const { data: novaData, ...resto } = c
    const campos = { ...resto }; if (rec?.tipo === 'horas') delete campos.hora
    // Campos (exceto data) primeiro, com limite na data original; depois desloca a série.
    if (Object.keys(campos).length) {
      ok(await supabase.from('atividades').update(campos).eq('recorrencia_id', a.recorrencia_id!).eq('user_id', a.user_id).gte('data', a.data).is('status_pessoal', null))
    }
    // Modelo da série: criador ou participante (RLS/migration). Propaga duração etc. às próximas geradas.
    if (rec && Object.keys(campos).length) {
      const mk = ['titulo', 'observacao', 'duracao_min', 'categoria_id', 'subcategoria_id', 'lembrete_canal'] as const
      const modelo = { ...rec.modelo } as Record<string, unknown>; for (const k of mk) if (k in campos) modelo[k] = (campos as Record<string, unknown>)[k]
      const upd: Record<string, unknown> = { modelo }; if ('hora' in campos) upd.hora = campos.hora
      ok(await supabase.from('recorrencias').update(upd).eq('id', rec.id))
    }
    if (novaData && novaData !== a.data) {
      ok(await supabase.rpc('mover_proximas', { p_ativ: a.id, p_nova_data: novaData }))
    }
  },
  /** "Esta e as próximas" (exclusão): apaga as minhas ocorrências abertas a partir da data e encerra a regra. */
  async excluirProximas(a: Atividade) {
    ok(await supabase.rpc('excluir_proximas', { p_ativ: a.id })) // no servidor: encerra a série antes, apaga de todos (criador) ou sai da série
  },
  async ranking(mes: string) { return ok(await supabase.rpc('ranking_mensal', { p_mes: mes + '-01' })) as { user_id: string; nome: string; pontos: number; feitas: number; total: number }[] },
  async categorias() { return ok(await supabase.from('categorias').select('*').order('ordem').order('nome')) as Categoria[] },
  async criarCategoria(c: Partial<Categoria>) { return ok(await supabase.from('categorias').insert(c).select().single()) as Categoria },
  async excluirCategoria(id: string) { ok(await supabase.rpc('excluir_categoria', { p_id: id })) },
  async criarFamilia(nome: string, meuNome: string) { ok(await supabase.rpc('criar_familia', { p_nome: nome, p_meu_nome: meuNome })) },
  async entrarFamilia(codigo: string, meuNome: string) { ok(await supabase.rpc('entrar_familia', { p_codigo: codigo, p_meu_nome: meuNome })) },
  async novoCodigo() { return ok(await supabase.rpc('novo_codigo_convite')) as string },
  async definirPapel(u: string, p: string) { ok(await supabase.rpc('definir_papel', { p_user: u, p_papel: p })) },
  async remover(u: string) { ok(await supabase.rpc('remover_membro', { p_user: u })) },
  async avisosLidos() {
    return ok(await supabase.from('avisos_lidos').select('aviso_id,assinatura,lido_em')) as { aviso_id: string; assinatura: string | null; lido_em: string }[]
  },
  async marcarAvisoLido(aviso_id: string, assinatura: string) {
    ok(await supabase.from('avisos_lidos').upsert({ aviso_id, assinatura, lido_em: new Date().toISOString() }, { onConflict: 'user_id,aviso_id' }))
  },
  async marcarAvisosLidos(itens: Array<{ aviso_id: string; assinatura: string }>) {
    if (!itens.length) return
    const agora = new Date().toISOString()
    ok(await supabase.from('avisos_lidos').upsert(itens.map((i) => ({ ...i, lido_em: agora })), { onConflict: 'user_id,aviso_id' }))
  },
}

