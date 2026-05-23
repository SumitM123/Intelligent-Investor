import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { cookies } from "next/headers";
import "./globals.css";
import Providers from "./providers";
import NavBar from "./component/navBar";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Intelligent Investor — Graham-grade portfolio analysis",
  description:
    "Screen stocks against Benjamin Graham's criteria, balance bonds with the 50/50 rule, and act with margin of safety.",
};

async function SidebarServer() {
  const cookieStore = await cookies();
  const userNameVal = cookieStore.get("userName")?.value;
  const profilePictureURL = cookieStore.get("profilePictureURL")?.value;

  return (
    <NavBar
      isSignedIn={!!(userNameVal && profilePictureURL)}
      userName={userNameVal || ""}
      profilePicture={profilePictureURL || ""}
    />
  );
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Providers>
          <div className="min-h-screen flex">
            <Suspense>
              <SidebarServer />
            </Suspense>
            <main className="flex-1 min-w-0">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
