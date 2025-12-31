const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs'); 

const videosRoutes = require('./api/videos.routes');
const clientsRoutes = require('./api/clients.routes');

const app = express();

app.use(cors());
app.use(express.json());

const adminBuildPath = path.join(__dirname, '..','static', 'admin-frontend'); 
const clientBuildPath = path.join(__dirname, '..','static', 'client-webapp'); 
const videosPath = path.join(__dirname,'..','static', 'videos'); 

app.use('/videos', express.static(videosPath, {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.mp4')) {
            res.set('Cache-Control', 'public, max-age=3600');
        }
    }
}));

app.use('/api', videosRoutes);
app.use('/api', clientsRoutes);

app.use('/admin', express.static(adminBuildPath));
app.get(['/admin', '/admin/', '/admin/*'], (req, res) => {
    res.sendFile(path.join(adminBuildPath, 'index.html'));
});

app.use('/client', express.static(clientBuildPath));
app.get(['/client', '/client/', '/client/*'], (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.get('*', (req, res) => {
    res.status(404).send('Not Found');
});

module.exports = app;