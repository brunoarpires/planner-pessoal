// Edge Function (Deno): sincroniza o Google Agenda de cada pessoa usando o refresh token guardado no servidor.
// - Chamada pelo cron (Authorization: Bearer CRON_SECRET) → sincroniza todos.
// - Chamada pelo app (JWT do usuário) → sincroniza só ele.
// - acao: 'listarOrfaos' (só leitura) ou 'limparOrfaos' (apaga após nova varredura) — só com JWT.
// Config: env GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / CRON_SECRET, ou tabela config_privada (mesmas chaves).
// Decisão de órfãos: espelha src/google-orfaos.ts (manter alinhado).
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
let cfgCache: Record<string, string> | null = null
async function cfg(k: string) {
  if (Deno.env.get(k)) return Deno.env.get(k)!
  if (!cfgCache) { const { data } = await db.from('config_privada').select('*'); cfgCache = Object.fromEntries((data ?? []).map((r) => [r.chave, r.valor])) }
  return cfgCache[k] ?? ''
}
const FUSO = 'America/Sao_Paulo'
const hojeEm = (fuso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(new Date())
const soma = (d: string, n: number) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10) }
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const partes = (iso: string, fuso: string) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return { data: `${p.year}-${p.month}-${p.day}`, hora: `${p.hour}:${p.minute}` }
}

type AtividadeGoogleRef = { id: string; google_event_id: string | null }
type MotivoRemocao = 'atividade_ausente' | 'duplicata_com_canonico'
type CandidatoOrfao = { id: string; plannerId: string; titulo: string; data: string | null; hora: string | null }
type OrfaoListado = CandidatoOrfao & { motivo: MotivoRemocao }

/** Espelho de src/google-orfaos.ts — conservador: erro DB não apaga; mismatch só com canônico presente. */
function decidirOrfao(opts: {
  atividade: AtividadeGoogleRef | null
  error?: { message?: string } | null
  eventId: string
  idsDoMesmoPlanner: string[]
}): { acao: 'remover'; motivo: MotivoRemocao } | { acao: 'preservar'; motivo: string } {
  if (opts.error) throw new Error(`Falha ao consultar atividade para limpeza de órfãos: ${opts.error.message ?? 'erro'}`)
  if (!opts.atividade) return { acao: 'remover', motivo: 'atividade_ausente' }
  const canon = opts.atividade.google_event_id
  if (!canon) return { acao: 'preservar', motivo: 'sem_google_event_id' }
  if (canon === opts.eventId) return { acao: 'preservar', motivo: 'ids_iguais' }
  if (opts.idsDoMesmoPlanner.includes(canon)) return { acao: 'remover', motivo: 'duplicata_com_canonico' }
  return { acao: 'preservar', motivo: 'mismatch_ambiguo' }
}

function deveRemoverOrfao(opts: Parameters<typeof decidirOrfao>[0]): boolean {
  return decidirOrfao(opts).acao === 'remover'
}

async function accessToken(refresh: string) {
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: await cfg('GOOGLE_CLIENT_ID'), client_secret: await cfg('GOOGLE_CLIENT_SECRET'), refresh_token: refresh, grant_type: 'refresh_token' }) })
  const j = await r.json()
  if (!r.ok) throw new Error(j.error === 'invalid_grant' ? 'Acesso ao Google expirou ou foi removido. Conecte de novo.' : `Google: ${j.error_description || j.error}`)
  return j.access_token as string
}

function clienteGoogle(token: string) {
  return async (path: string, init: RequestInit = {}) => {
    const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary' + path, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } })
    if (r.status === 404 || r.status === 410) return null
    if (!r.ok) throw new Error(`Google Agenda ${r.status}: ${await r.text()}`)
    return r.status === 204 ? {} : r.json()
  }
}

