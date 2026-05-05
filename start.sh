#!/bin/sh

# Avvia il server Node in background
echo "Avvio del server..."
npm run server &

# Avvia il bridge OSC
echo "Avvio del bridge OSC..."
npm run start:bridge &

# Mantieni il container vivo
wait
