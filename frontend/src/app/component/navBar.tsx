'use client'
import React from "react";
import { useState } from "react";
import Link from "next/link";
interface NavBarProperties {
    signedIn: boolean;
}

export default function NavBar({props}: {
    props: JSON // Might have to change the Object type of props later
}) {
    return (
        <div>
                <Link href={"/"}> 
                    Intelligent Investor Analyzer
                </Link>
                {}
                <Link href={"/pages/signIn"}> Sign In </Link>

        </div>
    )
}