async function varrerCandidatosOrfaos(G: (path: string, init?: RequestInit) => Promise<any>, hoje: string, fuso: string): Promise<CandidatoOrfao[]> {
  const inicio = soma(hoje, -7)
  const termino = soma(hoje, 90)
  const candidatos: CandidatoOrfao[] = []
  let pageToken: string | undefined
  do {
    const qOrfaos = new URLSearchParams({
      timeMin: new Date(`${inicio}T00:00:00-03:00`).toISOString(),
      timeMax: new Date(`${termino}T00:00:00-03:00`).toISOString(),
      singleEvents: 'true',
      maxResults: '250',
      ...(pageToken ? { pageToken } : {}),
    })
    const listaOrfaos = await G(`/events?${qOrfaos}`)
    for (const e of listaOrfaos?.items ?? []) {
      const plannerId = e.extendedProperties?.private?.plannerId
      if (e.status === 'cancelled' || !plannerId || !e.id) continue
      const ini = e.start?.dateTime ? partes(e.start.dateTime, fuso) : { data: e.start?.date ?? null, hora: null }
      candidatos.push({ id: e.id, plannerId, titulo: e.summary || '(sem título)', data: ini.data, hora: ini.hora })
    }
    pageToken = listaOrfaos?.nextPageToken
  } while (pageToken)
  return candidatos
}

async function atividadesExistentes(userId: string, idsUnicos: string[]): Promise<Map<string, AtividadeGoogleRef>> {
  const existentes = new Map<string, AtividadeGoogleRef>()
  for (let i = 0; i < idsUnicos.length; i += 200) {
    const { data, error } = await db.from('atividades')
      .select('id, google_event_id')
      .eq('user_id', userId)
      .in('id', idsUnicos.slice(i, i + 200))
    if (error) throw new Error(`Falha ao consultar atividade para limpeza de órfãos: ${error.message ?? 'erro'}`)
    for (const a of data ?? []) existentes.set(a.id, a as AtividadeGoogleRef)
  }
  return existentes
}

function decidirLista(candidatos: CandidatoOrfao[], existentes: Map<string, AtividadeGoogleRef>): OrfaoListado[] {
  const idsPorPlanner = new Map<string, string[]>()
  for (const c of candidatos) {
    const lista = idsPorPlanner.get(c.plannerId)
    if (lista) lista.push(c.id)
    else idsPorPlanner.set(c.plannerId, [c.id])
  }
  const orfaos: OrfaoListado[] = []
  for (const ev of candidatos) {
    const d = decidirOrfao({
      atividade: existentes.get(ev.plannerId) ?? null,
      error: null,
      eventId: ev.id,
      idsDoMesmoPlanner: idsPorPlanner.get(ev.plannerId) ?? [ev.id],
    })
    if (d.acao === 'remover') orfaos.push({ ...ev, motivo: d.motivo })
  }
  return orfaos
}

/** Só leitura ou remoção pontual. Não envia pendentes, não processa exclusões e não atualiza ultimo_sync. */
async function acaoManualOrfaos(userId: string, refresh: string, fuso: string, apagar: boolean) {
  const G = clienteGoogle(await accessToken(refresh))
  const hoje = hojeEm(fuso)
  const candidatos = await varrerCandidatosOrfaos(G, hoje, fuso)
  const existentes = await atividadesExistentes(userId, [...new Set(candidatos.map((c) => c.plannerId))])
  const orfaos = decidirLista(candidatos, existentes)
  if (!apagar) {
    return { acao: 'listarOrfaos' as const, encontrados: orfaos.length, orfaos, orfaos_removidos: 0, erros: 0 }
  }
  let removidos = 0, erros = 0
  const mantidos: OrfaoListado[] = []
  const falhas: Array<{ id: string; titulo: string; erro: string }> = []
  for (const ev of orfaos) {
    try {
      await G(`/events/${ev.id}`, { method: 'DELETE' })
      removidos++
      mantidos.push(ev)
    } catch (e) {
      erros++
      falhas.push({ id: ev.id, titulo: ev.titulo, erro: (e as Error).message })
    }
    await sleep(100)
  }
  return { acao: 'limparOrfaos' as const, encontrados: orfaos.length, orfaos: mantidos, orfaos_removidos: removidos, erros, falhas }
}

