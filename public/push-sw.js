// Loaded by the app's service worker (see vite.config.ts): shows the game's
// push notifications and opens the right page when one is tapped.

self.addEventListener('push', (event) => {
  let notice
  try {
    notice = event.data ? event.data.json() : undefined
  } catch {
    notice = undefined
  }
  if (!notice || typeof notice.title !== 'string') return
  event.waitUntil(
    self.registration.showNotification(notice.title, {
      body: notice.body,
      tag: notice.tag,
      data: { url: notice.url || '/fantasia' },
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      lang: 'pt-BR',
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/fantasia', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.focus().then((w) => (w ?? open).navigate(url))
      return self.clients.openWindow(url)
    }),
  )
})
