import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Activity, ArrowLeft, ArrowRight, CircleAlert, ShieldCheck } from "lucide-react";
import { useAuth } from "../contexts/AuthContext";
import { checkApiHealth, DISPLAY_CURRENCIES, getApiBaseUrl, getDisplayCurrency, login, registerCustomer, requestPasswordReset, resetPassword, roleFromId, saveApiBaseUrl, saveDisplayCurrency, type RoleName } from "../lib/pharmacyApi";

function Brand() {
  return <div className="auth-brand"><img src="/brand-icon.svg" alt="" /><span><strong>MediStock</strong><small>pharmacy operations</small></span></div>;
}

function getPasswordStrength(password: string) {
  if (!password) return null;
  const hasUpper = /[A-Z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);

  if (hasSpecial) return { label: "Invalid (No special characters)", color: "#e74c3c", width: "100%" };

  let score = 0;
  if (password.length >= 8) score += 1;
  if (hasUpper) score += 1;
  if (hasNumber) score += 1;

  if (score <= 1) return { label: "Weak", color: "#e74c3c", width: "33%" };
  if (score === 2) return { label: "Normal", color: "#f39c12", width: "66%" };
  return { label: "Strong", color: "#2ecc71", width: "100%" };
}



export function AuthPage({ mode }: { mode: "login" | "signup" | "reset" }) {
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetPhase, setResetPhase] = useState<"request" | "change">("request");
  const [form, setForm] = useState({ username: "", password: "", confirm: "", firstName: "", lastName: "", email: "", contactNumber: "", newPassword: "", emailOrPhone: "" });
  const heading = mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Welcome back";

  const update = (key: keyof typeof form, value: string) => setForm((old) => ({ ...old, [key]: value }));


  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess(""); setBusy(true);
    try {
      if (mode === "login") {
        const session = await login(form.username.trim(), form.password);
        signIn(session);
        const role = roleFromId(session.roleId);
        if (!role) throw new Error("Your account role is not supported by this dashboard.");
        setLocation(`/${role}`);
      } else if (mode === "signup") {
        if (form.password.length < 8) throw new Error("Use a password with at least 8 characters.");
        if (!/[A-Z]/.test(form.password) || !/[0-9]/.test(form.password)) throw new Error("Password needs to have uppercase and numbers.");
        if (/[^A-Za-z0-9]/.test(form.password)) throw new Error("Do not use special characters in your password.");
        if (form.password !== form.confirm) throw new Error("The password confirmation does not match.");
        const session = await registerCustomer({ username: form.username.trim(), password: form.password, firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email.trim(), contactNumber: form.contactNumber.trim() });
        signIn(session); setLocation("/customer");
      } else if (resetPhase === "request") {
        if (!form.emailOrPhone.trim()) throw new Error("Enter the email or phone number associated with your account.");
        const result = await requestPasswordReset(form.emailOrPhone.trim());
        if (import.meta.env.DEV && result.resetToken) {
          setResetToken(result.resetToken); setResetPhase("change");
          setSuccess("Development-only OTP received. This API returns OTP directly in dev mode.");
        } else {
          setSuccess(result.message);
        }
      } else {
        if (!resetToken.trim()) throw new Error("Enter the reset token provided through your trusted reset channel.");
        if (form.newPassword.length < 8) throw new Error("Use a new password with at least 8 characters.");
        if (!/[A-Z]/.test(form.newPassword) || !/[0-9]/.test(form.newPassword)) throw new Error("Password needs to have uppercase and numbers.");
        if (/[^A-Za-z0-9]/.test(form.newPassword)) throw new Error("Do not use special characters in your password.");
        if (form.newPassword !== form.confirm) throw new Error("The password confirmation does not match.");
        const message = await resetPassword(resetToken.trim(), form.newPassword);
        setSuccess(message); setResetPhase("request"); setResetToken(""); setForm((old) => ({ ...old, password: "", newPassword: "", confirm: "" }));
      }
    } catch (value) { setError(value instanceof Error ? value.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className="auth-page"><main className="auth-card">
    <section className="auth-art"><Brand /><div className="auth-art-copy"><h2>Medicine orders, handled fast.</h2></div></section>
    <section className="auth-body">
      <div style={{ marginBottom: 16 }}><h1>{heading}</h1>{mode !== "signup" && <p>{mode === "reset" ? "Request an OTP to your email or phone number to reset your password." : "Sign in to open your pharmacy workspace."}</p>}</div>
      {error && <div className="inline-alert error" role="alert"><CircleAlert size={16} /><span>{error}</span></div>}
      {success && <div className="inline-alert success" role="status"><Activity size={15} /><span>{success}</span></div>}
      {mode === "login" && <form className="auth-form" onSubmit={submit}>
        <div className="form-field"><label htmlFor="login-username">Username</label><input id="login-username" autoComplete="username" required value={form.username} onChange={(e) => update("username", e.target.value)} placeholder="Your username" /></div>
        <div className="form-field"><label htmlFor="login-password">Password</label><input id="login-password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => update("password", e.target.value)} placeholder="Your password" /></div>
        <div className="auth-links"><Link href="/reset-password">Forgot password?</Link><span>New to MediStock? <Link href="/signup">Create an account</Link></span></div>
        <button className="button button-primary" type="submit" disabled={busy}>{busy ? <><span className="spinner" />Signing in…</> : <>Sign in <ArrowRight size={15} /></>}</button>
      </form>}
      {mode === "signup" && <form className="auth-form" onSubmit={submit}>
        <div className="form-grid">
          <div className="form-field"><label htmlFor="first-name">First name</label><input id="first-name" required autoComplete="given-name" value={form.firstName} onChange={(e) => update("firstName", e.target.value)} /></div>
          <div className="form-field"><label htmlFor="last-name">Last name</label><input id="last-name" required autoComplete="family-name" value={form.lastName} onChange={(e) => update("lastName", e.target.value)} /></div>
          <div className="form-field"><label htmlFor="signup-email">Email</label><input id="signup-email" type="email" required autoComplete="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></div>
          <div className="form-field"><label htmlFor="signup-contact">Contact number</label><input id="signup-contact" autoComplete="tel" value={form.contactNumber} onChange={(e) => update("contactNumber", e.target.value)} /></div>
          <div className="form-field full"><label htmlFor="signup-username">Username</label><input id="signup-username" required autoComplete="username" value={form.username} onChange={(e) => update("username", e.target.value)} /></div>
          <div className="form-field">
            <label htmlFor="signup-password">Password</label>
            <input id="signup-password" type="password" minLength={8} required autoComplete="new-password" value={form.password} onChange={(e) => update("password", e.target.value)} />
            {form.password && (() => {
              const strength = getPasswordStrength(form.password);
              return strength && (
                <div style={{ marginTop: 6, fontSize: "0.85rem" }}>
                  <div style={{ height: 4, background: "#e0e0e0", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ height: "100%", width: strength.width, background: strength.color, transition: "all 0.3s" }} />
                  </div>
                  <span style={{ color: strength.color, fontWeight: "bold" }}>{strength.label}</span>
                </div>
              );
            })()}
            <span style={{ fontSize: "0.8rem", color: "#666", marginTop: 4, display: "block" }}>Requires uppercase and numbers. Do not use special characters.</span>
          </div>
          <div className="form-field"><label htmlFor="signup-confirm">Confirm password</label><input id="signup-confirm" type="password" minLength={8} required autoComplete="new-password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} /></div>
        </div>

        <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Creating account…" : "Create account"}</button>
        <div className="auth-links" style={{ justifyContent: "center", marginTop: 16 }}><span>Already have an account? <Link href="/login">Sign in</Link></span></div>
      </form>}
      {mode === "reset" && <form className="auth-form" onSubmit={submit}>
        {resetPhase === "request" ? <>
          <div className="form-field"><label htmlFor="reset-emailOrPhone">Email or Phone number</label><input id="reset-emailOrPhone" required value={form.emailOrPhone} onChange={(e) => update("emailOrPhone", e.target.value)} placeholder="Your email or phone number" /></div>
          <div className="inline-alert"><CircleAlert size={16} /><span>An OTP will be sent to your email or phone number to verify your identity.</span></div>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Requesting…" : "Request reset"}</button>
          <div className="auth-links" style={{ justifyContent: "center", marginTop: 16 }}><Link href="/login" style={{ display: "flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} /> Back to sign in</Link></div>
        </> : <>
          {resetToken && <div className="reset-token-box"><strong>Development-only OTP</strong><br />{resetToken}</div>}
          <div className="form-field"><label htmlFor="reset-token">OTP</label><input id="reset-token" required value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Enter the OTP sent to your email or phone" /></div>
          <div className="form-field">
            <label htmlFor="new-password">New password</label>
            <input id="new-password" type="password" required minLength={8} autoComplete="new-password" value={form.newPassword} onChange={(e) => update("newPassword", e.target.value)} />
            {form.newPassword && (() => {
              const strength = getPasswordStrength(form.newPassword);
              return strength && (
                <div style={{ marginTop: 6, fontSize: "0.85rem" }}>
                  <div style={{ height: 4, background: "#e0e0e0", borderRadius: 2, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ height: "100%", width: strength.width, background: strength.color, transition: "all 0.3s" }} />
                  </div>
                  <span style={{ color: strength.color, fontWeight: "bold" }}>{strength.label}</span>
                </div>
              );
            })()}
            <span style={{ fontSize: "0.8rem", color: "#666", marginTop: 4, display: "block" }}>Requires uppercase and numbers. Do not use special characters.</span>
          </div>
          <div className="form-field"><label htmlFor="reset-confirm">Confirm new password</label><input id="reset-confirm" type="password" required minLength={8} autoComplete="new-password" value={form.confirm} onChange={(e) => update("confirm", e.target.value)} /></div>
          <button className="button button-primary" type="submit" disabled={busy}>{busy ? "Updating…" : "Set new password"}</button>
          <div className="auth-links" style={{ justifyContent: "center", marginTop: 16 }}><Link href="/login" style={{ display: "flex", alignItems: "center", gap: 4 }}><ArrowLeft size={14} /> Back to sign in</Link></div>
        </>}
      </form>}

    </section>
  </main></div>;
}

export function ApiSettingsPage({ onBack }: { onBack?: () => void }) {
  const { session } = useAuth();
  const [, setLocation] = useLocation();
  const [url, setUrl] = useState(getApiBaseUrl());
  const [currency, setCurrency] = useState(getDisplayCurrency());
  const [state, setState] = useState<"idle" | "checking" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const back = onBack || (() => setLocation(session?.mode === "demo" && roleFromId(session.roleId) ? `/${roleFromId(session.roleId)}` : "/login"));

  async function check(event?: React.FormEvent) {
    event?.preventDefault(); setError(""); setMessage(""); setState("checking"); setBusy(true);
    saveApiBaseUrl(url);
    try { const data = await checkApiHealth(); setState("ok"); setMessage(typeof data === "string" ? data : "API health endpoint responded successfully."); }
    catch (value) { setState("error"); setError(value instanceof Error ? value.message : "Could not check API health."); }
    finally { setBusy(false); }
  }

  return <div className="settings-page"><main className="settings-card panel">
    <div className="auth-brand" style={{ marginBottom: 22 }}><img src="/brand-icon.svg" alt="" /><span><strong>MediStock</strong><small>pharmacy operations</small></span></div>
    <h1>Connect your pharmacy API</h1>
    <p>Enter the deployed base URL for the ASP.NET API from your GitHub repository. This address is stored in this browser, is not a secret, and is used directly by the dashboard. The API must be reachable from this app and allow its origin in CORS.</p>
    <form className="auth-form" onSubmit={check}>
      <div className="form-field"><label htmlFor="api-url">API base URL</label><input id="api-url" type="url" required placeholder="https://api.your-domain.example" value={url} onChange={(e) => { setUrl(e.target.value); setState("idle"); }} /></div>
      <div className="form-field"><label htmlFor="display-currency">Display currency</label><select id="display-currency" value={currency} onChange={(event) => { const next = event.target.value as typeof currency; setCurrency(next); saveDisplayCurrency(next); }}><option value="PHP">PHP — Philippine peso</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — euro</option></select><span className="cell-secondary">Saved in this browser. The API stores plain numeric amounts without a currency code.</span></div>
      <div className={`settings-check ${state === "ok" ? "ready" : state === "error" ? "failed" : ""}`}>
        <span>{state === "checking" ? <span className="spinner" /> : <Activity size={16} />}</span>
        <span>{state === "ok" ? `Connected: ${message}` : state === "error" ? error : "Health check calls GET /health. Live data still requires a valid JWT and API CORS allowlist."}</span>
      </div>
      {error && state === "error" && <div className="inline-alert error"><CircleAlert size={15} /><span>{error}</span></div>}
      <div className="page-heading-actions" style={{ marginTop: 7 }}>
        <button className="button button-green" type="submit" disabled={busy}>{busy ? "Checking…" : "Save & test connection"}</button>
        <button className="button" type="button" onClick={back}>Back to workspace</button>
      </div>
    </form>
    <div className="inline-alert" style={{ marginTop: 19 }}><ShieldCheck size={16} /><span><strong>Security note</strong>The current API's user-access rules allow broader account management than this UI exposes, and public registration accepts any positive role ID. This UI only sends customer role 3, but that does not secure the API. Do not connect real customer data until the server enforces customer-only public registration, admin-only management, and self-ownership for user, cart, and order data.</span></div>
  </main></div>;
}
