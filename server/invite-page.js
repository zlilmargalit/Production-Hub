// Invite-registration page — shown when a guest visits /register?token=<uuid>
// No external assets; self-contained.

module.exports = function invitePage({ token = '', error = '', username = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="he" dir="ltr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Production Hub — Join team</title>
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1A1714" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    height: 100%;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #1A1714;
    color: #E8E4DE;
  }
  body {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: max(20px, env(safe-area-inset-top, 20px)) 20px;
  }
  .card {
    background: #25201C;
    border: 1px solid #3A3530;
    border-radius: 16px;
    padding: 28px 24px;
    width: 100%;
    max-width: 360px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 8px;
  }
  .brand h1 {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #F0EAE0;
  }
  .subtitle {
    text-align: center;
    font-size: 13px;
    color: #A8A199;
    margin-bottom: 22px;
  }
  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #A8A199;
    margin-bottom: 6px;
    margin-top: 14px;
  }
  input[type=text], input[type=password], input[type=email] {
    width: 100%;
    background: #1A1714;
    border: 1px solid #3A3530;
    border-radius: 8px;
    padding: 12px 14px;
    color: #F0EAE0;
    font-size: 16px;
    font-family: inherit;
    transition: border-color 0.15s;
  }
  input:focus { outline: none; border-color: #5E7AC4; }
  .submit-btn {
    width: 100%;
    margin-top: 22px;
    background: #5E7AC4;
    color: #fff;
    font-size: 15px;
    font-weight: 600;
    padding: 13px;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }
  .submit-btn:hover, .submit-btn:active { background: #4F69B0; }
  .error {
    margin-top: 16px;
    padding: 10px 12px;
    background: rgba(176,84,72,0.15);
    border: 1px solid rgba(176,84,72,0.3);
    border-radius: 8px;
    color: #E89B92;
    font-size: 13px;
    text-align: center;
  }
  .fatal {
    text-align: center;
    color: #E89B92;
    margin-top: 16px;
    font-size: 14px;
  }
</style>
</head>
<body>
  <div class="card">
    <div class="brand">
      <h1>Production Hub</h1>
    </div>
    <p class="subtitle">You've been invited — create your account below</p>

    ${error
      ? `<div class="error">${escapeHtml(error)}</div>`
      : `<form method="POST" action="/api/auth/register-invite" autocomplete="off">
          <input type="hidden" name="token" value="${escapeHtml(token)}" />

          <label for="username">Username</label>
          <input type="text" id="username" name="username"
                 autocapitalize="off" autocorrect="off" autocomplete="off"
                 minlength="3" maxlength="32"
                 pattern="[a-zA-Z0-9_\\-]+" title="Letters, numbers, _ and - only"
                 value="${escapeHtml(username)}"
                 required autofocus />

          <label for="password">Password</label>
          <input type="password" id="password" name="password"
                 autocomplete="new-password" minlength="6" required />

          <label for="password2">Confirm password</label>
          <input type="password" id="password2" name="password2"
                 autocomplete="new-password" minlength="6" required />

          <label for="email">Email <span style="font-weight:400;opacity:0.65">(optional — for team notifications)</span></label>
          <input type="email" id="email" name="email"
                 autocomplete="email" placeholder="your@email.com" />

          <button class="submit-btn" type="submit">Join team</button>
        </form>`
    }
  </div>
</body>
</html>`;
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
