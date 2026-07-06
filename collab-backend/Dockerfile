# ── Dockerfile ────────────────────────────────────────────────────────────────
#
# Why alpine? node:18-alpine is ~50MB vs ~900MB for full Ubuntu.
# Smaller image = faster CI deploys + smaller attack surface.
#
# Why copy package.json FIRST then npm install?
# Docker caches layers. If package.json didn't change, Docker skips
# npm install on the next build — much faster rebuilds.
# If you copied src/ first, any code change would invalidate the npm install layer.
#
FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm install --production
# --production skips devDependencies (nodemon, jest) — not needed at runtime

COPY src ./src

EXPOSE 3001

# Healthcheck: Docker/Kubernetes uses this to know if the container is healthy.
# If /health returns non-200 for 3 consecutive checks, container is restarted.
# --interval=30s: check every 30s
# --timeout=3s: if no response in 3s, count as failed
# --retries=3: restart after 3 consecutive failures
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:3001/health || exit 1

CMD ["node", "src/index.js"]
