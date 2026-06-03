# QR kody Platinum PWA

Staticka PWA verzia aplikacie pripravena pre GitHub Pages a iPhone "Pridat na plochu".

## Co je v repozitari

- `index.html` - prihlasenie, registracia a reset hesla
- `dashboard.html`, `companies.html`, `generator.html`, `license.html`, `admin.html` - aplikacne obrazovky
- `app.js` - klientsky kod a volania na API
- `manifest.json` - PWA manifest s relativnymi cestami pre GitHub Pages
- `service-worker.js` - offline cache pre zakladne subory
- `icon-180.png`, `icon-192.png`, `icon-512.png` - ikony pre iPhone a PWA

## Nasadenie na GitHub Pages

1. Vytvor prazdny GitHub repozitar.
2. Nahraj vsetky subory z tohto priecinka do rootu repozitara.
3. V GitHube otvor `Settings > Pages`.
4. Ako source vyber `Deploy from a branch`.
5. Vyber branch `main` a folder `/root`.
6. Po deployi otvor URL z GitHub Pages.

## iPhone instalacia na plochu

1. Otvor nasadenu URL v Safari.
2. Klikni na Share.
3. Vyber `Add to Home Screen` / `Pridat na plochu`.
4. Potvrd nazov `QR Platinum`.

## Lokalny test

```bash
npm run start
```

Potom otvor URL zo servera v prehliadaci. Service worker a PWA instalacia potrebuju HTTP/HTTPS, nie priame otvorenie suboru cez `file://`.

## Dolezite

Aplikacia stale vola existujuce API:

- `https://qr-kody-platinum-api.virivkyonlinecz.workers.dev`
- `https://qr-generator-real.virivkyonlinecz.workers.dev`

Pre plnu funkcnost musia tieto API endpointy ostat dostupne.
