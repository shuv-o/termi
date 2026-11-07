FROM alpine:3.20
RUN apk add --no-cache xvfb x11vnc xterm font-misc-misc
ARG VNC_PASSWORD
ENV VNC_PASSWORD=${VNC_PASSWORD}
CMD sh -c "Xvfb :0 -screen 0 1024x768x24 & sleep 1; DISPLAY=:0 xterm -geometry 100x30+10+10 -e sh & x11vnc -display :0 -forever -shared -rfbport 5900 -passwd $VNC_PASSWORD -quiet"
