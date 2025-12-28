const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const videosPath = path.join(__dirname, '..', '..', 'static', 'videos');

// Estensioni video supportate
const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.ogg', '.mov'];

router.get('/videos', (req, res) => {
    fs.readdir(videosPath, (err, files) => {
        if (err) {
            console.error('Errore lettura cartella videos:', err);
            return res.status(500).json({ error: 'Impossibile leggere i video' });
        }

        const videoFiles = files
            .filter(file => {
                const ext = path.extname(file).toLowerCase();
                return VIDEO_EXTENSIONS.includes(ext);
            })
            .map(file => {
                const filename = file;
                const name = path.basename(file, path.extname(file))
                    .replace(/_/g, ' ')
                    .replace(/\b\w/g, c => c.toUpperCase());

                return {
                    id: filename,      
                    name: name || filename,
                    filename: filename
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json(videoFiles);
    });
});

module.exports = router;