// Disable the warning about ts-ignore: we don't want to start throwing errors
// as Uint8Array.fromHex proliferates (and just silently stop patching)
/* eslint @typescript-eslint/ban-ts-comment: 0 */

function fromHex(hex: string): Uint8Array {
    // @ts-ignore polyfilling a limited availability method - native will be much
    // faster if present.
    if (Uint8Array.fromHex)
        // @ts-ignore
        return Uint8Array.fromHex(hex);

    const buf = new Uint8Array(Math.ceil(hex.length / 2));
    for (let i = 0; i < buf.length; i++) {
        buf[i] = parseInt(hex.substr(i * 2, 2), 16);
    }

    // XXX: Unsure why, but TS says this is a Uint8Array<ArrayBuffer>, and also
    // says Uint8Array is not a generic type.
    return buf as unknown as Uint8Array;
}

async function publicKey(key: string): Promise<CryptoKey> {
    return await crypto.subtle.importKey(
        "raw",
        fromHex(key),
        {
            name: "NODE-ED25519",
            namedCurve: "NODE-ED25519",
        },
        true,
        ["verify"]
    )
}

const encoder = new TextEncoder();

/**
 * Validates that is a valid Discord webhook request.
 *
 * @param key - The public key from the Discord Developer web UI.
 * @param headers - The headers from the request.
 * @param body - The body of the request as a string.
 *
 * @returns true if the request is correctly cryptographically signed
 */
export default async (
    key: string,
    headers: Headers,
    body: string
): Promise<boolean> => {
    const pubkey = await publicKey(key);
    // TODO: we should probably also ensure this isn't too far in the past to
    // guard against replay attacks
    const timestamp = headers.get("X-Signature-Timestamp");
    if (!timestamp) {
        console.error("timestamp header missing");
        return false;
    }

    const signature = headers.get("X-Signature-Ed25519");
    if (!signature) {
        console.error("signature header missing");
        return false;
    }

    const payload = encoder.encode(timestamp + body);

    const sig = fromHex(signature);
    return crypto.subtle.verify("NODE-ED25519", pubkey, sig, payload);
};

