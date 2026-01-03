const path = require('path');
const fs = require('fs');

const clients = {};

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
    return Object.values(clients).map(({ socketId, ...rest }) => rest);
};

const registerClient = (clientId, socketId) => {
    const { id: firstVideoId, filename: firstVideoFilename } = getFirstVideoDetails();

    if (!clients[clientId]) {
        clients[clientId] = {
            clientId,
            socketId,
            status: 'Connesso',
            currentVideoId: firstVideoId,
            currentVideoFilename: firstVideoFilename,
            opacity: 1,
            clientVideoStatus: 'paused',
            videoDownloadStatus: 'pending',
            downloadProgress: { cachedCount: 0, totalCount: 0 }
        };
        console.log(`[SERVICE] Client PWA registrato (nuovo): ${clientId}`);
    } else {
        console.log(`[SERVICE] Client PWA riconnesso: ${clientId}`);
        clients[clientId].socketId = socketId;
        clients[clientId].status = 'Connesso';

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
    }
};

const handleAdminCommand = (targetClientId, command, videoId, opacity) => {
    const clientsToUpdate = [];

    const availableVideos = getAvailableVideos();
    const videoToPlay = availableVideos.find(v => v.id === videoId || v.filename === videoId);

    const applyCommandToClient = (client) => {
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

        clientsToUpdate.push(client);
    };

    if (targetClientId === 'all') {
        Object.values(clients).forEach(applyCommandToClient);
    } else if (clients[targetClientId]) {
        applyCommandToClient(clients[targetClientId]);
    }

    return clientsToUpdate;
};

const disconnectClient = (socketId) => {
    const disconnectedClient = Object.values(clients).find(client => client.socketId === socketId);
    if (disconnectedClient) {
        disconnectedClient.status = 'Disconnesso';
    }
    return disconnectedClient;
};

module.exports = {
    clients,
    getClientById,
    getClientsListForApi,
    registerClient,
    updateClientStatus,
    handleAdminCommand,
    disconnectClient,
    getAvailableVideos,
};