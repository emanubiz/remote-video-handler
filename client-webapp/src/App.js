import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import { Workbox } from 'workbox-window';

const SERVER_URL = window.location.origin;

const generateClientId = () => {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
        clientId = `client-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('clientId', clientId);
    }
    return clientId;
};

const areDownloadProgressEqual = (p1, p2) => {
    if (!p1 || !p2) return p1 === p2;
    return p1.cachedCount === p2.cachedCount && p1.totalCount === p2.totalCount;
};

function App() {
    const [clientId] = useState(generateClientId());
    const [currentVideoFilename, setCurrentVideoFilename] = useState(null);
    const [currentVideoId, setCurrentVideoId] = useState(null);
    const [status, setStatus] = useState('Connessione...');
    const [videoList, setVideoList] = useState([]);
    const [isFullScreen, setIsFullScreen] = useState(false);
    const [opacity, setOpacity] = useState(1);
    const [videoDownloadStatus, setVideoDownloadStatus] = useState('pending');
    const [downloadProgress, setDownloadProgress] = useState({ cachedCount: 0, totalCount: 0 });

    const videoRef = useRef(null);
    const socketRef = useRef(null);
    const workboxRef = useRef(null);
    const isConnectingRef = useRef(false);

    const currentVideoIdRef = useRef(currentVideoId);
    const currentVideoFilenameRef = useRef(currentVideoFilename);
    const opacityRef = useRef(opacity);
    const videoDownloadStatusRef = useRef(videoDownloadStatus);
    const downloadProgressRef = useRef(downloadProgress);
    const videoListRef = useRef(videoList);
    const statusRef = useRef(status);

    useEffect(() => {
        currentVideoIdRef.current = currentVideoId;
        currentVideoFilenameRef.current = currentVideoFilename;
        opacityRef.current = opacity;
        videoDownloadStatusRef.current = videoDownloadStatus;
        downloadProgressRef.current = downloadProgress;
        videoListRef.current = videoList;
        statusRef.current = status;
    }, [currentVideoId, currentVideoFilename, opacity, videoDownloadStatus, downloadProgress, videoList, status]);

    const sendClientStatusInternal = useRef();

    useEffect(() => {
        sendClientStatusInternal.current = (newStatusUpdate) => {
            if (socketRef.current && socketRef.current.connected) {
                const currentClientState = {
                    status: statusRef.current,
                    clientVideoStatus: videoRef.current ? (videoRef.current.paused ? 'paused' : 'playing') : 'unknown',
                    currentVideoId: currentVideoIdRef.current,
                    currentVideoFilename: currentVideoFilenameRef.current,
                    opacity: opacityRef.current,
                    videoDownloadStatus: videoDownloadStatusRef.current,
                    downloadProgress: downloadProgressRef.current,
                    ...newStatusUpdate
                };
                socketRef.current.emit('clientStatusUpdate', clientId, currentClientState);
                console.log(`[CLIENT] Stato inviato al server per ${clientId}:`, currentClientState);
            }
        };
    }, [clientId]);

    const enterFullscreen = useCallback(() => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) elem.requestFullscreen();
        else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
        else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
        setIsFullScreen(true);
        console.log('[CLIENT] Entrato in modalità Fullscreen.');
    }, []);

    const preloadVideos = useCallback(async (wbInstance) => {
        if (!wbInstance) {
            console.warn('[CLIENT] Workbox non disponibile, impossibile precaricare video.');
            setVideoDownloadStatus('error');
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'error', error: 'Workbox non disponibile' });
            }
            return;
        }

        console.log('[CLIENT] Avvio preloadVideos (con SW attivo)...');
        try {
            const response = await fetch(`${SERVER_URL}/api/videos`);
            const videos = await response.json();
            setVideoList(videos);
            console.log('[CLIENT] Lista video dal server:', videos);

            if (videos.length === 0) {
                console.log('[CLIENT] Nessun video da scaricare.');
                setVideoDownloadStatus('complete');
                setDownloadProgress({ cachedCount: 0, totalCount: 0 });
                if (sendClientStatusInternal.current) {
                    sendClientStatusInternal.current({ videoDownloadStatus: 'complete', downloadProgress: { cachedCount: 0, totalCount: 0 } });
                }
                return;
            }

            setVideoDownloadStatus('pending');
            setDownloadProgress({ cachedCount: 0, totalCount: videos.length });
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'pending', downloadProgress: { cachedCount: 0, totalCount: videos.length } });
            }

            const videoUrls = videos.map(v => `/videos/${v.filename}`);
            await wbInstance.messageSW({
                type: 'CACHE_VIDEOS',
                videos: videoUrls
            });
            console.log('[CLIENT] Inviato comando CACHE_VIDEOS al SW.');

        } catch (error) {
            console.error('[CLIENT] Errore nel precaricare i video o inviare al SW:', error);
            setVideoDownloadStatus('error');
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'error', error: error.message });
            }
        }
    }, []);

    useEffect(() => {
        let cleanupSW;
        if ('serviceWorker' in navigator && typeof Workbox !== 'undefined') {
            workboxRef.current = new Workbox('/client/service-worker.js');
            const wb = workboxRef.current;

            const handleSWMessage = (event) => {
                console.log('[CLIENT] Messaggio dal SW:', event.data);
                if (event.data.type === 'VIDEOS_CACHING_PROGRESS') {
                    const { cachedCount, totalCount } = event.data;
                    setDownloadProgress({ cachedCount, totalCount });
                    if (sendClientStatusInternal.current) {
                        sendClientStatusInternal.current({
                            videoDownloadStatus: 'pending',
                            downloadProgress: { cachedCount, totalCount }
                        });
                    }
                } else if (event.data.type === 'VIDEOS_CACHING_COMPLETE') {
                    setVideoDownloadStatus('complete');
                    setDownloadProgress(prev => ({ cachedCount: prev.totalCount, totalCount: prev.totalCount }));
                    if (sendClientStatusInternal.current) {
                        sendClientStatusInternal.current({ videoDownloadStatus: 'complete', downloadProgress: { cachedCount: videoListRef.current.length, totalCount: videoListRef.current.length } });
                    }
                } else if (event.data.type === 'VIDEOS_CACHING_ERROR') {
                    setVideoDownloadStatus('error');
                    if (sendClientStatusInternal.current) {
                        sendClientStatusInternal.current({ videoDownloadStatus: 'error', error: event.data.error });
                    }
                }
            };

            wb.addEventListener('message', handleSWMessage);

            wb.register().then(registration => {
                console.log('[CLIENT] Service Worker registrato:', registration);
                if (registration && registration.waiting) {
                    wb.messageSW({ type: 'SKIP_WAITING' });
                }
            }).catch(error => {
                console.error('[CLIENT] Errore durante la registrazione del Service Worker:', error);
            });

            cleanupSW = () => {
                if (wb) wb.removeEventListener('message', handleSWMessage);
            };
        } else {
            console.warn('[CLIENT] Service Workers non supportati.');
            setVideoDownloadStatus('not_supported');
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'not_supported' });
            }
        }

        return () => {
            if (cleanupSW) cleanupSW();
        };
    }, []);

    useEffect(() => {
        if (isConnectingRef.current) return;
        isConnectingRef.current = true;

        if (workboxRef.current) {
            workboxRef.current.register().then(() => preloadVideos(workboxRef.current));
        } else {
            preloadVideos(null);
        }

        socketRef.current = io(SERVER_URL, {
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            autoConnect: true
        });

        socketRef.current.on('connect', () => {
            console.log('[CLIENT] Connesso al server Socket.IO');
            setStatus('Connesso');
            socketRef.current.emit('registerClient', clientId);
            isConnectingRef.current = false;
            if (sendClientStatusInternal.current) sendClientStatusInternal.current({});
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

        socketRef.current.on('videoCommand', ({ command, videoId, videoFilename, opacity: newOpacity }) => {
            console.log('[CLIENT] Comando video ricevuto:', { command, videoId, videoFilename, newOpacity });

            let statusUpdate = {};
            let clientStateChanged = false;

            switch (command) {
                case 'play':
                    if (videoRef.current) {
                        videoRef.current.play().catch(e => console.error("[CLIENT] Errore play:", e));
                        statusUpdate.clientVideoStatus = 'playing';
                        clientStateChanged = true;
                    }
                    break;

                case 'pause':
                    if (videoRef.current) {
                        videoRef.current.pause();
                        statusUpdate.clientVideoStatus = 'paused';
                        clientStateChanged = true;
                    }
                    break;

                case 'stop':
                    if (videoRef.current) {
                        videoRef.current.pause();
                        videoRef.current.currentTime = 0;
                        statusUpdate.clientVideoStatus = 'stopped';
                        clientStateChanged = true;
                        console.log('[CLIENT] Comando STOP eseguito: video fermato e riavvolto');
                    }
                    break;

                case 'changeVideo':
                    if (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        console.log(`[CLIENT] Cambio video a: ${videoFilename}`);
                        clientStateChanged = true;
                        statusUpdate.clientVideoStatus = 'paused';
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
                    if (videoId !== undefined && videoFilename !== undefined && (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current)) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        clientStateChanged = true;
                    }
                    if (typeof newOpacity === 'number' && newOpacity !== opacityRef.current) {
                        setOpacity(newOpacity);
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
    }, [clientId, preloadVideos]);

    useEffect(() => {
        if (videoRef.current && currentVideoFilename) {
            const videoSrc = `${SERVER_URL}/videos/${currentVideoFilename}`;
            if (videoRef.current.src !== videoSrc) {
                videoRef.current.src = videoSrc;
                videoRef.current.load();
                videoRef.current.pause();
            }
        }
    }, [currentVideoFilename]);

    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement);
        };
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
        document.addEventListener('msfullscreenchange', handleFullscreenChange);
        return () => {
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
            document.removeEventListener('msfullscreenchange', handleFullscreenChange);
        };
    }, []);

    const handleVideoPlay = useCallback(() => {
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'playing' });
        }
    }, []);

    const handleVideoPause = useCallback(() => {
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'paused' });
        }
    }, []);

    const handleVideoEnded = useCallback(() => {
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'ended' });
        }
    }, []);

    const displayDownloadStatus = () => {
        if (videoDownloadStatus === 'pending' && downloadProgress.totalCount > 0) {
            return `SCARICAMENTO: ${downloadProgress.cachedCount}/${downloadProgress.totalCount}`;
        }
        return videoDownloadStatus.toUpperCase();
    };

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
                        muted
                        loop
                        controls={false}
                    />
                ) : (
                    <p>Nessun video selezionato. ID Client: {clientId}</p>
                )}
                <div className="overlay-info">
                    <p>Stato: {status}</p>
                    <p>ID Client: {clientId}</p>
                    <p>Video: {currentVideoFilename || 'Nessuno'}</p>
                    <p>Download Video: <span className={`status-${videoDownloadStatus}`}>{displayDownloadStatus()}</span></p>
                    <p>Clicca/Tocca per Fullscreen</p>
                </div>
            </header>
        </div>
    );
}

export default App;