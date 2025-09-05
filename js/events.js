/**
 * WebSocket Event Handler and UI Updates
 * Handles real-time updates from the EDDN listener
 */

let ws = null;
let reconnectTimer = null;

function formatTime(timestamp) {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
}

function updateConnectionStatus(connected) {
    const status = document.getElementById('connectionStatus');
    if (connected) {
        status.innerHTML = '<span class="connected">● CONNECTED</span>';
    } else {
        status.innerHTML = '<span class="disconnected">● DISCONNECTED</span>';
    }
}

function updateMegashipStatus(name, data) {
    const prefix = name === 'Cygnus' ? 'cygnus' : 'orion';
    
    const status = data.status || (data.last_seen ? 'DETECTED' : 'NOT DETECTED');
    const statusElem = document.getElementById(prefix + 'Status');
    if (statusElem) {
        statusElem.textContent = status;
        
        if (status === 'DETECTED') {
            statusElem.style.color = '#00FF00';
        } else if (status === 'IRREGULAR VISIT') {
            statusElem.style.color = '#FF0000';  // Red for irregular visit
        } else if (status === 'SIGNAL MISSING' || status === 'MISSING') {
            statusElem.textContent = 'SIGNAL MISSING';
            statusElem.style.color = '#FFD700';
        } else {
            statusElem.style.color = '#FF8C00';
        }
    }
    
    const sysElem = document.getElementById(prefix + 'System');
    if (sysElem) sysElem.textContent = data.system || 'Unknown';
    
    const addrElem = document.getElementById(prefix + 'Address');
    if (addrElem) addrElem.textContent = data.system_address || 'N/A';
    
    const timeElem = document.getElementById(prefix + 'Time');
    if (timeElem) timeElem.textContent = formatTime(data.last_seen);
}

