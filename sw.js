const CACHE_NAME = 'andreabozzo-v24';
const BASE_PATH = new URL(self.registration.scope).pathname;
const ASSETS_TO_CACHE = [
    BASE_PATH,
    `${BASE_PATH}index.html`,
    `${BASE_PATH}assets/styles.min.css`,
    `${BASE_PATH}assets/main.min.js`,
    `${BASE_PATH}assets/data/case-studies.json`,
    `${BASE_PATH}assets/data/contributions.json`,
    `${BASE_PATH}assets/data/papers.json`,
    `${BASE_PATH}assets/data/writing.json`,
    `${BASE_PATH}assets/data/packages.json`,
    `${BASE_PATH}assets/wasm/site_engine.js`,
    `${BASE_PATH}assets/wasm/site_engine_bg.wasm`,
    `${BASE_PATH}work/dataprof/`,
    `${BASE_PATH}work/apache-rust-upstream/`,
    `${BASE_PATH}work/ares-ceres/`,
    `${BASE_PATH}work/mosaico/`,
    `${BASE_PATH}work/zero-grappler/`,
    `${BASE_PATH}work/nephtys/`,
    `${BASE_PATH}work/dce/`,
    `${BASE_PATH}work/lakehouse-starter-kit/`,
    `${BASE_PATH}work/lakekeeper/`,
    `${BASE_PATH}work/peek-a-boo/`,
    `${BASE_PATH}work/lance-bridge/`,
    `${BASE_PATH}work/druid-datafusion-bridge/`,
    `${BASE_PATH}work/datapizza-ai/`,
    `${BASE_PATH}manifest.json`
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => Promise.allSettled(ASSETS_TO_CACHE.map((asset) => cache.add(asset))))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Strategy:
// - documents (HTML navigations): network-first with a short timeout, fall back to cache.
//   Keeps the user on fresh content but never strands them when offline.
// - everything else (CSS/JS/WASM/JSON/images): cache-first, with a background refresh.
//   Static assets are content-addressed via build, so stale-while-revalidate is safe.
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const requestUrl = new URL(request.url);

    if (!request.url.startsWith(self.location.origin)) return;
    if (request.url.includes('api.github.com')) return;
    if (requestUrl.pathname === `${BASE_PATH}api` || requestUrl.pathname.startsWith(`${BASE_PATH}api/`)) return;

    if (request.destination === 'document') {
        event.respondWith(networkFirstDocument(request));
        return;
    }

    event.respondWith(cacheFirst(request));
});

function networkFirstDocument(request) {
    const networkTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), 4500);
    });

    return Promise.race([fetch(request), networkTimeout])
        .then((response) => {
            if (response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return response;
        })
        .catch(() =>
            caches.match(request).then((cached) =>
                cached
                || caches.match(`${BASE_PATH}index.html`).then((fallback) => fallback || gatewayTimeout())
            )
        );
}

function cacheFirst(request) {
    return caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
            .then((response) => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            })
            .catch(() => cached);

        return cached || networkFetch;
    });
}

function gatewayTimeout() {
    return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
