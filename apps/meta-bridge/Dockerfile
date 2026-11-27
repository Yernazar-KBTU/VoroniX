FROM node:20-alpine
# ffmpeg lets the bridge look at video frames (and convert odd audio formats). Remove if you only need voice and photos.
RUN apk add --no-cache ffmpeg
WORKDIR /app
COPY package.json ./
COPY src ./src
ENV NODE_ENV=production
EXPOSE 4000
USER node
CMD ["node", "src/server.mjs"]
