'use client';

/** Minimal, dependency-free rolling line chart for one metric's recent history. */
export function MetricSparkline({
    values,
    max,
    color,
    height = 36,
}: {
    values: (number | null)[];
    /** Fixed scale (e.g. 100 for a percentage). Omitted = auto-scale to the data's own peak. */
    max?: number;
    color: string;
    height?: number;
}) {
    const width = 200; // viewBox units — stretched to the container via preserveAspectRatio
    const nums = values.filter((v): v is number => v != null);
    const peak = max ?? Math.max(1, ...nums);

    if (nums.length < 2) {
        return (
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
                <line
                    x1={0}
                    y1={height - 1}
                    x2={width}
                    y2={height - 1}
                    stroke="currentColor"
                    strokeOpacity={0.15}
                />
            </svg>
        );
    }

    const step = width / (values.length - 1);
    const points = values
        .map((v, i) => {
            if (v == null) return null;
            const x = i * step;
            const y = height - (Math.min(v, peak) / peak) * (height - 2) - 1;
            return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .filter((p): p is string => p !== null)
        .join(' ');

    return (
        <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full overflow-visible"
            style={{ height }}
            preserveAspectRatio="none"
        >
            <polyline
                points={points}
                fill="none"
                stroke={color}
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
            />
        </svg>
    );
}
