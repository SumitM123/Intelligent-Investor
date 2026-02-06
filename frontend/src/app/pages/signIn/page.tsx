"use client";

import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import { passSignInProps } from "@/app/actions";
declare global {
    interface Window {
        google?: {
            accounts: {
                id: {
                    initialize: (options: {
                        client_id: string;
                        callback: (response: { credential: string }) => void;
                        auto_select?: boolean;
                    }) => void;
                    renderButton: (
                        element: HTMLElement | null,
                        options: {
                            theme?: string;
                            size?: string;
                            type?: string;
                        }
                    ) => void;
                };
            };
        };
    }
}

const decodeJWT = (token: string) => {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
        atob(base64)
            .split("")
            .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
            .join("")
    );
    return JSON.parse(jsonPayload);
};

const SignInPage = () => {
    // State variables might not be necessary
    const [googleID, setGoogleID] = useState(String);
    const [name, setName] = useState(String);
    const [email, setEmail] = useState(String);
    const handleCredentialResponse = useCallback((response: { credential: string }) => {
        console.log("Encoded JWT ID token:", response.credential);
        const payload = decodeJWT(response.credential);
        console.log("Decoded JWT ID token fields:", payload);
        setGoogleID(payload.sub);
        setName(payload.name);
        setEmail(payload.email);
        const formData = new FormData();
        formData.append("Name", payload.name);
        formData.append("googleID", payload.sub);
        formData.append("email", payload.email);
        formData.append("profilePictureURL", payload.picture)
        passSignInProps(formData);
        
    }, []);

    useEffect(() => {
        if (!window.google) {
            return;
        }

        const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
        if (!clientId) {
            console.warn("Missing NEXT_PUBLIC_GOOGLE_CLIENT_ID");
            return;
        }

        window.google.accounts.id.initialize({
            client_id: clientId,
            callback: handleCredentialResponse,
            auto_select: false,
        });

        window.google.accounts.id.renderButton(document.getElementById("googleSignInDiv"), {
            theme: "outline",
            size: "large",
            type: "standard",
        });
    }, [handleCredentialResponse]);

    return (
        <>
            <Script src="https://accounts.google.com/gsi/client" async defer />
            <main>
                <h1>Sign in Page</h1>
                <div id="googleSignInDiv" />
            </main>
        </>
    );
};

export default SignInPage;