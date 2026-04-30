type LogoPropsType = { width: number, height: number } & React.ComponentPropsWithoutRef<'svg'>

export default function TerminalLogo({width = 32, height = 32, ...props}: LogoPropsType) {
    return (
        <svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
            <rect width="512" height="512" rx="80" fill="#0f172a"/>
            <path d="M 136 192 L 252 256 L 136 320" stroke="#0ea5e9" stroke-width="44" stroke-linecap="round"
                  stroke-linejoin="round" fill="none"/>
            <rect x="278" y="232" width="100" height="48" rx="8" fill="#0ea5e9"/>
        </svg>
    )
}