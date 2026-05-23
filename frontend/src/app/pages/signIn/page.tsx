"use client";

import Script from "next/script";
import { useCallback, useEffect } from "react";
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

const SignInPage = () => {
    const handleCredentialResponse = useCallback(async (response: { credential: string }) => {
        const formData = new FormData();
        formData.append("credential", response.credential);
        await passSignInProps(formData);
    }, []);

    const initGoogleButton = useCallback(() => {
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

    useEffect(() => {
        initGoogleButton();
    }, [initGoogleButton]);

    return (
        <>
            <Script src="https://accounts.google.com/gsi/client" async defer onLoad={initGoogleButton} />
            <main>
                <h1>Sign in Page</h1>
                <div id="googleSignInDiv" />
            </main>
        </>
    );
};

export default SignInPage;
