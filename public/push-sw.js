// Importado pelo service worker gerado (Workbox). Trata notificações push.
self.addEventListener('push', (event) => {
  let d = {}
  try { d = event.data ? event.data.json() : {} } catch { d = { body: event.data && event.data.text() } }
  event.waitUntil(self.registration.showNotification(d.title || 'Planner Diário', {
    body: d.body || '', icon: '/icon.svg', badge: '/icon.svg', tag: d.tag, data: { url: d.url || '/' }
  }))
})
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) { if ('focus' in c) return c.focus() }
    return self.clients.openWindow(url)
  }))
})
