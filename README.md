# MediStock frontend

A standalone React/Vite frontend for the pharmacy API in `joshuaAlonzo/API`. This folder contains **frontend files only**; it does not replace, modify, or include your ASP.NET API.

## Quick start

Requirements: Node.js 20.19+ or 22.12+.

1. Extract this folder beside your API project, or keep it separate.
2. Copy `.env.example` to `.env.local` (Windows PowerShell: `Copy-Item .env.example .env.local`).
3. Open `.env.local` and set the API **origin/base URL**—do not append `/api`:

   ```env
   VITE_API_BASE_URL=https://your-deployed-api-host
   ```

4. From this folder, run:

   ```bash
   npm install
   npm run dev
   ```

5. Open the local address Vite prints (normally `http://localhost:5173`). You can also configure or change the API origin inside the app at **Settings**. A value saved there takes precedence over `.env.local`. The frontend checks the configured URL with `GET /health`.

To build a production static site, run `npm run build`; the files are written to `dist/`. You can host that folder separately or copy its contents into your API's static web root (for example, ASP.NET `wwwroot`) and configure an SPA fallback to `index.html`. If hosted on the same origin as the API, set the frontend API URL to that origin. If hosted on another origin, configure CORS as described below.

## Connect your ASP.NET API

1. Run your API and set `VITE_API_BASE_URL` to its origin, for example `https://localhost:7042` or `https://api.example.com`. Do not add a trailing `/api` path.
2. If frontend and API use different origins, configure ASP.NET CORS to allow the exact frontend origin (for local development, `http://localhost:5173`; for deployment, your deployed frontend domain). Allow the API methods and the `Authorization` and `Content-Type` headers used by the frontend.
3. Reload the frontend, open **Settings**, and use **Check connection**. Then sign in with an API account. The admin/staff/customer sample-workspace buttons use local demo data, not API accounts.

The frontend follows the repository's API contract, including:

- Login, registration and reset: `/api/auth/login`, `/api/auth/register`, `/api/auth/forgot-password`, `/api/auth/reset-password`.
- Inventory/reference data: `/api/medicine`, `/api/category`, `/api/supplier`.
- Orders and customer cart: `/api/order`, `/api/order/checkout`, `/api/order/user/{userId}`, `/api/cart`.
- User/role and audit operations: `/api/user`, `/api/userrole`, `/api/activitylog`.
- Role mapping: **1 = admin, 2 = staff/mod, 3 = customer**.

The browser stores the JWT in `sessionStorage` and sends it as a Bearer token. Do not place secrets or API credentials in frontend source or `VITE_` variables; those values are public in a browser bundle.

## Important API security notes

The current API source permits broad user/user-role access and accepts positive role IDs on public registration. The UI hides those controls from staff/customers and always submits customer role 3 at signup, but **UI restrictions are not authorization**. Before using real customer data, enforce admin-only management, customer self-ownership for profile/cart/order access, and customer-only public registration in the API itself.

The current forgot-password endpoint returns a reset token directly. The UI does not present that token as secure email delivery; production password reset requires short-lived tokens sent through a verified channel. The API checkout accepts a payment-method label but does not process a payment. Its medicine model also has no expiry, batch/lot, supplier link, or prescription fields.

## Folder layout

- `src/pages/`: authentication/settings and role-specific dashboards.
- `src/components/`: responsive dashboard shell and shared UI helpers.
- `src/contexts/`: session and theme context.
- `src/lib/pharmacyApi.ts`: typed API client, response normalization and route calls.
- `src/lib/demoData.ts`: clearly labelled sample records for local UI exploration.
- `public/`: MediStock mark, favicon, and generic missing-image placeholder.