function addEventToLog(event) {
    const eventList = document.getElementById('eventList');
    
    // Remove "waiting" message if present
    if (eventList.querySelector('.no-data')) {
        eventList.innerHTML = '';
    }
    
    const eventDiv = document.createElement('div');
    eventDiv.className = 'event-item';
    
    if (event.type === 'megaship') {
        eventDiv.className += ' megaship';
        
        // Check for irregular visit
        if (event.is_irregular || event.status === 'IRREGULAR VISIT') {
            eventDiv.className += ' irregular';
            eventDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.2)';
            eventDiv.style.borderLeft = '4px solid #FF0000';
            const statusIcon = '🚨';
            eventDiv.innerHTML = `
                <strong style="color: #FF0000;">${statusIcon} IRREGULAR VISIT: ${event.name}</strong><br>
                <span style="color: #FF0000;">NON-TRACKED SYSTEM: ${event.system}</span><br>
                System Address: ${event.system_address}<br>
                Signal Type: ${event.signal_type || 'Unknown'}
                <div class="event-time">${formatTime(event.timestamp)}</div>
            `;
        } else {
            const statusIcon = event.status === 'DETECTED' ? '🟢' : event.status === 'SIGNAL MISSING' ? '⚠️' : '❓';
            eventDiv.innerHTML = `
                <strong>${statusIcon} ${event.name} ${event.status}</strong><br>
                System: ${event.system} (${event.system_address})<br>
                Signal Type: ${event.signal_type || 'Unknown'}
                <div class="event-time">${formatTime(event.timestamp)}</div>
            `;
        }
    } else if (event.type === 'system_traffic') {
        eventDiv.className += ' system';
        const icon = event.action === 'entered' ? '↪' : '↩';
        eventDiv.innerHTML = `
            <strong>${icon} ${event.system}</strong><br>
            Commander ${event.action} (now ${event.commander_count} cmdrs)
            <div class="event-time">${formatTime(event.timestamp)}</div>
        `;
    } else {
        // Don't show other events
        return;
    }
    
    eventList.insertBefore(eventDiv, eventList.firstChild);
    
    // Keep only last 50 events
    while (eventList.children.length > 50) {
        eventList.removeChild(eventList.lastChild);
    }
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;
    
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
        updateConnectionStatus(true);
        
        // Clear reconnect timer
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
    };
    
    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'initial_status') {
                // Update megaship status
                updateMegashipStatus('Cygnus', message.data.megaships.Cygnus);
                updateMegashipStatus('The Orion', message.data.megaships['The Orion']);
                
                // Update map for initial status
                if (window.updateMegashipMap) {
                    const cygnusData = message.data.megaships.Cygnus;
                    const orionData = message.data.megaships['The Orion'];
                    
                    if (cygnusData.system && cygnusData.status === 'DETECTED') {
                        window.updateMegashipMap('Cygnus', cygnusData.system, true);
                    }
                    if (orionData.system && orionData.status === 'DETECTED') {
                        window.updateMegashipMap('The Orion', orionData.system, true);
                    }
                }
                
                // Add recent events (only megaship events)
                if (message.data.recent_events) {
                    message.data.recent_events.forEach(addEventToLog);
                }
                
                // Update tracked systems
                if (message.data.tracked_systems) {
                    for (const [system, data] of Object.entries(message.data.tracked_systems)) {
                        // Update commander count
                        const countElem = document.getElementById(system + '-count');
                        if (countElem) {
                            countElem.textContent = data.commanders;
                        }
                        
                        // Update FC count
                        const fcElem = document.getElementById(system + '-fc');
                        if (fcElem) {
                            fcElem.textContent = data.fleet_carriers || 0;
                        }
                        
                        // Update Cygnus status
                        const cygnusElem = document.getElementById(system + '-Cygnus');
                        if (cygnusElem) {
                            const cygnusStatus = data.Cygnus;
                            if (cygnusStatus === 'NOT DETECTED') {
                                cygnusElem.textContent = '-';
                                cygnusElem.style.color = '#FF8C00';
                                // Update map
                                if (window.updateMegashipMap) {
                                    window.updateMegashipMap('Cygnus', system, false);
                                }
                            } else if (cygnusStatus === 'MISSING') {
                                cygnusElem.textContent = 'MISSING';
                                cygnusElem.style.color = '#FFD700';
                                // Update map
                                if (window.updateMegashipMap) {
                                    window.updateMegashipMap('Cygnus', system, false);
                                }
                            } else if (typeof cygnusStatus === 'string' && cygnusStatus.includes('T')) {
                                // It's a timestamp
                                const date = new Date(cygnusStatus);
                                cygnusElem.textContent = date.toLocaleTimeString();
                                cygnusElem.style.color = '#00FF00';
                                // Update map
                                if (window.updateMegashipMap) {
                                    window.updateMegashipMap('Cygnus', system, true);
                                }
                            }
                        }
                        
                        // Update Orion status
                        const orionElem = document.getElementById(system + '-Orion');
                        if (orionElem) {
                            const orionStatus = data['The Orion'];
                            if (orionStatus === 'NOT DETECTED') {
                                orionElem.textContent = '-';
                                orionElem.style.color = '#FF8C00';
                                // Update map
                                if (window.updateMegashipMap) {
                                    window.updateMegashipMap('The Orion', system, false);
                                }
                            } else if (orionStatus === 'MISSING') {
                                orionElem.textContent = 'MISSING';
                                orionElem.style.color = '#FFD700';
                                // Update map
                                if (window.updateMegashipMap) {
                                    window.updateMegashipMap('The Orion', system, false);
                                }
                            } else if (typeof orionStatus === 'string' && orionStatus.includes('T')) {
                                // It's a timestamp
                                const date = new Date(orionStatus);
                                orionElem.textContent = date.toLocaleTimeString();
                                orionElem.style.color = '#00FF00';
                                // Update map
                                if (window.updateMegashipMap) {
                                    window.updateMegashipMap('The Orion', system, true);
                                }
                            }
                        }
                    }
                }
                
                // Update stats
                if (message.data.stats) {
                    document.getElementById('stats').textContent = 
                        `Messages: ${message.data.stats.messages_processed} | Signals: ${message.data.stats.signals_checked} | FCs: ${message.data.stats.fleet_carriers_seen || 0}`;
                }
            } else if (message.type === 'event') {
                const eventData = message.data;
                
                // Process different event types
                if (eventData.type === 'megaship') {
                    const megashipData = {
                        last_seen: eventData.timestamp,
                        system: eventData.system,
                        system_address: eventData.system_address,
                        signal_type: eventData.signal_type,
                        status: eventData.status
                    };
                    updateMegashipStatus(eventData.name, megashipData);
                    
                    // Update system table immediately
                    const systemName = eventData.system;
                    const shipName = eventData.name.replace('The ', '');
                    const systemElem = document.getElementById(systemName + '-' + shipName);
                    if (systemElem) {
                        if (eventData.status === 'DETECTED') {
                            const date = new Date(eventData.timestamp);
                            systemElem.textContent = date.toLocaleTimeString();
                            systemElem.style.color = '#00FF00';
                            // Update map
                            if (window.updateMegashipMap) {
                                window.updateMegashipMap(shipName.includes('Orion') ? 'The Orion' : shipName, systemName, true);
                            }
                        } else if (eventData.status === 'MISSING' || eventData.status === 'SIGNAL MISSING') {
                            systemElem.textContent = 'SIGNAL MISSING';
                            systemElem.style.color = '#FFD700';
                            // Update map
                            if (window.updateMegashipMap) {
                                window.updateMegashipMap(shipName.includes('Orion') ? 'The Orion' : shipName, systemName, false);
                            }
                        }
                    }
                    addEventToLog(eventData);
                } else if (eventData.type === 'system_traffic') {
                    // Update system commander count
                    const elem = document.getElementById(eventData.system + '-count');
                    if (elem) {
                        elem.textContent = eventData.commander_count;
                    }
                    addEventToLog(eventData);
                }
            }
        } catch (e) {
            console.error('Error processing message:', e);
        }
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        updateConnectionStatus(false);
        
        // Reconnect after 3 seconds
        reconnectTimer = setTimeout(() => {
            console.log('Attempting to reconnect...');
            connectWebSocket();
        }, 3000);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        updateConnectionStatus(false);
    };
}

// Connect on page load
connectWebSocket();

// Load SVG map after page is ready
setTimeout(() => {
    if (window.loadMegashipMap) {
        console.log('Loading megaship map...');
        window.loadMegashipMap();
    } else {
        console.error('loadMegashipMap function not found - check if megaship_map.js loaded');
    }
}, 500);

// Send ping every 30 seconds to keep connection alive
setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'ping'}));
    }
}, 30000);