document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const loginModal = document.getElementById('login-modal');
    const usernameInput = document.getElementById('username-input');
    const loginButton = document.getElementById('login-button');
    const appContainer = document.getElementById('app-container');
    const displayUsername = document.getElementById('display-username');
    const myIdSpan = document.getElementById('my-id');
    const userList = document.getElementById('user-list');
    const myFilesList = document.getElementById('my-files-list');
    const addFilesInput = document.getElementById('add-files-input');
    const addFilesButton = document.getElementById('add-files-button');
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendChatButton = document.getElementById('send-chat-button');
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const searchResults = document.getElementById('search-results');
    const transfersList = document.getElementById('transfers-list');

    // --- App State ---
    let ws;
    let myId = '';
    let myUsername = '';
    let sharedFiles = []; // { file: FileObject, hash: 'md5hash' }
    const peerConnections = {}; // { userId: { pc: RTCPeerConnection, dataChannel: RTCDataChannel, activeDownloadHash: string | null } }
    const transfers = {}; // { transferId: { fileInfo, progress, status, etc. } }

    const CHUNK_SIZE = 64 * 1024; // 64KB chunks

    // --- WebRTC Configuration ---
    const rtcConfig = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
        ]
    };

    // --- Utility Functions ---
    function logMessage(html) {
        chatMessages.innerHTML += html;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function showNotification(title, options) {
        if (!("Notification" in window)) return;
        if (Notification.permission === "granted") {
            new Notification(title, options);
        } else if (Notification.permission !== "denied") {
            Notification.requestPermission().then(permission => {
                if (permission === "granted") {
                    new Notification(title, options);
                }
            });
        }
    }

    // --- WebSocket Logic ---
    function connectWebSocket() {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

        ws.onopen = () => {
            console.log('WebSocket connected. Waiting for ID from server...');
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('WS Message Received:', data);

            switch (data.type) {
                case 'your-id':
                    myId = data.id;
                    myIdSpan.textContent = myId;
                    console.log(`My assigned ID is: ${myId}`);
                    const fileMetadatas = sharedFiles.map(f => ({ name: f.file.name, size: f.file.size, hash: f.hash }));
                    ws.send(JSON.stringify({ type: 'login', name: myUsername, files: fileMetadatas }));
                    break;

                case 'update-user-list':
                    updateUserList(data.users);
                    break;

                case 'public-chat':
                    if (data.sender.id === myId) {
                        return;
                    }
                    logMessage(`<div class="mb-2"><span class="font-bold text-purple-600">${data.sender.name}:</span> ${data.message}</div>`);
                    if (document.hidden) {
                        showNotification(`New message from ${data.sender.name}`, { body: data.message, icon: '/favicon.ico' });
                    }
                    break;

                case 'search-query':
                    handleSearchQuery(data.query, data.searcherId);
                    break;
                case 'search-result':
                    displaySearchResults(data.results, data.responder);
                    break;
                case 'webrtc-offer':
                    handleOffer(data.offer, data.senderId);
                    break;
                case 'webrtc-answer':
                    handleAnswer(data.answer, data.senderId);
                    break;
                case 'webrtc-ice-candidate':
                    handleIceCandidate(data.candidate, data.senderId);
                    break;
            }
        };

        ws.onclose = () => {
            console.log('WebSocket disconnected. Attempting to reconnect...');
            logMessage('<div class="text-red-500 italic my-2">Connection lost. Reconnecting...</div>');
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            logMessage('<div class="text-red-500 italic my-2">Connection error.</div>');
        };
    }
    
    // --- UI Update Functions ---
    function updateUserList(users) {
        userList.innerHTML = '';
        users.forEach(user => {
            if (user.id === myId) return;
            const userEl = document.createElement('li');
            userEl.className = 'flex items-center justify-between p-2 rounded-md hover:bg-gray-100';
            userEl.innerHTML = `
                <div class="flex items-center">
                    <i class="fas fa-user-circle text-green-500 mr-2"></i>
                    <span>${user.name}</span>
                </div>
                <span class="text-xs text-gray-500">${user.files.length} files</span>
            `;
            userList.appendChild(userEl);
        });
    }

    function updateMyFilesList() {
        if (sharedFiles.length === 0) {
            myFilesList.innerHTML = '<p class="text-gray-500 italic">No files shared yet.</p>';
            return;
        }
        myFilesList.innerHTML = '';
        sharedFiles.forEach(({ file, hash }) => {
            const fileEl = document.createElement('div');
            fileEl.className = 'flex items-center justify-between';
            fileEl.innerHTML = `
                <span class="truncate" title="${file.name}">${file.name}</span>
                <span class="text-gray-400">${formatBytes(file.size)}</span>
            `;
            myFilesList.appendChild(fileEl);
        });
        if (ws && ws.readyState === ws.OPEN && myId) {
            const fileMetadatas = sharedFiles.map(f => ({ name: f.file.name, size: f.file.size, hash: f.hash }));
            ws.send(JSON.stringify({ type: 'login', name: myUsername, files: fileMetadatas }));
        }
    }

    function displaySearchResults(results, responder) {
        if (results.length === 0) return;
        const headerId = `results-from-${responder.id}`;
        let userHeader = document.getElementById(headerId);
        if (!userHeader) {
            userHeader = document.createElement('div');
            userHeader.id = headerId;
            userHeader.innerHTML = `<h3 class="font-semibold mt-2 text-gray-700">Results from ${responder.name}:</h3>`;
            searchResults.appendChild(userHeader);
        }
        results.forEach(file => {
            const resultEl = document.createElement('div');
            resultEl.className = 'flex items-center justify-between p-2 hover:bg-indigo-50 rounded-md';
            resultEl.innerHTML = `
                <div>
                    <div class="font-medium">${file.name}</div>
                    <div class="text-sm text-gray-500">${formatBytes(file.size)}</div>
                </div>
                <button class="download-button bg-green-500 text-white px-3 py-1 rounded-md text-sm hover:bg-green-600">
                    <i class="fas fa-download"></i>
                </button>
            `;
            resultEl.querySelector('.download-button').onclick = () => {
                startDownload(responder.id, file);
            };
            userHeader.appendChild(resultEl);
        });
    }

    function updateTransferProgress(transferId, receivedSize) {
        const transfer = transfers[transferId];
        if (!transfer) return;
        transfer.receivedSize = receivedSize;
        const progress = Math.round((receivedSize / transfer.fileInfo.size) * 100);
        const progressEl = document.getElementById(`progress-${transferId}`);
        if (progressEl) {
            progressEl.value = progress;
            progressEl.nextElementSibling.textContent = `${progress}% (${formatBytes(receivedSize)} / ${formatBytes(transfer.fileInfo.size)})`;
        }
    }

    // --- Core P2P & File Transfer Logic ---

    async function startDownload(targetId, fileInfo) {
        logMessage(`<div class="text-blue-500 italic my-2">Requesting file '${fileInfo.name}'...</div>`);
        
        const peer = getOrCreatePeerConnection(targetId, true); // true = I am the initiator
        
        const sendRequest = () => {
            console.log(`Data channel to ${targetId} is open. Sending file request.`);
            peer.dataChannel.send(JSON.stringify({ type: 'request-file', fileInfo }));
        };

        if (peer.dataChannel && peer.dataChannel.readyState === 'open') {
            sendRequest();
        } else {
            peer.dataChannel.onopen = sendRequest;
        }
    }

    function getOrCreatePeerConnection(targetId, isInitiator = false) {
        let peer = peerConnections[targetId];
        if (peer && peer.pc.connectionState !== 'closed' && peer.pc.connectionState !== 'failed') {
            console.log(`Reusing existing connection to ${targetId}`);
            return peer;
        }

        console.log(`Creating new P2P connection to ${targetId}`);
        const pc = new RTCPeerConnection(rtcConfig);
        peer = { pc: pc, activeDownloadHash: null };
        peerConnections[targetId] = peer;

        pc.onconnectionstatechange = () => {
            console.log(`Connection state for ${targetId} changed to: ${pc.connectionState}`);
            if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
                logMessage(`<div class="text-red-500 italic my-2">P2P connection to user ${targetId} lost.</div>`);
                if (peerConnections[targetId]) {
                    peerConnections[targetId].pc.close();
                    delete peerConnections[targetId];
                }
            }
        };

        pc.onicecandidate = event => {
            if (event.candidate) {
                ws.send(JSON.stringify({ type: 'webrtc-ice-candidate', candidate: event.candidate, targetId: targetId }));
            }
        };

        if (isInitiator) {
            console.log("I am the initiator, creating data channel.");
            peer.dataChannel = pc.createDataChannel('file-transfer');
            setupDataChannel(peer.dataChannel, targetId);
            
            pc.createOffer()
                .then(offer => pc.setLocalDescription(offer))
                .then(() => {
                    ws.send(JSON.stringify({ type: 'webrtc-offer', offer: pc.localDescription, targetId: targetId }));
                });

        } else { // I am the receiver
            pc.ondatachannel = event => {
                console.log(`Data channel '${event.channel.label}' received from ${targetId}`);
                peer.dataChannel = event.channel;
                setupDataChannel(event.channel, targetId);
            };
        }

        return peer;
    }

    function setupDataChannel(channel, peerId) {
        channel.binaryType = 'arraybuffer';
        channel.onopen = () => console.log(`Data channel to ${peerId} is now open.`);
        channel.onclose = () => console.log(`Data channel to ${peerId} is now closed.`);
        channel.onerror = error => console.error(`Data channel error with ${peerId}:`, error);

        channel.onmessage = event => {
            if (typeof event.data === 'string') {
                const msg = JSON.parse(event.data);
                console.log(`P2P text message from ${peerId}:`, msg);
                switch(msg.type) {
                    case 'request-file':
                        handleFileRequest(msg.fileInfo, peerId);
                        break;
                    case 'start-transfer':
                        createTransferUI(msg.fileInfo, peerId);
                        if (peerConnections[peerId]) {
                            peerConnections[peerId].activeDownloadHash = msg.fileInfo.hash;
                        }
                        channel.send(JSON.stringify({ type: 'ack-start-transfer', hash: msg.fileInfo.hash }));
                        break;
                    case 'ack-start-transfer':
                        startSendingFile(msg.hash, peerId);
                        break;
                }
            } else { // Binary chunk
                const peer = peerConnections[peerId];
                if (peer && peer.activeDownloadHash) {
                    const transferId = peer.activeDownloadHash;
                    const transfer = transfers[transferId];
                    if (transfer && transfer.status === 'receiving') {
                        transfer.chunks.push(event.data);
                        transfer.receivedSize += event.data.byteLength;
                        updateTransferProgress(transferId, transfer.receivedSize);

                        if (transfer.receivedSize >= transfer.fileInfo.size) {
                            const fileBlob = new Blob(transfer.chunks, { type: transfer.fileInfo.type });
                            verifyAndSaveFile(fileBlob, transfer.fileInfo);
                            transfer.status = 'completed';
                            updateTransferUI(transferId, 'Completed', 'bg-green-100');
                            peer.activeDownloadHash = null;
                        }
                    }
                }
            }
        };
    }
    
    async function handleOffer(offer, senderId) {
        const peer = getOrCreatePeerConnection(senderId, false); // false = I am the receiver
        const pc = peer.pc;

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: 'webrtc-answer', answer: pc.localDescription, targetId: senderId }));
    }

    async function handleAnswer(answer, senderId) {
        const peer = peerConnections[senderId];
        if (peer) {
            await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        }
    }

    async function handleIceCandidate(candidate, senderId) {
        try {
            const peer = peerConnections[senderId];
            if (peer && peer.pc.remoteDescription) {
                await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
            }
        } catch (e) {
            console.error('Error adding received ICE candidate', e);
        }
    }
    
    // --- File Handling Logic ---

    function handleFileRequest(fileInfo, requesterId) {
        const fileToSend = sharedFiles.find(f => f.hash === fileInfo.hash);
        if (!fileToSend) {
            console.error(`File with hash ${fileInfo.hash} not found.`);
            return;
        }
        logMessage(`<div class="text-gray-600 italic my-2">Peer requested '${fileToSend.file.name}'. Awaiting confirmation...</div>`);
        const { dataChannel } = peerConnections[requesterId];
        dataChannel.send(JSON.stringify({ type: 'start-transfer', fileInfo: fileInfo }));
    }

    function startSendingFile(fileHash, requesterId) {
        const fileToSend = sharedFiles.find(f => f.hash === fileHash);
        if (!fileToSend) {
            console.error(`File with hash ${fileHash} not found for sending.`);
            return;
        }

        logMessage(`<div class="text-green-600 italic my-2">Sending file '${fileToSend.file.name}'...</div>`);
        const { dataChannel } = peerConnections[requesterId];
        const file = fileToSend.file;
        let offset = 0;

        function readAndSend() {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            const reader = new FileReader();
            reader.onload = (e) => {
                if (dataChannel.readyState !== 'open') {
                    console.error('Data channel closed before file could be fully sent.');
                    return;
                }
                try {
                    dataChannel.send(e.target.result);
                    offset += e.target.result.byteLength;
                    if (offset < file.size) {
                        if (dataChannel.bufferedAmount < CHUNK_SIZE * 16) {
                            readAndSend();
                        } else {
                            dataChannel.onbufferedamountlow = () => {
                                dataChannel.onbufferedamountlow = null;
                                readAndSend();
                            };
                        }
                    } else {
                        console.log(`Finished sending ${file.name}`);
                    }
                } catch (error) {
                    console.error("Failed to send data chunk:", error);
                }
            };
            reader.readAsArrayBuffer(slice);
        }
        readAndSend();
    }

    function verifyAndSaveFile(blob, fileInfo) {
        const transferId = fileInfo.hash;
        updateTransferUI(transferId, 'Verifying hash...', 'bg-yellow-100');
        
        const reader = new FileReader();
        reader.onload = (e) => {
            const receivedHash = SparkMD5.ArrayBuffer.hash(e.target.result);
            if (receivedHash === fileInfo.hash) {
                logMessage(`<div class="text-green-600 italic my-2">File '${fileInfo.name}' verified successfully!</div>`);
                updateTransferUI(transferId, 'Download complete!', 'bg-green-100');
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileInfo.name;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
            } else {
                logMessage(`<div class="text-red-500 italic my-2">File integrity check failed for '${fileInfo.name}'. Please try again.</div>`);
                updateTransferUI(transferId, 'Verification Failed!', 'bg-red-100');
            }
        };
        reader.readAsArrayBuffer(blob);
    }

    function createTransferUI(fileInfo, senderId) {
        const transferId = fileInfo.hash;
        if (document.getElementById(`transfer-${transferId}`)) {
            updateTransferProgress(transferId, 0);
            updateTransferUI(transferId, `0% (0 Bytes / ${formatBytes(fileInfo.size)})`, 'bg-gray-50');
        } else {
             if (transfersList.querySelector('p')) {
                transfersList.innerHTML = '';
            }
            const transferEl = document.createElement('div');
            transferEl.id = `transfer-${transferId}`;
            transferEl.className = 'p-3 bg-gray-50 rounded-lg text-sm';
            transferEl.innerHTML = `
                <div class="font-bold truncate">${fileInfo.name}</div>
                <div class="text-gray-500 text-xs mb-1">From: ${senderId}</div>
                <progress id="progress-${transferId}" value="0" max="100" class="w-full h-2 rounded-md"></progress>
                <div id="status-${transferId}" class="text-xs text-gray-600 mt-1">0% (0 Bytes / ${formatBytes(fileInfo.size)})</div>
            `;
            transfersList.prepend(transferEl);
        }

        transfers[transferId] = {
            fileInfo,
            senderId,
            status: 'receiving',
            chunks: [],
            receivedSize: 0
        };
    }
    
    function updateTransferUI(transferId, statusText, bgColorClass) {
        const statusEl = document.getElementById(`status-${transferId}`);
        if (statusEl) {
            statusEl.textContent = statusText;
            if (bgColorClass) {
                statusEl.parentElement.className = `p-3 rounded-lg text-sm ${bgColorClass}`;
            }
        }
    }

    // --- Event Listeners ---
    loginButton.addEventListener('click', () => {
        const name = usernameInput.value.trim();
        if (name) {
            myUsername = name;
            displayUsername.textContent = myUsername;
            loginModal.classList.add('hidden');
            appContainer.classList.remove('hidden');
            appContainer.classList.add('flex');
            connectWebSocket();
            Notification.requestPermission();
        }
    });
    usernameInput.addEventListener('keyup', e => { if (e.key === 'Enter') loginButton.click(); });

    addFilesButton.addEventListener('click', () => addFilesInput.click());
    addFilesInput.addEventListener('change', (e) => {
        const newFiles = Array.from(e.target.files);
        logMessage(`<div class="text-blue-500 italic my-2">Calculating hashes for ${newFiles.length} file(s)...</div>`);
        
        let processedCount = 0;
        newFiles.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const hash = SparkMD5.ArrayBuffer.hash(e.target.result);
                sharedFiles.push({ file, hash });
                processedCount++;
                if (processedCount === newFiles.length) {
                    logMessage(`<div class="text-green-600 italic my-2">Finished hashing. Files are now shared.</div>`);
                    updateMyFilesList();
                }
            };
            reader.onerror = () => {
                logMessage(`<div class="text-red-500 italic my-2">Error reading file ${file.name}.</div>`);
                processedCount++;
            }
            reader.readAsArrayBuffer(file);
        });
    });
    
    sendChatButton.addEventListener('click', () => {
        const message = chatInput.value.trim();
        if (message && ws && ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({ type: 'public-chat', message }));
            logMessage(`<div class="mb-2 text-right"><span class="font-bold text-blue-600">You:</span> ${message}</div>`);
            chatInput.value = '';
        }
    });
    chatInput.addEventListener('keyup', e => { if (e.key === 'Enter') sendChatButton.click(); });

    searchButton.addEventListener('click', () => {
        const query = searchInput.value.trim();
        if (query && ws && ws.readyState === ws.OPEN) {
            searchResults.innerHTML = '<p class="text-gray-500 italic">Searching the network...</p>';
            ws.send(JSON.stringify({ type: 'search', query }));
        }
    });
    searchInput.addEventListener('keyup', e => { if (e.key === 'Enter') searchButton.click(); });

    // --- Search Handling ---
    function handleSearchQuery(query, searcherId) {
        const lowerCaseQuery = query.toLowerCase();
        const results = sharedFiles
            .filter(({ file }) => file.name.toLowerCase().includes(lowerCaseQuery))
            .map(({ file, hash }) => ({ name: file.name, size: file.size, hash: hash }));

        if (results.length > 0) {
            ws.send(JSON.stringify({
                type: 'search-result',
                results: results,
                searcherId: searcherId
            }));
        }
    }
});
