'use client';

import { Palette } from 'lucide-react';
import { AppearanceEditor } from '@/components/appearance/AppearanceEditor';
import { AppearancePreview } from '@/components/appearance/AppearancePreview';
import { useAppearance } from '@/lib/appearance/store';
import { SettingsSection } from '../_components/SettingsSection';

/** Settings → Appearance: the same choices as the first-run setup. */
export function AppearancePanel() {
    const appearance = useAppearance();
    return (
        <SettingsSection
            title="Appearance"
            description="How Termi looks and how it's laid out. Changes apply as you pick them."
            icon={Palette}
            iconBg="bg-primary/10 text-primary"
        >
            <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8">
                <div className="lg:order-2 lg:sticky lg:top-6">
                    <AppearancePreview appearance={appearance} />
                </div>
                <div className="min-w-0 lg:order-1">
                    <AppearanceEditor />
                </div>
            </div>
        </SettingsSection>
    );
}
