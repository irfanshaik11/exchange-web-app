memecoin UI 

## Environment variables

### Blockvision (Monad account transactions / last active)

- **Server-side (recommended)**: `BLOCKVISION_API_KEY`
  - Used by the Next API route: `src/pages/api/blockvision/monad/last-active.ts`
  - Keeps the key off the client.

- **Client-side (optional / insecure)**: `NEXT_PUBLIC_BLOCKVISION_API_KEY`
  - Used by the tracker page to attempt a direct browser call to Blockvision.
  - Anything prefixed with `NEXT_PUBLIC_` is shipped to the browser.


