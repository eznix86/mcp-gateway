FROM oven/bun:1-alpine

RUN adduser -D -s /bin/sh gateway

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY . .

RUN bun build src/docker.ts --target=bun --outfile=/app/gateway

# Create config directory for non-root user
RUN mkdir -p /home/gateway/.config/mcp-gateway && chown -R gateway:gateway /home/gateway

# Use non-root user
USER gateway

EXPOSE 3000

CMD ["/app/gateway"]
