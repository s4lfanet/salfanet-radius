FROM node:22-bullseye-slim

# Install radius client tools for executing Kick (PoD) commands
RUN apt-get update && \
    apt-get install -y freeradius-utils systemd procps && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Expose backend port
EXPOSE 5001

# Start application
CMD ["node", "index.js"]
