/**
 * Megaship Map Controller
 * Controls visibility of ship markers on the SVG map
 */

// System mapping - maps system names to marker IDs (8 systems total)
const SYSTEM_MAP = {
    'Nukamba': { index: 1, marker: 'i', cygnus: 'r', orion: 'u' },      // M1 -> C1, O1
    'Graffias': { index: 2, marker: 'd', cygnus: 'aa', orion: 'q' },    // M2 -> C2, O2
    'Vodyakamana': { index: 3, marker: 'g', cygnus: 'm', orion: 'n' },  // M3 -> C3, O3
    'Marfic': { index: 4, marker: 'h', cygnus: 'z', orion: 'o' },       // M4 -> C4, O4
    'Upaniklis': { index: 5, marker: 'f', cygnus: 'ab', orion: 'p' },   // M5 -> C5, O5
    'HR 6524': { index: 6, marker: 'e', cygnus: 's', orion: 't' },      // M6 -> C6, O6
    'Col 359 Sector AE-N b9-4': { index: 7, marker: 'j', cygnus: 'v', orion: 'x' }, // M7 -> C7, O7
    'HIP 87621': { index: 8, marker: 'k', cygnus: 'w', orion: 'y' }     // M8 -> C8, O8 (permit locked)
};

// Track current ship positions
const shipPositions = {
    'Cygnus': null,
    'The Orion': null
};

/**
 * Load the SVG map into the container
 */
window.loadMegashipMap = function() {
    const container = document.getElementById('megaship-svg-container');
    if (!container) {
        console.error('Container not found: megaship-svg-container');
        return;
    }
    
    console.log('Fetching SVG from img/megaship_map.svg...');
    
    // Fetch and inject the SVG
    fetch('img/megaship_map.svg')
        .then(response => {
            console.log('SVG fetch response:', response.status);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.text();
        })
        .then(svgText => {
            console.log('SVG loaded, length:', svgText.length);
            container.innerHTML = svgText;
            initializeMap();
        })
        .catch(error => {
            console.error('Failed to load SVG map:', error);
            container.innerHTML = '<div style="color: #FF8C00; padding: 20px; text-align: center;">Failed to load map: ' + error.message + '</div>';
        });
};

/**
 * Initialize map after loading
 */
function initializeMap() {
    console.log('Initializing map...');
    
    // Wait a moment for SVG to be fully in the DOM
    setTimeout(() => {
        // Hide all ship markers initially (C1-C8, O1-O8)
        console.log('Hiding all ship markers...');
        hideAllShipMarkers();
        
        // System markers should already be visible in the SVG
        // Just verify they exist
        Object.values(SYSTEM_MAP).forEach(system => {
            const elem = document.getElementById(system.marker);
            if (elem) {
                console.log(`System marker ${system.marker} found`);
            } else {
                console.error(`System marker ${system.marker} NOT found!`);
            }
        });
        
        // Re-apply any current ship positions from the table
        reapplyShipPositions();
    }, 100);
}

/**
 * Re-apply ship positions based on current table state
 */
function reapplyShipPositions() {
    // Check each system in the table
    Object.keys(SYSTEM_MAP).forEach(system => {
        const cygnusElem = document.getElementById(system + '-Cygnus');
        const orionElem = document.getElementById(system + '-Orion');
        
        if (cygnusElem && cygnusElem.textContent && cygnusElem.textContent !== '-' && cygnusElem.textContent !== 'SIGNAL MISSING') {
            // Cygnus is detected in this system
            window.updateMegashipMap('Cygnus', system, true);
        }
        
        if (orionElem && orionElem.textContent && orionElem.textContent !== '-' && orionElem.textContent !== 'SIGNAL MISSING') {
            // Orion is detected in this system
            window.updateMegashipMap('The Orion', system, true);
        }
    });
}

/**
 * Update megaship position on the map
 * @param {string} shipName - 'Cygnus' or 'The Orion'
 * @param {string} system - System name
 * @param {boolean} detected - Whether the ship is detected in this system
 */
