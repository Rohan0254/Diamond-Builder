# Prisma 6's query engine needs OpenSSL and glibc, so use a Debian-based image
# (base on Node 20 LTS). Alpine is musl-based and can fail to run the engine.
FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

# `react-router build` invokes Vite (a devDependency), so install all deps —
# `--omit=dev` would break the build (vite is in devDependencies).
RUN npm ci && npm cache clean --force

COPY . .

# Generate the Prisma client inside the container so the query engine matches
# this platform, then build the server bundle.
RUN npx prisma generate && npm run build

# `npm run docker-start` runs `prisma generate && prisma db push`, then serves
# the app. If DATABASE_URL is missing/unreachable the container fails loudly at
# boot here instead of 500ing every authenticated request.
CMD ["npm", "run", "docker-start"]
