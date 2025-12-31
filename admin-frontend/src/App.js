import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SERVER_URL = process.env.NODE_ENV === 'production'
    ? window.location.origin
    : 'http://localhost:3000';

function App() {

    const [clients, setClients] = useState([]);
    const [videos, setVideos] = useState([]);
    const [selectedVideoId, setSelectedVideoId] = useState('');
    const [clientSelectedVideos, setClientSelectedVideos] = useState({});

    const socketRef = useRef(null);
    const selectRefs = useRef({});

    const fetchVideos = useCallback(async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/videos`);
            const data = await response.json();
            setVideos(data);
            if (data.length > 0 && !selectedVideoId) {
                setSelectedVideoId(data[0].id);
            }
        } catch (error) {
            console.error('[ADMIN] Errore nel recuperare la lista dei video:', error);
        }
    }, [selectedVideoId]);

    const fetchClients = useCallback(async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/clients`);
            const data = await response.json();
            setClients(data);
        } catch (error) {
            console.error('[ADMIN] Errore nel recuperare la lista dei client:', error);
        }
    }, []);

    useEffect(() => {
        socketRef.current = io(SERVER_URL);
        const socket = socketRef.current;

        socket.on('connect', () => {
            console.log('[ADMIN] Connesso al server Socket.IO');
            fetchClients();
            fetchVideos();
        });

        socket.on('disconnect', () => {
            console.log('[ADMIN] Disconnesso dal server Socket.IO');
        });

        socket.on('clientListUpdate', (updatedClients) => {
            if (Array.isArray(updatedClients)) {
                setClients(updatedClients);
            }
        });

        return () => {
            socket.disconnect();
        };
    }, [fetchClients, fetchVideos]);

    useEffect(() => {
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                if (socketRef.current && socketRef.current.connected) {
                    console.log('[ADMIN] La scheda è tornata visibile, richiedo sync dello stato.');
                    socketRef.current.emit('requestAdminStateSync');
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, []);

    const sendCommand = (targetClientId, command, videoId = selectedVideoId, newOpacity = null) => {
        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('adminCommand', {
                targetClientId,
                command,
                videoId,
                opacity: newOpacity
            }); 
            setTimeout(fetchClients, 200);
        }
    };

    const sendClientCommand = (targetClientId, command) => {
        let videoIdToUse = selectedVideoId;

        if (command === 'changeVideoAndPlay' || command === 'changeVideo') {
            if (targetClientId !== 'all') {
                if (selectRefs.current[targetClientId] && selectRefs.current[targetClientId].value) {
                    videoIdToUse = selectRefs.current[targetClientId].value;
                } else {
                    videoIdToUse = clientSelectedVideos[targetClientId] || selectedVideoId;
                }
            }
        } else if (targetClientId !== 'all') {
            videoIdToUse = clientSelectedVideos[targetClientId] || selectedVideoId;
        }

        sendCommand(targetClientId, command, videoIdToUse);
    };

    const handleClientOpacityChange = (clientId, newOpacity) => {
        sendCommand(clientId, 'setOpacity', null, newOpacity);
    };

    const handleClientVideoChange = (clientId, videoId) => {
        setClientSelectedVideos(prev => ({ ...prev, [clientId]: videoId }));
    };

    const displayDownloadStatusAdmin = (client) => {
        if (client.videoDownloadStatus === 'pending' && client.downloadProgress?.totalCount > 0) {
            return `SCARICAMENTO: ${client.downloadProgress.cachedCount}/${client.downloadProgress.totalCount}`;
        }
        return (client.videoDownloadStatus || 'pending').toUpperCase();
    };

    return (
        <div className="AdminApp">
            <h1>Dashboard Amministratore</h1>

            <div className="controls-section">
                <h2>Pannello di Controllo Globale</h2>

                <div className="global-controls-panel">
                    <button onClick={() => sendClientCommand('all', 'play')}>▶️ Play Tutti</button>
                    <button onClick={() => sendClientCommand('all', 'pause')}>⏸️ Pausa Tutti</button>
                </div>

                <div className="video-selection">
                    <label>Video Globale:</label>
                    <select
                        value={selectedVideoId}
                        onChange={(e) => setSelectedVideoId(e.target.value)}
                    >
                        {videos.map(video => (
                            <option key={video.id} value={video.id}>{video.name}</option>
                        ))}
                    </select>
                    <button onClick={() => sendClientCommand('all', 'changeVideoAndPlay')}>
                        Carica e Avvia su Tutti
                    </button>
                </div>
            </div>

            <div className="clients-section">
                <h2>Client Connessi</h2>
                {clients.length === 0 ? (
                    <p>Nessun client connesso.</p>
                ) : (
                    <ul className="client-list">
                        {clients.map(client => {
                            const isPlaying = client.clientVideoStatus === 'playing';

                            return (
                                <li key={client.clientId} className="client-item">
                                    <h3>ID Client: {client.clientId}</h3>
                                    <p>Stato: <span className={`status-${client.status.toLowerCase()}`}>{client.status}</span></p>
                                    <p>Video Attuale: {client.currentVideoFilename || 'Nessuno'}</p>
                                    <p>Stato Video: <span className={`${(client.clientVideoStatus || 'stopped').toLowerCase()}`}>{client.clientVideoStatus || 'Sconosciuto'}</span></p>
                                    <p>Download: {displayDownloadStatusAdmin(client)}
                                        {client.videoDownloadStatus === 'complete' && ' ✔'}
                                        {client.videoDownloadStatus === 'error' && ' ✖'}
                                    </p>

                                    <div className="client-video-selection">
                                        <label>Video Specifico:</label>
                                        <select
                                            ref={el => (selectRefs.current[client.clientId] = el)}
                                            value={clientSelectedVideos[client.clientId] || client.currentVideoId || selectedVideoId}
                                            onChange={(e) => handleClientVideoChange(client.clientId, e.target.value)}
                                        >
                                            {videos.map(video => (
                                                <option key={video.id} value={video.id}>{video.name}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="client-opacity-control">
                                        <label>Opacità ({Math.round((client.opacity ?? 1) * 100)}%):</label>
                                        <input
                                            type="range"
                                            min="0" max="1" step="0.01"
                                            value={client.opacity ?? 1}
                                            onChange={(e) => handleClientOpacityChange(client.clientId, parseFloat(e.target.value))}
                                        />
                                    </div>

                                    <div className="client-actions">
                                        <button
                                            onClick={() => sendClientCommand(client.clientId, 'changeVideoAndPlay')}
                                            disabled={client.videoDownloadStatus !== 'complete'}
                                        >
                                            Carica e Avvia
                                        </button>
                                        <button
                                            onClick={() => sendClientCommand(client.clientId, isPlaying ? 'pause' : 'play')}
                                            disabled={client.videoDownloadStatus !== 'complete'}
                                        >
                                            {isPlaying ? '⏸ Pausa' : '▶️ Play'}
                                        </button>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default App;