"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";

export default function AdminLogin() {
  const router = useRouter();
  const id = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          message?: string;
        };
        setError(body.message ?? "That password is not right.");
        setBusy(false);
        return;
      }

      setPassword("");
      router.refresh();
    } catch {
      setError("We could not reach the server. Try again.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="nd-display text-[28px]">Moderation</h1>
      <p className="mt-2 text-[14px] text-nd-muted">
        Every submission is reviewed here before it reaches the wall.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label htmlFor={id} className="nd-label">
            Password
          </label>
          <input
            id={id}
            type="password"
            className="nd-field"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${id}-error` : undefined}
          />
        </div>

        {error && (
          <p id={`${id}-error`} role="alert" className="text-[13px] text-nd-accent-2">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="nd-btn nd-btn-primary w-full"
          disabled={busy || !password}
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
