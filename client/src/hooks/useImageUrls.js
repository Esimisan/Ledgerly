import { useEffect, useState } from "react";
import { signedUrlMap } from "../lib/productImages";

export function useImageUrls(paths) {
  const key = paths.filter(Boolean).join("|");
  const [urls, setUrls] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (!key) {
      Promise.resolve({}).then((empty) => {
        if (!cancelled) setUrls(empty);
      });
    } else {
      signedUrlMap(key.split("|")).then((map) => {
        if (!cancelled) setUrls(map);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [key]);

  return urls;
}
