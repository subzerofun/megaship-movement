/**
 * Test Panel for Megaship Movement Tracker
 * Simulates events for testing notifications and UI
 */

// Track missing counts for testing (removed - now handled by events.js)

let eddnTrackingEnabled = true;

/**
 * Initialize test panel
 */
async function initTestPanel() {
    // Check if test mode is enabled on server
    try {
        const response = await fetch('/status');
        const data = await response.json();
        // Only show test panel if server is in test mode
        if (data.test_mode) {
            createTestPanel();
        }
    } catch (e) {
        console.log('Test mode check failed, not showing test panel');
    }
}

/**
 * Create the test panel UI
 */
function createTestPanel() {
    const mapContainer = document.querySelector('.map-container');
    if (!mapContainer || !mapContainer.parentNode) return;
    
    const testPanel = document.createElement('div');
    testPanel.id = 'test-panel';
    testPanel.className = 'test-panel';
    testPanel.style.cssText = 'width: 28%; background: rgba(255, 140, 0, 0.05); padding: 15px; border: 1px solid #FF8C00;';
    testPanel.innerHTML = `
        <h3>TEST CONTROLS</h3>
        
        <div class="test-section">
            <h4>EDDN Tracking</h4>
            <button id="toggle-eddn" onclick="toggleEDDNTracking()">
                ${eddnTrackingEnabled ? 'Disable EDDN' : 'Enable EDDN'}
            </button>
        </div>
        
        <div class="test-section">
            <h4>Cygnus Controls</h4>
            <button onclick="simulateMissingSignal('Cygnus')">Missing Signal</button>
            <select id="cygnus-missing-system">
                <option value="">Select System</option>
                <option value="Nukamba">1. Nukamba</option>
                <option value="Graffias">2. Graffias</option>
                <option value="Vodyakamana">3. Vodyakamana</option>
                <option value="Marfic">4. Marfic</option>
                <option value="Upaniklis">5. Upaniklis</option>
                <option value="HR 6524">6. HR 6524</option>
                <option value="Col 359 Sector AE-N b9-4">7. Col 359 Sector AE-N b9-4</option>
                <option value="HIP 87621">8. HIP 87621</option>
            </select>
            <button onclick="simulateMissingStatus('Cygnus')">Set MISSING Status</button>
            <br>
            <select id="cygnus-appear-system">
                <option value="">Select System</option>
                <option value="Nukamba">Nukamba</option>
                <option value="Graffias">Graffias</option>
                <option value="Vodyakamana">Vodyakamana</option>
                <option value="Marfic">Marfic</option>
                <option value="Upaniklis">Upaniklis</option>
                <option value="HR 6524">HR 6524</option>
                <option value="Col 359 Sector AE-N b9-4">Col 359 Sector AE-N b9-4</option>
                <option value="HIP 87621">HIP 87621</option>
            </select>
            <button onclick="simulateDetected('Cygnus')">Simulate Detected</button>
        </div>
        
        <div class="test-section">
            <h4>The Orion Controls</h4>
            <button onclick="simulateMissingSignal('The Orion')">Missing Signal</button>
            <select id="orion-missing-system">
                <option value="">Select System</option>
                <option value="Nukamba">1. Nukamba</option>
                <option value="Graffias">2. Graffias</option>
                <option value="Vodyakamana">3. Vodyakamana</option>
                <option value="Marfic">4. Marfic</option>
                <option value="Upaniklis">5. Upaniklis</option>
                <option value="HR 6524">6. HR 6524</option>
                <option value="Col 359 Sector AE-N b9-4">7. Col 359 Sector AE-N b9-4</option>
                <option value="HIP 87621">8. HIP 87621</option>
            </select>
            <button onclick="simulateMissingStatus('The Orion')">Set MISSING Status</button>
            <br>
            <select id="orion-appear-system">
                <option value="">Select System</option>
                <option value="Nukamba">Nukamba</option>
                <option value="Graffias">Graffias</option>
                <option value="Vodyakamana">Vodyakamana</option>
                <option value="Marfic">Marfic</option>
                <option value="Upaniklis">Upaniklis</option>
                <option value="HR 6524">HR 6524</option>
                <option value="Col 359 Sector AE-N b9-4">Col 359 Sector AE-N b9-4</option>
                <option value="HIP 87621">HIP 87621</option>
            </select>
            <button onclick="simulateDetected('The Orion')">Simulate Detected</button>
        </div>
    `;
    
    // Insert after map container within the flex container
    mapContainer.parentNode.appendChild(testPanel);
}

