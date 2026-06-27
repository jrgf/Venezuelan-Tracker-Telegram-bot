FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# Create non-root user
RUN addgroup -S bot && adduser -S bot -G bot \
    && chown -R bot:bot /app

USER bot

EXPOSE 3000

CMD ["node", "src/index.js"]
