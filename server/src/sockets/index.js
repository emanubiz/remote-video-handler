const { Server } = require('socket.io');
const registerClientHandlers = require('./client.socket'); 

module.exports = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        }
    });

    io.on('connection', (socket) => {
        console.log(`[SERVER] Connessione Socket.IO ricevuta: ${socket.id}`);

        // Registra tutti i gestori di eventi per questo socket
        registerClientHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log(`[SERVER] Socket disconnesso: ${socket.id}`);
            // La logica di aggiornamento dello stato del client disconnesso è gestita nel client.socket.js
        });
    });

    return io;
};