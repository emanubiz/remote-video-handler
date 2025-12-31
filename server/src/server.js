const fs = require('fs');
const https = require('https'); // Importa il modulo HTTPS
const selfsigned = require('selfsigned'); // Importa per la generazione dei certificati
const app = require('./app');
const initializeSocketIO = require('./sockets');

const PORT = process.env.PORT || 3000;
const CERT_DIR = './cert'; // Directory per i certificati
const KEY_PATH = `${CERT_DIR}/server.key`; // Percorso della chiave privata
const CRT_PATH = `${CERT_DIR}/server.crt`; // Percorso del certificato

// Funzione asincrona per avviare il server
async function startServer() {
    // Crea la directory 'cert' se non esiste
    if (!fs.existsSync(CERT_DIR)) {
        fs.mkdirSync(CERT_DIR);
    }

    // Genera certificati self-signed se non esistono già
    if (!fs.existsSync(KEY_PATH) || !fs.existsSync(CRT_PATH)) {
        console.log('Generazione di certificati SSL/TLS self-signed...');
        const attrs = [{ name: 'commonName', value: 'localhost' }];
        const pems = await selfsigned.generate(attrs, { days: 365, keySize: 2048, algorithm: 'sha256' });

        fs.writeFileSync(KEY_PATH, pems.private);
        fs.writeFileSync(CRT_PATH, pems.cert);
        console.log('Certificati generati con successo in ./cert/');
    }

    // Leggi i certificati per il server HTTPS
    const options = {
        key: fs.readFileSync(KEY_PATH),
        cert: fs.readFileSync(CRT_PATH),
    };

    // Crea un server HTTPS invece di HTTP
    const server = https.createServer(options, app);

    const io = initializeSocketIO(server);

    server.listen(PORT, '0.0.0.0', () => {
        console.log(`Server HTTPS in ascolto sulla porta ${PORT}`);
        console.log(`Dashboard Admin disponibile su https://localhost:${PORT}/admin`);
        console.log(`Client PWA disponibile su https://localhost:${PORT}/client`);
        console.log(`Client PWA disponibile anche su https://192.168.68.118:${PORT}/client (accettare warning browser)`);
    });

    return { server, io }; // Esporta server e io se necessario da altre parti del codice
}

// Avvia il server
startServer().then(({ server, io }) => {
    // Qui puoi fare qualcosa con 'server' e 'io' se necessario
    // ad esempio, puoi riassegnarli a module.exports se altri file
    // li importano come un oggetto risolto da una Promise.
    module.exports.server = server;
    module.exports.io = io;
}).catch(err => {
    console.error('Errore durante l\'avvio del server:', err);
    process.exit(1); // Esce dal processo in caso di errore
});

// Esporta un oggetto vuoto inizialmente, o una Promise,
// se altri moduli importano questo file.
// La Promise sopra (`startServer().then(...)`) è un modo per gestirlo.
module.exports = {};