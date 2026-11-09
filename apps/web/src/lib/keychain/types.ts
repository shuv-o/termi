/** A saved login as `/api/keychain` lists it (no secrets). */
export interface KeychainEntry {
    id: string;
    label: string;
    username: string;
    hasPassword: boolean;
    hasPrivateKey: boolean;
    createdAt: string;
}
