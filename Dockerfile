FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy source
COPY src/ ./src/

# Create non-root user
RUN addgroup -S fzap && adduser -S fzap -G fzap \
    && chown -R fzap:fzap /app

USER fzap

EXPOSE 3000

CMD ["node", "src/index.js"]