# GymBro: regole per chi modifica il codice

L'utente ha chiesto di fare da tester: ogni modifica va verificata prima di consegnarla.

## Prima di ogni push

```bash
npm run typecheck
npm test            # unit + API (~5 s)
npm run test:e2e    # build + browser con telefono simulato (~1 min)
```

Se cambiano `Dockerfile`, `docker-compose.yml` o l'avvio del server, anche `npm run test:docker`.
In un ambiente con proxy di rete (sessioni cloud) la build di compose non scarica nulla: costruisci prima
l'immagine con `docker build --network host -t gymbro .` e poi lancia `SKIP_BUILD=1 npm run test:docker`.

Su GitHub il workflow `.github/workflows/test.yml` ripete tutto a ogni push e pull request:
dopo il push controlla l'esito e sistema ciò che fallisce.

## Regole

- Ogni funzione nuova o difetto corretto porta con sé un test: unitario per la logica (`tests/unit`),
  API per il server (`tests/api`), end-to-end per i percorsi dell'utente (`tests/e2e`).
- Un test rosso si risolve correggendo il codice; se è il test a essere sbagliato, correggilo e spiega perché.
  Mai saltare, disattivare o indebolire un test per farlo passare.
- Nel resoconto all'utente indica quanti test sono passati e cosa non è stato verificato (per esempio
  suono, vibrazione e notifiche su un telefono vero, o il coach con una chiave Anthropic reale).
- Interfaccia e testi in italiano, pesi in kg con la virgola decimale.
