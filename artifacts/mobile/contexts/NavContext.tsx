import React, { createContext, useContext, useState } from "react";

type ActiveSection = "dms" | "server" | "khurk" | "profile";

interface NavContextType {
  activeSection: ActiveSection;
  activeServerId: string | null;
  setActiveSection: (section: ActiveSection) => void;
  setActiveServerId: (id: string | null) => void;
  railHidden: boolean;
  setRailHidden: (hidden: boolean) => void;
}

const NavContext = createContext<NavContextType | null>(null);

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [activeSection, setActiveSection] = useState<ActiveSection>("dms");
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [railHidden, setRailHidden] = useState(false);

  return (
    <NavContext.Provider
      value={{
        activeSection,
        activeServerId,
        setActiveSection,
        setActiveServerId,
        railHidden,
        setRailHidden,
      }}
    >
      {children}
    </NavContext.Provider>
  );
}

export function useNav() {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error("useNav must be used within NavProvider");
  return ctx;
}
