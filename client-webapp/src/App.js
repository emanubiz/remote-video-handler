import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';

const SERVER_URL = window.location.origin;

function App() {
    const [clientId, setClientId] = useState(localStorage.getItem('clientId') || null);
    const [nickname, setNickname] = useState(localStorage.getItem('nickname') || null);
    const [pendingNickname, setPendingNickname] = useState(''); // Per l'input testuale
    const [isRegistered, setIsRegistered] = useState(!!localStorage.getItem('nickname')); // Flag per indicare se il nickname è stato impostato

    const [currentVideoFilename, setCurrentVideoFilename] = useState(null);
    const [currentVideoId, setCurrentVideoId] = useState(null);
    const [status, setStatus] = useState('Connessione...');
    const [opacity, setOpacity] = useState(1);
    const [videoDownloadStatus, setVideoDownloadStatus] = useState('pending');
    const [downloadProgress, setDownloadProgress] = useState({ cachedCount: 0, totalCount: 0 });

    const videoRef = useRef(null);
    const socketRef = useRef(null);
    const isConnectingRef = useRef(false);
    const shouldAutoplayAfterLoad = useRef(false);

    const currentVideoIdRef = useRef(currentVideoId);
    const currentVideoFilenameRef = useRef(currentVideoFilename);
    const opacityRef = useRef(opacity);
    const videoDownloadStatusRef = useRef(videoDownloadStatus);
    const downloadProgressRef = useRef(downloadProgress);
    const videoListRef = useRef([]);
    const statusRef = useRef(status);

    useEffect(() => {
        currentVideoIdRef.current = currentVideoId;
        currentVideoFilenameRef.current = currentVideoFilename;
        opacityRef.current = opacity;
        videoDownloadStatusRef.current = videoDownloadStatus;
        downloadProgressRef.current = downloadProgress;
        statusRef.current = status;
    }, [currentVideoId, currentVideoFilename, opacity, videoDownloadStatus, downloadProgress, status]);

    const sendClientStatusInternal = useRef();

    useEffect(() => {
        sendClientStatusInternal.current = (newStatusUpdate) => {
            if (socketRef.current && socketRef.current.connected && clientId) {
                const currentClientState = {
                    status: statusRef.current,
                    clientVideoStatus: videoRef.current ? (videoRef.current.paused ? 'paused' : 'playing') : 'unknown',
                    currentVideoId: currentVideoIdRef.current,
                    currentVideoFilename: currentVideoFilenameRef.current,
                    opacity: opacityRef.current,
                    videoDownloadStatus: videoDownloadStatusRef.current,
                    downloadProgress: downloadProgressRef.current,
                    nickname: nickname,
                    ...newStatusUpdate
                };
                socketRef.current.emit('clientStatusUpdate', clientId, currentClientState);
                console.log(`[CLIENT] Stato inviato al server per ${clientId}:`, currentClientState);
            }
        };
    }, [clientId, nickname]);

    const enterFullscreen = useCallback(() => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
        console.log('[CLIENT] Entrato in modalità Fullscreen.');
    }, []);

    const preloadVideos = useCallback(async () => {
        console.log('[CLIENT] La funzionalità di precaricamento video tramite Service Worker è disabilitata.');
        try {
            const response = await fetch(`${SERVER_URL}/api/videos`);
            const videos = await response.json();
            videoListRef.current = videos;
            console.log('[CLIENT] Lista video dal server (per riferimento):', videos);

            setVideoDownloadStatus('complete');
            setDownloadProgress({ cachedCount: videos.length, totalCount: videos.length });
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'complete', downloadProgress: { cachedCount: videos.length, totalCount: videos.length } });
            }

        } catch (error) {
            console.error('[CLIENT] Errore nel recuperare la lista video:', error);
            setVideoDownloadStatus('error');
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'error', error: error.message });
            }
        }
    }, []);

    useEffect(() => {
        console.warn('[CLIENT] Service Workers disabilitati o non supportati per scelta.');
        setVideoDownloadStatus('not_supported');
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ videoDownloadStatus: 'not_supported' });
        }
    }, []);
    
    useEffect(() => {
        if (!isRegistered || isConnectingRef.current) return;
        isConnectingRef.current = true;

        preloadVideos();

        socketRef.current = io(SERVER_URL, {
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            autoConnect: true
        });

        socketRef.current.on('connect', () => {
            console.log('[CLIENT] Connesso al server Socket.IO');
            setStatus('Connesso');
            // Invia l'ID del client (preso da localStorage) e il nickname
            socketRef.current.emit('registerClient', { suggestedId: clientId, nickname });
            isConnectingRef.current = false;
        });

        socketRef.current.on('connect_error', (error) => {
            console.error('[CLIENT] Errore di connessione Socket.IO:', error);
            setStatus('Errore di connessione');
            isConnectingRef.current = false;
        });

        socketRef.current.on('disconnect', (reason) => {
            console.log(`[CLIENT] Disconnesso dal server Socket.IO. Motivo: ${reason}`);
            setStatus('Disconnesso');
        });

        socketRef.current.on('nicknameUpdated', (newNickname) => {
            console.log(`[CLIENT] Nickname aggiornato dal server: ${newNickname}`);
            setNickname(newNickname);
            localStorage.setItem('nickname', newNickname);
        });

        socketRef.current.on('videoCommand', ({ command, videoId, videoFilename, opacity: newOpacity, clientVideoStatus: newVideoStatus, clientId: assignedClientId, nickname: assignedNickname }) => {
            console.log('[CLIENT] Comando video ricevuto:', { command, videoId, videoFilename, newOpacity, newVideoStatus, assignedClientId, assignedNickname });

            if (assignedClientId && assignedClientId !== clientId) {
                setClientId(assignedClientId);
                localStorage.setItem('clientId', assignedClientId);
                console.log(`[CLIENT] Assegnato/Aggiornato ID dal server: ${assignedClientId}`);
            }

            if (assignedNickname && assignedNickname !== nickname) {
                setNickname(assignedNickname);
                localStorage.setItem('nickname', assignedNickname);
                console.log(`[CLIENT] Assegnato/Aggiornato Nickname dal server: ${assignedNickname}`);
            }

            let statusUpdate = {};
            let clientStateChanged = false;

            switch (command) {
                case 'changeVideo':
                    if (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        console.log(`[CLIENT] Cambio video a: ${videoFilename}`);
                        clientStateChanged = true;
                        shouldAutoplayAfterLoad.current = false;
                    }
                    break;

                case 'changeVideoAndPlay':
                    if (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current) {
                        setCurrentVideoId(videoId);
setCurrentVideoFilename(videoFilename);
                        console.log(`[CLIENT] Cambio video a: ${videoFilename} e avvio riproduzione.`);
                        clientStateChanged = true;
                        shouldAutoplayAfterLoad.current = true;
                    } else {
                        shouldAutoplayAfterLoad.current = true;
                    }
                    break;

                case 'play':
                    if (videoRef.current) {
                        videoRef.current.play().catch(e => console.error("[CLIENT] Errore play:", e));
                        statusUpdate.clientVideoStatus = 'playing';
                        clientStateChanged = true;
                        shouldAutoplayAfterLoad.current = true;
                    }
                    break;

                case 'pause':
                    if (videoRef.current) {
                        videoRef.current.pause();
                        statusUpdate.clientVideoStatus = 'paused';
                        clientStateChanged = true;
                        shouldAutoplayAfterLoad.current = false;
                    }
                    break;

                case 'setOpacity':
                    if (typeof newOpacity === 'number' && newOpacity >= 0 && newOpacity <= 1 && newOpacity !== opacityRef.current) {
                        setOpacity(newOpacity);
                        console.log(`[CLIENT] Opacità impostata a: ${newOpacity}`);
                        clientStateChanged = true;
                    }
                    break;

                case 'updateState':
                    if (assignedClientId && assignedClientId !== clientId) {
                        setClientId(assignedClientId);
                        localStorage.setItem('clientId', assignedClientId);
                    }
                    if (assignedNickname && assignedNickname !== nickname) {
                        setNickname(assignedNickname);
                        localStorage.setItem('nickname', assignedNickname);
                    }
                    
                    if (videoId !== undefined && videoFilename !== undefined && (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current)) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        clientStateChanged = true;
                    }
                    if (typeof newOpacity === 'number' && newOpacity !== opacityRef.current) {
                        setOpacity(newOpacity);
                        clientStateChanged = true;
                    }
                    if (newVideoStatus && newVideoStatus === 'playing' && videoRef.current && videoRef.current.paused) {
                        videoRef.current.play().catch(e => console.error("[CLIENT] Errore play in updateState:", e));
                        clientStateChanged = true;
                    } else if (newVideoStatus === 'paused' && videoRef.current && !videoRef.current.paused) {
                        videoRef.current.pause();
                        clientStateChanged = true;
                    }
                    break;

                default:
                    console.log('[CLIENT] Comando sconosciuto:', command);
            }

            if (Object.keys(statusUpdate).length > 0 || clientStateChanged) {
                if (sendClientStatusInternal.current) {
                    sendClientStatusInternal.current(statusUpdate);
                }
            }
        });

        return () => {
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            isConnectingRef.current = false;
        };
    }, [isRegistered, clientId, nickname, preloadVideos]);

    useEffect(() => {
        if (videoRef.current && currentVideoFilename) {
            const videoSrc = `${SERVER_URL}/videos/${currentVideoFilename}`;
            if (videoRef.current.src !== videoSrc) {
                videoRef.current.src = videoSrc;
                videoRef.current.load();
            }
        }
    }, [currentVideoFilename]);

    const handleVideoPlay = useCallback(() => {
        if (document.hidden) return;
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'playing' });
        }
    }, []);

    const handleVideoPause = useCallback(() => {
        if (document.hidden) return;
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'paused' });
        }
    }, []);

    const handleVideoEnded = useCallback(() => {
        if (document.hidden) return;
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'ended' });
        }
    }, []);

    const handleLoadedData = useCallback(() => {
        if (shouldAutoplayAfterLoad.current && videoRef.current) {
            videoRef.current.play().catch(e => console.error("[CLIENT] Errore nell'autoplay dopo caricamento dati:", e));
            shouldAutoplayAfterLoad.current = false;
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ clientVideoStatus: 'playing' });
            }
        }
    }, []);

    const displayDownloadStatus = () => {
        if (videoDownloadStatus === 'pending' && downloadProgress.totalCount > 0) {
            return `SCARICAMENTO (browser): ${downloadProgress.cachedCount}/${downloadProgress.totalCount}`;
        } else if (videoDownloadStatus === 'not_supported') {
            return 'NON SUPPORTATO (SW disabilitato)';
        }
        return videoDownloadStatus.toUpperCase();
    };

    const handleConnect = () => {
        if (pendingNickname.trim()) {
            const finalNickname = pendingNickname.trim();
            setNickname(finalNickname);
            localStorage.setItem('nickname', finalNickname);
            setIsRegistered(true);

            // Se non c'è un clientId, non fa nulla qui. La registrazione avverrà nell'useEffect
        } else {
            alert('Per favore, inserisci un nickname.');
        }
    };

    if (!isRegistered) {
        return (
            <div className="App name-input-screen">
                <div className="name-input-container">
                    <h1>Scegli un Nickname</h1>
                    <input
                        type="text"
                        value={pendingNickname}
                        onChange={(e) => setPendingNickname(e.target.value)}
                        placeholder="Es: Il tuo nickname"
                        onKeyPress={(e) => {
                            if (e.key === 'Enter') handleConnect();
                        }}
                    />
                    <button onClick={handleConnect}>Connetti</button>
                </div>
            </div>
        );
    }

    return (
        <div className="App" onClick={enterFullscreen} onTouchStart={enterFullscreen} style={{ opacity: opacity }}>
            <header className="App-header">
                {currentVideoFilename ? (
                    <video
                        key={currentVideoId}
                        ref={videoRef}
                        className="fullscreen-video"
                        onPlay={handleVideoPlay}
                        onPause={handleVideoPause}
                        onEnded={handleVideoEnded}
                        onLoadedData={handleLoadedData}
                        muted
                        loop
                        controls={false}
                    />
                ) : (
                    <p>Nessun video selezionato. ID Client: {clientId}</p>
                )}
                <div className="overlay-info">
                    <p>Stato: {status}</p>
                    <p>ID Client: {clientId || 'In attesa...'}</p>
                    <p>Nickname: {nickname}</p>
                    <p>Video: {currentVideoFilename || 'Nessuno'}</p>
                    <p>Download Video: <span className={`status-${videoDownloadStatus}`}>{displayDownloadStatus()}</span></p>
                    <p>Clicca/Tocca per Fullscreen</p>
                </div>
            </header>
        </div>
    );
}

export default App;
