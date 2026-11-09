/**
 * Snippet variables: `{{name}}`, `{{name:default}}`, and `{{name|q}}` /
 * `{{name:default|q}}` to insert the value shell-quoted.
 *
 * Unquoted values go in as typed, so a variable can hold flags or a list.
 * `|q` wraps the value in single quotes (escaping any inside), so a value
 * like `it's; rm -rf ~` stays one harmless argument.
 */

export interface SnippetVariable {
    name: string;
    defaultValue: string;
}

const PATTERN = /\{\{\s*([A-Za-z_][A-Za-z0-9_-]{0,31})\s*(?::([^}|]*))?(\|q)?\s*\}\}/g;

/** The variables a command uses, in order of first appearance. */
export function snippetVariables(command: string): SnippetVariable[] {
    const seen = new Map<string, SnippetVariable>();
    for (const m of command.matchAll(PATTERN)) {
        const [, name, def] = m;
        const existing = seen.get(name);
        if (!existing) seen.set(name, { name, defaultValue: def ?? '' });
        else if (!existing.defaultValue && def) existing.defaultValue = def;
    }
    return [...seen.values()];
}

/** POSIX shell single-quoting. */
export function shellQuote(value: string): string {
    return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** The command with every variable replaced (missing values use their default). */
export function fillSnippet(command: string, values: Record<string, string>): string {
    return command.replace(PATTERN, (_all, name: string, def: string | undefined, q?: string) => {
        const value = values[name] ?? def ?? '';
        return q ? shellQuote(value) : value;
    });
}

/** A command split into plain text and `{{variable}}` placeholders, for display. */
export function commandParts(command: string): { text: string; variable?: string }[] {
    const parts: { text: string; variable?: string }[] = [];
    let last = 0;
    for (const m of command.matchAll(PATTERN)) {
        const at = m.index ?? 0;
        if (at > last) parts.push({ text: command.slice(last, at) });
        parts.push({ text: m[0], variable: m[1] });
        last = at + m[0].length;
    }
    if (last < command.length) parts.push({ text: command.slice(last) });
    return parts;
}
