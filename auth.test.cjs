const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');

async function boot(file, overrides = {}, storage = new Map()) {
    const elements = new Map();
    const element = id => {
        if (!elements.has(id)) elements.set(id, {
            value: '', hidden: true, disabled: false, dataset: {}, textContent: '',
            handlers: {}, addEventListener(event, fn) { this.handlers[event] = fn; },
            setCustomValidity(message) { this.validation = message; },
            reportValidity() { return !element('confirm-password').validation; },
            reset() { for (const item of elements.values()) item.value = ''; }
        });
        return elements.get(id);
    };
    let listener, redirected;
    const buttons = ['login', 'register', 'reset'].map(mode => {
        const button = element(`mode-${mode}`);
        button.dataset.mode = mode;
        return button;
    });
    const calls = [];
    const auth = {
        onAuthStateChange(fn) { listener = fn; },
        async getSession() { return { data: { session: null } }; },
        async getUser() { return { data: { user: null } }; },
        ...Object.fromEntries(['signInWithPassword', 'signUp', 'resetPasswordForEmail', 'updateUser', 'signOut']
            .map(name => [name, async (...args) => { calls.push([name, ...args]); return { data: {} }; }])),
        ...overrides
    };
    const location = { href: 'http://localhost:8000/index.html', hash: '', search: '', pathname: '/index.html', replace(url) { redirected = url; } };
    const context = vm.createContext({
        document: { getElementById: element, querySelectorAll: () => buttons },
        window: { location }, location, history: { replaceState() {} }, URLSearchParams,
        sessionStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        createAuthClient: async () => ({ auth }), pageUrl: name => `http://localhost:8000/${name}`,
        showMessage: (text, error) => { element('message').textContent = text; element('message').error = error; }
    });
    const source = fs.readFileSync(file, 'utf8').replace(/^import .*;\r?\n/, '');
    await vm.runInContext(`(async () => { ${source}\n})()`, context);
    return { element, calls, event: (...args) => listener(...args), redirected: () => redirected,
        mode: name => element(`mode-${name}`).handlers.click(),
        run: code => vm.runInContext(code, context),
        submit: () => element('auth-form').handlers.submit({ preventDefault() {} }) };
}

test('login sends credentials to Supabase and redirects; never persists password itself', async () => {
    const app = await boot('script.js');
    app.mode('login');
    app.element('email').value = ' user@example.com ';
    app.element('password').value = 'password123';
    await app.submit();
    assert.equal(app.calls[0][0], 'signInWithPassword');
    assert.equal(app.calls[0][1].email, 'user@example.com');
    assert.equal(app.element('password').value, '');
    assert.match(app.redirected(), /protected.html$/);
});
test('recovery event reveals password update and calls updateUser', async () => {
    const app = await boot('script.js');
    app.event('PASSWORD_RECOVERY');
    assert.equal(app.element('email').disabled, true);
    app.element('password').value = 'newpassword123';
    app.element('confirm-password').value = 'different';
    await app.submit();
    assert.equal(app.calls.length, 0);
    assert.equal(app.element('confirm-password').validation, 'Passwords must match.');
    app.element('confirm-password').value = 'newpassword123';
    await app.submit();
    assert.equal(app.calls[0][0], 'updateUser');
    assert.match(app.redirected(), /protected.html$/);
});
test('API errors stay visible and allow retry', async () => {
    const app = await boot('script.js', { signInWithPassword: async () => ({ error: { message: 'Invalid login credentials' } }) });
    app.mode('login');
    await app.submit();
    assert.equal(app.element('message').textContent, 'Invalid login credentials');
    assert.equal(app.element('submit-button').disabled, false);
    assert.equal(app.redirected(), undefined);
});
test('registration supplies confirmation callback and waits for email without a session', async () => {
    const app = await boot('script.js');
    assert.equal(app.element('form-title').textContent, 'Create an account');
    app.element('full-name').value = ' Test User ';
    app.element('email').value = 'user@example.com';
    app.element('password').value = app.element('confirm-password').value = 'password123';
    await app.submit();
    assert.equal(app.calls[0][0], 'signUp');
    assert.equal(app.calls[0][1].options.data.full_name, 'Test User');
    assert.equal(app.calls[0][1].options.emailRedirectTo, 'http://localhost:8000/index.html');
    assert.match(app.element('message').textContent, /confirmation link/);
    assert.equal(app.redirected(), undefined);
});
test('reset email request uses correct callback and generic success message', async () => {
    const app = await boot('script.js');
    app.mode('reset');
    assert.equal(app.element('password').disabled, true);
    app.element('email').value = 'user@example.com';
    await app.submit();
    assert.equal(app.calls[0][0], 'resetPasswordForEmail');
    assert.equal(app.calls[0][2].redirectTo, 'http://localhost:8000/index.html');
    assert.match(app.element('message').textContent, /If an account exists/);
});
test('protected page rejects visitors without a verified user', async () => {
    const app = await boot('protected.js');
    assert.equal(app.element('account').hidden, true);
    assert.match(app.redirected(), /index.html$/);
});
test('protected page displays verified user and hides content on sign out', async () => {
    const app = await boot('protected.js', { getUser: async () => ({ data: { user: { email: 'user@example.com' } } }) });
    assert.equal(app.element('account').hidden, false);
    assert.equal(app.element('user-email').textContent, 'user@example.com');
    app.event('SIGNED_OUT', null);
    assert.equal(app.element('account').hidden, true);
    assert.match(app.redirected(), /index.html$/);
});

test('recovery survives reload for the same user and clears after update', async () => {
    const storage = new Map([['codex-password-recovery-user', 'user-1']]);
    const app = await boot('script.js', {
        getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } })
    }, storage);
    assert.equal(app.element('form-title').textContent, 'New password');
    app.element('password').value = app.element('confirm-password').value = 'newpassword123';
    await app.submit();
    assert.equal(app.calls[0][0], 'updateUser');
    assert.equal(storage.has('codex-password-recovery-user'), false);
});

test('revoked stored session stays on login rather than redirecting in a loop', async () => {
    const app = await boot('script.js', {
        getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
        getUser: async () => ({ data: { user: null }, error: { status: 401 } })
    });
    assert.equal(app.redirected(), undefined);
    assert.equal(app.element('submit-button').disabled, false);
    assert.match(app.element('message').textContent, /sign in again/);
});

test('protected page stays hidden on network failure without redirecting', async () => {
    const app = await boot('protected.js', {
        getUser: async () => ({ data: { user: null }, error: { message: 'Network unavailable', status: 0 } })
    });
    assert.equal(app.element('account').hidden, true);
    assert.equal(app.redirected(), undefined);
    assert.equal(app.element('message').textContent, 'Network unavailable');
});
