'use client'
import React from "react";
import Image from "next/image";
import { useState, useEffect } from "react";
// THIS FILE ISN'T FOR THE ACTUAL PAGE. IT'S ONLY FOR WHAT NEEDS TO BE DISPLAYED INSIDE THE SIGNIN SECTION OF NAVBAR
/* 
    Instead of props, let's do sessionStorage. If you do props, we're going to have to use Server Actions

    SessionStorage:
        Intially, you're not signed in. So upon going to this page, it'll first look at local storage to find
        the properties, like name and profilePicture URL. If not there, it'll display just "Sign In". If on
        "Sign In" and clicks, then it'll take you to /page/signIn. Inside the Sign In page, there will be a 
        sign in with google option. Once the user signs in with google, I retrive the credentials, like name,
        and profile picture URL and store these variables in session storage. And then, it'll go back to home page
        where the NavBar will still be in place, and the state variables will change, displaying the actual 
        profile picture, and name. If user hovers on the this, and there is a username, then it'll just show 
        'log out' option, where if the user presses it, then will remove session storage variables, where the
        new state will be displayed. 
            - Would not work because the change of sessionStorage key-value pair won't trigger a rerender. External change
            not internal

        Use Server-Actions:
            revalidatePath() can be used to bypass the session
        
*/
interface SignedIn {
    isSignedIn: boolean;
    profilePicture: string; // it'll be the key of the object stored in the s3 bucket or you can serialize the file by turning it into a base64 encoder
    userName: string;
}

export default function SignIn({isSignedIn, profilePicture, userName} : SignedIn) {
    // default values if not signed in
    // const [name, setName] = useState<string>(userName || "Sign In");
    // const [userImage, setUserImage] = useState<string | undefined> (profilePicture);
    // const [signedIn, setSignedIn] = useState<boolean>(isSignedIn);
    // useEffect( () => {
    //     if (signedIn) {
    //         //set the specific properties
            
    //     } else {

    //     }
    // }, [signedIn]);
    const displayName = userName || "Sign In";
    return (
        <div>
            {isSignedIn && profilePicture && (
                <Image src={profilePicture} alt="User" width={50} height={50} />
            )}
            <a>{displayName}</a>
        </div>
    );
}
