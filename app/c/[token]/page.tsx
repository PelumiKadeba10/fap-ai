import { redirect } from "next/navigation";

/** Legacy collection links now open the operational Report Food link. */
export default async function LegacyCollectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  redirect(`/r/${token}`);
}
