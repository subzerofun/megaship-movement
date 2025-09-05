# Megaship Movement Tracker - Drunken Cpt. Finder

Real-time tracker for Elite Dangerous megaships "Cygnus" and "The Orion" using EDDN data.

## Installation

```bash
pip install -r requirements.txt
```

## Running

```bash
python find_cptn.py
```

Then open http://localhost:8042 in your browser.

## Features

- Monitors EDDN for FSSSignalDiscovered events
- Tracks current commander location via FSDJump/Location events  
- Real-time WebSocket updates
- Elite Dangerous styled interface (black/orange)
- Split view: Main status (2/3) and Event log (1/3)

## Troubleshooting

If no data appears:
1. Check console for "Connected to EDDN relay" message
2. Verify WebSocket connection in browser console
3. EDDN may take time to show relevant events
4. Try jumping to a new system in Elite Dangerous

## How It Works

1. Connects to EDDN relay (tcp://eddn.edcd.io:9500)
2. Filters for FSSSignalDiscovered events containing "Cygnus" or "The Orion"
3. Tracks your current system from FSDJump/Location events
4. Updates web interface in real-time via WebSocket