const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); 

const videosRoutes = require('./api/videos.routes');
const clientsRoutes = require('./api/clients.routes');
// const config = require('./config'); 

const app = express();

// Middleware globali
app.use(cors());
app.use(express.json());

// Path ai contenuti statici
const adminBuildPath = path.join(__dirname, '..','static', 'admin-frontend'); 
const clientBuildPath = path.join(__dirname, '..','static', 'client-webapp'); 
const videosPath = path.join(__dirname,'..','static', 'videos'); 

// Middleware per servire i video
app.use('/videos', express.static(videosPath, {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.mp4')) {
            res.set('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// API Routes
app.use('/api', videosRoutes);
app.use('/api', clientsRoutes);

// Servire l'applicazione Admin
app.use('/admin', express.static(adminBuildPath));
app.get(['/admin', '/admin/', '/admin/*'], (req, res) => {
    res.sendFile(path.join(adminBuildPath, 'index.html'));
});

// Servire l'applicazione Client
app.use('/client', express.static(clientBuildPath));
app.get(['/client', '/client/', '/client/*'], (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Gestione 404 per qualsiasi altra rotta non gestita
app.get('*', (req, res) => {
    res.status(404).send('Not Found');
});

module.exports = app;