# Laravel Cloud deployment

The app is deployed to the `wondrous` application, `production` environment on Laravel Cloud. Pushes to `main` trigger deployment.

1. Connect this repository to a Cloud application. Use PHP 8.4.1+ and Node 22+; production uses PHP 8.5 and Node 24.
2. Attach a managed PostgreSQL or MySQL database. Cloud injects its connection variables. All migrations support either and SQLite for local development.
3. Build: `composer install --no-dev --prefer-dist --optimize-autoloader --no-interaction && npm ci && npm run build`.
4. Deploy command: `php artisan migrate --force`. Set APP_ENV=production, APP_DEBUG=false, APP_KEY (generate once), APP_URL to the HTTPS application domain. Keep SESSION_DRIVER=database and CACHE_STORE=database. Set QUEUE_CONNECTION=cloud for the managed queue, or database when running your own database queue worker. Use SESSION_SECURE_COOKIE=true.
5. Attach Laravel Cloud WebSockets or run a dedicated Reverb process with the required public websocket endpoint. Set BROADCAST_CONNECTION=reverb and the provided REVERB_APP_ID, REVERB_APP_KEY, REVERB_APP_SECRET, REVERB_HOST, REVERB_PORT=443 and REVERB_SCHEME=https. VITE_REVERB_* values must match the browser-facing endpoint **at build time**. Never put the secret in VITE variables. For self-managed Reverb, allow the application's hostname in REVERB_ALLOWED_ORIGINS and proxy TLS to the internal REVERB_SERVER_PORT (8080). Cloud managed WebSocket credentials may use a different internal app configuration managed by Cloud.
6. With Cloud managed queues, set `QUEUE_CONNECTION=cloud` and use the managed worker; the AWS SDK is included. For a database-backed queue instead, run a queue worker: `php artisan queue:work --sleep=1 --tries=3 --timeout=60`. Websocket invalidations are queued after commits; without the worker the UI will fall back to polling but won't receive live invalidations.
7. Enable the Laravel scheduler with `php artisan schedule:run` every minute (one scheduled invocation per minute), or keep a dedicated `php artisan schedule:work` process running. The registered `games:expire` task settles overdue correspondence matches. It uses shared locks and `withoutOverlapping`; reads/actions enforce the same deadline if the scheduler is delayed. Local `bin/dev` starts `schedule:work` automatically.
8. Health endpoint: `/up`. Create real accounts through the UI. Do not seed demo credentials in production; DemoSeeder rejects it.

If scaling with Redis, choose a shared CACHE_STORE=redis, SESSION_DRIVER=redis, QUEUE_CONNECTION=redis; configure Redis connection settings. Match locks must be shared by all app instances. Reverb scaling additionally needs REVERB_SCALING_ENABLED=true and shared Redis. Do not use the local file/array cache in a multi-instance deployment.

No filesystem writes are needed for game state or generated assets at runtime. Assets ship with the build/repository. Keep standard storage and bootstrap/cache permissions for Laravel logs and compiled views.

Verify after deployment using two separate browser profiles: account creation, lobby join, draft changes arriving without refresh, private deployment, two consecutive turns, reconnect, endgame rating/rewards and one-time claim. Also verify a correspondence deadline, multiple active correspondence games, and participant-only completed replay. Verify the WebSocket status reads Live and inspect failed_jobs if not.

Official reference: [Laravel Cloud managed WebSockets](https://laravel.com/blog/introducing-websockets-for-laravel-cloud-powered-by-laravel-reverb). Attaching a WebSocket application populates the required environment variables automatically. Prefer the managed service for Cloud.

## Mail and accounts

Set a production mail transport and sender (`MAIL_MAILER`, provider credentials, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME`) before exposing password recovery publicly. The local log driver intentionally does not deliver email. Recovery uses Laravel's standard password broker with expiring single-use tokens. Test delivery and reset in the deployed environment. Registration requires username, display name, email and confirmed password; login accepts username only. Profile email changes require the current password.

Scheduler API reference: [Laravel scheduling frequencies](https://api.laravel.com/docs/13.x/Illuminate/Console/Scheduling/ManagesFrequencies.html).
