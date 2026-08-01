'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    DEFAULT_GROUP_COLOR,
    PRESET_COLORS,
    PRESET_ICONS,
    getIconComponent,
    type GroupFormData,
} from './types';

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {PRESET_COLORS.map((c) => (
                <button
                    key={c}
                    type="button"
                    onClick={() => onChange(value === c ? '' : c)}
                    className={`w-6 h-6 rounded-full transition-all duration-150 ${
                        value === c
                            ? 'ring-2 ring-offset-2 ring-offset-card ring-white scale-110'
                            : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                />
            ))}
            <label
                className="w-6 h-6 rounded-full border-2 border-dashed border-border hover:border-muted-foreground transition-colors cursor-pointer flex items-center justify-center text-muted-foreground"
                title="Custom"
            >
                <Plus className="w-3 h-3" />
                <input
                    type="color"
                    className="sr-only"
                    value={value || '#ffffff'}
                    onChange={(e) => onChange(e.target.value)}
                />
            </label>
        </div>
    );
}

function IconPicker({ value, onChange }: { value: string; onChange: (icon: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {PRESET_ICONS.map(({ value: iconValue, label, icon: Icon }) => (
                <button
                    key={iconValue}
                    type="button"
                    title={label}
                    onClick={() => onChange(value === iconValue ? '' : iconValue)}
                    className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-all duration-150 ${
                        value === iconValue
                            ? 'bg-primary/20 border-primary/60 text-primary'
                            : 'bg-secondary border-border text-muted-foreground hover:border-border/80 hover:text-foreground'
                    }`}
                >
                    <Icon className="w-3.5 h-3.5" />
                </button>
            ))}
        </div>
    );
}

export function GroupModal({
    open,
    mode,
    initial,
    onClose,
    onSave,
}: {
    open: boolean;
    mode: 'create' | 'edit';
    initial: GroupFormData;
    onClose: () => void;
    onSave: (data: GroupFormData) => Promise<void>;
}) {
    const [form, setForm] = useState<GroupFormData>(initial);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setForm(initial);
        setError('');
    }, [initial, open]);

    useEffect(() => {
        if (open) setTimeout(() => nameRef.current?.focus(), 50);
    }, [open]);

    const update = (fields: Partial<GroupFormData>) => setForm((f) => ({ ...f, ...fields }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) {
            setError('Name is required');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await onSave(form);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Something went wrong');
        } finally {
            setSaving(false);
        }
    };

    const previewColor = form.color || DEFAULT_GROUP_COLOR;
    const IconPreview = getIconComponent(form.icon);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="bg-card border-border max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-3">
                        <div
                            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border"
                            style={{
                                backgroundColor: `${previewColor}22`,
                                borderColor: `${previewColor}44`,
                            }}
                        >
                            <IconPreview className="w-4.5 h-4.5" style={{ color: previewColor }} />
                        </div>
                        {mode === 'create' ? 'Create Group' : 'Edit Group'}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} method="POST" action="#" className="space-y-5 pt-1">
                    <div className="space-y-1.5">
                        <Label>
                            Name <span className="text-red-400">*</span>
                        </Label>
                        <Input
                            ref={nameRef}
                            type="text"
                            className="bg-secondary border-border"
                            placeholder="e.g. Production Servers"
                            maxLength={50}
                            value={form.name}
                            onChange={(e) => update({ name: e.target.value })}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label>
                            Description{' '}
                            <span className="text-muted-foreground font-normal">(optional)</span>
                        </Label>
                        <Textarea
                            className="bg-secondary border-border resize-none"
                            rows={2}
                            placeholder="Brief description..."
                            maxLength={200}
                            value={form.description}
                            onChange={(e) => update({ description: e.target.value })}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-5">
                        <div className="space-y-2">
                            <Label>
                                Color{' '}
                                <span className="text-muted-foreground font-normal">
                                    (optional)
                                </span>
                            </Label>
                            <ColorPicker
                                value={form.color}
                                onChange={(color) => update({ color })}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label>
                                Icon{' '}
                                <span className="text-muted-foreground font-normal">
                                    (optional)
                                </span>
                            </Label>
                            <IconPicker value={form.icon} onChange={(icon) => update({ icon })} />
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="flex gap-3 pt-1">
                        <Button
                            type="button"
                            variant="secondary"
                            className="flex-1"
                            onClick={onClose}
                        >
                            Cancel
                        </Button>
                        <Button type="submit" disabled={saving} className="flex-1">
                            {saving ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <Check className="w-4 h-4" />
                            )}
                            {mode === 'create' ? 'Create Group' : 'Save Changes'}
                        </Button>
                    </div>
                </form>
            </DialogContent>
        </Dialog>
    );
}
