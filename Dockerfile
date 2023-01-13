FROM node:17-alpine 

RUN npm install -g nodemon

WORKDIR /backend

COPY . .

RUN npm install

EXPOSE 3000

CMD ["npm", "run",  "dev:local"] 