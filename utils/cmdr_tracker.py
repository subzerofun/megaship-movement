"""
Commander tracking utilities for Elite Dangerous
Tracks commander movements using NavRoute planning and FSDJump confirmations
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Dict, Set, Optional

logger = logging.getLogger('cmdr_tracker')

class CommanderTracker:
    def __init__(self):
        # Short-term tracking of NavRoutes (expires after 3 minutes)
        # Key: uploaderID, Value: {from_system, to_system, timestamp}
        self.recent_navroutes = {}
        
        # Track pending departures from tracked systems with timestamps
        # Key: "from_system->to_system", Value: list of {timestamp, processed}
        self.pending_departures = {}
        
        # Track which departures have been auto-processed to prevent double-counting
        self.auto_processed_departures = set()  # Set of "from_system->timestamp" keys
        
        # Track recent arrivals to detect duplicate FSDJumps
        # Key: "uploader_id->system", Value: timestamp
        self.recent_arrivals = {}
        
        # Track recent planned arrivals to detect duplicate NavRoutes
        # Key: "uploader_id->to_system", Value: timestamp
        self.recent_planned_arrivals = {}
        
        # Track system counters (simple integers, not sets)
        # This is handled in tracked_systems dict, we just manage the logic
        
    def cleanup_old_routes(self):
        """Remove NavRoutes older than 3 minutes"""
        current_time = datetime.now(timezone.utc)
        expired_ids = []
        
        for uploader_id, route_data in self.recent_navroutes.items():
            route_time = datetime.fromisoformat(route_data['timestamp'].replace('Z', '+00:00'))
            if (current_time - route_time).total_seconds() > 180:  # 3 minutes
                expired_ids.append(uploader_id)
        
        for uploader_id in expired_ids:
            del self.recent_navroutes[uploader_id]
    
    def cleanup_old_departures(self, tracked_systems, callback=None):
        """Auto-process pending departures older than 5 minutes"""
        current_time = datetime.now(timezone.utc)
        
        for route_key in list(self.pending_departures.keys()):
            departures = self.pending_departures[route_key]
            processed_indices = []
            
            for i, dep in enumerate(departures):
                if dep.get('processed', False):
                    continue  # Skip already processed
                    
                dep_time = datetime.fromisoformat(dep['timestamp'].replace('Z', '+00:00'))
                if (current_time - dep_time).total_seconds() > 300:  # 5 minutes
                    # Auto-process this departure
                    from_system = route_key.split('->')[0]
                    to_system = route_key.split('->')[1]
                    
                    # Create unique key to track this auto-processing
                    auto_key = f"{from_system}->{dep['timestamp']}"
                    
                    # Only process if we haven't already auto-processed this exact departure
                    if auto_key not in self.auto_processed_departures:
                        self.auto_processed_departures.add(auto_key)
                        
                        if from_system in tracked_systems:
                            # Decrement the counter
                            tracked_systems[from_system]["commanders"] = max(0, tracked_systems[from_system].get("commanders", 0) - 1)
                            tracked_systems[from_system]["jumps_from"] += 1
                            
                            commander_count = tracked_systems[from_system]["commanders"]
                            
                            logger.info(f"📤 AUTO: CMDR departed {from_system} to {to_system} (timeout after 5min, now {commander_count} CMDRs)")
                            
                            if callback:
                                import asyncio
                                asyncio.create_task(callback({
                                    "type": "system_traffic",
                                    "action": "departed_timeout",
                                    "system": from_system,
                                    "destination": to_system,
                                    "commander_count": commander_count,
                                    "timestamp": dep['timestamp']
                                }))
                        
                        # Mark as processed
                        dep['processed'] = True
                        processed_indices.append(i)
            
            # Clean up fully processed departures
            if departures and all(d.get('processed', False) for d in departures):
                del self.pending_departures[route_key]
            
    async def process_nav_route(self, msg, uploader_id, tracked_systems, callback=None):
        """
        Process NavRoute events to track planned routes
        
        Args:
            msg: The NavRoute message containing Route array
            uploader_id: The uploaderID from the header (not combined with software)
            tracked_systems: Dictionary of systems being tracked
            callback: Optional callback for events
        """
        route = msg.get("Route", [])
        timestamp = msg.get("timestamp", datetime.now(timezone.utc).isoformat())
        
        if not route or len(route) < 2 or not uploader_id:
            return
            
        # Clean up old routes first
        self.cleanup_old_routes()
        
        # Get current location (Route[0]) and next destination (Route[1])
        current_system = route[0].get("StarSystem")
        next_system = route[1].get("StarSystem")
        
        if not current_system or not next_system:
            return
            
        # Store this NavRoute for matching with FSDJump
        self.recent_navroutes[uploader_id] = {
            'from_system': current_system,
            'to_system': next_system,
            'timestamp': timestamp
        }
        
        # Log planned departures from tracked systems and track them
        if current_system in tracked_systems:
            # Track this pending departure with timestamp and uploaderID
            departure_key = f"{current_system}->{next_system}"
            if departure_key not in self.pending_departures:
                self.pending_departures[departure_key] = []
            
            # Check if this exact same route already exists (same timestamp = same event from different tools)
            already_exists = False
            for dep in self.pending_departures[departure_key]:
                # If same timestamp (within 1 second), it's the same event from different uploaders
                if dep.get('timestamp') == timestamp:
                    logger.info(f"\033[96m⚠️ DUPLICATE: NavRoute from {current_system} to {next_system} at {timestamp} (different uploader: {uploader_id})\033[0m")
                    already_exists = True
                    break
                # Also check if same uploader already has this route
                if dep.get('uploader_id') == uploader_id and not dep.get('processed', False):
                    logger.info(f"\033[96m⚠️ DUPLICATE: NavRoute from {current_system} to {next_system} (same uploader: {uploader_id})\033[0m")
                    already_exists = True
                    break
            
            if not already_exists:
                # Remove any OTHER routes from this uploader from this system
                for other_key in list(self.pending_departures.keys()):
                    if other_key.startswith(f"{current_system}->"):
                        for i in range(len(self.pending_departures[other_key]) - 1, -1, -1):
                            dep = self.pending_departures[other_key][i]
                            if dep.get('uploader_id') == uploader_id and not dep.get('processed', False):
                                # Remove the old route
                                logger.debug(f"Removing old route {other_key} for {uploader_id}")
                                self.pending_departures[other_key].pop(i)
                                if not self.pending_departures[other_key]:
                                    del self.pending_departures[other_key]
                
                # Add the new departure
                self.pending_departures[departure_key].append({
                    'timestamp': timestamp,
                    'processed': False,
                    'uploader_id': uploader_id
                })
                
                logger.info(f"📋 CMDR planned NavRoute from {current_system} to {next_system}")
                logger.debug(f"Added pending departure: {departure_key} (now {len(self.pending_departures[departure_key])} pending)")
            
                if callback:
                    await callback({
                        "type": "system_traffic",
                        "action": "planned_departure",
                        "system": current_system,
                        "destination": next_system,
                        "timestamp": timestamp,
                        "uploader_id": uploader_id
                    })
        
        # Log planned arrivals to tracked systems
        if next_system in tracked_systems and next_system != current_system:
            # Check for duplicate arrivals from same uploader
            if not hasattr(self, 'recent_planned_arrivals'):
                self.recent_planned_arrivals = {}  # Key: "uploader_id->to_system", Value: timestamp
            
            arrival_key = f"{uploader_id}->{next_system}"
            if arrival_key in self.recent_planned_arrivals:
                # Check if this is a duplicate (same route within 30 seconds)
                try:
                    last_planned = datetime.fromisoformat(self.recent_planned_arrivals[arrival_key].replace('Z', '+00:00'))
                    current_planned = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                    if (current_planned - last_planned).total_seconds() < 30:
                        logger.info(f"\033[96m⚠️ DUPLICATE: NavRoute to {next_system} from {current_system} (uploader: {uploader_id})\033[0m")
                        return  # Skip this duplicate
                except Exception:
                    pass  # If timestamp parsing fails, continue
            
            # Update recent arrival planning
            self.recent_planned_arrivals[arrival_key] = timestamp
            
            logger.info(f"📋 CMDR planned NavRoute to {next_system} from {current_system}")
            if callback:
                await callback({
                    "type": "system_traffic",
                    "action": "planned_arrival",
                    "system": next_system,
                    "origin": current_system,
                    "timestamp": timestamp,
                    "uploader_id": uploader_id
                })
    
    async def process_fsd_jump(self, msg, uploader_id, tracked_systems, callback=None):
        """
        Process FSDJump events to confirm actual jumps
        
        Args:
            msg: The FSDJump message
            uploader_id: The uploaderID from the header (not combined with software)
            tracked_systems: Dictionary of systems being tracked
            callback: Optional callback for events
        """
        system_name = msg.get("StarSystem")
        system_address = msg.get("SystemAddress")
        timestamp = msg.get("timestamp", datetime.now(timezone.utc).isoformat())
        
        if not system_name or not system_address:
            return
            
        # Check if timestamp is within 10 minutes of current time
        try:
            msg_time = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            current_time = datetime.now(timezone.utc)
            time_diff = abs((current_time - msg_time).total_seconds())
            
            if time_diff > 600:  # 10 minutes = 600 seconds
                logger.debug(f"Ignoring old FSDJump from {timestamp} (diff: {time_diff:.0f}s)")
                return
        except Exception as e:
            logger.warning(f"Could not parse timestamp {timestamp}: {e}")
            return
            
        # Clean up old routes and auto-process old departures
        self.cleanup_old_routes()
        self.cleanup_old_departures(tracked_systems, callback)
        
        # Check if this matches a recent NavRoute
        nav_route = self.recent_navroutes.get(uploader_id)
        
        # ARRIVALS - Always increment for jumps TO tracked systems
        if system_name in tracked_systems:
            # Check if this uploader just jumped to this system recently (duplicate FSDJump)
            # Store recent arrivals to detect duplicates
            if not hasattr(self, 'recent_arrivals'):
                self.recent_arrivals = {}  # Key: "uploader_id->system", Value: timestamp
            
            # First check if ANY arrival to this system happened at the exact same timestamp (different uploaders, same event)
            for key, arrival_time in self.recent_arrivals.items():
                if key.endswith(f"->{system_name}") and arrival_time == timestamp:
                    logger.info(f"\033[96m⚠️ DUPLICATE: FSDJump to {system_name} at {timestamp} (different uploader: {uploader_id})\033[0m")
                    return  # Skip this duplicate
            
            arrival_key = f"{uploader_id}->{system_name}"
            if arrival_key in self.recent_arrivals:
                # Check if this is a duplicate from same uploader (within 30 seconds)
                last_arrival = datetime.fromisoformat(self.recent_arrivals[arrival_key].replace('Z', '+00:00'))
                current_arrival = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
                if (current_arrival - last_arrival).total_seconds() < 30:
                    logger.info(f"\033[96m⚠️ DUPLICATE: FSDJump to {system_name} (same uploader: {uploader_id})\033[0m")
                    return  # Skip this duplicate
            
            # Update recent arrival
            self.recent_arrivals[arrival_key] = timestamp
            
            # Increment the counter
            tracked_systems[system_name]["commanders"] = tracked_systems[system_name].get("commanders", 0) + 1
            tracked_systems[system_name]["jumps_to"] += 1
            
            commander_count = tracked_systems[system_name]["commanders"]
            
            if nav_route and nav_route['to_system'] == system_name:
                # This was a planned arrival
                logger.info(f"📥 CMDR arrived in {system_name} as planned (now {commander_count} CMDRs)")
                event_type = "arrived_planned"
            else:
                # This was an unplanned arrival
                logger.info(f"📥 CMDR arrived in {system_name} (now {commander_count} CMDRs)")
                event_type = "arrived"
            
            if callback:
                await callback({
                    "type": "system_traffic",
                    "action": event_type,
                    "system": system_name,
                    "commander_count": commander_count,
                    "timestamp": timestamp,
                    "uploader_id": uploader_id
                })
        
        # DEPARTURES - Check for any pending departure that matches this arrival
        # Look through all tracked systems to see if someone was planning to jump here
        departure_processed = False
        for from_system in tracked_systems:
            departure_key = f"{from_system}->{system_name}"
            
            if departure_key in self.pending_departures:
                departures = self.pending_departures[departure_key]
                
                # Find the oldest unprocessed departure
                for dep in departures:
                    if not dep.get('processed', False):
                        # Create unique key to check if this was auto-processed
                        auto_key = f"{from_system}->{dep['timestamp']}"
                        
                        # Only process if not already auto-processed
                        if auto_key not in self.auto_processed_departures:
                            # Mark as processed
                            dep['processed'] = True
                            
                            # Decrement the counter for the departure system
                            tracked_systems[from_system]["commanders"] = max(0, tracked_systems[from_system].get("commanders", 0) - 1)
                            tracked_systems[from_system]["jumps_from"] += 1
                            
                            commander_count = tracked_systems[from_system]["commanders"]
                            
                            logger.info(f"📤 CMDR departed {from_system} to {system_name} (now {commander_count} CMDRs)")
                            
                            if callback:
                                await callback({
                                    "type": "system_traffic",
                                    "action": "departed",
                                    "system": from_system,
                                    "commander_count": commander_count,
                                    "timestamp": timestamp,
                                    "uploader_id": dep.get('uploader_id', 'unknown')
                                })
                            
                            departure_processed = True
                            break
                
                # Clean up if all departures are processed
                if all(d.get('processed', False) for d in departures):
                    del self.pending_departures[departure_key]
                
                if departure_processed:
                    break  # Only process one departure per FSDJump
        
        # Also check the old uploaderID method as a fallback (only if we didn't process above)
        if nav_route and not departure_processed:
            from_system = nav_route['from_system']
            
            # Only use this if we didn't already process a departure above
            # and if it's from a tracked system to somewhere else
            if from_system in tracked_systems and from_system != system_name:
                # This is the old method - still useful for quick jumps within 3 minutes
                tracked_systems[from_system]["commanders"] = max(0, tracked_systems[from_system].get("commanders", 0) - 1)
                tracked_systems[from_system]["jumps_from"] += 1
                
                commander_count = tracked_systems[from_system]["commanders"]
                
                logger.info(f"📤 CMDR departed {from_system} via uploaderID match (now {commander_count} CMDRs)")
                
                if callback:
                    await callback({
                        "type": "system_traffic",
                        "action": "departed",
                        "system": from_system,
                        "commander_count": commander_count,
                        "timestamp": timestamp,
                        "uploader_id": uploader_id
                    })
            
            # Remove the used NavRoute
            del self.recent_navroutes[uploader_id]
    
    def get_commander_count(self, system_name, tracked_systems):
        """Get the current commander count for a system"""
        if system_name in tracked_systems:
            return tracked_systems[system_name].get("commanders", 0)
        return 0