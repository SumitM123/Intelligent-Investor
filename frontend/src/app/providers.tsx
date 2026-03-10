"use client";

import { ReactNode } from "react";
import { UserContextProvider } from "./context/UserContext";
// This is for global contexts
export default function Providers({ children }: { children: ReactNode }) {
  return <UserContextProvider>{children}</UserContextProvider>;
}
