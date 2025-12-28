/* eslint-disable no-restricted-globals */

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';

clientsClaim();

precacheAndRoute(self.__WB_MANIFEST);

const publicUrl = process.env.PUBLIC_URL || '/client';
registerRoute(
  new NavigationRoute(createHandlerBoundToURL(publicUrl + '/index.html'), {
    denyList: [/^\/admin/, /^\/videos/],
  })
);

registerRoute(
  ({ request }) =>
    request.destination === 'image' ||
    request.destination === 'script' ||
    request.destination === 'style',
  new NetworkFirst({
    cacheName: 'static-resources',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

registerRoute(
  ({ url }) => url.pathname.startsWith('/videos/') && url.pathname.endsWith('.mp4'),
  new NetworkFirst({
    cacheName: 'videos-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
    ],
  })
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CACHE_VIDEOS' && Array.isArray(event.data.videos)) {
      console.log('Service Worker: Richiesta di caching video ricevuta:', event.data.videos);
      const totalVideos = event.data.videos.length;
      let cachedVideosCount = 0;

      event.waitUntil(
          (async () => {
              const cache = await caches.open('videos-cache');
              
              const cachingPromises = event.data.videos.map(async (videoUrl) => {
                  try {
                      const request = new Request(videoUrl, { cache: 'reload' });
                      const responseFromNetwork = await fetch(request);
                      
                      if (!responseFromNetwork.ok) {
                          throw new Error(`Failed to fetch ${videoUrl}: ${responseFromNetwork.statusText}`);
                      }
                      
                      await cache.delete(videoUrl); 
                      await cache.put(videoUrl, responseFromNetwork.clone());
                      
                      cachedVideosCount++;
                      console.log(`Video ${videoUrl} aggiornato/aggiunto alla cache. Cached: ${cachedVideosCount}/${totalVideos}`);
                      
                      event.source.postMessage({
                          type: 'VIDEOS_CACHING_PROGRESS',
                          progress: cachedVideosCount / totalVideos,
                          cachedCount: cachedVideosCount,
                          totalCount: totalVideos
                      });

                  } catch (error) {
                      console.error(`Errore durante il caching di ${videoUrl}:`, error);
                  }
              });

              await Promise.allSettled(cachingPromises);

              const currentCachedKeys = await cache.keys();
              const actuallyCachedVideos = event.data.videos.filter(videoUrl => 
                  currentCachedKeys.some(key => key.url.endsWith(videoUrl))
              ).length;


              if (actuallyCachedVideos === totalVideos) {
                  console.log('Service Worker: Tutti i video sono stati processati (cacheati o tentato).');
                  event.source.postMessage({ 
                      type: 'VIDEOS_CACHING_COMPLETE',
                      cachedCount: actuallyCachedVideos,
                      totalCount: totalVideos
                  });
              } else {
                  console.error('Service Worker: Caching video completato con errori o video mancanti.');
                  event.source.postMessage({ 
                      type: 'VIDEOS_CACHING_ERROR', 
                      error: `Solo ${actuallyCachedVideos} di ${totalVideos} video sono stati cacheati con successo.`,
                      cachedCount: actuallyCachedVideos,
                      totalCount: totalVideos
                  });
              }
          })()
      );
  }
});