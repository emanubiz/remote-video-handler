const clientsService = require('../services/clients.service'); 

module.exports = (io, socket) => {
    socket.on('registerClient', ({ suggestedId, nickname }) => {
        let clientIdToRegister = suggestedId;
        let finalNickname = nickname;
    
        // Verifica se l'ID è nullo/vuoto o già connesso
        if (!suggestedId || clientsService.isClientIdAlreadyConnected(suggestedId)) {
            clientIdToRegister = `client-${Math.random().toString(36).substring(2, 11)}`;
            console.warn(`[SERVER] ID suggerito "${suggestedId}" non valido o già in uso. Generato nuovo ID: ${clientIdToRegister}`);
        }
    
        // Verifica se il nickname è già in uso da un client connesso
        if (clientsService.isNicknameInUse(finalNickname)) {
            const originalNickname = finalNickname;
            finalNickname = `${finalNickname}-${Math.floor(Math.random() * 1000)}`;
            console.warn(`[SERVER] Nickname "${originalNickname}" già in uso. Nuovo nickname: ${finalNickname}`);
            socket.emit('nicknameUpdated', finalNickname); // Notifica il client del nuovo nickname
        }
    
        const clientCurrentState = clientsService.registerClient(clientIdToRegister, socket.id, finalNickname);
        io.emit('clientListUpdate', clientsService.getClientsListForApi());
        
        socket.emit('videoCommand', {
            command: 'updateState',
            clientId: clientIdToRegister,
            nickname: finalNickname, // Invia anche il nickname
            videoId: clientCurrentState.currentVideoId,
            videoFilename: clientCurrentState.currentVideoFilename,
            opacity: clientCurrentState.opacity,
            videoDownloadStatus: clientCurrentState.videoDownloadStatus,
            downloadProgress: clientCurrentState.downloadProgress,
            clientVideoStatus: clientCurrentState.clientVideoStatus
        });
        console.log(`[SERVER] Inviato stato iniziale a ${clientIdToRegister} (${finalNickname}). Video: ${clientCurrentState.currentVideoFilename || 'Nessuno'}`);
    });
    socket.on('clientStatusUpdate', (clientId, statusUpdate) => {
        clientsService.updateClientStatus(clientId, statusUpdate);
        io.emit('clientListUpdate', clientsService.getClientsListForApi());
    });

    socket.on('requestAdminStateSync', () => {
        console.log(`[SERVER] Ricevuta richiesta di sync dallo socket ${socket.id}. Invio stato aggiornato.`);
        socket.emit('clientListUpdate', clientsService.getClientsListForApi());
    });

    socket.on('requestVideoList', () => {
        console.log(`[SERVER] Ricevuta richiesta lista video da socket ${socket.id}.`);
        const videoList = clientsService.getAvailableVideos();
        socket.emit('videoListUpdate', videoList);
    });

    socket.on('adminCommand', ({ targetClientId, command, videoId, videoFilename, opacity }) => {
        console.log(`[SERVER] Comando admin ricevuto: "${command}" per ${targetClientId || 'tutti i client'} | Video: ${videoId} | Opacità: ${opacity}`);

        const updatedClients = clientsService.handleAdminCommand(targetClientId, command, videoId, opacity);

        updatedClients.forEach(client => {
            if (io.sockets.sockets.has(client.socketId)) {
                io.to(client.socketId).emit('videoCommand', {
                    command,
                    videoId: client.currentVideoId,
                    videoFilename: client.currentVideoFilename,
                    opacity: client.opacity,
                    clientVideoStatus: client.clientVideoStatus // Invia lo stato del video per coerenza
                });
            } else {
                console.warn(`[SERVER] Socket non trovato per client ${client.clientId} durante comando ${command}`);
            }
        });
        
        io.emit('clientListUpdate', clientsService.getClientsListForApi());
    });

    socket.on('disconnect', () => {
        const disconnectedClient = clientsService.disconnectClient(socket.id);
        if (disconnectedClient) {
            console.log(`[SERVER] Client disconnesso: ${disconnectedClient.clientId}`);
            io.emit('clientListUpdate', clientsService.getClientsListForApi());
        }
    });
};