const path = require('path');
const fs = require('fs');

const clients = {}; // Ora clients manterrà anche i client disconnessi per riutilizzo dell'ID

const videosPath = path.join(__dirname, '..','..', 'static', 'videos');

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov'];

const getAvailableVideos = () => {
    try {
        const files = fs.readdirSync(videosPath);

        const videoFiles = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return VIDEO_EXTENSIONS.includes(ext);
            })
            .map(file => ({
                id: file,
                filename: file,
                name: path.basename(file, path.extname(file))
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase())
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return videoFiles;
    } catch (err) {
        console.error('[SERVICE] Errore nella lettura della cartella videos:', err);
        return [];
    }
};

const getFirstVideoDetails = () => {
    const videos = getAvailableVideos();
    if (videos.length > 0) {
        return { id: videos[0].id, filename: videos[0].filename };
    }
    return { id: null, filename: null };
};

const getClientById = (clientId) => clients[clientId];

const getClientsListForApi = () => {
    // Filtra per mostrare solo i client che sono 'Connesso' o 'Disconnesso' e non 'Eliminato' logicamente
    return Object.values(clients); 
};

const getClientByNickname = (nickname) => {
    return Object.values(clients).find(client => client.nickname === nickname);
};

const registerClient = (clientId, socketId, nickname) => {
    const { id: firstVideoId, filename: firstVideoFilename } = getFirstVideoDetails();

    if (!clients[clientId]) {
        // Nuovo client, mai visto prima
        clients[clientId] = {
            clientId,
            socketId,
            nickname, // Aggiunto nickname
            status: 'Connesso',
            currentVideoId: firstVideoId,
            currentVideoFilename: firstVideoFilename,
            opacity: 1,
            clientVideoStatus: 'paused',
            videoDownloadStatus: 'pending',
            downloadProgress: { cachedCount: 0, totalCount: 0 }
        };
        console.log(`[SERVICE] Client PWA registrato (nuovo): ${clientId} con nickname ${nickname}`);
    } else {
        // Client esistente (potrebbe essere stato disconnesso prima)
        console.log(`[SERVICE] Client PWA riconnesso: ${clientId} con nickname ${nickname}`);
        clients[clientId].socketId = socketId;
        clients[clientId].status = 'Connesso'; // Reimposta lo stato a connesso
        clients[clientId].nickname = nickname; // Aggiorna il nickname

        // Assicurati che abbia un video se non ne aveva uno e il primo è disponibile
        if (!clients[clientId].currentVideoId && firstVideoId) {
            clients[clientId].currentVideoId = firstVideoId;
            clients[clientId].currentVideoFilename = firstVideoFilename;
        }
    }
    return clients[clientId];
};

const updateClientStatus = (clientId, statusUpdate) => {
    if (clients[clientId]) {
        Object.assign(clients[clientId], statusUpdate);
        if (statusUpdate.nickname) {
            clients[clientId].nickname = statusUpdate.nickname;
        }
    }
};

const handleAdminCommand = (targetClientId, command, videoId, opacity) => {
    const clientsToUpdate = [];

    const availableVideos = getAvailableVideos();
    const videoToPlay = availableVideos.find(v => v.id === videoId || v.filename === videoId);

    const applyCommandToClient = (client) => {
        // Applica i comandi solo ai client che sono attualmente connessi
        // o a quelli il cui stato è "Disconnesso" ma devono ricevere l'aggiornamento
        // (es. per mantenere coerenza sul video corrente, anche se non lo stanno visualizzando)
        
        // Se il client è disconnesso ma riceve un comando 'changeVideo',
        // aggiorniamo comunque il suo stato interno in modo che alla riconnessione
        // abbia già il video corretto.
        const shouldUpdateDisconnected = ['changeVideo', 'changeVideoAndPlay'].includes(command);

        if (client.status === 'Connesso' || shouldUpdateDisconnected) {
             if (command === 'changeVideo' || command === 'changeVideoAndPlay') {
                if (videoToPlay) {
                    client.currentVideoId = videoToPlay.id;
                    client.currentVideoFilename = videoToPlay.filename;
                    if (command === 'changeVideoAndPlay') {
                        client.clientVideoStatus = 'playing'; 
                    } else {
                        client.clientVideoStatus = 'paused';
                    }
                } else {
                    console.warn(`[SERVICE] Video "${videoId}" non trovato`);
                }
            }

            if (command === 'setOpacity') {
                client.opacity = opacity;
            }
            
            if (command === 'play') {
                client.clientVideoStatus = 'playing';
            }
            if (command === 'pause') {
                client.clientVideoStatus = 'paused';
            }
            clientsToUpdate.push(client); // Aggiunge il client all'elenco di quelli da notificare/aggiornare
        } else {
            console.log(`[SERVICE] Saltato comando per client disconnesso "${client.clientId}" (comando: ${command})`);
        }
    };

    if (targetClientId === 'all') {
        Object.values(clients).forEach(applyCommandToClient);
    } else {
        const targetClient = clients[targetClientId] || getClientByNickname(targetClientId);
        if (targetClient) {
            applyCommandToClient(targetClient);
        }
    }

    return clientsToUpdate;
};

const disconnectClient = (socketId) => {
    const disconnectedClient = Object.values(clients).find(client => client.socketId === socketId);
    if (disconnectedClient) {
        console.log(`[SERVICE] Imposto stato a 'Disconnesso' per client: ${disconnectedClient.clientId}`);
        disconnectedClient.status = 'Disconnesso';
        // Rimuovi l'associazione socketId, ma mantieni l'oggetto client
        disconnectedClient.socketId = null; 
    }
    return disconnectedClient;
};

// Funzione aggiuntiva per verificare se un clientId è già in uso da un client attivo
const isClientIdAlreadyConnected = (clientId) => {
    return clients[clientId] && clients[clientId].status === 'Connesso';
};

const isNicknameInUse = (nickname) => {
    return Object.values(clients).some(client => client.nickname === nickname && client.status === 'Connesso');
};

module.exports = {
    clients,
    getClientById,
    getClientByNickname,
    getClientsListForApi,
    registerClient,
    updateClientStatus,
    handleAdminCommand,
    disconnectClient,
    getAvailableVideos,
    isClientIdAlreadyConnected,
    isNicknameInUse,
};