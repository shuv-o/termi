// ssh2 protocol internals used by ssh-cert.ts (no published types).
declare module 'ssh2/lib/protocol/Protocol.js' {
    const Protocol: {
        prototype: {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            authPK: (...args: any[]) => void;
        };
    };
    export default Protocol;
}
declare module 'ssh2/lib/protocol/utils.js' {
    const utils: {
        writeUInt32BE(buf: Buffer, value: number, offset: number): void;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sendPacket(proto: any, packet: Buffer): void;
        convertSignature(signature: Buffer, keyType: string): Buffer | false;
    };
    export default utils;
}
declare module 'ssh2/lib/protocol/constants.js' {
    const constants: { MESSAGE: { USERAUTH_REQUEST: number } };
    export default constants;
}
