# Rev Engine Regional Reset and Local Servers

See [../REGIONAL_LOCAL_DEV.md](../REGIONAL_LOCAL_DEV.md) for the maintained regional local development workflow.

Short version:

```bash
npm run env:regions
createdb revengine_zw
createdb revengine_sa
npm run db:reset:zw
npm run db:reset:sa
npm run dev:zw
npm run dev:sa
```

Zimbabwe uses `.env.zw`, `revengine_zw`, `REVENGINE_REGION=ZW`, and `http://localhost:3000`.
South Africa uses `.env.sa`, `revengine_sa`, `REVENGINE_REGION=SA`, and `http://localhost:3001`.
