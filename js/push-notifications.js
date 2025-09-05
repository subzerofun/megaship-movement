/**
 * Push Notification Handler for Megaship Movement Tracker
 * Manages service worker registration and push subscriptions
 */

let swRegistration = null;
let isSubscribed = false;

// Check if push notifications are supported
function isPushSupported() {
    return 'serviceWorker' in navigator && 'PushManager' in window;
}

// Initialize push notifications
async function initPush() {
    if (!isPushSupported()) {
        console.log('Push notifications not supported');
        return;
    }
    
    try {
        // Register service worker
        swRegistration = await navigator.serviceWorker.register('/service-worker.js');
        console.log('Service Worker registered:', swRegistration);
        
        // Check if already subscribed
        const subscription = await swRegistration.pushManager.getSubscription();
        isSubscribed = subscription !== null;
        
        if (isSubscribed) {
            console.log('User is already subscribed');
        }
        
        // Show subscribe button
        const subscribeBtn = document.getElementById('subscribeBtn');
        if (subscribeBtn) {
            subscribeBtn.style.display = 'flex';
            subscribeBtn.style.alignItems = 'center';
            updateSubscribeButton();
        }
        
    } catch (error) {
        console.error('Failed to register service worker:', error);
    }
}

// Update subscribe button state
function updateSubscribeButton() {
    const subscribeBtn = document.getElementById('subscribeBtn');
    if (!subscribeBtn) return;
    
    const btnText = subscribeBtn.querySelector('span:first-child');
    btnText.style.display = 'inline-block';
    btnText.style.minWidth = '120px';  // Fixed width to prevent jumping
    btnText.style.textAlign = 'left';
    
    if (isSubscribed) {
        btnText.innerHTML = '🔴 <strong>UNSUBSCRIBE</strong>';
        subscribeBtn.style.background = '#3f1b00ff';  // Dark brown
        subscribeBtn.style.color = '#000000ff';
    } else {
        btnText.innerHTML = '🟢 <strong>SUBSCRIBE</strong>';
        subscribeBtn.style.background = '#FF8C00';
        subscribeBtn.style.color = '#000000';
    }
}

// Convert base64 to Uint8Array
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');
    
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// Subscribe to push notifications
async function subscribeToPush() {
    try {
        // Request browser notification permission first
        if (window.Notification) {
            if (Notification.permission === 'denied') {
                alert('Browser notifications were previously denied. Please enable them in browser settings.');
                return;
            }
            if (Notification.permission === 'default') {
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    alert('Browser notifications are required for push notifications to work');
                    return;
                }
            }
            console.log('Browser notification permission:', Notification.permission);
        }
        
        // Get VAPID public key
        const response = await fetch('/vapid-public-key');
        const data = await response.json();
        
        if (!data.public_key) {
            alert('Push notifications are not configured on the server');
            return;
        }
        
        const applicationServerKey = urlBase64ToUint8Array(data.public_key);
        
        console.log('Service worker registration:', swRegistration);
        console.log('Attempting push subscription with key:', data.public_key.substring(0, 20) + '...');
        
        // Subscribe to push
        const subscription = await swRegistration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: applicationServerKey
        });
        
        console.log('Push subscription:', subscription);
        
        // Get preferences - both ships have same settings
        const shipsJumping = document.getElementById('shipsJumping').checked;
        const shipsAppearing = document.getElementById('shipsAppearing').checked;
        
        const preferences = {
            endpoint: subscription.endpoint,
            keys: {
                auth: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('auth')))),
                p256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(subscription.getKey('p256dh'))))
            },
            cygnus_jumping: shipsJumping,
            cygnus_appearing: shipsAppearing,
            orion_jumping: shipsJumping,
            orion_appearing: shipsAppearing
        };
        
        // Send subscription to server
        const saveResponse = await fetch('/subscribe', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(preferences)
        });
        
        if (saveResponse.ok) {
            console.log('Subscription saved to server');
            isSubscribed = true;
            updateSubscribeButton();
        } else {
            console.error('Failed to save subscription');
            // Unsubscribe if save failed
            await subscription.unsubscribe();
        }
        
    } catch (error) {
        console.error('Failed to subscribe:', error);
        alert('Failed to subscribe to push notifications: ' + error.message);
    }
}

// Unsubscribe from push notifications
async function unsubscribeFromPush() {
    try {
        const subscription = await swRegistration.pushManager.getSubscription();
        
        if (subscription) {
            // Send unsubscribe request to server
            const response = await fetch('/unsubscribe', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    endpoint: subscription.endpoint
                })
            });
            
            if (response.ok) {
                // Unsubscribe from browser
                await subscription.unsubscribe();
                console.log('Unsubscribed from push notifications');
                isSubscribed = false;
                updateSubscribeButton();
            } else {
                console.error('Failed to unsubscribe on server');
            }
        }
        
    } catch (error) {
        console.error('Failed to unsubscribe:', error);
        alert('Failed to unsubscribe: ' + error.message);
    }
}

// Handle subscribe button click
async function handleSubscribeClick(event) {
    // Don't trigger if clicking on checkbox
    if (event.target.type === 'checkbox' || event.target.classList.contains('checkbox-box')) {
        return;
    }
    
    const subscribeBtn = document.getElementById('subscribeBtn');
    subscribeBtn.disabled = true;
    
    try {
        if (isSubscribed) {
            await unsubscribeFromPush();
        } else {
            await subscribeToPush();
        }
    } finally {
        subscribeBtn.disabled = false;
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    initPush();
    
    // Add click handler to subscribe button
    const subscribeBtn = document.getElementById('subscribeBtn');
    if (subscribeBtn) {
        subscribeBtn.addEventListener('click', handleSubscribeClick);
        
        // Prevent checkbox clicks from bubbling up to button
        const checkboxes = subscribeBtn.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(cb => {
            cb.addEventListener('click', (e) => e.stopPropagation());
        });
    }
});