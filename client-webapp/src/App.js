// --- START OF FILE App.js ---

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import './App.css';
// import { Workbox } from 'workbox-window'; // <--- Commentato: Non importiamo più Workbox

const SERVER_URL = window.location.origin;

const generateClientId = () => {
    let clientId = localStorage.getItem('clientId');
    if (!clientId) {
        clientId = `client-${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('clientId', clientId);
    }
    return clientId;
};

function App() {
    const [clientId] = useState(generateClientId());
    const [currentVideoFilename, setCurrentVideoFilename] = useState(null);
    const [currentVideoId, setCurrentVideoId] = useState(null);
    const [status, setStatus] = useState('Connessione...');
    const [opacity, setOpacity] = useState(1);
    // Manteniamo lo stato di download, ma senza l'interazione diretta con il SW per Workbox.
    // Il download si riferirà alla capacità del browser di gestire la cache dei media.
    const [videoDownloadStatus, setVideoDownloadStatus] = useState('pending');
    const [downloadProgress, setDownloadProgress] = useState({ cachedCount: 0, totalCount: 0 });

    const videoRef = useRef(null);
    const socketRef = useRef(null);
    // const workboxRef = useRef(null); // <--- Commentato: Non usiamo più workboxRef
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
        console.log('[CLIENT] Entrato in modalità Fullscreen.');
    }, []);

    // La funzione preloadVideos ora non interagirà con il Service Worker,
    // ma può essere usata per simulare o avviare un preload tradizionale se necessario.
    // Per ora, la rendiamo una no-op (operazione nulla) per il contesto del SW.
    // Se vuoi una logica di preload JavaScript personalizzata, andrebbe qui.
    const preloadVideos = useCallback(async () => {
        console.log('[CLIENT] La funzionalità di precaricamento video tramite Service Worker è disabilitata.');
        // Puoi aggiungere qui la logica per ottenere la lista video se vuoi,
        // ma non farà un caching proattivo come un SW.
        try {
            const response = await fetch(`${SERVER_URL}/api/videos`);
            const videos = await response.json();
            videoListRef.current = videos;
            console.log('[CLIENT] Lista video dal server (per riferimento):', videos);

            // Se vuoi simulare un "completato" per i video semplicemente listati:
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
        // Nessun cleanup per il SW, in quanto non viene registrato qui
        // let cleanupSW; // <--- Commentato
        
        // Rimuovi tutta la logica di inizializzazione e gestione di Workbox e del Service Worker.
        // if ('serviceWorker' in navigator && typeof Workbox !== 'undefined') { // <--- Commentato
        //     workboxRef.current = new Workbox('/client/service-worker.js'); // <--- Commentato
        //     const wb = workboxRef.current; // <--- Commentato

        //     const handleSWMessage = (event) => { // <--- Commentato
        //         console.log('[CLIENT] Messaggio dal SW:', event.data); // <--- Commentato
        //         if (event.data.type === 'VIDEOS_CACHING_PROGRESS') { // <--- Commentato
        //             const { cachedCount, totalCount } = event.data; // <--- Commentato
        //             setDownloadProgress({ cachedCount, totalCount }); // <--- Commentato
        //             if (sendClientStatusInternal.current) { // <--- Commentato
        //                 sendClientStatusInternal.current({ // <--- Commentato
        //                     videoDownloadStatus: 'pending', // <--- Commentato
        //                     downloadProgress: { cachedCount, totalCount } // <--- Commentato
        //                 }); // <--- Commentato
        //             } // <--- Commentato
        //         } else if (event.data.type === 'VIDEOS_CACHING_COMPLETE') { // <--- Commentato
        //             setVideoDownloadStatus('complete'); // <--- Commentato
        //             setDownloadProgress({ cachedCount: event.data.cachedCount, totalCount: event.data.totalCount }); // <--- Commentato
        //             if (sendClientStatusInternal.current) { // <--- Commentato
        //                 sendClientStatusInternal.current({ // <--- Commentato
        //                     videoDownloadStatus: 'complete', // <--- Commentato
        //                     downloadProgress: { cachedCount: event.data.cachedCount, totalCount: event.data.totalCount } // <--- Commentato
        //                 }); // <--- Commentato
        //             } // <--- Commentato
        //         } else if (event.data.type === 'VIDEOS_CACHING_ERROR') { // <--- Commentato
        //             setVideoDownloadStatus('error'); // <--- Commentato
        //             setDownloadProgress({ cachedCount: event.data.cachedCount, totalCount: event.data.totalCount }); // <--- Commentato
        //             if (sendClientStatusInternal.current) { // <--- Commentato
        //                 sendClientStatusInternal.current({ // <--- Commentato
        //                     videoDownloadStatus: 'error', // <--- Commentato
        //                     error: event.data.error, // <--- Commentato
        //                     downloadProgress: { cachedCount: event.data.cachedCount, totalCount: event.data.totalCount } // <--- Commentato
        //                 }); // <--- Commentato
        //             } // <--- Commentato
        //         } // <--- Commentato
        //     }; // <--- Commentato

        //     wb.addEventListener('message', handleSWMessage); // <--- Commentato

        //     wb.register().then(registration => { // <--- Commentato: Questa è la riga che causava il SecurityError
        //         console.log('[CLIENT] Service Worker registrato:', registration); // <--- Commentato
        //         if (registration && registration.waiting) { // <--- Commentato
        //             wb.messageSW({ type: 'SKIP_WAITING' }); // <--- Commentato
        //         } // <--- Commentato
        //     }).catch(error => { // <--- Commentato
        //         console.error('[CLIENT] Errore durante la registrazione del Service Worker:', error); // <--- Commentato
        //     }); // <--- Commentato

        //     cleanupSW = () => { // <--- Commentato
        //         if (wb) wb.removeEventListener('message', handleSWMessage); // <--- Commentato
        //     }; // <--- Commentato
        // } else { // <--- Commentato
            console.warn('[CLIENT] Service Workers disabilitati o non supportati per scelta.');
            setVideoDownloadStatus('not_supported'); // O un altro stato per indicare che non si usa SW
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ videoDownloadStatus: 'not_supported' });
            }
        // } // <--- Commentato

        // return () => { // <--- Commentato
        //     if (cleanupSW) cleanupSW(); // <--- Commentato
        // }; // <--- Commentato
    }, []); // Nessuna dipendenza da workboxRef ora

    useEffect(() => {
        if (isConnectingRef.current) return;
        isConnectingRef.current = true;

        // Rimuovi il riferimento a workboxRef.current.register() e preloadVideos(workboxRef.current)
        // Chiama preloadVideos direttamente, ora che è una funzione "non-SW"
        preloadVideos();

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
                case 'changeVideo':
                    if (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        console.log(`[CLIENT] Cambio video a: ${videoFilename}`);
                        clientStateChanged = true;
                        shouldAutoplayAfterLoad.current = true; // Set flag to autoplay after load
                    }
                    break;

                case 'changeVideoAndPlay':
                    if (videoId !== currentVideoIdRef.current || videoFilename !== currentVideoFilenameRef.current) {
                        setCurrentVideoId(videoId);
                        setCurrentVideoFilename(videoFilename);
                        console.log(`[CLIENT] Cambio video a: ${videoFilename} e avvio riproduzione.`);
                        clientStateChanged = true;
                        shouldAutoplayAfterLoad.current = true; // Set flag to autoplay after load
                    } else {
                        shouldAutoplayAfterLoad.current = true; // Set flag to autoplay if same video
                    }
                    break;

                case 'play':
                    if (videoRef.current) {
                        videoRef.current.play().catch(e => console.error("[CLIENT] Errore play:", e));
                        statusUpdate.clientVideoStatus = 'playing';
                        clientStateChanged = true;
                        shouldAutoplayAfterLoad.current = true; // Ensure play is attempted
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
            shouldAutoplayAfterLoad.current = false; // Reset the flag
            if (sendClientStatusInternal.current) {
                sendClientStatusInternal.current({ clientVideoStatus: 'playing' });
            }
        }
    }, []);


    const displayDownloadStatus = () => {
        // La logica di download è ora più generica e non legata allo stato specifico del SW.
        // Puoi adattarla in base a come vuoi rappresentare il "download" senza un SW.
        if (videoDownloadStatus === 'pending' && downloadProgress.totalCount > 0) {
            // Se in futuro implementerai un download manager JS personalizzato, potresti aggiornare questo.
            return `SCARICAMENTO (browser): ${downloadProgress.cachedCount}/${downloadProgress.totalCount}`;
        } else if (videoDownloadStatus === 'not_supported') {
            return 'NON SUPPORTATO (SW disabilitato)';
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