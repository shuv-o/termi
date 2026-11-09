/**
 * A one-line command as typed text: no Enter, no escape sequences, no other
 * control characters, so pasting it into a terminal can never run anything.
 * Multi-line commands are never pasted (the reply offers Copy instead).
 */
export function pasteSafe(code: string): string {
    return code.replace(/[\u0000-\u001f\u007f-\u009f]/g, '').trim();
}
