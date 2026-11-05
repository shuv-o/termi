/**
 * Shell scripts for hardening a server (Phase 2).
 *
 * Everything that reaches a script is validated here first and is drawn from
 * narrow alphabets (usernames, run ids, generated passwords, OpenSSH public
 * keys), so values can be embedded in single quotes without escaping. Scripts
 * travel over stdin to `sh -s` — never as command-line arguments, which other
 * users of the server could read from `ps`.
 *
 * Lockout protection, in order:
 *   1. back up every file the access script will touch;
 *   2. arm an on-server rollback that restores them in ROLLBACK_SECONDS;
 *   3. apply, validating sshd's config before reloading it;
 *   4. Termi proves the new login works over a *fresh* connection;
 *   5. only then is the rollback cancelled (from that new connection) and the
 *      new credentials committed.
 * If Termi dies at any point, the server restores itself.
 */

export const ROLLBACK_SECONDS = 300;
const BACKUP_ROOT = '/var/backups/termi-hardening';
export const DROPIN_PATH = '/etc/ssh/sshd_config.d/00-termi-hardening.conf';

export class HardeningInputError extends Error {}

const USERNAME = /^[a-z_][a-z0-9_-]{0,31}$/;
const RUN_ID = /^[a-z0-9]{8,40}$/;
const PASSWORD = /^[A-Za-z0-9]{16,64}$/;
const PUBLIC_KEY =
    /^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp(256|384|521)|sk-ssh-ed25519@openssh\.com|sk-ecdsa-sha2-nistp256@openssh\.com) [A-Za-z0-9+/]+={0,3}( [A-Za-z0-9@._+-]{1,64})?$/;

export function assertUsername(name: string): string {
    if (!USERNAME.test(name) || name === 'root') {
        throw new HardeningInputError(
            'Usernames are lowercase letters, digits, - and _, start with a letter, and are at most 32 characters',
        );
    }
    return name;
}

/** Normalises one OpenSSH public key line, or rejects it. */
export function assertPublicKey(line: string): string {
    const key = line.trim().replace(/\s+/g, ' ');
    if (!PUBLIC_KEY.test(key)) {
        throw new HardeningInputError(
            'That does not look like an OpenSSH public key (it should start with ssh-ed25519, ssh-rsa or ecdsa-sha2-…)',
        );
    }
    return key;
}

function check(re: RegExp, value: string, what: string) {
    if (!re.test(value)) throw new HardeningInputError(`Invalid ${what}`);
}

/** A strong password from an alphabet that is safe inside single quotes. */
export function generatePassword(randomBytes: (n: number) => Buffer, length = 28): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const out: string[] = [];
    while (out.length < length) {
        for (const byte of randomBytes(length * 2)) {
            // Reject-sample so every character is equally likely.
            if (byte < alphabet.length * Math.floor(256 / alphabet.length)) {
                out.push(alphabet[byte % alphabet.length]);
                if (out.length === length) break;
            }
        }
    }
    return out.join('');
}

export interface AccessScriptInput {
    runId: string;
    /** The account Termi will log in as afterwards. */
    targetUser: string;
    /** Create targetUser (with sudo) if it does not exist. */
    createUser: boolean;
    /** Set this password on targetUser. Null leaves its password alone. */
    newPassword: string | null;
    /** Public keys to authorise for targetUser (Termi's own first). */
    publicKeys: string[];
    disablePasswordLogin: boolean;
    /** 'no' once Termi stops logging in as root; else key-only root. */
    /** 'yes' allows a root password too (only while PasswordAuthentication is on). */
    permitRootLogin: 'no' | 'prohibit-password' | 'yes';
    /** The port sshd listens on now. */
    sshPort: number;
    /**
     * Move SSH here. sshd listens on BOTH ports until Termi has logged in on
     * the new one; buildClosePortScript closes the old one after commit.
     */
    newPort: number | null;
    /**
     * 'enable': turn the firewall on (default deny) with allowPorts open.
     * 'open-only': it is already on — just make sure allowPorts are open
     * (used when moving the port behind an existing firewall).
     */
    firewall: { mode: 'enable' | 'open-only'; tool: FirewallTool; allowPorts: number[] } | null;
}

export type FirewallTool = 'ufw' | 'firewalld';

export function assertPort(port: number, what = 'port'): number {
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new HardeningInputError(`Invalid ${what}: ${port}`);
    }
    return port;
}

/** sh single-quoted literal. Inputs are pre-validated to contain no quotes. */
const q = (v: string) => {
    if (v.includes("'")) throw new HardeningInputError('Unexpected quote in input');
    return `'${v}'`;
};