/**
 * Toggle EDDN tracking on/off
 */
function toggleEDDNTracking() {
    eddnTrackingEnabled = !eddnTrackingEnabled;
    const button = document.getElementById('toggle-eddn');
    if (button) {
        button.textContent = eddnTrackingEnabled ? 'Disable EDDN' : 'Enable EDDN';
    }
    console.log(`EDDN tracking ${eddnTrackingEnabled ? 'enabled' : 'disabled'}`);
    
    // Send message to websocket to toggle EDDN processing
    if (window.ws && window.ws.readyState === WebSocket.OPEN) {
        window.ws.send(JSON.stringify({
            type: 'test_control',
            action: 'toggle_eddn',
            enabled: eddnTrackingEnabled
        }));
    }
}

/**
 * Simulate a missing signal for a ship
 */
function simulateMissingSignal(shipName) {
    const selectId = shipName === 'Cygnus' ? 'cygnus-missing-system' : 'orion-missing-system';
    const system = document.getElementById(selectId).value;
    
    if (!system) {
        alert('Please select a system first');
        return;
    }
    
    console.log(`Simulating missing signal for ${shipName} in ${system}`);
    
    // Create event that matches what EDDN listener would send - just a missing signal, no count!
    const event = {
        type: 'event',
        data: {
            type: 'megaship',
            name: shipName,
            system: system,
            system_address: 0, // Test value
            status: 'SIGNAL MISSING',
            timestamp: new Date().toISOString(),
            test: true
        }
    };
    
    // Process the event through the normal websocket handler
    if (window.ws && window.ws.onmessage) {
        window.ws.onmessage({data: JSON.stringify(event)});
    }
}

/**
 * Simulate MISSING status (red) for a ship
 */
function simulateMissingStatus(shipName) {
    const selectId = shipName === 'Cygnus' ? 'cygnus-missing-system' : 'orion-missing-system';
    const system = document.getElementById(selectId).value;
    
    if (!system) {
        alert('Please select a system first');
        return;
    }
    
    console.log(`Setting ${shipName} to MISSING status in ${system}`);
    
    // Update the UI directly to show MISSING in red
    const statusElem = document.getElementById(shipName.toLowerCase().replace(' ', '') + 'Status');
    if (statusElem) {
        statusElem.textContent = 'MISSING';
        statusElem.style.color = '#FF0000';
    }
    
    // Update system table
    const systemElem = document.getElementById(system + '-' + shipName.replace('The ', ''));
    if (systemElem) {
        systemElem.textContent = 'MISSING';
        systemElem.style.color = '#FF0000';
    }
}

/**
 * Simulate ship detected in a system
 */
function simulateDetected(shipName) {
    const selectId = shipName === 'Cygnus' ? 'cygnus-appear-system' : 'orion-appear-system';
    const system = document.getElementById(selectId).value;
    
    if (!system) {
        alert('Please select a system first');
        return;
    }
    
    console.log(`Simulating ${shipName} detected in ${system}`);
    
    // Create detected event
    const event = {
        type: 'event',
        data: {
            type: 'megaship',
            name: shipName,
            system: system,
            system_address: 0, // Test value
            status: 'DETECTED',
            signal_type: 'Test',
            timestamp: new Date().toISOString(),
            test: true
        }
    };
    
    // Process the event
    if (window.ws && window.ws.onmessage) {
        window.ws.onmessage({data: JSON.stringify(event)});
    }
}


// Initialize immediately when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTestPanel);
} else {
    initTestPanel();
}

// Export functions for onclick handlers
window.toggleEDDNTracking = toggleEDDNTracking;
window.simulateMissingSignal = simulateMissingSignal;
window.simulateMissingStatus = simulateMissingStatus;
window.simulateDetected = simulateDetected;