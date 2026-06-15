'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Terminal,
    FolderOpen,
    Monitor,
    Loader2,
    Eye,
    EyeOff,
    Plus,
    X,
    CheckCircle2,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Lock,
    Key,
    Tag,
    Globe,
    Activity,
    Tv,
    KeyRound,
    BookKey,
    Save,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';

interface Group {
    id: string;
    name: string;
    color: string | null;
}

interface KeychainEntry {
    id: string;
    label: string;
    username: string;
    hasPassword: boolean;
    hasPrivateKey: boolean;
}

const protocols = [
    { value: 'SSH', label: 'SSH', icon: Terminal, desc: 'Secure Shell' },
    { value: 'SCP', label: 'SCP', icon: FolderOpen, desc: 'File Transfer' },
    { value: 'RDP', label: 'RDP', icon: Monitor, desc: 'Remote Desktop' },
    { value: 'VNC', label: 'VNC', icon: Tv, desc: 'Virtual Console' },
    { value: 'TELNET', label: 'Telnet', icon: Terminal, desc: 'Telnet Terminal' },
] as const;

const defaultPorts = { SSH: 22, SCP: 22, RDP: 3389, VNC: 5900, TELNET: 23 };

const protoColors = {
    SSH: {
        pill: 'bg-green-500/15 text-green-400 border-green-500/30',
        ring: 'ring-green-500/40 border-green-500/60',
        badge: 'bg-green-500/15 text-green-400',
    },
    SCP: {
        pill: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
        ring: 'ring-blue-500/40 border-blue-500/60',
        badge: 'bg-blue-500/15 text-blue-400',
    },
    RDP: {
        pill: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
        ring: 'ring-purple-500/40 border-purple-500/60',
        badge: 'bg-purple-500/15 text-purple-400',
    },
    VNC: {
        pill: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
        ring: 'ring-orange-500/40 border-orange-500/60',
        badge: 'bg-orange-500/15 text-orange-400',
    },
    TELNET: {
        pill: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
        ring: 'ring-cyan-500/40 border-cyan-500/60',
        badge: 'bg-cyan-500/15 text-cyan-400',
    },
};

type TestStatus = 'idle' | 'testing' | 'success' | 'failed';

