'use client';

/** Heading + icon block shared by every settings card. */
export function SettingsSection({
    title,
    description,
    icon: Icon,
    iconBg,
    children,
}: {
    title: string;
    description?: string;
    icon?: React.ElementType;
    iconBg?: string;
    children: React.ReactNode;
}) {
    return (
        <div>
            {(title || description) && (
                <div className="flex items-start gap-3 mb-5">
                    {Icon && (
                        <div
                            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg ?? 'bg-secondary'}`}
                        >
                            <Icon className="w-4.5 h-4.5" />
                        </div>
                    )}
                    <div>
                        <h2 className="font-semibold text-base">{title}</h2>
                        {description && (
                            <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
                        )}
                    </div>
                </div>
            )}
            {children}
        </div>
    );
}