export function buildAccessScript(input: AccessScriptInput): string {
    check(RUN_ID, input.runId, 'run id');
    if (input.targetUser !== 'root') assertUsername(input.targetUser);
    if (input.newPassword !== null) check(PASSWORD, input.newPassword, 'password');
    if (input.publicKeys.length === 0) throw new HardeningInputError('No public key to install');
    const keys = input.publicKeys.map(assertPublicKey);
    assertPort(input.sshPort, 'SSH port');
    if (input.newPort !== null) {
        assertPort(input.newPort, 'new SSH port');
        if (input.newPort < 1024)
            throw new HardeningInputError('Pick an SSH port of 1024 or higher');
        if (input.newPort === input.sshPort)
            throw new HardeningInputError('That is already the SSH port');
    }
    const allowPorts = input.firewall
        ? [
              ...new Set([
                  input.sshPort,
                  ...(input.newPort ? [input.newPort] : []),
                  ...input.firewall.allowPorts.map((p) => assertPort(p)),
              ]),
          ]
        : [];

    const B = `${BACKUP_ROOT}/${input.runId}`;
    const dropin = [
        '# Managed by Termi. Read before every other sshd_config.d file, so these win.',
        `PermitRootLogin ${input.permitRootLogin}`,
        'PubkeyAuthentication yes',
        `PasswordAuthentication ${input.disablePasswordLogin ? 'no' : 'yes'}`,
        ...(input.disablePasswordLogin ? ['KbdInteractiveAuthentication no'] : []),
        'PermitEmptyPasswords no',
        'MaxAuthTries 3',
        'LoginGraceTime 30',
        'X11Forwarding no',
        // Both ports while the move is in progress; the old one is dropped later.
        ...(input.newPort ? [`Port ${input.sshPort}`, `Port ${input.newPort}`] : []),
    ].join('\\n');

    return `set -u
umask 077
R=${q(input.runId)}
B=${q(B)}
U=${q(input.targetUser)}
DROPIN=${q(DROPIN_PATH)}
CREATE=${input.createUser ? 1 : 0}
step() { printf 'STEP=%s %s\\n' "$1" "$2"; }
fail() { printf 'FAIL=%s %s\\n' "$1" "$2"; exit 1; }
has() { command -v "$1" >/dev/null 2>&1; }
home_of() { awk -F: -v u="$1" '$1==u {print $6}' /etc/passwd; }

[ "$(id -u)" = "0" ] || fail privilege "not running as root"
SSHD=$(command -v sshd 2>/dev/null || echo /usr/sbin/sshd)
[ -x "$SSHD" ] || fail sshd "sshd was not found"
ver=$(ssh -V 2>&1 | sed -n 's/^OpenSSH_\\([0-9][0-9]*\\)\\.\\([0-9][0-9]*\\).*/\\1 \\2/p' | head -n 1)
set -- $ver
if [ -z "\${1:-}" ] || [ "$1" -lt 8 ] || { [ "$1" -eq 8 ] && [ "\${2:-0}" -lt 2 ]; }; then
    fail sshd "OpenSSH 8.2 or newer is needed (found: \${ver:-unknown})"
fi

# 1. Backups ───────────────────────────────────────────────────────────────
mkdir -p "$B" || fail backup "could not create $B"
cp -p /etc/ssh/sshd_config "$B/sshd_config" || fail backup "could not back up sshd_config"
if [ -d /etc/ssh/sshd_config.d ]; then cp -a /etc/ssh/sshd_config.d "$B/sshd_config.d"; else : > "$B/sshd_config.d.none"; fi
if id "$U" >/dev/null 2>&1; then
    H=$(home_of "$U")
    if [ -f "$H/.ssh/authorized_keys" ]; then cp -p "$H/.ssh/authorized_keys" "$B/authorized_keys"; else : > "$B/authorized_keys.none"; fi
    awk -F: -v u="$U" '$1==u {print $2}' /etc/shadow > "$B/shadow_hash"
fi
step backup "Saved the current configuration to $B"

# 2. Rollback, armed before anything changes ────────────────────────────────
cat > "$B/rollback.sh" <<'TERMI_ROLLBACK'
#!/bin/sh
B="$(dirname "$0")"
[ -f "$B/CANCELLED" ] && exit 0
[ -f "$B/ROLLED_BACK" ] && exit 0
# Step-specific undo hooks, newest first (firewall, ssh.socket, SELinux…).
for f in $(ls "$B"/undo-*.sh 2>/dev/null | sort -r); do sh "$f"; done
cp -p "$B/sshd_config" /etc/ssh/sshd_config
rm -rf /etc/ssh/sshd_config.d
[ -d "$B/sshd_config.d" ] && cp -a "$B/sshd_config.d" /etc/ssh/sshd_config.d
U="$(cat "$B/user")"
if [ -f "$B/created_user" ]; then
    userdel -r "$U" 2>/dev/null || deluser --remove-home "$U" 2>/dev/null
    rm -f "/etc/sudoers.d/90-termi-$U"
else
    H=$(awk -F: -v u="$U" '$1==u {print $6}' /etc/passwd)
    if [ -f "$B/authorized_keys" ]; then cp -p "$B/authorized_keys" "$H/.ssh/authorized_keys"
    elif [ -f "$B/authorized_keys.none" ]; then rm -f "$H/.ssh/authorized_keys"; fi
    if [ -s "$B/shadow_hash" ]; then
        if command -v usermod >/dev/null 2>&1; then usermod -p "$(cat "$B/shadow_hash")" "$U"
        else printf '%s:%s\\n' "$U" "$(cat "$B/shadow_hash")" | chpasswd -e; fi
    fi
fi
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl try-restart ssh sshd 2>/dev/null
elif command -v rc-service >/dev/null 2>&1; then rc-service sshd reload
else kill -HUP "$(cat /run/sshd.pid /var/run/sshd.pid 2>/dev/null | head -n 1)" 2>/dev/null; fi
# Socket-activated sshd takes its port from ssh.socket / sshd.socket; the
# undo hooks above removed Termi's overrides, so reload and restart them.
if command -v systemctl >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
    systemctl daemon-reload
    for u in ssh.socket sshd.socket; do
        systemctl is-active --quiet "$u" 2>/dev/null && systemctl restart "$u"
    done
fi
date > "$B/ROLLED_BACK"
TERMI_ROLLBACK
printf '%s\\n' "$U" > "$B/user"
if has systemd-run && [ -d /run/systemd/system ]; then
    systemd-run --quiet --unit "termi-rollback-$R" --on-active=${ROLLBACK_SECONDS} /bin/sh "$B/rollback.sh" \\
        || fail rollback "could not schedule the automatic rollback"
else
    if has setsid; then
        setsid sh -c "sleep ${ROLLBACK_SECONDS}; sh '$B/rollback.sh'" >/dev/null 2>&1 < /dev/null &
    else
        nohup sh -c "sleep ${ROLLBACK_SECONDS}; sh '$B/rollback.sh'" >/dev/null 2>&1 < /dev/null &
    fi
fi
step rollback "Automatic rollback armed: the server restores itself in ${ROLLBACK_SECONDS / 60} minutes unless Termi confirms"

# 3. Account ────────────────────────────────────────────────────────────────
if [ "$CREATE" = "1" ] && ! id "$U" >/dev/null 2>&1; then
    if has useradd; then useradd -m -s /bin/sh "$U" || fail user "could not create $U"
    else adduser -D -s /bin/sh "$U" || fail user "could not create $U"; fi
    [ -x /bin/bash ] && { usermod -s /bin/bash "$U" 2>/dev/null || true; }
    : > "$B/created_user"
    passwd -l "$U" >/dev/null 2>&1 || true
    # Only for a user Termi created: sudoers applies the *last* matching rule,
    # so adding one for an existing user could silently take away their
    # passwordless sudo.
    if [ -d /etc/sudoers.d ] && has visudo; then
        printf '%s ALL=(ALL) ALL\\n' "$U" > "/etc/sudoers.d/90-termi-$U"
        chmod 440 "/etc/sudoers.d/90-termi-$U"
        visudo -cf "/etc/sudoers.d/90-termi-$U" >/dev/null 2>&1 || { rm -f "/etc/sudoers.d/90-termi-$U"; fail sudo "the sudoers entry did not validate"; }
    else
        fail sudo "sudo is not installed, so $U could not be given admin rights"
    fi
    step user "Created $U with sudo rights"
fi
${
    input.newPassword !== null
        ? `printf '%s:%s\\n' "$U" ${q(input.newPassword)} | chpasswd || fail password "could not set the password"
passwd -u "$U" >/dev/null 2>&1 || true
step password "Set a new password for $U"`
        : ''
}

# 4. SSH key ────────────────────────────────────────────────────────────────
H=$(home_of "$U")
[ -n "$H" ] || fail key "could not find the home directory of $U"
mkdir -p "$H/.ssh" && chmod 700 "$H/.ssh"
AK="$H/.ssh/authorized_keys"
touch "$AK" && chmod 600 "$AK"
${keys.map((k) => `grep -qxF ${q(k)} "$AK" || printf '%s\\n' ${q(k)} >> "$AK"`).join('\n')}
chown -R "$U:$(id -gn "$U")" "$H/.ssh"
has restorecon && restorecon -R "$H/.ssh" >/dev/null 2>&1
step key "Authorised ${keys.length} SSH key${keys.length === 1 ? '' : 's'} for $U"

# 5a. New SSH port: checks + SELinux ─────────────────────────────────────────
NEWPORT=${input.newPort ?? 0}
OLDPORT=${input.sshPort}
if [ "$NEWPORT" != "0" ]; then
    if grep -hiE '^[[:space:]]*ListenAddress[[:space:]]+[^[:space:]]*:[0-9]+' /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf 2>/dev/null | grep -q .; then
        fail port "a ListenAddress line pins the SSH port; change it by hand instead"
    fi
    if has ss && ss -Htln 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$NEWPORT\$"; then
        fail port "port $NEWPORT is already in use on the server"
    fi
    if has getenforce && [ "$(getenforce 2>/dev/null)" != "Disabled" ]; then
        if ! has semanage; then dnf install -y -q policycoreutils-python-utils >/dev/null 2>&1 || yum install -y -q policycoreutils-python-utils >/dev/null 2>&1; fi
        has semanage || fail port "SELinux is on, but semanage is not installed, so the new port cannot be allowed"
        printf 'semanage port -d -t ssh_port_t -p tcp %s 2>/dev/null\n' "$NEWPORT" > "$B/undo-10-selinux.sh"
        semanage port -a -t ssh_port_t -p tcp "$NEWPORT" 2>/dev/null || semanage port -m -t ssh_port_t -p tcp "$NEWPORT" 2>/dev/null \
            || fail port "SELinux would not allow sshd on port $NEWPORT"
        step selinux "SELinux allows sshd on port $NEWPORT"
    fi
fi
${input.firewall ? buildFirewallSection(input.firewall.tool, input.firewall.mode, allowPorts) : ''}
# 5c. Every way SSH can be started at boot ──────────────────────────────────
# The port has to be right for whatever starts sshd at BOOT, not just for what
# is running now: a server can run the ssh service today and boot from
# ssh.socket tomorrow (or the reverse). So every socket unit that exists is
# configured, active or not, and the result is checked further down.
SOCKETS=""
has_unit() { systemctl list-unit-files "$1" 2>/dev/null | grep -q "^$1"; }
if [ "$NEWPORT" != "0" ] && has systemctl && [ -d /run/systemd/system ]; then
    # A fixed port in sshd's start-up options beats sshd_config at every boot.
    for f in /etc/default/ssh /etc/sysconfig/sshd; do
        if [ -f "$f" ] && grep -qE '^[^#]*(-p[[:space:]]*[0-9]|-o[[:space:]]*Port)' "$f"; then
            fail port "$f starts sshd with a fixed port option; remove it first, then move the port"
        fi
    done
    for svc in ssh.service sshd.service; do
        if systemctl show -p ExecStart --value "$svc" 2>/dev/null | grep -qE '(^|[[:space:]])(-p[[:space:]]*[0-9]|-oPort|-o[[:space:]]*Port)'; then
            fail port "$svc starts sshd with a fixed port option; remove it first, then move the port"
        fi
    done
    for u in ssh.socket sshd.socket; do
        has_unit "$u" || continue
        SOCKETS="$SOCKETS $u"
        # Always an explicit override, named to sort LAST: drop-ins apply in
        # name order across /etc, /run and /usr, so an admin's or provider's
        # own ssh.socket.d/*.conf — or the generator's addresses.conf — would
        # otherwise reset ListenStream after Termi's and win at boot.
        mkdir -p "/etc/systemd/system/$u.d"
        chmod 755 "/etc/systemd/system/$u.d"
        printf 'rm -f /etc/systemd/system/%s.d/zz-termi-port.conf\n' "$u" > "$B/undo-30-$u.sh"
        # Explicit IPv4 + IPv6 addresses with ipv6-only: a bare port under
        # Ubuntu's BindIPv6Only=ipv6-only would listen on IPv6 alone.
        printf '[Socket]\nListenStream=\nListenStream=0.0.0.0:%s\nListenStream=[::]:%s\nListenStream=0.0.0.0:%s\nListenStream=[::]:%s\nBindIPv6Only=ipv6-only\n' \
            "$OLDPORT" "$OLDPORT" "$NEWPORT" "$NEWPORT" > "/etc/systemd/system/$u.d/zz-termi-port.conf"
        chmod 644 "/etc/systemd/system/$u.d/zz-termi-port.conf"
    done
fi

# Would SSH come up on port $1 after a reboot? Checks the configuration every
# enabled boot path will use — not the processes running right now.
boot_check() {
    want="$1"
    "$SSHD" -T 2>/dev/null | awk '$1=="port" {print $2}' | grep -qx "$want" \
        || fail port "sshd's configuration does not include port $want"
    has systemctl && [ -d /run/systemd/system ] || return 0
    systemctl daemon-reload
    for u in $SOCKETS; do
        en=$(systemctl is-enabled "$u" 2>/dev/null)
        act=$(systemctl is-active "$u" 2>/dev/null)
        case "$en" in enabled|enabled-runtime|linked|linked-runtime|alias|indirect) ;; *) [ "$act" = "active" ] || continue ;; esac
        listen=$(systemctl show -p Listen --value "$u" 2>/dev/null)
        printf '%s\n' "$listen" | grep -qE "(^|[]: ])$want \\(Stream\\)" \
            || fail port "$u starts SSH at boot and would listen on $(printf '%s' "$listen" | tr '\n' ' '), not on port $want"
    done
}

# 5. sshd settings ──────────────────────────────────────────────────────────
mkdir -p /etc/ssh/sshd_config.d
if ! grep -qiE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\\.d/' /etc/ssh/sshd_config; then
    { printf 'Include /etc/ssh/sshd_config.d/*.conf\\n'; cat "$B/sshd_config"; } > /etc/ssh/sshd_config
fi
if [ "$NEWPORT" != "0" ]; then
    # Port is additive, not first-match: silence every other Port line so the
    # drop-in's pair is the whole list. (All of these files are backed up.)
    for f in /etc/ssh/sshd_config /etc/ssh/sshd_config.d/*.conf; do
        [ -f "$f" ] && [ "$f" != "$DROPIN" ] && sed -i 's/^[[:space:]]*[Pp][Oo][Rr][Tt][[:space:]]/#termi# &/' "$f"
    done
fi
printf '${dropin}\\n' > "$DROPIN"
chmod 644 "$DROPIN"
if ! "$SSHD" -t 2>"$B/sshd-t.err"; then
    sh "$B/rollback.sh"
    fail sshd "the new SSH settings did not validate, so they were reverted: $(head -n 1 "$B/sshd-t.err")"
fi
eff=$("$SSHD" -T 2>/dev/null | awk '$1=="passwordauthentication" {print $2}')
[ "$eff" = "${input.disablePasswordLogin ? 'no' : 'yes'}" ] || step sshd-warn "PasswordAuthentication resolves to '$eff' — another setting overrides Termi's"
if has systemctl && [ -d /run/systemd/system ]; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl try-restart ssh sshd 2>/dev/null
elif has rc-service; then rc-service sshd reload >/dev/null 2>&1
else kill -HUP "$(cat /run/sshd.pid /var/run/sshd.pid 2>/dev/null | head -n 1)" 2>/dev/null; fi
if [ "$NEWPORT" != "0" ]; then
    for u in $SOCKETS; do
        if systemctl is-active --quiet "$u" 2>/dev/null; then
            systemctl daemon-reload; systemctl restart "$u" || fail port "$u did not restart on the new port"
        fi
    done
    boot_check "$NEWPORT"
    boot_check "$OLDPORT"
    ports=$("$SSHD" -T 2>/dev/null | awk '$1=="port" {print $2}' | tr '\n' ' ')
    step port "sshd now listens on $ports(the old port closes once Termi has logged in on $NEWPORT)"
fi
step sshd "Applied the SSH settings and reloaded sshd"

echo "ACCESS_DONE=1"
`;
}

