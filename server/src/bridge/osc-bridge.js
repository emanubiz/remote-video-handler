/**
 * @file osc-bridge.js
 * @brief Questo script funge da ponte tra i messaggi OSC (es. da Resolume) e il server Socket.IO.
 * Ascolta i comandi OSC e li traduce in eventi 'adminCommand' per il server, inoltrando anche lo stato dei client e la lista video.
 */

const { Server: OscServer } = require('node-osc');
const { io } = require('socket.io-client');
const https = require('https');

const OSC_LISTEN_PORT = 9000;
const OSC_LISTEN_HOST = '0.0.0.0';
const SOCKET_SERVER_URL = 'https://localhost:3000';

console.log('[BRIDGE] Avvio del ponte OSC -> Socket.IO...');

const socket = io(SOCKET_SERVER_URL, {
    reconnectionAttempts: 5,
    reconnectionDelay: 3000,
    agent: new https.Agent({
        rejectUnauthorized: false
    })
});

socket.on('connect', () => {
    console.log(`[BRIDGE] Connesso al server Socket.IO: ${SOCKET_SERVER_URL}`);
    socket.emit('requestAdminStateSync');
    console.log('[BRIDGE] Richiesto sync dello stato iniziale.');
});

socket.on('disconnect', () => {
    console.warn('[BRIDGE] Disconnesso dal server Socket.IO.');
});

socket.on('connect_error', (err) => {
    console.error(`[BRIDGE] Errore di connessione a Socket.IO: ${err.message}. Riprovo tra 3 secondi...`);
});

let knownClients = [];

socket.on('clientListUpdate', (clients) => {
    knownClients = clients;
    console.log(`[BRIDGE] Sync | Client Connessi: ${knownClients.length}`);
    if (knownClients.length > 0) {
        console.log('  -> IDs: ' + knownClients.map(c => c.clientId).join(', '));
    }
});

socket.on('videoListUpdate', (videos) => {
    console.log(`[BRIDGE] Ricevuta lista video. Video disponibili: ${videos.length}`);
    if (videos.length > 0) {
        console.log('  -> Video: ' + videos.map(v => v.filename).join(', '));
    }
});

const oscServer = new OscServer(OSC_LISTEN_PORT, OSC_LISTEN_HOST, () => {
    console.log(`[BRIDGE] Server OSC in ascolto su ${OSC_LISTEN_HOST}:${OSC_LISTEN_PORT}`);
    console.log('--- Comandi OSC disponibili ---');
    console.log('  /command/getVideos');
    console.log('  /command/getTargets');
    console.log('  /command/play');
    console.log('  /command/pause');
    console.log('  /command/changeVideo <string:videoId>');
    console.log('  /command/changeVideoAndPlay <string:videoId>');
    console.log('  /command/setOpacity <float:opacityValue (0.0-1.0)>');
    console.log('  /command/setTarget <string:targetClientId> (usa "all" per tutti)');
    console.log('  /composition/layers/1/clips/1/connect (riproduce video2.mp4)'); // Aggiunto per chiarezza
    console.log('-----------------------------------');
});

let currentTarget = 'all';

oscServer.on('message', (msg) => {
    const address = msg[0];
    const args = msg.slice(1);
    console.log(`[BRIDGE] Ricevuto OSC: ${address} | Argomenti: ${args}`);

    let commandPayload = {
        targetClientId: currentTarget,
        command: '',
        videoId: null,
        opacity: null,
    };

    switch (address) {
        case '/command/getVideos':
            console.log('[BRIDGE] Richiesta lista video...');
            socket.emit('requestVideoList');
            return;

        case '/composition/layers/1/clips/1/connect':
            console.log('[BRIDGE] Comando Resolume: riproduzione di video2.mp4...');
            commandPayload.command = 'changeVideoAndPlay';
            commandPayload.videoId = 'video2.mp4'; // Imposta direttamente il video desiderato
            break;
            

        case '/command/getTargets':
            console.log(`[BRIDGE] Lista Target richiesta. Client disponibili: ${knownClients.length}`);
             if (knownClients.length > 0) {
                console.log('  -> IDs: ' + knownClients.map(c => c.clientId).join(', '));
            }
            return;

        case '/command/play':
            commandPayload.command = 'play';
            break;
        
        case '/command/pause':
            commandPayload.command = 'pause';
            break;

        case '/command/changeVideo':
            commandPayload.command = 'changeVideo';
            commandPayload.videoId = args[0] || null;
            break;

        case '/command/changeVideoAndPlay':
            commandPayload.command = 'changeVideoAndPlay';
            commandPayload.videoId = args[0] || null;
            break;
            
        case '/command/setOpacity':
            commandPayload.command = 'setOpacity';
            commandPayload.opacity = args[0] !== undefined ? parseFloat(args[0]) : null;
            break;

        case '/command/setTarget':
            currentTarget = args[0] || 'all';
            console.log(`[BRIDGE] Target per i comandi futuri impostato a: "${currentTarget}"`);
            return; 

        default:
            console.warn(`[BRIDGE] Indirizzo OSC non riconosciuto: ${address}`);
            return;
    }

    if (commandPayload.command) {
        console.log('[BRIDGE] Invio "adminCommand" con payload:', commandPayload);
        socket.emit('adminCommand', commandPayload);
    }
});

process.on('SIGINT', () => {
    console.log('\n[BRIDGE] Chiusura del server OSC e disconnessione...');
    oscServer.close();
    socket.disconnect();
    process.exit(0);
});