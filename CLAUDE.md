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
- Gewicht: 7-daags gemiddelde als hoofdgetal en als lijn in de grafiek. (gebouwd, okt 2026)
- Dagelijks supplementen afvinken (creatine, vitamines; lijst aanpasbaar). (gebouwd, okt 2026)
- Weekcheck: vette vis en rood vlees in de afgelopen 7 dagen. (gebouwd, okt 2026)
- Micronutriënten (vitamines, mineralen, EPA+DHA, zout) per dag en als 7-daags gemiddelde. (gebouwd, okt 2026)
- Percentage van het doel bij kcal en macro's; balkkleur: blauw = onder het doel, groen = binnen de marge, rood = erboven. Marge kcal ±3%, macro's ±10%. (gebouwd, okt 2026)
- Gewicht: toename groen, afname rood (gebruiker wil aankomen). (gebouwd, okt 2026)

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
- Micronutriënten zitten in `per100` (eenheden zoals NEVO: mg/µg; zie `MICROS` in util.js) en reizen mee in `base`. `mk` = kcal waarvan micro's bekend zijn (dekkingspercentage). Bronnen: NEVO (vrijwel volledig), Open Food Facts (zelden), handmatig, supplementen.
- Doelen micronutriënten: standaard aanbevelingen volwassen mannen (Gezondheidsraad/Voedingscentrum, keuze gebruiker), aanpasbaar in Instellingen.
- Supplementen: `settings.supplements` met micro's per dosis; tellen mee op dagen dat ze zijn afgevinkt. Afvinkjes staan in `days[datum].checks`.
- Weekcheck rood vlees = een stuk vers vlees (rund, varken, lam, kalf, wild); vleeswaren (ham, salami, rookworst) tellen niet automatisch. Herkenning op naam (`js/checks.js`); `tags` op product/maaltijd gaat voor.
- NEVO-meta heeft `schema` (2 = met micro's). Na een nieuwe import vult `backfillMicros` bestaande producten, maaltijden en dagboekregels aan (alleen ontbrekende micro's, macro's blijven).
- Schermtijd 's nachts (gemeld okt 2026): camera stopt nu bij vergrendelen/wegschakelen. Vermoedelijk ook een iOS-eigenaardigheid met beginscherm-web-apps; gebruiker test of wegvegen in de app-kiezer helpt.

## Projectstructuur
- `index.html`, `css/app.css`, `manifest.webmanifest`, `sw.js` (offline, network-first)
- `js/app.js` navigatie · `js/store.js` gegevenslaag · `js/db.js` IndexedDB · `js/food.js` toevoegen/scannen/bewerken
- `js/views/` schermen: vandaag, bibliotheek, gewicht, instellingen
- `js/off.js` Open Food Facts · `js/nevo.js` NEVO-import (CSV of zip) · `js/scanner.js` camera · `js/chart.js` gewichtsgrafiek
- `js/checks.js` weekcheck (vette vis/rood vlees) · `js/micros.js` scherm vitamines en mineralen
- `nevo/` staat in `.gitignore` (alleen lokaal)
- Lokaal testen: `python -m http.server 8080` in deze map, dan http://127.0.0.1:8080

## Beveiliging
- Content Security Policy in `index.html` (meta-tag): alleen scripts van eigen site + `'wasm-unsafe-eval'` voor de scanner; `connect-src` alleen eigen site en `world.openfoodfacts.org`. Nieuwe externe dienst nodig? Dan daar toevoegen.
- Alle tekst van buitenaf (o.a. Open Food Facts) via `esc()` in HTML zetten.
- Grootste risico is overname van het GitHub-account (dan kan de code worden aangepast): 2FA aan.

## Status (21 okt 2026)
- Live op https://tjderijke.github.io/macro-tracker/ en op het beginscherm van de iPhone gezet; de camerascanner werkt (ook met de CSP).
- Versie 1.1.0: supplementen, weekcheck, micronutriënten, weekgemiddelde gewicht, camera-fix. Na het bijwerken moet de gebruiker de NEVO-zip één keer opnieuw importeren (de app meldt dit in Instellingen).

## Werkafspraken
- Communicatie in het Nederlands.
- Bouw eerst een kleine werkende versie (MVP), test die op mijn iPhone, en breid daarna uit.
- Leg bij elke stap kort uit wat ik moet doen (ik heb weinig programmeerervaring).
