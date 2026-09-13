// Retirement worker. Keep this URL available for browsers with an old registration.
// New pages do not register a worker. Only this site's old cache names are removed.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => /^andreabozzo-v\d+$/.test(name)).map(name => caches.delete(name)));
    await self.registration.unregister();
  })());
});
