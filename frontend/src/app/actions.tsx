'use server'
import { revalidatePath } from "next/cache";
import { cookies } from 'next/headers'

export async function passSignInProps(formData: FormData) {
    // Make a get userID request, and if doesn't exist, make a postID request. 
    const userGoogleID = formData.get("googleID");
    interface RequestInterface {
        googleID: FormDataEntryValue
    }

    const getRequestParams : RequestInterface = {
        googleID: userGoogleID?.toString() || ''
    };
    const url = new URL("http://backend:8000/api/users/getUserID/");

    // Ensure the value is a string (use empty string if null/File)
    const idValue = typeof getRequestParams.googleID === 'string' ? getRequestParams.googleID : '';
    url.searchParams.set("google_id", idValue);

    let checkUserExists = await fetch(url.toString());
    const jsonFormData = {
        "user_name": formData.get("Name"),
        "google_id": formData.get("googleID"),
        "user_email": formData.get("email")
    };
    // If user doesn't exist, then 
    if (checkUserExists.ok === false) {
        const formData = new FormData();
        const userName = typeof jsonFormData["user_name"] === "string" ? jsonFormData["user_name"] : "";
        const userEmail = typeof jsonFormData["user_email"] === "string" ? jsonFormData["user_email"] : "";
        const googleID = typeof jsonFormData["google_id"] === "string" ? jsonFormData["google_id"] : "";
        formData.append("user_name", userName);
        formData.append("user_email", userEmail);
        formData.append("google_id", googleID);
        let addUser = await fetch("http://backend:8000/api/users/addUser", {
            method: "POST",
            body: formData
        });
        if (addUser.ok === false) {
            throw Error("Cannot add user");
        } 
        const cookieStore = cookies();
        const userData: any = await addUser.json();
        (await cookieStore).set('userName', userData?.content?.user_name ?? '');
        (await cookieStore).set('profilePictureURL', userData?.content?.presignedURL ?? '');
    } else {
        const cookieStore = cookies();
        const userData: any = await checkUserExists.json();
        (await cookieStore).set('userName', userData?.content?.user_name ?? '');
        (await cookieStore).set('profilePictureURL', userData?.content?.presignedURL ?? '');
    }
    revalidatePath("/");
    await cookieStore.delete("userName");
    cookieStore.delete("profilePictureURL");

    
}