/** Run over the *new* login: proves access, then disarms the rollback. */
export function buildCancelScript(runId: string): string {
    check(RUN_ID, runId, 'run id');
    const B = `${BACKUP_ROOT}/${runId}`;
    return `B=${q(B)}
[ -f "$B/ROLLED_BACK" ] && { echo "ROLLED_BACK=1"; exit 0; }
date > "$B/CANCELLED"
if command -v systemctl >/dev/null 2>&1; then
    systemctl stop ${q(`termi-rollback-${runId}.timer`)} 2>/dev/null
    systemctl stop ${q(`termi-rollback-${runId}.service`)} 2>/dev/null
fi
[ -f "$B/CANCELLED" ] && echo "CANCELLED=1"
`;
}

/** Undo immediately (used when verification fails and the old login is still open). */
export function buildRollbackNowScript(runId: string): string {
    check(RUN_ID, runId, 'run id');
    const B = `${BACKUP_ROOT}/${runId}`;
    // CANCELLED only exists to stop the *timer*. An explicit undo must run
    // even after it was written — e.g. when saving the new credentials to
    // Termi failed after the rollback had already been disarmed.
    return `B=${q(B)}
rm -f "$B/CANCELLED"
[ -f "$B/rollback.sh" ] && sh "$B/rollback.sh"
[ -f "$B/ROLLED_BACK" ] && echo "ROLLED_BACK=1"
if command -v systemctl >/dev/null 2>&1; then systemctl stop ${q(`termi-rollback-${runId}.timer`)} 2>/dev/null; fi
`;
}

