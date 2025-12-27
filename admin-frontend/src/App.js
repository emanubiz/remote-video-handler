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
    const [opacity, setOpacity] = useState(1);
    const [clientSelectedVideos, setClientSelectedVideos] = useState({});

    const socketRef = useRef(null);

    const fetchVideos = useCallback(async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/videos`);
            const data = await response.json();
            setVideos(data);
            if (data.length > 0) {
                setSelectedVideoId(data[0].id);
            }
            console.log('[ADMIN] Video recuperati:', data);
        } catch (error) {
            console.error('[ADMIN] Errore nel recuperare la lista dei video:', error);
        }
    }, []);

    const fetchClients = useCallback(async () => {
        try {
            const response = await fetch(`${SERVER_URL}/api/clients`);
            const data = await response.json();
            setClients(data);
            console.log('[ADMIN] Client recuperati:', data);
        } catch (error) {
            console.error('[ADMIN] Errore nel recuperare la lista dei client:', error);
        }
    }, []);

    useEffect(() => {
        socketRef.current = io(SERVER_URL);

        socketRef.current.on('connect', () => {
            console.log('[ADMIN] Connesso al server Socket.IO');
            fetchClients();
            fetchVideos();
        });

        socketRef.current.on('disconnect', () => {
            console.log('[ADMIN] Disconnesso dal server Socket.IO');
        });

        socketRef.current.on('clientListUpdate', (updatedClients) => {
            console.log('[ADMIN] Lista client aggiornata ricevuta:', updatedClients);
            if (Array.isArray(updatedClients)) {
                setClients(updatedClients);
            } else {
                setClients(prevClients => {
                    const existingClientIndex = prevClients.findIndex(c => c.clientId === updatedClients.clientId);
                    if (existingClientIndex > -1) {
                        const newClients = [...prevClients];
                        newClients[existingClientIndex] = updatedClients;
                        return newClients;
                    } else {
                        return [...prevClients, updatedClients];
                    }
                });
            }
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
            }
        };
    }, [fetchClients, fetchVideos]);

    const sendCommand = (targetClientId, command, videoId = selectedVideoId, newOpacity = opacity) => {
        const video = videos.find(v => v.id === videoId);
        const videoFilename = video ? video.filename : null;

        if (socketRef.current && socketRef.current.connected) {
            socketRef.current.emit('adminCommand', {
                targetClientId,
                command,
                videoId,
                videoFilename,
                opacity: newOpacity
            });
            console.log(`[ADMIN] Comando inviato: ${command} a ${targetClientId || 'tutti'} con video ${videoId} e opacità ${newOpacity}`);
        } else {
            console.warn('[ADMIN] Socket non connesso. Impossibile inviare comando.');
        }
    };

    const handleOpacityChange = (e) => {
        const newOpacity = parseFloat(e.target.value);
        setOpacity(newOpacity);
    };

    const handleSetOpacity = (targetClientId) => {
        sendCommand(targetClientId, 'setOpacity', null, opacity);
    };

    const handleClientVideoChange = (clientId, videoId) => {
        setClientSelectedVideos(prev => ({
            ...prev,
            [clientId]: videoId
        }));
    };

    const sendClientCommand = (targetClientId, command) => {
        const videoId = clientSelectedVideos[targetClientId] || selectedVideoId;
        sendCommand(targetClientId, command, videoId, opacity);
    };

    const displayDownloadStatusAdmin = (client) => {
        if (client.videoDownloadStatus === 'pending' && client.downloadProgress && client.downloadProgress.totalCount > 0) {
            return `SCARICAMENTO: ${client.downloadProgress.cachedCount}/${client.downloadProgress.totalCount}`;
        }
        return (client.videoDownloadStatus || 'pending').toUpperCase();
    };

    return (
        <div className="AdminApp">
            <h1>Dashboard Amministratore Remote Video</h1>

            <div className="controls-section">
                <h2>Controlli Globali</h2>
                <div className="video-selection">
                    <label htmlFor="video-select">Seleziona Video:</label>
                    <select
                        id="video-select"
                        value={selectedVideoId}
                        onChange={(e) => setSelectedVideoId(e.target.value)}
                    >
                        {videos.map(video => (
                            <option key={video.id} value={video.id}>
                                {video.name} ({video.filename})
                            </option>
                        ))}
                    </select>
                    <button onClick={() => sendCommand('all', 'changeVideo')}>Carica/Cambia Video</button>
                </div>

                <div className="video-actions">
                    <button onClick={() => sendCommand('all', 'play')}>Play Tutti</button>
                    <button onClick={() => sendCommand('all', 'pause')}>Pausa Tutti</button>
                </div>

                <div className="opacity-control">
                    <label htmlFor="opacity-slider">Opacità ({Math.round(opacity * 100)}%):</label>
                    <input
                        type="range"
                        id="opacity-slider"
                        min="0"
                        max="1"
                        step="0.01"
                        value={opacity}
                        onChange={handleOpacityChange}
                    />
                    <button onClick={() => handleSetOpacity('all')}>Imposta Opacità Tutti</button>
                </div>
            </div>

            <div className="clients-section">
                <h2>Client Connessi</h2>
                {clients.length === 0 ? (
                    <p>Nessun client connesso al momento.</p>
                ) : (
                    <ul className="client-list">
                        {clients.map(client => (
                            <li key={client.clientId} className="client-item">
                                <h3>ID Client: {client.clientId}</h3>
                                <p>Stato: <span className={`status-${client.status.toLowerCase()}`}>{client.status}</span></p>
                                <p>Video Attuale: {client.currentVideoFilename || 'Nessuno'}</p>
                                <p>Stato Video: {client.clientVideoStatus || 'Sconosciuto'}</p>
                                <p>Opacità: {Math.round((client.opacity || 1) * 100)}%</p>
                                <p>Download Video:
                                    <span className={`status-${(client.videoDownloadStatus || 'pending').toLowerCase()}`}>
                                        { displayDownloadStatusAdmin(client) }
                                    </span>
                                    {client.videoDownloadStatus === 'complete' && <span className="ready-icon"> ✔</span>}
                                    {client.videoDownloadStatus === 'error' && <span className="error-icon"> ✖</span>}
                                </p>
                                <div className="client-video-selection">
                                    <label>Seleziona Video:</label>
                                    <select
                                        value={clientSelectedVideos[client.clientId] || client.currentVideoId || selectedVideoId}
                                        onChange={(e) => handleClientVideoChange(client.clientId, e.target.value)}
                                    >
                                        {videos.map(video => (
                                            <option key={video.id} value={video.id}>
                                                {video.name} ({video.filename})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div className="client-actions">
                                    <button onClick={() => sendClientCommand(client.clientId, 'changeVideo')}>Carica</button>
                                    <button
                                        onClick={() => sendClientCommand(client.clientId, 'play')}
                                        disabled={client.videoDownloadStatus !== 'complete'}
                                        title={client.videoDownloadStatus !== 'complete' ? 'Attendi il completamento del download dei video' : ''}
                                    >
                                        Play
                                    </button>
                                    <button onClick={() => sendClientCommand(client.clientId, 'pause')}>Pausa</button>
                                    <button onClick={() => handleSetOpacity(client.clientId)}>Opacità</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}

export default App;