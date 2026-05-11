const CACHE_NAME = 'andreabozzo-v17';
const BASE_PATH = new URL(self.registration.scope).pathname;
const ASSETS_TO_CACHE = [
    BASE_PATH,
    `${BASE_PATH}index.html`,
    `${BASE_PATH}assets/styles.min.css`,
    `${BASE_PATH}assets/main.min.js`,
    `${BASE_PATH}assets/data/case-studies.json`,
    `${BASE_PATH}assets/data/contributions.json`,
    `${BASE_PATH}assets/data/papers.json`,
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

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const requestUrl = new URL(request.url);

    if (!request.url.startsWith(self.location.origin)) {
        return;
    }

    if (request.url.includes('api.github.com')) {
        return;
    }

    if (requestUrl.pathname === `${BASE_PATH}api` || requestUrl.pathname.startsWith(`${BASE_PATH}api/`)) {
        return;
    }

    const networkTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network timeout')), 4500);
    });

    event.respondWith(
        Promise.race([fetch(request), networkTimeout])
            .then((response) => {
                const responseClone = response.clone();

                if (response.status === 200) {
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }

                return response;
            })
            .catch(() => {
                return caches.match(request).then((cachedResponse) => {
                    if (cachedResponse) {
                        return cachedResponse;
                    }

                    if (request.destination === 'document') {
                        return caches.match(`${BASE_PATH}index.html`).then((fallbackResponse) => fallbackResponse || new Response('', {
                            status: 504,
                            statusText: 'Gateway Timeout'
                        }));
                    }

                    return new Response('', {
                        status: 504,
                        statusText: 'Gateway Timeout'
                    });
                });
            })
    );
});

self.addEventListener('message', (event) => {
    if (event.data.action === 'skipWaiting') {
        self.skipWaiting();
    }
});
