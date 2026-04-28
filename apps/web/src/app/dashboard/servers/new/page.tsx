'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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
    Upload,
    FileKey,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

interface Group {
    id: string;
    name: string;
    color: string | null;
}

const protocols = [
    { value: 'SSH', label: 'SSH', icon: Terminal, desc: 'Secure Shell' },
    { value: 'SCP', label: 'SCP', icon: FolderOpen, desc: 'File Transfer' },
    { value: 'RDP', label: 'RDP', icon: Monitor, desc: 'Remote Desktop' },
    { value: 'VNC', label: 'VNC', icon: Tv, desc: 'Virtual Console' },
] as const;

const defaultPorts = { SSH: 22, SCP: 22, RDP: 3389, VNC: 5900 };

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
};

type TestStatus = 'idle' | 'testing' | 'success' | 'failed';

export default function NewServerPage() {
    const router = useRouter();
    const [groups, setGroups] = useState<Group[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showPassphrase, setShowPassphrase] = useState(false);
    const [keyInputMethod, setKeyInputMethod] = useState<'paste' | 'file'>('paste');
    const [keyFileName, setKeyFileName] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [testStatus, setTestStatus] = useState<TestStatus>('idle');
    const [testResult, setTestResult] = useState<{ latency?: number; error?: string } | null>(null);
    const [tagInput, setTagInput] = useState('');

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
    });

    useEffect(() => {
        fetch('/api/groups')
            .then((r) => r.json())
            .then((d) => { if (d.success) setGroups(d.data.groups); })
            .catch(() => {});
    }, []);

    const update = (fields: Partial<typeof form>) => setForm((f) => ({ ...f, ...fields }));

    const handleProtocolChange = (protocol: keyof typeof defaultPorts) => {
        update({ protocol, port: defaultPorts[protocol] });
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
    const hasAuth = form.authMethod === 'password' ? !!form.password.trim() : !!form.privateKey.trim();
    const canTest = !!(
        form.host.trim() && form.port > 0 && form.username.trim() &&
        (!isSSHProto || hasAuth)
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
                    host:       form.host,
                    port:       form.port,
                    protocol:   form.protocol,
                    username:   form.username,
                    password:   form.authMethod === 'password' ? form.password : undefined,
                    privateKey: form.authMethod === 'key'      ? form.privateKey  : undefined,
                    passphrase: form.authMethod === 'key'      ? form.passphrase  : undefined,
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
        setLoading(true);
        try {
            const res = await fetch('/api/servers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name,
                    description: form.description || undefined,
                    groupId: form.groupId || undefined,
                    protocol: form.protocol,
                    host: form.host,
                    port: form.port,
                    username: form.username,
                    password: form.authMethod === 'password' ? form.password : undefined,
                    privateKey: form.authMethod === 'key' ? form.privateKey : undefined,
                    passphrase: form.authMethod === 'key' ? form.passphrase : undefined,
                    notes: form.notes || undefined,
                    tags: form.tags.length > 0 ? form.tags : undefined,
                }),
            });
            const data = await res.json();
            if (!data.success) {
                setError(data.error || 'Failed to create server');
                setLoading(false);
                return;
            }
            router.push('/dashboard');
        } catch {
            setError('An error occurred. Please try again.');
            setLoading(false);
        }
    };

    const proto = protocols.find((p) => p.value === form.protocol)!;
    const ProtoIcon = proto.icon;
    const colors = protoColors[form.protocol];
    const selectedGroup = groups.find((g) => g.id === form.groupId);

    return (
        <div className="max-w-5xl mx-auto">
            <div className="flex items-center gap-3 mb-5">
                <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                    <Link href="/dashboard">
                        <ArrowLeft className="w-4 h-4" />
                    </Link>
                </Button>
                <div>
                    <h1 className="text-xl font-semibold">Add Server</h1>
                    <p className="text-muted-foreground text-sm">Configure a new connection</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} method="POST" action="#">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

                    {/* ── LEFT: Form ── */}
                    <div className="lg:col-span-3 space-y-3">

                        {/* Protocol selector */}
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Protocol</p>
                                <div className="grid grid-cols-4 gap-2">
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
                                                <span className="text-xs font-semibold">{p.label}</span>
                                                <span className="text-[10px] opacity-60 hidden sm:block leading-none">{p.desc}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Identity + Connection — combined card */}
                        <Card className="divide-y divide-border">
                            {/* Name + Group */}
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
                                        Group <span className="text-muted-foreground/50">(optional)</span>
                                    </Label>
                                    <Select
                                        value={form.groupId || 'none'}
                                        onValueChange={(v) => update({ groupId: v === 'none' ? '' : v })}
                                    >
                                        <SelectTrigger className="bg-secondary border-border text-sm h-9">
                                            <SelectValue placeholder="No group" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="none">No group</SelectItem>
                                            {groups.map((g) => (
                                                <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Host + Port + Username */}
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
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Authentication</p>

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
                                                {method === 'password'
                                                    ? <Lock className="w-3 h-3" />
                                                    : <Key className="w-3 h-3" />
                                                }
                                                {method === 'password' ? 'Password' : 'SSH Key'}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {form.authMethod === 'password' && (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Password</Label>
                                        <div className="relative">
                                            <Input
                                                type={showPassword ? 'text' : 'password'}
                                                value={form.password}
                                                onChange={(e) => update({ password: e.target.value })}
                                                className="bg-secondary border-border text-sm h-9 pr-10"
                                                placeholder="••••••••"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                            >
                                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {form.authMethod === 'key' && (
                                    <div className="space-y-3">
                                        <div className="flex gap-1 p-1 bg-background/60 rounded-lg w-fit border border-border/50">
                                            {(['paste', 'file'] as const).map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() => {
                                                        setKeyInputMethod(m);
                                                        if (m === 'paste') { setKeyFileName(null); update({ privateKey: '' }); }
                                                    }}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                                                        keyInputMethod === m
                                                            ? 'bg-secondary text-foreground shadow-sm'
                                                            : 'text-muted-foreground hover:text-foreground'
                                                    }`}
                                                >
                                                    {m === 'paste'
                                                        ? <Key className="w-3 h-3" />
                                                        : <Upload className="w-3 h-3" />
                                                    }
                                                    {m === 'paste' ? 'Paste Key' : 'Upload File'}
                                                </button>
                                            ))}
                                        </div>

                                        {keyInputMethod === 'paste' ? (
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Private Key</Label>
                                                <Textarea
                                                    value={form.privateKey}
                                                    onChange={(e) => update({ privateKey: e.target.value })}
                                                    className="bg-secondary border-border text-xs font-mono min-h-[110px] resize-none leading-relaxed"
                                                    placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                                                />
                                            </div>
                                        ) : (
                                            <div className="space-y-1.5">
                                                <Label className="text-xs">Key File (.pem, .ppk)</Label>
                                                <label className={`flex flex-col items-center justify-center gap-2 w-full rounded-lg border-2 border-dashed cursor-pointer transition-colors py-6 px-4 ${
                                                    keyFileName
                                                        ? 'border-green-500/40 bg-green-500/5 hover:bg-green-500/8'
                                                        : 'border-border bg-secondary/40 hover:border-border/80 hover:bg-accent/20'
                                                }`}>
                                                    <input
                                                        type="file"
                                                        accept=".pem,.ppk,application/x-pem-file"
                                                        className="sr-only"
                                                        onChange={(e) => {
                                                            const file = e.target.files?.[0];
                                                            if (!file) return;
                                                            setKeyFileName(file.name);
                                                            const reader = new FileReader();
                                                            reader.onload = (ev) => {
                                                                update({ privateKey: (ev.target?.result as string) ?? '' });
                                                            };
                                                            reader.readAsText(file);
                                                        }}
                                                    />
                                                    {keyFileName ? (
                                                        <>
                                                            <FileKey className="w-5 h-5 text-green-400" />
                                                            <span className="text-xs font-medium text-green-400 text-center break-all">{keyFileName}</span>
                                                            <span className="text-[10px] text-muted-foreground">Click to replace</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Upload className="w-5 h-5 text-muted-foreground" />
                                                            <span className="text-xs text-muted-foreground text-center">
                                                                Click to select a <span className="font-mono">.pem</span> or <span className="font-mono">.ppk</span> file
                                                            </span>
                                                        </>
                                                    )}
                                                </label>
                                            </div>
                                        )}

                                        <div className="space-y-1.5">
                                            <Label className="text-xs">
                                                Passphrase <span className="text-muted-foreground/50">(if encrypted)</span>
                                            </Label>
                                            <div className="relative">
                                                <Input
                                                    type={showPassphrase ? 'text' : 'password'}
                                                    value={form.passphrase}
                                                    onChange={(e) => update({ passphrase: e.target.value })}
                                                    className="bg-secondary border-border text-sm h-9 pr-10"
                                                    placeholder="••••••••"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => setShowPassphrase(!showPassphrase)}
                                                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 text-muted-foreground hover:text-foreground"
                                                >
                                                    {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Advanced — collapsible */}
                        <Card className="overflow-visible">
                            <button
                                type="button"
                                onClick={() => setShowAdvanced(!showAdvanced)}
                                className="w-full flex items-center justify-between p-4 hover:bg-accent/30 transition-colors rounded-xl"
                            >
                                <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                    Advanced
                                </span>
                                {showAdvanced
                                    ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                                    : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                }
                            </button>

                            {showAdvanced && (
                                <div className="px-4 pb-4 border-t border-border space-y-3 pt-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs">Description</Label>
                                        <Input
                                            type="text"
                                            value={form.description}
                                            onChange={(e) => update({ description: e.target.value })}
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
                                                    if (e.key === 'Enter') { e.preventDefault(); addTag(); }
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
                                                            onClick={() => update({ tags: form.tags.filter((t) => t !== tag) })}
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

                    {/* ── RIGHT: Preview + Test + Actions ── */}
                    <div className="lg:col-span-2 space-y-3 lg:sticky lg:top-4 self-start">

                        {/* Live preview card */}
                        <Card>
                            <CardContent className="p-4">
                                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preview</p>
                                <div className="bg-background/60 rounded-lg p-3.5 border border-border/60">
                                    <div className="flex items-start gap-3">
                                        <div className={`p-2 rounded-lg border shrink-0 ${colors.pill}`}>
                                            <ProtoIcon className="w-4 h-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-sm truncate">
                                                {form.name || (
                                                    <span className="text-muted-foreground font-normal italic">Untitled Server</span>
                                                )}
                                            </p>
                                            {form.description && (
                                                <p className="text-[11px] text-muted-foreground truncate mt-0.5">{form.description}</p>
                                            )}
                                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors.badge}`}>
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
                                                    {form.authMethod === 'key'
                                                        ? <Key className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                                        : <Lock className="w-3 h-3 shrink-0 text-muted-foreground/60" />
                                                    }
                                                    <span className="font-mono truncate text-foreground/80">{form.username}</span>
                                                    <span className="text-muted-foreground/40 text-[10px]">
                                                        ({form.authMethod === 'key' ? 'key' : 'password'})
                                                    </span>
                                                </div>
                                            )}
                                            {form.tags.length > 0 && (
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <Tag className="w-3 h-3 text-muted-foreground/40 shrink-0" />
                                                    {form.tags.map((t) => (
                                                        <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-secondary/80 text-muted-foreground">
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

                        {/* Test connection */}
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
                                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Testing…</>
                                    ) : testStatus === 'success' ? (
                                        <><CheckCircle2 className="w-3.5 h-3.5" /> Test Again</>
                                    ) : testStatus === 'failed' ? (
                                        <><AlertCircle className="w-3.5 h-3.5" /> Retry</>
                                    ) : (
                                        <><Activity className="w-3.5 h-3.5" />
                                            {isSSHProto ? 'Test Authentication' : 'Test Connection'}</>
                                    )}
                                </button>

                                {!canTest && (
                                    <p className="text-[11px] text-muted-foreground/40 mt-2 text-center">
                                        {isSSHProto
                                            ? 'Enter host, username & credentials first'
                                            : 'Enter host & port first'}
                                    </p>
                                )}

                                {testStatus === 'success' && testResult?.latency !== undefined && (
                                    <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-lg bg-green-500/8 border border-green-500/20">
                                        <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                                        <div>
                                            <p className="text-xs font-medium text-green-400">
                                                {isSSHProto ? 'Authentication successful' : 'Port reachable'}
                                            </p>
                                            <p className="text-[11px] text-green-500/60">Latency: {testResult.latency}ms</p>
                                        </div>
                                    </div>
                                )}

                                {testStatus === 'failed' && testResult?.error && (
                                    <div className="mt-3 flex items-start gap-2.5 p-2.5 rounded-lg bg-destructive/8 border border-destructive/20">
                                        <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-xs font-medium text-destructive">
                                                {isSSHProto ? 'Authentication failed' : 'Unreachable'}
                                            </p>
                                            <p className="text-[11px] text-destructive/60 break-words">{testResult.error}</p>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {error && (
                            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs">
                                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                {error}
                            </div>
                        )}

                        <div className="flex flex-col gap-2">
                            <Button type="submit" disabled={loading} className="w-full">
                                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                                {loading ? 'Creating…' : 'Create Server'}
                            </Button>
                            <Button variant="secondary" asChild className="w-full">
                                <Link href="/dashboard">Cancel</Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
