/**
 * Map Animation System for Megaship Movement Tracker
 * Creates animated radar sweeps on the SVG map for various events
 */

// Animation Configuration Constants
const ANIMATION_CONFIG = {
    // Commander entering system (cyan-blue radar sweep)
    COMMANDER: {
        color: '#00c8ffff',           // Cyan-blue
        baseOpacity: 0.35,          // 35% max opacity
        innerRadius: 10,            // Inner circle radius
        outerRadius: 60,            // Outer circle radius
        donutStrength: 0.3,         // Inner falloff (0-1, 0=solid, 1=hollow)
        animationDuration: 2000,    // 2 seconds
        repetitions: 3,             // Single sweep
        delayBetween: 0,            // No delay (single sweep)
        fadeOutStart: 0.7           // Start fading at 70% of animation
    },
    
    // Ship detected (green double pulse)
    DETECTED: {
        color: '#00FF00',           // Green
        baseOpacity: 0.35,          // 35% max opacity
        innerRadius: 8,             // Smaller inner radius
        outerRadius: 45,            // Smaller outer radius
        donutStrength: 0.5,         // Thinner donut
        animationDuration: 1500,    // 1.5 seconds
        repetitions: 5,             // Double pulse
        delayBetween: 200,          // 200ms between pulses
        fadeOutStart: 0.6           // Start fading at 60% of animation
    },
    
    // Signal missing (yellow pulse)
    MISSING: {
        color: '#FFD700',           // Yellow/Gold
        baseOpacity: 0.35,          // 35% max opacity
        innerRadius: 12,            // Medium inner radius
        outerRadius: 50,            // Medium outer radius
        donutStrength: 0.4,         // Medium donut
        animationDuration: 1800,    // 1.8 seconds
        repetitions: 3,             // Single pulse
        delayBetween: 0,            // No delay
        fadeOutStart: 0.65          // Start fading at 65% of animation
    }
};

// System to marker mapping
// M1-M8 correspond to the 8 systems in order
const SYSTEM_TO_MARKER_NUMBER = {
    'Nukamba': 1,      // M1
    'Graffias': 2,     // M2
    'Vodyakamana': 3,  // M3
    'Marfic': 4,       // M4
    'Upaniklis': 5,    // M5
    'HR 6524': 6,      // M6
    'Col 359 Sector AE-N b9-4': 7,  // M7
    'HIP 87621': 8     // M8
};

// Current ID mapping (may change when SVG is re-saved)
const SYSTEM_TO_MARKER = {
    'Nukamba': 'i',      // M1
    'Graffias': 'd',     // M2
    'Vodyakamana': 'g',  // M3
    'Marfic': 'h',       // M4
    'Upaniklis': 'f',    // M5
    'HR 6524': 'e',      // M6
    'Col 359 Sector AE-N b9-4': 'j',  // M7
    'HIP 87621': 'k'     // M8
};

// Track active animations
const activeAnimations = new Map();

/**
 * Sanitize string for use as DOM ID
 */
