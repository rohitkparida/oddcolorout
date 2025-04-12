const CACHE_NAME = 'odd-color-out-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/stylesheet.css',
  '/script.js',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Lilita+One&display=swap',
  'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js',
  '/icons/icon-512x512.png',
  '/icons/icon-384x384.png',
  '/icons/icon-192x192.png',
  '/icons/icon-152x152.png',
  '/icons/icon-144x144.png',
  '/icons/icon-128x128.png',
  '/icons/icon-96x96.png',
  '/icons/icon-72x72.png',
];

// Install event: cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        // Add urls one by one to avoid failing if one fails
        const promises = urlsToCache.map(url => {
          return cache.add(new Request(url, { mode: 'no-cors' }))
            .catch(err => console.warn(`Failed to cache ${url}:`, err));
        });
        return Promise.all(promises);
      })
      .then(() => self.skipWaiting()) // Activate worker immediately
      .catch(err => console.error('Cache open failed:', err))
  );
});

// Activate event: clean up old caches
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (!cacheWhitelist.includes(cacheName)) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => self.clients.claim()) // Take control immediately
  );
});

// Fetch event: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  // For Google Fonts stylesheets, use a network-first strategy
  if (event.request.url.startsWith('https://fonts.googleapis.com/')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return fetch(event.request)
          .then(response => {
            // Cache the new response
            cache.put(event.request, response.clone());
            return response;
          })
          .catch(() => {
            // If network fails, try the cache
            return cache.match(event.request);
          });
      })
    );
    return; // Don't process further
  }

  // For other requests, use cache-first strategy
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Not in cache - fetch from network
        return fetch(event.request).then(
          response => {
            // Check if we received a valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
               // If fetching external resource like confetti CDN and it fails, just return the failed response
               // We don't want to cache non-basic responses or errors usually.
                if (response && response.type !== 'basic') { 
                    // Don't cache opaque responses (like from CDNs with no-cors)
                    return response;
                }
              // If it's a local resource fetch that failed, maybe log it.
              console.warn('Fetch failed for:', event.request.url);
              return response; 
            }

            // IMPORTANT: Clone the response. A response is a stream
            // and because we want the browser to consume the response
            // as well as the cache consuming the response, we need
            // to clone it so we have two streams.
            const responseToCache = response.clone();

            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          }
        );
      })
      .catch(error => {
        // Generic fallback (optional)
        console.error('Fetch error:', error);
        // You could return a fallback page here if desired:
        // return caches.match('/offline.html');
      })
  );
}); 