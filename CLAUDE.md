# Macro-tracker (persoonlijke voedingsapp)

## Doel
Een eigen voedingsapp voor op mijn iPhone, omdat bestaande apps (MyFitnessPal, FatSecret, MyNetDiary, Kroton, Virtuafood) belangrijke functies achter een betaalmuur zetten of zelf het plan bepalen. Ik sport intensief in de sportschool en wil mijn eigen plan volgen.

## Harde eisen
- Zelf een dagelijks caloriedoel instellen (de app berekent niets voor mij).
- Zelf macrodoelen instellen in grammen: eiwit, koolhydraten, vet.
- Eigen maaltijden en recepten maken en hergebruiken.
- Barcode scannen met de iPhone-camera, met goede dekking van Nederlandse producten (Albert Heijn, Jumbo, Lidl).
- Producten handmatig toevoegen als ze ontbreken.
- Gewicht bijhouden en het verloop door de tijd zien.
- Gratis, geen advertenties.

## Wensen
- Ander doel op trainingsdagen dan op rustdagen. (gebouwd)
- Dagoverzicht: gegeten vs. doel, per macro. (gebouwd)
- Export/import van mijn data als back-up. (gebouwd)

## Gekozen aanpak
- **Progressive Web App** (HTML/CSS/JavaScript, geen build-stap) die ik via Safari "Zet op beginscherm" gebruik.
- **Hosting:** GitHub Pages (HTTPS is nodig voor de camera).
- **Opslag:** lokaal op de telefoon (IndexedDB), plus back-up als JSON-bestand.
- **Productdata:**
  - Open Food Facts API voor barcodes en zoeken op naam (alleen NL-producten, zoeken alleen op knopdruk: max ~10 zoekopdrachten/min).
  - NEVO-tabel (RIVM) voor algemene producten. **Niet in de repo/online zetten**: de voorwaarden staan herverspreiding niet expliciet toe. De gebruiker importeert de zip/CSV zelf in de app (Instellingen). Bronvermelding: "NEVO-online versie 2025/9.0, RIVM, Bilthoven."
  - Eigen producten (source `eigen`) hebben voorrang op externe data, ook bij barcodes.
- **Barcode-scanner:** `barcode-detector` (ZXing in WebAssembly), lokaal in `vendor/`, want Safari heeft geen BarcodeDetector.

## Beslissingen
- Loggen per maaltijdmoment: ontbijt, lunch, avondeten, snacks.
- Trainings-/rustdag: vaste trainingsweekdagen in Instellingen, per dag om te zetten in het dagoverzicht.
- Dagboekregels bewaren een kopie van de voedingswaarden (`base` per eenheid), zodat oude dagen kloppen als een product later wordt aangepast of verwijderd.

## Projectstructuur
- `index.html`, `css/app.css`, `manifest.webmanifest`, `sw.js` (offline, network-first)
- `js/app.js` navigatie · `js/store.js` gegevenslaag · `js/db.js` IndexedDB · `js/food.js` toevoegen/scannen/bewerken
- `js/views/` schermen: vandaag, bibliotheek, gewicht, instellingen
- `js/off.js` Open Food Facts · `js/nevo.js` NEVO-import (CSV of zip) · `js/scanner.js` camera · `js/chart.js` gewichtsgrafiek
- `nevo/` staat in `.gitignore` (alleen lokaal)
- Lokaal testen: `python -m http.server 8080` in deze map, dan http://127.0.0.1:8080

## Beveiliging
- Content Security Policy in `index.html` (meta-tag): alleen scripts van eigen site + `'wasm-unsafe-eval'` voor de scanner; `connect-src` alleen eigen site en `world.openfoodfacts.org`. Nieuwe externe dienst nodig? Dan daar toevoegen.
- Alle tekst van buitenaf (o.a. Open Food Facts) via `esc()` in HTML zetten.
- Grootste risico is overname van het GitHub-account (dan kan de code worden aangepast): 2FA aan.

## Volgende stappen (stand 6 okt 2026)
- App testen op de iPhone: beginscherm, doelen, NEVO-zip importeren, barcode scannen met de camera (ook controleren dat de scanner werkt met de CSP).

## Werkafspraken
- Communicatie in het Nederlands.
- Bouw eerst een kleine werkende versie (MVP), test die op mijn iPhone, en breid daarna uit.
- Leg bij elke stap kort uit wat ik moet doen (ik heb weinig programmeerervaring).
