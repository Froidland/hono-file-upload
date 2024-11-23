#!/bin/bash

if test -f .env; then
	source .env
fi

docker run \
	-d \
	--name files \
	-p 127.0.0.1:${PORT:-4000}:3000 \
	--env-file .env \
	-e PORT=3000 \
	--restart unless-stopped \
	--mount type=bind,source=$(pwd)/files,destination=/home/bun/app/files \
	files
