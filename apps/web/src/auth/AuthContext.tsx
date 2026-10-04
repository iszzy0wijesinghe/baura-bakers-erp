import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  ReactNode,
} from "react";

import {
  apiRequest,
} from "../lib/api";

export type ErpUser = {
  id: string;

  officialSiteUserId:
    number;

  firstName: string;
  lastName: string;
  email: string;

  roleId:
    number | null;

  roleCode:
    string | null;

  roleName:
    string | null;

  permissions:
    string[];

  access: {
    erp: boolean;
    pos: boolean;

    websiteAdmin?:
      boolean;

    website_admin?:
      boolean;
  };

  /**
   * Temporary compatibility only.
   *
   * Do not use this for new authorization
   * decisions.
   */
  roles: string[];
};

type LoginResponse = {
  token: string;
  user: ErpUser;
};

type MeResponse = {
  user: ErpUser;
};

type AuthContextValue = {
  user:
    ErpUser | null;

  token:
    string | null;

  isLoading:
    boolean;

  isAuthenticated:
    boolean;

  permissions:
    string[];

  canAccessErp:
    boolean;

  canAccessPos:
    boolean;

  hasPermission: (
    permission: string,
  ) => boolean;

  hasAnyPermission: (
    permissions: string[],
  ) => boolean;

  hasAllPermissions: (
    permissions: string[],
  ) => boolean;

  login: (
    email: string,
    password: string,
  ) => Promise<void>;

  logout:
    () => void;

  refresh:
    () => Promise<void>;
};

const AuthContext =
  createContext<
    AuthContextValue | null
  >(null);

const TOKEN_STORAGE_KEY =
  "baura_token";

function normalizePermissions(
  value: unknown,
): string[] {
  if (
    !Array.isArray(
      value,
    )
  ) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (
            permission,
          ): permission is string =>
            typeof permission ===
              "string",
        )
        .map(
          (permission) =>
            permission.trim(),
        )
        .filter(Boolean),
    ),
  );
}

function normalizeUser(
  user: ErpUser,
): ErpUser {
  return {
    ...user,

    permissions:
      normalizePermissions(
        user.permissions,
      ),

    roles:
      Array.isArray(
        user.roles,
      )
        ? user.roles.filter(
            (
              role,
            ): role is string =>
              typeof role ===
                "string",
          )
        : [],

    access: {
      erp:
        user.access?.erp ===
        true,

      pos:
        user.access?.pos ===
        true,

      websiteAdmin:
        user.access
          ?.websiteAdmin ===
          true ||
        user.access
          ?.website_admin ===
          true,
    },
  };
}

export function AuthProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [
    user,
    setUser,
  ] =
    useState<
      ErpUser | null
    >(null);

  const [
    token,
    setToken,
  ] =
    useState<
      string | null
    >(() =>
      localStorage.getItem(
        TOKEN_STORAGE_KEY,
      ),
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const clearSession =
    useCallback(() => {
      localStorage.removeItem(
        TOKEN_STORAGE_KEY,
      );

      setToken(
        null,
      );

      setUser(
        null,
      );
    }, []);

  const loadUser =
    useCallback(
      async () => {
        const storedToken =
          localStorage.getItem(
            TOKEN_STORAGE_KEY,
          );

        if (!storedToken) {
          setUser(
            null,
          );

          setToken(
            null,
          );

          return;
        }

        try {
          const data =
            await apiRequest<
              MeResponse
            >(
              "/auth/me",
            );

          const normalizedUser =
            normalizeUser(
              data.user,
            );

          if (
            !normalizedUser
              .permissions
              .includes(
                "erp.access",
              )
          ) {
            clearSession();

            return;
          }

          setToken(
            storedToken,
          );

          setUser(
            normalizedUser,
          );
        } catch {
          clearSession();
        }
      },
      [
        clearSession,
      ],
    );

  useEffect(() => {
    let cancelled =
      false;

    async function initialize() {
      try {
        await loadUser();
      } finally {
        if (
          !cancelled
        ) {
          setIsLoading(
            false,
          );
        }
      }
    }

    void initialize();

    return () => {
      cancelled =
        true;
    };
  }, [
    loadUser,
  ]);

  const login =
    useCallback(
      async (
        email: string,
        password: string,
      ) => {
        const data =
          await apiRequest<
            LoginResponse
          >(
            "/auth/login",
            {
              method:
                "POST",

              body:
                JSON.stringify({
                  email:
                    email
                      .trim()
                      .toLowerCase(),

                  password,
                }),
            },
          );

        const normalizedUser =
          normalizeUser(
            data.user,
          );

        if (
          !normalizedUser
            .permissions
            .includes(
              "erp.access",
            )
        ) {
          throw new Error(
            "This account does not have ERP access.",
          );
        }

        localStorage.setItem(
          TOKEN_STORAGE_KEY,
          data.token,
        );

        setToken(
          data.token,
        );

        setUser(
          normalizedUser,
        );
      },
      [],
    );

  const logout =
    useCallback(() => {
      clearSession();
    }, [
      clearSession,
    ]);

  const refresh =
    useCallback(
      async () => {
        if (
          !localStorage.getItem(
            TOKEN_STORAGE_KEY,
          )
        ) {
          clearSession();

          return;
        }

        await loadUser();
      },
      [
        clearSession,
        loadUser,
      ],
    );

  const permissions =
    useMemo(
      () =>
        user?.permissions ??
        [],
      [
        user,
      ],
    );

  const hasPermission =
    useCallback(
      (
        permission: string,
      ): boolean =>
        permissions.includes(
          permission,
        ),
      [
        permissions,
      ],
    );

  const hasAnyPermission =
    useCallback(
      (
        requiredPermissions:
          string[],
      ): boolean =>
        requiredPermissions.some(
          (
            permission,
          ) =>
            permissions.includes(
              permission,
            ),
        ),
      [
        permissions,
      ],
    );

  const hasAllPermissions =
    useCallback(
      (
        requiredPermissions:
          string[],
      ): boolean =>
        requiredPermissions.every(
          (
            permission,
          ) =>
            permissions.includes(
              permission,
            ),
        ),
      [
        permissions,
      ],
    );

  const value =
    useMemo<
      AuthContextValue
    >(
      () => ({
        user,
        token,
        isLoading,

        isAuthenticated:
          user !== null,

        permissions,

        canAccessErp:
          hasPermission(
            "erp.access",
          ),

        canAccessPos:
          hasPermission(
            "erp.pos.access",
          ),

        hasPermission,
        hasAnyPermission,
        hasAllPermissions,

        login,
        logout,
        refresh,
      }),
      [
        user,
        token,
        isLoading,
        permissions,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        login,
        logout,
        refresh,
      ],
    );

  return (
    <AuthContext.Provider
      value={value}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context =
    useContext(
      AuthContext,
    );

  if (!context) {
    throw new Error(
      "useAuth must be used inside AuthProvider",
    );
  }

  return context;
}