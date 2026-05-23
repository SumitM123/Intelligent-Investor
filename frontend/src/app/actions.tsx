'use server'
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from 'next/headers'

interface GoogleTokenInfo {
    aud: string;
    sub: string;
    name?: string;
    email?: string;
    picture?: string;
}

async function verifyGoogleCredential(credential: string): Promise<GoogleTokenInfo> {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
    if (!res.ok) {
        throw new Error(`Invalid Google credential: ${res.status}`);
    }
    const payload = (await res.json()) as GoogleTokenInfo;
    const expectedAud = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!expectedAud || payload.aud !== expectedAud) {
        throw new Error("Token audience mismatch");
    }
    return payload;
}

export async function passSignInProps(formData: FormData) {
    const credential = formData.get("credential");
    if (typeof credential !== "string" || !credential) {
        throw new Error("Missing Google credential");
    }

    const payload = await verifyGoogleCredential(credential);
    const userName = payload.name ?? "";
    const userEmail = payload.email ?? "";
    const googleID = payload.sub;
    const profilePictureURL = payload.picture ?? "";

    const addUserForm = new FormData();
    addUserForm.append("user_name", userName);
    addUserForm.append("user_email", userEmail);
    addUserForm.append("google_id", googleID);
    const googleAddUser = await fetch("http://backend:8000/api/users/addUser", {
        method: "POST",
        body: addUserForm,
    });
    if (!googleAddUser.ok) {
        throw new Error(`Unable to add user: ${googleAddUser.status}`);
    }

    const addUserData = await googleAddUser.json();
    const userId = addUserData?.user_id as string | undefined;
    if (!userId) {
        throw new Error("Backend did not return user_id");
    }

    const snapTradeRes = await fetch("http://backend:8000/api/snapTrade/addUser", {
        method: "POST",
        headers: {
            Cookie: `user_id=${userId}`,
        },
    });
    if (!snapTradeRes.ok) {
        throw new Error(`SnapTrade addUser failed: ${snapTradeRes.status}`);
    }
    const snapTradeJSON = await snapTradeRes.json();
    const snapTradeID = snapTradeJSON?.snaptrade_id as string | undefined;
    if (!snapTradeID) {
        throw new Error("SnapTrade response missing snaptrade_id");
    }

    const cookieStore = await cookies();
    const cookieOptions = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: process.env.NODE_ENV === "production",
        path: "/",
    };
    cookieStore.set("userName", userName, cookieOptions);
    cookieStore.set("profilePictureURL", profilePictureURL, cookieOptions);
    cookieStore.set("user_id", userId, cookieOptions);
    cookieStore.set("snapTradeUserID", snapTradeID, cookieOptions);

    revalidatePath("/");
    redirect("/");
}
