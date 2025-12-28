const clientsService = require('../services/clients.service'); 

module.exports = (io, socket) => {
    socket.on('registerClient', (clientId) => {
        const clientCurrentState = clientsService.registerClient(clientId, socket.id);
        io.emit('clientListUpdate', clientsService.getClientsListForApi());
        
        socket.emit('videoCommand', {
            command: 'updateState',
            videoId: clientCurrentState.currentVideoId,
            videoFilename: clientCurrentState.currentVideoFilename,
            opacity: clientCurrentState.opacity,
            videoDownloadStatus: clientCurrentState.videoDownloadStatus,
            downloadProgress: clientCurrentState.downloadProgress
        });
        console.log(`[SERVER] Inviato stato iniziale a ${clientId}. Video: ${clientCurrentState.currentVideoFilename || 'Nessuno'}`);
    });

    socket.on('clientStatusUpdate', (clientId, statusUpdate) => {
        clientsService.updateClientStatus(clientId, statusUpdate);
        io.emit('clientListUpdate', clientsService.getClientsListForApi());
    });

    // Evento per forzare la risincronizzazione su richiesta dell'admin
    socket.on('requestAdminStateSync', () => {
        console.log(`[SERVER] Ricevuta richiesta di sync dallo socket ${socket.id}. Invio stato aggiornato.`);
        socket.emit('clientListUpdate', clientsService.getClientsListForApi());
    });

    socket.on('adminCommand', ({ targetClientId, command, videoId, videoFilename, opacity }) => {
        console.log(`[SERVER] Comando admin ricevuto: "${command}" per ${targetClientId || 'tutti i client'} | Video: ${videoId} | Opacità: ${opacity}`);

        const updatedClients = clientsService.handleAdminCommand(targetClientId, command, videoId, opacity);

        // Invia i comandi ai socket specifici
        updatedClients.forEach(client => {
            if (io.sockets.sockets.has(client.socketId)) {
                io.to(client.socketId).emit('videoCommand', {
                    command,
                    videoId: client.currentVideoId, // Usa il videoId aggiornato dal servizio
                    videoFilename: client.currentVideoFilename, // Usa il filename aggiornato dal servizio
                    opacity: client.opacity // Usa l'opacità aggiornata dal servizio
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