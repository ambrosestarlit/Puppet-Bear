/**
 * 🐻 Puppet Bear v1.15.0
 * Service Worker - PWAオフライン対応
 */

const CACHE_NAME = 'puppet-bear-v1.15.0';
const ASSETS_TO_CACHE = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './app-core.js',
    './app-history.js',
    './app-windsway.js',
    './app-bounce.js',
    './app-walking.js',
    './app-puppet.js',
    './app-audio.js',
    './app-timeline.js',
    './app-animation.js',
    './app-layers.js',
    './app-tools.js',
    './app-clipping.js',
    './app-properties.js',
    './app-export.js',
    './app-project.js',
    './app-touch.js',
    './manifest.json',
    './logo.png',
    './seekbar-bear.png',
    './pins/papet-01.png',
    './pins/papet-02.png',
    './pins/papet-03.png',
    './pins/papet-04.png',
    './pins/papet-05.png'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
    console.log('🐻 Service Worker: インストール中...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('🐻 Service Worker: アセットをキャッシュ中...');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => {
                console.log('🐻 Service Worker: インストール完了');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('🐻 Service Worker: キャッシュエラー', error);
            })
    );
});

// アクティベート時に古いキャッシュを削除
self.addEventListener('activate', (event) => {
    console.log('🐻 Service Worker: アクティベート中...');
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('🐻 Service Worker: 古いキャッシュを削除:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('🐻 Service Worker: アクティベート完了');
                return self.clients.claim();
            })
    );
});

// フェッチリクエストの処理（キャッシュ優先、ネットワークフォールバック）
self.addEventListener('fetch', (event) => {
    // POSTリクエストなどはキャッシュしない
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // キャッシュがあればそれを返す
                    return cachedResponse;
                }

                // キャッシュがなければネットワークから取得
                return fetch(event.request)
                    .then((networkResponse) => {
                        // レスポンスが有効な場合はキャッシュに保存
                        if (networkResponse && networkResponse.status === 200) {
                            const responseToCache = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseToCache);
                                });
                        }
                        return networkResponse;
                    })
                    .catch(() => {
                        // オフライン時のフォールバック（HTMLページの場合）
                        if (event.request.headers.get('accept').includes('text/html')) {
                            return caches.match('./index.html');
                        }
                    });
            })
    );
});

// バックグラウンド同期（将来の拡張用）
self.addEventListener('sync', (event) => {
    console.log('🐻 Service Worker: バックグラウンド同期:', event.tag);
});

// プッシュ通知（将来の拡張用）
self.addEventListener('push', (event) => {
    console.log('🐻 Service Worker: プッシュ通知受信');
});
