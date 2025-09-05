#!/usr/bin/env python3
"""
Megaship Movement Tracker - Main Coordinator
Launches EDDN listener and web server for tracking Cygnus and The Orion
"""

import asyncio
import signal
import sys
import logging
from eddn_listener import EDDNListener
from webserver import WebServer

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
        
        # Create EDDN listener
        self.listener = EDDNListener()
        
        # Create web server
        self.server = WebServer(listener=self.listener, port=8042)
        self.server.set_listener(self.listener)
        
        # Start web server
        await self.server.start()
        logger.info("Web interface available at: http://localhost:8042")
        
        # Start EDDN listener
        logger.info("Starting EDDN listener...")
        listener_task = asyncio.create_task(self.listener.start())
        
        # Keep running until interrupted
        try:
            await listener_task
        except asyncio.CancelledError:
            logger.info("Shutting down...")
            
    def stop(self):
        """Stop the tracker"""
        self.running = False
        if self.listener:
            self.listener.stop()

async def main():
    """Main entry point"""
    tracker = MegashipTracker()
    
    # Setup signal handlers for graceful shutdown
    def signal_handler(sig, frame):
        logger.info("\nReceived interrupt signal, shutting down...")
        tracker.stop()
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