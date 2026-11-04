/**
 * The read-only security scan, as shipped to the server over SSH (`sh -s`).
 *
 * Kept as a module rather than a loose .sh file so it is bundled with the app.
 * It must stay free of backticks and dollar-brace sequences, which a template
 * literal would interpret; scan-script.test.ts enforces that and runs `sh -n`.
 */
export const SCAN_SCRIPT = String.raw`# Termi security scan, v1.
#
# READ-ONLY. Nothing here writes to disk, restarts anything, or changes
# configuration. It runs as the login user; where a check needs root it uses
# 'sudo -n' (never prompts) when passwordless sudo exists, and otherwise
# reports what it could see. Output is 'key=value' lines parsed by evaluate.ts.
# POSIX sh only — no bashisms — so it runs on dash, ash and bash alike.

export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin"

out() { printf '%s=%s\n' "$1" "$(printf '%s' "$2" | tr '\n\t' '  ' | sed 's/  */ /g; s/ *$//')"; }
has() { command -v "$1" >/dev/null 2>&1; }
# Bound anything that might touch the network or a slow package database.
tmo() { if has timeout; then timeout "$@"; else shift; "$@"; fi; }

echo "TERMI_SCAN=1"

# ── Privilege ────────────────────────────────────────────────────────────────
uid=$(id -u 2>/dev/null)
out uid "$uid"
out user "$(id -un 2>/dev/null)"
SUDO=""
if [ "$uid" = "0" ]; then
    out priv root
elif has sudo && sudo -n true >/dev/null 2>&1; then
    SUDO="sudo -n"
    out priv sudo
else
    out priv none
fi
# Run with elevated rights when we have them; silently as ourselves otherwise.
run() { $SUDO "$@" 2>/dev/null; }

# ── OS ───────────────────────────────────────────────────────────────────────
if [ -r /etc/os-release ]; then
    (
        . /etc/os-release
        out os_id "$ID"
        out os_like "$ID_LIKE"
        out os_name "$PRETTY_NAME"
        out os_version "$VERSION_ID"
    )
fi
out kernel "$(uname -sr 2>/dev/null)"

# ── SSH daemon configuration ─────────────────────────────────────────────────
SSHD=$(command -v sshd 2>/dev/null || echo /usr/sbin/sshd)
cfg=""
if [ -x "$SSHD" ]; then
    # 'sshd -T' prints the *effective* config, but needs to read host keys,
    # so it only works as root.
    cfg=$(run "$SSHD" -T 2>/dev/null)
fi
if [ -n "$cfg" ]; then
    out sshd_source effective
elif [ -r /etc/ssh/sshd_config ]; then
    # Fall back to reading the files ourselves: first value wins, drop-ins
    # first when the main file includes them (as Debian/Ubuntu/Fedora do),
    # and Match blocks ignored.
    order=""
    if grep -qiE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d' /etc/ssh/sshd_config 2>/dev/null; then
        for f in /etc/ssh/sshd_config.d/*.conf; do
            [ -e "$f" ] || continue
            if [ -r "$f" ]; then order="$order $f"; else out sshd_unreadable "$f"; fi
        done
    fi
    order="$order /etc/ssh/sshd_config"
    # shellcheck disable=SC2086
    cfg=$(awk 'FNR==1{m=0} { sub(/#.*/,"") } tolower($1)=="match"{m=1} !m && NF>=2 {
            k=tolower($1); if (!(k in s)) { s[k]=1; $1=""; sub(/^ +/,""); print k" "$0 } }' $order 2>/dev/null)
    out sshd_source files
else
    out sshd_source none
fi
get() { printf '%s\n' "$cfg" | awk -v k="$1" 'tolower($1)==k { $1=""; sub(/^ +/,""); print; exit }'; }
for k in port listenaddress permitrootlogin passwordauthentication kbdinteractiveauthentication \
         challengeresponseauthentication pubkeyauthentication permitemptypasswords usepam \
         maxauthtries logingracetime x11forwarding allowusers allowgroups; do
    out "sshd_$k" "$(get "$k")"
done
out ssh_version "$(ssh -V 2>&1 | head -n 1)"
if has systemctl; then
    # Ubuntu 22.10+ starts sshd from ssh.socket; the port then lives there.
    sock=$(systemctl is-active ssh.socket 2>/dev/null)
    out ssh_socket "$sock"
    [ "$sock" = "active" ] && out ssh_socket_listen "$(systemctl show ssh.socket -p Listen --value 2>/dev/null)"
fi

# ── Brute-force protection ──────────────────────────────────────────────────
f2b=absent
if has fail2ban-client || [ -x /usr/bin/fail2ban-client ]; then
    f2b=installed
    if has systemctl && [ "$(systemctl is-active fail2ban 2>/dev/null)" = "active" ]; then
        f2b=active
        if [ -n "$SUDO" ] || [ "$uid" = "0" ]; then
            if run fail2ban-client status sshd >/dev/null; then out fail2ban_sshd yes; else out fail2ban_sshd no; fi
        fi
    fi
fi
out fail2ban "$f2b"
for svc in sshguard crowdsec; do
    if has systemctl && [ "$(systemctl is-active "$svc" 2>/dev/null)" = "active" ]; then out "$svc" active; fi
done

# ── Firewall ─────────────────────────────────────────────────────────────────
fw=none
if has ufw; then
    s=$(run ufw status | head -n 1)
    case "$s" in
        "Status: active"*) fw=ufw ;;
        "") [ "$fw" = none ] && fw=unknown ;;
    esac
fi
if [ "$fw" = none ] || [ "$fw" = unknown ]; then
    if has firewall-cmd && [ "$(firewall-cmd --state 2>/dev/null)" = "running" ]; then fw=firewalld; fi
fi
if [ "$fw" = none ] || [ "$fw" = unknown ]; then
    if has nft; then
        rules=$(run nft list ruleset)
        if [ -n "$rules" ]; then
            printf '%s\n' "$rules" | grep -qE 'policy drop|[[:space:]](drop|reject)([[:space:]]|$)' && fw=nftables
        elif [ -z "$SUDO" ] && [ "$uid" != "0" ]; then fw=unknown; fi
    fi
fi
if [ "$fw" = none ] || [ "$fw" = unknown ]; then
    if has iptables; then
        rules=$(run iptables -S INPUT)
        if [ -n "$rules" ]; then
            printf '%s\n' "$rules" | grep -qE '^-P INPUT (DROP|REJECT)|-j (DROP|REJECT)' && fw=iptables
        elif [ -z "$SUDO" ] && [ "$uid" != "0" ]; then fw=unknown; fi
    fi
fi
out firewall "$fw"

# ── Updates ──────────────────────────────────────────────────────────────────
au=unknown
if has apt-config; then
    if apt-config dump 2>/dev/null | grep -qE 'APT::Periodic::Unattended-Upgrade "1"'; then au=enabled; else au=disabled; fi
    # Simulated upgrade against the local package cache: no network, no lock.
    pend=$(tmo 20 apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep -c '^Inst')
    sec=$(tmo 20 apt-get -s -o Debug::NoLocking=1 upgrade 2>/dev/null | grep '^Inst' | grep -ci 'security')
    out updates_pending "$pend"
    out updates_security "$sec"
    [ -f /var/run/reboot-required ] && out reboot_required yes
elif has dnf || has yum; then
    au=disabled
    if has systemctl; then
        for t in dnf-automatic.timer dnf-automatic-install.timer dnf5-automatic.timer yum-cron.service; do
            [ "$(systemctl is-enabled "$t" 2>/dev/null)" = "enabled" ] && au=enabled
        done
    fi
    pm=dnf; has dnf || pm=yum
    # -C: cache only, so the scan never goes to the network.
    pend=$(tmo 20 $pm -C -q check-update 2>/dev/null | grep -cE '^[A-Za-z0-9_.+-]+\.[a-z0-9_]+[[:space:]]')
    out updates_pending "$pend"
fi
out autoupdates "$au"

# ── Listening services ───────────────────────────────────────────────────────
if has ss; then
    # With privilege, -p adds the owning process name.
    lines=$(run ss -Htlnp)
    [ -n "$lines" ] || lines=$(ss -Htln 2>/dev/null)
    printf '%s\n' "$lines" | awk 'NF>=4 {
        p=""; if (match($0, /users:\(\("[^"]+"/)) { p=substr($0, RSTART+9, RLENGTH-10) }
        print "listen=" $4 " " p }'
    out listen_tool ss
elif has netstat; then
    netstat -tln 2>/dev/null | awk '$1 ~ /^tcp/ && $6=="LISTEN" { print "listen=" $4 }'
    out listen_tool netstat
else
    out listen_tool none
fi

# ── Accounts ─────────────────────────────────────────────────────────────────
out uid0_extra "$(awk -F: '$3==0 && $1!="root" {print $1}' /etc/passwd 2>/dev/null)"
if [ -n "$SUDO" ] || [ "$uid" = "0" ]; then
    out empty_passwords "$(run awk -F: '$2=="" {print $1}' /etc/shadow)"
fi
if [ -s "$HOME/.ssh/authorized_keys" ]; then out authorized_keys yes; else out authorized_keys no; fi

echo "TERMI_SCAN_END=1"
`;
