import { describe, expect, it } from 'vitest';
import { pasteSafe } from './paste';

describe('pasteSafe', () => {
    it('removes Enter, line feeds and escape sequences', () => {
        expect(pasteSafe('ls -la\r')).toBe('ls -la');
        expect(pasteSafe('echo hi\nrm -rf /')).toBe('echo hirm -rf /');
        expect(pasteSafe('\u001b[31mred\u001b[0m')).toBe('[31mred[0m');
        expect(pasteSafe('a\u009bb')).toBe('ab');
    });

    it('keeps an ordinary command as it is', () => {
        expect(pasteSafe('sudo systemctl restart nginx')).toBe('sudo systemctl restart nginx');
    });
});
