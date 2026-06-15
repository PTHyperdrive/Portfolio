/**
 * TimoSMS — temporary SMS-receive provider abstraction.
 *
 * The whole app talks to numbers through the `SmsProvider` interface, so the
 * real Telecom integration lives in exactly ONE place: `TelecomSmsProvider`
 * below. Swap providers with the `SMS_PROVIDER` env var.
 *
 * Env:
 *   SMS_PROVIDER   "stub" (default, dev) | "telecom"
 *   SMS_API_BASE   base URL of the Telecom SMS API        (telecom only)
 *   SMS_API_KEY    bearer/API key for the Telecom API     (telecom only)
 *
 * Billing is charge-on-receipt (see the rental routes): a provider must let us
 * (1) allocate a number, (2) poll inbound messages, (3) cancel/release.
 */

export interface ProviderService {
    /** Telecom's own service identifier (maps to SmsService.providerServiceCode). */
    code: string;
    name: string;
    country: string;
    /** Provider-side price hint, if exposed (informational only — we set our own). */
    priceHint?: number;
}

export interface RentedNumber {
    providerRentalId: string;
    phoneNumber: string;
}

export interface InboundMessage {
    sender?: string;
    text: string;
}

export interface SmsProvider {
    /** Optional catalog sync — services + prices the provider currently offers. */
    listServices(): Promise<ProviderService[]>;
    /** Allocate a number for a service+country. Throws if none available. */
    rentNumber(opts: { serviceCode: string; country: string }): Promise<RentedNumber>;
    /** Fetch inbound messages received so far for a rental (newest-inclusive). */
    pollMessages(providerRentalId: string): Promise<InboundMessage[]>;
    /** Release/cancel a rental on the provider side. Best-effort — must not throw fatally. */
    cancel(providerRentalId: string): Promise<void>;
}

/**
 * Pull a one-time code out of an SMS body. Handles the common shapes:
 *   "G-123456 is your Google code", "Your code is 1234", "<#> 482913 ...".
 * Returns the longest standalone 4–8 digit run, or null.
 */
export function extractCode(text: string): string | null {
    if (!text) return null;
    // Prefer codes that appear after a "code"/"is" cue, else any 4–8 digit run.
    const cued = text.match(/(?:code|otp|pin|is)[^0-9]{0,12}(\d[\d-]{2,9}\d)/i);
    const candidate = cued?.[1] ?? text.match(/\b(\d{4,8})\b/)?.[1] ?? null;
    if (!candidate) return null;
    const digits = candidate.replace(/\D/g, "");
    return digits.length >= 4 && digits.length <= 8 ? digits : null;
}

// ─── Stub provider (dev / no Telecom) ────────────────────────────
//
// Generates a fake number immediately and "delivers" a code a few seconds
// after rent, so the full rent → receive → charge flow is testable locally.
// Selected when SMS_PROVIDER is unset or "stub". NEVER use in production.

const STUB_DELIVER_AFTER_MS = 8_000;
const stubClock = new Map<string, number>(); // providerRentalId → rentedAt(ms)

class StubSmsProvider implements SmsProvider {
    async listServices(): Promise<ProviderService[]> {
        return [
            { code: "google", name: "Google / Gmail", country: "VN" },
            { code: "telegram", name: "Telegram", country: "VN" },
        ];
    }

    async rentNumber(opts: { serviceCode: string; country: string }): Promise<RentedNumber> {
        const id = `stub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        stubClock.set(id, Date.now());
        // Deterministic-ish fake E.164 number for the country.
        const cc = opts.country === "VN" ? "84" : "1";
        const subscriber = String(Math.floor(100_000_000 + Math.random() * 899_999_999));
        return { providerRentalId: id, phoneNumber: `+${cc}${subscriber}` };
    }

    async pollMessages(providerRentalId: string): Promise<InboundMessage[]> {
        const rentedAt = stubClock.get(providerRentalId);
        if (!rentedAt || Date.now() - rentedAt < STUB_DELIVER_AFTER_MS) return [];
        const code = String(Math.floor(100_000 + Math.random() * 899_999));
        return [{ sender: "VERIFY", text: `Your verification code is ${code}` }];
    }

    async cancel(providerRentalId: string): Promise<void> {
        stubClock.delete(providerRentalId);
    }
}

// ─── Telecom provider (real integration — FILL THIS IN) ──────────
//
// Map each method to the operator's Telecom SMS API. The shapes below are the
// only thing the rest of the app depends on; keep the return types intact.

class TelecomSmsProvider implements SmsProvider {
    private base = process.env.SMS_API_BASE ?? "";
    private key = process.env.SMS_API_KEY ?? "";

    private assertConfigured(): void {
        if (!this.base || !this.key) {
            throw new Error("TelecomSmsProvider: SMS_API_BASE / SMS_API_KEY not configured");
        }
    }

    async listServices(): Promise<ProviderService[]> {
        this.assertConfigured();
        // TODO(operator): GET {base}/services → map to ProviderService[].
        throw new Error("TelecomSmsProvider.listServices not implemented");
    }

    async rentNumber(opts: { serviceCode: string; country: string }): Promise<RentedNumber> {
        this.assertConfigured();
        void opts;
        // TODO(operator): POST {base}/rent {service, country} →
        //   { providerRentalId: <activation id>, phoneNumber: <E.164> }.
        throw new Error("TelecomSmsProvider.rentNumber not implemented");
    }

    async pollMessages(providerRentalId: string): Promise<InboundMessage[]> {
        this.assertConfigured();
        void providerRentalId;
        // TODO(operator): GET {base}/messages?id=<providerRentalId> →
        //   [{ sender, text }]. Return [] while none have arrived.
        throw new Error("TelecomSmsProvider.pollMessages not implemented");
    }

    async cancel(providerRentalId: string): Promise<void> {
        this.assertConfigured();
        void providerRentalId;
        // TODO(operator): POST {base}/cancel {id}. Swallow provider errors.
        throw new Error("TelecomSmsProvider.cancel not implemented");
    }
}

let cached: SmsProvider | null = null;

/** Returns the configured provider (singleton). */
export function getSmsProvider(): SmsProvider {
    if (cached) return cached;
    cached = process.env.SMS_PROVIDER === "telecom"
        ? new TelecomSmsProvider()
        : new StubSmsProvider();
    return cached;
}
