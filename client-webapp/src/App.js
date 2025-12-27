import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';
import { Workbox } from 'workbox-window'; // Riabilita l'import di Workbox

const SERVER_URL = window.location.origin;

const generateClientId = () => {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
        clientId = `client-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('clientId', clientId);
    }
    return clientId;
};

// Funzione helper per confrontare oggetti downloadProgress
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
    const [downloadProgress, setDownloadProgress] = useState(() => ({ cachedCount: 0, totalCount: 0 }));

    const videoRef = useRef(null);
    const socketRef = useRef(null);
    const workboxRef = useRef(null); // Riferimento a Workbox
    const isConnectingRef = useRef(false); // Flag per evitare connessioni multiple

    // Riferimenti per accedere agli stati più recenti all'interno dei listener
    // Questi ref vengono aggiornati nell'useEffect seguente
    const currentVideoIdRef = useRef(currentVideoId);
    const currentVideoFilenameRef = useRef(currentVideoFilename);
    const opacityRef = useRef(opacity);
    const videoDownloadStatusRef = useRef(videoDownloadStatus);
    const downloadProgressRef = useRef(downloadProgress);
    const videoListRef = useRef(videoList);
    const statusRef = useRef(status); // Aggiunto ref per lo stato generale

    // Aggiorna i riferimenti ogni volta che gli stati cambiano
    useEffect(() => {
        currentVideoIdRef.current = currentVideoId;
        currentVideoFilenameRef.current = currentVideoFilename;
        opacityRef.current = opacity;
        videoDownloadStatusRef.current = videoDownloadStatus;
        downloadProgressRef.current = downloadProgress;
        videoListRef.current = videoList;
        statusRef.current = status; // Aggiorna anche il ref per lo stato generale
    }, [currentVideoId, currentVideoFilename, opacity, videoDownloadStatus, downloadProgress, videoList, status]);


    // Usa un ref per la funzione sendClientStatus per stabilizzare le dipendenze
    const sendClientStatusInternal = useRef();

    useEffect(() => {
        sendClientStatusInternal.current = (newStatusUpdate) => {
            if (socketRef.current && socketRef.current.connected) {
                const currentClientState = {
                    status: statusRef.current, // Usa il ref per lo stato
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
            } else {
                console.warn(`[CLIENT] Socket non connesso, impossibile inviare stato:`, newStatusUpdate);
            }
        };
    }, [clientId]); // Dipende solo da clientId per la stabilità


    const enterFullscreen = useCallback(() => {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) {
            elem.msRequestFullscreen();
        }
        setIsFullScreen(true);
        console.log('[CLIENT] Entrato in modalità Fullscreen.');
    }, []);

    // Questa funzione ora gestisce il download vero tramite Service Worker
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

            // Invia i video al Service Worker per il caching
            const videoUrls = videos.map(v => `${SERVER_URL}/videos/${v.filename}`);
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
    }, []); // Dipendenze vuote per la stabilità, usa i ref per gli stati


    // === EFFECT PER LA GESTIONE DEL SERVICE WORKER (separato) ===
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
                    // Assicurati che il progresso sia aggiornato al 100%
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

            // Registra il Service Worker
            wb.register().then(registration => {
                console.log('[CLIENT] Service Worker registrato:', registration);
                // Forza l'aggiornamento se c'è un SW in attesa
                if (registration && registration.waiting) {
                    wb.messageSW({ type: 'SKIP_WAITING' });
                }
            }).catch(error => {
                console.error('[CLIENT] Errore durante la registrazione del Service Worker:', error);
            });

            cleanupSW = () => {
                console.log('[CLIENT] Cleanup Service Worker listener.');
                if (wb) {
                    wb.removeEventListener('message', handleSWMessage);
                }
            };
        } else {
            console.warn('[CLIENT] Service Workers non supportati o disabilitati. I video NON verranno cacheati.');
            setVideoDownloadStatus('not_supported');
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'not_supported' });
            }
        }

        return () => {
            if (cleanupSW) {
                cleanupSW();
            }
        };
    }, []); // Nessuna dipendenza per la stabilità


    // === EFFECT PER LA GESTIONE DEL SOCKET.IO - ESEGUITO UNA SOLA VOLTA (con dipendenze stabili) ===
    useEffect(() => {
        console.log('[CLIENT] useEffect per il socket avviato.');

        if (isConnectingRef.current) {
            console.log('[CLIENT] Connessione in corso, saltando nuova inizializzazione socket.');
            return;
        }
        isConnectingRef.current = true;

        // Inizializza i video all'avvio usando il Service Worker
        if (workboxRef.current) {
            workboxRef.current.register().then(() => preloadVideos(workboxRef.current));
        } else {
            preloadVideos(null); // Passa null se Workbox non è stato inizializzato
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
            // Invia lo stato iniziale al server dopo la connessione
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({});
            }
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

        socketRef.current.on('videoCommand', ({ command, videoId, videoFilename, opacity: newOpacity, videoDownloadStatus: serverVideoDownloadStatus, downloadProgress: serverDownloadProgress }) => {
            console.log('[CLIENT] Comando video ricevuto dal server:', { command, videoId, videoFilename, newOpacity, serverVideoDownloadStatus, serverDownloadProgress });

            let statusUpdate = {};
            let clientStateChanged = false;

            switch (command) {
                case 'play':
                    if (videoRef.current) {
                        videoRef.current.play().catch(e => console.error("[CLIENT] Errore nel riprodurre il video:", e));
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
                case 'changeVideo':
                    if (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        console.log(`[CLIENT] Stato video aggiornato a: ${videoFilename || 'Nessuno'}`);
                        // Non forzare l'aggiornamento dello stato del client qui, verrà fatto alla fine
                        clientStateChanged = true;
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
                    console.log('[CLIENT] Ricevuto updateState dal server.');

                    if (videoId !== undefined && videoFilename !== undefined && (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current)) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        clientStateChanged = true;
                    }
                    if (typeof newOpacity === 'number' && newOpacity !== opacityRef.current) {
                        setOpacity(newOpacity);
                        clientStateChanged = true;
                    }
                    // Il downloadStatus viene ora gestito dal Service Worker, ma il server potrebbe inviare un aggiornamento
                    if (serverVideoDownloadStatus && serverVideoDownloadStatus !== videoDownloadStatusRef.current) {
                        setVideoDownloadStatus(serverVideoDownloadStatus);
                        clientStateChanged = true;
                    }
                    if (serverDownloadProgress && !areDownloadProgressEqual(serverDownloadProgress, downloadProgressRef.current)) {
                        setDownloadProgress(serverDownloadProgress);
                        clientStateChanged = true;
                    }

                    if (clientStateChanged) {
                        // Quando c'è un updateState dal server, lo stato del client sul server
                        // potrebbe essere aggiornato anche senza che il client cambi esplicitamente il suo stato.
                        // Quindi inviamo sempre l'aggiornamento.
                        statusUpdate = {
                            clientVideoStatus: videoRef.current ? (videoRef.current.paused ? 'paused' : 'playing') : 'unknown',
                            videoDownloadStatus: videoDownloadStatusRef.current,
                            downloadProgress: downloadProgressRef.current
                        };
                    }
                    break;
                default:
                    console.log('[CLIENT] Comando sconosciuto:', command);
            }

            // Invia lo stato del client se ci sono stati aggiornamenti o se il server ha inviato un 'updateState'
            if (Object.keys(statusUpdate).length > 0 || clientStateChanged) {
                 if (sendClientStatusInternal.current) {
                     sendClientStatusInternal.current(statusUpdate);
                 }
            }
        });

        return () => {
            console.log('[CLIENT] Funzione di cleanup del socket chiamata. Disconnessione esplicita.');
            if (socketRef.current) {
                socketRef.current.disconnect();
                socketRef.current = null;
            }
            isConnectingRef.current = false;
        };
    }, [clientId, preloadVideos]); // preloadVideos come dipendenza è ora più stabile


    // Questo useEffect si occupa di caricare e riprodurre il video
    useEffect(() => {
        console.log(`[CLIENT] useEffect per video cambiato. currentVideoFilename: ${currentVideoFilename}, currentVideoId: ${currentVideoId}`);
        if (videoRef.current) {
            if (currentVideoFilename) {
                const videoSrc = `${SERVER_URL}/videos/${currentVideoFilename}`;
                if (videoRef.current.src !== videoSrc) {
                    console.log(`[CLIENT] Rilevato cambio currentVideoFilename a ${currentVideoFilename}. Carico il video.`);
                    videoRef.current.src = videoSrc;
                    videoRef.current.load();
                    videoRef.current.pause();
                } else {
                    console.log(`[CLIENT] currentVideoFilename è ${currentVideoFilename} e la sorgente è già impostata. Non ricarico.`);
                }
            } else {
                console.log("[CLIENT] currentVideoFilename è null. Fermo il video e resetto lo stato.");
                videoRef.current.pause();
                videoRef.current.removeAttribute('src');
                videoRef.current.load();
            }
        }
    }, [currentVideoFilename, currentVideoId]);

    // Questo useEffect per il fullscreen è già stabile.
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullScreen(!!document.fullscreenElement || !!document.webkitFullscreenElement || !!document.msFullscreenElement);
            console.log(`[CLIENT] Fullscreen status changed to: ${!!document.fullscreenElement}`);
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

    const handleVideoEnded = useCallback(() => {
        console.log('[CLIENT] Video terminato.');
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'ended' });
        }
    }, []); // Non dipende da sendClientStatus

    const handleVideoPlay = useCallback(() => {
        console.log('[CLIENT] Video in riproduzione.');
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'playing' });
        }
    }, []); // Non dipende da sendClientStatus

    const handleVideoPause = useCallback(() => {
        console.log('[CLIENT] Video in pausa.');
        if (sendClientStatusInternal.current) {
            sendClientStatusInternal.current({ clientVideoStatus: 'paused' });
        }
    }, []); // Non dipende da sendClientStatus

    const handleVideoLoad = useCallback(() => {
        console.log('[CLIENT] Video data caricati.');
    }, []);

    const displayDownloadStatus = () => {
        if (videoDownloadStatus === 'pending') {
            if (downloadProgress.totalCount > 0) {
                return `SCARICAMENTO: ${downloadProgress.cachedCount}/${downloadProgress.totalCount}`;
            }
            return 'SCARICAMENTO IN CORSO...';
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
                        src={`${SERVER_URL}/videos/${currentVideoFilename}`}
                        className="fullscreen-video"
                        onEnded={handleVideoEnded}
                        onPlay={handleVideoPlay}
                        onPause={handleVideoPause}
                        onLoadedData={handleVideoLoad}
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