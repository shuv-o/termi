export interface KeychainEntry {
    id: string;
    label: string;
    username: string;
    hasPassword: boolean;
    hasPrivateKey: boolean;
    createdAt: string;
}

export interface EntryForm {
    label: string;
    username: string;
    authMethod: 'password' | 'key';
    password: string;
    privateKey: string;
    passphrase: string;
}

export const emptyForm = (): EntryForm => ({
    label: '',
    username: '',
    authMethod: 'password',
    password: '',
    privateKey: '',
    passphrase: '',
});
