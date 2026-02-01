'use server'

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
    

    
}