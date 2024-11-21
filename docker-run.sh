source .env

docker run -d --name files -p $PORT:3000 --env-file .env -e PORT=3000 --restart unless-stopped --mount type=bind,source=$(pwd)/files,destination=/home/bun/app/files files
