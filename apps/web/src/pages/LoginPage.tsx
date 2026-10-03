import { useState } from "react";
import type { FormEvent } from "react";
import {
  Navigate,
  useNavigate
} from "react-router-dom";
import {
  Boxes,
  ChartNoAxesCombined,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  PackageCheck,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../ui/ToastProvider";

const BAURA_LOGO =
  "/images/logos/logo.webp";

export function LoginPage() {
  const navigate =
    useNavigate();

  const {
    login,
    user
  } = useAuth();

  const toast =
    useToast();

  const [
    email,
    setEmail
  ] = useState("");

  const [
    password,
    setPassword
  ] = useState("");

  const [
    showPassword,
    setShowPassword
  ] = useState(false);

  const [
    isSubmitting,
    setIsSubmitting
  ] = useState(false);

  if (user) {
    return (
      <Navigate
        to="/dashboard"
        replace
      />
    );
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (isSubmitting) {
      return;
    }

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (!normalizedEmail) {
      toast.warning(
        "Email required",
        "Enter your Baura ERP email address."
      );

      return;
    }

    if (!password) {
      toast.warning(
        "Password required",
        "Enter your account password."
      );

      return;
    }

    setIsSubmitting(true);

    try {
      await login(
        normalizedEmail,
        password
      );

      toast.success(
        "Welcome back",
        "Your Baura ERP session is ready."
      );

      navigate(
        "/dashboard",
        {
          replace: true
        }
      );
    } catch (error) {
      toast.error(
        "Sign in failed",
        error instanceof Error
          ? error.message
          : "Unable to sign in."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#F7F2E8]">
      <div
        aria-hidden="true"
        className="absolute -left-52 -top-64 h-[600px] w-[600px] rounded-full bg-[#D8C59C]/20 blur-[100px]"
      />

      <div
        aria-hidden="true"
        className="absolute -bottom-72 -right-48 h-[650px] w-[650px] rounded-full bg-[#B99A65]/15 blur-[110px]"
      />

      <div className="relative flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid w-full max-w-[1040px] overflow-hidden rounded-[28px] border border-[#DED3BF] bg-[#FFFCF6] shadow-[0_30px_90px_rgba(60,40,24,0.12)] lg:min-h-[650px] lg:grid-cols-[0.94fr_1.06fr]">

          {/* LEFT BRAND PANEL */}
          <aside className="relative hidden overflow-hidden bg-[#352316] p-10 text-[#FFF9ED] lg:flex lg:flex-col">
            <div
              aria-hidden="true"
              className="absolute -right-28 -top-28 h-[330px] w-[330px] rounded-full border border-[#C9A96E]/15"
            />

            <div
              aria-hidden="true"
              className="absolute -right-8 -top-6 h-[220px] w-[220px] rounded-full bg-[#C9A96E]/[0.06]"
            />

            <div
              aria-hidden="true"
              className="absolute bottom-[-170px] left-[-130px] h-[380px] w-[380px] rounded-full bg-[#C9A96E]/[0.06]"
            />

            <div className="relative z-10">
              <div className="inline-flex rounded-2xl bg-[#FFF9ED] px-5 py-3 shadow-[0_12px_35px_rgba(0,0,0,0.12)]">
                <img
                  src={BAURA_LOGO}
                  alt="Baura"
                  className="h-auto w-[125px] object-contain"
                />
              </div>

              <p className="mt-4 text-[9px] font-semibold uppercase tracking-[0.22em] text-[#CDB98E]">
                Bakery Management System
              </p>
            </div>

            <div className="relative z-10 my-auto max-w-[360px]">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#C9A96E]/20 bg-[#C9A96E]/10 text-[#D8BB82]">
                <Sparkles
                  size={18}
                />
              </div>

              <h1 className="mt-6 text-[35px] font-semibold leading-[1.17] tracking-[-0.045em] text-[#FFF9ED]">
                Everything behind the bakery, connected.
              </h1>

              <p className="mt-4 max-w-[325px] text-[11px] leading-6 text-[#D5C8B8]">
                Manage ingredients, production, finished stock,
                sales and day-to-day bakery operations from one
                connected Baura workspace.
              </p>

              <div className="mt-8 grid grid-cols-3 gap-2.5">
                <Feature
                  icon={
                    <Boxes size={15} />
                  }
                  title="Inventory"
                />

                <Feature
                  icon={
                    <PackageCheck size={15} />
                  }
                  title="Production"
                />

                <Feature
                  icon={
                    <ChartNoAxesCombined size={15} />
                  }
                  title="Insights"
                />
              </div>
            </div>

            <div className="relative z-10 flex items-center gap-2 text-[9px] font-medium text-[#BFAF9A]">
              <ShieldCheck
                size={14}
                className="text-[#D1B477]"
              />

              <span>
                Secure access for authorized Baura staff
              </span>
            </div>
          </aside>

          {/* LOGIN PANEL */}
          <section className="flex min-h-[620px] items-center bg-[#FFFCF6] px-6 py-10 sm:px-10 lg:px-14">
            <div className="mx-auto w-full max-w-[390px]">

              {/* MOBILE LOGO */}
              <div className="mb-9 lg:hidden">
                <div className="inline-flex rounded-2xl border border-[#E5DAC7] bg-white px-4 py-3 shadow-sm">
                  <img
                    src={BAURA_LOGO}
                    alt="Baura"
                    className="h-auto w-[112px] object-contain"
                  />
                </div>

                <p className="mt-3 text-[9px] font-semibold uppercase tracking-[0.2em] text-[#9D8357]">
                  Bakery Management System
                </p>
              </div>

              <div className="inline-flex items-center gap-2 rounded-full border border-[#E3D7C2] bg-[#F8F1E4] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#9B7B48]" />

                <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-[#80643D]">
                  Staff Access
                </span>
              </div>

              <h2 className="mt-5 text-[32px] font-semibold tracking-[-0.045em] text-[#352316]">
                Welcome back
              </h2>

              <p className="mt-2 max-w-[340px] text-[11px] leading-5 text-[#8C8176]">
                Sign in with your staff account to continue to
                Baura's management workspace.
              </p>

              <form
                onSubmit={handleSubmit}
                className="mt-8"
              >
                <label className="block">
                  <span className="mb-2 block text-[10px] font-semibold text-[#4B382B]">
                    Email address
                  </span>

                  <div className="flex h-[50px] items-center gap-3 rounded-xl border border-[#DED3C2] bg-white px-4 transition focus-within:border-[#9B7B48] focus-within:ring-4 focus-within:ring-[#9B7B48]/[0.08]">
                    <Mail
                      size={16}
                      className="shrink-0 text-[#A39688]"
                    />

                    <input
                      type="email"
                      value={email}
                      onChange={(event) =>
                        setEmail(
                          event.target.value
                        )
                      }
                      autoComplete="username"
                      placeholder="name@baura.lk"
                      disabled={isSubmitting}
                      className="h-full w-full bg-transparent text-[11px] font-medium text-[#352316] outline-none placeholder:text-[#B8AEA3]"
                    />
                  </div>
                </label>

                <label className="mt-4 block">
                  <span className="mb-2 block text-[10px] font-semibold text-[#4B382B]">
                    Password
                  </span>

                  <div className="flex h-[50px] items-center gap-3 rounded-xl border border-[#DED3C2] bg-white px-4 transition focus-within:border-[#9B7B48] focus-within:ring-4 focus-within:ring-[#9B7B48]/[0.08]">
                    <LockKeyhole
                      size={16}
                      className="shrink-0 text-[#A39688]"
                    />

                    <input
                      type={
                        showPassword
                          ? "text"
                          : "password"
                      }
                      value={password}
                      onChange={(event) =>
                        setPassword(
                          event.target.value
                        )
                      }
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      disabled={isSubmitting}
                      className="h-full w-full bg-transparent text-[11px] font-medium text-[#352316] outline-none placeholder:text-[#B8AEA3]"
                    />

                    <button
                      type="button"
                      aria-label={
                        showPassword
                          ? "Hide password"
                          : "Show password"
                      }
                      onClick={() =>
                        setShowPassword(
                          (current) =>
                            !current
                        )
                      }
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9A8D80] transition hover:bg-[#F5EEE3] hover:text-[#5B412C]"
                    >
                      {showPassword ? (
                        <EyeOff
                          size={15}
                        />
                      ) : (
                        <Eye
                          size={15}
                        />
                      )}
                    </button>
                  </div>
                </label>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-6 flex h-[50px] w-full items-center justify-center gap-2 rounded-xl bg-[#3A2719] text-[11px] font-semibold text-[#FFF9ED] shadow-[0_10px_25px_rgba(58,39,25,0.18)] transition hover:bg-[#493121] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55"
                >
                  {isSubmitting
                    ? "Signing in..."
                    : "Sign in to Baura ERP"}
                </button>
              </form>

              <div className="mt-8 border-t border-[#E6DCCE] pt-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[9px] font-semibold text-[#594638]">
                      Baura ERP
                    </p>

                    <p className="mt-0.5 text-[8px] text-[#A0958B]">
                      Internal management system
                    </p>
                  </div>

                  <div className="flex items-center gap-2 rounded-full bg-[#EDF6EC] px-3 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#63985F]" />

                    <span className="text-[8px] font-semibold text-[#567D52]">
                      Secure system
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function Feature({
  icon,
  title
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.055] px-3 py-3.5">
      <div className="text-[#D4B97F]">
        {icon}
      </div>

      <p className="mt-2.5 text-[8px] font-semibold text-[#E7DDD0]">
        {title}
      </p>
    </div>
  );
}