export interface ExtrasScriptInput {
    runId: string;
    family: 'debian' | 'rhel' | 'alpine' | 'other';
    fail2ban: boolean;
    autoUpdates: boolean;
    sshPort: number;
    /** Addresses fail2ban must never ban — Termi's gateway / the bastion. */
    ignoreIps: string[];
}

const IP = /^[0-9a-fA-F:.]{2,45}$/;

/** Steps that cannot lock anyone out — run after the new login is committed. */
export function buildExtrasScript(input: ExtrasScriptInput): string {
    check(RUN_ID, input.runId, 'run id');
    if (!Number.isInteger(input.sshPort) || input.sshPort < 1 || input.sshPort > 65535) {
        throw new HardeningInputError('Invalid SSH port');
    }
    const ignore = ['127.0.0.1/8', '::1', ...input.ignoreIps.filter((ip) => IP.test(ip))].join(' ');
    const B = `${BACKUP_ROOT}/${input.runId}`;

    const fail2ban = !input.fail2ban
        ? ''
        : `
# fail2ban ─────────────────────────────────────────────────────────────────
f2b_ok=1
if ! has fail2ban-client; then
    case "$FAMILY" in
        debian) DEBIAN_FRONTEND=noninteractive apt-get install -y -qq fail2ban python3-systemd >/dev/null 2>&1 || f2b_ok=0 ;;
        rhel) dnf install -y -q fail2ban >/dev/null 2>&1 || { dnf install -y -q epel-release >/dev/null 2>&1 && dnf install -y -q fail2ban >/dev/null 2>&1; } || f2b_ok=0 ;;
        alpine) apk add -q fail2ban >/dev/null 2>&1 || f2b_ok=0 ;;
        *) f2b_ok=0 ;;
    esac
fi
if [ "$f2b_ok" = "1" ] && has fail2ban-client; then
    if [ -f /var/log/auth.log ] || [ -f /var/log/secure ]; then backend=auto; else backend=systemd; fi
    mkdir -p /etc/fail2ban/jail.d
    [ -f /etc/fail2ban/jail.d/termi.local ] && cp -p /etc/fail2ban/jail.d/termi.local "$B/fail2ban-termi.local.prev"
    cat > /etc/fail2ban/jail.d/termi.local <<TERMI_JAIL
# Managed by Termi.
[sshd]
enabled  = true
port     = ${input.sshPort}
backend  = $backend
maxretry = 5
findtime = 10m
bantime  = 1h
ignoreip = ${ignore}
TERMI_JAIL
    if has systemctl && [ -d /run/systemd/system ]; then
        systemctl enable fail2ban >/dev/null 2>&1
        systemctl restart fail2ban >/dev/null 2>&1
        sleep 2
        if fail2ban-client status sshd >/dev/null 2>&1; then step fail2ban "fail2ban is protecting SSH"; else step fail2ban-fail "fail2ban is installed but its sshd jail did not start"; fi
    elif has rc-service; then
        rc-update add fail2ban >/dev/null 2>&1; rc-service fail2ban restart >/dev/null 2>&1
        step fail2ban "fail2ban is protecting SSH"
    else
        step fail2ban-fail "fail2ban is installed, but there is no service manager to start it"
    fi
else
    step fail2ban-fail "fail2ban could not be installed on this system"
fi
`;

    const updates = !input.autoUpdates
        ? ''
        : `
# Automatic security updates ───────────────────────────────────────────────
case "$FAMILY" in
    debian)
        if DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades >/dev/null 2>&1; then
            [ -f /etc/apt/apt.conf.d/20auto-upgrades ] && cp -p /etc/apt/apt.conf.d/20auto-upgrades "$B/20auto-upgrades.prev"
            printf 'APT::Periodic::Update-Package-Lists "1";\\nAPT::Periodic::Unattended-Upgrade "1";\\n' > /etc/apt/apt.conf.d/20auto-upgrades
            step updates "Security updates now install automatically (unattended-upgrades)"
        else
            step updates-fail "unattended-upgrades could not be installed"
        fi ;;
    rhel)
        if has dnf5; then pkg=dnf5-plugin-automatic; timer=dnf5-automatic.timer; else pkg=dnf-automatic; timer=dnf-automatic.timer; fi
        if dnf install -y -q "$pkg" >/dev/null 2>&1 && [ -f /etc/dnf/automatic.conf ]; then
            cp -p /etc/dnf/automatic.conf "$B/automatic.conf.prev"
            sed -i 's/^upgrade_type *=.*/upgrade_type = security/; s/^apply_updates *=.*/apply_updates = yes/' /etc/dnf/automatic.conf
            if has systemctl && [ -d /run/systemd/system ] && systemctl enable --now "$timer" >/dev/null 2>&1; then
                step updates "Security updates now install automatically ($timer)"
            else
                step updates-fail "dnf-automatic is configured, but its timer could not be started"
            fi
        else
            step updates-fail "dnf-automatic could not be installed"
        fi ;;
    *) step updates-skip "Automatic updates are not supported on this system yet" ;;
esac
`;

    return `set -u
FAMILY=${q(input.family)}
B=${q(B)}
step() { printf 'STEP=%s %s\\n' "$1" "$2"; }
has() { command -v "$1" >/dev/null 2>&1; }
[ "$(id -u)" = "0" ] || { echo "FAIL=privilege not running as root"; exit 1; }
mkdir -p "$B"
if [ "$FAMILY" = "debian" ]; then DEBIAN_FRONTEND=noninteractive apt-get update -qq >/dev/null 2>&1; fi
${fail2ban}${updates}
echo "EXTRAS_DONE=1"
`;
}

