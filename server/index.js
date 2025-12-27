const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

const clients = {};

const videosData = [
    { id: 'vid1', name: 'Video di prova 1', filename: 'video1.mp4' },
    { id: 'vid2', name: 'Video di prova 2', filename: 'video2.mp4' },
    { id: 'vid3', name: 'Video di prova 3', filename: 'video3.mp4' },
];

app.use(cors());
app.use(express.json());

const adminBuildPath = path.join(__dirname, '..', 'admin-frontend', 'build');
const clientBuildPath = path.join(__dirname, '..', 'client-webapp', 'build');
const videosPath = path.join(__dirname, 'videos');

app.get('/api/videos', (req, res) => {
    const availableVideos = videosData.filter(video => {
        const filePath = path.join(videosPath, video.filename);
        return fs.existsSync(filePath);
    });
    res.json(availableVideos);
});

app.get('/api/clients', (req, res) => {
    res.json(Object.values(clients).map(({ socketId, ...rest }) => rest));
});

app.use('/videos', express.static(videosPath, {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.mp4')) {
            res.set('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// Gestione Admin App
app.use('/admin', express.static(adminBuildPath));
app.get(['/admin', '/admin/', '/admin/*'], (req, res) => {
    res.sendFile(path.join(adminBuildPath, 'index.html'));
});

// Gestione Client App
app.use('/client', express.static(clientBuildPath));
app.get(['/client', '/client/', '/client/*'], (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Qualsiasi altra rotta non gestita va in 404
app.get('*', (req, res) => {
    res.status(404).send('Not Found');
});

io.on('connection', (socket) => {
    console.log(`[SERVER] Connessione Socket.IO ricevuta: ${socket.id}`);

    socket.on('registerClient', (clientId) => {
        let firstVideoId = null;
        let firstVideoFilename = null;
        if (videosData.length > 0) {
            firstVideoId = videosData[0].id;
            firstVideoFilename = videosData[0].filename;
        }

        if (!clients[clientId]) {
            clients[clientId] = {
                clientId,
                socketId: socket.id,
                status: 'Connesso',
                currentVideoId: firstVideoId,
                currentVideoFilename: firstVideoFilename,
                opacity: 1,
                clientVideoStatus: 'paused',
                videoDownloadStatus: 'pending',
                downloadProgress: { cachedCount: 0, totalCount: 0 }
            };
            console.log(`[SERVER] Client PWA registrato (nuovo): ${clientId}`);
        } else {
            console.log(`[SERVER] Client PWA riconnesso: ${clientId}`);
            clients[clientId].socketId = socket.id;
            clients[clientId].status = 'Connesso';
            if (!clients[clientId].currentVideoId && firstVideoId) {
                 clients[clientId].currentVideoId = firstVideoId;
                 clients[clientId].currentVideoFilename = firstVideoFilename;
            }
        }

        io.emit('clientListUpdate', Object.values(clients).map(({ socketId, ...rest }) => rest));
        
        const clientCurrentState = clients[clientId];
        socket.emit('videoCommand', {
            command: 'updateState',
            videoId: clientCurrentState.currentVideoId,
            videoFilename: clientCurrentState.currentVideoFilename,
            opacity: clientCurrentState.opacity,
            videoDownloadStatus: clientCurrentState.videoDownloadStatus,
            downloadProgress: clientCurrentState.downloadProgress
        });
        console.log(`[SERVER] Inviato stato iniziale a ${clientId}. Video: ${clientCurrentState.currentVideoFilename || 'Nessuno'}, Download status: ${clientCurrentState.videoDownloadStatus}, Progress: ${clientCurrentState.downloadProgress.cachedCount}/${clientCurrentState.downloadProgress.totalCount}`);
    });

    socket.on('clientStatusUpdate', (clientId, statusUpdate) => {
        if (clients[clientId]) {
            const oldStatus = { ...clients[clientId] };
            Object.assign(clients[clientId], statusUpdate);
            console.log(`[SERVER] Stato client ${clientId} aggiornato:`, statusUpdate);
            
            if (statusUpdate.videoDownloadStatus || (statusUpdate.downloadProgress && (oldStatus.downloadProgress.cachedCount !== statusUpdate.downloadProgress.cachedCount || oldStatus.downloadProgress.totalCount !== statusUpdate.downloadProgress.totalCount))) {
                 console.log(`[SERVER] Download Status for ${clientId}: ${clients[clientId].videoDownloadStatus}, Progress: ${clients[clientId].downloadProgress.cachedCount}/${clients[clientId].downloadProgress.totalCount}`);
            }
            
            io.emit('clientListUpdate', Object.values(clients).map(({ socketId, ...rest }) => rest));
        }
    });

    socket.on('adminCommand', ({ targetClientId, command, videoId, videoFilename, opacity }) => {
        console.log(`[SERVER] Comando admin ricevuto: ${command} per ${targetClientId || 'tutti i client'} con video ${videoId} e opacità ${opacity}`);

        const videoToPlay = videosData.find(v => v.id === videoId);
        const actualVideoFilename = videoToPlay ? videoToPlay.filename : null;

        const processClientCommand = (client) => {
            if (io.sockets.sockets.has(client.socketId)) {
                io.to(client.socketId).emit('videoCommand', {
                    command,
                    videoId,
                    videoFilename: actualVideoFilename,
                    opacity
                });
                if (command === 'changeVideo' || command === 'play') {
                    client.currentVideoId = videoId;
                    client.currentVideoFilename = actualVideoFilename;
                    console.log(`[SERVER] Aggiornato stato client ${client.clientId} con video: ${actualVideoFilename} a causa di comando ${command}`);
                }
                if (command === 'setOpacity') {
                    client.opacity = opacity;
                    console.log(`[SERVER] Aggiornata opacità client ${client.clientId} a: ${opacity} a causa di comando ${command}`);
                }
            }
        };

        if (targetClientId === 'all') {
            Object.values(clients).forEach(processClientCommand);
        } else if (clients[targetClientId]) {
            processClientCommand(clients[targetClientId]);
        }
        io.emit('clientListUpdate', Object.values(clients).map(({ socketId, ...rest }) => rest));
    });

    socket.on('disconnect', () => {
        const disconnectedClient = Object.values(clients).find(client => client.socketId === socket.id);
        if (disconnectedClient) {
            disconnectedClient.status = 'Disconnesso';
            console.log(`[SERVER] Client disconnesso: ${disconnectedClient.clientId}`);
            io.emit('clientListUpdate', Object.values(clients).map(({ socketId, ...rest }) => rest));
        }
        console.log(`[SERVER] Socket disconnesso: ${socket.id}`);
    });

});

server.listen(PORT, () => {
    console.log(`Server Node.js in ascolto sulla porta ${PORT}`);
    console.log(`Dashboard Admin disponibile su http://localhost:${PORT}/admin`);
    console.log(`Client PWA disponibile su http://localhost:${PORT}/client`);
});
