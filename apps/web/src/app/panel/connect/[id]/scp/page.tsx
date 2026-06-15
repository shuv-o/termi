'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, AlertCircle } from 'lucide-react';
import FileManagerPanel from '@/components/scp/FileManagerPanel';
import { Button } from '@/components/ui/button';

export default function SCPPage() {
    const { id: serverId } = useParams<{ id: string }>();
    const [serverName, setServerName] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        fetch(`/api/servers/${serverId}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.success) setServerName(data.data.server.name);
                else setError('Server not found');
            })
            .catch(() => setError('Failed to load server'))
            .finally(() => setLoading(false));
    }, [serverId]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-dvh lg:h-screen">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-dvh lg:h-screen gap-4">
                <AlertCircle className="w-10 h-10 text-destructive" />
                <p className="text-destructive">{error}</p>
                <Button asChild>
                    <Link href="/panel">Back to Dashboard</Link>
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[calc(100dvh-3.5rem-4rem)] lg:h-dvh">
            {/* Header */}
            <div className="flex items-center gap-3 px-3 py-2 shrink-0 border-b border-border bg-card">
                <Button variant="ghost" size="icon" asChild className="h-8 w-8">
                    <Link href="/panel">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                </Button>
                <div className="min-w-0">
                    <h1 className="font-medium truncate">{serverName}</h1>
                    <span className="text-sm text-muted-foreground">File Manager (SFTP)</span>
                </div>
            </div>

            {/* Full-height panel */}
            <div className="flex-1 min-h-0 overflow-hidden">
                <FileManagerPanel serverId={serverId} />
            </div>
        </div>
    );
}
