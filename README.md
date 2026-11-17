# GymBro

Web app personale per la palestra: self-hosted, un solo container, dati in una cartella.

## Avvio rapido

```bash
cp .env.example .env   # poi imposta GYMBRO_PASSWORD
docker compose up -d --build
```

L'app risponde su `http://localhost:8080`. Database e foto stanno nella cartella `./data`.

## Sviluppo

```bash
npm install
GYMBRO_PASSWORD=prova npm run dev
```

La guida completa (installazione sul NAS, HTTPS, backup e ripristino) arriva con l'ultima tappa.
