import * as assert from 'assert';

const mockVscode = require('./vscode-mock');
const Module = require('module');
const originalRequire = Module.prototype.require;

Module.prototype.require = function (request: string) {
  if (request === 'vscode') {
    return mockVscode;
  }
  return originalRequire.apply(this, arguments);
};

const {
  buildGoogleAuthorizationUrl,
  createMockGoogleIdToken,
  decodeGoogleJwtClaims,
  describeGoogleScopes,
  mergeGoogleManagedNotes
} = require('../../out/googleOAuthService');

Module.prototype.require = originalRequire;

suite('Google OAuth Helpers (Mocked)', () => {
  test('builds the desktop authorization URL with PKCE and offline access', () => {
    const url = new URL(buildGoogleAuthorizationUrl(
      'client.apps.googleusercontent.com',
      'http://127.0.0.1:8787/oauth/google/callback',
      'abc123',
      ['openid', 'email', 'https://www.googleapis.com/auth/spreadsheets']
    ));

    assert.strictEqual(url.origin, 'https://accounts.google.com');
    assert.strictEqual(url.pathname, '/o/oauth2/v2/auth');
    assert.strictEqual(url.searchParams.get('client_id'), 'client.apps.googleusercontent.com');
    assert.strictEqual(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:8787/oauth/google/callback');
    assert.strictEqual(url.searchParams.get('code_challenge'), 'abc123');
    assert.strictEqual(url.searchParams.get('code_challenge_method'), 'S256');
    assert.strictEqual(url.searchParams.get('access_type'), 'offline');
    assert.strictEqual(url.searchParams.get('prompt'), 'consent');
  });

  test('decodes the Google identity token payload', () => {
    const token = createMockGoogleIdToken('matth.leion@gmail.com');
    const claims = decodeGoogleJwtClaims(token);

    assert.strictEqual(claims.email, 'matth.leion@gmail.com');
  });

  test('summarizes Google scopes and preserves user notes', () => {
    const labels = describeGoogleScopes('openid email https://www.googleapis.com/auth/drive.file');
    const note = mergeGoogleManagedNotes('Keep this provider tied to the cockpit inbox.', 'openid email https://www.googleapis.com/auth/spreadsheets');

    assert.deepStrictEqual(labels, ['OpenID', 'Google account email', 'Google Drive (file-level)']);
    assert.strictEqual(note.includes('Keep this provider tied to the cockpit inbox.'), true);
    assert.strictEqual(note.includes('[Google OAuth]'), true);
    assert.strictEqual(note.includes('Google Sheets'), true);
  });
});
