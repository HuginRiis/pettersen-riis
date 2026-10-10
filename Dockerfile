# Riis-Pettersen Family (TanStack Start) bygget som Node-server for selvhosting på NAS (i stedet for Cloudflare Workers).
# VITE_*-verdiene bygges inn i nettleserkoden; serverhemmeligheter leses fra miljøet ved oppstart (app.env).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
# package-lock.json fra Lovable kan være utdatert, så npm ci kan feile.
RUN npm install --no-audit --no-fund
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    NITRO_PRESET=node-server \
    # Stor app: Node sin standard minnegrense er for lav for vite build.
    NODE_OPTIONS=--max-old-space-size=4096
RUN npm run build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/.output ./.output
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
