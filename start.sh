#!/bin/sh

# 1. Configura ngrok con il token
if [ -n "$NGROK_AUTHTOKEN" ]; then
  echo "Configurazione di ngrok authtoken..."
  ngrok config add-authtoken "$NGROK_AUTHTOKEN"
else
  echo "AVVISO: NGROK_AUTHTOKEN non impostato. Ngrok potrebbe non funzionare correttamente."
fi

# 2. Avvia il server Node in background
echo "Avvio del server..."
npm run server &

# Attendi che il server si avvii
sleep 5

# 3. Avvia ngrok sulla porta 3000 (root, senza path)
echo "Avvio di ngrok sulla porta 3000 (root)"
ngrok http 3000 --log=stdout &

# Attendi che ngrok stabilisca il tunnel
sleep 10

# 4. Recupera l'URL pubblico
echo "Recupero URL pubblico e generazione QR code..."

PUBLIC_URL=""
for i in $(seq 1 10); do
  PUBLIC_URL=$(curl -s http://127.0.0.1:4040/api/tunnels | \
               grep -o '"public_url":"https://[^"]*' | \
               head -1 | cut -d'"' -f4)

  if [ -n "$PUBLIC_URL" ]; then
    break
  fi
  echo "Tentativo $i: ngrok API non ancora pronta. Riprovo..."
  sleep 2
done

if [ -z "$PUBLIC_URL" ]; then
  echo "Errore: Impossibile ottenere l'URL pubblico da ngrok."
  echo "Controlla il token, la connessione e i log sopra."
  exit 1
fi

# URL base (serve per admin o debug)
echo "URL base ngrok: $PUBLIC_URL"
echo "(aprire questa da browser dà probabilmente 404, è normale)"

# URL per la PWA client (questa è quella importante!)
CLIENT_URL="$PUBLIC_URL/client/"

echo ""
echo "=== USA QUESTO PER LA TUA PWA ==="
echo "URL Client: $CLIENT_URL"
echo ""
echo "Scansiona questo QR code con il tuo dispositivo:"
npx qrcode-terminal "$CLIENT_URL"

echo ""
echo "Admin disponibile su: $PUBLIC_URL/admin/"

# Mantieni il container vivo
wait