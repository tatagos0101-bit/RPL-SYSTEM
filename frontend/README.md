# RPL frontend

React 19, Vite 7, and Tailwind CSS 4 frontend for the Rizal Provincial Library
System. See the [system README](../README.md) for features, backend setup,
authentication, tests, and known limitations, and the
[deployment guide](../docs/DEPLOYMENT.md) for Vercel and Supabase configuration.

## Development

Use Node.js 22.12 or newer. From this `frontend` directory:

```powershell
npm ci
npm run dev
```

Start the FastAPI backend separately using the root README instructions. Vite
serves `http://localhost:5173`; API requests default to `http://localhost:8000` in
development. Set `VITE_API_URL` in an ignored `.env` file for a different API
address, then restart Vite. Never put database passwords or Supabase secret keys
in frontend environment variables.

## Application structure

- `src/App.jsx`: React Router routes for public, member, librarian, and station pages.
- `src/components/`: layouts, navigation, shared catalogue components, and server-validated role guards.
- `src/pages/public/`: landing pages, public catalogue, login, and password-recovery help.
- `src/pages/user/`: dashboard, catalogue, reservations, and profile.
- `src/pages/lib/`: inventory, registration, borrowing/returns, reports, and entrance station.
- `src/api/`: Axios clients, upload helpers, shared data transformations, and Node tests.

Member reservations use the authenticated session. Face scanning is used for
login, enrollment, staff member lookup, and entrance logging. The current face
liveness heuristic can accept static photos; see the system README before
relying on face-only authentication.

## Checks and production build

```powershell
node --test src/api/*.test.js
npm run build
```

`npm run preview` serves the built frontend locally. `npm run lint` runs the
configured ESLint checks; the build and Node tests are separate commands.

The production Vercel project uses repository root `.` and builds `frontend/dist`
through the root `vercel.json`. Leave `VITE_API_URL` unset to use the website's
same-origin API proxy and HttpOnly login cookie. If the backend domain changes,
run `scripts/configure_vercel.py` from repository root as described in the
deployment guide. Supabase access is authorized by FastAPI, rather than by a
browser service-role key.
