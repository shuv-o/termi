export type { KeychainEntry } from '@/lib/keychain/types';

export interface EntryForm {
    label: string;
    username: string;
    authMethod: 'password' | 'key';
    password: string;
    privateKey: string;
    passphrase: string;
    /** OpenSSH certificate for the key ('' for none). */
    certificate: string;
}

export const emptyForm = (): EntryForm => ({
    label: '',
    username: '',
    authMethod: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
    certificate: '',
});
