"""
Commander tracking utilities for Elite Dangerous
Tracks commanders in specific systems using FSDJump and NavRoute events
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger('cmdr_tracker')

class CommanderTracker:
    def __init__(self):
        self.commander_routes = {}  # Track planned routes per commander
        self.commander_locations = {}  # Track current location per commander
        
    async def process_fsd_jump(self, msg, cmdr_id, tracked_systems, callback=None):
        """
        Process FSDJump events to track commanders in systems
        
        Args:
            msg: The FSDJump message
            cmdr_id: Commander identifier (uploaderID_softwareName)
            tracked_systems: Dictionary of systems being tracked
            callback: Optional callback for events
        """
        system_name = msg.get("StarSystem")
        system_address = msg.get("SystemAddress")
        timestamp = msg.get("timestamp", datetime.now(timezone.utc).isoformat())
        
        if not system_name or not system_address or not cmdr_id:
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
            
        # Check if commander was previously in a tracked system
        if cmdr_id in self.commander_locations:
            prev_system = self.commander_locations[cmdr_id]
            if prev_system in tracked_systems:
                # Commander left a tracked system
                tracked_systems[prev_system]["commanders"].discard(cmdr_id)
                tracked_systems[prev_system]["jumps_from"] += 1
                logger.info(f"📤 Commander left {prev_system} (now {len(tracked_systems[prev_system]['commanders'])} cmdrs)")
                
                # Broadcast update
                if callback:
                    await callback({
                        "type": "system_traffic",
                        "system": prev_system,
                        "action": "left",
                        "commander_count": len(tracked_systems[prev_system]['commanders']),
                        "timestamp": timestamp
                    })
        
        # Check if commander entered a tracked system
        if system_name in tracked_systems:
            tracked_systems[system_name]["commanders"].add(cmdr_id)
            tracked_systems[system_name]["jumps_to"] += 1
            logger.info(f"📥 Commander entered {system_name} (now {len(tracked_systems[system_name]['commanders'])} cmdrs)")
            
            # Broadcast update
            if callback:
                await callback({
                    "type": "system_traffic",
                    "system": system_name,
                    "action": "entered",
                    "commander_count": len(tracked_systems[system_name]['commanders']),
                    "timestamp": timestamp
                })
        
        # Update commander's current location
        self.commander_locations[cmdr_id] = system_name
        
        # Clean up old commanders (older than 5 minutes)
        # This is simplified - in production you'd track timestamps
        if len(self.commander_locations) > 1000:
            # Keep only last 1000 commanders
            self.commander_locations = dict(list(self.commander_locations.items())[-1000:])
    
    async def process_nav_route(self, msg, cmdr_id, tracked_systems):
        """
        Process NavRoute events to track planned destinations
        NavRoute contains the full route a commander has plotted
        
        Args:
            msg: The NavRoute message containing Route array
            cmdr_id: Commander identifier
            tracked_systems: Dictionary of systems being tracked
        """
        route = msg.get("Route", [])
        if not route or not cmdr_id:
            return
            
        # Store the planned route
        self.commander_routes[cmdr_id] = route
        
        # Check if any tracked systems are in the route
        for waypoint in route:
            system_name = waypoint.get("StarSystem")
            if system_name in tracked_systems:
                logger.debug(f"Commander {cmdr_id[:8]}... has {system_name} in route")
                # We could track planned visits here if needed
                
    def get_commander_count(self, system_name, tracked_systems):
        """Get the current commander count for a system"""
        if system_name in tracked_systems:
            return len(tracked_systems[system_name]["commanders"])
        return 0
