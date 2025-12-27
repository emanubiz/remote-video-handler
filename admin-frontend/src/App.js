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


    const sendCommand = (targetClientId, command, videoId = selectedVideoId, newOpacity = null) => {
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
        } else {
            console.warn('[ADMIN] Socket non connesso. Impossibile inviare comando.');
        }
    };

    const handleClientOpacityChange = (clientId, newOpacity) => {
        setClients(prevClients =>
            prevClients.map(c =>
                c.clientId === clientId ? { ...c, opacity: newOpacity } : c
            )
        );
        sendCommand(clientId, 'setOpacity', null, newOpacity);
    };

    const handleClientVideoChange = (clientId, videoId) => {
        setClientSelectedVideos(prev => ({
            ...prev,
            [clientId]: videoId
        }));
    };

    const sendClientCommand = (targetClientId, command) => {
        const videoId = clientSelectedVideos[targetClientId] || selectedVideoId;
        sendCommand(targetClientId, command, videoId);
    };

    const displayDownloadStatusAdmin = (client) => {
        if (client.videoDownloadStatus === 'pending' && client.downloadProgress && client.downloadProgress.totalCount > 0) {
            return `SCARICAMENTO: ${client.downloadProgress.cachedCount}/${client.downloadProgress.totalCount}`;
        }
        return (client.videoDownloadStatus || 'pending').toUpperCase();
    };
    
    const isAnythingPlaying = clients.some(c => c.clientVideoStatus === 'playing');

    return (
        <div className="AdminApp">
            <h1>Dashboard Amministratore</h1>

            <div className="controls-section">
                <h2>Pannello di Controllo Globale</h2>
                
                <div className="global-controls-panel">
                    <button
                        onClick={() => sendCommand('all', 'play')}
                        className="control-button play"
                        title="Play su Tutti"
                    >
                        ▶️
                    </button>
                    <button
                        onClick={() => sendCommand('all', 'pause')}
                        className="control-button pause"
                        title="Pausa su Tutti"
                    >
                        ⏸️
                    </button>
                </div>

                <div className="video-selection">
                    <label htmlFor="video-select">Video Globale:</label>
                    <select
                        id="video-select"
                        value={selectedVideoId}
                        onChange={(e) => setSelectedVideoId(e.target.value)}
                        disabled={isAnythingPlaying}
                        title={isAnythingPlaying ? 'Metti in pausa tutti i video per cambiare selezione' : 'Seleziona un video da caricare su tutti i client'}
                    >
                        {videos.map(video => (
                            <option key={video.id} value={video.id}>
                                {video.name} ({video.filename})
                            </option>
                        ))}
                    </select>
                    <button onClick={() => sendCommand('all', 'changeVideo')} disabled={isAnythingPlaying}>
                        Carica su Tutti
                    </button>
                </div>
            </div>

            <div className="clients-section">
                <h2>Client Connessi</h2>
                {clients.length === 0 ? (
                    <p>Nessun client connesso al momento.</p>
                ) : (
                    <ul className="client-list">
                        {clients.map(client => {
                            const isPlaying = client.clientVideoStatus === 'playing';
                            const canChangeVideo = !isPlaying;

                            return (
                                <li key={client.clientId} className="client-item">
                                    <h3>ID Client: {client.clientId}</h3>
                                    <p>Stato: <span className={`status-${client.status.toLowerCase()}`}>{client.status}</span></p>
                                    <p>Video Attuale: {client.currentVideoFilename || 'Nessuno'}</p>
                                    <p>Stato Video: <span className={`status-${(client.clientVideoStatus || 'stopped').toLowerCase()}`}>{client.clientVideoStatus || 'Sconosciuto'}</span></p>
                                    <p>Download:
                                        <span className={`status-${(client.videoDownloadStatus || 'pending').toLowerCase()}`}>
                                            {displayDownloadStatusAdmin(client)}
                                        </span>
                                        {client.videoDownloadStatus === 'complete' && <span className="ready-icon"> ✔</span>}
                                        {client.videoDownloadStatus === 'error' && <span className="error-icon"> ✖</span>}
                                    </p>

                                    <div className="client-video-selection">
                                        <label>Video Specifico:</label>
                                        <select
                                            value={clientSelectedVideos[client.clientId] || client.currentVideoId || selectedVideoId}
                                            onChange={(e) => handleClientVideoChange(client.clientId, e.target.value)}
                                            disabled={!canChangeVideo}
                                            title={!canChangeVideo ? 'Ferma il video per cambiare selezione' : ''}
                                        >
                                            {videos.map(video => (
                                                <option key={video.id} value={video.id}>
                                                    {video.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    
                                    <div className="client-opacity-control">
                                        <label htmlFor={`opacity-slider-${client.clientId}`}>Opacità ({Math.round((client.opacity ?? 1) * 100)}%):</label>
                                        <input
                                            type="range"
                                            id={`opacity-slider-${client.clientId}`}
                                            min="0"
                                            max="1"
                                            step="0.01"
                                            value={client.opacity ?? 1}
                                            onChange={(e) => handleClientOpacityChange(client.clientId, parseFloat(e.target.value))}
                                        />
                                    </div>

                                    <div className="client-actions">
                                        <button onClick={() => sendClientCommand(client.clientId, 'changeVideo')}>
                                            Carica
                                        </button>

                                        <button
                                            onClick={() => sendClientCommand(client.clientId, isPlaying ? 'pause' : 'play')}
                                            disabled={client.videoDownloadStatus !== 'complete'}
                                            title={client.videoDownloadStatus !== 'complete' ? 'Attendi il download per controllare' : ''}
                                            className="play-pause-btn"
                                        >
                                            {isPlaying ? '⏸ Pausa' : '▶️ Play'}
                                        </button>

                                        <button
                                            onClick={() => sendClientCommand(client.clientId, 'stop')}
                                            className="stop-btn"
                                        >
                                            ⏹ Stop
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