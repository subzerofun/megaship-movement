#!/usr/bin/env python3
"""
Push Notification Functions for Megaship Movement Tracker
Handles sending push notifications when ships jump or appear
"""

import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional
from pywebpush import webpush, WebPushException
from .database import Database

logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] %(name)s %(levelname)s: %(message)s')
logger = logging.getLogger('push_notifications')

# VAPID keys (you need to generate these with py-vapid)
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY', '')
VAPID_PUBLIC_KEY = os.environ.get('VAPID_PUBLIC_KEY', '')
VAPID_CLAIMS = {
    "sub": os.environ.get('VAPID_EMAIL', 'mailto:admin@megaship-tracker.com')
}

# Database instance (initialized once)
_db: Optional[Database] = None

async def init_push_notifications():
    """Initialize push notification system with database"""
    global _db
    
    try:
        _db = Database()
        await _db.init_db()
        logger.info("\033[92m✓ Push notification system initialized\033[0m")
        
        if not VAPID_PRIVATE_KEY or not VAPID_PUBLIC_KEY:
            logger.warning("\033[93m⚠ VAPID keys not configured. Push notifications disabled.\033[0m")
            logger.info("Generate keys with: vapid --gen")
            logger.info("Then set VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, and VAPID_EMAIL environment variables")
            return False
        return True
    except Exception as e:
        logger.warning(f"\033[93m⚠ Push notifications disabled: {e}\033[0m")
        _db = None
        return False

async def send_ship_jumped(ship_name: str, from_system: str, jump_time: Optional[str] = None):
    """Send notification that a ship has jumped from a system"""
    if not _db or not VAPID_PRIVATE_KEY:
        return
    
    try:
        logger.info(f"\033[93m🚀 Sending notifications: {ship_name} left {from_system}\033[0m")
        logger.debug(f"Using VAPID public key: {VAPID_PUBLIC_KEY[:20]}...")
        
        # Get subscriptions for this ship's jumping events
        subscriptions = await _db.get_active_subscriptions(ship_name, 'jumping')
        
        # Prepare notification
        if not jump_time:
            jump_time = datetime.now(timezone.utc).isoformat()
        
        message = {
            'title': f'{ship_name} - In Witchspace',
            'body': f'Left {from_system}',
            'icon': '/img/icon_1.svg',
            'badge': '/img/badge.png',
            'timestamp': jump_time,
            'data': {
                'ship': ship_name,
                'event': 'jumping',
                'system_from': from_system,
                'time': jump_time
            }
        }
        
        # Send to all subscribed users
        await _send_notifications(subscriptions, message)
        
    except Exception as e:
        logger.error(f"\033[91m✗ Failed to send jump notification: {e}\033[0m")

async def send_ship_appeared(ship_name: str, in_system: str, appear_time: Optional[str] = None):
    """Send notification that a ship has appeared in a system"""
    if not _db or not VAPID_PRIVATE_KEY:
        return
    
    try:
        logger.info(f"\033[92m🛸 Sending notifications: {ship_name} appeared in {in_system}\033[0m")
        
        # Get subscriptions for this ship's appearing events
        subscriptions = await _db.get_active_subscriptions(ship_name, 'appearing')
        
        # Prepare notification
        if not appear_time:
            appear_time = datetime.now(timezone.utc).isoformat()
        
        message = {
            'title': f'{ship_name} - Detected',
            'body': f'Appeared in {in_system}',
            'icon': '/img/icon_1.svg',
            'badge': '/img/badge.png',
            'timestamp': appear_time,
            'data': {
                'ship': ship_name,
                'event': 'appearing',
                'system_to': in_system,
                'time': appear_time
            }
        }
        
        # Send to all subscribed users
        await _send_notifications(subscriptions, message)
        
    except Exception as e:
        logger.error(f"\033[91m✗ Failed to send appearance notification: {e}\033[0m")

async def _send_notifications(subscriptions: list, message: dict):
    """Internal function to send push notifications to subscribed users"""
    if not subscriptions:
        logger.debug("No active subscriptions for this event")
        return
    
    sent_count = 0
    failed_count = 0
    
    for sub in subscriptions:
        try:
            endpoint = sub['endpoint']
            
            # Log endpoint for debugging
            logger.debug(f"Sending to endpoint: {endpoint[:50]}...")
            
            # Log the actual keys being used
            logger.debug(f"VAPID private key (first 20 chars): {VAPID_PRIVATE_KEY[:20] if VAPID_PRIVATE_KEY else 'NONE'}...")
            logger.debug(f"VAPID public key being used: {VAPID_PUBLIC_KEY[:50] if VAPID_PUBLIC_KEY else 'NONE'}...")
            logger.debug(f"Subscription endpoint: {endpoint[:50]}...")
            logger.debug(f"VAPID claims: {VAPID_CLAIMS}")
            
            # Send push notification with proper content encoding
            response = webpush(
                subscription_info={
                    'endpoint': endpoint,
                    'keys': sub['keys']
                },
                data=json.dumps(message),
                vapid_private_key=VAPID_PRIVATE_KEY,
                vapid_claims=VAPID_CLAIMS,
                ttl=86400,  # Time to live: 24 hours
                content_encoding='aesgcm'  # Specify content encoding
            )
            
            # Mark as successfully sent
            await _db.mark_notification_sent(sub['id'], True)
            sent_count += 1
            logger.debug(f"✓ Notification sent to subscription {sub['id']}")
            
        except WebPushException as e:
            # Handle push errors
            error_msg = str(e)
            if '404' in error_msg and '/fcm/send/' in sub['endpoint']:
                logger.warning(f"⚠ Opera/old Chrome FCM format issue for subscription {sub['id']}")
                logger.info("💡 Browser notifications will still work when the page is open")
                # Don't mark as failed for this specific issue - it's Google's fault, not ours
            else:
                logger.error(f"✗ Push failed for subscription {sub['id']}: {e}")
            
            await _db.mark_notification_sent(sub['id'], False)
            failed_count += 1
            
            # If subscription is expired (410 Gone), it will be deactivated after 3 failures
            if e.response and e.response.status_code == 410:
                logger.info(f"Subscription {sub['id']} expired (410)")
        
        except Exception as e:
            logger.error(f"\033[91m✗ Unexpected error sending notification: {e}\033[0m")
            failed_count += 1
    
    if sent_count > 0:
        logger.info(f"\033[92m✓ Sent {sent_count} notifications\033[0m")
    if failed_count > 0:
        logger.warning(f"\033[93m⚠ Failed to send {failed_count} notifications\033[0m")

async def close():
    """Close database connection"""
    global _db
    if _db:
        await _db.close()
        _db = None