window.updateMegashipMap = function(shipName, system, detected) {
    console.log(`updateMegashipMap: ${shipName} in ${system}, detected: ${detected}`);
    
    if (!SYSTEM_MAP[system]) {
        console.log(`System ${system} not in SYSTEM_MAP`);
        return;
    }
    
    const systemInfo = SYSTEM_MAP[system];
    let markerId = null;
    
    if (shipName === 'Cygnus' && systemInfo.cygnus) {
        markerId = systemInfo.cygnus;
    } else if (shipName === 'The Orion' && systemInfo.orion) {
        markerId = systemInfo.orion;
    }
    
    if (!markerId) {
        console.log(`No marker ID for ${shipName} in ${system}`);
        return;
    }
    
    console.log(`Marker ID: ${markerId}, detected: ${detected}`);
    
    // Hide previous position if it's different
    if (shipPositions[shipName] && shipPositions[shipName] !== markerId) {
        console.log(`Hiding previous position: ${shipPositions[shipName]}`);
        hideElement(shipPositions[shipName]);
        
        // Reset the old system marker to default orange color
        const oldSystemId = shipPositions[shipName].replace('a', '').replace('b', ''); // Remove a/b suffix
        const oldSystemMarker = document.getElementById(`M${oldSystemId}`);
        if (oldSystemMarker) {
            const paths = oldSystemMarker.querySelectorAll('path, circle');
            paths.forEach(path => {
                path.style.fill = '#FF8C00';  // Orange (default)
                path.style.stroke = '#FF8C00';
            });
        }
    }
    
    // Update ship position
    if (detected) {
        console.log(`Showing ${markerId} for ${shipName}`);
        showElement(markerId);
        shipPositions[shipName] = markerId;
        
        // Also highlight the system marker (M1-M8) in green for Cygnus, cyan for Orion
        const systemMarker = document.getElementById(systemInfo.marker);
        if (systemMarker) {
            // Find all path and circle elements within the marker group
            const paths = systemMarker.querySelectorAll('path, circle');
            paths.forEach(path => {
                if (shipName === 'Cygnus') {
                    path.style.fill = '#00FF00';  // Green for Cygnus
                    path.style.stroke = '#00FF00';
                } else {
                    path.style.fill = '#00FFFF';  // Cyan for Orion
                    path.style.stroke = '#00FFFF';
                }
            });
        }
    } else {
        console.log(`Hiding ${markerId} for ${shipName}`);
        hideElement(markerId);
        if (shipPositions[shipName] === markerId) {
            shipPositions[shipName] = null;
        }
        
        // Reset system marker color if no ships detected there
        const systemMarker = document.getElementById(systemInfo.marker);
        if (systemMarker) {
            // Check if other ship is also not there
            let otherShipDetected = false;
            if (shipName === 'Cygnus' && shipPositions['The Orion'] === systemInfo.orion) {
                otherShipDetected = true;
            } else if (shipName === 'The Orion' && shipPositions['Cygnus'] === systemInfo.cygnus) {
                otherShipDetected = true;
            }
            
            if (!otherShipDetected) {
                // Reset to orange
                const paths = systemMarker.querySelectorAll('path, circle');
                paths.forEach(path => {
                    path.style.fill = '';  // Reset to original
                    path.style.stroke = '';
                });
            }
        }
    }
};

/**
 * Hide all ship markers (C1-C8, O1-O8)
 */
function hideAllShipMarkers() {
    // Hide all Cygnus markers (C1-C8)
    const cygnusMarkers = ['r', 'aa', 'm', 'z', 'ab', 's', 'v', 'w'];
    cygnusMarkers.forEach(id => hideElement(id));
    
    // Hide all Orion markers (O1-O8)
    const orionMarkers = ['u', 'q', 'n', 'o', 'p', 't', 'x', 'y'];
    orionMarkers.forEach(id => hideElement(id));
}

/**
 * Show an SVG element by ID
 */
function showElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        console.log(`Actually showing element ${elementId}`);
        element.style.display = '';  // Use empty string for SVG elements
        element.style.visibility = 'visible';
        element.style.opacity = '1';
        // For SVG groups, also check if it has a parent g element
        if (element.tagName === 'g') {
            element.setAttribute('display', 'inline');
        }
    } else {
        console.error(`Element ${elementId} not found in SVG`);
    }
}

/**
 * Hide an SVG element by ID
 */
function hideElement(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        console.log(`Actually hiding element ${elementId}`);
        element.style.display = 'none';
        // For SVG groups, also use attribute
        if (element.tagName === 'g') {
            element.setAttribute('display', 'none');
        }
    } else {
        console.error(`Element ${elementId} not found in SVG`);
    }
}

// Load map when page is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMegashipMap);
} else {
    loadMegashipMap();
}