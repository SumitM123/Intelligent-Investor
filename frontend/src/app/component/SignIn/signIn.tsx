'use client'
import Image from "next/image";
import { useState, useEffect } from "react";
import { deleteCookie } from 'cookies-next';
import { useRouter } from 'next/navigation';
import styles from './signIn.module.css';
import Link from "next/link";

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
    /*
    If signed in, and hovered over the component, replace it with sign out. If pressed signed out, 
    then remove the cookies and change the content of the component as well. 
    */
    const router = useRouter();
    const [stateSignedIn, setStateSignedIn] = useState(isSignedIn);
    
    //will trigger at each render
    useEffect( () => { 
        setStateSignedIn(isSignedIn);
    }, [isSignedIn]);
    
    const displayName = userName || "Sign In";

    const signOut = async () : Promise<void> => {
        // remove the 'user id' key-value pair inside the cookie store
        deleteCookie('userName');
        deleteCookie('profilePictureURL');
        deleteCookie('user_id');
        
        // change the state of signed in to false
        setStateSignedIn(false);
        //go to the main page and refresh upon 
        router.push('/');
        router.refresh();

    }

    return (
        <div>
            {/* Have a div so that it'll change based on the isSignedIn variable */}
            {stateSignedIn && 
            <div className={styles.signedInContainer}>
                <div className={styles.defaultContent}>
                    {profilePicture && (
                        <Image src={profilePicture} alt="User" width={50} height={50} />
                    )}
                    <a>{displayName}</a>
                </div>
                <button className={styles.signOutButton} onClick={signOut}>
                    Sign out
                </button>
            </div>
            }
            {!stateSignedIn && 
            <div>
                {/* <a> {displayName} </a> */}
                <Link href="/pages/signIn"> {displayName} </Link>
            </div>}
        </div>
    );
}
