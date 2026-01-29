# Fly.io Dockerfile for Deno Backend
FROM denoland/deno:1.40.0

# Set working directory
WORKDIR /app

# Copy dependency files first for better caching
COPY supabase/functions/deno.json ./
COPY supabase/functions/deno.lock* ./

# Cache dependencies
RUN deno cache --reload supabase/functions/deno.json || true

# Copy all function code
COPY supabase/functions ./supabase/functions

# Copy server entry point
COPY server.ts ./

# Cache the main server file
RUN deno cache server.ts

# Expose port
EXPOSE 8080

# Run the server
CMD ["deno", "run", "--allow-net", "--allow-env", "--allow-read", "server.ts"]
