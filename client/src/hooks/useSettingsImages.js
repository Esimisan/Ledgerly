import { useCallback, useEffect, useRef, useState } from "react";
import { prepareImage, signedImageUrl } from "../lib/settingsImages";

export function useSignedUrl(bucket, path) {
  const [state, setState] = useState({ key: null, url: "" });
  const key = path ? `${bucket}/${path}` : null;
  useEffect(() => {
    if (!key) return undefined;
    let cancelled = false;
    signedImageUrl(bucket, path).then((url) => {
      if (!cancelled) setState({ key, url });
    });
    return () => {
      cancelled = true;
    };
  }, [bucket, path, key]);
  return key && state.key === key ? state.url : "";
}

const EMPTY = { blob: null, ext: "", url: "", removed: false, error: "" };

// A picture the person has chosen (or asked to remove) but not saved yet.
export function useImageDraft(maxSide = 512) {
  const [state, setState] = useState(EMPTY);
  const urlRef = useRef("");

  const revoke = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }, []);
  useEffect(() => revoke, [revoke]);

  const pick = useCallback(
    async (file) => {
      const res = await prepareImage(file, maxSide);
      if (res.error) {
        setState((s) => ({ ...s, error: res.error }));
        return;
      }
      revoke();
      urlRef.current = URL.createObjectURL(res.blob);
      setState({
        blob: res.blob,
        ext: res.ext,
        url: urlRef.current,
        removed: false,
        error: "",
      });
    },
    [maxSide, revoke],
  );
  const remove = useCallback(() => {
    revoke();
    setState({ ...EMPTY, removed: true });
  }, [revoke]);
  const reset = useCallback(() => {
    revoke();
    setState(EMPTY);
  }, [revoke]);

  return { ...state, pick, remove, reset };
}
