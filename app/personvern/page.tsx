export const metadata = { title: 'Personvern – Deadline Lager' };

export default function Personvern() {
  return <div style={{ background: 'var(--bg)', minHeight: '100vh' }}>
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '40px max(16px, env(safe-area-inset-right)) 60px max(16px, env(safe-area-inset-left))', display: 'flex', flexDirection: 'column', gap: 14, lineHeight: 1.6 }}>
      <span className="brand">deadline<i /></span>
      <h1>Personvern<span className="c">:</span></h1>
      <p>Deadline Lager er Deadlines interne system for utstyr, prosjekter og utleie. Denne erklæringen forklarer hvilke opplysninger systemet behandler.</p>
      <h2>Innlogging med Google</h2>
      <p>Når du logger inn med Google, mottar vi navn, e-postadresse og profilbilde fra Google-kontoen din. Vi bruker dette bare til å identifisere deg i systemet og gi deg riktig tilgang. Vi ber ikke om tilgang til e-post, kalender, filer eller andre Google-data.</p>
      <h2>Hva vi lagrer</h2>
      <p>Navn, e-post og rolle i systemet, og hvilke handlinger du gjør (for eksempel hvem som skannet eller meldte feil på utstyr). Kunder som reserverer utstyr via nettsiden oppgir navn, e-post, telefon og en beskrivelse, som brukes til å behandle bestillingen.</p>
      <h2>Lagring og deling</h2>
      <p>Data lagres hos Supabase (database i EU) og appen driftes av Vercel. Opplysningene deles ikke med andre og brukes ikke til markedsføring.</p>
      <h2>Dine rettigheter</h2>
      <p>Du kan be om innsyn, retting eller sletting av opplysningene dine ved å kontakte Deadline på stein.inge@deadline.no.</p>
      <p className="small muted">Sist oppdatert 7. november 2026.</p>
    </div>
  </div>;
}
