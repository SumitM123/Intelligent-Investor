'use server'
import { revalidatePath } from "next/cache";
import { cookies } from 'next/headers'

export async function passSignInProps(formData: FormData) {

    // Form data consists of name, googleID, email, and profilePictureURL
    const jsonFormData = {
        "user_name": formData.get("Name"),
        "google_id": formData.get("googleID"),
        "user_email": formData.get("email"),
        "profilePictureURL": formData.get("profilePictureURL")
    };
    const addUserForm = new FormData();
    const userName = typeof jsonFormData["user_name"] === "string" ? jsonFormData["user_name"] : "";
    const userEmail = typeof jsonFormData["user_email"] === "string" ? jsonFormData["user_email"] : "";
    const googleID = typeof jsonFormData["google_id"] === "string" ? jsonFormData["google_id"] : "";
    const profilePictureURL = typeof jsonFormData["profilePictureURL"] === "string" ? jsonFormData["profilePictureURL"] : "";

    addUserForm.append("user_name", userName);
    addUserForm.append("user_email", userEmail);
    addUserForm.append("google_id", googleID);
    const googleAddUser = await fetch("http://backend:8000/api/users/addUser", {
        method: "POST",
        body: addUserForm
    });
    if (!googleAddUser.ok) {
        throw new Error("Unable to add user");
    }

    const addUserData = await googleAddUser.json();
    const userId = addUserData?.user_id as string | undefined;

    var snapTradeID;
    if (userId) {
        try {
            snapTradeID = await fetch("http://backend:8000/api/snapTrade/addUser", {
                method: "POST",
                headers: {
                    // This is only for one request call
                    Cookie: `user_id=${userId}`,
                },
            });
        } catch (err) {
            console.error("Unable to make request to add SnapTrade user" + (err as Error).message);
        }
    }
    let snapTradeJSON = await snapTradeID?.json();
    // Everything till here is good

    // NOT NEED THIS BECAUSE BACKEND ALREADY RAISES HTTPEXCEPTION
    // if (addUser.ok === false) {
    //     throw Error("Cannot add user");
    // }
    const cookieStore = cookies();
    // CHECK USER EXISTS DOESN'T PROVIDE PRESIGNED URL. ONLY NAME AND EMAIL. RECHECK THIS
    // const userData: any = await checkUserExists.json();
    
    //Setting the cookies values so that it can be read by signIn component
    (await cookieStore).set('userName', userName);
    (await cookieStore).set('profilePictureURL', profilePictureURL);
    if (userId) {
        (await cookieStore).set('user_id', userId);
    }
    if (snapTradeJSON?.snaptrade_id) {
        (await cookieStore).set('snapTradeUserID', snapTradeJSON.snaptrade_id);
    } 
    // const url = new URL("http://backend:8000/api/users/getUserID/");
    // // Ensure the value is a string (use empty string if null/File)
    // url.searchParams.set("google_id", googleID);

    // let relevantInfo = await fetch(url.toString());


    revalidatePath("/");
    // (await cookieStore).delete("userName");
    // (await cookieStore).delete("profilePictureURL");
}