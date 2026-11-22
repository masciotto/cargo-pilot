# CARGO PILOT

Gioco di volo, dogana e contrabbando in **terminale**, giocabile anche **dal
browser**. Prototipo dimostrativo per PLAY: nessuna dipendenza esterna per il
gioco (solo Node.js); il server web serve solo a esporlo online.

---

## Gioca dal browser (versione online)

```bash
npm install     # una tantum (compila node-pty)
npm run serve   # http://localhost:3210
```

Apri `http://localhost:3210`: si apre un terminale xterm.js con il gioco.
Ogni connessione avvia una partita nuova. `Ctrl+C` nel terminale esce dalla
partita; chiudere la scheda chiude la sessione.

---

## Gioca da terminale (senza server)

Serve solo Node, zero `npm install`:

```bash
node game.js
```

Oppure, per la prova automatica (l'autopilota risponde da solo, deve uscire
con codice `0`):

```bash
node game.js < /dev/null
```

---

## Come si gioca

Ogni livello è un volo completo in tre fasi animate: **decollo**, **crociera**,
**atterraggio**. Prima di partire scegli l'aeroporto di partenza, a metà volo
quello di arrivo: pista lunga = comoda ma costosa, pista corta = vento più
forte, diritti più bassi e meno margini.

| Dove | Cosa fare |
|---|---|
| Menu, scelta aeroporti e quiz | scrivi il numero della voce (es. `2`) e `INVIO` |
| Mazzetta al doganiere | `s` per pagare, `N` (o `INVIO`) per rifiutare |
| **Decollo** | `←`/`→` (o `A`/`D`) tieni l'asse contro il traverso; a **Vr** (lampeggio) premi `↑` (`W`) per staccare. Se superi la fine della pista esci dalla corsia |
| **Crociera** | `↑`/`↓` (o `W`/`S`) schiva uccelli, tempeste e creste; le taniche verdi `+` riforniscono (il carburante brucia davvero) |
| **Atterraggio — avvicinamento** | `↑`/`↓` regola la prua sul sentiero di 3° (PAPI: 2 bianche + 2 rosse = giusto), `←`/`→` il traverso; a terra più dolce è meglio |
| **Atterraggio — rullaggio** | `SPAZIO` (o `S`) freni, `←`/`→` tieni l'asse: devi fermarti prima della fine pista |
| Riepilogo / "INVIO per continuare" | solo `INVIO` |
| Uscire in qualsiasi momento | `Ctrl` + `C` |

La qualità del volo entra nei conti: decollo perfetto e atterraggio morbido
abbassano la tassa di dogana, atterraggio duro o fuori pista la alzano e
ammaccano l'aereo. Rispondere bene ai quiz (fase documenti) dà lo sconto
consulente.

I 7 livelli: Torino → Parigi → Londra → Casablanca → Dubai → Singapore →
New York → Sydney. Fine partita con 5 stelle di ricercato (arresto), cassa in
rosso (bancarotta) o giro del mondo completato.

---

## Struttura

```
game.js          orchestratore: menu, quiz, dogana, statistiche
lib/
  data.js        sponsor, quiz, 7 livelli + aeroporti/piste
  ui.js          helper TUI (menu, box, sleep)
  engine.js      loop di fase: tasti, tick, chrome del frame
  render.js      frame buffer ANSI 256 colori
  sprites.js     aereo, nuvole, ostacoli, terreno
  scene.js       proiezione prospettica della pista
  flight.js      sequenza decollo → crociera → arrivo → atterraggio
  takeoff.js     fase decollo (Vr, traverso, stallo)
  cruise.js      fase crociera (ostacoli, carburante, vento)
  landing.js     avvicinamento PAPI + rullaggio
tools/
  preview-sprites.js   anteprima sprite/scena (PLAIN=1 per output pulito)
web/
  server.js      express + ws + node-pty → terminale nel browser
  public/        pagina xterm.js
```

---

## Deploy online

Il progetto è pensato per un host con WebSocket + PTY (Render, Railway,
Fly.io o un VPS). In tutti i casi:

```bash
npm install
npm run serve          # ascolta su $PORT (default 3210)
```

- **Render**: `npm install` come build, `node web/server.js` come start,
  health check su `/health`.
- **Vercel/non funziona**: serverless senza PTY persistente.
- **Tunnel rapido** (prova dal PC): `cloudflared tunnel --url
  http://localhost:3210` oppure `ngrok http 3210`.

---

## Licenza

MIT. Prototipo dimostrativo, non un prodotto commerciale.
