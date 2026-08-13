# Stage 1: Build React/Vite
FROM node:22-bullseye-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Serve using Nginx
FROM nginx:alpine

# Copy built files from previous stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port (default 80)
EXPOSE 80

# Setup custom configuration to proxy API to backend
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Run nginx quietly
CMD ["nginx", "-g", "daemon off;"]
