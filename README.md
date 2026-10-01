# ClockWork

PWA per organizzare i turni di lavoro e compilare il foglio ore mensile.
Funziona offline e si installa su iPhone e Android dal browser, senza store.

## Versione 0.4

- **PDF del foglio ore**: stesso contenuto del file Excel (intestazione, colonne, colori, totale), generato sul telefono.
- **Condividi**: invia il file Excel dove il sistema lo permette (iPhone, iPad); altrimenti il PDF
  (Android: Chrome non permette di condividere file Excel dal web).
- **Scarica**: scegli tra Excel e PDF.
- Scorrimento col dito tra le schede principali.

## Versione 0.3

- **Google Calendar**: l'app crea un calendario suo («ClockWork · Leone XIII») e ci tiene allineati
  i turni dal mese scorso in avanti; ogni modifica (importazione, sostituzione, turno annullato) viene
  mandata subito se l'accesso è attivo, altrimenti compare «Sincronizza». Permesso minimo
  `calendar.app.created`: gli altri calendari non vengono né letti né toccati.
  Accesso OAuth in una finestra, compatibile con la PWA installata su iPhone (`public/oauth.html`).
- **Esporta .ics** per chi usa un altro calendario.

## Versione 0.2

- **Importa**: carichi il foglio turni «Assistenti Spogliatoio», scegli il mese e confermi i tuoi turni.
  Mostra cosa è cambiato rispetto all'importazione precedente. Per gli orari doppi
  (es. «15:30 / 15:45») chiede quale fai e ricorda la scelta.
- **Oggi**: turno in corso o prossimo, ore del mese, accesso rapido a «Ho coperto un turno».
- **Mese**: calendario con i turni per area e le sostituzioni.
- **Sostituzioni e turni a mano**: scegli il collega dal foglio turni del giorno e l'app compila
  area, orario e la nota per la colonna R (es. «sost greta spogl piccoli»).
  Le importazioni successive non toccano sostituzioni e turni modificati a mano.
- **Foglio ore**: calcolato dai turni del mese, identico al modello: ore nella colonna Q, note nella R,
  colonne O–P e cella Q45 svuotate (Q45 anche senza bordi), totale ricalcolato.
  Condivisione a WhatsApp o Mail dal menu Condividi, oppure scaricamento.
- **Impostazioni**: nome nel foglio turni, tariffa, modello, backup e ripristino.

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

## Google Calendar: configurazione

1. [console.cloud.google.com](https://console.cloud.google.com): nuovo progetto, abilita **Google Calendar API**.
2. Google Auth Platform: app esterna, aggiungi il tuo account tra i **test user**, scope `calendar.app.created`.
3. Client OAuth di tipo **Applicazione web**: origine `https://doc-98.github.io`, URI di reindirizzamento
   `https://doc-98.github.io/ClockWork/oauth.html`.
4. Nel repository: Settings → Secrets and variables → Actions → **Variables** → `GOOGLE_CLIENT_ID`.
   (In alternativa il Client ID si può inserire nelle impostazioni dell'app.)

## Privacy

Nessun server: tutti i dati (modello, ore, turni) restano nell'archivio locale del browser
(IndexedDB) sul telefono.
