#!/usr/bin/env python3
import asyncio
import websockets
import json
import sys
import logging
from datetime import datetime

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

async def test_websocket(uri):
    logger.info(f"Attempting to connect to: {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            logger.info("✓ WebSocket connected successfully!")
            logger.info(f"  Connection state: {websocket.state}")
            logger.info(f"  Local address: {websocket.local_address}")
            logger.info(f"  Remote address: {websocket.remote_address}")
            
            # Send ping
            logger.info("Sending ping message...")
            await websocket.send(json.dumps({"type": "ping"}))
            
            # Listen for messages
            logger.info("Waiting for initial_status message...")
            start_time = datetime.now()
            message_count = 0
            
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=10.0)
                    message_count += 1
                    data = json.loads(message)
                    
                    if data.get('type') == 'initial_status':
                        logger.info("✓ Received initial_status message!")
                        logger.info(f"  Megaships tracked: {list(data['data']['megaships'].keys())}")
                        logger.info(f"  Systems tracked: {list(data['data']['tracked_systems'].keys())}")
                        logger.info(f"  Stats: {data['data'].get('stats', {})}")
                        
                    elif data.get('type') == 'event':
                        logger.info(f"✓ Received event: {data['data'].get('type')} - {data['data'].get('name', 'N/A')}")
                        
                    if message_count >= 5:
                        elapsed = (datetime.now() - start_time).seconds
                        logger.info(f"\n✓ Test successful! Received {message_count} messages in {elapsed} seconds")
                        break
                        
                except asyncio.TimeoutError:
                    logger.warning("Timeout waiting for message (10s)")
                    if message_count > 0:
                        logger.info(f"✓ Test completed. Received {message_count} messages")
                    else:
                        logger.error("✗ No messages received within timeout period")
                    break
                    
    except websockets.exceptions.WebSocketException as e:
        logger.error(f"✗ WebSocket error: {e}")
        return False
    except Exception as e:
        logger.error(f"✗ Unexpected error: {e}")
        return False
    
    return True

async def main():
    # Test both local and remote endpoints
    endpoints = [
        "ws://localhost:8042/ws",
        # "wss://yourserver.com/ws",  # Update with your server
    ]
    
    for endpoint in endpoints:
        logger.info(f"\n{'='*50}")
        logger.info(f"Testing endpoint: {endpoint}")
        logger.info('='*50)
        await test_websocket(endpoint)

if __name__ == "__main__":
    asyncio.run(main())