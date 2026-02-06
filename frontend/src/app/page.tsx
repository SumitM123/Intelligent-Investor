// "use client"
// "use client"
// import Image from "next/image";
// import HomePage from "./Pages/homePage";
// import SignInPage from "./Pages/signIn/signinPage";
// import DefensivePage from "./Pages/defensivePage/defensivePage";

// export default function Home() {
//   // Render your main landing page or home page here
//   return (
//     <HomePage />
//   );
// }
import React from "react";
import Link from 'next/link';
export default function HomePage() {
    
    return (
        <>
            <Link href={'/pages/signIn'}> Sign In </Link>
        </>
    );
}