function buildFirewallSection(
    tool: FirewallTool,
    mode: 'enable' | 'open-only',
    ports: number[],
): string {
    const list = ports.map((p) => assertPort(p)).join(' ');
    if (tool === 'ufw') {
        return `
# 5b. Firewall (ufw) ────────────────────────────────────────────────────────
if ! has ufw; then
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw >/dev/null 2>&1 || fail firewall "ufw could not be installed"
fi
cp -a /etc/ufw "$B/ufw"
if ufw status 2>/dev/null | head -n 1 | grep -q 'Status: active'; then was=active; else was=inactive; fi
# Undo: put the rules back exactly, and leave ufw as on/off as it was.
{
    echo 'ufw --force disable >/dev/null 2>&1'
    echo "rm -rf /etc/ufw && cp -a '$B/ufw' /etc/ufw"
    [ "$was" = "active" ] && echo 'ufw --force enable >/dev/null 2>&1'
} > "$B/undo-20-firewall.sh"
# Allow first, enable after — the open SSH session is never cut.
for p in ${list}; do ufw allow "$p/tcp" >/dev/null 2>&1 || fail firewall "could not allow port $p"; done
${
    mode === 'enable'
        ? `ufw default deny incoming >/dev/null 2>&1
ufw default allow outgoing >/dev/null 2>&1
ufw --force enable >/dev/null 2>&1 || fail firewall "ufw could not be turned on"
step firewall "Firewall on: incoming traffic blocked except ports ${list}"`
        : `step firewall "Opened port(s) ${list} in the existing firewall"`
}
`;
    }
    return `
# 5b. Firewall (firewalld) ──────────────────────────────────────────────────
has systemctl && [ -d /run/systemd/system ] || fail firewall "firewalld needs systemd"
if ! has firewall-cmd; then
    dnf install -y -q firewalld >/dev/null 2>&1 || yum install -y -q firewalld >/dev/null 2>&1 || fail firewall "firewalld could not be installed"
fi
cp -a /etc/firewalld "$B/firewalld"
if [ "$(firewall-cmd --state 2>/dev/null)" = "running" ]; then was=running; else was=stopped; fi
if [ "$was" = "running" ]; then
    printf '%s\\n' "rm -rf /etc/firewalld && cp -a '$B/firewalld' /etc/firewalld && firewall-cmd --reload >/dev/null 2>&1" > "$B/undo-20-firewall.sh"
    for p in ${list}; do firewall-cmd --permanent --add-port="$p/tcp" >/dev/null 2>&1 || fail firewall "could not allow port $p"; done
    firewall-cmd --reload >/dev/null 2>&1 || fail firewall "firewalld could not reload"
    step firewall "Opened port(s) ${list} in firewalld"
else
${
    mode === 'enable'
        ? `    printf '%s\\n' "systemctl stop firewalld; systemctl disable firewalld >/dev/null 2>&1; rm -rf /etc/firewalld && cp -a '$B/firewalld' /etc/firewalld" > "$B/undo-20-firewall.sh"
    # Write the rules while it is stopped, so it starts with SSH already open.
    for p in ${list}; do firewall-offline-cmd --add-port="$p/tcp" >/dev/null 2>&1 || fail firewall "could not allow port $p"; done
    systemctl enable --now firewalld >/dev/null 2>&1 || fail firewall "firewalld could not be started"
    step firewall "Firewall on: incoming traffic blocked except ports ${list}"`
        : `    step firewall-skip "firewalld is not running, so no ports needed opening"`
}
fi
`;
}

