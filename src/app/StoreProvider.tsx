"use client";
import { AppStore, makeStore } from "@/lib/store";
import { ReactNode, useEffect, useRef } from "react";
import { Provider } from "react-redux";
import { setupListeners } from "@reduxjs/toolkit/query";

interface Props {
  readonly children: ReactNode;
}

export const StoreProvider = ({ children }: Props) => {
  const storeRef = useRef<AppStore | null>(null);

  if (!storeRef.current) {
    // Create the store instance the first time this renders
    storeRef.current = makeStore();
  }

  // eslint-disable-next-line consistent-return
  useEffect(() => {
    if (storeRef.current !== null) {
      /*
       * Configure listeners using the provided defaults
       * optional, but required for `refetchOnFocus`/`refetchOnReconnect`
       * behaviors
       */
      const unsubscribe = setupListeners(storeRef.current.dispatch);
      return unsubscribe;
    }
  }, []);

  return <Provider store={storeRef.current}>{children}</Provider>;
};
