import { useState, useContext, createContext, Dispatch, SetStateAction, ReactNode } from 'react';
interface UserContextValue {
    userID: string;
    setUserID: Dispatch<SetStateAction<string>>;
}
export const UserContext = createContext<UserContextValue | null>(null);
export function useUserContext () {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error("useUserContext must be used within a UserContextProvider");
    }
    return context;
}
export function UserContextProvider({ children } : {children: ReactNode}) {
    const [userID, setUserID] = useState("No value");

    const value = { userID, setUserID };

    return (
        <UserContext.Provider value={value}> 
            {children} 
        </UserContext.Provider>
    );
}