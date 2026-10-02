# ClockWork

PWA per organizzare i turni di lavoro e compilare il foglio ore mensile.
Funziona offline e si installa su iPhone e Android dal browser, senza store.

## Versione 0.8

- **Nuova disposizione**: tre schede (Oggi, Mese, Foglio ore). Oggi è il cruscotto: turno di oggi,
  «Ho coperto» e «Turno extra», ore, turni e stima del mese, prossimi turni.
- **Mese e Foglio ore**: tocchi il nome del mese per sceglierne un altro da una griglia; «Oggi» riporta
  al mese corrente. Le due schede mostrano lo stesso mese (si può disattivare nelle impostazioni).
  In Mese, toccando un turno si apre una modifica veloce di orario, nota e «annullato».
- **Impostazioni** a gruppi; **Impostazioni foglio turni** prende il posto di Importa: collegamento,
  stato dei mesi, nome di ricerca, file caricato a mano. **Rivedi** mostra solo ciò che va deciso
  (orari doppi, orari cambiati, turni spariti dal foglio).
- **Modello del foglio ore incluso nell'app** (`src/assets/modello-foglio-ore.xlsx`): non si carica più;
  l'app scrive nome e cognome (E5), mese, data e ore. Al primo avvio si chiedono solo il nome e il foglio turni.
- **Salva e Conferma** restano spenti finché non c'è una modifica da salvare.

## Versione 0.7

- **Foglio turni collegato**: in Importa incolli una volta il link del foglio Google (condiviso con
  «chiunque abbia il link»). L'app lo ricontrolla da sola all'avvio in un mese nuovo o dopo qualche ora:
  turni nuovi e orari cambiati li applica e lo dice con un avviso; orari doppi mai scelti e turni spariti
  dal foglio li fa rivedere. Tasto «Aggiorna turni» per controllare subito. Il file caricato a mano resta.
- I turni tolti in importazione restano tolti anche negli aggiornamenti successivi.

## Versione 0.6

- **Personalizza** (Impostazioni → Personalizza): nomi delle aree nell'app, titolo degli eventi
  (un nome per area, es. «Leone 🔽», oppure un modello con segnaposto `{area}`, `{postazione}`,
  `{collega}`, `{inizio}`, `{fine}`, `{ore}`), luogo, colore e promemoria.
  Tutto ha un valore predefinito e si può cambiare per area.
- **Singolo turno**: nome suo (vale nell'app e come titolo dell'evento) e promemoria suoi.
- Cambiando le impostazioni, gli eventi già su Google Calendar vengono aggiornati alla sincronizzazione.
  Anche l'export .ics usa titoli, luogo e notifiche.

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
  `calendar.app.created`: gli eventi degli altri calendari non vengono né letti né toccati.
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
fogli nascosti, logo) resta identico byte per byte. Il modello è quello pulito della società,
senza dati personali. Vedi `src/lib/foglio/genera.ts`.

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
2. Google Auth Platform: app esterna, aggiungi il tuo account tra i **test user**, scope `calendar.app.created`
   e `calendar.calendarlist.readonly` (solo i nomi dei calendari: serve a ritrovare quello di ClockWork invece di crearne un doppione).
3. Client OAuth di tipo **Applicazione web**: origine `https://doc-98.github.io`, URI di reindirizzamento
   `https://doc-98.github.io/ClockWork/oauth.html`.
4. Nel repository: Settings → Secrets and variables → Actions → **Variables** → `GOOGLE_CLIENT_ID`.
   (In alternativa il Client ID si può inserire nelle impostazioni dell'app.)

## Foglio turni da Google Sheets: configurazione

1. Nello stesso progetto di [console.cloud.google.com](https://console.cloud.google.com): abilita **Google Drive API**.
2. APIs & Services → Credentials → **Create credentials → API key**. Poi modificala:
   - Application restrictions: **Websites**, aggiungi `https://doc-98.github.io/*`;
   - API restrictions: **Restrict key** → solo **Google Drive API**.
3. Nel repository: Settings → Secrets and variables → Actions → **Variables** → `GOOGLE_API_KEY`.
   (In alternativa si può inserire nella schermata Importa dell'app.)

La chiave finisce nel codice pubblicato ed è normale: con quelle restrizioni può solo leggere file già
condivisi con «chiunque abbia il link», e solo dal sito dell'app. Nessun accesso dell'utente a Google.

## Privacy

Nessun server: tutti i dati (modello, ore, turni) restano nell'archivio locale del browser
(IndexedDB) sul telefono.