export default function EditServerPage() {
    const router = useRouter();
    const { id } = useParams<{ id: string }>();

    const [groups, setGroups] = useState<Group[]>([]);
    const [pageLoading, setPageLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testResult, setTestResult] = useState<{ latency?: number; error?: string } | null>(null);
    const [tagInput, setTagInput] = useState('');

    // Keychain state
    const [keychainEntries, setKeychainEntries] = useState<KeychainEntry[]>([]);
    const [credSource, setCredSource] = useState<'new' | 'keychain'>('new');
    const [selectedKeychainId, setSelectedKeychainId] = useState('');
    const [saveToKeychain, setSaveToKeychain] = useState(false);
    const [keychainLabel, setKeychainLabel] = useState('');

    const [storedCreds, setStoredCreds] = useState({
        hasPassword: false,
        hasPrivateKey: false,
        hasPassphrase: false,
    });

    const [form, setForm] = useState({
        name: '',
        description: '',
        groupId: '',
        protocol: 'SSH' as keyof typeof defaultPorts,
        host: '',
        port: 22,
        username: '',
        authMethod: 'password' as 'password' | 'key',
        password: '',
        privateKey: '',
        passphrase: '',
        notes: '',
        tags: [] as string[],
        displayWidth: 1920,
        displayHeight: 1080,
        rdpSecurity: 'any' as 'any' | 'rdp' | 'nla' | 'tls',
    });

    useEffect(() => {
        Promise.all([
            fetch(`/api/servers/${id}`).then((r) => r.json()),
            fetch('/api/groups').then((r) => r.json()),
            fetch('/api/keychain').then((r) => r.json()),
        ])
            .then(([serverData, groupData, keychainData]) => {
                if (!serverData.success) {
                    router.push('/panel');
                    return;
                }
                const s = serverData.data.server;
                setStoredCreds({
                    hasPassword: s.hasPassword ?? false,
                    hasPrivateKey: s.hasPrivateKey ?? false,
                    hasPassphrase: s.hasPassphrase ?? false,
                });
                setForm({
                    name: s.name ?? '',
                    description: s.description ?? '',
                    groupId: s.group?.id ?? '',
                    protocol: s.protocol as keyof typeof defaultPorts,
                    host: s.host ?? '',
                    port: s.port ?? 22,
                    username: s.username ?? '',
                    authMethod: s.hasPrivateKey ? 'key' : 'password',
                    password: '',
                    privateKey: '',
                    passphrase: '',
                    notes: s.notes ?? '',
                    tags: s.tags ?? [],
                    displayWidth: s.displayWidth ?? 1920,
                    displayHeight: s.displayHeight ?? 1080,
                    rdpSecurity: (s.rdpSecurity ?? 'any') as 'any' | 'rdp' | 'nla' | 'tls',
                });
                if (groupData.success) setGroups(groupData.data.groups);
                if (keychainData.success) setKeychainEntries(keychainData.data.entries);
            })
            .catch(() => router.push('/panel'))
            .finally(() => setPageLoading(false));
    }, [id, router]);

    const update = (fields: Partial<typeof form>) => setForm((f) => ({ ...f, ...fields }));

    const applyKeychain = async (keychainId: string) => {
        if (!keychainId) return;
        try {
            const res = await fetch(`/api/keychain/${keychainId}`);
            const data = await res.json();
            if (data.success) {
                const entry = data.data.entry;
                update({
                    username: entry.username,
                    password: entry.password ?? '',
                    privateKey: entry.privateKey ?? '',
                    passphrase: entry.passphrase ?? '',
                    authMethod: entry.privateKey ? 'key' : 'password',
                });
            }
        } catch {
            // silently ignore
        }
    };

    const handleProtocolChange = (p: keyof typeof defaultPorts) => {
        update({ protocol: p, port: defaultPorts[p] });
        setTestStatus('idle');
        setTestResult(null);
    };

    const addTag = () => {
        const tag = tagInput.trim();
        if (tag && !form.tags.includes(tag)) {
            update({ tags: [...form.tags, tag] });
            setTagInput('');
        }
    };

    const isSSHProto = form.protocol === 'SSH' || form.protocol === 'SCP';

    const testHasAuth =
        form.authMethod === 'password' ? !!form.password.trim() : !!form.privateKey.trim();

    const canTest = !!(
        form.host.trim() &&
        form.port > 0 &&
        form.username.trim() &&
        (!isSSHProto || testHasAuth)
    );

    const handleTest = async () => {
        if (!canTest) return;
        setTestStatus('testing');
        setTestResult(null);
        try {
            const res = await fetch('/api/servers/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    host: form.host,
                    port: form.port,
                    protocol: form.protocol,
                    username: form.username,
                    password: form.authMethod === 'password' ? form.password : undefined,
                    privateKey: form.authMethod === 'key' ? form.privateKey : undefined,
                    passphrase: form.authMethod === 'key' ? form.passphrase : undefined,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setTestStatus('success');
                setTestResult({ latency: data.latency });
            } else {
                setTestStatus('failed');
                setTestResult({ error: data.error });
            }
        } catch {
            setTestStatus('failed');
            setTestResult({ error: 'Network error' });
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            // Optionally save credentials to keychain before updating server
            if (credSource === 'new' && saveToKeychain && keychainLabel.trim()) {
                try {
                    await fetch('/api/keychain', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            label: keychainLabel.trim(),
                            username: form.username,
                            password:
                                form.authMethod === 'password' && form.password.trim()
                                    ? form.password
                                    : undefined,
                            privateKey:
                                form.authMethod === 'key' && form.privateKey.trim()
                                    ? form.privateKey
                                    : undefined,
                            passphrase:
                                form.authMethod === 'key' && form.passphrase.trim()
                                    ? form.passphrase
                                    : undefined,
                        }),
                    });
                } catch {
                    // keychain save failure is non-fatal
                }
            }

            const payload: Record<string, unknown> = {
                name: form.name,
                description: form.description || undefined,
                groupId: form.groupId || undefined,
                protocol: form.protocol,
                host: form.host,
                port: form.port,
                username: form.username,
                notes: form.notes || undefined,
                tags: form.tags.length > 0 ? form.tags : [],
                ...(form.protocol === 'RDP' || form.protocol === 'VNC'
                    ? {
                          displayWidth: form.displayWidth,
                          displayHeight: form.displayHeight,
                      }
                    : {}),
                ...(form.protocol === 'RDP' ? { rdpSecurity: form.rdpSecurity } : {}),
            };
            if (form.authMethod === 'password' && form.password.trim()) {
                payload.password = form.password;
            }
            if (form.authMethod === 'key') {
                if (form.privateKey.trim()) payload.privateKey = form.privateKey;
                if (form.passphrase.trim()) payload.passphrase = form.passphrase;
            }

            const res = await fetch(`/api/servers/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to update server');
                setSaving(false);
                return;
            }
            router.push('/panel');
        } catch {
            setError('An error occurred. Please try again.');
            setSaving(false);
        }
    };

    if (pageLoading) {
        return (
            <div className="flex items-center justify-center h-48">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const proto = protocols.find((p) => p.value === form.protocol)!;
    const ProtoIcon = proto.icon;
    const colors = protoColors[form.protocol];
    const selectedGroup = groups.find((g) => g.id === form.groupId);

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
                <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                    <Link href="/panel">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-xl font-semibold">Edit Server</h1>
                    <p className="text-muted-foreground text-sm">{form.name}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} method="POST" action="#">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                    {/*   LEFT: Form   */}
                    <div className="lg:col-span-3 space-y-3">
                        {/* Protocol */}
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                    Protocol
                                </p>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                                    {protocols.map((p) => {
                                        const isActive = form.protocol === p.value;
                                        const c = protoColors[p.value];
                                        const Icon = p.icon;
                                        return (
                                            <button
                                                key={p.value}
                                                type="button"
                                                onClick={() => handleProtocolChange(p.value)}
                                                className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border transition-all duration-150 ${
                                                    isActive
                                                        ? `${c.pill} ${c.ring} ring-1`
                                                        : 'border-border text-muted-foreground hover:border-border/80 hover:text-foreground hover:bg-accent/30'
                                                }`}
                                            >
                                                <Icon className="w-4 h-4" />
                                                <span className="text-xs font-semibold">
                                                    {p.label}
                                                </span>
                                                <span className="text-[10px] opacity-60 hidden sm:block leading-none">
                                                    {p.desc}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Identity + Connection */}
                        <Card className="divide-y divide-border">
                            <div className="p-4 grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Name <span className="text-red-400">*</span>
                                    </Label>
                                    <Input
                                        type="text"
                                        value={form.name}
                                        onChange={(e) => update({ name: e.target.value })}
                                        className="bg-secondary border-border text-sm h-9"
                                        placeholder="Production Web"
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Group{' '}
                                        <span className="text-muted-foreground/50">(optional)</span>
                                    </Label>
                                    <Select
                                        value={form.groupId || 'none'}
                                        onValueChange={(v) =>
                                            update({ groupId: v === 'none' ? '' : v })
                                        }
                                    >
                                        <SelectTrigger className="bg-secondary border-border text-sm h-9">
                                            <SelectValue placeholder="No group" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="none">No group</SelectItem>
                                            {groups.map((g) => (
                                                <SelectItem key={g.id} value={g.id}>
                                                    {g.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="p-4 space-y-3">
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="col-span-2 space-y-1.5">
                                        <Label className="text-xs">
                                            Host / IP <span className="text-red-400">*</span>
                                        </Label>
                                        <Input
                                            type="text"
                                            value={form.host}
                                            onChange={(e) => {
                                                update({ host: e.target.value });
                                                setTestStatus('idle');
                                                setTestResult(null);
                                            }}
                                            className="bg-secondary border-border text-sm h-9 font-mono"
                                            placeholder="192.168.1.100"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Port</Label>
                                        <Input
                                            type="number"
                                            value={form.port}
                                            onChange={(e) => {
                                                update({ port: parseInt(e.target.value) || 0 });
                                                setTestStatus('idle');
                                                setTestResult(null);
                                            }}
                                            className="bg-secondary border-border text-sm h-9 font-mono"
                                            min={1}
                                            max={65535}
                                            required
                                        />
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">
                                        Username <span className="text-red-400">*</span>
                                    </Label>
                                    <Input
                                        type="text"
                                        value={form.username}
                                        onChange={(e) => update({ username: e.target.value })}
                                        className="bg-secondary border-border text-sm h-9"
                                        placeholder="root"
                                        required
                                    />
                                </div>
                            </div>
                        </Card>

                        {/* Authentication */}
                        <Card>
                            <CardContent className="p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Authentication
                                    </p>
                                    {/* Credential source toggle */}
                                    <div className="flex gap-1 p-1 bg-background/60 rounded-lg border border-border/50">
                                        {(['new', 'keychain'] as const).map((src) => (
                                            <button
                                                key={src}
                                                type="button"
                                                onClick={() => {
                                                    setCredSource(src);
                                                    if (src === 'new') setSelectedKeychainId('');
                                                }}
                                                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                                    credSource === src
                                                        ? 'bg-primary text-primary-foreground shadow-sm'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                {src === 'keychain' ? (
                                                    <BookKey className="w-3 h-3" />
                                                ) : (
                                                    <KeyRound className="w-3 h-3" />
                                                )}
                                                {src === 'keychain' ? 'Keychain' : 'New'}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* ── Keychain picker ── */}
                                {credSource === 'keychain' && (
                                    <div className="space-y-2">
                                        {keychainEntries.length === 0 ? (
                                            <p className="text-xs text-muted-foreground py-2 text-center">
                                                No keychain entries yet.{' '}
                                                <Link
                                                    href="/panel/keychain"
                                                    className="underline text-primary"
                                                >
                                                    Create one
                                                </Link>{' '}
                                                first.
                                            </p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Select keychain entry</Label>
                                                <Select
                                                    value={selectedKeychainId || 'none'}
                                                    onValueChange={(v) => {
                                                        const id = v === 'none' ? '' : v;
                                                        setSelectedKeychainId(id);
                                                        if (id) applyKeychain(id);
                                                    }}
                                                >
                                                    <SelectTrigger className="bg-secondary border-border text-sm h-9">
                                                        <SelectValue placeholder="Choose a keychain entry…" />
                                                    </SelectTrigger>
                                                    <SelectContent className="bg-card border-border">
                                                        <SelectItem value="none">
                                                            — Choose an entry —
                                                        </SelectItem>
                                                        {keychainEntries.map((kc) => (
                                                            <SelectItem key={kc.id} value={kc.id}>
                                                                <span className="font-medium">
                                                                    {kc.label}
                                                                </span>
                                                                <span className="ml-2 text-muted-foreground text-xs">
                                                                    {kc.username}
                                                                </span>
                                                                <span className="ml-1.5 text-[10px] text-muted-foreground/60">
                                                                    {kc.hasPrivateKey
                                                                        ? '(SSH key)'
                                                                        : '(password)'}
                                                                </span>
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                {selectedKeychainId && (
                                                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                                                        <CheckCircle2 className="w-3 h-3 text-green-400" />
                                                        Credentials loaded from keychain
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* ── Manual entry ── */}
                                {credSource === 'new' && (
                                    <>
                                        {(form.protocol === 'SSH' || form.protocol === 'SCP') && (
                                            <div className="flex gap-1 p-1 bg-background/60 rounded-lg w-fit border border-border/50">
                                                {(['password', 'key'] as const).map((method) => (
                                                    <button
                                                        key={method}
                                                        type="button"
                                                        onClick={() => update({ authMethod: method })}
                                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                                            form.authMethod === method
                                                                ? 'bg-primary text-primary-foreground shadow-sm'
                                                                : 'text-muted-foreground hover:text-foreground'
                                                        }`}
                                                    >
                                                        {method === 'password' ? (
                                                            <Lock className="w-3 h-3" />
                                                        ) : (
                                                            <Key className="w-3 h-3" />
                                                        )}
                                                        {method === 'password' ? 'Password' : 'SSH Key'}
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {form.authMethod === 'password' && storedCreds.hasPassword && (
                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 border border-border/50">
                                                <Lock className="w-3 h-3 text-green-500/70" />
                                                Password saved — leave blank to keep it, or enter a new one
                                                to replace it
                                            </div>
                                        )}
                                        {form.authMethod === 'key' && storedCreds.hasPrivateKey && (
                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground bg-muted/60 rounded-lg px-3 py-2 border border-border/50">
                                                <Key className="w-3 h-3 text-green-500/70" />
                                                Private key saved — leave blank to keep it, or paste a new
                                                key to replace it
                                            </div>
                                        )}

                                        {form.authMethod === 'password' && (
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">
                                                    New Password{' '}
                                                    <span className="text-muted-foreground/50">
                                                        (leave blank to keep existing)
                                                    </span>
                                                </Label>
                                                <div className="relative">
                                                    <Input
                                                        type={showPassword ? 'text' : 'password'}
                                                        value={form.password}
                                                        onChange={(e) =>
                                                            update({ password: e.target.value })
                                                        }
                                                        className="bg-secondary border-border text-sm h-9 pr-10"
                                                        placeholder="••••••••"
                                                        autoComplete="new-password"
                                                    />
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setShowPassword(!showPassword)}
                                                        className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                                    >
                                                        {showPassword ? (
                                                            <EyeOff className="w-4 h-4" />
                                                        ) : (
                                                            <Eye className="w-4 h-4" />
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        )}

                                        {form.authMethod === 'key' && (
                                            <div className="space-y-3">
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs">
                                                        New Private Key{' '}
                                                        <span className="text-muted-foreground/50">
                                                            (leave blank to keep existing)
                                                        </span>
                                                    </Label>
                                                    <Textarea
                                                        value={form.privateKey}
                                                        onChange={(e) =>
                                                            update({ privateKey: e.target.value })
                                                        }
                                                        className="bg-secondary border-border text-xs font-mono min-h-[110px] resize-none leading-relaxed"
                                                        placeholder={
                                                            '-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----'
                                                        }
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-xs">
                                                        Passphrase{' '}
                                                        <span className="text-muted-foreground/50">
                                                            {storedCreds.hasPassphrase
                                                                ? '(leave blank to keep existing)'
                                                                : '(if encrypted)'}
                                                        </span>
                                                    </Label>
                                                    <div className="relative">
                                                        <Input
                                                            type={showPassphrase ? 'text' : 'password'}
                                                            value={form.passphrase}
                                                            onChange={(e) =>
                                                                update({ passphrase: e.target.value })
                                                            }
                                                            className="bg-secondary border-border text-sm h-9 pr-10"
                                                            placeholder="••••••••"
                                                            autoComplete="new-password"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() =>
                                                                setShowPassphrase(!showPassphrase)
                                                            }
                                                            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                                        >
                                                            {showPassphrase ? (
                                                                <EyeOff className="w-4 h-4" />
                                                            ) : (
                                                                <Eye className="w-4 h-4" />
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* Save to Keychain */}
                                        <div className="pt-2 border-t border-border/60 space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Checkbox
                                                    id="edit-save-keychain"
                                                    checked={saveToKeychain}
                                                    onCheckedChange={(v) =>
                                                        setSaveToKeychain(v === true)
                                                    }
                                                    className="h-4 w-4"
                                                />
                                                <label
                                                    htmlFor="edit-save-keychain"
                                                    className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1.5"
                                                >
                                                    <Save className="w-3 h-3" />
                                                    Save these credentials to Keychain
                                                </label>
                                            </div>
                                            {saveToKeychain && (
                                                <Input
                                                    type="text"
                                                    value={keychainLabel}
                                                    onChange={(e) =>
                                                        setKeychainLabel(e.target.value)
                                                    }
                                                    className="bg-secondary border-border text-sm h-9"
                                                    placeholder="Label (e.g. root@production)"
                                                />
                                            )}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>

                        {/* RDP / VNC display settings */}
                        {(form.protocol === 'RDP' || form.protocol === 'VNC') && (
                            <Card>
                                <CardContent className="p-4 space-y-3">
                                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                        Display Settings
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Width (px)</Label>
                                            <Input
                                                type="number"
                                                value={form.displayWidth}
                                                onChange={(e) =>
                                                    update({
                                                        displayWidth:
                                                            parseInt(e.target.value) || 1920,
                                                    })
                                                }
                                                className="bg-secondary border-border text-sm h-9 font-mono"
                                                min={640}
                                                max={7680}
                                            />
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Height (px)</Label>
                                            <Input
                                                type="number"
                                                value={form.displayHeight}
                                                onChange={(e) =>
                                                    update({
                                                        displayHeight:
                                                            parseInt(e.target.value) || 1080,
                                                    })
                                                }
                                                className="bg-secondary border-border text-sm h-9 font-mono"
                                                min={480}
                                                max={4320}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap">
                                        {(
                                            [
                                                [1280, 720, 'HD'],
                                                [1920, 1080, 'FHD'],
                                                [2560, 1440, '2K'],
                                                [3840, 2160, '4K'],
                                            ] as [number, number, string][]
                                        ).map(([w, h, label]) => (
                                            <button
                                                key={label}
                                                type="button"
                                                onClick={() =>
                                                    update({ displayWidth: w, displayHeight: h })
                                                }
                                                className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                                                    form.displayWidth === w &&
                                                    form.displayHeight === h
                                                        ? 'bg-primary/15 text-primary border-primary/30'
                                                        : 'border-border text-muted-foreground hover:text-foreground hover:bg-accent/30'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {form.protocol === 'RDP' && (
                                        <div className="space-y-1.5">
                                            <Label className="text-xs">Security Mode</Label>
                                            <Select
                                                value={form.rdpSecurity}
                                                onValueChange={(v) =>
                                                    update({
                                                        rdpSecurity: v as
                                                            | 'any'
                                                            | 'rdp'
                                                            | 'nla'
                                                            | 'tls',
                                                    })
                                                }
                                            >
                                                <SelectTrigger className="bg-secondary border-border text-sm h-9">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent className="bg-card border-border">
                                                    <SelectItem value="any">
                                                        Any (auto-negotiate)
                                                    </SelectItem>
                                                    <SelectItem value="rdp">
                                                        RDP (classic, most compatible)
                                                    </SelectItem>
                                                    <SelectItem value="nla">
                                                        NLA (Network Level Auth)
                                                    </SelectItem>
                                                    <SelectItem value="tls">TLS only</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        )}

                        {/* Advanced */}
                        <Card className="overflow-visible">
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="w-full flex items-center justify-between p-4 hover:bg-accent/30 transition-colors rounded-xl"
                            >
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Advanced
                                </span>
                                {showAdvanced ? (
                                    <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                ) : (
                                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                            </button>
                            {showAdvanced && (
                                <div className="px-4 pb-4 border-t border-border space-y-3 pt-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Description</Label>
                                        <Input
                                            type="text"
                                            value={form.description}
                                            onChange={(e) =>
                                                update({ description: e.target.value })
                                            }
                                            className="bg-secondary border-border text-sm h-9"
                                            placeholder="Production web server"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Tags</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                type="text"
                                                value={tagInput}
                                                onChange={(e) => setTagInput(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        e.preventDefault();
                                                        addTag();
                                                    }
                                                }}
                                                className="bg-secondary border-border text-sm h-9 flex-1"
                                                placeholder="production, linux, aws…"
                                            />
                                            <Button
                                                type="button"
                                                variant="secondary"
                                                size="sm"
                                                onClick={addTag}
                                                className="px-3"
                                            >
                                                <Plus className="w-3.5 h-3.5" />
                                            </Button>
                                        </div>
                                        {form.tags.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {form.tags.map((tag) => (
                                                    <span
                                                        key={tag}
                                                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs"
                                                    >
                                                        {tag}
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                update({
                                                                    tags: form.tags.filter(
                                                                        (t) => t !== tag,
                                                                    ),
                                                                })
                                                            }
                                                            className="text-muted-foreground hover:text-destructive transition-colors"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Notes</Label>
                                        <Textarea
                                            value={form.notes}
                                            onChange={(e) => update({ notes: e.target.value })}
                                            className="bg-secondary border-border text-sm min-h-[72px] resize-none"
                                            placeholder="Additional notes…"
                                        />
                                    </div>
                                </div>
                            )}
                        </Card>
                    </div>

                    {/*   RIGHT: Preview + Test + Actions   */}
                    <div className="lg:col-span-2 space-y-3 lg:sticky lg:top-4 self-start">
                        {/* Preview */}
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                    Preview
                                </p>
                                <div className="bg-background/60 rounded-lg p-3.5 border border-border/60">
                                    <div className="flex items-start gap-3">
                                        <div
                                            className={`p-2 rounded-lg border shrink-0 ${colors.pill}`}
                                        >
                                            <ProtoIcon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-sm truncate">
                                                {form.name || (
                                                    <span className="text-muted-foreground italic">
                                                        Untitled
                                                    </span>
                                                )}
                                            </p>
                                            {form.description && (
                                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                                                    {form.description}
                                                </p>
                                            )}
                                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                <span
                                                    className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.badge}`}
                                                >
                                                    {form.protocol}
                                                </span>
                                                {selectedGroup && (
                                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-secondary text-secondary-foreground">
                                                        {selectedGroup.name}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {(form.host || form.username) && (
                                        <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                                            {form.host && (
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    <Globe className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                                    <span className="font-mono truncate text-foreground/80">
                                                        {form.host}:{form.port}
                                                    </span>
                                                </div>
                                            )}
                                            {form.username && (
                                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                    {form.authMethod === 'key' ? (
                                                        <Key className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                                    ) : (
                                                        <Lock className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                                    )}
                                                    <span className="font-mono truncate text-foreground/80">
                                                        {form.username}
                                                    </span>
                                                    <span className="text-muted-foreground/40 text-[10px]">
                                                        (
                                                        {form.authMethod === 'key'
                                                            ? 'key'
                                                            : 'password'}
                                                        )
                                                    </span>
                                                </div>
                                            )}
                                            {form.tags.length > 0 && (
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Tag className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                                    {form.tags.map((t) => (
                                                        <span
                                                            key={t}
                                                            className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground"
                                                        >
                                                            {t}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Test */}
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                    {isSSHProto ? 'Authentication Test' : 'Connectivity'}
                                </p>
                                <button
                                    type="button"
                                    onClick={handleTest}
                                    disabled={!canTest || testStatus === 'testing'}
                                    className={`w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg border text-sm font-medium transition-all duration-200 ${
                                        !canTest
                                            ? 'border-border text-muted-foreground/40 cursor-not-allowed bg-transparent'
                                            : testStatus === 'success'
                                              ? 'border-green-500/40 bg-green-500/10 text-green-400 hover:bg-green-500/15'
                                              : testStatus === 'failed'
                                                ? 'border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/15'
                                                : 'border-primary/30 bg-primary/8 text-primary hover:bg-primary/15'
                                    }`}
                                >
                                    {testStatus === 'testing' ? (
                                        <>
                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />{' '}
                                            Testing…
                                        </>
                                    ) : testStatus === 'success' ? (
                                        <>
                                            <CheckCircle2 className="w-3.5 h-3.5" /> Test Again
                                        </>
                                    ) : testStatus === 'failed' ? (
                                        <>
                                            <AlertCircle className="w-3.5 h-3.5" /> Retry
                                        </>
                                    ) : (
                                        <>
                                            <Activity className="w-3.5 h-3.5" />{' '}
                                            {isSSHProto ? 'Test Authentication' : 'Test Connection'}
                                        </>
                                    )}
                                </button>
                                {!canTest && (
                                    <p className="text-[11px] text-muted-foreground/40 mt-2 text-center">
                                        {isSSHProto
                                            ? 'Enter new credentials to test'
                                            : 'Enter host & port first'}
                                    </p>
                                )}
                                {testStatus === 'success' && testResult?.latency !== undefined && (
                                    <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-lg bg-green-500/8 border border-green-500/20">
                                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                        <div>
                                            <p className="text-xs font-medium text-green-400">
                                                {isSSHProto
                                                    ? 'Authentication successful'
                                                    : 'Port reachable'}
                                            </p>
                                            <p className="text-[11px] text-green-500/60">
                                                Latency: {testResult.latency}ms
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {testStatus === 'failed' && testResult?.error && (
                                    <div className="mt-3 flex items-start gap-2.5 p-2.5 rounded-lg bg-destructive/8 border border-destructive/20">
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-medium text-destructive">
                                                {isSSHProto
                                                    ? 'Authentication failed'
                                                    : 'Unreachable'}
                                            </p>
                                            <p className="text-[11px] text-destructive/60 break-words">
                                                {testResult.error}
                                            </p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <Button type="submit" disabled={saving} className="w-full">
                                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                                {saving ? 'Saving…' : 'Save Changes'}
                            </Button>
                            <Button variant="secondary" asChild className="w-full">
                                <Link href="/panel">Cancel</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
