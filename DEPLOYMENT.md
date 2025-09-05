# Deployment Guide

## Environment Variables

### SERVER=TRUE
When set, the application runs in server mode:
- WebSocket server binds to `0.0.0.0` (all interfaces) instead of `localhost`
- Allows connections from external clients/Docker containers
- Required for Docker/Appliku deployments

## Local Development
```bash
# Run locally (binds to localhost:8042)
python find_cptn.py
```

## Server Deployment
```bash
# Run on server (binds to 0.0.0.0:8042)
export SERVER=TRUE
python find_cptn.py

# Or in one line
SERVER=TRUE python find_cptn.py
```

## Docker Deployment
Add to your Dockerfile or docker-compose.yml:
```yaml
environment:
  - SERVER=TRUE
```

## Testing WebSocket Connection
```bash
# Test from local machine
python test_websocket.py

# Test on server
SERVER=TRUE python test_websocket.py
```

## Ports
- **8042**: WebSocket/HTTP server (configurable in find_cptn.py)

## Files
- `find_cptn.py` - Main entry point, starts EDDN listener and web server
- `eddn_listener.py` - Connects to EDDN network, tracks megaships
- `webserver.py` - Serves web interface, handles WebSocket connections
- `test_websocket.py` - Tests WebSocket connectivity