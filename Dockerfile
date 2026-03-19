# Use an official Node.js runtime as a parent image
FROM node:18-alpine

# FFmpeg သည် m3u8 ပြောင်းရန် မရှိမဖြစ်လိုအပ်သဖြင့် Alpine Linux တွင် Install လုပ်ခြင်းဖြစ်သည်
RUN apk add --no-cache ffmpeg

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Create the public directory for HLS output
RUN mkdir -p public/hls_streams

# Expose the port the app runs on
EXPOSE 8080

# Command to run the app
CMD [ "npm", "start" ]
