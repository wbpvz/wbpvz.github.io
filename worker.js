const ports = new Set();
let ws = null;
let connectionState = 'closed';
let scannerState = { connected: false, scannerCode: null };
const broadcast = (message) => {
    ports.forEach(port => {
        port.postMessage(JSON.parse(JSON.stringify(message)));
    });
};
const initWebSocket = () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }
    const serverIP = '192.168.1.12';
    ws = new WebSocket(`ws://${serverIP}:8080`);
    connectionState = 'connecting';
    ws.onopen = () => {
        connectionState = 'open';
        broadcast({ type: 'CONNECTION_STATUS', status: 'open' });
    };
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'scanner_connected') {
                scannerState.connected = true;
                scannerState.scannerCode = data.scannerCode;
                broadcast({ type: 'SCANNER_STATUS', ...scannerState });
            } else if (data.type === 'scanner_disconnected') {
                scannerState.connected = false;
                scannerState.scannerCode = null;
                broadcast({ type: 'SCANNER_STATUS', ...scannerState });
            } else {
                broadcast(data);
            }
        } catch (e) {
            console.error("Error parsing message in worker:", e);
        }
    };
    ws.onclose = () => {
        ws = null;
        connectionState = 'closed';
        scannerState = { connected: false, scannerCode: null };
        broadcast({ type: 'CONNECTION_STATUS', status: 'closed' });
        broadcast({ type: 'SCANNER_STATUS', connected: false, scannerCode: null });
    };
    ws.onerror = (error) => {
        console.error('WebSocket Error in Worker:', error);
        connectionState = 'error';
        broadcast({ type: 'CONNECTION_STATUS', status: 'error' });
    };
};
self.onconnect = (e) => {
    const port = e.ports[0];
    ports.add(port);
    port.onmessage = (event) => {
        const message = event.data;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
            initWebSocket();
        }
        if (message.type === 'REGISTER_DEVICE') {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'register', code: message.deviceCode }));
            }
        } else if (message.type === 'GET_STATUS') {
            port.postMessage({ type: 'CONNECTION_STATUS', status: connectionState });
            port.postMessage({ type: 'SCANNER_STATUS', ...scannerState });
        }
    };
    port.start();
};