/**
 * Megaship Map Controller
 * Controls visibility of ship markers on the SVG map
 */

// System mapping - maps system names to data-name attributes and current IDs
// The data-name attributes (M1-M8, C1-C8, O1-O8) are stable across SVG saves
// The IDs may change when the SVG is re-saved in Illustrator
const SYSTEM_MAP = {
    'Nukamba': { index: 1, marker: 'i', cygnus: 'r', orion: 'u', dataName: 'M1', cygnusDataName: 'C1', orionDataName: 'O1' },
    'Graffias': { index: 2, marker: 'd', cygnus: 'aa', orion: 'q', dataName: 'M2', cygnusDataName: 'C2', orionDataName: 'O2' },
    'Vodyakamana': { index: 3, marker: 'g', cygnus: 'm', orion: 'n', dataName: 'M3', cygnusDataName: 'C3', orionDataName: 'O3' },
    'Marfic': { index: 4, marker: 'h', cygnus: 'z', orion: 'o', dataName: 'M4', cygnusDataName: 'C4', orionDataName: 'O4' },
    'Upaniklis': { index: 5, marker: 'f', cygnus: 'ab', orion: 'p', dataName: 'M5', cygnusDataName: 'C5', orionDataName: 'O5' },
    'HR 6524': { index: 6, marker: 'e', cygnus: 's', orion: 't', dataName: 'M6', cygnusDataName: 'C6', orionDataName: 'O6' },
    'Col 359 Sector AE-N b9-4': { index: 7, marker: 'j', cygnus: 'v', orion: 'x', dataName: 'M7', cygnusDataName: 'C7', orionDataName: 'O7' },
    'HIP 87621': { index: 8, marker: 'k', cygnus: 'w', orion: 'y', dataName: 'M8', cygnusDataName: 'C8', orionDataName: 'O8' }
};

// Track current ship positions (store system name, not marker ID)
const shipPositions = {
    'Cygnus': null,
    'The Orion': null
};

/**
 * Find element by data-name attribute
 */
function findByDataName(dataName) {
    const svg = document.querySelector('#megaship-svg-container svg');
    if (!svg) return null;
    
    const elem = svg.querySelector(`[data-name="${dataName}"]`);
    if (elem) {
        console.log(`Found element with data-name="${dataName}"`);
    }
    return elem;
}

/**
 * Get element by ID with data-name fallback
 */
function getElementSafe(elementId, dataName) {
    let elem = document.getElementById(elementId);
    if (!elem && dataName) {
        elem = findByDataName(dataName);
        if (elem) {
            console.log(`Using data-name="${dataName}" instead of id="${elementId}"`);
        }
    }
    return elem;
}

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
        // Just verify they exist using ID or data-name
        Object.entries(SYSTEM_MAP).forEach(([systemName, system]) => {
            const elem = getElementSafe(system.marker, system.dataName);
            if (elem) {
                console.log(`System marker for ${systemName} found (${system.dataName})`);
            } else {
                console.error(`System marker for ${systemName} NOT found! (tried id="${system.marker}" and data-name="${system.dataName}")`);
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
    let dataName = null;
    
    if (shipName === 'Cygnus') {
        markerId = systemInfo.cygnus;
        dataName = systemInfo.cygnusDataName;
    } else if (shipName === 'The Orion') {
        markerId = systemInfo.orion;
        dataName = systemInfo.orionDataName;
    }
    
    if (!markerId && !dataName) {
        console.log(`No marker mapping for ${shipName} in ${system}`);
        return;
    }
    
    console.log(`Looking for ${shipName} marker: id="${markerId}" or data-name="${dataName}", detected: ${detected}`);
    
    // Hide previous position if it's different system
    if (shipPositions[shipName] && shipPositions[shipName] !== system) {
        console.log(`Hiding previous position: ${shipPositions[shipName]}`);
        // Get the previous system's info
        const prevSystemInfo = SYSTEM_MAP[shipPositions[shipName]];
        if (prevSystemInfo) {
            const prevMarkerId = shipName === 'Cygnus' ? prevSystemInfo.cygnus : prevSystemInfo.orion;
            const prevDataName = shipName === 'Cygnus' ? prevSystemInfo.cygnusDataName : prevSystemInfo.orionDataName;
            hideElement(prevMarkerId, prevDataName);
        
            // Reset the old system marker to orange
            const oldSystemMarker = getElementSafe(prevSystemInfo.marker, prevSystemInfo.dataName);
            if (oldSystemMarker) {
                console.log(`Resetting ${prevSystemInfo.marker} to orange`);
                const paths = oldSystemMarker.querySelectorAll('path, circle');
                paths.forEach(path => {
                    path.style.fill = '#FF8C00';  // Orange (default)
                    path.style.stroke = '#FF8C00';
                });
            }
        }
    }
    
    // Update ship position
    if (detected) {
        console.log(`Showing marker for ${shipName}`);
        showElement(markerId, dataName);
        shipPositions[shipName] = system;  // Store system name, not marker ID
        
        // Also highlight the system marker (M1-M8) in green for Cygnus, cyan for Orion
        const systemMarker = getElementSafe(systemInfo.marker, systemInfo.dataName);
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
        console.log(`Hiding marker for ${shipName}`);
        hideElement(markerId, dataName);
        if (shipPositions[shipName] === system) {
            shipPositions[shipName] = null;
        }
        
        // Reset system marker color to orange when ship is not detected
        const systemMarker = getElementSafe(systemInfo.marker, systemInfo.dataName);
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
                    path.style.fill = '#FF8C00';  // Orange (default)
                    path.style.stroke = '#FF8C00';
                });
            }
        }
    }
};

/**
 * Hide all ship markers (C1-C8, O1-O8)
 */
function hideAllShipMarkers() {
    // Hide all Cygnus markers (C1-C8) - use both ID and data-name
    Object.values(SYSTEM_MAP).forEach(system => {
        hideElement(system.cygnus, system.cygnusDataName);
        hideElement(system.orion, system.orionDataName);
    });
}

/**
 * Show an SVG element by ID or data-name
 */
function showElement(elementId, dataName) {
    const element = getElementSafe(elementId, dataName);
    if (element) {
        console.log(`Showing element (id="${elementId}" or data-name="${dataName}")`);
        element.style.display = '';  // Use empty string for SVG elements
        element.style.visibility = 'visible';
        element.style.opacity = '1';
        // For SVG groups, also check if it has a parent g element
        if (element.tagName === 'g' || element.tagName === 'G') {
            element.setAttribute('display', 'inline');
        }
    } else {
        console.error(`Element not found (tried id="${elementId}" and data-name="${dataName}")`);
    }
}

/**
 * Hide an SVG element by ID or data-name
 */
function hideElement(elementId, dataName) {
    const element = getElementSafe(elementId, dataName);
    if (element) {
        console.log(`Hiding element (id="${elementId}" or data-name="${dataName}")`);
        element.style.display = 'none';
        // For SVG groups, also use attribute
        if (element.tagName === 'g' || element.tagName === 'G') {
            element.setAttribute('display', 'none');
        }
    } else {
        console.error(`Element not found (tried id="${elementId}" and data-name="${dataName}")`);
    }
}

// Load map when page is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadMegashipMap);
} else {
    loadMegashipMap();
}