FROM node:18-alpine

WORKDIR /usr/src/app

# Copy package.json first
COPY backend/package*.json ./

# Use npm install instead of npm ci (doesn't require package-lock.json)
RUN npm install --only=production

# Copy the rest of the application
COPY backend/ ./backend/
COPY public/ ./public/

# Create data directory
RUN mkdir -p /data && chown -R node:node /data

# Switch to non-root user
USER node

# Set environment variables
ENV NODE_ENV=production
ENV DATA_DIR=/data

# Set working directory to backend
WORKDIR /usr/src/app/backend

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "server.js"]