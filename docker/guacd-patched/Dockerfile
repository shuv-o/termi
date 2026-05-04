#
# Patched guacd 1.5.5 — fixes GUACAMOLE-1971 (pointer.c heap overflow)
#
# GUACAMOLE-1971 (open, unpatched in the official 1.5.5 release): When a
# Windows RDP server sends a POINTER_LARGE_PDU, FreeRDP 2.x may present the
# guacd pointer callback with dimensions whose product overflows a 32-bit
# _aligned_malloc size argument.  The subsequent buffer write then heap-
# overflows the guacd child process → SIGSEGV → "Unable to request
# termination of client process: No such process" in the parent.
#
# This Dockerfile rebuilds guacd 1.5.5 from the official Apache source
# with a single surgical patch to src/protocols/rdp/pointer.c that adds:
#   - Bounds check (reject width/height == 0 or > 1024)
#   - size_t cast on the _aligned_malloc size argument
#   - NULL check on the returned pointer
#
# Usage:
#   docker build -t termi-guacd:patched -f docker/guacd-patched/Dockerfile .
#   docker run -d -p 4822:4822 --name termi-guacd termi-guacd:patched
#

# ── Stage 1: build ───────────────────────────────────────────────────────────
FROM alpine:3.18 AS builder

ARG PREFIX_DIR=/opt/guacamole

# Build toolchain + headers needed by guacamole-server and its dependencies
RUN apk add --no-cache \
        autoconf                \
        automake                \
        build-base              \
        cairo-dev               \
        cmake                   \
        git                     \
        grep                    \
        libjpeg-turbo-dev       \
        libpng-dev              \
        libtool                 \
        libwebp-dev             \
        make                    \
        openssl1.1-compat-dev   \
        pango-dev               \
        pulseaudio-dev          \
        util-linux-dev

# Clone the exact 1.5.5 tag
RUN git clone --depth 1 --branch 1.5.5 \
        https://github.com/apache/guacamole-server.git \
        /tmp/guacamole-server

# Apply the GUACAMOLE-1971 pointer.c fix
COPY pointer.patch /tmp/pointer.patch
RUN cd /tmp/guacamole-server && patch -p1 < /tmp/pointer.patch

# ── Build arguments (mirrors the official 1.5.5 Dockerfile) ──────────────────
ARG WITH_FREERDP='2(\.\d+)+'
ARG WITH_LIBSSH2='libssh2-\d+(\.\d+)+'
ARG WITH_LIBTELNET='\d+(\.\d+)+'
ARG WITH_LIBVNCCLIENT='LibVNCServer-\d+(\.\d+)+'
ARG WITH_LIBWEBSOCKETS='v\d+(\.\d+)+'

ARG FREERDP_OPTS="\
    -DBUILTIN_CHANNELS=OFF \
    -DCHANNEL_URBDRC=OFF \
    -DWITH_ALSA=OFF \
    -DWITH_CAIRO=ON \
    -DWITH_CHANNELS=ON \
    -DWITH_CLIENT=ON \
    -DWITH_CUPS=OFF \
    -DWITH_DIRECTFB=OFF \
    -DWITH_FFMPEG=OFF \
    -DWITH_GSM=OFF \
    -DWITH_GSSAPI=OFF \
    -DWITH_IPP=OFF \
    -DWITH_JPEG=ON \
    -DWITH_LIBSYSTEMD=OFF \
    -DWITH_MANPAGES=OFF \
    -DWITH_OPENH264=OFF \
    -DWITH_OPENSSL=ON \
    -DWITH_OSS=OFF \
    -DWITH_PCSC=OFF \
    -DWITH_PULSE=OFF \
    -DWITH_SERVER=OFF \
    -DWITH_SERVER_INTERFACE=OFF \
    -DWITH_SHADOW_MAC=OFF \
    -DWITH_SHADOW_X11=OFF \
    -DWITH_SSE2=ON \
    -DWITH_WAYLAND=OFF \
    -DWITH_X11=OFF \
    -DWITH_X264=OFF \
    -DWITH_XCURSOR=ON \
    -DWITH_XEXT=ON \
    -DWITH_XI=OFF \
    -DWITH_XINERAMA=OFF \
    -DWITH_XKBFILE=ON \
    -DWITH_XRENDER=OFF \
    -DWITH_XTEST=OFF \
    -DWITH_XV=OFF \
    -DWITH_ZLIB=ON"

ARG GUACAMOLE_SERVER_OPTS="--disable-guaclog"

ARG LIBSSH2_OPTS="\
    -DBUILD_EXAMPLES=OFF \
    -DBUILD_SHARED_LIBS=ON"

ARG LIBTELNET_OPTS="\
    --disable-static \
    --disable-util"

ARG LIBVNCCLIENT_OPTS=""

ARG LIBWEBSOCKETS_OPTS="\
    -DDISABLE_WERROR=ON \
    -DLWS_WITHOUT_SERVER=ON \
    -DLWS_WITHOUT_TESTAPPS=ON \
    -DLWS_WITHOUT_TEST_CLIENT=ON \
    -DLWS_WITHOUT_TEST_PING=ON \
    -DLWS_WITHOUT_TEST_SERVER=ON \
    -DLWS_WITHOUT_TEST_SERVER_EXTPOLL=ON \
    -DLWS_WITH_STATIC=OFF"

# Run the official all-in-one build script
RUN /tmp/guacamole-server/src/guacd-docker/bin/build-all.sh

# Record runtime library dependencies for the runtime stage
RUN /tmp/guacamole-server/src/guacd-docker/bin/list-dependencies.sh \
        ${PREFIX_DIR}/sbin/guacd               \
        ${PREFIX_DIR}/lib/libguac-client-*.so  \
        ${PREFIX_DIR}/lib/freerdp2/*guac*.so   \
        > ${PREFIX_DIR}/DEPENDENCIES

# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM alpine:3.18

ARG PREFIX_DIR=/opt/guacamole

ENV LC_ALL=C.UTF-8
ENV LD_LIBRARY_PATH=${PREFIX_DIR}/lib
ENV GUACD_LOG_LEVEL=info

COPY --from=builder ${PREFIX_DIR} ${PREFIX_DIR}

RUN apk add --no-cache               \
        ca-certificates              \
        font-noto-cjk                \
        ghostscript                  \
        netcat-openbsd               \
        shadow                       \
        terminus-font                \
        ttf-dejavu                   \
        ttf-liberation               \
        util-linux-login &&          \
    xargs apk add --no-cache < ${PREFIX_DIR}/DEPENDENCIES

HEALTHCHECK --interval=5m --timeout=5s CMD nc -z 127.0.0.1 4822 || exit 1

ARG UID=1000
ARG GID=1000
RUN groupadd --gid $GID guacd
RUN useradd --system --create-home --shell /sbin/nologin --uid $UID --gid $GID guacd

USER guacd

EXPOSE 4822

CMD /opt/guacamole/sbin/guacd -b 0.0.0.0 -L $GUACD_LOG_LEVEL -f
