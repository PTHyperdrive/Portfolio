/**
 * NotRespondLogo — React component wrapper for the NOTRESPOND LABS brand mark.
 *
 * Props:
 *   variant  — "full" (icon + text) | "icon" (icon only)
 *   width    — override width in px (height scales proportionally)
 *   className — optional CSS class
 *
 * Usage:
 *   import { NotRespondLogo } from "@/components/NotRespondLogo";
 *   <NotRespondLogo variant="full" width={280} />
 *   <NotRespondLogo variant="icon" width={40} />  // favicon / nav
 */

interface Props {
    variant?: "full" | "icon";
    width?: number;
    className?: string;
}

/** Icon mark only (square, 162×162 viewBox) */
function IconMark({ stroke = "#fff" }: { stroke?: string }) {
    return (
        <g transform="translate(81,81)" stroke={stroke} strokeLinecap="round" fill="none">
            <g strokeWidth="12">
                <path d="M 0,-44 A 44,44,0,0,1,13.60,-41.85"/>
                <path d="M 25.86,-35.60 A 44,44,0,0,1,35.60,-25.86"/>
                <path d="M 41.85,-13.60 A 44,44,0,0,1,44,0"/>
                <path d="M 41.85,13.60 A 44,44,0,0,1,35.60,25.86"/>
                <path d="M 25.86,35.60 A 44,44,0,0,1,13.60,41.85"/>
                <path d="M 0,44 A 44,44,0,0,1,-13.60,41.85"/>
                <path d="M -25.86,35.60 A 44,44,0,0,1,-35.60,25.86"/>
                <path d="M -41.85,13.60 A 44,44,0,0,1,-44,0"/>
                <path d="M -41.85,-13.60 A 44,44,0,0,1,-35.60,-25.86"/>
                <path d="M -25.86,-35.60 A 44,44,0,0,1,-13.60,-41.85"/>
            </g>
            <g strokeWidth="11">
                <line x1="22.20"  y1="-53.59" x2="29.08"  y2="-70.22"/>
                <line x1="53.59"  y1="-22.20" x2="70.22"  y2="-29.08"/>
                <line x1="53.59"  y1="22.20"  x2="70.22"  y2="29.08"/>
                <line x1="22.20"  y1="53.59"  x2="29.08"  y2="70.22"/>
                <line x1="-22.20" y1="53.59"  x2="-29.08" y2="70.22"/>
                <line x1="-53.59" y1="22.20"  x2="-70.22" y2="29.08"/>
                <line x1="-53.59" y1="-22.20" x2="-70.22" y2="-29.08"/>
                <line x1="-22.20" y1="-53.59" x2="-29.08" y2="-70.22"/>
            </g>
        </g>
    );
}

export function NotRespondLogo({ variant = "full", width, className }: Props) {
    if (variant === "icon") {
        const w = width ?? 40;
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 162 162"
                width={w}
                height={w}
                fill="none"
                role="img"
                aria-label="NOTRESPOND LABS"
                className={className}
            >
                <IconMark />
            </svg>
        );
    }

    // Full logo: 548 × 162 viewBox
    const w   = width ?? 274; // default half-size
    const h   = Math.round(w * (162 / 548));
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 548 162"
            width={w}
            height={h}
            fill="none"
            role="img"
            aria-label="NOTRESPOND LABS"
            className={className}
        >
            <IconMark />
            <text
                x="178" y="71"
                fill="#fff"
                fontFamily="'Inter','Helvetica Neue',Arial,sans-serif"
                fontWeight="900"
                fontSize="52"
                letterSpacing="1.5"
            >
                NOTRESPOND
            </text>
            <text
                x="178" y="131"
                fill="#fff"
                fontFamily="'Inter','Helvetica Neue',Arial,sans-serif"
                fontWeight="900"
                fontSize="52"
                letterSpacing="1.5"
            >
                LABS
            </text>
        </svg>
    );
}

export default NotRespondLogo;
