import { createAuthClient, pageUrl, showMessage } from './auth-client.js';

const form = document.getElementById('auth-form');
const fullName = document.getElementById('full-name');
const email = document.getElementById('email');
const password = document.getElementById('password');
const confirm = document.getElementById('confirm-password');
const submit = document.getElementById('submit-button');
let startupMessage;
let mode = 'register', busy = false, recovery = false, client;
const modeButtons = document.querySelectorAll('[data-mode]');
const recoveryKey = 'codex-password-recovery-user';

function setMode(next) {
    mode = next;
    form.reset();
    confirm.setCustomValidity('');
    fullName.setCustomValidity('');
    const needsConfirm = next === 'register' || next === 'update';
    for (const [input, field, visible] of [
        [fullName, 'name-field', next === 'register'],
        [email, 'email-field', next !== 'update'], [password, 'password-field', next !== 'reset'],
        [confirm, 'confirm-field', needsConfirm]
    ]) {
        document.getElementById(field).hidden = !visible;
        input.disabled = !visible;
        input.required = visible;
    }
    password.minLength = needsConfirm ? 8 : 1;
    password.autocomplete = needsConfirm ? 'new-password' : 'current-password';
    document.getElementById('password-help').hidden = !needsConfirm;
    document.getElementById('mode-links').hidden = next === 'update';
    const title = { login: 'Login', register: 'Create an account', reset: 'Reset password', update: 'New password' }[next];
    document.getElementById('form-title').textContent = title;
    submit.textContent = { login: 'Log in', register: 'Sign up', reset: 'Send reset link', update: 'Save password' }[next];
    for (const button of modeButtons) {
        const modes = button.dataset.showIn;
        if (modes) button.hidden = !modes.split(' ').includes(next);
    }
    showMessage('');
}
modeButtons.forEach(button => button.addEventListener('click', () => {
    if (!busy && !recovery) setMode(button.dataset.mode);
}));
fullName.addEventListener('input', () => fullName.setCustomValidity(''));
confirm.addEventListener('input', () => confirm.setCustomValidity(''));
password.addEventListener('input', () => confirm.setCustomValidity(''));
form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    if (startupMessage) {
        showMessage(startupMessage, true);
        return;
    }
    confirm.setCustomValidity(!confirm.disabled && password.value !== confirm.value ? 'Passwords must match.' : '');
    fullName.setCustomValidity(mode === 'register' && !fullName.value.trim() ? 'Enter your full name.' : '');
    if (!form.reportValidity() || !client) return;
    busy = true;
    submit.disabled = true;
    showMessage('Please wait…');
    try {
        let result;
        if (mode === 'login') {
            result = await client.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
        } else if (mode === 'register') {
            result = await client.auth.signUp({ email: email.value.trim(), password: password.value,
                options: { emailRedirectTo: pageUrl('index.html'), data: { full_name: fullName.value.trim() } } });
        } else if (mode === 'reset') {
            result = await client.auth.resetPasswordForEmail(email.value.trim(), { redirectTo: pageUrl('index.html') });
        } else {
            if (!recovery) throw new Error('Open a valid password reset link first.');
            result = await client.auth.updateUser({ password: password.value });
        }
        if (result.error) throw result.error;
        password.value = '';
        confirm.value = '';
        if (mode === 'update') sessionStorage.removeItem(recoveryKey);
        if (mode === 'login' || (mode === 'register' && result.data.session) || mode === 'update') {
            window.location.replace(pageUrl('protected.html'));
        } else if (mode === 'register') {
            showMessage('Check your email for a confirmation link. If you already have an account, try logging in or resetting your password.');
        } else {
            showMessage('If an account exists for this email, you will receive a password reset link.');
        }
    } catch (error) {
        showMessage(error.message || 'Unable to connect. Check your connection and try again.', true);
    } finally {
        busy = false;
        submit.disabled = false;
    }
});
setMode('register');
try {
    const callback = new URLSearchParams(window.location.hash.slice(1));
    const callbackError = callback.get('error_description') || new URLSearchParams(location.search).get('error_description');
    client = await createAuthClient();
    client.auth.onAuthStateChange((event, session) => {
        if (event === 'PASSWORD_RECOVERY') {
            recovery = true;
            if (session?.user?.id) sessionStorage.setItem(recoveryKey, session.user.id);
            setMode('update');
            showMessage('Choose your new password.');
        } else if (event === 'SIGNED_OUT' && recovery) {
            sessionStorage.removeItem(recoveryKey);
            recovery = false;
            setMode('reset');
            showMessage('Your reset session expired. Request a new link.', true);
        }
    });
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    submit.disabled = false;
    if (!recovery && !callbackError && data.session?.user?.id === sessionStorage.getItem(recoveryKey)) {
        recovery = true;
        setMode('update');
        showMessage('Choose your new password.');
    }
    if (!recovery) {
        if (callbackError || data.session) setMode('login');
        if (callbackError) showMessage('This email link is invalid or expired. Request a new link.', true);
        else if (data.session) {
            // Verify stored sessions before redirecting to avoid a loop after revocation.
            const { data: verified, error: verifyError } = await client.auth.getUser();
            if (!verifyError && verified.user) window.location.replace(pageUrl('protected.html'));
            else showMessage('Your session could not be verified. Please sign in again.', true);
        }
    }
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
} catch (error) {
    startupMessage = error.cause === 'missing-config'
        ? ''
        : 'Unable to load the form. Please reload and try again.';
    submit.disabled = false;
    if (startupMessage) showMessage(startupMessage, true);
}
