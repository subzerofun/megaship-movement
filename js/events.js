/**
 * WebSocket Event Handler and UI Updates
 * Handles real-time updates from the EDDN listener
 */

let ws = null;
let reconnectTimer = null;

// Track missing signal counts for each ship/system combination
const missingSignalCounts = {
    'Cygnus': {},
    'The Orion': {}
};

// Track previous system for each ship (to detect system changes)
const previousShipSystems = {
    'Cygnus': null,
    'The Orion': null
};

// Track when ship went missing (for detecting long absences)
const shipMissingTimestamps = {
    'Cygnus': null,
    'The Orion': null
};

// Track EKG history for each ship
const shipEKG = {
    'Cygnus': [],
    'The Orion': []
};

// EKG Configuration
const EKG_SYMBOLS = {
    DETECTED: '▓',           // Green - signal detected
    MISSING_1_2: '░',        // Light - 1st and 2nd missing
    MISSING_3_4: '▒',        // Medium - 3rd and 4th missing  
    MISSING_5_6: '▓',        // Heavy - 5th and 6th missing
    GONE: '▓',               // Red - ship gone (after 6)
    FILLER: '░'              // Dark orange - empty space filler
};

const EKG_COLORS = {
    DETECTED: '#00FF00',      // Green
    MISSING_EARLY: '#FFA500',  // Orange
    MISSING_LATE: '#FFD700',   // Gold/Yellow
    GONE: '#FF0000',          // Red
    FILLER: '#AA5500'         // Dark orange
};

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
        
        // Update EKG display based on status
        if (window.addToEKG) {
            if (status === 'DETECTED') {
                window.addToEKG(name, 'detected', 0);
            } else if (status === 'SIGNAL MISSING') {
                // Use missing count if available
                const missingCount = data.missing_count || 1;
                window.addToEKG(name, 'missing', missingCount);
            } else if (status === 'MISSING') {
                window.addToEKG(name, 'gone', 7);
            }
        }
        
        if (status === 'DETECTED') {
            statusElem.style.color = '#00FF00';
        } else if (status === 'IRREGULAR VISIT') {
            statusElem.style.color = '#FF0000';  // Red for irregular visit
        } else if (status === 'MISSING') {
            statusElem.textContent = 'MISSING';
            statusElem.style.color = '#FF0000';  // Red for ship has jumped
        } else if (status === 'SIGNAL MISSING') {
            statusElem.textContent = 'SIGNAL MISSING';
            statusElem.style.color = '#FFD700';  // Yellow for checking
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
                    // Track missing signal counts
                    const shipName = eventData.name;
                    const system = eventData.system;
                    const key = `${shipName}_${system}`;
                    
                    if (eventData.status === 'SIGNAL MISSING') {
                        // Increment missing count for this ship/system
                        if (!missingSignalCounts[shipName][key]) {
                            missingSignalCounts[shipName][key] = 0;
                        }
                        missingSignalCounts[shipName][key]++;
                        
                        console.log(`⚠️ ${shipName} SIGNAL MISSING in ${system} (count: ${missingSignalCounts[shipName][key]})`);
                        
                        // Trigger map animation for missing signal (only on first missing, not every time)
                        if (missingSignalCounts[shipName][key] === 1 && window.animateSignalMissing) {
                            window.animateSignalMissing(system);
                        }
                        
                        // After 6 missing signals, the ship has jumped!
                        if (missingSignalCounts[shipName][key] >= 6) {
                            // Change status to MISSING (ship has jumped)
                            eventData.status = 'MISSING';
                            
                            // Send push notification only on the 6th signal
                            if (missingSignalCounts[shipName][key] === 6) {
                                console.log(`🚨 ${shipName} is now MISSING from ${system}! Ship has jumped!`);
                                // THIS IS THE REAL PUSH NOTIFICATION - same for test and production!
                                sendPushNotification('jumped', shipName, system);
                                
                                // Record when the ship went missing
                                shipMissingTimestamps[shipName] = Date.now();
                            }
                        }
                    } else if (eventData.status === 'DETECTED') {
                        // Reset count when detected - this is the ONLY way to reset from MISSING
                        missingSignalCounts[shipName][key] = 0;
                        
                        // Trigger map animation for detection
                        if (window.animateShipDetected) {
                            window.animateShipDetected(system);
                        }
                        
                        // Check if ship was MISSING for over 10 minutes (even in same system)
                        const wasLongMissing = shipMissingTimestamps[shipName] && 
                                              (Date.now() - shipMissingTimestamps[shipName]) > (10 * 60 * 1000); // 10 minutes
                        
                        const previousSystem = previousShipSystems[shipName];
                        
                        // ALWAYS log detection
                        console.log(`✅ ${shipName} DETECTED in ${system}`);
                        
                        // Send notification if:
                        // 1. Ship appeared in a different system, OR
                        // 2. Ship was MISSING for over 10 minutes (could have jumped away and back)
                        if (previousSystem && previousSystem !== system) {
                            console.log(`🔄 SYSTEM CHANGE: ${shipName} moved from ${previousSystem} to ${system}!`);
                            sendPushNotification('appeared', shipName, system, previousSystem);
                            
                            // Clear old system display in table
                            const oldSystemElem = document.getElementById(previousSystem + '-' + shipName);
                            if (oldSystemElem) {
                                oldSystemElem.textContent = '-';
                                oldSystemElem.style.color = '#FF8C00'; // Orange for old
                            }
                        } else if (previousSystem === system && wasLongMissing) {
                            console.log(`🔄 REAPPEARED: ${shipName} back in ${system} after being MISSING for over 10 minutes!`);
                            sendPushNotification('appeared', shipName, system, previousSystem);
                        }
                        
                        // Clear missing timestamp since ship is detected
                        shipMissingTimestamps[shipName] = null;
                        
                        // Update last known system
                        previousShipSystems[shipName] = system;
                    }
                    
                    const megashipData = {
                        last_seen: eventData.timestamp,
                        system: eventData.system,
                        system_address: eventData.system_address,
                        signal_type: eventData.signal_type,
                        status: eventData.status,
                        missing_count: missingSignalCounts[shipName][key] || 0
                    };
                    updateMegashipStatus(eventData.name, megashipData);
                    
                    // Update system table immediately
                    const systemName = eventData.system;
                    const shipNameShort = eventData.name.replace('The ', '');
                    // Try both full name and short name for element ID
                    let systemElem = document.getElementById(systemName + '-' + eventData.name);
                    if (!systemElem) {
                        systemElem = document.getElementById(systemName + '-' + shipNameShort);
                    }
                    if (systemElem) {
                        if (eventData.status === 'DETECTED') {
                            const date = new Date(eventData.timestamp);
                            systemElem.textContent = date.toLocaleTimeString();
                            systemElem.style.color = '#00FF00';
                            // Update map - use the full original name
                            if (window.updateMegashipMap) {
                                window.updateMegashipMap(eventData.name, systemName, true);
                            }
                        } else if (eventData.status === 'MISSING') {
                            systemElem.textContent = 'MISSING';
                            systemElem.style.color = '#FF0000';  // Red for jumped
                            // Update map - use the full original name
                            if (window.updateMegashipMap) {
                                window.updateMegashipMap(eventData.name, systemName, false);
                            }
                        } else if (eventData.status === 'SIGNAL MISSING') {
                            systemElem.textContent = 'SIGNAL MISSING';
                            systemElem.style.color = '#FFD700';  // Yellow for checking
                            // Update map - use the full original name
                            if (window.updateMegashipMap) {
                                window.updateMegashipMap(eventData.name, systemName, false);
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
                    
                    // Trigger map animation for commander entering system
                    if (eventData.action === 'entered' && window.animateCommanderEntry) {
                        window.animateCommanderEntry(eventData.system);
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

// Don't automatically request notification permission - wait for user action

// Make ws available globally for test panel
window.ws = ws;

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

/**
 * THE ONE FUNCTION that handles ALL notifications - browser AND push triggers
 * Used by BOTH test and production events
 */
function sendPushNotification(type, shipName, system, previousSystem = null) {
    let title, body;
    
    if (type === 'jumped') {
        title = `${shipName} has jumped!`;
        body = `${shipName} has left ${system} after 6 consecutive missing signals`;
        console.log(`🚀 NOTIFICATION: ${title}`);
    } else if (type === 'appeared') {
        title = `${shipName} appeared in ${system}!`;
        body = `${shipName} has been detected in ${system}${previousSystem ? ` (previously in ${previousSystem})` : ''}`;
        console.log(`🎯 NOTIFICATION: ${title}`);
    }
    
    console.log(`   Body: ${body}`);
    
    // SEND BOTH:
    
    // 1. Browser notification for immediate local display
    if (window.Notification && Notification.permission === 'granted') {
        new Notification(title, {
            body: body,
            icon: '/img/icon_1.svg',
            tag: type === 'jumped' ? 'ship-jumped' : 'ship-appeared'
        });
    }
    
    // 2. ACTUALLY SEND PUSH via WebSocket to server (which will use pywebpush)
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
        window.ws.send(JSON.stringify({
            type: 'send_push',
            notification: {
                title: title,
                body: body,
                ship: shipName,
                system: system,
                event_type: type
            }
        }));
        console.log(`   Push message sent to server for distribution`);
    }
}

// Export for any other code that needs it
window.sendPushNotification = sendPushNotification;

/**
 * Add signal to EKG history
 */
function addToEKG(shipName, type, missingCount) {
    const timestamp = Date.now();
    let symbol, color;
    
    if (type === 'detected') {
        symbol = EKG_SYMBOLS.DETECTED;
        color = EKG_COLORS.DETECTED;
    } else if (type === 'missing') {
        if (missingCount <= 2) {
            symbol = EKG_SYMBOLS.MISSING_1_2;
            color = EKG_COLORS.MISSING_EARLY;
        } else if (missingCount <= 4) {
            symbol = EKG_SYMBOLS.MISSING_3_4;
            color = EKG_COLORS.MISSING_LATE;
        } else if (missingCount <= 6) {
            symbol = EKG_SYMBOLS.MISSING_5_6;
            color = EKG_COLORS.MISSING_LATE;
        } else {
            symbol = EKG_SYMBOLS.GONE;
            color = EKG_COLORS.GONE;
        }
    } else if (type === 'gone') {
        symbol = EKG_SYMBOLS.GONE;
        color = EKG_COLORS.GONE;
    }
    
    // Add to history
    shipEKG[shipName].push({
        symbol: symbol,
        color: color,
        timestamp: timestamp,
        type: type,
        missingCount: missingCount
    });
    
    // Keep max 100 entries
    if (shipEKG[shipName].length > 100) {
        shipEKG[shipName].shift();
    }
    
    updateEKGDisplay(shipName);
}

/**
 * Update EKG display for a ship
 */
function updateEKGDisplay(shipName) {
    const ekgId = shipName === 'Cygnus' ? 'cygnus-ekg' : 'orion-ekg';
    let ekgElem = document.getElementById(ekgId);
    
    if (!ekgElem) return;
    
    // Build EKG string (show last 28 signals to fill width)
    const maxWidth = 28;
    const history = shipEKG[shipName];
    const now = Date.now();
    let ekgHTML = '';
    
    // Get last maxWidth entries or fill with empty
    for (let i = 0; i < maxWidth; i++) {
        const index = history.length - maxWidth + i;
        
        if (index < 0 || index >= history.length) {
            // Fill with filler
            ekgHTML += `<span style="color: ${EKG_COLORS.FILLER}">${EKG_SYMBOLS.FILLER}</span>`;
        } else {
            const entry = history[index];
            // Just use the symbol and color, no special handling for old entries
            ekgHTML += `<span style="color: ${entry.color}">${entry.symbol}</span>`;
        }
    }
    
    ekgElem.innerHTML = ekgHTML;
}

// Export for use in test panel
window.addToEKG = addToEKG;

// Update EKG displays periodically
setInterval(() => {
    updateEKGDisplay('Cygnus');
    updateEKGDisplay('The Orion');
}, 1000);