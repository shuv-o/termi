'use client';

import dynamic from 'next/dynamic';
import { PageHeader } from '@/components/ui/page-header';

const SerialConsole = dynamic(() => import('@/components/terminal/SerialConsole'), { ssr: false });

export default function SerialPage() {
    return (
        <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-4 p-4 lg:h-screen lg:p-6">
            <PageHeader
                title="Serial console"
                description="Talk to a switch, router or board over a USB console cable plugged into this computer. The connection stays on your computer."
            />
            <div className="min-h-0 flex-1">
                <SerialConsole />
            </div>
        </div>
    );
}
