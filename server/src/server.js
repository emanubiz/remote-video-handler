const http = require('http');
const app = require('./app'); 
const initializeSocketIO = require('./sockets');

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

// Inizializza Socket.IO passando il server HTTP
const io = initializeSocketIO(server);

server.listen(PORT, () => {
    console.log(`Server Node.js in ascolto sulla porta ${PORT}`);
    console.log(`Dashboard Admin disponibile su http://localhost:${PORT}/admin`);
    console.log(`Client PWA disponibile su http://localhost:${PORT}/client`);
});

module.exports = { server, io };