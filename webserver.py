#!/usr/bin/env python3
"""
Web Server for Megaship Movement Tracker
Serves HTML interface and provides WebSocket for real-time updates
"""

import asyncio
import aiohttp
from aiohttp import web
import json
import logging
from pathlib import Path
import os

logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] %(name)s %(levelname)s: %(message)s')
logger = logging.getLogger('webserver')

class WebServer:
    def __init__(self, listener=None, host=None, port=8080):
        self.listener = listener
        # Check if running on server or locally
        self.is_server = os.environ.get('SERVER', '').upper() == 'TRUE'
        
        # Set host based on environment
        if host:
            self.host = host
        else:
            self.host = '0.0.0.0' if self.is_server else 'localhost'
            
        self.port = port
        self.websockets = set()
        self.app = web.Application()
        self.setup_routes()
        
        logger.info(f"Server mode: {self.is_server} (host: {self.host})")
        
    def setup_routes(self):
        """Setup web routes"""
        self.app.router.add_get('/', self.index_handler)
        self.app.router.add_get('/ws', self.websocket_handler)
        self.app.router.add_get('/status', self.status_handler)
        self.app.router.add_get('/favicon.ico', self.favicon_handler)
        self.app.router.add_get('/service-worker.js', self.service_worker_handler)
        self.app.router.add_get('/vapid-public-key', self.vapid_key_handler)
        self.app.router.add_post('/subscribe', self.subscribe_handler)
        self.app.router.add_post('/unsubscribe', self.unsubscribe_handler)
        
        # Setup CSS directory
        css_dir = Path(__file__).parent / 'css'
        if css_dir.exists():
            self.app.router.add_static('/css', css_dir)
            logger.info(f"Serving CSS from: {css_dir}")
        else:
            logger.warning(f"CSS directory not found at {css_dir}")
        
        # Setup font directory - check parent directory for fonts
        fonts_dir = Path(__file__).parent / 'fonts'
        if not fonts_dir.exists():
            fonts_dir = Path(__file__).parent.parent / 'fonts'
        if fonts_dir.exists():
            self.app.router.add_static('/fonts', fonts_dir)
            logger.info(f"Serving fonts from: {fonts_dir}")
        else:
            logger.warning(f"Fonts directory not found at {fonts_dir}")
        
        # Setup JS directory
        js_dir = Path(__file__).parent / 'js'
        if js_dir.exists():
            self.app.router.add_static('/js', js_dir)
            logger.info(f"Serving JS from: {js_dir}")
        else:
            logger.warning(f"JS directory not found at {js_dir}")
        
        # Setup img directory
        img_dir = Path(__file__).parent / 'img'
        if img_dir.exists():
            self.app.router.add_static('/img', img_dir)
            logger.info(f"Serving images from: {img_dir}")
        else:
            logger.warning(f"Image directory not found at {img_dir}")
        
    async def index_handler(self, request):
        """Serve main HTML page"""
        html_path = Path(__file__).parent / 'index.html'
        if html_path.exists():
            return web.FileResponse(html_path)
        else:
            return web.Response(text="index.html not found", status=404)
            
    async def status_handler(self, request):
        """Return current status as JSON"""
        if self.listener:
            status = self.listener.get_status()
            # Add test mode flag
            status['test_mode'] = os.environ.get('TEST_MODE', '').upper() == 'TRUE'
            return web.json_response(status)
        else:
            return web.json_response({
                "error": "Listener not available",
                "test_mode": os.environ.get('TEST_MODE', '').upper() == 'TRUE'
            })
    
    async def favicon_handler(self, request):
        """Serve favicon"""
        favicon_path = Path(__file__).parent / 'favicon.ico'
        if favicon_path.exists():
            return web.FileResponse(favicon_path)
        else:
            return web.Response(status=404)
    
    async def service_worker_handler(self, request):
        """Serve service worker"""
        sw_path = Path(__file__).parent / 'service-worker.js'
        if sw_path.exists():
            return web.FileResponse(sw_path, headers={
                'Content-Type': 'application/javascript',
                'Service-Worker-Allowed': '/'
            })
        else:
            return web.Response(status=404)
    
    async def vapid_key_handler(self, request):
        """Return VAPID public key for push subscriptions"""
        public_key = os.environ.get('VAPID_PUBLIC_KEY', '')
        if public_key:
            logger.debug(f"Serving VAPID public key: {public_key[:20]}...")
        return web.json_response({'public_key': public_key})
    
    async def subscribe_handler(self, request):
        """Handle push notification subscription"""
        try:
            data = await request.json()
            
            # Check if database is available
            if not os.environ.get('MEGASHIPDB'):
                return web.json_response({'success': False, 'error': 'Push notifications not configured'}, status=503)
            
            # Import database handler
            from utils.database import db
            
            # Initialize if not already done
            if not db.pool:
                await db.init_db()
            
            # Save subscription
            success = await db.save_subscription(data)
            
            if success:
                logger.info(f"✓ New push subscription saved")
                return web.json_response({'success': True})
            else:
                return web.json_response({'success': False, 'error': 'Failed to save subscription'}, status=500)
                
        except Exception as e:
            logger.error(f"Subscribe error: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)
    
    async def unsubscribe_handler(self, request):
        """Handle push notification unsubscription"""
        try:
            data = await request.json()
            endpoint = data.get('endpoint')
            
            if not endpoint:
                return web.json_response({'success': False, 'error': 'Endpoint required'}, status=400)
            
            # Check if database is available
            if not os.environ.get('MEGASHIPDB'):
                return web.json_response({'success': False, 'error': 'Push notifications not configured'}, status=503)
            
            # Import database handler
            from utils.database import db
            
            # Initialize if not already done
            if not db.pool:
                await db.init_db()
            
            # Remove subscription
            success = await db.remove_subscription(endpoint)
            
            if success:
                logger.info(f"✓ Push subscription removed")
                return web.json_response({'success': True})
            else:
                return web.json_response({'success': False, 'error': 'Failed to remove subscription'}, status=500)
                
        except Exception as e:
            logger.error(f"Unsubscribe error: {e}")
            return web.json_response({'success': False, 'error': str(e)}, status=500)
            
    async def websocket_handler(self, request):
        """Handle WebSocket connections"""
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        self.websockets.add(ws)
        
        try:
            logger.info(f"✓ WebSocket client connected (Total clients: {len(self.websockets)})")
            
            # Send initial status
            if self.listener:
                status = self.listener.get_status()
                await ws.send_json({
                    "type": "initial_status",
                    "data": status
                })
                logger.debug(f"Sent initial status to client")
            else:
                logger.warning("No listener available to send status")
                
            # Keep connection alive
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    if data.get("type") == "ping":
                        await ws.send_json({"type": "pong"})
                        logger.debug("Ping/pong exchange")
                    elif data.get("type") == "send_push":
                        # Client is triggering a push notification (for testing)
                        notification = data.get("notification", {})
                        ship = notification.get("ship")
                        system = notification.get("system")
                        event_type = notification.get("event_type")
                        
                        logger.info(f"📱 Push notification triggered from client: {event_type} for {ship}")
                        
                        # Send the ACTUAL push notification via pywebpush
                        try:
                            from utils.push_notifications import send_ship_jumped, send_ship_appeared
                            if event_type == "jumped":
                                await send_ship_jumped(ship, system)
                            elif event_type == "appeared":
                                await send_ship_appeared(ship, system)
                        except Exception as e:
                            logger.error(f"Failed to send push: {e}")
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.error(f'WebSocket error: {ws.exception()}')
                    
        except Exception as e:
            logger.error(f"WebSocket error: {e}")
        finally:
            self.websockets.discard(ws)
            logger.info(f"WebSocket client disconnected (Remaining clients: {len(self.websockets)})")
            
        return ws
        
    async def broadcast_event(self, event_data):
        """Broadcast event to all connected WebSocket clients"""
        if self.websockets:
            logger.debug(f"Broadcasting event to {len(self.websockets)} clients: {event_data.get('type', 'unknown')}")
            message = json.dumps({
                "type": "event",
                "data": event_data
            })
            
            # Send to all connected clients
            disconnected = set()
            for ws in self.websockets:
                try:
                    await ws.send_str(message)
                except ConnectionResetError:
                    disconnected.add(ws)
                except Exception as e:
                    logger.error(f"Error sending to client: {e}")
                    disconnected.add(ws)
                    
            # Remove disconnected clients
            if disconnected:
                self.websockets -= disconnected
                logger.info(f"Removed {len(disconnected)} disconnected clients")
            
    async def start(self):
        """Start web server"""
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, self.host, self.port)
        await site.start()
        logger.info(f"✓ Web server started at http://{self.host}:{self.port}")
        if self.is_server:
            logger.info(f"Server mode: Listening on all interfaces (0.0.0.0:{self.port})")
        else:
            logger.info(f"Local mode: Open your browser to: http://localhost:{self.port}")
        
    def set_listener(self, listener):
        """Set EDDN listener reference"""
        self.listener = listener
        # Set callback to broadcast events
        if listener:
            listener.callback = self.broadcast_event

async def main():
    """Test function"""
    server = WebServer()
    await server.start()
    
    # Keep running
    while True:
        await asyncio.sleep(1)

if __name__ == "__main__":
    asyncio.run(main())