import { supabase } from './supabase'
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

const b64 = (s: string) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))) }

export const pushSuportado = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export async function ativarPush(): Promise<string> {
  if (!pushSuportado()) return 'Este navegador não suporta notificações. No iPhone, adicione o app à Tela de Início primeiro (iOS 16.4+).'
  if (!VAPID) return 'Chave VAPID não configurada (VITE_VAPID_PUBLIC_KEY).'
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') return 'Permissão de notificação negada.'
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(VAPID) }))
  const j = sub.toJSON()
  const { error } = await supabase.from('push_inscricoes').upsert({ endpoint: j.endpoint, p256dh: j.keys!.p256dh, auth: j.keys!.auth }, { onConflict: 'endpoint' })
  return error ? 'Erro ao salvar: ' + error.message : 'Notificações ativadas neste aparelho ✅'
}
