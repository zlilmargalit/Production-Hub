// Self-contained login page. No external assets so it works on first paint
// even when the rest of the app is gated behind auth.

module.exports = function loginPage({ error = false, username = '' } = {}) {
  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Production Hub — Login</title>
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
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
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }
  .brand {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    margin-bottom: 24px;
  }
  .brand svg { width: 36px; height: 36px; flex-shrink: 0; }
  .brand h1 {
    font-size: 20px;
    font-weight: 600;
    letter-spacing: -0.01em;
    color: #F0EAE0;
  }
  label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #A8A199;
    margin-bottom: 6px;
    margin-top: 14px;
  }
  input[type=text], input[type=password] {
    width: 100%;
    background: #1A1714;
    border: 1px solid #3A3530;
    border-radius: 8px;
    padding: 12px 14px;
    color: #F0EAE0;
    font-size: 16px;             /* 16px stops iOS from zooming on focus */
    font-family: inherit;
    transition: border-color 0.15s;
  }
  input:focus {
    outline: none;
    border-color: #5E7AC4;
  }
  button {
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
  button:hover, button:active { background: #4F69B0; }
  .error {
    margin-top: 16px;
    padding: 10px 12px;
    background: rgba(176, 84, 72, 0.15);
    border: 1px solid rgba(176, 84, 72, 0.3);
    border-radius: 8px;
    color: #E89B92;
    font-size: 13px;
    text-align: center;
  }
</style>
</head>
<body>
  <form class="card" method="POST" action="/login" autocomplete="on">
    <div class="brand">
      <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M32 20 A 12 12 0 1 0 20 32 A 6 6 0 0 0 20 20" stroke="#5E7AC4" stroke-width="3.5" stroke-linecap="round" fill="none"/>
        <path d="M17.5 16 L 24 20 L 17.5 24 Z" fill="#F3BE7A" stroke="#F3BE7A" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
      <h1>Production Hub</h1>
    </div>

    <label for="username">Username</label>
    <input type="text" id="username" name="username" autocapitalize="off" autocorrect="off" autocomplete="username"
           value="${escapeHtml(username)}" required autofocus />

    <label for="password">Password</label>
    <input type="password" id="password" name="password" autocomplete="current-password" required />

    <button type="submit">Sign in</button>

    ${error ? '<div class="error">Wrong username or password</div>' : ''}
  </form>
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
