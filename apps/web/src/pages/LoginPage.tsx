import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { login, user } = useAuth();

  const [email, setEmail] = useState("admin@baura.local");
  const [password, setPassword] = useState("Admin@123");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      await login(email, password);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bauraCream px-6 text-bauraBrown">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-bauraBrown/10 bg-bauraSoft shadow-xl md:grid-cols-[1fr_0.9fr]">
        <section className="p-8 md:p-10">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-bauraGold">
            Baura Bakery ERP
          </p>
          <h1 className="mt-3 text-3xl font-bold md:text-4xl">
            Login to your bakery system
          </h1>
          <p className="mt-3 max-w-md text-sm leading-6 text-bauraBrown/65">
            Manage POS sales, ingredients, carter inventory, FIFO costing,
            product recipes, analytics and reports.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Email</span>
              <div className="flex items-center gap-3 rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3">
                <Mail size={18} className="text-bauraBrown/45" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  placeholder="admin@baura.local"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-semibold">Password</span>
              <div className="flex items-center gap-3 rounded-2xl border border-bauraBrown/10 bg-white px-4 py-3">
                <LockKeyhole size={18} className="text-bauraBrown/45" />
                <input
                  className="w-full bg-transparent text-sm outline-none"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  placeholder="Password"
                />
              </div>
            </label>

            {error && (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              disabled={isSubmitting}
              className="w-full rounded-2xl bg-bauraBrown px-5 py-3 text-sm font-bold text-bauraCream disabled:opacity-60"
            >
              {isSubmitting ? "Signing in..." : "Login"}
            </button>
          </form>
        </section>

        <section className="hidden bg-bauraBrown p-10 text-bauraCream md:block">
          <div className="flex h-full flex-col justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.25em] text-bauraGold">
                Local First
              </p>
              <h2 className="mt-3 text-3xl font-bold">
                Built for daily bakery operations
              </h2>
              <p className="mt-4 text-sm leading-6 text-bauraCream/70">
                Your POS and inventory will use the same backend, so every sale
                can deduct ingredients and calculate profit correctly.
              </p>
            </div>

            <div className="rounded-3xl bg-white/10 p-5">
              <p className="text-sm text-bauraCream/70">Default login</p>
              <p className="mt-2 font-semibold">admin@baura.local</p>
              <p className="font-semibold">Admin@123</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}