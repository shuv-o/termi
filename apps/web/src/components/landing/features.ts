/**
 * Everything Termi does, for the landing page's feature explorer. Keep it in
 * step with the app: a feature that ships gets an entry here.
 */

export interface Feature {
    name: string;
    body: string;
    /** Concrete specifics: protocols, limits, settings. */
    details?: string[];
    /** Extra words the search box should match. */
    keywords?: string;
}

export interface FeatureGroup {
    id: string;
    name: string;
    summary: string;
    /** Tailwind background class for the group's colour mark. */
    bar: string;
    features: Feature[];
}

export const FEATURE_GROUPS: FeatureGroup[] = [
    {
        id: 'connect',
        name: 'Connect',
        summary: 'Every way into a server, from one tab strip.',
        bar: 'bg-proto-ssh',
        features: [
            {
                name: 'SSH terminal',
                body: 'A full terminal with colour, Unicode and every shortcut. Terminals keep running on the gateway when you close the tab, and pick up where you left them, output included.',
                details: [
                    'Search the scrollback with ⌘F',
                    'Closed after 8 hours with no output or typing, 7 days at most',
                    'Password, private key, certificate or security key login',
                ],
                keywords: 'xterm shell ssh terminal reconnect',
            },
            {
                name: 'Files over SFTP',
                body: 'A file manager beside the terminal: browse, upload, download, create folders, rename and delete, with progress for each transfer.',
                keywords: 'scp sftp upload download file manager',
            },
            {
                name: 'Remote desktop',
                body: 'Windows over RDP and Linux or macOS over VNC, drawn in the browser. On a phone, touches become mouse clicks and an on-screen keyboard appears.',
                details: [
                    'Clipboard sync in both directions',
                    'Display size, colour depth and RDP security per server',
                ],
                keywords: 'rdp vnc windows desktop guacamole',
            },
            {
                name: 'Telnet',
                body: 'For switches, routers and older devices that only speak Telnet.',
                keywords: 'telnet network legacy',
            },
            {
                name: 'Serial console',
                body: 'Plug a USB console cable into your computer and open a console from Chrome, Edge or the desktop app. The connection never leaves your computer.',
                details: [
                    'Baud rate, data bits, parity, stop bits, flow control',
                    'CR, LF or CR LF line endings, local echo, break signal',
                ],
                keywords: 'serial usb console cable baud web serial',
            },
            {
                name: 'Local terminal',
                body: 'A shell on your own computer in the desktop app: PowerShell on Windows, your default shell on macOS and Linux.',
                keywords: 'local shell powershell pty',
            },
            {
                name: 'Jump hosts',
                body: 'Reach servers behind a bastion, like ssh -J. Works for terminals, files, port forwarding and remote desktops.',
                keywords: 'bastion jump proxyjump',
            },
            {
                name: 'Port forwarding',
                body: 'Local (ssh -L), SOCKS proxy (ssh -D) and remote (ssh -R) forwards over one connection. A web app on the far side opens with one click, isolated from Termi itself.',
                details: [
                    'Runs in the desktop app, or anywhere with a small Node.js script',
                    'Several forwards side by side, listed on one page',
                ],
                keywords: 'tunnel port forward socks proxy -L -D -R',
            },
        ],
    },
    {
        id: 'work',
        name: 'Work faster',
        summary: 'Fewer clicks between you and the command you meant to run.',
        bar: 'bg-proto-scp',
        features: [
            {
                name: 'Split panes',
                body: 'Up to four terminals side by side, stacked or in a grid, with dividers you can drag or move with the arrow keys. The layout survives a reload.',
                keywords: 'split panes grid tmux',
            },
            {
                name: 'Workspaces',
                body: 'Save the open servers and their layout under a name and reopen the whole set in one click.',
                keywords: 'workspace layout save',
            },
            {
                name: 'Type in all panes',
                body: 'Send what you type to every visible terminal at once, with a clear banner while it is on.',
                keywords: 'broadcast synchronize panes',
            },
            {
                name: 'Snippets',
                body: 'Saved commands you send to the terminal or copy. Variables are asked for each time they run.',
                details: [
                    '{{name}}, {{name:default}}, and {{name|q}} for a shell-quoted value',
                    'Run from the terminal toolbar, the command palette or the Snippets page',
                ],
                keywords: 'snippet saved command variable',
            },
            {
                name: 'Command suggestions',
                body: 'As you type, the rest of a command you ran before on that server appears in grey. Press → to accept it.',
                details: [
                    'History stays in your browser',
                    'Passwords and commands starting with a space are never remembered',
                ],
                keywords: 'autocomplete suggestion history fish',
            },
            {
                name: 'Run on many servers',
                body: 'Run one command, or a snippet, on any selection of servers or a whole group, and see each server’s output and exit code.',
                keywords: 'broadcast run multiple servers group',
            },
            {
                name: 'Command palette',
                body: 'Press ⌘K or Ctrl+K to jump to any server, group, saved login, page or setting. Enter on a server connects.',
                keywords: 'search palette keyboard cmd k',
            },
            {
                name: 'Groups and favourites',
                body: 'Organise servers into groups, star the ones you use most, and find any of them by name, host or tag.',
                keywords: 'group folder favourite tag',
            },
            {
                name: 'Recordings',
                body: 'Record a terminal session and replay it later from History. Recordings are encrypted at rest.',
                keywords: 'record replay asciicast audit',
            },
            {
                name: 'Import and export',
                body: 'Bring servers in from ~/.ssh/config, PuTTY, MobaXterm or a CSV, with a preview before anything is saved. Export as a passphrase-encrypted file or a spreadsheet.',
                keywords: 'import export ssh config putty mobaxterm csv backup',
            },
            {
                name: 'QR quick connect',
                body: 'Scan a code with your phone to open a server there in one tap.',
                keywords: 'qr phone mobile',
            },
        ],
    },
    {
        id: 'ai',
        name: 'AI assistant',
        summary: 'Help with servers, errors and commands, without your secrets ever leaving.',
        bar: 'bg-proto-rdp',
        features: [
            {
                name: 'Ask AI in any terminal',
                body: 'Explain what is on screen, find out why a command failed, or describe what you want and get the command for it. A suggested command is pasted into the terminal, never run.',
                keywords: 'ai assistant chatgpt claude llm explain error command',
            },
            {
                name: 'Assistant',
                body: 'A full conversation page that knows your servers by name, never their addresses or passwords.',
                keywords: 'ai chat assistant conversation',
            },
            {
                name: 'Your provider, your model',
                body: 'Anthropic or OpenAI, or your own OpenAI-compatible server such as vLLM, Ollama or LM Studio. The deployment can offer one to everyone, and each user can bring their own key.',
                details: ['Any model name', 'Your key is stored encrypted and never shown again'],
                keywords: 'anthropic claude openai gpt vllm ollama lm studio local model api key',
            },
            {
                name: 'Secrets never leave',
                body: 'Every password, key and passphrase Termi holds for you, and anything that looks like a secret, is removed before a message is sent or saved.',
                keywords: 'privacy redaction secrets password',
            },
            {
                name: 'Memory',
                body: 'Conversations are kept, and the assistant remembers lasting facts about your setup. See, delete or turn off what it remembers.',
                keywords: 'memory history remember',
            },
        ],
    },
    {
        id: 'server-security',
        name: 'Server security',
        summary: 'Connections you can trust, and servers that are harder to break into.',
        bar: 'bg-primary',
        features: [
            {
                name: 'Known hosts',
                body: 'Each server’s SSH host key is pinned on the first connection and checked on every one after, for terminals, files, tunnels and monitoring alike. A changed key is refused, reported and emailed.',
                details: ['Review and trust a new key after signing in again'],
                keywords: 'host key fingerprint mitm known_hosts',
            },
            {
                name: 'Security keys for SSH',
                body: 'Use a YubiKey or any FIDO2 key as an SSH key. The private key never leaves the device, and every login asks for a touch.',
                details: ['Needs OpenSSH 8.2 or newer and one sshd_config line, shown in the app'],
                keywords: 'fido2 yubikey webauthn hardware key',
            },
            {
                name: 'Certificates',
                body: 'Log in with OpenSSH user certificates next to the private key, for every kind of connection.',
                details: ['ed25519, ECDSA and RSA certificates'],
                keywords: 'certificate ca cert-pub',
            },
            {
                name: 'Agent forwarding',
                body: 'Let a server use your keys to pull from git or hop onward, like ssh -A, without the keys ever leaving Termi.',
                details: [
                    'Off, ask each time, or on, per server',
                    'Only the server’s owner can forward keys',
                ],
                keywords: 'agent forwarding ssh -A',
            },
            {
                name: 'One-click hardening',
                body: 'Scan a server’s SSH and firewall setup, get a score, and fix it automatically.',
                details: [
                    'Key-only login, a dedicated admin user, root login choice',
                    'fail2ban, unattended updates, firewall and SSH port move',
                    'Every change has a rollback armed on the server and is proven on a fresh login first',
                ],
                keywords: 'harden scan score fail2ban firewall ufw',
            },
            {
                name: 'Private networks stay private',
                body: 'Termi refuses to connect to internal addresses unless you allow it, and never to cloud metadata endpoints.',
                keywords: 'ssrf private network metadata',
            },
        ],
    },
    {
        id: 'data',
        name: 'Your data',
        summary: 'What protects the passwords and keys you store.',
        bar: 'bg-success',
        features: [
            {
                name: 'Encrypted credentials',
                body: 'Server passwords, private keys, saved logins, 2FA secrets and recordings are encrypted with AES-256-GCM, each locked to its field and to its owner. The key is kept out of the database.',
                details: [
                    'Key rotation without losing anything',
                    'The key can be read from a file for Docker or Kubernetes secrets',
                ],
                keywords: 'aes encryption key rotation',
            },
            {
                name: 'Secrets stay on the server',
                body: 'The browser never receives a server’s password or key to connect. Showing a saved one asks you to sign in again and is logged.',
                keywords: 'reveal step-up reauth',
            },
            {
                name: 'Access ends, connections end',
                body: 'Sign out a device, change your password, remove a share or a team member, or delete a server, and every connection that relied on it closes within seconds.',
                keywords: 'revoke revocation session close',
            },
            {
                name: 'History',
                body: 'Every terminal, file browser and desktop you opened, and every sign-in and security event, listed for you alone.',
                keywords: 'history activity audit log',
            },
        ],
    },
    {
        id: 'sign-in',
        name: 'Sign-in and accounts',
        summary: 'Strong sign-in that fits how your organisation already works.',
        bar: 'bg-proto-rdp',
        features: [
            {
                name: 'Passkeys',
                body: 'Sign in with Touch ID, Face ID, Windows Hello or a security key, in the browser and the desktop app. Turn password sign-in off entirely if you like.',
                keywords: 'passkey webauthn passwordless',
            },
            {
                name: 'Two-factor',
                body: 'An authenticator app or codes by email, with recovery codes for a lost phone.',
                keywords: 'totp 2fa mfa authenticator',
            },
            {
                name: 'Single sign-on',
                body: 'Okta, Microsoft Entra ID, Google Workspace, Keycloak, Authentik or any OpenID Connect provider. Make chosen email domains sign in only through it.',
                keywords: 'sso oidc okta entra azure keycloak',
            },
            {
                name: 'Google sign-in',
                body: 'Sign in with a Google account.',
                keywords: 'google oauth',
            },
            {
                name: 'App lock',
                body: 'Lock after 5 minutes to an hour away, or on demand. The server enforces it, open terminals pause, and unlocking takes your password or a passkey.',
                keywords: 'lock idle timeout',
            },
            {
                name: 'Signed-in devices',
                body: 'See every device on your account and sign any of them out.',
                keywords: 'sessions devices sign out',
            },
            {
                name: 'Security emails',
                body: 'An email when your account signs in from a new device, the password or 2FA changes, a passkey is added or removed, or your servers are exported.',
                keywords: 'email alert notification new device',
            },
        ],
    },
    {
        id: 'teams',
        name: 'Teams and sharing',
        summary: 'Work together without passing passwords around.',
        bar: 'bg-proto-vnc',
        features: [
            {
                name: 'Team vaults',
                body: 'Create a team, invite people by email and build a shared set of servers. Members connect; only each server’s owner can see or change its credentials.',
                details: [
                    'Owner: roles and the team itself',
                    'Admin: invites, removals and the vault',
                    'Member: connects and adds their own servers',
                ],
                keywords: 'team organisation vault role invite',
            },
            {
                name: 'Share a server',
                body: 'Give one person access to one server by email invitation, and take it back at any time.',
                keywords: 'share invite server',
            },
            {
                name: 'Shared terminals',
                body: 'Send a link to watch, or to watch and type, in your live terminal. You let each person in yourself, see who is there, and remove anyone.',
                details: ['Links last an hour', 'Guests see the screen, never the password'],
                keywords: 'pair session share live collaborate',
            },
        ],
    },
    {
        id: 'monitor',
        name: 'Monitoring',
        summary: 'Know when a server needs you before someone tells you.',
        bar: 'bg-proto-telnet',
        features: [
            {
                name: 'Live metrics',
                body: 'CPU, memory and disk for each SSH server, on its page and beside the terminal.',
                keywords: 'cpu memory disk metrics',
            },
            {
                name: 'Alerts',
                body: 'A message when a server goes down or comes back, by email, push notification or webhook.',
                details: ['Webhooks for Slack, Discord or any URL'],
                keywords: 'alert notification webhook slack discord push',
            },
            {
                name: 'Health history',
                body: 'Charts of each server’s availability and load over time.',
                keywords: 'uptime history chart',
            },
            {
                name: 'Benchmarks',
                body: 'Score a server’s CPU, disk and network, and follow the trend across runs.',
                keywords: 'benchmark performance speed',
            },
        ],
    },
    {
        id: 'yours',
        name: 'Make it yours',
        summary: 'An interface that works the way you do, on every device.',
        bar: 'bg-proto-ssh',
        features: [
            {
                name: 'Themes',
                body: 'Night, Black for OLED screens, Day, or follow your device. Six accent colours, comfortable or compact spacing, and reduced motion.',
                keywords: 'theme dark light accent',
            },
            {
                name: 'Menu and layout',
                body: 'The menu as a sidebar, an icon rail or a top bar, on either side. Reorder or hide items, and pick the five in your phone’s bottom bar.',
                keywords: 'menu sidebar layout navigation',
            },
            {
                name: 'Terminal look',
                body: 'Colour schemes, font, size, line spacing and cursor, applied live to open terminals.',
                details: ['Termi Night and Day, Nord, Gruvbox, Solarized'],
                keywords: 'font colour scheme cursor',
            },
            {
                name: 'Synced everywhere',
                body: 'Your choices are saved to your account and follow you to every device.',
                keywords: 'sync settings preferences',
            },
        ],
    },
    {
        id: 'run',
        name: 'Apps and self-hosting',
        summary: 'Use it anywhere, and run it on your own hardware.',
        bar: 'bg-proto-scp',
        features: [
            {
                name: 'Phone',
                body: 'Install Termi from the browser on iOS or Android. A key row adds Ctrl, Alt, Esc, Tab, Fn and arrows.',
                keywords: 'mobile iphone android pwa install',
            },
            {
                name: 'Desktop app',
                body: 'macOS, Windows and Linux, on Intel and ARM. Adds a local terminal and port forwards that run in the background. Windows and Linux update themselves.',
                keywords: 'desktop app electron mac windows linux',
            },
            {
                name: 'Connect from your computer',
                body: 'In the desktop app, terminals, files and port forwards to your own servers can go straight from your computer, reaching what it can reach, with Termi as the fallback. Logins arrive sealed to a key that never leaves the app.',
                keywords: 'desktop local direct device private network lan vpn fallback',
            },
            {
                name: 'One Compose file',
                body: 'Docker Compose starts the web app, the gateway, PostgreSQL, the remote-desktop service and a reverse proxy. Database migrations run on start.',
                keywords: 'docker compose install self-host',
            },
            {
                name: 'Hardened containers',
                body: 'Containers run read-only with every capability dropped, on separate networks: the gateway can never reach the database.',
                keywords: 'container security docker network',
            },
            {
                name: 'Signed images',
                body: 'Release images for amd64 and arm64 come with an SBOM and build provenance, and are signed so you can verify them.',
                keywords: 'sbom provenance sigstore cosign image',
            },
            {
                name: 'Open source',
                body: 'MIT licensed, with no telemetry. Optional Redis shares rate limits across several instances.',
                keywords: 'mit license open source telemetry redis',
            },
        ],
    },
];

export const FEATURE_COUNT = FEATURE_GROUPS.reduce((n, g) => n + g.features.length, 0);
