'use server'

import { profile } from "console";
import { revalidatePath } from "next/cache";
import { cookies } from 'next/headers'
/* 
    After signing in, if user exists, will get the user's information. If doesn't, will
    add 
*/
export async function passSignInProps(formData: FormData) {
    // Make a get userID request, and if doesn't exist, make a postID request. 
    const userGoogleID = formData.get("googleID");
    const userName = formData.get("name");
    const userEmail = formData.get("email");
    const profilePictureURL = formData.get("profilePictureURL");
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
    const cookieStore = await cookies();
    let addUser;
    // User doesn't exist
    if (checkUserExists.ok === false) {
        addUser = await fetch("http://backend:8000/api/users/addUser/", {
            method: "POST",
            body: formData
        });
        if (addUser.ok === false) {
            throw new Error("Unable to add user");
        }
    } else {
        const userExistsJSON = await checkUserExists.json();
        cookieStore.set('userName', userExistsJSON.content?.user_name || '');
        cookieStore.set('profilePictureURL', profilePictureURL?.toString() || '')
    }
    revalidatePath("/");
    cookieStore.delete("userName");
    cookieStore.delete("profilePictureURL");
}