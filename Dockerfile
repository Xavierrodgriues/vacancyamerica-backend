FROM node:20-alpine

WORKDIR /app

COPY package*.json .

# Install all deps (including devDependencies for nodemon) in dev,
# but in the Docker image we use the production start command.
RUN npm install --omit=dev

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]