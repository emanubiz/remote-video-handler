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

        registerClientHandlers(io, socket);

        socket.on('disconnect', () => {
            console.log(`[SERVER] Socket disconnesso: ${socket.id}`);
        });
    });

    return io;
};