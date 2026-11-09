/** A saved terminal command, as `/api/snippets` returns it. */
export interface Snippet {
    id: string;
    label: string;
    command: string;
    icon?: string | null;
    runImmediately: boolean;
}
