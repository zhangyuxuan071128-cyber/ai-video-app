import { useCallback, useEffect, useState } from "react";
import { displayError } from "./api";
import type { ResourceState } from "./types";

export function useResource<T>(
  loader: () => Promise<T>,
  initialData: T,
  dependencies: ReadonlyArray<unknown>,
) {
  const [state, setState] = useState<ResourceState<T>>({
    status: "idle",
    data: initialData,
    error: "",
  });
  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => setReloadToken((value) => value + 1), []);

  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, status: "loading", error: "", errorCode: undefined }));
    loader()
      .then((data) => {
        if (active) setState({ status: "success", data, error: "" });
      })
      .catch((error: unknown) => {
        if (!active) return;
        const detail = displayError(error);
        setState((current) => ({ ...current, status: "error", error: detail.message, errorCode: detail.code }));
      });
    return () => { active = false; };
    // The caller owns dependency stability; reloadToken is always included.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...dependencies, reloadToken]);

  return { ...state, reload, setState };
}
