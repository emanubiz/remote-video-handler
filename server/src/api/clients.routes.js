const express = require('express');
const router = express.Router();
const clientsService = require('../services/clients.service'); 

router.get('/clients', (req, res) => {
    const clientsList = clientsService.getClientsListForApi();
    res.json(clientsList);
});

module.exports = router;