export interface ClosePortInput {
    runId: string;
    oldPort: number;
    newPort: number;
    /** The firewall that had the old port open, if any. */
    firewallTool: FirewallTool | null;
}

/**
 * After commit: stop listening on the old SSH port and close it in the
 * firewall. Runs over the new port, which Termi has already logged in on, so
 * nothing here can cut off access. Failure just leaves the old port open.
 */
export function buildClosePortScript(input: ClosePortInput): string {
    check(RUN_ID, input.runId, 'run id');
    assertPort(input.oldPort);
    assertPort(input.newPort);
    const fw =
        input.firewallTool === 'ufw'
            ? `if has ufw; then
    ufw delete allow ${input.oldPort}/tcp >/dev/null 2>&1
    ${input.oldPort === 22 ? 'ufw delete allow 22 >/dev/null 2>&1; ufw delete allow OpenSSH >/dev/null 2>&1' : ':'}
fi`
            : input.firewallTool === 'firewalld'
              ? `if has firewall-cmd && [ "$(firewall-cmd --state 2>/dev/null)" = "running" ]; then
    firewall-cmd --permanent --remove-port=${input.oldPort}/tcp >/dev/null 2>&1
    ${input.oldPort === 22 ? 'firewall-cmd --permanent --remove-service=ssh >/dev/null 2>&1' : ':'}
    firewall-cmd --reload >/dev/null 2>&1
fi`
              : ':';
    return `set -u
DROPIN=${q(DROPIN_PATH)}
step() { printf 'STEP=%s %s\\n' "$1" "$2"; }
has() { command -v "$1" >/dev/null 2>&1; }
[ "$(id -u)" = "0" ] || { echo "FAIL=privilege not running as root"; exit 1; }
SSHD=$(command -v sshd 2>/dev/null || echo /usr/sbin/sshd)
cp -p "$DROPIN" "$DROPIN.termi-prev"
sed -i '/^Port ${input.oldPort}$/d' "$DROPIN"
if ! "$SSHD" -t 2>/dev/null; then
    mv "$DROPIN.termi-prev" "$DROPIN"
    step close-port-fail "Port ${input.oldPort} was left open: the updated SSH settings did not validate"
    exit 0
fi
rm -f "$DROPIN.termi-prev"
for u in ssh.socket sshd.socket; do
    OVR="/etc/systemd/system/$u.d/zz-termi-port.conf"
    [ -f "$OVR" ] && printf '[Socket]\\nListenStream=\\nListenStream=0.0.0.0:%s\\nListenStream=[::]:%s\\nBindIPv6Only=ipv6-only\\n' ${input.newPort} ${input.newPort} > "$OVR"
done
if has systemctl && [ -d /run/systemd/system ]; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl try-restart ssh sshd 2>/dev/null
    systemctl daemon-reload
    for u in ssh.socket sshd.socket; do
        systemctl is-active --quiet "$u" 2>/dev/null && systemctl restart "$u"
    done
    # Boot check for the port Termi now uses: every enabled socket unit must
    # list it, or the next reboot would bring SSH up elsewhere.
    for u in ssh.socket sshd.socket; do
        case "$(systemctl is-enabled "$u" 2>/dev/null)" in enabled|enabled-runtime|linked|linked-runtime|alias|indirect) ;; *) continue ;; esac
        systemctl show -p Listen --value "$u" 2>/dev/null | grep -qE "(^|[]: ])${input.newPort} \\(Stream\\)" \\
            || step boot-warn "$u would not listen on port ${input.newPort} after a reboot"
    done
elif has rc-service; then rc-service sshd reload >/dev/null 2>&1
else kill -HUP "$(cat /run/sshd.pid /var/run/sshd.pid 2>/dev/null | head -n 1)" 2>/dev/null; fi
${fw}
step close-port "SSH no longer listens on port ${input.oldPort}"
echo "CLOSE_DONE=1"
`;
}
