import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "../lib/supabase";

const AuthContext = createContext(null);
const ACTIVE_KEY = "ledgerly-active-business";

const readActive = () => {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
};

// Active memberships for a user, with the business row embedded. RLS limits what comes back.
async function fetchMemberships(userId) {
  const { data, error } = await supabase
    .from("business_members")
    .select("business_id, role, status, businesses(*)")
    .eq("user_id", userId)
    .eq("status", "active");
  if (error) return { list: [], error: error.message };
  const list = (data ?? [])
    .filter((m) => m.businesses)
    .map((m) => ({
      businessId: m.business_id,
      role: m.role,
      business: m.businesses,
    }));
  return { list, error: "" };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still resolving
  const [memberships, setMemberships] = useState(null); // null = not loaded yet
  const [activeId, setActiveId] = useState(readActive);
  const [permState, setPermState] = useState({ key: null, list: [] });
  const [loadError, setLoadError] = useState("");

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  // 1) Session. The listener only stores the session: no awaited Supabase calls in here.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      setSession(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  // 2) Memberships, keyed on the user id (token refreshes don't retrigger this).
  useEffect(() => {
    if (!userId) {
      setMemberships(null);
      return;
    }
    let cancelled = false;
    setMemberships(null);
    fetchMemberships(userId).then(({ list, error }) => {
      if (cancelled) return;
      setLoadError(error);
      setMemberships(list);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // 3) Active membership: the remembered one if still valid, otherwise the first.
  const active = useMemo(
    () =>
      memberships?.find((m) => m.businessId === activeId) ??
      memberships?.[0] ??
      null,
    [memberships, activeId],
  );
  const activeBusinessId = active?.businessId ?? null;
  const activeRole = active?.role ?? null;
  const permKey = active ? `${activeBusinessId}:${activeRole}` : null;

  // 4) Permissions for that role. The owner passes every check, so nothing to fetch.
  useEffect(() => {
    if (!activeBusinessId) return;
    if (activeRole === "owner") {
      setPermState({ key: permKey, list: [] });
      return;
    }
    let cancelled = false;
    supabase
      .from("role_permissions")
      .select("permission")
      .eq("business_id", activeBusinessId)
      .eq("role", activeRole)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setLoadError(error.message);
        setPermState({
          key: permKey,
          list: (data ?? []).map((r) => r.permission),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [activeBusinessId, activeRole, permKey]);

  let status;
  if (session === undefined) status = "loading";
  else if (!session) status = "signedOut";
  else if (memberships === null) status = "loading";
  else if (!active) status = "needsBusiness";
  else if (permState.key !== permKey) status = "loading";
  else status = "ready";

  const permissionSet = useMemo(
    () => new Set(permState.list),
    [permState.list],
  );
  const can = useCallback(
    (permission) => activeRole === "owner" || permissionSet.has(permission),
    [activeRole, permissionSet],
  );

  const signUp = useCallback(async ({ fullName, email, password }) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }, // the profiles trigger reads this
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });
    if (error) throw error;
    // With email confirmation on, an already-registered email returns a user with no identities.
    if (data.user && data.user.identities?.length === 0)
      throw new Error(
        "An account with this email already exists. Try signing in.",
      );
    return { needsConfirmation: !data.session };
  }, []);

  const signIn = useCallback(async ({ email, password }) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) throw error;
  }, []);

  const signOut = useCallback(() => supabase.auth.signOut(), []);

  const switchBusiness = useCallback((businessId) => {
    try {
      localStorage.setItem(ACTIVE_KEY, businessId);
    } catch {
      /* ignore */
    }
    setActiveId(businessId);
  }, []);

  const createBusiness = useCallback(
    async ({ name, phone, currencyCode, currencySymbol, timezone }) => {
      const { data, error } = await supabase.rpc("create_business", {
        p_name: name,
        p_phone: phone || null,
        p_currency_code: currencyCode,
        p_currency_symbol: currencySymbol,
        p_timezone: timezone,
      });
      if (error) throw error;
      const { list } = await fetchMemberships(userId); // pick up the new owner membership
      try {
        localStorage.setItem(ACTIVE_KEY, data);
      } catch {}
      setActiveId(data);
      setMemberships(list);
      return data;
    },
    [userId],
  );

  const value = useMemo(
    () => ({
      status,
      loadError,
      session,
      user,
      memberships: memberships ?? [],
      business: active?.business ?? null,
      role: activeRole,
      isOwner: activeRole === "owner",
      permissions: permState.list,
      can,
      signUp,
      signIn,
      signOut,
      switchBusiness,
      createBusiness,
    }),
    [
      status,
      loadError,
      session,
      user,
      memberships,
      active,
      activeRole,
      permState.list,
      can,
      signUp,
      signIn,
      signOut,
      switchBusiness,
      createBusiness,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
