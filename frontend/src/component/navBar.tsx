'use client'
import React from "react";
import { useState } from "react";
import Link from "next/link";
interface NavBarProperties {
    signedIn: boolean;
    
}
export default function NavBar({props}) {
    return (
        <div>
            <h1 onClick= {() => {
                <Link href={"/"}>
                    Intelligent Investor Analyzer
                </Link>
            }}>
            </h1>
        </div>
    )
}