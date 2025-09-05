#!/usr/bin/env python3
"""
EDDN Listener for Megaship Movement Tracker
Monitors Elite Dangerous Data Network for FSSSignalDiscovered events
"""

import zmq
import zlib
import json
import asyncio
import threading
import os
from datetime import datetime, timezone
from collections import deque
import logging
from utils.cmdr_tracker import CommanderTracker

logging.basicConfig(level=logging.DEBUG, format='[%(asctime)s] %(name)s %(levelname)s: %(message)s')
logger = logging.getLogger('eddn_listener')

# Configuration constants
MISSING_COUNT_FOR_JUMP = 6  # After this many missing signals, ship has jumped

class EDDNListener:
    def __init__(self, callback=None):
        self.EDDN_RELAY = "tcp://eddn.edcd.io:9500"
        self.callback = callback
        self.megaships = {
            "Cygnus": {"last_seen": None, "system": None, "system_address": None, "status": "NOT DETECTED"},
            "The Orion": {"last_seen": None, "system": None, "system_address": None, "status": "NOT DETECTED"}
        }
        self.tracked_systems = {
            "Nukamba": {"address": 1183095788250, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"},
            "Graffias": {"address": 17880842853, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"},
            "Vodyakamana": {"address": 0, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"},
            "Marfic": {"address": 203174184124, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"},
            "Upaniklis": {"address": 13862946481609, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"},
            "HR 6524": {"address": 83584193298, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"},
            "Col 359 Sector AE-N b9-4": {"address": 9463826621993, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"},
            "HIP 87621": {"address": 147882789259, "commanders": set(), "jumps_to": 0, "jumps_from": 0, "fleet_carriers": 0, "Cygnus": "NOT DETECTED", "The Orion": "NOT DETECTED"}
        }
        self.cmdr_tracker = CommanderTracker()  # Use the new commander tracker
        self.recent_events = deque(maxlen=300)  # Keep last 300 events
        self.running = False
        self.messages_received = 0
        self.missing_confirmations = {}  # Track missing signal confirmations per ship/system
        self.messages_processed = 0
        self.signals_checked = 0
        self.fleet_carriers_seen = 0
        self.previous_ship_systems = {}  # Track where ships were last seen for jump detection
        
    def zmq_listener_thread(self):
        """ZMQ listener in separate thread"""
        context = zmq.Context()
        subscriber = context.socket(zmq.SUB)
        
        logger.info(f"Connecting to EDDN relay: {self.EDDN_RELAY}")
        subscriber.connect(self.EDDN_RELAY)
        subscriber.setsockopt_string(zmq.SUBSCRIBE, "")
        subscriber.setsockopt(zmq.RCVTIMEO, 5000)
        
        logger.info("✓ Connected to EDDN relay, waiting for messages...")
        
        while self.running:
            try:
                raw_msg = subscriber.recv()
                self.messages_received += 1
                
                if self.messages_received % 100 == 0:
                    logger.debug(f"Received {self.messages_received} messages, processed {self.messages_processed}")
                
                message = zlib.decompress(raw_msg)
                
                try:
                    data = json.loads(message)
                    asyncio.run_coroutine_threadsafe(
                        self.process_message(data),
                        self.loop
                    )
                except json.JSONDecodeError as e:
                    logger.error(f"JSON decode error: {e}")
                    continue
                    
            except zmq.error.Again:
                # Timeout, no message received
                continue
            except Exception as e:
                logger.error(f"Error in ZMQ thread: {e}")
                
        subscriber.close()
        context.term()
        logger.info("ZMQ listener stopped")
    
    async def start(self):
        """Start listening to EDDN"""
        self.running = True
        self.loop = asyncio.get_event_loop()
        
        # Start ZMQ listener in separate thread
        zmq_thread = threading.Thread(target=self.zmq_listener_thread, daemon=True)
        zmq_thread.start()
        
        # Keep async task alive
        while self.running:
            await asyncio.sleep(1)
                
    async def process_message(self, data):
        """Process EDDN message"""
        try:
            self.messages_processed += 1
            schema = data.get("$schemaRef", "").lower()
            msg = data.get("message", {})
            header = data.get("header", {})
            
            if not msg:
                return
                
            # Log first few messages to verify connection
            if self.messages_processed <= 5:
                logger.info(f"Processing message #{self.messages_processed}: schema={schema.split('/')[-2] if '/' in schema else schema}")
            
            # Get commander ID (uploaderID + softwareName)
            uploader_id = header.get("uploaderID", "")
            software = header.get("softwareName", "")
            cmdr_id = f"{uploader_id}_{software}" if uploader_id and software else None
            
            # Process different schemas
            if "fsssignaldiscovered" in schema:
                await self.process_fss_signals(msg)
            elif "journal" in schema:
                event = msg.get("event")
                if event == "FSDJump":
                    await self.process_fsd_jump(msg, cmdr_id)
            elif "navroute" in schema:
                await self.process_nav_route(msg, cmdr_id)
                
        except Exception as e:
            logger.error(f"Error in process_message: {e}")
            
    async def process_fss_signals(self, msg):
        """Process FSSSignalDiscovered events - ONLY source for megaships"""
        # Extract system info from the message (not signals array)
        system = msg.get("StarSystem")
        system_address = msg.get("SystemAddress")
        timestamp = msg.get("timestamp", datetime.now(timezone.utc).isoformat())
        
        if not system or not system_address:
            return
            
        # Check if timestamp is within 10 minutes of current time
        try:
            msg_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            current_time = datetime.now(timezone.utc)
            time_diff = abs((current_time - msg_time).total_seconds())
            
            if time_diff > 600:  # 10 minutes = 600 seconds
                logger.debug(f"Ignoring old message from {timestamp} (diff: {time_diff:.0f}s)")
                return
        except Exception as e:
            logger.warning(f"Could not parse timestamp {timestamp}: {e}")
            return
            
        # Process signals array
        signals = msg.get("signals", [])
        if not signals:
            return
            
        self.signals_checked += len(signals)
        
        # Track which megaships were found in this scan
        found_megaships = set()
        fleet_carrier_count = 0
            
        for signal in signals:
            signal_name = signal.get("SignalName", "")
            signal_type = signal.get("SignalType", "")
            signal_timestamp = signal.get("timestamp", timestamp)
            
            # Count fleet carriers in tracked systems
            if system in self.tracked_systems and signal_type == "FleetCarrier":
                fleet_carrier_count += 1
                self.fleet_carriers_seen += 1
            
            # Check for our megaships (EXACT match only, ignore fleet carriers)
            if signal_name in ["Cygnus", "The Orion"] and signal_type != "FleetCarrier":
                found_megaships.add(signal_name)
                logger.info(f"🚀 MEGASHIP DETECTED: {signal_name}")
                logger.info(f"   System: {system} (Address: {system_address})")
                logger.info(f"   Signal Type: {signal_type}")
                logger.info(f"   Timestamp: {signal_timestamp}")
                
                # Check if this is an irregular visit (not in tracked systems)
                is_irregular = system not in self.tracked_systems
                
                # Update megaship status to DETECTED or IRREGULAR VISIT
                self.megaships[signal_name] = {
                    "last_seen": signal_timestamp,
                    "system": system,
                    "system_address": system_address,
                    "signal_type": signal_type,
                    "status": "IRREGULAR VISIT" if is_irregular else "DETECTED"
                }
                
                if is_irregular:
                    logger.warning(f"🚨 IRREGULAR VISIT: {signal_name} detected in non-tracked system {system}!")
                
                # Update tracked system if applicable - store the timestamp as proof of detection
                if system in self.tracked_systems:
                    self.tracked_systems[system][signal_name] = signal_timestamp
                    logger.debug(f"Stored detection timestamp for {signal_name} in {system}: {signal_timestamp}")
                    # Reset missing confirmations when detected
                    key = f"{signal_name}_{system}"
                    if key in self.missing_confirmations:
                        del self.missing_confirmations[key]
                
                # Check if ship appeared in a different system (jump detected)
                    previous_system = self.previous_ship_systems.get(signal_name)
                    if previous_system and previous_system != system:
                        # Ship jumped to a new system - send notification
                        try:
                            from utils.push_notifications import send_ship_appeared
                            asyncio.create_task(send_ship_appeared(signal_name, system, signal_timestamp))
                        except Exception as e:
                            logger.debug(f"Push notification skipped: {e}")
                    
                    # Update last known system
                    self.previous_ship_systems[signal_name] = system
                
                # Create event
                event_data = {
                    "type": "megaship",
                    "name": signal_name,
                    "system": system,
                    "system_address": system_address,
                    "signal_type": signal_type,
                    "status": "IRREGULAR VISIT" if is_irregular else "DETECTED",
                    "timestamp": signal_timestamp,
                    "is_irregular": is_irregular
                }
                await self.handle_event(event_data)
        
        # Check for missing megaships ONLY in tracked systems where they were previously detected
        if system in self.tracked_systems:
            for megaship_name in ["Cygnus", "The Orion"]:
                # Check current status in THIS specific system
                current_status_in_system = self.tracked_systems[system].get(megaship_name, "NOT DETECTED")
                
                if megaship_name not in found_megaships:
                    # Only mark as MISSING if it was previously DETECTED in THIS system
                    # Check both the tracked system status and that it's a timestamp (meaning it was detected)
                    if (isinstance(current_status_in_system, str) and 
                        current_status_in_system not in ["NOT DETECTED", "SIGNAL MISSING"] and 
                        "T" in current_status_in_system):  # It's a timestamp, meaning it was detected
                        
                        # Track missing confirmations
                        key = f"{megaship_name}_{system}"
                        if key not in self.missing_confirmations:
                            self.missing_confirmations[key] = 0
                        
                        self.missing_confirmations[key] += 1
                        
                        # Only mark as SIGNAL MISSING after configured confirmations
                        if self.missing_confirmations[key] >= 5:
                            logger.info(f"⚠️ MEGASHIP SIGNAL MISSING: {megaship_name} confirmed missing in {system} after {self.missing_confirmations[key]} scans")
                            logger.info(f"   Previous detection: {current_status_in_system}")
                            logger.info(f"   Current scan: {len(signals)} signals, none matching {megaship_name}")
                            
                            # Update status to SIGNAL MISSING
                            self.megaships[megaship_name]["status"] = "SIGNAL MISSING"
                            self.megaships[megaship_name]["last_checked"] = timestamp
                            self.megaships[megaship_name]["previous_detection"] = current_status_in_system
                            
                            # Update tracked system
                            self.tracked_systems[system][megaship_name] = "SIGNAL MISSING"
                            
                            # Check if this is the jump threshold - send notification
                            if self.missing_confirmations[key] == MISSING_COUNT_FOR_JUMP:
                                try:
                                    from utils.push_notifications import send_ship_jumped
                                    asyncio.create_task(send_ship_jumped(megaship_name, system, timestamp))
                                    # DO NOT update previous_ship_systems here - keep the last DETECTED location
                                except Exception as e:
                                    logger.debug(f"Push notification skipped: {e}")
                            
                            # Create event ONLY after 5 confirmations
                            event_data = {
                                "type": "megaship",
                                "name": megaship_name,
                                "system": system,
                                "system_address": system_address,
                                "status": "SIGNAL MISSING",
                                "timestamp": timestamp,
                                "previous_detection": current_status_in_system
                            }
                            await self.handle_event(event_data)
                        else:
                            logger.debug(f"Missing confirmation #{self.missing_confirmations[key]} for {megaship_name} in {system}")
                            # Keep showing last detected time until 5 confirmations
                    # else: Keep current status (NOT DETECTED or existing status)
        
        # Update fleet carrier count for tracked system
        if system in self.tracked_systems:
            self.tracked_systems[system]["fleet_carriers"] = fleet_carrier_count
            if fleet_carrier_count > 0:
                logger.debug(f"Fleet Carriers in {system}: {fleet_carrier_count}")
    
    async def process_fsd_jump(self, msg, cmdr_id):
        """Process FSDJump events - delegate to commander tracker"""
        await self.cmdr_tracker.process_fsd_jump(msg, cmdr_id, self.tracked_systems, self.handle_event)
    
    async def process_nav_route(self, msg, cmdr_id):
        """Process NavRoute events - delegate to commander tracker"""
        await self.cmdr_tracker.process_nav_route(msg, cmdr_id, self.tracked_systems)
                
    async def handle_event(self, event_data):
        """Handle processed event"""
        # Add to recent events
        self.recent_events.append(event_data)
        
        # Call callback if provided
        if self.callback:
            await self.callback(event_data)
            
    def get_status(self):
        """Get current status"""
        # Prepare system stats
        system_stats = {}
        for system_name, data in self.tracked_systems.items():
            system_stats[system_name] = {
                "commanders": len(data["commanders"]),
                "jumps_to": data["jumps_to"],
                "jumps_from": data["jumps_from"],
                "fleet_carriers": data["fleet_carriers"],
                "Cygnus": data.get("Cygnus", "NOT DETECTED"),
                "The Orion": data.get("The Orion", "NOT DETECTED")
            }
        
        return {
            "megaships": self.megaships,
            "tracked_systems": system_stats,
            "recent_events": list(self.recent_events),
            "stats": {
                "messages_received": self.messages_received,
                "messages_processed": self.messages_processed,
                "signals_checked": self.signals_checked,
                "fleet_carriers_seen": self.fleet_carriers_seen
            }
        }
        
    def stop(self):
        """Stop listening"""
        self.running = False

async def main():
    """Test function"""
    def print_event(event):
        print(f"Event: {json.dumps(event, indent=2)}")
        
    listener = EDDNListener(callback=print_event)
    await listener.start()

if __name__ == "__main__":
    asyncio.run(main())