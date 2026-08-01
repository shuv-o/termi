'use client';

import { SECTION_IDS, SECTION_SHORT_LABELS, type SectionId } from '../types';

/** Horizontally scrolling chip row that replaces the sidebar below `xl`. */
export function MobileSectionPicker({
    active,
    onChange,
}: {
    active: SectionId;
    onChange: (s: SectionId) => void;
}) {
    return (
        <div className="xl:hidden mb-4 -mx-1">
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1 px-1">
                {SECTION_IDS.map((s) => (
                    <button
                        key={s}
                        onClick={() => onChange(s)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                            active === s
                                ? s === 'danger'
                                    ? 'bg-red-500/20 text-red-400'
                                    : 'bg-primary/20 text-primary'
                                : 'bg-secondary text-muted-foreground hover:text-foreground'
                        }`}
                    >
                        {SECTION_SHORT_LABELS[s]}
                    </button>
                ))}
            </div>
        </div>
    );
}
