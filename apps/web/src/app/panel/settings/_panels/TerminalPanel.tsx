'use client';

import { useEffect, useState } from 'react';
import { SquareTerminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { SUGGESTIONS_CHANGED_EVENT } from '@/components/terminal/CommandSuggestions';
import { clearAllHistory, setSuggestionsEnabled, suggestionsEnabled } from '@/lib/terminal/history';
import { SettingsSection } from '../_components/SettingsSection';

/** Terminal preferences that live in this browser. */
export function TerminalPanel() {
    const [on, setOn] = useState(true);
    const [cleared, setCleared] = useState<number | null>(null);
    useEffect(() => setOn(suggestionsEnabled()), []);

    return (
        <SettingsSection
            title="Terminal"
            description="Preferences for SSH terminals, kept in this browser."
            icon={SquareTerminal}
            iconBg="bg-primary/10 text-primary"
        >
            <div className="space-y-5">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <label htmlFor="suggestions-switch" className="text-sm font-medium">
                            Command suggestions
                        </label>
                        <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                            As you type, suggest the rest of a command you ran before on that server
                            (or a snippet); press → to accept. Your command history stays in this
                            browser. Commands starting with a space, and anything typed without
                            being shown (like passwords), are never remembered.
                        </p>
                    </div>
                    <Switch
                        id="suggestions-switch"
                        checked={on}
                        onCheckedChange={(v) => {
                            setOn(v);
                            setSuggestionsEnabled(v);
                            window.dispatchEvent(new Event(SUGGESTIONS_CHANGED_EVENT));
                        }}
                    />
                </div>
                <div className="flex items-center justify-between gap-4 border-t border-border/60 pt-4">
                    <div>
                        <p className="text-sm font-medium">Command history</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                            {cleared === null
                                ? 'Forget the commands remembered for suggestions, on every server.'
                                : `History cleared${cleared ? ` for ${cleared} server${cleared === 1 ? '' : 's'}` : ''}.`}
                        </p>
                    </div>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setCleared(clearAllHistory())}
                    >
                        Clear history
                    </Button>
                </div>
            </div>
        </SettingsSection>
    );
}
