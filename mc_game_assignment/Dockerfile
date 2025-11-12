FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/mc_app

# Install app dependencies
COPY package*.json ./
RUN npm install

# RUN npm install express socket.io uuid

# Copy app source code
COPY . .

COPY package*.json ./

# Only install production dependencies
RUN npm ci --only=production

# Expose the port the app runs on
EXPOSE 3003

# Start the app
CMD ["npm", "start"]