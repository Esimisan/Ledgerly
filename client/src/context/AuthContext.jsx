import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "../lib/supabase";
import {
  canSwitchTo,
  chooseActive,
  readRemembered,
  writeRemembered,
} from "../lib/activeBusiness";
import {
  fetchBusinessRow,
  fetchRolePermissions,
  listMyBusinesses,
} from "../data/businesses";
import { clearProductImageCache } from "../lib/productImages";

const AuthContext = createContext(null);
const NO_MEMBERSHIPS = { userId: null, list: [] };
const NO_ACTIVE = {
  userId: null,
  businessId: null,
  business: null,
  role: null,
  permissions: [],
};
const NO_PERMISSIONS = [];

// Business row + permissions of ONE membership. The owner passes every check, so nothing to fetch for them.
async function loadDetails(membership) {
  const [biz, perms] = await Promise.all([
    fetchBusinessRow(membership.businessId),
    membership.role === "owner"
      ? Promise.resolve({ data: [], error: "" })
      : fetchRolePermissions(membership.businessId, membership.role),
  ]);
  const error = biz.error || perms.error;
  if (error || !biz.data)
    return { error: error || "Could not load this business." };
  return { error: "", business: biz.data, permissions: perms.data };
}

// Memberships plus the details of the business to open (the preferred one if it is still active).
async function loadAll(userId, preferredId) {
  const res = await listMyBusinesses();
  if (res.error) return { error: res.error, list: [], active: null };
  const pick = chooseActive(res.data, preferredId);
  if (!pick) return { error: "", list: res.data, active: null };
  const d = await loadDetails(pick);
  if (d.error) return { error: d.error, list: res.data, active: null };
  return {
    error: "",
    list: res.data,
    active: {
      userId,
      businessId: pick.businessId,
      business: d.business,
      role: pick.role,
      permissions: d.permissions,
    },
  };
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = still resolving
  const [membershipState, setMembershipState] = useState(NO_MEMBERSHIPS);
  const [activeState, setActiveState] = useState(NO_ACTIVE);
  const [switching, setSwitching] = useState(false);
  const [loadError, setLoadError] = useState("");
  const requestRef = useRef(0); // bumped by every load that may change the active business, and on sign-out
  const activeIdRef = useRef(null);
  const membershipsRef = useRef([]);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  // Swaps memberships and the active business together, so old and new are never paired.
  const commit = useCallback((forUser, list, active) => {
    const nextId = active?.businessId ?? null;
    if (activeIdRef.current !== nextId) clearProductImageCache();
    activeIdRef.current = nextId;
    membershipsRef.current = list;
    setMembershipState({ userId: forUser, list });
    setActiveState(active ?? { ...NO_ACTIVE, userId: forUser });
    setSwitching(false);
  }, []);

  // 1) Session. The listener only stores the session: no awaited Supabase calls in here.
  useEffect(() => {
    const apply = (next) => {
      setSession(next);
      if (!next) {
        requestRef.current += 1; // drop anything still loading
        activeIdRef.current = null;
        membershipsRef.current = [];
        clearProductImageCache();
        setMembershipState(NO_MEMBERSHIPS);
        setActiveState(NO_ACTIVE);
        setSwitching(false);
        setLoadError("");
      }
    };
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) =>
      apply(next),
    );
    return () => data.subscription.unsubscribe();
  }, []);

  // 2) First load for this user: memberships, then the remembered business if still active.
  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    requestRef.current += 1;
    const token = requestRef.current;
    loadAll(userId, readRemembered(userId)).then(({ error, list, active }) => {
      if (cancelled || token !== requestRef.current) return;
      setLoadError(error);
      commit(userId, list, active);
      if (active) writeRemembered(userId, active.businessId);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, commit]);

  // Derived, so nothing is reset inside an effect. Data of another user never counts.
  const memberships =
    userId && membershipState.userId === userId ? membershipState.list : null;
  const active =
    userId && activeState.userId === userId && activeState.businessId
      ? activeState
      : null;
  const activeRole = active?.role ?? null;
  const isOwnerRole = activeRole === "owner";
  const permList = active?.permissions ?? NO_PERMISSIONS;

  let status;
  if (session === undefined) status = "loading";
  else if (!session) status = "signedOut";
  else if (memberships === null) status = "loading";
  else if (!active) status = "needsBusiness";
  else status = "ready";

  const permissionSet = useMemo(() => new Set(permList), [permList]);
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

  // Loads the target business first, then swaps. Returns true when the switch happened.
  const switchBusiness = useCallback(
    async (businessId) => {
      const list = membershipsRef.current;
      if (!userId || !canSwitchTo(list, businessId)) return false;
      if (businessId === activeIdRef.current) return true;
      const membership = list.find((m) => m.businessId === businessId);
      requestRef.current += 1;
      const token = requestRef.current;
      setSwitching(true);
      const d = await loadDetails(membership);
      if (token !== requestRef.current) return false; // superseded, or signed out
      if (d.error) {
        setSwitching(false);
        setLoadError(d.error);
        return false;
      }
      commit(userId, list, {
        userId,
        businessId,
        business: d.business,
        role: membership.role,
        permissions: d.permissions,
      });
      writeRemembered(userId, businessId);
      return true;
    },
    [userId, commit],
  );

  // Reloads memberships and the active business row (for example after settings change).
  // With preferredId, that business becomes active in the same step (new business, accepted invitation).
  // A reload that loses a race with a switch is dropped. Returns true when it was applied.
  const refreshMemberships = useCallback(
    async (preferredId) => {
      if (!userId) return false;
      const startId = activeIdRef.current;
      const startToken = requestRef.current;
      const {
        error,
        list,
        active: next,
      } = await loadAll(userId, preferredId ?? startId);
      if (error) {
        setLoadError(error);
        return false;
      }
      if (startToken !== requestRef.current || activeIdRef.current !== startId)
        return false;
      commit(userId, list, next);
      if (next) writeRemembered(userId, next.businessId);
      return true;
    },
    [userId, commit],
  );

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
      await refreshMemberships(data); // the new business becomes the active one
      if (activeIdRef.current !== data)
        throw new Error(
          "Your business was created, but it could not be opened. Refresh the page to continue.",
        );
      return data;
    },
    [refreshMemberships],
  );

  const value = useMemo(
    () => ({
      status,
      loadError,
      switching,
      session,
      user,
      memberships: memberships ?? [],
      business: active?.business ?? null,
      role: activeRole,
      isOwner: isOwnerRole,
      permissions: permList,
      can,
      signUp,
      signIn,
      signOut,
      switchBusiness,
      createBusiness,
      refreshMemberships,
    }),
    [
      status,
      loadError,
      switching,
      session,
      user,
      memberships,
      active,
      activeRole,
      isOwnerRole,
      permList,
      can,
      signUp,
      signIn,
      signOut,
      switchBusiness,
      createBusiness,
      refreshMemberships,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
