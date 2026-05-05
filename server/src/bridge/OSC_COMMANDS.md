# Documentazione Comandi OSC per il Ponte

Questo file documenta tutti i comandi OSC che possono essere inviati allo script `osc-bridge.js` per controllare i client video.

**Indirizzo di Ascolto:** `127.0.0.1` (localhost)
**Porta di Ascolto:** `9000`

---

## Comandi di Controllo

Questi comandi servono a gestire il ponte stesso e a ottenere informazioni.

### `/command/getVideos`
- **Descrizione:** Richiede al ponte di chiedere al server la lista di tutti i video disponibili nella cartella `server/static/videos`. La lista dei nomi dei file verrà stampata nella console del ponte.
- **Argomenti:** Nessuno.

### `/command/getTargets`
- **Descrizione:** Richiede al ponte di stampare nella sua console la lista di tutti i `clientId` attualmente connessi e disponibili come target. Utile per sapere quali ID usare con `/command/setTarget`.
- **Argomenti:** Nessuno.

### `/command/setTarget`
- **Descrizione:** Imposta il client (o i client) che riceveranno i comandi successivi. Questo è un comando "stateful": il target che imposti rimane attivo finché non lo cambi di nuovo. Il valore di default all'avvio è `all`.
- **Argomenti:**
  1.  `targetId` (stringa): L'ID del client su cui agire, oppure la stringa letterale `all` per inviare i comandi a tutti i client.

---

## Comandi di Azione

Questi comandi vengono tradotti in `adminCommand` e inviati al server per controllare la riproduzione video. Agiscono sul target impostato tramite `/command/setTarget`.

### `/command/play`
- **Descrizione:** Avvia la riproduzione del video attualmente caricato sul client target.
- **Argomenti:** Nessuno.

### `/command/pause`
- **Descrizione:** Mette in pausa il video attualmente in riproduzione sul client target.
- **Argomenti:** Nessuno.

### `/command/setOpacity`
- **Descrizione:** Imposta il livello di opacità del client target.
- **Argomenti:**
  1.  `opacity` (float): Un valore numerico da `0.0` (trasparente) a `1.0` (opaco).

### `/command/changeVideo`
- **Descrizione:** Cambia il video caricato sul client target, lasciandolo in pausa.
- **Argomenti:**
  1.  `videoId` (stringa): L'ID del video da caricare (solitamente il nome del file, es. `video1.mp4`).

### `/command/changeVideoAndPlay`
- **Descrizione:** Cambia il video caricato sul client target e lo avvia immediatamente.
- **Argomenti:**
  1.  `videoId` (stringa): L'ID del video da caricare (es. `video1.mp4`).
