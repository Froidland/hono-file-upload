FROM oven/bun:1.1.44-alpine

WORKDIR /home/bun/app

COPY package.json .
COPY bun.lock .

RUN bun install --production --frozen-lockfile

COPY . .

EXPOSE 3000

CMD [ "bun", "src/main.ts" ]
