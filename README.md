# ClockWork

PWA per organizzare i turni di lavoro e compilare il foglio ore mensile.
Funziona offline e si installa su iPhone e Android dal browser, senza store.

## Versione 0.1

- Caricamento del modello del foglio ore (.xlsx), salvato solo sul telefono.
- Inserimento delle ore giorno per giorno (`3,75`, `3.75` o `3:45`) e delle note sulle sostituzioni.
- Generazione del foglio ore identico al modello: ore nella colonna Q, note nella colonna R,
  colonne O–P e cella Q45 svuotate (Q45 anche senza bordi), totale ricalcolato.
- Condivisione diretta a WhatsApp o Mail dal menu Condividi del telefono, oppure scaricamento.

## Come funziona il foglio ore

Il file .xlsx è un archivio zip di file XML. L'app non lo riscrive con una libreria: apre il modello,
modifica solo le celle necessarie e lo richiude. Tutto il resto (formattazione, bordi, formule,
fogli nascosti, logo) resta identico byte per byte. Vedi `src/lib/foglio/genera.ts`.

## Sviluppo

```bash
npm install
npm run dev        # server di sviluppo
npm test           # test
npm run check      # controllo dei tipi
npm run build      # build di produzione in dist/
```

I test sul modello reale leggono `fixtures/private/generico.xlsx`, che **non** è nel repository
(contiene dati personali). Senza quel file quei test vengono saltati.

## Pubblicazione

A ogni push su `main`, GitHub Actions esegue controlli e test e pubblica su GitHub Pages
(`.github/workflows/deploy.yml`). Nelle impostazioni del repository: Settings → Pages →
Source: **GitHub Actions**.

## Privacy

Nessun server: tutti i dati (modello, ore, turni) restano nell'archivio locale del browser
(IndexedDB) sul telefono.
