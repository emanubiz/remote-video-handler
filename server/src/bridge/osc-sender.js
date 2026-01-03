// osc-sender.js
// Script per inviare messaggi OSC di test al osc-bridge.js

const { Client: OscClient } = require('node-osc');

// --- CONFIGURAZIONE SENDER ---
const OSC_RECEIVER_HOST = '127.0.0.1'; // localhost, perché il bridge è sul tuo stesso PC
const OSC_RECEIVER_PORT = 9000;       // La porta su cui il tuo bridge è in ascolto

// ---------------------------

console.log(`[SENDER] Invio messaggi OSC a ${OSC_RECEIVER_HOST}:${OSC_RECEIVER_PORT}...`);

const client = new OscClient(OSC_RECEIVER_HOST, OSC_RECEIVER_PORT);

// Messaggio di test 1: quello che Resolume dovrebbe inviare
client.send('/composition/layers/1/clips/1/connect', () => {
    console.log('[SENDER] Inviato: /composition/layers/1/clips/1/connect');
});

// Messaggio di test 2: un tuo comando riconosciuto
client.send('/command/play', () => {
    console.log('[SENDER] Inviato: /command/play');
});

// Messaggio di test 3: cambio video con ID fittizio
client.send('/command/changeVideo', 'video123.mp4', () => {
    console.log('[SENDER] Inviato: /command/changeVideo video123.mp4');
});


// Chiudi il client dopo un breve ritardo per assicurarti che i messaggi siano stati inviati
setTimeout(() => {
    client.close();
    console.log('[SENDER] Client OSC chiuso.');
}, 500); // Mezzo secondo dovrebbe essere sufficiente