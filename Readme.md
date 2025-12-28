docker buildx build -t remote-video-handler:final .

docker run -it --rm --env-file .env -p 3000:3000 -p 4040:4040 remote-video-handler:final

docker save -o remote-video-handler.tar remote-video-handler:final