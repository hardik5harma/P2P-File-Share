// server.js
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

// Serve static files (HTML, CSS, JS) from the 'public' directory.
app.use(express.static(path.join(__dirname, 'public')));

// --- WebSocket Server for Signaling ---
const wss = new WebSocketServer({ server });

const users = new Map();

function broadcast(message) {
    wss.clients.forEach(client => {
        if (client.readyState === client.OPEN) {
            client.send(JSON.stringify(message));
        }
    });
}

function sendToUser(userId, message) {
    const userSocket = Array.from(wss.clients).find(client => client.id === userId);
    if (userSocket && userSocket.readyState === userSocket.OPEN) {
        userSocket.send(JSON.stringify(message));
    }
}

wss.on('connection', (ws) => {
    console.log('Client connected');

    ws.id = `user_${Date.now()}`;
    ws.send(JSON.stringify({ type: 'your-id', id: ws.id }));

    ws.on('message', (message) => {
        let data;
        try {
            data = JSON.parse(message);
        } catch (e) {
            console.error('Invalid JSON received:', message);
            return;
        }

        console.log(`Received message of type: ${data.type} from ${ws.id}`);

        switch (data.type) {
            case 'login':
                users.set(ws.id, {
                    id: ws.id,
                    name: data.name,
                    files: data.files
                });
                broadcast({
                    type: 'update-user-list',
                    users: Array.from(users.values())
                });
                break;

            case 'search':
                wss.clients.forEach(client => {
                    if (client !== ws && client.readyState === client.OPEN) {
                        client.send(JSON.stringify({
                            type: 'search-query',
                            query: data.query,
                            searcherId: ws.id
                        }));
                    }
                });
                break;
            
            case 'search-result':
                sendToUser(data.searcherId, {
                    type: 'search-result',
                    results: data.results,
                    responder: users.get(ws.id)
                });
                break;

            case 'webrtc-offer':
                sendToUser(data.targetId, {
                    type: 'webrtc-offer',
                    offer: data.offer,
                    senderId: ws.id
                });
                break;

            case 'webrtc-answer':
                sendToUser(data.targetId, {
                    type: 'webrtc-answer',
                    answer: data.answer,
                    senderId: ws.id
                });
                break;

            case 'webrtc-ice-candidate':
                sendToUser(data.targetId, {
                    type: 'webrtc-ice-candidate',
                    candidate: data.candidate,
                    senderId: ws.id
                });
                break;
            
            case 'public-chat':
                broadcast({
                    type: 'public-chat',
                    message: data.message,
                    sender: users.get(ws.id)
                });
                break;
        }
    });

    ws.on('close', () => {
        console.log(`Client ${ws.id} disconnected`);
        users.delete(ws.id);
        broadcast({
            type: 'update-user-list',
            users: Array.from(users.values())
        });
    });

    ws.on('error', (error) => {
        console.error(`WebSocket error for client ${ws.id}:`, error);
    });
});

// --- Start the Server ---
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log('Open your browser and navigate to this address to start the app.');
});
