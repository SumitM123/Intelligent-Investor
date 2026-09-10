import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import UserProfileForm, { type UserProfile } from "@/app/component/UserProfile/UserProfileForm";

export default async function UserProfilePage() {
  const cookieStore = await cookies();
  const userIdCookie = cookieStore.get("user_id")?.value;
  if (!userIdCookie) redirect("/pages/signIn");

  const apiBaseUrl = process.env.INTERNAL_API_BASE ?? "http://backend:8000";

  let initialProfile: UserProfile | null = null;
  try {
    const res = await fetch(`${apiBaseUrl}/api/users/userProfile`, {
      headers: { Cookie: `user_id=${userIdCookie}` },
      cache: "no-store",
    });
    if (res.ok) {
      // The route returns {"profile": null} with a 200 when there's nothing saved yet,
      // so a non-ok response here is a genuine failure.
      const json = (await res.json()) as { profile?: UserProfile | null };
      initialProfile = json.profile ?? null;
    } else {
      console.error("userProfile: failed to load profile", res.status);
    }
  } catch (error) {
    console.warn("userProfile: error loading profile", error);
  }

  const isEdit = initialProfile !== null;

  return (
    <div className="max-w-3xl mx-auto px-8 lg:px-12 py-14">
      <div className="inline-flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--accent)]">
        <span>{isEdit ? "Your profile" : "Step 1 of 3"}</span>
        <span className="text-[var(--border-strong)]">·</span>
        <span className="text-[var(--muted)]">Profile</span>
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {isEdit ? "Edit your profile" : "Let's build your plan"}
      </h1>
      <p className="mt-3 text-sm text-[var(--muted)] max-w-2xl leading-relaxed">
        {isEdit
          ? "Update anything that's changed. Your allocation targets and tax assumptions are recalculated from these answers."
          : "A few questions about your situation. We use them to set your allocation targets, respect Graham's 25–75% band, and work out which account each holding belongs in."}
      </p>

      <UserProfileForm initialProfile={initialProfile} />
    </div>
  );
}
