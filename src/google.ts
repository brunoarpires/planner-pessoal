// Google Agenda: login/conexão no app; a sincronização roda no servidor (Edge Function google-sync)
// com o refresh token guardado de forma privada — não precisa reconectar.
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

export const ESCOPO = 'https://www.googleapis.com/auth/calendar.events'
const opcoes = () => ({ scopes: ESCOPO, redirectTo: location.origin + '/', queryParams: { access_type: 'offline', prompt: 'consent' } })

export async function entrarComGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: opcoes() })
  if (error) throw error
}
/** Logado por e-mail: vincula a conta Google (precisa de "Allow manual linking" no Supabase). */
export async function conectarGoogle() {
  const { data } = await supabase.auth.getUser()
  const temGoogle = data.user?.identities?.some((i) => i.provider === 'google')
  const { error } = temGoogle ? await supabase.auth.signInWithOAuth({ provider: 'google', options: opcoes() }) : await supabase.auth.linkIdentity({ provider: 'google', options: opcoes() })
  if (error) throw error
}

/** Logo após o login com Google o Supabase entrega o refresh token: guardamos no servidor. */
export async function guardarRefreshToken(s: Session | null) {
  const rt = s?.provider_refresh_token
  if (!rt) return false
  const { error } = await supabase.rpc('salvar_google_token', { p_refresh: rt })
  return !error
}

let emAndamento: Promise<unknown> | null = null
let agendado: ReturnType<typeof setTimeout> | undefined
/** Sincroniza agora (evita chamadas em paralelo). */
export function sincronizarGoogle(): Promise<unknown> {
  if (!emAndamento) emAndamento = supabase.functions.invoke('google-sync', { body: {} }).catch(() => null).finally(() => { emAndamento = null })
  return emAndamento
}
/** Sincroniza alguns segundos depois de uma edição (agrupa várias edições). */
export function sincronizarEmBreve(ms = 3000) { clearTimeout(agendado); agendado = setTimeout(sincronizarGoogle, ms) }

export interface StatusGoogle { conectado: boolean; conectado_em: string | null; ultimo_sync: string | null; erro: string | null }
export async function statusGoogle(): Promise<StatusGoogle> {
  const { data } = await supabase.rpc('status_google')
  return (data?.[0] as StatusGoogle) ?? { conectado: false, conectado_em: null, ultimo_sync: null, erro: null }
}
export async function desconectarGoogle() { await supabase.rpc('desconectar_google') }

export interface EventoGoogle { event_id: string; data: string; hora: string | null; hora_fim: string | null; titulo: string }
export async function eventosDoDia(data: string): Promise<EventoGoogle[]> {
  const { data: r } = await supabase.from('eventos_google').select('*').eq('data', data).order('hora', { nullsFirst: true })
  return (r ?? []) as EventoGoogle[]
}
