// WebSocket Server for WB PVZ Scanner
// This script should be run on the main computer using Node.js (`node server.js`)
// The computer and the scanner phone must be on the same Wi-Fi network.

const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

// This map stores all connected clients (both PVZ interfaces and Scanners)
const clients = new Map();

wss.on('connection', (ws) => {
    console.log('New client connected.');

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            const clientId = data.code;

            // Handle PVZ registration
            if (data.type === 'register_pvz') {
                console.log(`PVZ with employee ID ${clientId} registered.`);
                ws.clientId = clientId;
                ws.clientType = 'pvz';
                clients.set(clientId, ws);
                ws.send(JSON.stringify({ type: 'pvz_registered' }));
            }
            // Handle Scanner registration
            else if (data.type === 'register_scanner') {
                const targetPvzCode = data.targetCode; // The employee ID of the PVZ to connect to
                console.log(`Scanner ${clientId} is trying to connect to PVZ ${targetPvzCode}`);
                
                ws.clientId = clientId;
                ws.clientType = 'scanner';
                ws.targetPvzCode = targetPvzCode;
                clients.set(clientId, ws);

                // Find the target PVZ and notify it about the new scanner connection
                const pvzClient = clients.get(targetPvzCode);
                if (pvzClient && pvzClient.readyState === WebSocket.OPEN) {
                    pvzClient.send(JSON.stringify({ type: 'scanner_connected', scannerCode: clientId }));
                    ws.send(JSON.stringify({ type: 'scanner_registered', message: `Successfully connected to PVZ ${targetPvzCode}` }));
                    console.log(`Scanner ${clientId} successfully connected to PVZ ${targetPvzCode}`);
                } else {
                     ws.send(JSON.stringify({ type: 'registration_failed', message: `PVZ ${targetPvzCode} not found or offline.` }));
                     console.log(`Failed to connect scanner ${clientId} to PVZ ${targetPvzCode}: PVZ not found.`);
                }
            }
            // Handle scan data from a scanner
            else if (data.type === 'scanner_send') {
                const targetPvzCode = data.targetCode;
                const scanCode = data.code;
                console.log(`Scanner sent code ${scanCode} for PVZ ${targetPvzCode}`);
                
                const pvzClient = clients.get(targetPvzCode);
                if (pvzClient && pvzClient.readyState === WebSocket.OPEN) {
                    pvzClient.send(JSON.stringify({ type: 'scan_data', code: scanCode }));
                }
            }

        } catch (e) {
            console.error('Error processing message:', e);
        }
    });

    ws.on('close', () => {
        console.log(`Client ${ws.clientId} disconnected.`);
        if (ws.clientId) {
            // If a scanner disconnects, notify the associated PVZ
            if (ws.clientType === 'scanner' && ws.targetPvzCode) {
                const pvzClient = clients.get(ws.targetPvzCode);
                if (pvzClient && pvzClient.readyState === WebSocket.OPEN) {
                    pvzClient.send(JSON.stringify({ type: 'scanner_disconnected', scannerCode: ws.clientId }));
                    console.log(`Notified PVZ ${ws.targetPvzCode} of scanner disconnection.`);
                }
            }
            clients.delete(ws.clientId);
        }
    });
});

console.log('WebSocket server started on port 8080. Make sure this computer\'s firewall allows connections on this port.');
