function decodeJwtPayload(token) {
    const payload = token.split('.')[1];
    if (!payload) return null;

    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    try {
        return JSON.parse(atob(padded));
    } catch {
        return null;
    }
}

export async function createAuthClient() {
    const rawConfig = window.SUPABASE_CONFIG || {};
    const url = String(rawConfig.url || '').trim();
    const publishableKey = String(rawConfig.publishableKey || '').trim();
    if (!url || !publishableKey || url.includes('YOUR_') || publishableKey.includes('YOUR_')) {
        throw new Error('Authentication is not configured.', { cause: 'missing-config' });
    }
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error('The Supabase URL must use HTTPS.');
    }
    if (parsedUrl.protocol !== 'https:') throw new Error('The Supabase URL must use HTTPS.');

    const legacyRole = decodeJwtPayload(publishableKey)?.role;
    const normalizedKey = publishableKey.toLowerCase();
    if (normalizedKey.startsWith('sb_secret_') || String(legacyRole || '').toLowerCase() === 'service_role') {
        throw new Error('Remove the secret key from config.js and rotate it in Supabase. Use a public publishable key.');
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.110.0');
    return createClient(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' }
    });
}
export function pageUrl(name) { return new URL(name, window.location.href).href; }
export function showMessage(message, error = false) {
    const element = document.getElementById('message');
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('error', error);
}
