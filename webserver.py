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
    def __init__(self, listener=None, host='0.0.0.0', port=8080):
        self.listener = listener
        self.host = host
        self.port = port
        self.websockets = set()
        self.app = web.Application()
        self.setup_routes()
        
    def setup_routes(self):
        """Setup web routes"""
        self.app.router.add_get('/', self.index_handler)
        self.app.router.add_get('/ws', self.websocket_handler)
        self.app.router.add_get('/status', self.status_handler)
        
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
            return web.json_response(status)
        else:
            return web.json_response({"error": "Listener not available"})
            
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
        logger.info(f"Open your browser to: http://localhost:{self.port}")
        
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