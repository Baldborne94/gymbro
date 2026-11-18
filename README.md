# GymBro

Web app personale per la palestra: schede, sessioni di allenamento, progressi, cardio e misure del corpo.
Un solo utente, un solo container, nessun servizio cloud: database e foto stanno in una cartella del tuo NAS.

- **Si usa dal telefono** come app installabile (PWA), anche senza rete: la sessione si salva sul dispositivo e si sincronizza appena il server torna raggiungibile.
- **Stack**: Node 24, Fastify, SQLite integrato in Node, React, TypeScript.

## Indice

1. [Avvio rapido sul PC](#avvio-rapido-sul-pc)
2. [Installazione sul NAS Synology](#installazione-sul-nas-synology)
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

## Installazione sul NAS Synology

Lo stesso `docker-compose.yml` vale per PC e NAS. Servono DSM 7.2 o successivo e un modello che supporti **Container Manager** (processore x86-64 o ARM a 64 bit).

I nomi dei menu sono quelli di DSM 7.2 in italiano; tra parentesi il nome inglese, utile se la tua versione li traduce in modo diverso.

### 1. Installa Container Manager

**Centro pacchetti** (Package Center) → cerca **Container Manager** → **Installa**. L'installazione crea la cartella condivisa `docker`.

### 2. Copia il progetto sul NAS

1. Apri **File Station**, entra nella cartella condivisa `docker` e crea la cartella `gymbro`.
2. Caricaci dentro tutti i file di questo progetto (scarica lo ZIP da GitHub, estrailo sul PC e trascina il contenuto).
3. Dentro `gymbro` crea due cartelle vuote: `data` e `backups`. **Vanno create a mano**: su Synology, Docker non crea da solo le cartelle montate e senza di esse il container non parte.
4. Sul PC copia `.env.example` in un file chiamato `.env`, imposta almeno `GYMBRO_PASSWORD` e carica il file nella cartella `gymbro`.

Il percorso completo della cartella è di solito `/volume1/docker/gymbro`.

### 3. Crea il progetto

1. Apri **Container Manager** → **Progetto** (Project) → **Crea** (Create).
2. **Nome progetto**: `gymbro`.
3. **Percorso**: scegli `/docker/gymbro`.
4. **Origine**: Container Manager trova il `docker-compose.yml` già presente e propone di usarlo; conferma.
5. Vai avanti fino alla fine lasciando disattivato il portale Web e conferma. La prima build scarica Node e le dipendenze: può richiedere diversi minuti.

Quando il progetto è in esecuzione (pallino verde), apri `http://IP-DEL-NAS:8080`.

**Se preferisci il terminale**, o se la creazione guidata dà errore: attiva SSH da **Pannello di controllo** → **Terminale e SNMP** (Terminal & SNMP) → **Abilita servizio SSH**, collegati e lancia:

```bash
cd /volume1/docker/gymbro
```

```bash
sudo docker compose up -d --build
```

Il progetto avviato così compare comunque in Container Manager.

## HTTPS: perché serve e come ottenerlo

I browser permettono installazione come app, uso offline, schermo sempre acceso e notifiche solo su una connessione sicura (HTTPS) o su `localhost`. Su `http://IP-DEL-NAS:8080` l'app si usa, ma solo online e senza queste funzioni.

### Con il DDNS e il proxy inverso di Synology

1. **Nome del NAS.** **Pannello di controllo** → **Accesso esterno** (External Access) → **DDNS** → **Aggiungi**. Scegli il provider **Synology** e un nome, per esempio `miopalestra.synology.me`. Accetta la proposta di ottenere un certificato Let's Encrypt e di impostarlo come predefinito.
2. **Regola del proxy inverso.** **Pannello di controllo** → **Portale di accesso** (Login Portal) → **Avanzate** (Advanced) → **Proxy inverso** (Reverse Proxy) → **Crea**:

   | Campo | Valore |
   |---|---|
   | Origine · Protocollo | HTTPS |
   | Origine · Nome host | `miopalestra.synology.me` |
   | Origine · Porta | `8443` |
   | Destinazione · Protocollo | HTTP |
   | Destinazione · Nome host | `localhost` |
   | Destinazione · Porta | `8080` |

3. **Certificato.** **Pannello di controllo** → **Sicurezza** (Security) → **Certificato** (Certificate) → **Impostazioni** (Settings): controlla che alla riga della regola appena creata sia assegnato il certificato di `miopalestra.synology.me`.
4. **Router.** Per usare l'app fuori casa, inoltra la porta `8443` del router verso la porta `8443` del NAS.

L'indirizzo dell'app diventa `https://miopalestra.synology.me:8443`. Usalo sempre, anche in casa: è quello su cui installare l'app. Se da casa non si apre, il router non gestisce gli indirizzi pubblici dall'interno della rete (NAT loopback): in quel caso vedi Tailscale qui sotto.

Con la porta aperta su internet la password è l'unica protezione dell'app: sceglila lunga. GymBro blocca l'accesso per un quarto d'ora dopo cinque tentativi sbagliati.

### Con Tailscale

Alternativa senza porte aperte: installa **Tailscale** dal **Centro pacchetti** e sul telefono, poi da SSH sul NAS:

```bash
sudo tailscale serve --bg 8080
```

Ottieni un indirizzo `https://nome-nas.tuo-tailnet.ts.net` raggiungibile solo dai tuoi dispositivi, anche fuori casa. Questo comando non è stato provato su Synology: se il pacchetto del NAS non lo supporta, segui la guida di Tailscale per Synology.

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

Sul Synology: **Container Manager** → **Progetto** → `gymbro` → **Azione** → **Arresta**, poi **Avvia**; se la modifica non viene letta, usa **Compila** (Build).

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

Una copia sullo stesso disco non protegge da un guasto del disco. Su Synology hai due modi per metterla al sicuro:

- se il NAS ha un secondo volume, crea lì una cartella e indicala in `.env`, per esempio `GYMBRO_BACKUPS=/volume2/backup/gymbro`;
- oppure crea in **Hyper Backup** un'attività che copia `docker/gymbro/backups` su un disco USB, un altro NAS o dove preferisci.

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

Sul PC, o sul NAS se hai clonato il repository con git:

```bash
git pull
```

```bash
docker compose up -d --build
```

Sul Synology senza git: scarica il nuovo ZIP da GitHub e sovrascrivi i file in `docker/gymbro` da File Station, **senza toccare** `.env`, `data` e `backups`. Poi in **Container Manager** → **Progetto** → `gymbro` → **Azione** → **Compila** (Build), oppure da SSH `sudo docker compose up -d --build` nella cartella del progetto.

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
- **Il container non parte sul Synology con un errore sulle cartelle montate**: mancano le cartelle `data` o `backups`; creale da File Station.
- **Il backup fallisce**: controlla che la cartella `GYMBRO_BACKUPS` esista e sia scrivibile; l'errore compare in **Dati e backup** e nei log (`docker compose logs gymbro`).
- **Password dimenticata**: cambiala in `.env` e riavvia con `docker compose up -d`.
