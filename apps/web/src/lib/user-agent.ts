/** "Chrome on macOS"-style summary of a user agent. */
export function describeUserAgent(ua: string | null): string {
    if (!ua) return '';
    const browser = /TermiDesktop/.test(ua)
        ? 'Termi desktop app'
        : /Edg\//.test(ua)
          ? 'Edge'
          : /Chrome\//.test(ua)
            ? 'Chrome'
            : /Firefox\//.test(ua)
              ? 'Firefox'
              : /Safari\//.test(ua)
                ? 'Safari'
                : 'Browser';
    const os = /Windows/.test(ua)
        ? 'Windows'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Mac OS X/.test(ua)
            ? 'macOS'
            : /Android/.test(ua)
              ? 'Android'
              : /Linux/.test(ua)
                ? 'Linux'
                : '';
    return os ? `${browser} on ${os}` : browser;
}