function sanitizeId(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Find element by data-name attribute
 */
function findElementByDataName(dataName) {
    const svg = document.querySelector('#megaship-svg-container svg');
    if (!svg) return null;
    
    return svg.querySelector(`[data-name="${dataName}"]`);
}

/**
 * Get center point of an SVG element
 */
function getElementCenter(elementId) {
    let elem = document.getElementById(elementId);
    
    // If not found by ID, try to find by data-name
    if (!elem && elementId) {
        // Try to map the ID to a marker number
        const markerNum = Object.values(SYSTEM_TO_MARKER).indexOf(elementId);
        if (markerNum >= 0) {
            const systemName = Object.keys(SYSTEM_TO_MARKER)[markerNum];
            const dataNameNum = SYSTEM_TO_MARKER_NUMBER[systemName];
            if (dataNameNum) {
                elem = findElementByDataName(`M${dataNameNum}`);
                if (elem) {
                    console.log(`Found element by data-name="M${dataNameNum}" for ${systemName}`);
                }
            }
        }
    }
    
    if (!elem) {
        console.error(`Element ${elementId} not found`);
        return null;
    }
    
    try {
        const bbox = elem.getBBox();
        return {
            x: bbox.x + bbox.width / 2,
            y: bbox.y + bbox.height / 2
        };
    } catch (e) {
        console.error(`Could not get bbox for ${elementId}:`, e);
        return null;
    }
}

/**
 * Create a gradient definition for the donut effect
 */
function createRadialGradient(id, color, donutStrength) {
    const svg = document.querySelector('#megaship-svg-container svg');
    if (!svg) return null;
    
    // Check if defs exists, create if not
    let defs = svg.querySelector('defs');
    if (!defs) {
        defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
        svg.insertBefore(defs, svg.firstChild);
    }
    
    // Remove existing gradient if present
    const existing = defs.querySelector(`#${id}`);
    if (existing) {
        existing.remove();
    }
    
    // Create radial gradient
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient');
    gradient.setAttribute('id', id);
    
    // Inner transparent area (donut hole)
    const stop1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', color);
    stop1.setAttribute('stop-opacity', '0');
    
    // Inner falloff start
    const stop2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop2.setAttribute('offset', `${donutStrength * 100}%`);
    stop2.setAttribute('stop-color', color);
    stop2.setAttribute('stop-opacity', '0');
    
    // Peak opacity
    const stop3 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop3.setAttribute('offset', `${50 + donutStrength * 25}%`);
    stop3.setAttribute('stop-color', color);
    stop3.setAttribute('stop-opacity', '1');
    
    // Outer falloff start
    const stop4 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop4.setAttribute('offset', '85%');
    stop4.setAttribute('stop-color', color);
    stop4.setAttribute('stop-opacity', '0.5');
    
    // Outer edge
    const stop5 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
    stop5.setAttribute('offset', '100%');
    stop5.setAttribute('stop-color', color);
    stop5.setAttribute('stop-opacity', '0');
    
    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    gradient.appendChild(stop3);
    gradient.appendChild(stop4);
    gradient.appendChild(stop5);
    
    defs.appendChild(gradient);
    
    return gradient;
}

/**
 * Animate a radar sweep at the given position
 */
function animateRadarSweep(center, config, animationId) {
    const svg = document.querySelector('#megaship-svg-container svg');
    if (!svg || !center) return;
    
    // Create gradient for this animation
    const gradientId = `gradient-${animationId}`;
    createRadialGradient(gradientId, config.color, config.donutStrength);
    
    // Create circle element
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', center.x);
    circle.setAttribute('cy', center.y);
    circle.setAttribute('r', config.innerRadius);
    circle.setAttribute('fill', `url(#${gradientId})`);
    circle.setAttribute('opacity', '0');
    circle.style.pointerEvents = 'none';
    
    // Add to SVG
    svg.appendChild(circle);
    
    // Animate
    const startTime = Date.now();
    const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / config.animationDuration, 1);
        
        if (progress >= 1) {
            // Animation complete, remove elements
            circle.remove();
            const gradient = document.querySelector(`#${gradientId}`);
            if (gradient) gradient.remove();
            return;
        }
        
        // Calculate current radius (grow from inner to outer)
        const currentRadius = config.innerRadius + (config.outerRadius - config.innerRadius) * progress;
        circle.setAttribute('r', currentRadius);
        
        // Calculate opacity
        let opacity;
        if (progress < config.fadeOutStart) {
            // Fade in phase
            opacity = (progress / config.fadeOutStart) * config.baseOpacity;
        } else {
            // Fade out phase
            const fadeProgress = (progress - config.fadeOutStart) / (1 - config.fadeOutStart);
            opacity = config.baseOpacity * (1 - fadeProgress);
        }
        
        circle.setAttribute('opacity', opacity);
        
        requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
}

/**
 * Trigger animation for a system
 */
function triggerSystemAnimation(systemName, animationType) {
    // First try the direct ID mapping
    let markerId = SYSTEM_TO_MARKER[systemName];
    let center = null;
    
    if (markerId) {
        center = getElementCenter(markerId);
    }
    
    // If that didn't work, try finding by data-name
    if (!center) {
        const markerNum = SYSTEM_TO_MARKER_NUMBER[systemName];
        if (markerNum) {
            const elem = findElementByDataName(`M${markerNum}`);
            if (elem) {
                try {
                    const bbox = elem.getBBox();
                    center = {
                        x: bbox.x + bbox.width / 2,
                        y: bbox.y + bbox.height / 2
                    };
                    console.log(`Found ${systemName} by data-name="M${markerNum}"`);
                } catch (e) {
                    console.error(`Could not get bbox for M${markerNum}:`, e);
                }
            }
        }
    }
    
    if (!center) {
        console.log(`Could not find marker for system ${systemName}`);
        return;
    }
    
    const config = ANIMATION_CONFIG[animationType];
    if (!config) {
        console.error(`Unknown animation type: ${animationType}`);
        return;
    }
    
    console.log(`🎯 Animating ${animationType} at ${systemName} (${markerId})`);
    
    // Create animations based on repetitions
    for (let i = 0; i < config.repetitions; i++) {
        setTimeout(() => {
            const animationId = `${sanitizeId(systemName)}-${animationType}-${Date.now()}-${i}`;
            animateRadarSweep(center, config, animationId);
        }, i * (config.animationDuration + config.delayBetween));
    }
}

/**
 * Handle commander entering system
 */
window.animateCommanderEntry = function(systemName) {
    triggerSystemAnimation(systemName, 'COMMANDER');
};

/**
 * Handle ship detected
 */
window.animateShipDetected = function(systemName) {
    triggerSystemAnimation(systemName, 'DETECTED');
};

/**
 * Handle signal missing
 */
window.animateSignalMissing = function(systemName) {
    triggerSystemAnimation(systemName, 'MISSING');
};

// Log that animations are ready
console.log('✅ Map animations loaded and ready');