'use client'
import React from "react";
import { useState } from "react";
import Link from "next/link";
import SignIn from "./SignIn/signIn";
interface NavBarProperties {
    signedIn: boolean;
}
// async function SignInServer() {
//   const cookieStore = await cookies();
//   const userNameVal = cookieStore.get("userName")?.value;
//   const profilePictureURL = cookieStore.get("profilePictureURL")?.value;

//   const authData = {
//     isSignedIn: !!(userNameVal && profilePictureURL),
//     userName: userNameVal || "Sign In",
//     profilePicture: profilePictureURL || "",
//   };

//   return <SignIn {...authData} />;
// }
interface SignedIn {
    isSignedIn: boolean;
    profilePicture: string; // it'll be the key of the object stored in the s3 bucket or you can serialize the file by turning it into a base64 encoder
    userName: string;
}

export default function NavBar({isSignedIn, userName, profilePicture} : SignedIn) {
    return (
        <div>   
                <Link href={"/"}> 
                    Intelligent Investor Analyzer
                </Link>
                <SignIn isSignedIn={isSignedIn} profilePicture={profilePicture} userName={userName}/>
                <Link href={"/pages/defensivePage"}>
                    Defensive Page
                </Link>
                {/* <Suspense fallback={<div>Sign In</div>}>
                    <SignIn isSignedIn={isSignedIn} profilePicture={profilePicture} userName={userName}/>
                </Suspense> */}
                {/* <Link href={"/pages/signIn"}> Sign In </Link> */}
                
        </div>
    )
}