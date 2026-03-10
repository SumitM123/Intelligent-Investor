import { PrevPageContextProvider } from "../../context/prevPageURL"
export default function prevPageLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <PrevPageContextProvider>{children}</PrevPageContextProvider>
}