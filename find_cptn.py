#!/usr/bin/env python3
"""
Megaship Movement Tracker - Main Coordinator
Launches EDDN listener and web server for tracking Cygnus and The Orion
"""

import asyncio
import signal
import sys
import os
import logging
from eddn_listener import EDDNListener
from webserver import WebServer

# Check if running on server
is_server = os.environ.get('SERVER', '').upper() == 'TRUE'

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s'
)
logger = logging.getLogger('find_cptn')

class MegashipTracker:
    def __init__(self):
        self.listener = None
        self.server = None
        self.running = True
        
    async def start(self):
        """Start both EDDN listener and web server"""
        logger.info("=" * 60)
        logger.info("  MEGASHIP MOVEMENT TRACKER - Drunken Cpt. Finder")
        logger.info("  Tracking: Cygnus and The Orion")
        logger.info("=" * 60)
        
        # Check VAPID keys
        import os
        vapid_public = os.environ.get('VAPID_PUBLIC_KEY')
        vapid_private = os.environ.get('VAPID_PRIVATE_KEY')
        
        if vapid_public and vapid_private:
            # Violet/Magenta color
            logger.info("\033[95m🔑 VAPID keys detected - Push notifications available\033[0m")
            logger.info(f"\033[95m   Public key: {vapid_public[:20]}...\033[0m")
        else:
            logger.warning("\033[93m⚠ VAPID keys not found - Push notifications disabled\033[0m")
            if not vapid_public:
                logger.warning("   Missing: VAPID_PUBLIC_KEY")
            if not vapid_private:
                logger.warning("   Missing: VAPID_PRIVATE_KEY")
        
        # Initialize push notification system if database is configured
        try:
            from utils.push_notifications import init_push_notifications
            push_enabled = await init_push_notifications()
            if push_enabled:
                logger.info("Push notification system enabled")
            else:
                logger.info("Push notifications disabled")
        except Exception as e:
            logger.warning(f"Push notifications disabled: {e}")
        
        # Create web server first - use 8000 for server, 8042 for local
        port = 8000 if is_server else 8042
        self.server = WebServer(listener=None, port=port)
        
        # Create EDDN listener with webserver's broadcast as callback
        self.listener = EDDNListener(callback=self.server.broadcast_event)
        
        # Set listener in server
        self.server.listener = self.listener
        
        # Check for --test argument
        if '--test' in sys.argv:
            logger.info("Test mode enabled - visit http://localhost:{}/index.html?test to see test panel".format(port))
        
        # Start web server
        await self.server.start()
        if is_server:
            logger.info(f"Web interface available on port {port} (all interfaces)")
        else:
            logger.info(f"Web interface available at: http://localhost:{port}")
        
        # Start EDDN listener
        logger.info("Starting EDDN listener...")
        listener_task = asyncio.create_task(self.listener.start())
        
        # Keep running until interrupted
        try:
            await listener_task
        except asyncio.CancelledError:
            logger.info("Shutting down...")
            
    async def stop(self):
        """Stop the tracker"""
        self.running = False
        if self.listener:
            self.listener.stop()
        
        # Close push notification database if initialized
        try:
            from utils.push_notifications import close
            await close()
        except:
            pass

async def main():
    """Main entry point"""
    # Check for --db argument and set as environment variable for webserver
    # Also check for --test argument
    test_mode = False
    for i, arg in enumerate(sys.argv):
        if arg == '--db' and i + 1 < len(sys.argv):
            os.environ['MEGASHIPDB'] = sys.argv[i + 1]
        elif arg == '--test':
            test_mode = True
            os.environ['TEST_MODE'] = 'true'
    
    tracker = MegashipTracker()
    
    # Setup signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        logger.info("\nReceived interrupt signal, shutting down...")
        asyncio.create_task(tracker.stop())
        sys.exit(0)
        
    signal.signal(signal.SIGINT, signal_handler)
    signal.signal(signal.SIGTERM, signal_handler)
    
    try:
        await tracker.start()
    except KeyboardInterrupt:
        logger.info("\nShutdown requested")
        tracker.stop()
    except Exception as e:
        logger.error(f"Fatal error: {e}")
        tracker.stop()
        sys.exit(1)

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nShutdown complete")