async function sincronizar(userId: string, refresh: string, fuso: string, forcarLimpeza = false) {
  const G = clienteGoogle(await accessToken(refresh))
  const hoje = hojeEm(fuso)
  const { data: perf } = await db.from('membros').select('lembrete_min').eq('user_id', userId).limit(1).maybeSingle()
  const LM = Math.max(0, Math.min(240, Number(perf?.lembrete_min ?? 15)))

  // 1) Exclusões
  const { data: exc } = await db.from('google_exclusoes').select('*').eq('user_id', userId)
  for (const e of exc ?? []) { await G(`/events/${e.google_event_id}`, { method: 'DELETE' }); await db.from('google_exclusoes').delete().eq('user_id', userId).eq('google_event_id', e.google_event_id) }

  // 2) Envia atividades pendentes (criadas/alteradas/feitas) — antes da limpeza para reduzir corrida POST→DELETE
  const { data: pend } = await db.from('atividades').select('*').eq('user_id', userId).eq('google_sync_pendente', true).gte('data', soma(hoje, -1))
  for (const a of pend ?? []) {
    const ini = (a.hora ?? '09:00').slice(0, 5); const [h, m] = ini.split(':').map(Number); const f = Math.min(h * 60 + m + (a.duracao_min ?? 30), 23 * 60 + 59)
    const fim = `${String(Math.floor(f / 60)).padStart(2, '0')}:${String(f % 60).padStart(2, '0')}`
    const corpo = JSON.stringify({
      summary: (a.feito ? '✅ ' : '') + a.titulo,
      description: [a.observacao, a.status_texto, '— Planner Diário'].filter(Boolean).join('\n'),
      start: { dateTime: `${a.data}T${ini}:00`, timeZone: fuso }, end: { dateTime: `${a.data}T${fim}:00`, timeZone: fuso },
      extendedProperties: { private: { plannerId: a.id } },
      reminders: { useDefault: false, overrides: ({ email: [{ method: 'email', minutes: LM }], ambos: [{ method: 'email', minutes: LM }, { method: 'popup', minutes: LM }], celular: [{ method: 'popup', minutes: LM }], nenhum: [] } as Record<string, unknown[]>)[a.lembrete_canal ?? 'ambos'] ?? [] },
    })
    let ev = a.google_event_id ? await G(`/events/${a.google_event_id}`, { method: 'PATCH', body: corpo }) : null
    if (!ev) ev = await G('/events', { method: 'POST', body: corpo })
    await db.from('atividades').update({ google_event_id: ev.id, google_sync_pendente: false }).eq('id', a.id)
  }

  // 3) Limpeza de órfãos (depois do envio): só apaga ausência confirmada ou duplicata com canônico na janela
  let orfaosRemovidos = 0
  // No máximo ~1x/hora: só roda nos primeiros 15 min de cada hora UTC (cron a cada 15 min), ou se forçada.
  const limparOrfaos = forcarLimpeza || new Date().getUTCMinutes() < 15
  if (limparOrfaos) {
    const candidatos = await varrerCandidatosOrfaos(G, hoje, fuso)
    const existentes = await atividadesExistentes(userId, [...new Set(candidatos.map((c) => c.plannerId))])
    const idsPorPlanner = new Map<string, string[]>()
    for (const c of candidatos) {
      const lista = idsPorPlanner.get(c.plannerId)
      if (lista) lista.push(c.id)
      else idsPorPlanner.set(c.plannerId, [c.id])
    }
    for (const ev of candidatos) {
      if (deveRemoverOrfao({
        atividade: existentes.get(ev.plannerId) ?? null,
        error: null,
        eventId: ev.id,
        idsDoMesmoPlanner: idsPorPlanner.get(ev.plannerId) ?? [ev.id],
      })) {
        await G(`/events/${ev.id}`, { method: 'DELETE' })
        orfaosRemovidos++
        await sleep(100)
      }
    }
  }

  // 4) Puxa eventos de hoje a +14 dias (ignora os que vieram do próprio app)
  const q = new URLSearchParams({ timeMin: new Date(`${hoje}T00:00:00-03:00`).toISOString(), timeMax: new Date(`${soma(hoje, 15)}T00:00:00-03:00`).toISOString(),
    singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeZone: fuso })
  const lista = await G(`/events?${q}`)
  const linhas = (lista?.items ?? []).filter((e: any) => e.status !== 'cancelled' && !e.extendedProperties?.private?.plannerId).map((e: any) => {
    const ini = e.start?.dateTime ? partes(e.start.dateTime, fuso) : { data: e.start?.date, hora: null }
    const fim = e.end?.dateTime ? partes(e.end.dateTime, fuso).hora : null
    return { user_id: userId, event_id: e.id, data: ini.data, hora: ini.hora, hora_fim: fim, titulo: e.summary || '(sem título)' }
  })
  await db.from('eventos_google').delete().eq('user_id', userId).gte('data', hoje)
  if (linhas.length) await db.from('eventos_google').upsert(linhas)
  await db.from('google_tokens').update({ ultimo_sync: new Date().toISOString(), erro: null }).eq('user_id', userId)
  return { enviados: pend?.length ?? 0, eventos: linhas.length, orfaos_removidos: orfaosRemovidos, limpeza_orfaos: limparOrfaos }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const auth = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  let soUser: string | null = null
  if (!auth || auth !== (await cfg('CRON_SECRET'))) {
    const { data } = await db.auth.getUser(auth)
    if (!data.user) return new Response('não autorizado', { status: 401, headers: cors })
    soUser = data.user.id
  }
  if (!(await cfg('GOOGLE_CLIENT_ID'))) return Response.json({ ok: false, erro: 'Google ainda não configurado no servidor.' }, { headers: cors })

  let corpo: Record<string, unknown> = {}
  try { corpo = await req.json() } catch { /* corpo vazio/não-JSON */ }
  const acao = corpo?.acao
  const forcarLimpeza = corpo?.forcarLimpeza === true

  if (acao === 'listarOrfaos' || acao === 'limparOrfaos') {
    if (!soUser) return Response.json({ ok: false, erro: 'Esta ação só pode ser feita no app, com a sua conta.' }, { status: 401, headers: cors })
    const { data: tok } = await db.from('google_tokens').select('user_id, refresh_token').eq('user_id', soUser).maybeSingle()
    if (!tok) return Response.json({ ok: true, resultado: { acao, erro: 'Google não conectado' } }, { headers: cors })
    const { data: mem } = await db.from('membros').select('fuso').eq('user_id', soUser).limit(1).maybeSingle()
    try {
      const resultado = await acaoManualOrfaos(tok.user_id, tok.refresh_token, (mem?.fuso as string) ?? FUSO, acao === 'limparOrfaos')
      return Response.json({ ok: true, resultado }, { headers: cors })
    } catch (e) {
      const msg = (e as Error).message
      if (acao === 'limparOrfaos') await db.from('google_tokens').update({ erro: msg }).eq('user_id', soUser)
      return Response.json({ ok: true, resultado: { acao, erro: msg } }, { headers: cors })
    }
  }

  let q = db.from('google_tokens').select('user_id, refresh_token')
  if (soUser) q = q.eq('user_id', soUser)
  const { data: tokens } = await q
  const { data: membros } = await db.from('membros').select('user_id, fuso')
  const fusos = new Map((membros ?? []).map((m) => [m.user_id, m.fuso]))
  const res: Record<string, unknown> = {}
  for (const t of tokens ?? []) {
    try { res[t.user_id] = await sincronizar(t.user_id, t.refresh_token, fusos.get(t.user_id) ?? FUSO, forcarLimpeza) }
    catch (e) { const msg = (e as Error).message; res[t.user_id] = { erro: msg }; await db.from('google_tokens').update({ erro: msg }).eq('user_id', t.user_id) }
  }
  return Response.json({ ok: true, resultado: soUser ? res[soUser] ?? { erro: 'Google não conectado' } : res }, { headers: cors })
})
