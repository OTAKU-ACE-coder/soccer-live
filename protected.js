import { createAuthClient, pageUrl, showMessage } from './auth-client.js';

const account = document.getElementById('account');
const logout = document.getElementById('logout');
let leaving = false;

function hideAccount() {
    if (account) account.hidden = true;
}

try {
    if (!account || !logout) {
        throw new Error('The account page is missing required elements.');
    }
    const client = await createAuthClient();
    client.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || (event === 'INITIAL_SESSION' && !session)) {
            leaving = true;
            hideAccount();
            window.location.replace(pageUrl('index.html'));
        }
    });
    const { data, error } = await client.auth.getUser();
    if (leaving) {
        hideAccount();
    } else if (error && error.status !== 401 && error.status !== 403 && error.name !== 'AuthSessionMissingError') {
        throw error;
    } else if (error || !data.user) {
        hideAccount();
        window.location.replace(pageUrl('index.html'));
    } else {
        const userEmail = document.getElementById('user-email');
        if (userEmail) userEmail.textContent = data.user.email;
        account.hidden = false;
        showMessage('');
    }
    logout.addEventListener('click', async () => {
        logout.disabled = true;
        try {
            const { error } = await client.auth.signOut();
            if (error) throw error;
            sessionStorage.removeItem('codex-password-recovery-user');
            window.location.replace(pageUrl('index.html'));
        } catch (error) {
            showMessage(error.message || 'Sign out failed. Please try again.', true);
            logout.disabled = false;
        }
    });
} catch (error) {
    hideAccount();
    showMessage(error.message || 'Unable to check your session. Please reload.', true);
}
