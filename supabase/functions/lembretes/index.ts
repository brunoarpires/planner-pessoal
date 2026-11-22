// Edge Function (Deno) chamada a cada 1 min pelo pg_cron (ver supabase/cron.sql).
// Envia lembretes antes das atividades e no horário de fim do dia, por Web Push.
// Secrets: CRON_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:...), APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
// Config: variável de ambiente (secrets) ou tabela config_privada (mesma chave)
let CFG: Record<string, string> = {}
const env = (k: string) => Deno.env.get(k) ?? CFG[k] ?? ''
let APP = '/'

function agora(fuso: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map((x) => [x.type, x.value]))
  return { data: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) }
}
const min = (h: string) => { const [a, b] = h.split(':').map(Number); return a * 60 + b }

async function jaEnviado(chave: string) {
  const { error } = await db.from('lembretes_enviados').insert({ chave })
  return !!error // conflito de chave = já enviado
}

async function push(userId: string, title: string, body: string, tag: string) {
  if (!env('VAPID_PRIVATE_KEY')) return
  const { data } = await db.from('push_inscricoes').select('*').eq('user_id', userId)
  await Promise.all((data ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title, body, tag, url: APP }), { urgency: 'high', TTL: 900 })
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode
      if (code === 404 || code === 410) await db.from('push_inscricoes').delete().eq('id', s.id)
    }
  }))
}

Deno.serve(async (req) => {
  const { data: cfgRows } = await db.from('config_privada').select('*')
  CFG = Object.fromEntries((cfgRows ?? []).map((r) => [r.chave, r.valor])); APP = env('APP_URL') || '/'
  if (req.headers.get('Authorization') !== `Bearer ${env('CRON_SECRET')}`) return new Response('não autorizado', { status: 401 })
  if (env('VAPID_PRIVATE_KEY')) webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:admin@example.com', env('VAPID_PUBLIC_KEY'), env('VAPID_PRIVATE_KEY'))

  const { data: membros } = await db.from('membros').select('*')
  let enviados = 0
  // Fila de avisos (ex.: atividade compartilhada com você)
  const { data: fila } = await db.from('notificacoes').select('*').order('criado_em').limit(200)
  for (const n of fila ?? []) {
    const m = (membros ?? []).find((x) => x.user_id === n.user_id)
    { await push(n.user_id, n.titulo, n.corpo, `notif-${n.id}`); enviados++ }
    await db.from('notificacoes').delete().eq('id', n.id)
  }
  for (const m of membros ?? []) {
    const { data: hoje, min: agoraMin } = agora(m.fuso)
    const { data: ativs } = await db.from('atividades').select('id,titulo,hora,status_pessoal,lembrete_canal').eq('user_id', m.user_id).eq('data', hoje)

    // 1) Lembrete antes de cada atividade
    for (const a of ativs ?? []) {
      if (!a.hora || a.status_pessoal || a.lembrete_canal === 'nenhum' || a.lembrete_canal === 'email') continue
      const c = a.lembrete_canal ?? 'ambos'
      const falta = min(a.hora) - agoraMin
      if (falta >= 0 && falta <= m.lembrete_min && !(await jaEnviado(`ativ:${a.id}`))) {
        const txt = `${a.titulo} às ${a.hora.slice(0, 5)}`
        if ((c === 'celular' || c === 'ambos')) await push(m.user_id, '⏰ Próxima atividade', txt, a.id)
        enviados++
      }
    }
    // 2) Fim do dia com checklist incompleto (avisa 30 min antes e no horário)
    const pend = (ativs ?? []).filter((a) => !a.status_pessoal).length
    const fim = min(m.fim_dia)
    for (const [antes, rot] of [[30, 'em 30 minutos'], [0, 'agora']] as const) {
      if (pend && agoraMin >= fim - antes && !(await jaEnviado(`fim:${m.user_id}:${hoje}:${antes}`))) {
        const txt = `Seu dia fecha ${rot}: ${pend} atividade(s) sem checklist. Você pode marcar ou ajustar depois no app.`
        await push(m.user_id, '📋 Feche seu checklist', txt, `fim-${hoje}`)
        enviados++
      }
    }
  }
  return Response.json({ ok: true, enviados })
})
