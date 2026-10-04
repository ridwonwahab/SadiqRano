# SADIQ RANO RICE

A Next.js storefront for Sadiq Rano Rice, the Rano Rice mega distributor in Kano State, Kwanar Dawaki. Customers can browse products, build a cart, sign in with Google, and place pickup orders. Payment is made in person at the shop by cash or bank transfer; this site does not collect online payments.

## Run locally

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env.local` and fill in the Supabase and Mailgun values.
3. In the Supabase SQL Editor, run [`supabase/setup.sql`](./supabase/setup.sql).
4. In Supabase, enable Google under **Authentication → Providers → Google**. Paste in the OAuth client ID and client secret from Google Cloud Console. Set the local and production site URLs, and allow `http://localhost:3000/auth/callback` and `https://your-domain.com/auth/callback` under **Authentication → URL Configuration → Redirect URLs**.
5. In Google Cloud Console, configure the OAuth consent screen, create an OAuth client ID for a **Web application**, and add the Supabase callback URL shown on the Supabase Google provider page as an **Authorized redirect URI**. Add `http://localhost:3000` and your deployed domain as **Authorized JavaScript origins**. Copy the client ID and secret into the Supabase Google provider settings.
6. Set `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, and `MAILGUN_FROM`. For an EU Mailgun domain, set `MAILGUN_API_BASE=https://api.eu.mailgun.net`. Verify the sending domain and recipient delivery with Mailgun before launch.
7. Run `npm install`, then `npm run dev`.

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are the project's public Supabase URL and anon/publishable key. Do not put a Supabase service-role key or Mailgun API key in a `NEXT_PUBLIC_` variable.

## Product catalog and orders

The SQL setup adds four **sample** Rano Rice bag sizes and sample NGN prices. They are intentionally marked `is_sample` and the storefront warns visitors; checkout stays disabled until you update the rows in Supabase's `products` table with your actual prices and turn off `is_sample`. Set `active` to `false` to hide a product. Products, profiles, signed-in customer carts, and order records live in Supabase. A guest's cart is kept in their browser until they sign in, when it is merged into their saved cart.

New Google sign-ins are saved to `profiles`. The `place_order` database function derives each line price from the current product record and saves an order and its line-item snapshots in one transaction. Row Level Security lets customers read only their own profile and orders. The server sends a Mailgun confirmation after Supabase has saved the order; if Mailgun is unavailable, the order remains saved and the checkout page clearly reports the email issue.

Before launch, replace the sample prices, verify your pickup instructions and Mailgun sending domain, configure production redirect URLs in Supabase and Google Cloud Console, and deploy with all environment variables set.
