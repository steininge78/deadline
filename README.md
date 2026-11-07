# Deadline Lager

Lager- og logistikksystem for Deadline. Mobil-først webapp (kan legges på hjemskjermen) med Google-innlogging.

**Moduler:** Prosjekter med pakklister (satt fram / lastet / returnert, live QR-skanning, sanntid mellom brukere) · Lager med enheter, QR-koder, bilder og pakker · Forespørsler og tilbud · Kalender med ressurser · Vedlikehold og varetelling · Offentlig utleieside (`/leie`) for Squarespace.

**Teknologi:** Next.js 15 (Vercel) · Supabase (Postgres, Auth med Google, Storage, Realtime) · qr-scanner · SheetJS for Excel-import.

## Oppsett (én gang)

1. **Supabase:** Lag et prosjekt (region Stockholm/Frankfurt). Åpne *SQL Editor*, lim inn hele `supabase/migrations/0001_init.sql` og kjør. Første admin er `stein.inge@deadline.no` (endres i `settings`-tabellen).
2. **Google-innlogging:** I Google Cloud Console: lag OAuth-klient (Web). Autorisert redirect-URI: `https://<prosjekt>.supabase.co/auth/v1/callback`. Lim inn klient-ID og hemmelighet i Supabase → Authentication → Providers → Google.
3. **Supabase → Authentication → URL Configuration:** Site URL = appens adresse (f.eks. `https://deadline-lager.vercel.app`). Legg samme adresse + `/auth/callback` i Redirect URLs (og `http://localhost:3000/auth/callback` for utvikling).
4. **Vercel:** Importer GitHub-repoet. Legg inn miljøvariablene fra `.env.example` (URL, anon key, service role key fra Supabase → Settings → API).
5. **Adobe Fonts:** Legg Vercel-domenet til i web-prosjektet `xke0gxx`, ellers brukes reservefonter.
6. Logg inn, gå til **Lager → Importer**, og last opp Rentman-eksporten.

## Roller

| Rolle | Hvem | Tilgang |
|---|---|---|
| Admin | første admin + de admin utnevner | Alt, inkl. roller |
| Lager / Prosjektleder | alle @deadline.no (automatisk Prosjektleder) | Alt unntatt roller |
| Ekstern | inviteres per prosjekt (Info → Inviter) | Ser og haker av pakklister i egne prosjekter |
| Ingen tilgang | andre Google-kontoer | Ingenting |

Tilgang håndheves i databasen (Row Level Security), ikke bare i appen.

## Utleie på Squarespace

Legg inn en *Code Block* på leiesiden:

```html
<iframe id="dl-leie" src="https://deadline-lager.vercel.app/leie?embed=1" style="width:100%;border:0;min-height:900px" loading="lazy"></iframe>
<script>addEventListener('message',e=>{if(e.data&&e.data.deadlineLeieHeight)document.getElementById('dl-leie').style.height=e.data.deadlineLeieHeight+'px'})</script>
```

Artikler vises når de er merket «Vis på nettsiden» og har pris. Reservasjoner blir forespørsler med kilde «Nettside» og holder utstyret av i 48 timer. Hvilke domener som kan bygge inn siden styres av `EMBED_ANCESTORS`.

## Utvikling

```bash
cp .env.example .env.local   # fyll inn verdier
npm install
npm run dev
```

Endringer i databasen: legg til en ny fil i `supabase/migrations/` og kjør den i SQL Editor.

## Kjente forenklinger / videre arbeid

- Ledighet regner med alle overlappende bookinger i perioden (konservativt).
- Tilbud sendes som e-posttekst / utskrift; egen PDF og e-postutsending (f.eks. Resend) kan legges til.
- Nettreservasjoner varsler ikke på e-post ennå; de dukker opp under Forespørsler.
- Betaling (Vipps/Stripe) for nettutleie er ikke med.
