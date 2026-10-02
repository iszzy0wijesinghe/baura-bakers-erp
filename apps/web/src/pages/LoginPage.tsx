import {
  useState
} from "react";

import type {
  FormEvent
} from "react";

import {
  Navigate,
  useNavigate
} from "react-router-dom";

import {
  CakeSlice,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  Sparkles
} from "lucide-react";

import {
  useAuth
} from "../auth/AuthContext";

import {
  useToast
} from "../ui/ToastProvider";

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
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      isSubmitting
    ) {
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

    setIsSubmitting(
      true
    );

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
          replace:
            true
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
      setIsSubmitting(
        false
      );
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#F3F6FF] px-5 py-8">
      <div
        aria-hidden="true"
        className="absolute -left-40 -top-40 h-[480px] w-[480px] rounded-full bg-[#DDE5FF]/45 blur-3xl"
      />

      <div
        aria-hidden="true"
        className="absolute -bottom-52 -right-36 h-[520px] w-[520px] rounded-full bg-[#E8D9FF]/55 blur-3xl"
      />

      <div className="relative grid w-full max-w-[1000px] overflow-hidden rounded-[26px] border border-white bg-white shadow-[0_28px_90px_rgba(61,76,130,0.13)] lg:grid-cols-[0.92fr_1.08fr]">
        <aside className="relative hidden overflow-hidden bg-gradient-to-br from-[#6255F6] via-[#7857F4] to-[#A24EEA] p-10 text-white lg:flex lg:min-h-[640px] lg:flex-col">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-20 h-72 w-72 rounded-full border border-white/10"
          />

          <div
            aria-hidden="true"
            className="absolute right-5 top-8 h-48 w-48 rounded-full bg-white/[0.05]"
          />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/15 backdrop-blur">
              <CakeSlice
                size={
                  21
                }
              />
            </div>

            <div>
              <p className="text-[16px] font-bold tracking-[-0.03em]">
                Baura ERP
              </p>

              <p className="mt-0.5 text-[8px] font-medium uppercase tracking-[0.18em] text-white/60">
                Bakery Operations
              </p>
            </div>
          </div>

          <div className="relative my-auto max-w-[340px]">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
              <Sparkles
                size={
                  18
                }
              />
            </div>

            <h1 className="mt-5 text-[34px] font-semibold leading-[1.2] tracking-[-0.045em]">
              Smarter bakery operations in one workspace.
            </h1>

            <p className="mt-4 text-[10px] leading-6 text-white/68">
              Manage ingredients, production, finished bakery stock, POS sales and business performance from one connected ERP.
            </p>

            <div className="mt-8 grid grid-cols-3 gap-2">
              <SmallFeature
                title="Production"
              />

              <SmallFeature
                title="Inventory"
              />

              <SmallFeature
                title="Sales"
              />
            </div>
          </div>

          <div className="relative flex items-center gap-2 text-[8px] font-medium uppercase tracking-[0.09em] text-white/55">
            <ShieldCheck
              size={
                13
              }
            />

            Authorized staff access
          </div>
        </aside>

        <section className="flex min-h-[600px] items-center px-6 py-10 sm:px-10 lg:px-14">
          <div className="mx-auto w-full max-w-[390px]">
            <div className="lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-bauraPrimary to-[#A24EEA] text-white shadow-bauraButton">
                <CakeSlice
                  size={
                    20
                  }
                />
              </div>

              <p className="mt-3 text-[14px] font-bold text-bauraInk">
                Baura
                <span className="text-bauraPrimary">
                  ERP
                </span>
              </p>
            </div>

            <p className="mt-8 text-[8px] font-semibold uppercase tracking-[0.15em] text-bauraPrimary lg:mt-0">
              Staff Access
            </p>

            <h2 className="mt-2 text-[30px] font-semibold tracking-[-0.045em] text-bauraInk">
              Welcome back
            </h2>

            <p className="mt-2 text-[10px] leading-5 text-bauraMuted">
              Sign in to continue to Baura Bakery's management workspace.
            </p>

            <form
              onSubmit={
                handleSubmit
              }
              className="mt-8"
            >
              <label>
                <span className="erp-label">
                  Email address
                </span>

                <div className="erp-search h-12">
                  <Mail
                    size={
                      16
                    }
                    className="text-bauraMuted"
                  />

                  <input
                    type="email"
                    value={
                      email
                    }
                    onChange={(
                      event
                    ) =>
                      setEmail(
                        event
                          .target
                          .value
                      )
                    }
                    autoComplete="username"
                    placeholder="name@baura.lk"
                    disabled={
                      isSubmitting
                    }
                    className="w-full bg-transparent text-[11px] font-medium text-bauraInk outline-none placeholder:text-bauraMuted2"
                  />
                </div>
              </label>

              <label className="mt-4 block">
                <span className="erp-label">
                  Password
                </span>

                <div className="erp-search h-12">
                  <LockKeyhole
                    size={
                      16
                    }
                    className="text-bauraMuted"
                  />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={
                      password
                    }
                    onChange={(
                      event
                    ) =>
                      setPassword(
                        event
                          .target
                          .value
                      )
                    }
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    disabled={
                      isSubmitting
                    }
                    className="w-full bg-transparent text-[11px] font-medium text-bauraInk outline-none placeholder:text-bauraMuted2"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (
                          current
                        ) =>
                          !current
                      )
                    }
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-bauraMuted transition hover:bg-bauraPrimarySoft hover:text-bauraPrimary"
                  >
                    {showPassword ? (
                      <EyeOff
                        size={
                          15
                        }
                      />
                    ) : (
                      <Eye
                        size={
                          15
                        }
                      />
                    )}
                  </button>
                </div>
              </label>

              <button
                type="submit"
                disabled={
                  isSubmitting
                }
                className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6255F6] to-[#8756F4] text-[11px] font-semibold text-white shadow-bauraButton transition hover:brightness-[0.98] disabled:cursor-not-allowed disabled:opacity-55"
              >
                {isSubmitting
                  ? "Signing in..."
                  : "Sign in to Baura ERP"}
              </button>
            </form>

            <div className="mt-7 flex items-center justify-between border-t border-bauraBorder pt-5">
              <p className="text-[8px] text-bauraMuted">
                Baura Bakery ERP
              </p>

              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-bauraSuccess" />

                <span className="text-[8px] text-bauraMuted">
                  Secure system
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function SmallFeature({
  title
}: {
  title: string;
}) {
  return (
    <div className="rounded-xl bg-white/10 px-3 py-3 backdrop-blur">
      <div className="h-1.5 w-5 rounded-full bg-white/60" />

      <p className="mt-2 text-[8px] font-semibold text-white/75">
        {title}
      </p>
    </div>
  );
}