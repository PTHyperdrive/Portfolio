declare module "@novnc/novnc/lib/rfb.js" {
    interface RFBOptions {
        credentials?: { password?: string };
        wsProtocols?: string[];
    }

    interface RFBDisconnectEvent extends Event {
        detail: { clean: boolean; reason?: string };
    }

    export default class RFB extends EventTarget {
        constructor(target: HTMLElement, url: string, options?: RFBOptions);
        scaleViewport: boolean;
        resizeSession: boolean;
        viewOnly: boolean;
        qualityLevel: number;
        compressionLevel: number;
        disconnect(): void;
        sendCtrlAltDel(): void;
        addEventListener(type: "connect", listener: (e: Event) => void): void;
        addEventListener(type: "disconnect", listener: (e: RFBDisconnectEvent) => void): void;
        addEventListener(type: "credentialsrequired", listener: (e: Event) => void): void;
        addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
    }
}
