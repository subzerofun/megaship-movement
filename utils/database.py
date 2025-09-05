#!/usr/bin/env python3
"""
PostgreSQL Database Handler for Push Notifications
Handles all database operations for subscription and ship state management
"""

import asyncpg
import os
import sys
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] %(name)s %(levelname)s: %(message)s')
logger = logging.getLogger('database')

class Database:
    def __init__(self, db_url: Optional[str] = None):
        self.pool = None
        
        # First check if db_url was passed directly
        if db_url:
            self.db_url = db_url
            logger.info("\033[94mUsing provided database URL\033[0m")
        else:
            # Check command line arguments for --db
            for i, arg in enumerate(sys.argv):
                if arg == '--db' and i + 1 < len(sys.argv):
                    self.db_url = sys.argv[i + 1]
                    logger.info("\033[94mUsing database URL from --db argument\033[0m")
                    break
            else:
                # Fall back to environment variable
                self.db_url = os.environ.get('MEGASHIPDB')
                if self.db_url:
                    logger.info("\033[94mUsing database URL from MEGASHIPDB environment variable\033[0m")
        
        if not self.db_url:
            logger.error("\033[91m✗ Database URL not provided! Use --db argument or set MEGASHIPDB environment variable\033[0m")
            raise ValueError("Database URL is required (use --db argument or MEGASHIPDB environment variable)")
    
    async def init_db(self):
        """Initialize database connection pool"""
        try:
            self.pool = await asyncpg.create_pool(
                self.db_url,
                min_size=1,
                max_size=10,
                command_timeout=60
            )
            logger.info("\033[92m✓ Database connection established\033[0m")
            
            # Test connection and verify tables exist
            async with self.pool.acquire() as conn:
                result = await conn.fetchval(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'push_subscriptions'"
                )
                if result == 1:
                    logger.info("\033[92m✓ Database tables verified\033[0m")
                else:
                    logger.warning("\033[93m⚠ push_subscriptions table not found. Please run tables.sql\033[0m")
                    
        except Exception as e:
            logger.error(f"\033[91m✗ Database connection failed: {e}\033[0m")
            raise
    
    async def close(self):
        """Close database connection pool"""
        if self.pool:
            await self.pool.close()
            logger.info("\033[94mDatabase connection closed\033[0m")
    
    async def save_subscription(self, subscription_data: Dict[str, Any]) -> bool:
        """Save or update a push subscription"""
        try:
            async with self.pool.acquire() as conn:
                # Upsert subscription
                await conn.execute("""
                    INSERT INTO push_subscriptions (
                        endpoint, keys_auth, keys_p256dh,
                        cygnus_jumping, cygnus_appearing,
                        orion_jumping, orion_appearing
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (endpoint) 
                    DO UPDATE SET
                        keys_auth = EXCLUDED.keys_auth,
                        keys_p256dh = EXCLUDED.keys_p256dh,
                        cygnus_jumping = EXCLUDED.cygnus_jumping,
                        cygnus_appearing = EXCLUDED.cygnus_appearing,
                        orion_jumping = EXCLUDED.orion_jumping,
                        orion_appearing = EXCLUDED.orion_appearing,
                        is_active = true,
                        failed_attempts = 0
                """,
                subscription_data.get('endpoint'),
                subscription_data.get('keys', {}).get('auth'),
                subscription_data.get('keys', {}).get('p256dh'),
                subscription_data.get('cygnus_jumping', True),
                subscription_data.get('cygnus_appearing', True),
                subscription_data.get('orion_jumping', True),
                subscription_data.get('orion_appearing', True)
                )
                logger.info(f"\033[92m✓ Subscription saved for endpoint: {subscription_data.get('endpoint')[:50]}...\033[0m")
                return True
        except Exception as e:
            logger.error(f"\033[91m✗ Failed to save subscription: {e}\033[0m")
            return False
    
    async def remove_subscription(self, endpoint: str) -> bool:
        """Remove a subscription"""
        try:
            async with self.pool.acquire() as conn:
                await conn.execute(
                    "DELETE FROM push_subscriptions WHERE endpoint = $1",
                    endpoint
                )
                logger.info(f"\033[93m✓ Subscription removed for endpoint: {endpoint[:50]}...\033[0m")
                return True
        except Exception as e:
            logger.error(f"\033[91m✗ Failed to remove subscription: {e}\033[0m")
            return False
    
    async def get_active_subscriptions(self, ship_name: str, event_type: str) -> List[Dict]:
        """Get active subscriptions for a specific ship and event type"""
        try:
            ship_col = ship_name.lower().replace(' ', '_').replace('the_', '')
            column_name = f"{ship_col}_{event_type}"
            
            async with self.pool.acquire() as conn:
                rows = await conn.fetch(f"""
                    SELECT id, endpoint, keys_auth, keys_p256dh
                    FROM push_subscriptions
                    WHERE is_active = true 
                    AND {column_name} = true
                    AND failed_attempts < 3
                """)
                
                subscriptions = [
                    {
                        'id': row['id'],
                        'endpoint': row['endpoint'],
                        'keys': {
                            'auth': row['keys_auth'],
                            'p256dh': row['keys_p256dh']
                        }
                    }
                    for row in rows
                ]
                logger.info(f"\033[94mFound {len(subscriptions)} active subscriptions for {ship_name} {event_type}\033[0m")
                return subscriptions
        except Exception as e:
            logger.error(f"\033[91m✗ Failed to get subscriptions: {e}\033[0m")
            return []
    
    async def mark_notification_sent(self, subscription_id: int, success: bool):
        """Mark a notification as sent"""
        try:
            async with self.pool.acquire() as conn:
                if success:
                    await conn.execute("""
                        UPDATE push_subscriptions
                        SET last_sent = $1,
                            last_sent_success = true,
                            failed_attempts = 0
                        WHERE id = $2
                    """, datetime.now(timezone.utc).replace(tzinfo=None), subscription_id)
                else:
                    # Increment failed attempts
                    await conn.execute("""
                        UPDATE push_subscriptions
                        SET last_sent = $1,
                            last_sent_success = false,
                            failed_attempts = failed_attempts + 1,
                            is_active = CASE 
                                WHEN failed_attempts >= 2 THEN false 
                                ELSE is_active 
                            END
                        WHERE id = $2
                    """, datetime.now(timezone.utc).replace(tzinfo=None), subscription_id)
                    
                logger.debug(f"Notification marked as {'sent' if success else 'failed'} for subscription {subscription_id}")
        except Exception as e:
            logger.error(f"\033[91m✗ Failed to mark notification: {e}\033[0m")
    

# Singleton instance
db = Database()