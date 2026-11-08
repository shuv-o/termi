FROM alpine:3.20
RUN apk add --no-cache openssh python3 && ssh-keygen -A \
 && sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin yes/' /etc/ssh/sshd_config \
 && sed -i 's/^#\?AllowTcpForwarding.*/AllowTcpForwarding yes/' /etc/ssh/sshd_config \
 && sed -i 's/^#\?AllowAgentForwarding.*/AllowAgentForwarding yes/' /etc/ssh/sshd_config \
 && ssh-keygen -q -t ed25519 -N '' -C 'test user CA' -f /etc/ssh/user_ca \
 && echo 'TrustedUserCAKeys /etc/ssh/user_ca.pub' >> /etc/ssh/sshd_config \
 && mkdir -p /root/.ssh && chmod 700 /root/.ssh
ARG SSH_PASSWORD
RUN echo "root:${SSH_PASSWORD}" | chpasswd
COPY site /srv
COPY server.py /server.py
CMD sh -c "python3 /server.py & /usr/sbin/sshd -D -e"
