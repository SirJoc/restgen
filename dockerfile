FROM node:20 as build

WORKDIR /app

COPY . .

RUN npm install --only=production

RUN npm run build

EXPOSE 80

CMD ["sls", "offline", "--host", "0.0.0.0"]