# GymBro

Web app personale per la palestra: schede, sessioni di allenamento, progressi, cardio e misure del corpo.
Un solo utente, un solo container, nessun servizio cloud: database e foto stanno in una cartella del tuo NAS.

- **Si usa dal telefono** come app installabile (PWA), anche senza rete: la sessione si salva sul dispositivo e si sincronizza appena il server torna raggiungibile.
- **Stack**: Node 24, Fastify, SQLite integrato in Node, React, TypeScript.

## Indice

1. [Avvio rapido sul PC](#avvio-rapido-sul-pc)
2. [Installazione sul NAS](#installazione-sul-nas)
3. [HTTPS: perché serve e come ottenerlo](#https-perché-serve-e-come-ottenerlo)
4. [Installare l'app sul telefono](#installare-lapp-sul-telefono)
5. [Variabili d'ambiente](#variabili-dambiente)
6. [Dove stanno i dati](#dove-stanno-i-dati)
7. [Backup](#backup)
8. [Ripristino](#ripristino)
9. [Esportazione e importazione](#esportazione-e-importazione)
10. [Coach AI](#coach-ai)
11. [Promemoria](#promemoria)
12. [Aggiornare GymBro](#aggiornare-gymbro)
13. [Sviluppo](#sviluppo)
14. [Problemi comuni](#problemi-comuni)

## Avvio rapido sul PC

Serve Docker con Docker Compose.

```bash
cp .env.example .env
```

Apri `.env` e imposta almeno `GYMBRO_PASSWORD`, poi:

```bash
docker compose up -d --build
```

L'app risponde su `http://localhost:8080`. Su `localhost` funzionano anche installazione e uso offline, senza HTTPS.

## Installazione sul NAS

Lo stesso `docker-compose.yml` vale per PC e NAS. Serve un NAS che esegua Docker (su Synology "Container Manager", su QNAP "Container Station") con processore x86-64 o ARM a 64 bit.

1. Copia questa cartella sul NAS, per esempio in una cartella condivisa `docker/gymbro`.
2. Crea il file `.env` partendo da `.env.example` e imposta:
   - `GYMBRO_PASSWORD`: la password di accesso.
   - `GYMBRO_DATA`: la cartella dei dati, per esempio `/volume1/docker/gymbro/data`.
   - `GYMBRO_BACKUPS`: la cartella delle copie, se possibile su un volume o disco diverso.
3. Avvia il container. Da terminale (SSH), nella cartella del progetto:

   ```bash
   docker compose up -d --build
   ```

   In alternativa, dall'interfaccia del NAS crea un nuovo progetto Compose indicando questa cartella.
4. Controlla che risponda: `http://IP-DEL-NAS:8080`.

La prima build scarica l'immagine di Node e le dipendenze: su un NAS può richiedere alcuni minuti.

Se il NAS salva i file con un utente diverso da `root` e vuoi che il container scriva con quell'utente, aggiungi al servizio in `docker-compose.yml` una riga `user: "UID:GID"` con i tuoi identificativi, dopo aver dato a quell'utente i permessi sulle due cartelle.

## HTTPS: perché serve e come ottenerlo

I browser permettono installazione come app, uso offline, schermo sempre acceso e notifiche solo su una connessione sicura (HTTPS) o su `localhost`. Su `http://IP-DEL-NAS:8080` l'app si usa, ma solo online e senza queste funzioni. Due strade:

**Reverse proxy del NAS con certificato.** Synology e QNAP hanno un reverse proxy integrato e la gestione dei certificati Let's Encrypt. Crea una regola che inoltra `https://gymbro.tuodominio` verso `http://localhost:8080` e assegna il certificato a quel nome. Serve un nome di dominio che punti al NAS (va bene anche il DDNS del produttore). Se esponi il NAS a internet, scegli una password robusta: è l'unica protezione dell'app.

**Tailscale.** Installa Tailscale sul NAS e sul telefono, poi sul NAS:

```bash
tailscale serve --bg 8080
```

Ottieni un indirizzo `https://nome-nas.tuo-tailnet.ts.net` con certificato valido, raggiungibile solo dai tuoi dispositivi, anche fuori casa e senza aprire porte sul router.

In entrambi i casi GymBro riceve l'intestazione `X-Forwarded-Proto` e imposta da solo il cookie di sessione come sicuro.

## Installare l'app sul telefono

Apri l'indirizzo HTTPS nel browser del telefono e accedi.

- **Android (Chrome)**: menu ⋮ → "Aggiungi a schermata Home" / "Installa app".
- **iPhone (Safari)**: pulsante Condividi → "Aggiungi alla schermata Home".

Alla prima apertura l'app scarica i dati; da quel momento si avvia anche senza rete. Le modifiche fatte offline restano sul dispositivo e partono verso il server appena è raggiungibile: lo stato si vede in **Altro → Sincronizzazione**.

Su iPhone la vibrazione non è disponibile e le notifiche funzionano solo dall'app installata nella schermata Home.

## Variabili d'ambiente

Si impostano nel file `.env` accanto a `docker-compose.yml`.

| Variabile | Predefinito | A cosa serve |
|---|---|---|
| `GYMBRO_PASSWORD` | — (obbligatoria) | Password di accesso. Cambiandola, tutti i dispositivi devono rifare l'accesso. |
| `GYMBRO_PORT` | `8080` | Porta su cui il NAS espone l'app. |
| `GYMBRO_DATA` | `./data` | Cartella dei dati: database e foto. |
| `GYMBRO_BACKUPS` | `./backups` | Cartella delle copie automatiche. |
| `BACKUP_TIME` | `03:00` | Ora del backup giornaliero, formato `HH:MM`. |
| `BACKUP_KEEP` | `7` | Copie del database conservate. `0` disattiva il backup automatico. |
| `TZ` | `Europe/Rome` | Fuso orario usato per backup e promemoria. |
| `ANTHROPIC_API_KEY` | vuota | Chiave API di Anthropic per il Coach AI. Senza, la sezione è nascosta. |
| `PUSH_CONTACT` | `mailto:gymbro@example.com` | Contatto dichiarato ai servizi di notifica dei browser. |

Dopo una modifica al file `.env`:

```bash
docker compose up -d
```

## Dove stanno i dati

Tutto ciò che conta è nella cartella `GYMBRO_DATA`:

| Percorso | Contenuto |
|---|---|
| `gymbro.db` (più `gymbro.db-wal` e `gymbro.db-shm`) | Database SQLite: esercizi, schede, sessioni, cardio, misure, impostazioni. |
| `photos/` | Foto degli esercizi e foto di avanzamento, un file JPEG per foto. |
| `.secret` | Segreto con cui vengono firmate le sessioni di accesso. |
| `.vapid.json` | Chiavi per le notifiche push. |

Ogni telefono tiene inoltre una copia locale dei dati per funzionare offline; la copia di riferimento è quella sul server.

## Backup

**Automatico.** Ogni giorno all'ora `BACKUP_TIME` GymBro scrive nella cartella `GYMBRO_BACKUPS`:

- `db/gymbro-AAAA-MM-GG_HHMMSS.db`: una copia coerente del database, fatta anche con l'app in uso. Si conservano le ultime `BACKUP_KEEP` copie.
- `photos/`: copia delle foto. Le foto non cambiano dopo il salvataggio, quindi a ogni giro si aggiungono solo quelle nuove.

Da **Altro → Dati e backup** vedi le copie presenti e puoi farne una subito con "Esegui ora". Se il container era spento all'ora prevista, il backup parte al primo avvio successivo della giornata.

Tieni `GYMBRO_BACKUPS` su un disco diverso da quello dei dati, oppure includi quella cartella nel backup del NAS verso un altro dispositivo: una copia sullo stesso disco non protegge da un guasto del disco.

**Manuale.** Il backup è anche la copia della cartella dei dati. Per una copia sicura ferma prima il container:

```bash
docker compose stop
```

```bash
cp -a data data-copia
```

```bash
docker compose start
```

## Ripristino

Da una copia automatica:

1. Ferma il container.

   ```bash
   docker compose stop
   ```

2. Sostituisci il database con la copia scelta ed elimina i due file di servizio, che appartengono al database vecchio.

   ```bash
   cp backups/db/gymbro-2026-11-18_030000.db data/gymbro.db
   ```

   ```bash
   rm -f data/gymbro.db-wal data/gymbro.db-shm
   ```

3. Ripristina le foto.

   ```bash
   cp -a backups/photos/. data/photos/
   ```

4. Riavvia.

   ```bash
   docker compose start
   ```

Su un NAS nuovo: installa GymBro come sopra, avvialo una volta, poi segui gli stessi passaggi. Se non ripristini anche `.secret` e `.vapid.json`, dovrai rifare l'accesso e riattivare i promemoria su ogni dispositivo.

Dopo un ripristino i telefoni possono avere modifiche più recenti della copia: alla prima sincronizzazione le rimandano al server, quindi non si perde ciò che era rimasto sul dispositivo.

## Esportazione e importazione

In **Altro → Dati e backup**:

- **Tutto in JSON**: tutti i dati, con le foto se lasci attiva l'opzione. È un file unico, leggibile e reimportabile.
- **Sessioni in CSV** e **Cardio in CSV**: per fogli di calcolo. Separatore punto e virgola e virgola decimale, come si aspetta Excel in italiano. Nel file delle sessioni c'è una riga per ogni serie.
- **Importa**: carica un JSON esportato da GymBro. I dati del file si aggiungono a quelli presenti; se un elemento esiste già vale la versione del file. Non cancella nulla.

## Coach AI

Facoltativo. Imposta `ANTHROPIC_API_KEY` in `.env` e riavvia: compare **Altro → Coach AI**, con tre funzioni.

- **Progressione dei carichi**: cosa puntare nella prossima sessione, esercizio per esercizio.
- **Esercizi fermi**: dove non stai progredendo e una cosa concreta da provare.
- **Nuova scheda**: da obiettivo, giorni a settimana e durata; la proposta si salva come bozza modificabile.

Quando premi uno di questi pulsanti, il server invia ad Anthropic un riassunto di scheda attiva, sessioni delle ultime dodici settimane, peso corporeo e, per la nuova scheda, l'elenco degli esercizi. Non vengono inviate foto. Ogni richiesta ha un costo sul tuo account Anthropic. Il modello usato è Claude Opus 5.5; se declina una richiesta, l'API riprova da sola con un modello di riserva.

Senza chiave la sezione non compare e tutto il resto funziona.

## Promemoria

In **Altro → Promemoria** attivi una notifica nei giorni di allenamento previsti, all'ora che scegli. Arriva solo se quel giorno non ti sei ancora allenato.

- I giorni previsti sono quelli della scheda attiva: apri un giorno della scheda e scegli il giorno della settimana.
- Ogni dispositivo va attivato una volta con "Attiva su questo dispositivo"; "Invia una prova" verifica che arrivi.
- Servono HTTPS e, su iPhone, l'app installata nella schermata Home.
- Le notifiche passano dai server push del browser (Google, Apple o Mozilla), con contenuto cifrato: è l'unico modo per riceverle ad app chiusa. Se disattivi i promemoria, GymBro non contatta nessun servizio esterno.

## Aggiornare GymBro

```bash
git pull
```

```bash
docker compose up -d --build
```

I dati non vengono toccati: le nuove tabelle e colonne si aggiungono da sole all'avvio. Sul telefono l'app si aggiorna da sola alla riapertura successiva.

## Sviluppo

```bash
npm install
```

```bash
GYMBRO_PASSWORD=prova npm run dev
```

Il server gira sulla porta 8080 e l'interfaccia, con ricaricamento automatico, sulla 5173. `npm run typecheck` controlla i tipi; `npm run build` produce `dist/`.

| Cartella | Contenuto |
|---|---|
| `shared/` | Schema dei dati, condiviso tra server e interfaccia. |
| `server/` | API, sincronizzazione, backup, promemoria, coach. |
| `web/` | Interfaccia React e service worker. |

## Problemi comuni

- **"Imposta GYMBRO_PASSWORD nel file .env"** all'avvio: manca il file `.env` o la variabile è vuota.
- **L'app non si installa o non funziona offline**: la stai aprendo in HTTP da un indirizzo diverso da `localhost`. Vedi [HTTPS](#https-perché-serve-e-come-ottenerlo).
- **"Server non raggiungibile" in Sincronizzazione**: il telefono non vede il NAS. I dati restano sul dispositivo e partono al ritorno della connessione.
- **Lo schermo si spegne durante la sessione**: lo schermo acceso richiede HTTPS; su alcuni telefoni il risparmio energetico lo impedisce comunque.
- **Il timer non suona a telefono bloccato**: i browser sospendono le pagine in secondo piano; l'avviso scatta appena riapri l'app.
- **Il backup fallisce**: controlla che la cartella `GYMBRO_BACKUPS` esista e sia scrivibile; l'errore compare in **Dati e backup** e nei log (`docker compose logs gymbro`).
- **Password dimenticata**: cambiala in `.env` e riavvia con `docker compose up -d`.
