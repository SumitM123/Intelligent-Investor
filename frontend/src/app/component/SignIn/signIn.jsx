import React from "react";
import { useState } from "react";
interface SignedIn {
    isSignedIn: boolean;
    profilePicture: string; // it'll be the key of the object stored in the s3 bucket or you can serialize the file by turning it into a base64 encoder
    userName: String;
}

'use client'
export default function SignIn({isSignedIn, profilePicture, userName} : SignedIn) {
    // default values if not signed in
    const [name, setName] = useState<string>("Sign In");
    const [userImage, setUserImage] = userState<File | null> (null);
    useEffect(() => {
        if (isSignedIn) {
            setName(userName);
            
            // get the user profile picture
        }


    }, [status.isSignedIn]);
    return (
        <h1>
            
        </h1>
    );

}
/*
    heuristic = 0
    while state(n) != goal:
        blank_coordinates = get_blank(state(n))
        misplaced_tile = getAnyMisplacedTile(state(n))
        swap(blank_coordinates, misplaced_tile)
        heuristic += 1
        if state(n) == goal:
            return heuristic
        swap(findRightTileForBlankCoordiate(blank_coordinates, goal), blank_coordinate)
        heuristic += 1
    return heuristic
*/