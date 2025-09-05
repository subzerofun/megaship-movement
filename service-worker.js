/**
 * Service Worker for Megaship Movement Tracker
 * Handles push notifications and displays them to the user
 */

self.addEventListener('install', function(event) {
    console.log('[Service Worker] Installing...');
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.log('[Service Worker] Activated');
    event.waitUntil(clients.claim());
});

self.addEventListener('push', function(event) {
    console.log('[Service Worker] Push received');
    
    if (!event.data) {
        console.log('[Service Worker] No data in push event');
        return;
    }
    
    try {
        const data = event.data.json();
        console.log('[Service Worker] Push data:', data);
        
        // Format timestamp to user's local time
        let localTime = '';
        if (data.timestamp) {
            const date = new Date(data.timestamp);
            localTime = date.toLocaleTimeString();
        }
        
        // Customize notification based on event type
        let title = data.title || 'Megaship Update';
        let body = data.body || 'A megaship event occurred';
        
        if (data.data && data.data.event === 'jumping') {
            // Ship left system
            body = `Left ${data.data.system_from} at ${localTime}`;
        } else if (data.data && data.data.event === 'appearing') {
            // Ship appeared in system
            body = `Appeared in ${data.data.system_to} at ${localTime}`;
        }
        
        const options = {
            body: body,
            icon: data.icon || '/img/icon_1.svg',
            badge: data.badge || '/img/badge.png',
            vibrate: [200, 100, 200],
            data: data.data || {},
            requireInteraction: false,
            actions: [
                {
                    action: 'view',
                    title: 'View Tracker'
                },
                {
                    action: 'dismiss',
                    title: 'Dismiss'
                }
            ]
        };
        
        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    } catch (error) {
        console.error('[Service Worker] Error handling push:', error);
    }
});

self.addEventListener('notificationclick', function(event) {
    console.log('[Service Worker] Notification click:', event.action);
    event.notification.close();
    
    if (event.action === 'view' || !event.action) {
        // Open the tracker or focus existing tab
        event.waitUntil(
            clients.matchAll({type: 'window'}).then(function(clientList) {
                // Check if tracker is already open
                for (let client of clientList) {
                    if (client.url.includes('/') && 'focus' in client) {
                        return client.focus();
                    }
                }
                // Open new window if not found
                if (clients.openWindow) {
                    return clients.openWindow('/');
                }
            })
        );
    }
});

// Handle service worker updates
self.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});