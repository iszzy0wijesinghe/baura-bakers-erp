import {
  useState,
} from "react";

import type {
  FormEvent,
} from "react";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  LogIn,
  RefreshCw,
  UserRound,
} from "lucide-react";

import {
  API_BASE_URL,
} from "../../lib/api";

import {
  useToast,
} from "../../ui/ToastProvider";

type LoginResponse = {
  token: string;

  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
};

export function PosLoginPage() {
  const toast =
    useToast();

  const [
    email,
    setEmail,
  ] =
    useState("");

  const [
    password,
    setPassword,
  ] =
    useState("");

  const [
    showPassword,
    setShowPassword,
  ] =
    useState(false);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(false);

  async function submit(
    event:
      FormEvent,
  ) {
    event.preventDefault();

    if (
      !email.trim() ||
      !password
    ) {
      toast.info(
        "Login required",
        "Enter your email and password.",
      );

      return;
    }

    setIsLoading(
      true,
    );

    try {
      const response =
        await fetch(
          `${API_BASE_URL}/auth/login`,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",
            },

            body:
              JSON.stringify(
                {
                  email:
                    email.trim(),

                  password,
                },
              ),
          },
        );

      const data =
        (await response
          .json()
          .catch(
            () =>
              null,
          )) as
          | LoginResponse
          | {
              message?: string;
            }
          | null;

      if (
        !response.ok
      ) {
        throw new Error(
          data &&
          "message" in
            data
            ? data.message ||
                "Login failed."
            : "Login failed.",
        );
      }

      if (
        !data ||
        !(
          "token" in
          data
        ) ||
        !data.token
      ) {
        throw new Error(
          "Login response did not contain an access token.",
        );
      }

      localStorage.setItem(
        "baura_token",
        data.token,
      );

      window.location.href =
        "/pos";
    } catch (
      error
    ) {
      toast.error(
        "Unable to sign in",
        error instanceof
          Error
          ? error.message
          : "Login failed.",
      );
    } finally {
      setIsLoading(
        false,
      );
    }
  }

  return (
    <main className="flex min-h-screen bg-[#f7f6f2]">
      <section className="hidden flex-1 items-end overflow-hidden bg-bauraPrimary p-12 lg:flex">
        <div className="max-w-lg">
          <div className="mb-8 flex h-14 w-14 items-center justify-center rounded-[18px] bg-white text-[18px] font-bold text-bauraPrimary">
            B
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
            Baura Point of Sale
          </p>

          <h1 className="mt-4 text-[42px] font-bold leading-[1.08] tracking-[-0.05em] text-white">
            Simple checkout.
            <br />
            Connected operations.
          </h1>

          <p className="mt-5 max-w-md text-[12px] leading-6 text-white/60">
            Sales, Bakery Stock and customer information connected through the Baura platform.
          </p>
        </div>
      </section>

      <section className="flex w-full items-center justify-center bg-white px-6 lg:w-[520px]">
        <div className="w-full max-w-[350px]">
          <div className="mb-9 lg:hidden">
            <div className="flex h-12 w-12 items-center justify-center rounded-[15px] bg-bauraPrimary font-bold text-white">
              B
            </div>
          </div>

          <p className="text-[9px] font-bold uppercase tracking-[0.13em] text-bauraGoldDark">
            Baura POS
          </p>

          <h2 className="mt-2 text-[27px] font-bold tracking-[-0.045em] text-bauraInk">
            Welcome back
          </h2>

          <p className="mt-2 text-[10px] leading-5 text-bauraMuted">
            Sign in with your authorized Baura staff account to open the point of sale.
          </p>

          <form
            onSubmit={
              submit
            }
            className="mt-8 space-y-4"
          >
            <label className="block">
              <span className="mb-1.5 block text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                Email
              </span>

              <div className="flex h-12 items-center gap-3 rounded-xl border border-black/[0.08] bg-[#fafaf8] px-4 focus-within:border-bauraGold focus-within:bg-white">
                <UserRound
                  size={15}
                  className="text-bauraMuted"
                />

                <input
                  type="email"
                  autoComplete="username"
                  value={
                    email
                  }
                  onChange={(
                    event,
                  ) =>
                    setEmail(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder="name@baura.lk"
                  className="w-full bg-transparent text-[11px] font-medium outline-none"
                />
              </div>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-[8px] font-bold uppercase tracking-[0.08em] text-bauraMuted">
                Password
              </span>

              <div className="flex h-12 items-center gap-3 rounded-xl border border-black/[0.08] bg-[#fafaf8] px-4 focus-within:border-bauraGold focus-within:bg-white">
                <LockKeyhole
                  size={15}
                  className="text-bauraMuted"
                />

                <input
                  type={
                    showPassword
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  value={
                    password
                  }
                  onChange={(
                    event,
                  ) =>
                    setPassword(
                      event
                        .target
                        .value,
                    )
                  }
                  placeholder="Password"
                  className="min-w-0 flex-1 bg-transparent text-[11px] font-medium outline-none"
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPassword(
                      (
                        current,
                      ) =>
                        !current,
                    )
                  }
                  className="text-bauraMuted"
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
              disabled={
                isLoading
              }
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-bauraPrimary text-[10px] font-bold text-white shadow-bauraButton transition hover:bg-bauraPrimaryDark disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <RefreshCw
                    size={14}
                    className="animate-spin"
                  />

                  Signing in...
                </>
              ) : (
                <>
                  <LogIn
                    size={14}
                  />

                  Open POS
                </>
              )}
            </button>
          </form>

          <p className="mt-8 text-center text-[8px] leading-4 text-bauraMuted">
            Access is restricted to authorized Baura staff.
          </p>
        </div>
      </section>
    </main>
  );
}