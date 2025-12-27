/* eslint-disable no-restricted-globals */

import { clientsClaim } from 'workbox-core';
import { ExpirationPlugin } from 'workbox-expiration';
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';

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
  new CacheFirst({
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
  new CacheFirst({
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
                      // Controlla se il video è già nella cache
                      const response = await cache.match(videoUrl);
                      if (response) {
                          cachedVideosCount++;
                          console.log(`Video ${videoUrl} già in cache. Cached: ${cachedVideosCount}/${totalVideos}`);
                          // Invia aggiornamento di progresso anche per video già cacheati
                          event.source.postMessage({
                              type: 'VIDEOS_CACHING_PROGRESS',
                              progress: cachedVideosCount / totalVideos,
                              cachedCount: cachedVideosCount,
                              totalCount: totalVideos
                          });
                          return; // Salta il fetch se già in cache
                      }

                      // Se non in cache, procedi con il fetch e l'aggiunta
                      const request = new Request(videoUrl, { cache: 'no-cache' }); // Forza il fetch
                      const responseFromNetwork = await fetch(request);
                      if (!responseFromNetwork.ok) {
                          throw new Error(`Failed to fetch ${videoUrl}: ${responseFromNetwork.statusText}`);
                      }
                      await cache.put(request, responseFromNetwork.clone());
                      cachedVideosCount++;
                      console.log(`Video ${videoUrl} aggiunto alla cache. Cached: ${cachedVideosCount}/${totalVideos}`);
                      
                      // Invia aggiornamento di progresso al client
                      event.source.postMessage({
                          type: 'VIDEOS_CACHING_PROGRESS',
                          progress: cachedVideosCount / totalVideos,
                          cachedCount: cachedVideosCount,
                          totalCount: totalVideos
                      });

                  } catch (error) {
                      console.error(`Errore durante il caching di ${videoUrl}:`, error);
                      // Non blocchiamo il processo per un singolo errore di video, ma lo registriamo.
                      // Potremmo inviare un messaggio di errore specifico per quel video se necessario.
                  }
              });

              // Attendi che tutte le operazioni di caching siano complete
              await Promise.allSettled(cachingPromises);

              if (cachedVideosCount === totalVideos) {
                  console.log('Service Worker: Tutti i video sono stati processati (cacheati o tentato).');
                  event.source.postMessage({ type: 'VIDEOS_CACHING_COMPLETE' });
              } else {
                  console.error('Service Worker: Caching video completato con errori o video mancanti.');
                  event.source.postMessage({ type: 'VIDEOS_CACHING_ERROR', error: `Solo ${cachedVideosCount} di ${totalVideos} video sono stati cacheati con successo.` });
              }
          })()
      );
  }
});