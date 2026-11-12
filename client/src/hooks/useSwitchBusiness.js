import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function useSwitchBusiness() {
  const { business, switchBusiness } = useAuth();
  const navigate = useNavigate();
  const currentId = business?.id ?? null;
  return useCallback(
    async (businessId) => {
      if (businessId === currentId) return true;
      navigate("/", { replace: true });
      return switchBusiness(businessId);
    },
    [currentId, navigate, switchBusiness],
  );
}
